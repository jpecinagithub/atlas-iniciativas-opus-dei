# Fase 8C — Migración al libro nuevo (v15-6) y taxonomía visible en 6 familias

**Estado: ejecutada en local (Fases 1–5 del encargo). SIN DESPLEGAR.**
Pendiente: aprobación visual de Jon y certificación de Codex.
Producción no se ha tocado en ningún momento: sigue con los datos v15-5 y
VERSION `5722ebd12b04` (verificado por la ruta pública al inicio de la fase).

El comportamiento certificado (clústeres, spiderfy, selector de
coincidentes, permanencia del grupo al abrir fichas, Escape por etapas,
móvil, PWA) se mantiene intacto: la batería funcional completa pasa
111/111, incluidas las 22 comprobaciones del Hotfix 2.

---

## 1. Los dos libros y sus huellas (no confundir)

| Libro | Papel | SHA-256 |
|---|---|---|
| `~/workspace/user/files/Directorio_Opus_Dei_MUNDIAL_v15-5.xlsx` (entregado por Jon con ese nombre, pero es el libro NUEVO) | Original. **Jamás modificado.** | — (es el mismo fichero archivado abajo) |
| `data/source/Directorio_Opus_Dei_MUNDIAL_v15.xlsx` | Copia byte a byte del entregado, archivada en el repo (el nombre no colisionaba con ningún fichero existente). | `d541e1396f7aaea09f6dfdf12738f5135e96eaf0bcb592318fcd35f70d6771ca` |
| `data/source/Directorio_Opus_Dei_MUNDIAL_v15-6.xlsx` | **Copia normalizada e importable**, generada por script (`tools/data/build_v15_6_book.py`), con cada cambio registrado en su hoja Cambios (14 filas nuevas). | `603b927056ccaefe86108f59c584d84869be3d7d3a79f3868b7fa5d72095359c` |
| `data/source/Directorio_Opus_Dei_MUNDIAL_v15-5.xlsx` (el de producción) | Intacto. | `088655db8d0d3bffd38cc1f4f23454ad61df413ff34b1cb7bc01e1f62811cef5` |

## 2. Cifras de control del libro entregado (inspección de Codex, reproducidas)

1.409 registros · 1.409 IDs únicos · 69 países con iniciativas · 70 filas en
Países que suman 1.409 y coinciden país por país con Directorio · 1.387 con
Precisión = localidad (todas con GeoNames ID) · 22 con Precisión = sin
resolver (ninguna con ID) · 2.728 fuentes con ID único. Hojas que alimentan
la app: Directorio, Países y Fuentes. Lectura siempre por nombre de
cabecera. El libro entregado **no** trae hoja «Geografía v15».

**Hallazgo**: la hoja Países del entregado declara los totales bien (suma
1.409 e identidad por país), pero su desglose por estados **no trae columna
«Confirmado»**: Polonia declara 35 con desglose que suma 32 y Puerto Rico 6
con desglose que suma 5. La copia v15-6 añade la columna y reconstruye el
desglose desde el Directorio corregido (identidad para los 70 países).

## 3. Normalizaciones aplicadas solo en la copia v15-6

- **Categorías (exactamente 10)**: ES-294 → Escuelas de formación Técnica;
  PH-064 → Centros culturales; ES-299 → Residencias universitarias; JP-09 →
  Centros culturales; VE-20 y VE-21 → Centros de promoción social; NG-33 →
  Escuelas de formación Técnica; JP-11 → Escuelas de formación Técnica;
  LB-04 → Residencias universitarias; LB-05 → Clubes juveniles. Resultado:
  exactamente las 14 categorías canónicas, sin alias en el frontend.
- **Estados (3)**: PL-33, PL-34 y PL-35 → «Confirmado y contrastado».
  PR-06 queda como único «Confirmado». Distribución resultante:
  **parciales 1.309 · contrastados 52 · Pendiente 36 · Histórico 11 ·
  Confirmado 1** (total 1.409).
- **Países**: columna «Confirmado» añadida y desglose reconstruido.

## 4. Comparación completa contra el v15-5 en producción

- **Altas (3)**: CO-37, ES-301, ES-302. **Bajas (5)**: CO-32, ES-153,
  ES-219, ES-230, MX-47.
- **Geografía**: 1.317 → **1.387 con punto** (+70 netos) y 94 → **22 sin
  punto**. Puntos ganados: 70 (el libro nuevo asigna GeoNames ID a 70
  registros que el v15-5 dejaba sin resolver). Puntos perdidos: exactamente
  2, ambos **intencionados y documentados en las notas del propio libro**:
  ES-218 (queda sin resolver; no se fuerza el núcleo urbano de Castellbell
  para la finca de Viladoms) y ES-240 (se retira el punto incorrecto de
  Valencia; ambigüedad Canals/Serratella/Aiacor). **Desplazados: 0.**
- **Cambios por campo** (registros comunes): el grueso es geográfico (92
  registros con cambios en el bloque geo; 72 con lat/lng/precisión/ID: los
  70 ganados + los 2 perdidos); el resto, retoques editoriales menores
  (dirección 10, localidad 8, nombre 5, Fuente 2: 4, Fuente 1: 2, otros
  sueltos).
- **Categorías antes/después** (únicos movimientos): Casa de retiros
  130 → 126 · Centros de mujeres 209 → 210 · Colegios 397 → 399 · Centros
  culturales 26 → 25.
- **Estados antes/después**: parciales 1.311 → 1.309 · contrastados
  52 → 52 · Pendiente 36 → 36 · Histórico 11 → 11 · Confirmado 1 → 1
  (la composición cambia: salen ES-219 y entran los ajustes de PL/PR).
- **Fuentes**: 2.724 → **2.728** (+4 filas nuevas: `v54-APCEContacto`,
  `v54-DeltaContacto`, `v54-IBODelta`, `v54-JacarandaContacto`; 0 retiradas,
  0 URL modificadas en la hoja Fuentes).
- **Relaciones: 2.167 → 2.159 (neto −8 = 11 perdidas − 3 ganadas)**:
  - Perdidas con las bajas (7): CO-32 ×1, ES-153 ×2, ES-219 ×1, ES-230 ×1,
    MX-47 ×2.
  - Perdidas en registros que sobreviven (4), porque **su cita cambió en el
    libro nuevo** y la fila de Fuentes conserva la URL antigua: CO-33
    (Fuente 2: artículo de opusdei.org → `https://cfmujer.org/`), ES-240
    (Fuente 1: `escora.es/` → `escora.es/contact-me/`), ES-25 (Fuente 2:
    fomento …/solicitud-informacion/ → …/contacto/), ES-43 (Fuente 2: URL
    de PDF → …/contacto/).
  - Ganadas con las altas (3): CO-37 → F-2296, ES-301 → F-1665,
    ES-302 → F-1665.
  - Ambiguas por URL duplicada: **8**. URL duplicadas: **14**. La regla
    certificada (solo URL exacta que identifica una única fila de Fuentes)
    no se ha alterado.
  - *Dos bases de conteo para «sin coincidencia»*: sobre las celdas crudas
    del libro, Fuente 1 sin coincidencia = **180** y Fuente 2 = **471**
    (las cifras de la inspección de Codex, reproducidas). Con la semántica
    del importador sobre el catálogo generado (los valores marcadores como
    «No localizado» o texto no-URL cuentan como cita ausente, no como
    fallo), son **130** y **210**. Ambas bases quedan documentadas; la
    regla certificada produce 130/210.
- **Lista de los 22 sin punto**: `data/generated/v15-6-sin-punto-22.csv`;
  comparación completa en `data/generated/v15-6-comparacion.json`;
  movimientos de relaciones en `data/generated/v15-6-relaciones.csv`.
- **Regresión del generador**: sobre v14 y sobre v15-5, salidas idénticas
  a las certificadas (0 diferencias). Batería de análisis del catálogo de
  prueba (`tools/data/analyze_v15_6_trial.py`): **11/11**.

### Desviación documentada (única) — guarda de geografía

IE-15 e IE-16 (Belfast) llevan en el libro, deliberadamente y con nota
fechada 2026-11-13, País ISO **GB** con Código país **IE** (el directorio
mantiene IE por trazabilidad; el ISO geográfico es GB; su GeoNames 2655984
está en GB). La guarda adicional del generador que exigía País ISO =
Código país bloqueaba sus dos puntos (1.385 ≠ 1.387 esperado). Conforme a
la regla enunciada por Jon (contrastar el país del extracto GeoNames con
el **País ISO**), esa guarda pasa a ser una **observación de trazabilidad
no bloqueante** (nuevo campo `idObservations` del informe del generador);
la comprobación bloqueante (país del extracto = País ISO) se mantiene.
Solo 2 filas del libro difieren ISO ≠ código (IE-15/IE-16) y el v15-5 no
tenía ninguna, por lo que las regresiones quedan probadas idénticas.
IE-15/IE-16 resuelven a Belfast (54.59682, −5.92541) y su `countryCode`
sigue siendo IE.

## 5. Manifiesto de poda e importador

- Nuevo `apps/api/prune-manifest.v15-6.json`: SHA-256 del v15-6 + las 5
  bajas exactas (CO-32, ES-153, ES-219, ES-230, MX-47).
- El importador `--prune-missing` ahora **selecciona el manifiesto por el
  SHA entrante** (escanea `prune-manifest.*.json`; `PRUNE_MANIFEST_PATH`
  sigue forzando uno; sin coincidencia → aborta sin escribir). No se
  reutilizó el manifiesto del v15-5.

## 6. Fase 3 — base temporal (nunca producción)

Sobre una copia de la base local en su estado v15-5 verificado
(1.411/1.317/2.724/2.167), importado el v15-6 con el manifiesto nuevo
(seleccionado automáticamente por SHA): poda `{deleted: 5, relationsDeleted: 7}`,
relaciones creadas 2.159, ubicadas 1.387. Verificado en la base temporal:
**1.409 · 1.387 · 22 · 69 países con registros · 70 filas · 2.728 fuentes ·
2.159 relaciones · 14 categorías · estados 1.309/52/36/11/1**; bajas
ausentes; altas presentes con su categoría. **Idempotencia**: segunda
corrida con 0 altas/actualizaciones/borrados. **Prueba negativa**: forzar
el manifiesto del v15-5 contra el libro v15-6 aborta por SHA sin crear
corrida. Base temporal eliminada al terminar.

## 7. Taxonomía visible — 14 categorías → 6 familias

Módulo único y tipado `apps/web/src/taxonomy.ts` (único lugar que define
familia, miembros, orden, colores, etiqueta y descripción).
`categories.ts` queda como adaptador fino que reexporta el color desde la
taxonomía. La API no se ha tocado.

| Familia (color) | Categorías canónicas | Total |
|---|---|---|
| **Educación** (ámbar `#D9A13B`) | Colegios 399 · Universidades 41 · Escuelas de formación Técnica 84 | **524** |
| **Centros y residencias** (azul `#6E8FB8`) | Centros de mujeres 210 · Centros de varones 165 · Residencias universitarias 162 · Centros culturales 25 | **562** |
| **Juventud** (turquesa `#35B5AC`) | Asociaciones juveniles 103 · Clubes juveniles 5 | **108** |
| **Acción social y salud** (verde `#55A868`) | Centros Médicos 13 · Centros de promoción social 10 | **23** |
| **Espiritualidad y convivencia** (ocre `#C7A94E`) | Casa de retiros 126 · Iglesias 45 | **171** |
| **Información institucional** (gris azulado `#8494AB`) | Oficinas de Información 21 | **21** |
| | **Total iniciativas** | **1.409** |

- **Filtro**: primer nivel solo con las 6 familias (nombre, color, conteo,
  checkbox de selección total, botón de despliegue con `aria-expanded`).
  Seleccionar la familia selecciona sus categorías; desmarcar una
  subcategoría deja la familia en **indeterminado** (propiedad
  `indeterminate` del checkbox nativo + `aria-checked="mixed"`). Familias
  plegadas por defecto, salvo la que contiene un filtro activo recuperado
  de la URL (auto-despliegue; nunca se auto-pliegan). «Quitar todas» limpia
  y «Restablecer» vuelve al estado inicial. Los conteos respetan país,
  búsqueda y demás filtros (antes solo respetaban el país: cambio
  deliberado del encargo). Sin segunda lista de categorías: los chips por
  categoría del contexto de país se conservan por ser el resumen
  certificado del país (interpretación registrada), no una lista nueva.
- **URL e historial**: el formato no cambia — la selección sigue siendo el
  conjunto de categorías canónicas; las familias son solo presentación y
  no se almacenan como dato. Un enlace antiguo con una categoría
  (`?categorias=Colegios`) sigue funcionando (comprobado en la batería:
  filtra 399, despliega Educación y la deja indeterminada).
- **Ficha**: muestra familia y categoría canónica con su nombre exacto,
  p. ej. «Educación · Colegios» (sin singularizar).
- **Mapa**: cada punto lleva su índice de familia; los clústeres acumulan
  conteos por familia (propiedades `f0…f5`). Clúster **homogéneo** (una
  sola familia) → color de su familia; **heterogéneo** → el estilo neutro
  de siempre (`#e8a33d`). Puntos, spiderfy, chips y fichas usan el color de
  la familia con variaciones moderadas por categoría. Nunca solo color:
  la etiqueta textual acompaña siempre.

## 8. Pruebas (Fase 4, desde limpio)

- `npm ci` desde limpio: OK.
- Tipos y build: OK (VERSION local del build con v15-6: `cbc45c1941d1`).
- `test:integrity`: **6/6**. Corrección necesaria: la prueba corrompía el
  libro por nombre fijo (`…v14.xlsx`), obsoleto desde el v15; ahora
  resuelve el libro desde la meta del catálogo vigente.
- `test:api`: **13/13** (expectativas actualizadas de las cifras v14 a
  v15-6: 1409/1387/70/2728/2159; España 298/289; Colegios 110).
- `test:sw`: OK (la huella cambia al cambiar un recurso y vuelve al
  restaurar: determinista).
- **Batería funcional completa: 111/111** (las 91 heredadas, adaptadas a
  las cifras v15-6 y a desplegar la familia antes de marcar una
  subcategoría, + 20 nuevas: 6 de DATOS contra la API, 1 de conteos por
  familia en clústeres del mundo, 1 de ficha familia·categoría, 11 de
  taxonomía — primer nivel de 6, conteos, indeterminado real, Juventud,
  enlace antiguo, país+familia, «Quitar todas»/«Restablecer» — y 1 de
  clúster homogéneo de Las Palmas). Cero errores y cero advertencias
  propias de consola en los tramos que los exigen; PWA offline con el
  catálogo nuevo; recorrido del grupo de Piura intacto.
- **OSV**: 297 paquetes, **0 vulnerabilidades** (osv-scanner 2.7.1;
  la herramienta se reinstaló porque el reprovisado de la VM la había
  eliminado, igual que a PostgreSQL — ver Limitaciones).
- Batería de poda heredada (`tests/import-prune.mjs`): **no ejecutable
  contra el árbol actual** — quedó ligada al escenario v15-5 (manifiesto
  único y SHA del v15-5) y su primera aserción ya no aplica con dos
  manifiestos. La poda v15-6 queda cubierta por la Fase 3 (importación
  real con manifiesto auto-seleccionado, idempotencia y aborto con el
  manifiesto equivocado). Adaptarla al mundo multi-manifiesto queda
  anotado como pendiente menor.

## 9. Capturas (Fase 5) — `docs/fase-8c/`, revisadas una a una

1. **01-mundo-familias-cerradas.png** — El globo es protagonista; el panel
   muestra solo las 6 familias con su punto de color, descripción breve,
   conteo y chevrones. Contadores: 1.409 · 69 · 1.387. Sin solapamientos
   ni scroll horizontal. Observación menor: en el ancho del panel, la
   descripción de algunas familias se corta con elipsis («Espiritualidad
   y convive…»); el nombre completo consta en la etiqueta accesible.
2. **02-educacion-seleccionada.png** — Educación marcada y auto-desplegada
   con sus 3 subcategorías marcadas (399/41/84); chips superiores con los
   puntos ámbar; contadores 524 · 46 · 514; los clústeres homogéneos del
   mapa se tiñen de ámbar y el mapa se vacía de ruido.
3. **03-centros-residencias-desplegada.png** — Solo Centros y residencias
   desplegada, con sus 4 subcategorías en variaciones de azul
   (210/165/25/162) y la fila de familia resaltada. (Primera versión
   descartada y regenerada: Educación seguía desplegada porque la
   expansión se conserva al desmarcar, por diseño.)
4. **04-espana-educacion.png** — España con la familia aplicada: conteos
   del panel ya son de España (Educación 145 = Colegios 110 +
   Universidades 4 + Esc. formación Técnica 31), clústeres ámbar sobre el
   país, tira de primeras iniciativas y contadores 145 · 1 · 140.
5. **05-ficha-familia-categoria.png** — Ficha de Tajamar con la cabecera
   «EDUCACIÓN · COLEGIOS · ES-06» y el punto ámbar; el marcador 3D se ve
   sobre Madrid. Ficha editorial intacta, sin la sección retirada.
6. **06-piura-spiderfy-ficha.png** — El grupo de Piura desplegado con sus
   3 puntos ámbar (los tres son Educación), etiquetas hacia fuera, anillo
   de resaltado en Turicará y su ficha abierta («EDUCACIÓN · COLEGIOS»)
   sin marcador 3D ni movimiento de cámara: el comportamiento del
   Hotfix 2, intacto con la nueva taxonomía.
7. **07-movil-familias.png** (390×844) — Pestaña «Filtros» con las 6
   familias completas y legibles, objetivos táctiles amplios, sin
   desbordamiento horizontal y el mapa visible sobre la hoja.
8. **08-movil-subcategorias.png** — Educación desplegada en el móvil con
   sus 3 subcategorías y conteos (399/41/84), chevrones girado y el resto
   de familias a continuación.

## 10. Limitaciones y observaciones

- **Incidencia de entorno**: a mitad de la Fase 4 la VM se reprovisó y
  PostgreSQL local desapareció por completo (binarios y datos), junto con
  `/tmp` y `osv-scanner`. Se recuperó con el procedimiento conocido
  (instalar `postgresql-16`, recrear rol `atlas` y base `atlas`,
  reimportar). Sin impacto en el repo ni en producción.
- La hoja Países del libro entregado venía sin columna «Confirmado»
  (ver §2): corregido solo en la copia importable v15-6.
- Descripciones de familia con elipsis en el panel estrecho (ver §9.1).
- Cadena obsoleta «Directorio v14 verificado» en la cabecera de la hoja
  móvil (`App.tsx`): anterior a esta fase y fuera del encargo; se propone
  corregirla en la Fase 6 o en un ajuste aparte.
- Los artefactos del árbol (`apps/web/public/data/catalog.json`,
  `data/generated/sources.json`) quedan **restaurados a la versión
  certificada v15-5** (huellas `dfbf5c76…` / `257e8536…`), y la base local
  de desarrollo también (reimportada desde ellos: 1.411/1.317/2.724/
  2.167): el repo queda coherente con producción hasta que la Fase 6
  promueva el v15-6. Los artefactos de prueba del v15-6 permanecen en
  `data/generated/v15-6-trial/`.
- **Despliegue NO ejecutado.** La Fase 6 requerirá: aprobación visual de
  Jon sobre estas capturas, certificación de Codex, promoción de los
  artefactos v15-6, importación en el servidor con el comando de
  producción fijado (`docker compose -f docker-compose.prod.yml run
  --rm api node dist/import.js --prune-missing`; manifiesto v15-6) y
  verificación por la ruta pública.

## 11. Commits locales de la fase

- `c748272` — archivado del libro original (v15).
- `a8c06c3` — script + copia normalizada v15-6 + manifiesto + selección de
  manifiesto por SHA + observación ISO del generador + artefactos de
  prueba y análisis (11/11).
- `7a95eb4` — taxonomía visible (taxonomy.ts, filtro por familias, ficha,
  colores de mapa y clústeres).
- `c0da83a` — batería y pruebas adaptadas/ampliadas.
- El commit de capturas y registro que contiene este documento y la
  actualización de `PENDIENTES.md`.

## 12. Correcciones exigidas por Jon (2026-11-13) — aplicadas y re-verificadas

Jon no certificó las Fases 1–5: aprobó la propuesta de seis familias
pero exigió dos correcciones P1 y dos P2 antes de autorizar
producción. Las cuatro están aplicadas y toda la verificación se ha
repetido. El despliegue sigue SIN ejecutar.

### 12.1 (P1) La excepción geográfica queda como lista cerrada exacta

Antes: cualquier diferencia «País ISO» ≠ «Código país» pasaba a
observación no bloqueante en `tools/data/build_catalog.py`. Ahora
existe la constante `GEO_COUNTRY_EXCEPTIONS` con las únicas dos
combinaciones exactas (ID, Código país, País ISO, GeoNames ID)
toleradas: **IE-15 / IE / GB / 2655984** e **IE-16 / IE / GB /
2655984** (Belfast: directorio IE, geografía GB). Esas dos se
registran como observación (`iso_differs_from_country_code_exception`)
y su punto se resuelve por ID contra el País ISO. **Cualquier otra
discrepancia bloquea el punto** y consta como anomalía
(`iso_differs_from_country_code`) en el informe de resolución.

Prueba negativa nueva, permanente:
`tools/data/test_geo_country_exceptions.py` genera un libro ficticio
(copia temporal del v15-6 con ES-01, Pamplona, ID 3114472, con el
«País ISO» cambiado de ES a PT) y regenera contra salidas temporales:
ES-01 queda sin punto, es la única anomalía del informe, el total
baja a 1.386 y, como control positivo en la misma corrida, IE-15 e
IE-16 conservan el punto de Belfast (54.59682, −5.92541) como
observaciones de excepción. **8/8 checks en verde.**

El catálogo de prueba v15-6 se ha regenerado con el generador
corregido: las 1.409 iniciativas y los países son **idénticos** a los
de la corrida anterior (la única diferencia es la clave de geoStats
en la meta, que ahora distingue excepción de bloqueo, y la redacción
del informe de resolución). Totales intactos: **1.409 / 1.387 / 22**,
IE-15 e IE-16 con punto. Análisis completo repetido: **11/11**, con
las regresiones del generador sobre v14 y v15-5 limpias (directorios
de regresión reconstruidos para la ocasión, pues `/tmp` se perdió en
el reprovisado de la VM durante la fase).

### 12.2 (P1) La prueba permanente de poda cubre el multi-manifiesto v15-6

`tests/import-prune.mjs` reescrita (la anterior quedó como escenario
histórico de la 8B). Sobre bases temporales y con los artefactos del
árbol restaurados byte a byte al final (verificado por SHA-256),
cubre, con **61 checks en verde**:

- selección automática del manifiesto v15-5 por SHA para construir
  la base v15-5 de partida (poda 5 / 5 relaciones) y del **manifiesto
  v15-6** para la migración (poda exacta de CO-32, ES-153, ES-219,
  ES-230 y MX-47 con **7 relaciones eliminadas**; relaciones creadas
  2.159; totales 1.409 · 1.387 · 22 · 69 · 2.728 · 2.159);
- **rechazo del manifiesto v15-5**: forzado con
  `PRUNE_MANIFEST_PATH` contra el libro v15-6, la importación aborta
  por no coincidencia de SHA y la base queda intacta (totales y
  número de corridas sin cambios);
- **aborto ante una sexta baja** (ES-01 retirada solo del catálogo
  intercambiado): la importación aborta nombrándola y la base queda
  exactamente en su estado v15-5;
- **idempotencia**: segunda importación v15-6 con poda = 0 altas,
  0 actualizaciones, 0 borrados;
- guardas de arranque: hashes certificados de los artefactos del
  árbol y SHA declarados por ambos catálogos contra sus manifiestos.

La prueba se ha ejecutado tres veces seguidas con el mismo
resultado (es ella misma repetible: deja el árbol y las bases como
los encontró).

### 12.3 (P2) Fuera la etiqueta «Directorio v14 verificado»

La cabecera de la hoja móvil dice ahora **«Directorio actualizado y
verificado»** (`App.tsx`), texto independiente de versiones. La
búsqueda exhaustiva de menciones visibles a «v14» encontró y corrigió
además otras tres: «Presencia documentada en el directorio v14» del
contexto de país (`Panels.tsx` → «Presencia documentada en el
directorio»), la meta descripción de `apps/web/index.html` y la
descripción de `apps/web/public/manifest.webmanifest`. No queda
ninguna mención a «v14» en el código de la web ni en los textos de
la PWA (los datos del catálogo no son textos de interfaz).

### 12.4 (P2) Los nombres de familia ya no se truncan

En `Panels.tsx`, el nombre principal de la familia deja de usar
`truncate`: puede envolver a dos líneas (`leading-snug`) dentro de su
columna, con el conteo y el chevrón fuera de ella. Las descripciones
secundarias conservan la elipsis, como se autorizó. Verificado con
un check dirigido nuevo en la batería (el nombre no desborda su
caja: `scrollWidth ≤ clientWidth`) para las seis familias, en el
panel de escritorio y en la hoja móvil, y visualmente en las
capturas regeneradas: «Espiritualidad y convivencia» se lee entera
en ambas plataformas (en escritorio ocupa dos líneas; en móvil, una).

### 12.5 Re-verificación completa tras las correcciones

- Análisis del catálogo de prueba: **11/11** (ver §12.1).
- Prueba de poda multi-manifiesto: **61/61** (ver §12.2).
- `npm ci` desde limpio; tipos y build de web y API en verde.
  VERSION local resultante: **`1f4d85389cc3`** (la de la 8C era
  `cbc45c1941d1`; cambia porque cambia el código web, no los datos).
- `test:integrity` OK · `test:api` **13/13** · `test:sw` OK (huella
  determinista).
- **Batería funcional completa: 114/114** (las 111 de la fase más 3
  checks nuevos: nombre de familia sin truncar en escritorio, texto
  de cabecera móvil sin versión y nombre de familia sin truncar en
  móvil). Cero errores y cero advertencias propias.
- OSV no se ha repetido: las correcciones no tocan dependencias
  (mismo `package-lock.json`; el `npm ci` reinstala lo ya auditado
  en la fase: 297 paquetes, 0 vulnerabilidades).
- Capturas regeneradas de sus recorridos reales: **01, 02, 03, 04,
  07 y 08** de `docs/fase-8c/` (02 y 04 también cambian: muestran el
  mismo panel de familias con el nombre antes truncado) y las del
  recorrido funcional en `docs/screenshots/`. Las capturas **05 y 06
  han salido byte-idénticas** (ni la ficha ni el spiderfy de Piura
  incluyen el panel ni la cabecera corregidos) y no se han tocado.
  Revisión visual de las regeneradas: nombres completos en las seis
  familias, jerarquía y legibilidad correctas, sin solapamientos ni
  scroll horizontal.
- Incidencia de procedimiento, detectada y corregida dentro de esta
  misma re-verificación: la primera importación de la base local de
  la batería se lanzó con `npm run import -- --prune-missing` y el
  flag no atravesó los dos niveles de `npm run` (el health de la API
  devolvió 1.414 iniciativas en vez de 1.409, la señal de alarma).
  La base local se restauró desde la copia previa y se reimportó
  invocando el importador directamente (tsx, como hace la prueba de
  poda), quedando exacta en 1.409/1.387/2.728/2.159 con la poda
  registrada. La prueba permanente de poda no se vio afectada: ella
  siempre invocó el importador por la vía directa. Solo afectó a la
  base local de desarrollo, nunca a producción.
- Al terminar: servidores locales detenidos; artefactos del árbol
  restaurados a los certificados v15-5 (`dfbf5c76…` / `257e8536…`,
  verificado por hash) y la base local también (desde su copia
  previa: 1.411/1.317). Producción no se ha tocado en ningún momento
  (sigue en VERSION `5722ebd12b04` con el v15-5).

### 12.6 Commits locales de las correcciones

- `f6360b8` — corrección 1 (lista cerrada de excepciones, prueba
  negativa, trial regenerado y análisis 11/11).
- `4cf08c2` — correcciones 2, 3 y 4 (prueba de poda multi-manifiesto;
  etiqueta sin versión; nombre de familia sin truncar).
- `525a8db` — re-verificación (batería 114/114 con los checks nuevos
  y capturas regeneradas).
- El commit de registro que contiene esta adenda y la actualización
  de `PENDIENTES.md`.

**Estado: correcciones aplicadas y verificadas. El despliegue (Fase
6) continúa pendiente de la certificación de Jon y de Codex.**

## 13. Corrección del camino operativo de poda (2026-11-13)

Certificadas las cuatro correcciones del §12, Jon detectó un
último bloqueo operativo: el comando documentado
`npm run import -- --prune-missing` **no transmite el argumento**
(el `--` no atraviesa los dos niveles de `npm run` entre la raíz
y el workspace `@atlas/api`) y realiza una importación **sin
poda**. Es el mismo defecto que ya había mordido dentro de esta
fase (§12.5). Y la prueba permanente `tests/import-prune.mjs`
invocaba el importador directamente (Node/tsx): probaba bien el
importador, pero **no el camino que usa el operador**.

### 13.1 Comando explícito nuevo

Sin reenvío de argumentos: el flag viaja dentro del propio script.

- `apps/api/package.json`:
  `"import:prune": "tsx src/import.ts --prune-missing"`.
- `package.json` (raíz):
  `"import:prune": "npm run import:prune --workspace=@atlas/api"`.

El comando `import` de siempre no cambia (importación sin poda,
que nunca borra).

### 13.2 Vía exclusiva de producción

La importación con poda en producción se hará únicamente con el
binario compilado dentro del contenedor de la API:

```bash
docker compose -f docker-compose.prod.yml run --rm api \
  node dist/import.js --prune-missing
```

El build de la API (`tsc`) emite `dist/import.js` (comprobado en
esta corrección). El README prescribe ya ambas vías y retira la
que no funciona, advirtiendo del defecto; la invocación
prescriptiva del informe de la 8B queda igualmente corregida con
nota fechada (su narrativa histórica no se altera).

### 13.3 La prueba cubre el camino del operador

`tests/import-prune.mjs`: la importación positiva v15-6 (paso 4)
se lanza ahora con **`npm run import:prune` ejecutado desde la
raíz del repo**, con la base temporal en `DATABASE_URL`, y exige
en la salida del importador:

- la clave `prune`;
- el manifiesto `prune-manifest.v15-6.json`;
- `deleted: 5`;
- `relationsDeleted: 7`;

y, como antes, verifica tras la corrida los totales en base:
**1.409 iniciativas · 1.387 localizadas · 2.728 fuentes ·
2.159 relaciones**. El resto de ejecuciones de la prueba
(construcción de la base v15-5, rechazo cruzado de manifiesto,
idempotencia y aborto ante la sexta baja) siguen invocando el
importador directamente: su objeto es el comportamiento del
importador, no el comando.

Salida literal de la ejecución por el camino del operador sobre
una base desechable (v14 restaurado → v15-5 → v15-6), recortada
a lo esencial:

```
--prune-missing: manifiesto verificado; bajas a podar: 5 (CO-32, ES-153, ES-219, ES-230, MX-47)
 "prune": {
  "manifest": "…/apps/api/prune-manifest.v15-6.json",
  "deleted": 5,
  "ids": [
   "CO-32",
   "ES-153",
   "ES-219",
   "ES-230",
   "MX-47"
  ],
  "relationsDeleted": 7
 },
 "located": 1387,
 "unlocated": 22
```

Totales verificados en esa base tras la corrida: 1.409 ·
1.387 · 2.728 · 2.159.

### 13.4 Re-verificación

- Build de la API (tipos + `tsc`): en verde, con
  `apps/api/dist/import.js` presente.
- **Batería de poda completa: 63/63** — los 61 checks del
  escenario multi-manifiesto más los 2 nuevos del camino del
  operador (presencia de la clave `prune` y del manifiesto
  v15-6 en la salida de `npm run import:prune`); la ejecución
  positiva exige además `deleted: 5`, `relationsDeleted: 7` y
  los totales en base. Árbol restaurado byte a byte al v15-5
  certificado al final (verificado por SHA-256) y bases
  temporales eliminadas.
- No se han repetido las capturas ni las 114 comprobaciones
  funcionales: esta corrección no toca la web (Jon lo exime
  expresamente).
- Producción intacta, confirmada al terminar por la ruta
  pública: VERSION `5722ebd12b04` y salud de la API
  1.411/1.317/2.724/2.167 (datos v15-5).

**Estado: bloqueo operativo corregido y verificado. Pendiente
únicamente la certificación de Jon y de Codex para desplegar
(Fase 6).**
