# Fase 8A — Auditoría comparativa v14 → v15 (candidato 1)

**Alcance:** solo análisis. No se ha importado nada en
PostgreSQL, no se ha tocado la API ni la interfaz y no se ha
desplegado ningún dato. Producción sigue con el v14. Los dos
Excel quedan intactos: el v14 conserva su SHA-256 y el v15 se
copió a `data/source/` con nombre versionado, sin modificar el
original subido por Jon.

| | v14 (vigente) | v15-candidato-1 |
|---|---|---|
| Fichero | `Directorio_Opus_Dei_MUNDIAL_v14.xlsx` | `Directorio_Opus_Dei_MUNDIAL_v15-candidato-1.xlsx` |
| Tamaño | 911,449 bytes | 2,628,619 bytes |
| SHA-256 | `4bcd04428aec646a7098bf784879327b7d8ffe97e78389ce2953b25925e83680` | `5ed1764d26d720f695d435437997dec02953cb328b78d3e23c16139f9e723987` |
| Registros en Directorio | 1382 | 1377 |
| Países con registros | 70 | 69 |
| Con punto en el mapa | 942 | 936 |
| Relaciones exactas con Fuentes | 2164 | 2156 |

Nota de procedencia: la hoja `LEEME` del v15 registra como
último cambio interno la «v45 (2026-11-11)»: el fichero que Jon
denomina v15 es la exportación 15 de un libro de trabajo con
versionado propio (v45) y 37 hojas, la mayoría de trabajo
(Resueltos/Retiradas por lotes). Empieza así: «v45 (2026-11-11), a petición del usuario (WhatsApp 21:02): comprobaciones NUEVAS de contraste para las 38 fichas de Universidades que seguían «Confirmado con datos parciales», con …»

## Resumen ejecutivo

- El v15 **no es una ampliación: es una pasada de corrección**
  sobre el mismo directorio. **0 altas, 5
  bajas, 1126 registros idénticos y
  251 modificados** (todos con al menos un cambio
  real de contenido; cambios meramente formales por registro: 0).
- **Las 5 bajas están documentadas en el propio libro**
  (hojas `Retiradas v41`/`Retiradas v42`): no son pérdidas.
  Una de ellas, `DO-01`, era el único registro de República
  Dominicana, que **desaparece como país** (70 → 69).
- El barrido de verificación del libro se refleja en los
  datos: «Confirmado y contrastado» pasa de
  16 a
  48 registros, y los campos más
  tocados son Fecha de consulta (242),
  Resultado de doble comprobación (236)
  y Código postal (112).
- **Integridad limpia en lo esencial:** 0 IDs duplicados,
  0 IDs reutilizados con otra iniciativa, 0 columnas v14
  perdidas, 0 variantes tipográficas de categoría, y la única
  discrepancia declarado/calculado de Países es la ya conocida
  de Puerto Rico, idéntica en ambas versiones.
- **Tres frentes requieren decisión antes de migrar:** la
  categoría nueva «Otros» (2 registros recategorizados), el
  campo Sexo convertido en texto libre descriptivo
  (17 valores nuevos que afectan a
  23 registros) y la deriva de Fuente 2
  hacia citas sin URL exacta (las relaciones exactas bajan de
  2164 a 2156 y las
  Fuente 2 sin coincidencia suben de
  134 a 174).
- **El mayor riesgo no está en los datos, está en nuestro
  pipeline:** el generador lee el Directorio **por posición de
  columna** y el v15 reordena e inserta columnas. Importar el
  v15 con el pipeline actual **mezclaría los campos sin dar
  error**. La 8B debe leer por nombre de cabecera (esta
  auditoría ya lo hace así en su caja de análisis).

## 1. Estructura

- Hojas: v14 tiene 3 (Directorio, Países, Fuentes); el v15
  tiene 37, con 34 nuevas
  (LEEME, Instituciones, Resumen, Verificación, Conciliación_V,
  Discrepancias, Pendientes, Cobertura, Auditoría, Cambios y
  las hojas de Resueltos/Retiradas por lote). Solo Directorio,
  Países y Fuentes alimentan la aplicación.
- Directorio: 23 columnas
  en v14 → 27 en v15.
  **Añadidas:** Nombre alternativo, Categorías adicionales, Web específica, Google Maps.
  **Retiradas:** ninguna.
- Columnas desplazadas (posición v14 → v15):

| Columna | v14 | v15 |
|---|---|---|
| Categoría principal | 3 | 4 |
| Sexo | 4 | 6 |
| País | 5 | 7 |
| Código país | 6 | 8 |
| Continente | 7 | 9 |
| Región/Provincia/Estado | 8 | 10 |
| Localidad | 9 | 11 |
| Dirección completa | 10 | 12 |
| Código postal | 11 | 13 |
| Teléfono | 12 | 14 |
| Web oficial | 13 | 15 |
| Entidad titular | 14 | 18 |
| Tipo de vinculación | 15 | 19 |
| Evidencia de vinculación | 16 | 20 |
| Estado de verificación | 17 | 21 |
| Estado de actividad | 18 | 22 |
| Fecha de consulta | 19 | 23 |
| Fuente 1 | 20 | 24 |
| Fuente 2 | 21 | 25 |
| Resultado doble comprobación | 22 | 26 |
| Email de contacto | 23 | 27 |

- Relleno de las columnas nuevas en v15: Nombre alternativo
  22 registros;
  Web específica 35;
  Google Maps 4;
  Categorías adicionales con valor efectivo
  494 (el resto lleva
  «No aplicable» o marcador de ausencia). La aplicación actual
  no tiene campos para estas cuatro columnas: su destino es
  una decisión de la 8B.
- Fórmulas en Directorio/Países/Fuentes: 0 en ambas versiones
  (valores literales; tipos homogéneos con v14).

## 2. Identidad e integridad

- Totales: 1382 → 1377;
  IDs únicos 1377 de 1377 en v15
  (**duplicados: 0**).
- **Altas respecto al v14: 0.** Ausentes en
  v15: 5, todos documentados como
  retiradas en el propio libro:

| ID | Nombre (v14) | País | Categoría | ¿Tenía punto? | Consta retirada en |
|---|---|---|---|---|---|
| `CH-06` | Kulturzentrum Grendel | Suiza | Centros de mujeres | sí | Retiradas v42 |
| `DO-01` | Caremi — Centro de Capacitación Profesional para la Mujer | República Dominicana | Escuelas de formación Técnica | sí | Retiradas v41 |
| `ES-236` | Club Alanís | España | Asociaciones juveniles | sí | Retiradas v41 |
| `TW-01` | Cheng Jung Study Center | Taiwán | Centros de varones | sí | Retiradas v42 |
| `TW-02` | Wen Shan Residence | Taiwán | Residencias universitarias | sí | Retiradas v42 |

- **IDs reutilizados con otra iniciativa: 0**
  (mismo ID con nombre y país distintos a la vez).
- Coherencia prefijo del ID ↔ Código país: sin discrepancias
  en v15 (0); en v14,
  0.
- Pérdidas de campos clave (nombre/país/código/localidad con
  valor en v14 y ausencia en v15): ver anomalías
  `perdida_campo` en el CSV (total de anomalías registradas:
  190).

## 3. Diferencias por registro

- Sin cambios: **1126**. Modificados:
  **251**. Con cambios solo formales: **0**.
- La comparación distingue cambio **formal** (espacios,
  mayúsculas, comillas o guiones, o cambio del marcador de
  ausencia) de cambio **real** de contenido; el detalle
  completo, campo a campo con valor v14 y v15, está en
  `data/generated/v14-v15-diff.csv` y `.json`.
- Cambios por campo (registros) y cuántos son solo formales:

| Campo | Cambios | Solo formales |
|---|---|---|
| Fecha de consulta | 242 | 0 |
| Resultado doble comprobación | 236 | 0 |
| Código postal | 112 | 0 |
| Teléfono | 75 | 0 |
| Entidad titular | 73 | 0 |
| Email de contacto | 54 | 0 |
| Fuente 2 | 52 | 0 |
| Dirección completa | 49 | 0 |
| Sexo | 49 | 0 |
| Evidencia de vinculación | 41 | 0 |
| Estado de verificación | 32 | 0 |
| Web oficial | 32 | 0 |
| Categoría principal | 2 | 0 |
| Localidad | 1 | 0 |
| Fuente 1 | 1 | 0 |

## 4. Países

- Países con registros: 70 → 69.
  Nuevo: ninguno. Eliminado: **República Dominicana (DO)**,
  consecuencia directa de la retirada de su único registro
  (`DO-01`), documentada en `Retiradas v41`.
- Totales declarados en la hoja Países frente a calculados
  desde el Directorio — discrepancias en v15:

| País | Declarado | Suma del desglose | Calculado |
|---|---|---|---|
| Puerto Rico (PR) | 6 | 5 | 6 |

  Es el caso ya conocido de **Puerto Rico (PR-06)**: la hoja
  declara 6 y el Directorio tiene 6, pero el desglose por
  estados suma 5 porque un registro lleva el estado suelto
  «Confirmado», fuera de las cuatro columnas del desglose.
  **La misma discrepancia, con las mismas cifras, ya existe
  en el v14**: no es una regresión del v15. En v14 también es
  la única. Los conteos oficiales de la aplicación seguirán
  derivándose del Directorio.

## 5. Categorías y normalización

- Las 14 categorías conocidas se mantienen; aparece una
  nueva, **«Otros»**, con 2 registros, ambos por
  recategorización expresa:
  `ES-294` (Fundación Brafa - Escuela deportiva) pasa de Colegios a Otros; `PH-064` (Theological Centrum) pasa de Universidades a Otros.
  Sin variantes tipográficas (acentos/mayúsculas) de ninguna
  categoría en ninguna versión. Cambios de categoría por ID:
  2, los dos citados.

| Categoría | v14 | v15 |
|---|---|---|
| Colegios | 389 | 388 |
| Centros de mujeres | 210 | 209 |
| Centros de varones | 166 | 165 |
| Residencias universitarias | 153 | 152 |
| Casa de retiros | 124 | 124 |
| Asociaciones juveniles | 104 | 103 |
| Escuelas de formación Técnica | 82 | 81 |
| Iglesias | 45 | 45 |
| Universidades | 42 | 41 |
| Centros culturales | 24 | 24 |
| Oficinas de Información | 21 | 21 |
| Centros Médicos | 13 | 13 |
| Centros de promoción social | 8 | 8 |
| Otros | 0 | 2 |
| Clubes juveniles | 1 | 1 |

- **Sexo:** el v15 lo convierte en texto libre descriptivo:
  17 valores nuevos que afectan a
  23 registros, por ejemplo:
- «Ambos sexos (casa de retiros: retiros, reuniones, eventos familiares y campamentos juveniles — Annual Report 2025 del titular y web propia)»
- «Ambos sexos (centro de conferencias/retiros con actividades para hombres y mujeres — PFCED, dic-2025)»
- «Ambos sexos (retiros separados para hombres y para mujeres)»
- «Ambos sexos (retiros y cursos para mujeres y para hombres, por separado)»
- «Ambos sexos, retiros separados (chicos/hombres vía Mirrabooka; chicas/mujeres vía Eremeran)»
- «Hombres y mujeres»
- «Hombres y mujeres *(actividades separadas)*»
- «Hombres y mujeres *(centro de convivios y retiros; actividades separadas)*»
- «Mixto (Guia do Estudante 2025: coordinación de «turmas das meninas» y de «turmas dos meninos»)»
- «Mixto (admisión de la página de la sede: «Vuestro hijo o hija deberá realizar una breve prueba de nivel»)»
- «Mixto (admisión del texto oficial del programa Attendis Preschool: «Vuestro hijo o hija…»; página del grupo, no de la sede)»
- «Mixto (clasificación oficial de la Secretaría de Educación, datos 2025-12-31; el colegio declara formación diferenciada por sexos desde 2018 y fue femenino desde 1962)»
- «Mixto (ficha del centro en vamosaestudiar)»
- «Mixto (hombres y mujeres, jóvenes y adultos)»
- «Mixto (programa propio: «razvoj sposobnosti dječaka i djevojčica»)»
- «Mujeres *(établissement de filles; web propia comprometida — caveat)*»
- «Varones *(colegiosenbuenosaires: "colegio privado, de varones")*»
  La clasificación por destinatarios del pipeline los sigue
  resolviendo por su prefijo («Ambos sexos», «Mixto»,
  «Hombres y mujeres»…): la distribución resultante sería
  {'masculino': 400, 'femenino': 474, 'mixto_programas_separados': 174, 'no_consta': 326, 'no_aplicable': 3} frente a {'masculino': 391, 'femenino': 474, 'mixto_programas_separados': 145, 'no_consta': 369, 'no_aplicable': 3} en v14.
  No se ha normalizado nada globalmente; que Sexo pase a ser
  lista cerrada + nota, o se acepte el texto libre, es una
  decisión para Jon.
- **Estado de verificación:** {'Confirmado con datos parciales': 1277, 'Pendiente': 40, 'Confirmado y contrastado': 48, 'Histórico': 11, 'Confirmado': 1} en v15
  frente a {'Confirmado con datos parciales': 1314, 'Pendiente': 40, 'Confirmado y contrastado': 16, 'Histórico': 11, 'Confirmado': 1} en v14. El estado suelto
  «Confirmado» (PR-06) persiste con 1 registro.
- **Estado de actividad:** sin valores nuevos.
- **Regla `NL`:** se ha aplicado por campo y valor completo,
  como en el pipeline (en `Código país`, NL sigue siendo
  Países Bajos y nunca ausencia); ningún recuento de esta
  auditoría trata «NL» como ausencia fuera de esa regla.

## 6. Geografía

Pipeline actual ejecutado sobre el v15 en modo análisis
(detalle completo en `data/generated/v15-geocoding-report.md`):

| | v14 | v15 |
|---|---|---|
| Con punto | 942 | 936 |
| Ambiguas | 79 | 80 |
| Sin coincidencia | 356 | 356 |
| Sin localidad utilizable | 5 | 5 |

- Ganan punto: 0. Pierden punto siendo
  registros comunes: 1 (`AU-08`).
- El resto de la bajada (942 → 936)
  son las bajas documentadas que tenían punto.
- Solo **1** texto de localidad cambia en todo el directorio
  (`AU-08`): es el caso que pierde el punto — la
  localidad nueva es más precisa en el texto pero ambigua
  para el gazetteer. Ningún registro cambia de geonameId ni
  de coordenadas sin cambiar el texto. Ninguna coordenada
  nueva queda aceptada automáticamente: la resolución de ese
  caso (corrección manual) es decisión de la 8B.

## 7. Direcciones y contactos

Registros con cambio real por campo (detalle en el diff):
Dirección completa 49 ·
Código postal 112 ·
Localidad 1 ·
Región 0 ·
Teléfono 75 ·
Email 54 ·
Web oficial 32 ·
Entidad titular 73 ·
Sexo/destinatarios 49 ·
Tipo de vinculación 0.
Son el grueso del barrido de corrección del libro (sede de
MX-04, nueva sede de MX-06, direcciones de CL-31, AR-04 y
AR-05, según la hoja LEEME).

## 8. Fuentes y documentación

- Hoja Fuentes: 2626 → 2672 filas;
  URLs únicas 2600 → 2646;
  **+46 URLs añadidas, −0 retiradas**.
  URLs repetidas dentro de la hoja: 11 en v14 y
  11 en v15 (preexistentes; son la causa de las
  relaciones ambiguas).
- Relaciones por coincidencia **exacta** de URL (única regla
  automática, sin cambios):

| | v14 | v15 |
|---|---|---|
| Relaciones exactas | 2164 | 2156 |
| Ambiguas (URL en varias fuentes) | 3 | 2 |
| Fuente 1 sin coincidencia | 102 | 101 |
| Fuente 2 sin coincidencia | 134 | 174 |

- **Deriva de formato en Fuente 2:** en v15 hay
  95 valores de Fuente 1/2 que no son una URL exacta
  (en v14, 63), desglosados en
  {'dominio_con_nota_sin_url': 16, 'url_con_texto_anadido': 74, 'texto_libre_sin_url': 5}: citas del tipo «dominio (nota)» o texto libre
  («dbk.de (Conferencia Episcopal Alemana…)») que la regla de
  URL exacta no puede enlazar con el catálogo. Es la causa
  principal de que las Fuente 2 sin coincidencia suban de
  134 a 174.
  Evidencia, doble comprobación y fecha de consulta cambian
  en 41,
  236 y
  242 registros respectivamente:
  es el barrido de verificación, no un deterioro.

## 9. Impacto previsto (sin importar nada)

| Magnitud | v14 | v15 | Δ |
|---|---|---|---|
| Iniciativas | 1382 | 1377 | -5 |
| Países | 70 | 69 | -1 |
| Con punto | 942 | 936 | -6 |
| Sin punto | 440 | 441 | +1 |
| Relaciones exactas | 2164 | 2156 | -8 |
| Fichas que cambiarían | — | 251 modificadas + 5 retiradas | |
| catalog.json | 3,105,374 B | 3,209,792 B | |

Los filtros y conteos visibles se derivan de estas cifras:
un país menos en el selector (República Dominicana), la
categoría «Otros» fuera del sistema cromático actual de 14,
936 marcadores y los estados con
48 contrastados.

## Anomalías registradas

Detalle completo en `data/generated/v15-anomalias.csv`
(190 filas). Por tipo:

| Tipo | Nº |
|---|---|
| categoria_fuera_de_lista | 1 |
| fuente_sin_url_exacta_v14 | 63 |
| fuente_sin_url_exacta_v15 | 95 |
| geo_perdida | 1 |
| paises_declarado_vs_calculado_v14 | 1 |
| paises_declarado_vs_calculado_v15 | 1 |
| url_duplicada_en_fuentes | 11 |
| valor_nuevo_en_lista | 17 |

Ninguna anomalía se ha corregido silenciosamente: todas
quedan documentadas tal como salen de los ficheros.

## Cambios potencialmente peligrosos

1. **El pipeline actual corrompería el v15.** El generador
   (`build_catalog.py`) desempaqueta cada fila por posición
   en el orden v14 y tiene tres aserciones con las cifras del
   v14 (1.382 registros, 1.382 IDs, 70 países) además del
   nombre de fichero fijado. Con el v15 —columnas insertadas
   y reordenadas— generaría un catálogo con los campos
   mezclados (el país sería la categoría, etc.) y su hash
   coincidiría con el Excel, con lo que el importador lo
   aceptaría. **No se debe ejecutar `npm run data` sobre el
   v15 hasta que la 8B lea por nombre de cabecera.** (El
   importador sí se protege frente a artefactos de OTRO
   Excel: exige que el SHA-256 del catálogo y del Excel
   coincidan.)
2. **República Dominicana desaparece del mapa y del
   selector** al retirarse su único registro. Está
   documentado en el libro, pero es un cambio visible que
   conviene confirmar expresamente.
3. **«Otros» queda fuera del sistema de categorías**: la
   interfaz conoce 14 categorías con color propio; dos
   fichas (una ex-Colegios, una ex-Universidades) caerían en
   una categoría sin tratamiento definido.
4. **Sexo como texto libre**: si una futura edición empieza
   un valor con otra fórmula («Centro mixto…»), la
   clasificación por destinatarios lo mandaría a «no consta»
   sin avisar. El texto descriptivo es valioso como nota,
   frágil como clave.
5. **`AU-08` perdería su punto** por ambigüedad del nuevo
   nombre de localidad, aunque la sede no se ha movido.

## Decisiones que necesita tomar Jon

1. Confirmar las 5 retiradas y, en particular, la
   desaparición de República Dominicana como país del Atlas.
2. «Otros»: ¿se añade como 15ª categoría con su color, se
   mapea a otra en la importación, o vuelven ES-294 y PH-064
   a su categoría en el Excel?
3. Sexo: ¿lista cerrada + el texto descriptivo a una nota
   (¿en «Nombre alternativo»/evidencia?), o se mantiene el
   texto libre asumiendo la clasificación por prefijo?
4. Fuente 2 con citas sin URL: ¿se aceptan como evidencia no
   enlazable (quedan como texto, sin relación), o se
   normalizan a URL en el Excel cuando exista?
5. AU-08: ¿corrección manual de coordenadas (localidad
   Kensington, Sídney) en la 8B, o se acepta que quede sin
   punto hasta resolver el gazetteer?
6. Columnas nuevas (Nombre alternativo, Categorías
   adicionales, Web específica, Google Maps): ¿se incorporan
   a la ficha en la 8B o quedan fuera de la aplicación?
7. El estado suelto «Confirmado» de PR-06: ¿se corrige en el
   Excel a uno de los cuatro estados del desglose?

## Recomendación

**APTO para preparar la migración (Fase 8B), con las
decisiones anteriores tomadas antes de importar.** Los datos
del v15 son íntegros y trazables (0 duplicados, 0
reutilizaciones, bajas documentadas, discrepancia de países
heredada y conocida). **NO APTO para importar con el
pipeline actual sin cambios**: la lectura posicional de
columnas es un bloqueante técnico de nuestro lado, no del
fichero, y forma parte del trabajo de la 8B (leer por nombre
de cabecera, parametrizar las aserciones y aceptar la versión
del directorio como dato explícito). Bloqueantes en los
datos: 0.

## Comandos exactos para reproducir la auditoría

```bash
cd ~/workspace/atlas-iniciativas-opus-dei

# 0) El v15 ya copiado (sin tocar el original ni el v14):
#    data/source/Directorio_Opus_Dei_MUNDIAL_v15-candidato-1.xlsx
sha256sum data/source/Directorio_Opus_Dei_MUNDIAL_v14.xlsx \
          data/source/Directorio_Opus_Dei_MUNDIAL_v15-candidato-1.xlsx

# 1) Caja de análisis aislada (el generador escribe en
#    apps/web/public/data y data/generated de SU raíz):
SB=~/workspace/.atlas-8a-sandbox
mkdir -p $SB/data/cache $SB/data/source $SB/data/generated \
         $SB/apps/web/public/data $SB/tools
cp -r tools/data $SB/tools/ && rm -rf $SB/tools/data/.venv
for f in admin1CodesASCII.txt cities1000.txt ne_50m_admin_0_countries.json; do
  ln -s ~/workspace/atlas-iniciativas-opus-dei/data/cache/$f $SB/data/cache/$f
done
ln -s ~/workspace/atlas-iniciativas-opus-dei/data/cache/geonames_countries \
      $SB/data/cache/geonames_countries
cp data/cache/geocoding_cache.json $SB/data/cache/
cp data/source/Directorio_Opus_Dei_MUNDIAL_v15-candidato-1.xlsx \
   $SB/data/source/Directorio_Opus_Dei_MUNDIAL_v14.xlsx

# 2) Adaptaciones SOLO en la copia de la caja (el repo no se toca):
#    - las 3 aserciones con cifras v14 pasan a «print» de análisis;
#    - la agrupación de ambiguos/sin coincidencia usa payload.get;
#    - tras leer el Directorio, las filas se reordenan al orden
#      v14 POR NOMBRE de cabecera (las 23 columnas v14 existen
#      en el v15) antes del desempaquetado posicional.

# 3) Pipeline geográfico sobre el v15 (en la caja):
tools/data/.venv/bin/python $SB/tools/data/build_catalog.py

# 4) Auditoría comparativa y generación de entregables:
tools/data/.venv/bin/python tools/data/audit_v14_v15.py
```

Entregables: este informe, `data/generated/v14-v15-diff.json`,
`data/generated/v14-v15-diff.csv`,
`data/generated/v15-geocoding-report.md` y
`data/generated/v15-anomalias.csv`. **La Fase 8B no se ha
iniciado.**
