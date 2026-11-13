# Fase 8B — Migración en seco al Directorio v15-4 (2026-11-13)

**Qué es esto.** Una migración *en seco*: el pipeline completo adaptado
al nuevo libro y un catálogo de prueba generado y verificado, **sin
importar a la API/PostgreSQL, sin desplegar y sin tocar producción**
(`apps/web/public/data/` intacto; la producción sigue sirviendo el
v14: 1.382 registros, 942 con punto). El catálogo de prueba vive en
`data/generated/v15-4-trial/` y las listas de revisión en
`data/generated/v15-4-*.csv`. La migración real sigue sin iniciar y
necesita las decisiones del §9 y la autorización expresa de Jon.

**El libro.** `data/source/Directorio_Opus_Dei_MUNDIAL_v15-4.xlsx`,
fijado por SHA-256
`5fca50bbd4bda7e686ce264198c6b49f419ba059a952f26cb2836b3bfcc0a4f8`
(verificado antes y después de commitearlo: commit `e0d9f9e`). El
Excel no se ha modificado en ningún momento.

---

## 1. Método

1. Refactorización del generador (`tools/data/build_catalog.py`) para
   leer por nombre de cabecera y resolver por GeoNames ID (§2).
2. Regresión obligatoria contra el v14 antes de generar nada del
   v15-4 (§3).
3. Generación del catálogo de prueba con **todas** las salidas
   dirigidas a `data/generated/v15-4-trial/` (el generador acepta
   ahora `--source`, `--out-dir`, `--sources-out` y `--report-dir`;
   ninguna corrida de esta fase escribió en producción ni regeneró la
   caché de geocodificación).
4. Verificación exhaustiva y comparación con producción mediante
   `tools/data/analyze_v15_4_trial.py` (nuevo, reproducible), que
   recalcula además las relaciones con la semántica exacta del
   importador de la API (URL exacta; relación solo si la URL
   identifica exactamente una fuente).

## 2. Refactorización del generador (commit `fbcfd4b`)

- **Lectura por nombre, nunca por posición.** Mapa explícito
  `COLUMNAS` con las 23 cabeceras clásicas de la hoja Directorio más
  las 9 del bloque geográfico v15 (`Localidad original`, `Ciudad
  canónica`, `Barrio/Distrito`, `Provincia/Estado`, `País ISO`,
  `GeoNames ID`, `Precisión`, `Fuente geográfica`, `Notas
  geográficas`); mapa `PAISES_COLUMNAS` para la hoja Países y lectura
  por nombre también en Fuentes (la 8ª columna, sin cabecera, se sigue
  conservando como notas). Si falta una cabecera requerida, el
  generador para con un mensaje claro en vez de desplazar datos.
- **Fuera las constantes del v14.** Ya no hay aserciones de 1.382
  registros ni de 70 países, ni textos «/ 1382»: los totales se
  derivan del propio libro en cada corrida (la única aserción
  estructural es que la suma de países derivados cubra todos los
  registros del Directorio, con el total real de esa corrida).
- **Resolución por GeoNames ID** (libros con bloque geográfico):
  - `Precisión = localidad` + GeoNames ID → la coordenada sale **solo**
    del extracto local buscando por ID. No se re-geocodifica por
    texto ningún registro, ni confirmado ni pendiente.
  - `Precisión = sin resolver` → **sin punto**, siempre.
  - ID ausente del extracto, o fila del extracto de un país distinto
    al `País ISO` de la ficha, o `País ISO` ≠ `Código país` → sin
    punto y anomalía registrada (laguna explícita, nunca rellenada).
  - Correcciones manuales (`manual_corrections.json`, hoy vacío)
    siguen teniendo prioridad.
  - El bloque geográfico declarado se conserva en cada registro del
    catálogo (clave `geo`) para trazabilidad; la coordenada nunca
    sale del libro, sale del extracto.
- **Modo texto intacto** como compatibilidad para libros sin bloque
  geográfico (el v14): cities1000 + desambiguación por región +
  segunda pasada por país, con la caché compartida (que ya solo se
  reescribe si cambia).
- El extracto por ID se construye desde `data/cache/cities1000.txt`
  y, para los IDs que no están ahí, desde los dumps completos por
  país `data/cache/geonames_countries/<CC>.txt` (69 ficheros). Es el
  extracto local descargado el **2026-11-11** de
  download.geonames.org (dumps diarios, sin número de versión; marca
  interna del zip de cities1000: 2026-11-11). GeoNames, CC BY 4.0.
  Nota: el libro v15-4 se construyó (según su hoja «Geografía v15»)
  con cities500 y dumps de 27 países descargados el 2026-11-12; los
  IDs son estables entre dumps y la comprobación del §5 es contra el
  extracto local, que es del que salen los puntos del catálogo.

## 3. Regresión v14: idéntica

Con el generador refactorizado se regeneró el v14 hacia un directorio
temporal y se comparó con `apps/web/public/data/catalog.json`:

| Artefacto | Resultado |
|---|---|
| Iniciativas (1.382) | **0 diferencias** campo a campo (salvo `geocodedAt`, marca temporal de la corrida) |
| Países (70) | **0 diferencias** en todos los campos |
| `countries.geojson` | **byte a byte idéntico** (3.777.074 B) |
| `sources.json` | idéntico: 2.626 fuentes, mismo `sourceSha256` |
| Relaciones (semántica del importador) | **2.164** creadas, 3 ambiguas, 102 Fuente 1 y 134 Fuente 2 sin coincidencia — idénticas a las de producción |
| geoStats | 942 resueltas (29 en segunda pasada), 79 ambiguas, 356 sin coincidencia, 5 sin localidad — idénticos |
| Meta | única diferencia: la clave nueva `geoMode: "text"` |

La refactorización no cambia ni un dato del v14.

## 4. El libro v15-4, verificado antes de generar

- 1.411 registros, 1.411 IDs únicos, 32 columnas en Directorio.
- `Precisión`: **1.315 «localidad»** (las 1.315 con GeoNames ID,
  enteros) y **96 «sin resolver»** (ninguna con ID). Sin incoherencias
  precisión/ID.
- `País ISO` == `Código país` en los 1.411 registros.
- `Fuente geográfica`: «GeoNames» 1.237, «GeoNames / revisión manual»
  78, «revisión manual (pendiente)» 96.
- 515 GeoNames ID distintos para los 1.315 confirmados; ningún ID se
  usa con dos países ISO distintos en el libro.

## 5. Resolución por ID: cobertura del extracto

- De los **515 IDs distintos**: **473** están en `cities1000.txt` y
  **42 solo en los dumps por país**. **Ausentes del extracto local: 0.**
- Por registro: 1.250 puntos salen de `cities1000.txt` y 65 de los
  dumps por país.
- El país de la fila del extracto coincide con el `País ISO` de la
  ficha en los 515 IDs.
- Resultado: la cifra de puntos del catálogo de prueba es exactamente
  la proyectada, **1.315**, sin ninguna laguna de extracto
  (`data/generated/v15-4-ids-no-encontrados.csv` queda solo con la
  cabecera).

## 6. Verificaciones del catálogo de prueba

| Comprobación | Resultado |
|---|---|
| Registros | **1.411** (IDs únicos) |
| Con punto | **1.315** |
| Sin punto | **96** |
| Cada punto == fila del extracto de su GeoNames ID (exhaustiva, 1.315/1.315) | **sin errores**: lat/lng idénticos a la fila del ID declarado, país del extracto == País ISO, y todo punto tiene Precisión declarada «localidad» |
| «Sin resolver» con punto | **0** |
| «Localidad» sin punto | **0** |
| Anomalías del modo por ID (ausentes, país, ISO) | **0** |
| Relaciones por URL exacta (semántica del importador) | **2.167 creadas** (+3 sobre 2.164); 8 ambiguas (v14: 3); Fuente 1 sin coincidencia 128 (v14: 102); Fuente 2 sin coincidencia 204 (v14: 134) |
| Fuentes (hoja Fuentes) | 2.724 filas (v14: 2.626); URLs únicas 2.695 (v14: 2.600) |
| Estados de verificación (suma = 1.411) | parciales **1.311** · contrastados **49** · Pendiente **36** · Histórico **11** · «Confirmado» suelto **4** |
| `meta.sourceSha256` del catálogo de prueba | == SHA-256 del v15-4 fijado ✓ |

Sobre las relaciones: el total creado sube solo +3 pese a haber 98
fuentes más, porque el v15-4 añade muchas citas sin URL exacta
(sobre todo en Fuente 2: las sin coincidencia pasan de 134 a 204, el
mismo frente que la 8A ya vio en el candidato-1) y 5 URLs pasan a ser
ambiguas (identifican más de una fuente). No es un error del
pipeline: es el dato del libro, y con la regla de URL exacta esas
citas no crean relación.

## 7. Países: lo declarado frente a lo derivado

Los conteos oficiales se derivan siempre del Directorio. La hoja
Países del v15-4 **no se actualizó con las altas del propio libro**:
conserva las cifras del v14 en 12 países, y en los demás coincide.

| País | Declarado (hoja Países) | Derivado del Directorio | Diferencia |
|---|---|---|---|
| España | 296 | 299 | +3 |
| Filipinas | 66 | 70 | +4 |
| Argentina | 51 | 56 | +5 |
| Chile | 35 | 36 | +1 |
| Guatemala | 21 | 22 | +1 |
| Honduras | 9 | 10 | +1 |
| Japón | 6 | 11 | +5 |
| Líbano | 3 | 5 | +2 |
| Nigeria | 32 | 33 | +1 |
| Polonia | 32 | 35 | +3 |
| Venezuela | 19 | 22 | +3 |
| Puerto Rico | 6 (total) | 6 | el **desglose** declarado suma 5, como en el v14 |

- Puerto Rico mantiene la discrepancia conocida estilo PR-06: el
  total declarado (6) coincide con el derivado, pero el desglose
  declarado suma 5 porque el estado «Confirmado» a secas de PR-06 no
  es ninguna de las cuatro columnas del desglose. Sin corregir, como
  siempre: consta.
- **República Dominicana no desaparece de la hoja Países**: su fila
  queda con total declarado 0 y derivado 0 (DO-01 era su único
  registro y es una de las 5 bajas). Por eso el catálogo de prueba
  tiene 70 países en la hoja pero **69 países con registros**, y el
  `countries.geojson` de prueba es idéntico al de producción (los
  mismos 70 códigos marcados). Si en la migración real se quiere que
  DO salga de la lista de países, hay que decidirlo expresamente
  (filtrar países con 0 registros o retirar la fila del libro).
- El resto de países: declarado == derivado.

## 8. Comparación completa contra producción (v14)

**Altas: 34** (32 con punto; sin punto: MX-47 y VE-21, §10).
AR-52, AR-53, AR-54, AR-55, AR-56, CL-36, ES-297, ES-298, ES-299,
ES-300, GT-22, HN-10, IT-73, JP-07, JP-08, JP-09, JP-10, JP-11,
LB-04, LB-05, MX-45, MX-46, MX-47, NG-33, PH-067, PH-068, PH-069,
PH-070, PL-33, PL-34, PL-35, VE-20, VE-21, VE-22.

**Bajas: 5** — CH-06, DO-01, ES-236, TW-01, TW-02 (documentadas en el
propio libro, hojas Retiradas v41/v42).

**Puntos ganados: 365** de los 440 que el v14 no ubicaba (quedan 75
de aquellos sin resolver; 365 + 75 = 440 ✓). **Puntos perdidos: los
19** previstos, listados en el §10.

**Puntos desplazados: solo 4** de los 923 registros comunes con
punto en ambos catálogos cambian de coordenadas (los otros 919 no se
mueven ni un metro):

| ID | v14 (GeoNames ID) | v15-4 (GeoNames ID) | Distancia |
|---|---|---|---|
| IE-12 Lismullin Conference Centre | 53.32667, −7.55417 (3313991) | 52.86472, −8.76056 (2961096) | **95,53 km** ⚠ |
| BE-01 Bureau d'information (Bruselas) | 50.80225, 4.33943 (2785123) | 50.85045, 4.34878 (2800866) | 5,40 km |
| HU-02 Orbánhegy Kollégium (Budapest) | 47.49192, 19.01493 (7284823) | 47.49835, 19.04045 (3054643) | 2,05 km |
| AU-08 Yarraton (Sídney) | −33.92399, 151.22749 (6621337) | −33.92019, 151.22241 (2161608) | 0,63 km |

IE-12 es el único > 25 km: el v14 lo había geocodificado a un
«Lismullin» equivocado y el v15-4 lo corrige; el desplazamiento es la
corrección, no un error nuevo. AU-08, que en la proyección de la 8A
perdía el punto, en el v15-4 tiene ID asignado y conserva punto
(movido 0,63 km dentro de Kensington, Sídney): el frente AU-08 de la
8A queda resuelto por el propio libro, sin corrección manual.

**Categorías.** Dos cambios sobre registros existentes: ES-294
(Colegios → «Otros») y PH-064 (Universidades → «Otros»). Y aparecen
**categorías fuera de la paleta de 14** del v14 en 10 registros (§9).

**Estados de verificación: 37 cambios**, todos a mejor: 33 de
«Confirmado con datos parciales» a «Confirmado y contrastado» y 4 de
«Pendiente» a «Confirmado con datos parciales». Contrastados totales:
16 (v14) → **49**.

**Relaciones:** 2.164 → **2.167** (+3); detalle en el §6.

## 9. Anomalías nuevas que el v15-4 introduce (no son del pipeline)

1. **Categorías fuera de la paleta de 14** que la app conoce
   (`apps/web/src/categories.ts` asigna un color por categoría):
   - «Otros»: 6 — ES-294 y PH-064 (recategorizados; en el
     candidato-3 Jon los había sacado de «Otros» expresamente) y las
     altas ES-299, JP-09, VE-20, VE-21.
   - «Escuelas de hostelería»: 2 altas — NG-33, JP-11.
   - «Residencia de estudiantes»: 1 alta — LB-04 (la paleta tiene
     «Residencias universitarias»).
   - «Club juvenil»: 1 alta — LB-05 (la paleta tiene «Clubes
     juveniles», en plural).
   Con la app actual, esos 10 registros no tendrían color de
   categoría asignado. Hay que decidir antes de migrar: aceptar y
   ampliar la paleta, o pedir la normalización en el libro.
2. **«Confirmado» a secas: 4 registros** — PR-06 (ya existía) y las
   altas PL-33, PL-34, PL-35. El desglose por estados de la hoja
   Países no contempla ese valor (de ahí parte de la discrepancia de
   Polonia y la de Puerto Rico). Frente ya conocido de la 8A («el
   "Confirmado" suelto de PR-06»): ahora son cuatro.
3. **Sexo en texto libre: 104 valores distintos** en el v15-4 (el
   catálogo los reduce a las cubetas de destinatarios de siempre).
   Sin cambios de criterio; solo consta la cifra, que crece con el
   libro.
4. **Hoja Países desactualizada** (§7): declarado == cifras del v14
   en los 12 países con altas. Los conteos de la app se derivan del
   Directorio y saldrían bien, pero el libro queda internamente
   incoherente en esa hoja.

## 10. Listas de revisión generadas

En `data/generated/` (commit `12ac312` junto al catálogo de prueba):

- **`v15-4-pendientes-96.csv`** — los 96 «sin resolver» con país,
  localidad clásica y canónica, dirección, fuente y nota geográficas
  íntegras, si tenían punto en el v14 y si son alta nueva. Clasificados
  por motivo cruzando las notas del propio libro con estas reglas
  (frases literales de las notas, en orden: sin nota → conflicto de
  país → localidad múltiple → candidatos sin desempatar → fuera de la
  provincia indicada → sin coincidencia → dirección contradictoria →
  otros). **El cruce reproduce exactamente la clasificación previa**
  del análisis de Jon/Codex:

  | Motivo | Mi cruce | Clasificación previa |
  |---|---|---|
  | Conflicto de jerarquía administrativa | 28 | 28 |
  | Varios candidatos GeoNames | 23 | 23 |
  | Sin coincidencia GeoNames | 16 | 16 |
  | Localidad múltiple o contradictoria | 14 | 14 |
  | Sin localidad o sin nota explicativa | 5 | 5 |
  | Conflicto de país | 3 | 3 |
  | Dirección contradictoria | 2 | 2 |
  | Otros casos manuales | 5 | 5 |

  Sin diferencias. La composición de los 96 cuadra con el relato del
  libro: 75 que ya no tenían punto en el v14 + 19 que lo pierden + 2
  altas nuevas sin resolver (MX-47, VE-21).
- **`v15-4-retirados-19.csv`** — AR-13, AU-02, PE-03, PE-05, PE-06,
  PE-07, PE-08, PE-09, PE-14, PE-15, PE-17, PE-21, PH-001, PH-007,
  PH-008, PH-032, PH-058, PH-061, VE-05, con sus coordenadas y
  GeoNames ID del v14 y la nota del v15-4 que motiva la retirada.
  Patrón dominante: distritos de Lima y de Caracas y Muntinlupa, que
  GeoNames codifica en una unidad administrativa distinta de la que
  declara la ficha (conflicto de jerarquía, no error evidente del
  dato), más AU-02 (candidatos sin desempatar) y AR-13 (dirección
  contradictoria). En el catálogo de prueba **ninguno tiene punto**.
- **`v15-4-desplazados.csv`** — los 4 desplazados del §8 con
  coordenadas de ambas versiones y distancia.
- **`v15-4-ids-no-encontrados.csv`** — vacía (solo cabecera): ningún
  ID declarado falta en el extracto local.
- **`v15-4-comparacion.json`** — todas las cifras anteriores en bruto.

**ES-218 y ES-219** (señalados en el análisis previo): en el v15-4
siguen `Precisión = sin resolver`, **sin GeoNames ID, sin ciudad
canónica y sin nota geográfica**, con `Localidad = No localizado`,
aunque sus direcciones contienen la localidad (ES-218: «Carretera
BV-1212, s/n, 08296 Castellbell i el Vilar, Barcelona»; ES-219:
«Parque de Collserola, s/n, 08172 Sant Cugat del Vallès, Barcelona»).
Son 2 de los 5 del motivo «Sin localidad o sin nota explicativa». No
tenían punto en el v14 ni lo tienen en la prueba, y por las reglas de
la migración no se les ha asignado ninguno: es un defecto evidente
del dato que solo puede corregirse en el libro o con una corrección
manual aprobada.

## 11. Lagunas

- De extracto: **ninguna** (515/515 IDs encontrados).
- De dato: los 96 «sin resolver» quedan sin punto a propósito (es la
  decisión conservadora del propio libro), con su motivo y su nota en
  la lista. Los frentes de la 8A quedan así: Sexo en texto libre
  (consta, §9.3), citas de Fuente 2 sin URL (§6), corrección manual
  de AU-08 (innecesaria: el libro lo resolvió, §8) y «Confirmado»
  suelto de PR-06 (persiste y crece a 4, §9.2).

## 12. Decisiones que quedan para Jon antes de una migración real

1. **Categorías fuera de paleta** (§9.1): ¿se amplía la paleta de la
   app («Otros», «Escuelas de hostelería», «Residencia de
   estudiantes», «Club juvenil») o se pide normalizar el libro
   primero? Afecta a 10 registros; dos de ellos (ES-294, PH-064)
   contradicen la recategorización que Jon hizo en el candidato-3.
2. **«Confirmado» a secas** en PL-33/34/35 (y PR-06): ¿se acepta como
   estado o se pide su calificación en el libro (parcial/contrastado)?
3. **Hoja Países desactualizada** (§7): los conteos de la app salen
   del Directorio y serían correctos, pero ¿se pide actualizar la
   hoja para que el libro quede coherente antes de importar?
4. **República Dominicana con 0 registros** (§7): ¿se conserva su
   fila (y aparece como país vacío) o se retira/filtra en la
   migración?
5. **Los 19 retirados y los 96 pendientes**: se asume la decisión
   conservadora del libro (sin punto). ES-218/ES-219 son el caso más
   claro de defecto subsanable en origen.
6. Con eso decidido, la migración real sería: regenerar artefactos a
   producción con el mismo generador (una sola corrida, ya probada),
   importar con la API (que verificará el SHA-256 del v15-4) y
   desplegar — **nada de eso está hecho ni autorizado todavía**.

## 13. Commits locales de esta fase

- `e0d9f9e` — Fijado el Directorio v15-4 (SHA-256 verificado).
- `fbcfd4b` — Generador: lectura por nombre y resolución por
  GeoNames ID.
- `12ac312` — Catálogo de prueba, listas de revisión y script de
  análisis.
- (Este informe y la actualización de `PENDIENTES.md`, en el commit
  siguiente.)

Nada se ha subido a GitHub, importado ni desplegado.

## Corrección v15-5 — decisiones de Jon incorporadas (2026-11-13)

Jon cerró las decisiones pendientes y encargó una copia versionada
nueva y una última migración en seco, sin importar ni desplegar.

**Libro nuevo:** `data/source/Directorio_Opus_Dei_MUNDIAL_v15-5.xlsx`
— SHA-256 `088655db8d0d3bffd38cc1f4f23454ad61df413ff34b1cb7bc01e1f62811cef5`
(commit `ec9371e`; el v15-4 queda intacto). Script reproducible:
`tools/data/build_v15_5_book.py`. Cambios, todos anotados en la hoja
Cambios del propio libro:

- **Categorías**: se mantienen exactamente las 14 de la aplicación.
  Normalizados en el dato (anterior → canónica): ES-294 → Escuelas
  de formación Técnica y PH-064 → Centros culturales (recuperan la
  clasificación aprobada en el candidato-3); ES-299 y LB-04 →
  Residencias universitarias; JP-09 → Centros culturales; VE-20 y
  VE-21 → Centros de promoción social; NG-33 y JP-11 → Escuelas de
  formación Técnica; LB-05 → Clubes juveniles. Sin alias en la app.
- **Estados**: PR-06 permanece «Confirmado» (D1); PL-33, PL-34 y
  PL-35 pasan a «Confirmado y contrastado».
- **Hoja Países reconstruida íntegramente** desde el Directorio:
  las 70 filas recalculadas, columna explícita «Confirmado», valores
  materializados (sin fórmulas) e identidad por país garantizada
  (Nº = contrastados + parciales + Confirmado + Pendiente +
  Histórico; suma total 1.411). República Dominicana permanece con
  cero y su explicación histórica.
- **ES-218 y ES-219 resueltas** por revisión manual documentada:
  Castellbell i el Vilar (GeoNames ID 8379312) y Sant Cugat del
  Vallès (3110718), Precisión «localidad», fuente «GeoNames /
  revisión manual». LEEME, Cambios y el resumen geográfico,
  actualizados (los pendientes «sin localidad o sin nota» pasan de
  5 a 3).

**Catálogo de prueba** en `data/generated/v15-5-trial/` (commit
`08a5919`, análisis en `tools/data/analyze_v15_5_trial.py`, cifras en
`data/generated/v15-5-comparacion.json`). **Batería 10/10:**

1. 1.411 registros, 1.411 IDs únicos.
2. Exactamente las 14 categorías; los únicos movimientos son los
   10 decididos («Otros» 6→0, «Escuelas de hostelería» 2→0, «Club
   juvenil» 1→0, «Residencia de estudiantes» 1→0).
3. **1.317 con punto, 94 sin punto**; ES-218 (41.63395, 1.86394) y
   ES-219 (41.47063, 2.08611) con los puntos de sus GeoNames ID.
4. 69 países con registros (70 filas en el catálogo; RD a cero).
5. Estados: parciales 1.311 · contrastados **52** · Pendiente 36 ·
   Histórico 11 · **Confirmado 1** (solo PR-06).
6. Relaciones: **2.167**, el mismo conjunto que con el v15-4;
   Fuentes idénticas (2.724 filas).
7. Comprobación exhaustiva punto↔extracto sobre los 1.317: cero
   GeoNames ID sin coordenadas o con país distinto (516 ID
   distintos).
8. Hoja Países del v15-5 == conteos derivados del Directorio en
   los 70 países; suma 1.411.
9. Regresión v14 limpia: geojson byte a byte y fuentes idénticas.
10. Diferencia contra la prueba del v15-4 limitada a lo decidido:
    15 registros (10 categorías, 3 estados, 2 puntos nuevos).

**Estado: listo para la certificación final de la migración.**
Sin importar a la API y sin desplegar; producción sigue con el v14.
