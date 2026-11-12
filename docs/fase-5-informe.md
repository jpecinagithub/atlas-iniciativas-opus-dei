# Fase 5 — PWA y acabado

Entregada para revisión el 2026-11-12, tras la certificación de la
Fase 4. La fase cierra la experiencia: etiquetas de texto en el mapa
con glifos propios, la app instalable y usable sin conexión, y el
chunk cartográfico reducido separando lo que no todos necesitan.

## 1. Etiquetas en el mapa, con glifos autoalojados

MapLibre no dibuja texto sin glifos SDF servidos por rangos Unicode,
y depender de un servidor de glifos externo contradecía la línea del
proyecto. Los glifos se **generan en casa**: `tools/fonts/build_glyphs.mjs`
rasteriza Noto Sans Regular (licencia OFL 1.1; la fuente queda en
`tools/fonts/`) en un Chromium administrado por Playwright, a 24 px
como hace fontnik, y convierte cada glifo en su campo de distancia con
signo (radio 8, borde en 0,75). Salen cuatro rangos (0-255, 256-511,
512-767 y 8192-8447: latín completo y puntuación general) servidos
desde la propia app en `public/glyphs/`, unos 400 KB en total.

Con texto disponible, el mapa gana tres capas:

- **Nombres de país** en español, un punto por país del directorio
  calculado del mayor polígono de su geometría (`tools/data/
  build_labels.py`): sobre los polígonos, MapLibre repetiría «España»
  en Canarias y Baleares. Visibles hasta el zoom 6,5.
- **Conteo dentro de cada agrupación** (`point_count_abbreviated`):
  hasta ahora los círculos no podían decir cuántos puntos llevaban.
- **Nombre de la localidad** bajo cada punto a partir del zoom 5.

Revisado visualmente: las etiquetas se leen nítidas en el globo y en
el encuadre de España, ceden por colisión ante las agrupaciones, y no
hay caracteres ausentes en los nombres de los 70 países.

## 2. PWA: instalable y con caché sin conexión

Manifiesto completo (nombre, descripción, idioma español, iconos
192/512 y maskable generados con `tools/build_icons.py`: el globo
dorado de la casa sobre azul noche) y service worker con actualización
automática. La primera versión se construyó con vite-plugin-pwa; la
corrección del §9 lo sustituyó por un service worker propio, sin
cambiar el comportamiento:

- **Precarga solo la carcasa** (HTML, JS, CSS, iconos y el worker de
  MapLibre): 17 ficheros, ~2,4 MB. El geojson de países (3,7 MB) no
  se precarga.
- **Caché de ejecución**: datos estáticos (`/data/*.geojson|json`)
  con StaleWhileRevalidate, glifos con CacheFirst, y respuestas de la
  **API con NetworkFirst** (4 s de espera y caída a la última copia):
  sin conexión, la app abre y muestra lo último consultado, y si un
  dato nunca se pidió, la interfaz lo dice como hasta ahora.

## 3. El chunk cartográfico, reducido un tercio

La limitación aceptada en la Fase 2 queda cerrada en lo razonable:

- **Three.js sale del chunk del mapa**: la capa del marcador se carga
  bajo demanda en su propio chunk (529 KB) la primera vez que hay una
  selección con ubicación; mientras llega, el halo nativo cubre la
  selección, como ya hacía cuando la capa 3D fallaba.
- El chunk del mapa pasa de **1.612 KB a 1.083 KB** (gzip 430 → 297 KB).
  Lo que queda es MapLibre GL, el motor del mapa: no hay más recorte
  honesto sin cambiar de motor.

## 4. Acabado

Favicon vectorial propio (el globo de los iconos, antes un círculo en
línea de datos), `theme-color`, icono de Apple, y los textos de Método
y del pie actualizados: glifos propios y PWA declarados donde se
explica cómo está hecha la app.

## 5. Verificación ejecutada

- **Recorrido oficial ampliado: 41/41 PASS** (versión corregida, §7),
  con API 13/13 e integridad OK. Las nuevas: estilo con glifos
  autoalojados y las tres capas de texto presentes; manifiesto enlazado
  con nombre e iconos; service worker activo; **sin conexión (modo
  offline del navegador), la carcasa sigue cargando**; y las de la
  corrección del §7.
- La prueba offline deja una huella honesta en la consola (el intento
  de red de la API): el recorrido la clasifica como esperada **solo**
  durante esa prueba deliberada, con el mismo patrón de contexto que
  la clasificación del visor; fuera de ella sigue siendo un fallo.
- Capturas regeneradas (12 de 13 cambian: etiquetas y conteos se ven
  en el globo, en España y en el móvil) y revisadas visualmente.

## 7. Corrección tras la primera revisión

La revisión encontró un bloqueo real y dos cierres pendientes; los
tres están corregidos y una cuarta cosa apareció por el camino:

- **Las etiquetas de localidad no podían mostrar nada**: el GeoJSON
  de puntos no llevaba la propiedad `locality` que la capa pide.
  Añadida a las propiedades de cada punto. Y la prueba ya no se fía de
  que la capa exista: vuela a Madrid a zoom 14 (por encima del zoom de
  agrupación, donde los puntos son individuales; dentro de un cluster
  la propiedad no existe) y comprueba en la fuente y en lo renderizado
  (`querySourceFeatures` / `queryRenderedFeatures`) que «Madrid» está
  y se dibuja.
- **La licencia de la fuente no estaba en el repo**: la afirmación
  «licencia OFL» ahora se cumple con `tools/fonts/OFL.txt`, el texto
  oficial de Noto (SIL Open Font License 1.1).
- **La prueba offline solo acreditaba la carcasa**: ahora reproduce el
  flujo real de una PWA — la caché de ejecución se puebla en una
  visita ya controlada por el service worker — y, sin conexión,
  comprueba también los datos cacheados (los contadores con las
  **1.382 iniciativas**). Matiz honesto: lo de «abre con lo último
  consultado» vale **desde la segunda visita**, que es cuando la caché
  existe.
- **Hallazgo al endurecer esa prueba**: el worker de MapLibre es un
  fichero `.mjs` y el patrón de precarga solo cubría `.js`: sin
  conexión, el mapa no podía arrancar su motor. Incluido en la
  precarga (17 ficheros, ~2,4 MB).

## 9. Segunda corrección: fuera la cadena con vulnerabilidades

La recertificación desde un clon limpio encontró que `npm ci` dejaba
**6 vulnerabilidades** (2 low, 4 moderate) procedentes de la cadena de
construcción de la PWA: vite-plugin-pwa → workbox-build → glob /
minimatch / deepmerge. Comprobado aviso a aviso (OSV), no había
arreglo compatible: deepmerge 4.3.1 está afectado **sin versión
corregida** (el proyecto está sin mantenimiento), y los fixes de
minimatch y glob exigen saltos de versión mayor (11 y 14) que
workbox-build no admite. Forzarlos con overrides era exactamente el
«audit fix a ciegas» desaconsejado.

**Solución: eliminar la cadena.** La funcionalidad que Workbox
aportaba es pequeña y ahora es código propio, sin dependencias:

- `apps/web/public/manifest.webmanifest`: el manifiesto como fichero
  estático, enlazado desde el HTML.
- Un **plugin local de Vite** en `vite.config.ts` genera `sw.js` en la
  compilación: precarga de la carcasa con la lista real de assets
  emitidos (incluido el worker `.mjs` de MapLibre) y versión por
  huella del contenido; al activar, borra las carcasas antiguas.
- El service worker propio replica las estrategias acreditadas:
  navegación con caída a la carcasa, **API NetworkFirst**, datos
  estáticos StaleWhileRevalidate y glifos CacheFirst. El registro se
  hace en `main.tsx`, solo en producción.

Dos notas de la depuración, por si sirven fuera de aquí: las
respuestas de este entorno llevan `Vary: Origin`, y las peticiones de
módulos/estilos del navegador llevan cabecera `Origin` mientras que
las de `cache.addAll()` no — sin `ignoreVary` en las consultas a la
caché, los assets precargados «no existían» para el HTML aunque la
caché estaba llena (un `fetch()` desde la página sí los veía, porque
no manda `Origin`). Todas las consultas del SW usan ahora
`ignoreSearch + ignoreVary`: son ficheros con huella en el nombre,
inmutables, así que es seguro.

**Batería desde limpio** (la receta de la revisión): `npm ci` →
auditoría por OSV sobre los 297 paquetes únicos del lockfile: **0
avisos** (la cadena eliminada se llevaba ~270 paquetes). Build con el
worker en la precarga; integridad OK; API 13/13; **recorrido 41/41**.

**Tercera corrección (la huella, a petición de la revisión).** La
primera versión del plugin calculaba VERSION con nombre:tamaño, y
para los ficheros de `public/` usaba por error la longitud del
*nombre*: un recurso cambiado conservando ruta y tamaño habría
dejado `sw.js` idéntico y el navegador no habría actualizado nunca.
Ahora VERSION es **SHA-256 sobre los bytes reales** de cada recurso
precargado (del bundle o leídos de `public/`), y el plugin corre con
`enforce: 'post'` para que el `index.html` emitido ya esté en el
bundle al calcular la huella. Queda acreditado por una prueba
reproducible nueva, **`npm run test:sw`**: modifica `favicon.svg`
cambiando un carácter por otro (mismo tamaño) y exige que VERSION
cambie; lo restaura byte a byte y exige que VERSION vuelva a la
original (determinismo). Resultado: 3/3 PASS, y la batería completa
se repitió tras el cambio con los mismos resultados (auditoría
limpia, integridad OK, API 13/13, recorrido 41/41; la precarga
incluye el worker `.mjs` y excluye el GeoJSON, que va por la ruta de
ejecución).

## 10. Límites y notas

- La caché sin conexión guarda lo ya consultado en ese navegador; no
  convierte la app en una copia completa sin haberla usado antes.
- Los glifos cubren el latín y la puntuación general; un carácter
  fuera de esos rangos (cirílico, CJK) no se etiquetaría. Los nombres
  del directorio son latinos.
- Queda la Fase 6: despliegue en Oracle y la decisión D7.
