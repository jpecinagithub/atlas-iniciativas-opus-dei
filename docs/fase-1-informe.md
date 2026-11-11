# Atlas de iniciativas · Opus Dei — Fase 1: Datos y decisiones

Fecha: 2026-11-11 · Archivo inspeccionado: `Directorio_Opus_Dei_MUNDIAL_v14.xlsx`
(891 KB, copia de trabajo en `data/source/`). Inspección con openpyxl sobre filas
con datos reales (las hojas declaran ~1.048.576 filas por formato; se ignoran
las filas vacías de formato).

## 1. Cifras del encargo — confirmadas

| Comprobación | Encargo | Real en el archivo | Estado |
|---|---|---|---|
| Registros en Directorio | 1.382 | **1.382** | ✅ |
| IDs únicos | 1.382 | **1.382, 0 duplicados** | ✅ |
| Columnas en Directorio | 23 | **23** | ✅ |
| Países/territorios en Países | 70 | **70 filas** | ✅ |
| Entradas en Fuentes | 2.626 | **2.626, IDs únicos** | ✅ |
| Categorías | 14 | **14 exactas, sin valores fuera de lista** | ✅ |
| Suma «Nº registros» de Países | — | **1.382 = Directorio** | ✅ |
| Prefijo de cada ID = código de país | — | **1.382/1.382** | ✅ |

Categorías (conteo real, no constante de interfaz): Colegios 389 · Centros de
mujeres 210 · Centros de varones 166 · Residencias universitarias 153 · Casa de
retiros 124 · Asociaciones juveniles 104 · Escuelas de formación Técnica 82 ·
Iglesias 45 · Universidades 42 · Centros culturales 24 · Oficinas de
Información 21 · Centros Médicos 13 · Centros de promoción social 8 ·
**Clubes juveniles 1** (NL-18, Club De Reusel — categoría separada, no se
fusiona con Asociaciones juveniles).

Continentes: Europa 657 · América 479 · Asia 109 · África 107 · Oceanía 30.

## 2. Campos conservados

Directorio (23): ID único, Nombre oficial, Categoría principal, Sexo, País,
Código país, Continente, Región/Provincia/Estado, Localidad, Dirección
completa, Código postal, Teléfono, Web oficial, Entidad titular, Tipo de
vinculación, Evidencia de vinculación, Estado de verificación, Estado de
actividad, Fecha de consulta, Fuente 1, Fuente 2, Resultado doble comprobación,
Email de contacto.

Países (13): País, Código, Continente, Circunscripción (lista 4-jun-2024),
Evidencia de presencia, Fuente principal, Avance de investigación, Nº
registros, Confirmado y contrastado, Confirmado con datos parciales, Pendiente,
Histórico, Nota.

Fuentes (7 con cabecera + 1 sin cabecera): ID fuente, Institución emisora
(dominio), Título/página, URL, País, Naturaleza de la fuente, Fecha de
consulta, **[col. 8 sin encabezado: notas — se conservan; 34 filas la usan]**.

Textos largos reales: Evidencia media 608 caracteres (máx. 1.745) y Resultado
doble comprobación media 265 (máx. 2.127) → van al detalle de ficha, nunca al
catálogo compacto.

## 3. Anomalías y particularidades verificadas

- **A1 · PR-06 «Confirmado» suelto.** Estados de verificación: Confirmado con
  datos parciales 1.314 · Pendiente 40 · Confirmado y contrastado 16 ·
  Histórico 11 · **Confirmado 1 (PR-06 Puertorreal)**. Es la única causa de que
  los desgloses de Países sumen 1.381 frente a 1.382: Puerto Rico declara
  total 6 y desglose 5. La app calculará sus recuentos desde Directorio y
  mostrará el contraste con Países como nota de importación, sin reescribir
  el dato de origen.
- **A2 · «NL» es ambiguo y NO es siempre «No localizado».** En Código país,
  `NL` es el código ISO de Países Bajos en los 18 registros NL-01…NL-18.
  Una normalización ingenua los dejaría sin país. Regla: `NL` solo significa
  «no localizado» donde el campo lo usa como marcador (p. ej. textos de
  dirección/CP), nunca en Código país.
- **A3 · PA-03 y PA-04** traen una descripción en Estado de actividad
  (Entremares y Tagua, Panamá). Se conserva el texto íntegro como original y
  el estado normalizado queda **no determinado**, como pide el encargo.
- **A4 · Sexo: 72 valores crudos distintos** *(corregido en la revisión de
  Fase 1, 2026-11-11)*. Los cuatro valores «Femenino» (452), «Masculino»
  (368), «Mixto» (106) y «No consta» (369) suman **1.295**; incluyendo
  «No aplicable» (3), los cinco valores básicos suman **1.298**. Las **67
  variantes restantes corresponden a 84 registros**, no 78. No se pueden
  colapsar sin perder el matiz: se conserva siempre el texto original en
  la ficha.
- **A5 · Fuentes compartidas y repetidas.** 2.624 fuentes tienen URL y solo
  2.600 son únicas (24 repeticiones). V32-102 y V32-103 no tienen URL, país
  ni fecha. Una URL compartida no fusiona iniciativas.
- **A6 · Relación Directorio↔Fuentes solo por URL.** Fuente 1/Fuente 2 son
  URLs, no IDs de fuente. Coincidencia exacta con el catálogo: Fuente 1 en
  1.228 registros, Fuente 2 en 939, ambas en 892. Sin coincidencia catalogada:
  Fuente 1 en 102 y Fuente 2 en 134 (además de 52 y 309 «No localizado»).
  La relación `initiative_sources` se construirá solo con esas coincidencias
  comprobables, indicando el método (`url_exact`). **Aprobado en revisión:
  los enlaces de Fuente 1 y Fuente 2 se conservan y se muestran en la ficha
  aunque no encuentren coincidencia en el catálogo; la ausencia de relación
  catalogada no hace desaparecer la fuente.**
- **A7 · Direcciones compartidas:** 18 direcciones usadas por 39 registros.
  Se mantiene un registro por iniciativa, misma coordenada y selector de
  lista al pulsar el punto, sin desplazar coordenadas.
- **A8 · Webs HTTP:** 252 webs son `http://` y 856 `https://`. En la app
  HTTPS, las HTTP solo tendrán apertura externa (visor, §7 del encargo).
- **A9 · Notas que citan hojas/versiones ausentes** («ver hoja Resueltos
  v27/v28/v32», correcciones v7/v13…): se conservan como texto de la fuente,
  sin inventar el contenido referido.
- **A10 · Nota de España en Países desactualizada** (el texto cierra en 248
  y la fila ya declara 296): se importa tal cual; manda el conteo real.

## 4. Normalización definida (original siempre conservado)

Cada campo guarda `valor original` + `valor normalizado`. La normalización
se aplica **por campo y por valor completo**: nunca una sustitución global
de texto ni la eliminación de fragmentos de direcciones. Marcadores de
ausencia —solo donde significan ausencia en ese campo y como valor
completo—: «No localizado», «No localizada», «No consta», «NL», vacío →
normalizado `null`, original intacto.

- **Destinatarios (desde Sexo), mapeo conservador por prefijo:**
  Femenino* → `femenino` (474) · Masculino* → `masculino` (391) ·
  Mixto* / «Hombres y mujeres…» → **«Mixto / programas separados»**
  `mixto_programas_separados` (145) — la etiqueta no sugiere que todos sus
  centros ofrezcan actividades conjuntas · «No consta» → `no_consta` (369)
  · «No aplicable» → `no_aplicable` (3). Total 1.382. El filtro usa el
  grupo; la ficha muestra el texto original.
- **Estado de verificación:** se conservan los 5 valores tal cual, incluido
  el «Confirmado» de PR-06 como valor propio (ver D1). «Confirmado con datos
  parciales» nunca se presenta como «sin vinculación confirmada».
- **Estado de actividad normalizado:** Activo 1.367 · Cerrado (las 4 variantes
  con fecha/motivo en el original) 10 · Pendiente de confirmar 2 ·
  Trasladado (pendiente de confirmar) 1 · **No determinado 2 (PA-03, PA-04)**.
- **Búsqueda:** minúsculas, sin acentos, sobre nombre, localidad, región y
  entidad titular; el original no se altera.
- **Fechas de consulta:** 2026-11-08 (278), 09 (798), 10 (156), 11 (150).
  Son fechas de consulta, no de fundación: no habrá cronología de expansión.

Cobertura de campos útiles (con valor): Localidad 1.377 (99,6 %) · Dirección
1.264 (91,5 %) · Región 1.046 · Web 1.108 · Teléfono 1.047 · Código postal 891 ·
Entidad titular 877 · Email 736.

## 5. Información geográfica disponible (antes de resolver ubicaciones)

Sin lat/lng en el origen. Se distinguen dos cosas que no deben mezclarse:
**la información geográfica disponible en el archivo** (esta tabla) y **la
precisión de la coordenada finalmente obtenida** (`address | locality |
region | country | unknown`, §6). Tener un nombre de localidad no garantiza
una coincidencia inequívoca.

Grupos sin solape (corregidos en la revisión de Fase 1):

| Información disponible | Registros |
|---|---|
| Dirección y localidad | 1.264 |
| Localidad sin dirección | 113 |
| Región sin localidad: ES-153 y ES-154 (Cataluña) | 2 |
| Solo país: SK-04, ES-218 y ES-219 | 3 |
| **Total** | **1.382** |

Hay **725 nombres distintos de localidad** y **726 combinaciones de
país + localidad**. La clave de búsqueda y de caché debe incluir **país,
región cuando exista y localidad**. Los tres registros «solo país» tienen
país conocido, aunque no coordenadas de institución: irán a lista y
recuentos, sin punto de institución; el país solo alimentará, si hace
falta, una agrupación identificada como «Solo país conocido».

## 6. Resolución de ubicaciones — estrategia aprobada (D3), sin cobertura garantizada

- Se ejecuta solo en `tools/data` (Python, openpyxl + httpx), con **caché
  persistente** cuya clave incluye país, región cuando exista y localidad
  (o la dirección completa en su caso), y **archivo de correcciones
  manuales por ID** que una reimportación nunca sobrescribe; si cambia la
  dirección de origen, la resolución anterior pasa a
  `reviewStatus = needs_review`.
- Orden: dirección+localidad (restringido al país) → localidad+región →
  región → país (solo agregado).
- **Aceptación de coincidencias:** se contrasta país, nombre o alias y la
  región disponible. Las **ambiguas quedan pendientes**: no se elige
  automáticamente el primer resultado ni la ciudad más poblada.
- **No se usará el Nominatim público para geocodificación masiva** (su
  política lo limita). Interfaz de proveedor configurable por entorno.
- **Vía inicial aprobada:** extracto **local descargado de GeoNames**,
  con su atribución (datos GeoNames bajo CC BY), conservando el
  **identificador geográfico (geonameId)** de cada coincidencia aceptada.
  GeoNames permite trabajar con extractos descargados, pero **no garantiza
  exactitud ni cobertura completa**: por eso los registros con localidad
  son **candidatos a resolución por localidad**, no resoluciones seguras.
  Su punto se presenta como **punto representativo de la localidad** y la
  precisión `locality` se etiqueta «Ubicación aproximada» — no se le llama
  «centroide» si el dataset proporciona simplemente un punto
  representativo. La precisión `address` queda pendiente de proveedor.
- Se guardan `latitude, longitude, precision, geocodingProvider,
  geocodedAt, queryUsed, reviewStatus` y la calidad/identificador que
  proporcione el servicio, sin puntuaciones inventadas.

## 7. Mapa base y Three.js — decisión aprobada (D4, con dependencia)

- **Mapa base preferente:** CARTO Basemaps (variante oscura). **Dependencia
  adicional registrada en revisión: la documentación actual de CARTO exige
  una API key y establece límites de uso.** No se presupone que una URL
  histórica sin clave funcione. La clave destinada al navegador deberá
  llevar **restricciones de dominio** y se mantendrá la atribución
  © OpenStreetMap contributors © CARTO. Configuración intercambiable por
  `MAP_STYLE_URL`. Sin teselas demo como dependencia definitiva y sin
  descarga masiva.
- **Si la clave CARTO no está disponible:** la Fase 2 continúa con una
  **base local de países de Natural Earth**, estilizada en oscuro y
  claramente limitada al detalle que contiene — no se inventa detalle de
  calles —, sustituible por CARTO mediante configuración.
- **Encuadres de país:** límites desde Natural Earth, guardados como
  bbox/polígono en `countries` — nunca promedios de puntos; con tratamiento
  de antimeridiano e islas. Hay que comprobar la correspondencia de los 70
  códigos del directorio en las capas de Natural Earth (dispone de
  distintas capas administrativas y representaciones para territorios
  pequeños), especialmente **Hong Kong, Macao, Puerto Rico y Taiwán**, y
  elegir unidad territorial y escala que los conserven.
- **Three.js:** un solo mapa MapLibre y una sola cámara; capa personalizada
  según el ejemplo oficial de integración MapLibre + Three.js, solo para el
  **marcador 3D de la iniciativa seleccionada**. Puntos, clusters y etiquetas
  con capas nativas. La compatibilidad proyección/cámara/capa 3D se valida
  con un spike al inicio de la Fase 2, antes de construir sobre ella.

## 8. Esquema mínimo (PostgreSQL, sin PostGIS)

- `initiatives` — ID del Excel como PK estable; campos normalizados,
  originales, ubicación y procedencia (`import_run_id`).
- `countries` — código PK, nombre, continente, circunscripción, evidencia
  de presencia, fuente principal, nota, conteos declarados (contraste) y
  geometría/bbox de encuadre.
- `sources` — ID de fuente PK, dominio, título, URL, país, naturaleza,
  fecha de consulta y notas de la columna 8.
- `initiative_sources` — (initiative_id, source_id, rol [fuente_1|fuente_2],
  método de relación). Solo coincidencias comprobables.
- `import_runs` — hash/versión del archivo, fecha, resumen
  (altas/cambios/ausentes sin borrado silencioso) y conteos de precisión
  geográfica. Reimportar el mismo archivo no duplica (upsert por ID en
  una transacción).

## 9. Servidor y dependencias externas (estado conocido, a reverificar en Fase 6)

Información aportada por una auditoría anterior del 10-nov-2026
(**pendiente de reverificación, no un hecho establecido para este
proyecto**): Oracle `iadelveloper-server`, Ubuntu 24.04, ARM64 (aarch64),
Docker en uso, PostgreSQL solo dentro de contenedores, proxy HTTPS nginx
en `jpecina.duckdns.org`.

**D7 provisional — NO está aprobado crear otro PostgreSQL.** En la Fase 6
se comprobará primero si procede utilizar **una base y un usuario propios
dentro del PostgreSQL existente**; solo entonces se decidirá si hace falta
otro contenedor. La **ruta base de la aplicación será configurable**: si se
despliega en subruta, frontend, API, recursos y alcance del service worker
deberán funcionar bajo ella.

**Falta / a decidir:** credencial de geocodificación a nivel dirección
(ninguna disponible hoy); **clave CARTO si se usa su mapa base** (§7);
ruta pública definitiva en el proxy.
Sin coste contratado: nada se contrata en esta fase.

## 10. Decisiones — estado tras la revisión de Codex (2026-11-11)

- **D1 · APROBADA.** Estados originales; «Confirmado» de PR-06 se mantiene
  como estado propio. El total correcto es 1.382; el desglose de estados
  de Países suma 1.381 porque no contempla ese valor. Fuente 1/2 se
  conservan en la ficha aunque no haya coincidencia catalogada (A6).
- **D2 · APROBADA con corrección aritmética.** Normalización de «NL» por
  campo y por valor completo, sin sustituciones globales. Grupos de
  destinatarios confirmados (474 / 391 / 145 / 369 / 3) y A4 corregida
  (1.295 / 1.298 / 84). Tercer grupo: «Mixto / programas separados».
- **D3 · APROBADA como estrategia inicial, sin garantizar cobertura.**
  Candidatos a resolución por localidad con extracto local de GeoNames
  (atribución, geonameId conservado, punto representativo, ambiguas
  pendientes). Precisión `address` pendiente de proveedor y clave.
- **D4 · APROBADA con dependencia adicional.** CARTO requiere API key con
  límites y restricción de dominio; sin clave, base local de Natural
  Earth en oscuro. Natural Earth también para límites y encuadres, con
  correspondencia de los 70 códigos por comprobar (HK, MO, PR, TW).
- **D5 · APROBADA.** Validar Three.js al principio de la Fase 2 con una
  coordenada real validada; si falla, marcador nativo provisional y
  problema documentado, sin ampliar la arquitectura.
- **D6 · APROBADA.** Recuentos siempre desde Directorio; Países solo como
  contraste de importación.
- **D7 · PROVISIONAL.** Nombre de repo válido (`atlas-iniciativas-opus-dei`).
  No aprobado crear otro PostgreSQL: en Fase 6 se evaluará primero base y
  usuario propios en el PostgreSQL existente. Ruta base configurable.
  Datos del servidor = auditoría anterior pendiente de reverificar.

## 11. Cómo comprobar esta fase

Reejecutar la inspección: leer el xlsx con openpyxl, contar filas con datos,
IDs únicos, categorías, sumas de Países y coincidencias de URL
Directorio↔Fuentes. Todas las cifras de este informe salen de esa pasada
del 2026-11-11 sobre el archivo citado, sin modificar el original.
