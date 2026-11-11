# Atlas de iniciativas · Opus Dei — Fase 2: Primera experiencia visual

Fecha: 2026-11-11 · Base: Excel v14 · Previa: Fase 1 revisada (D1–D6
aprobadas con correcciones; D7 provisional). Las correcciones de la
revisión están aplicadas en `docs/fase-1-informe.md` (A4: 1.295 / 1.298 /
84; geografía sin solapes 1.264 + 113 + 2 + 3; grupo «Mixto / programas
separados»; CARTO requiere clave; «candidatos a resolución por localidad»).

## 1. Qué se ha construido

Monorepo mínimo (npm workspaces) con `apps/web` (React 19 + TypeScript +
Vite + Tailwind, MapLibre GL 5, Three.js, Zustand) y `tools/data`
(Python). PostgreSQL/API quedan para la Fase 3: el catálogo es un JSON
generado del Excel real (3,0 MB, con todos los campos originales y
normalizados), como autoriza la revisión.

- **Mapa oscuro protagonista** con vista de globo (MapLibre), sin clave
  CARTO: base local de países de Natural Earth 50m estilizada en oscuro +
  reticulado discreto. Claramente limitada a detalle de países — al
  acercar a una ciudad no hay calles — y sustituible por CARTO vía
  configuración cuando exista la clave.
- **Filtros:** los 70 países/territorios (selección única con buscador y
  encuadre automático desde los límites de Natural Earth, con vistas
  documentadas para RU, US, NZ, FR, ES, PT, CL y EC por antimeridiano o
  territorios dispersos) y las **14 categorías** en selección múltiple
  (OR entre categorías, AND con país y con la búsqueda de texto).
- **Lista y contadores sincronizados** desde un único conjunto de
  resultados (iniciativas que coinciden, países representados, registros
  con ubicación), incluidos los registros sin coordenadas, que llevan el
  distintivo «sin punto» y cuya ficha explica por qué no se dibujan.
- **Ficha básica:** nombre, categoría, lugar y dirección disponible,
  precisión geográfica con su explicación, destinatarios con el texto
  original, estado de verificación y de actividad diferenciados, entidad
  titular, tipo de vinculación, contacto publicado, fecha de consulta y
  enlaces de Fuente 1 y Fuente 2 **conservados aunque no tengan
  coincidencia en el catálogo** (D1). Si varias iniciativas comparten el
  punto de la localidad, la ficha las lista («En esta misma localidad»)
  aclarando que comparten punto representativo, no dirección.
- **Clic en un país del mapa** aplica su filtro; clic en una agrupación
  acerca; clic en un punto abre la misma ficha que la lista. La búsqueda
  no mueve la cámara; hay acción «Ver resultados en el mapa». Filtros y
  selección viven en la URL (`?pais=&categorias=&q=&sel=`).
- **Móvil:** mapa principal, contadores flotantes y panel inferior con
  tres alturas y pestañas Resultados / Filtros / Ficha. Controles ≥ 44 px.
- **Estados** de carga, de error (con reintento) y de ausencia de
  resultados. Ruta base configurable (`VITE_BASE_PATH`).

## 2. Ubicaciones resueltas, ambiguas y pendientes

Resolución solo en el pipeline, con extracto local de GeoNames (CC BY
4.0) y reglas conservadoras (coincidencia exacta en el país; desambiguación
por región; ambigua ⇒ sin punto; nunca la más poblada):

| Resultado | Registros |
|---|---|
| Resueltas, precisión `locality` (punto representativo, con geonameId) | **942** |
| — de ellas, en segunda pasada con el extracto completo por país | 29 |
| Ambiguas (varias candidatas sin desambiguación; sin coordenada) | **79** |
| Sin coincidencia en los extractos (sin coordenada) | **356** |
| Sin localidad en origen (ES-153/154 solo región; SK-04, ES-218 y ES-219 solo país) | **5** |
| **Total** | **1.382** |

Los 440 sin punto siguen en lista y recuentos. Detalle por grupos en
`data/generated/geocoding-report.md`. Causa principal de los «sin
coincidencia»: el campo Localidad trae a veces textos compuestos
(barrio/ciudad, ciudad + provincia) que no coinciden exactamente con
ningún topónimo; no se ha aplicado ninguna heurística de recorte.
Correspondencia Natural Earth: **70/70 códigos** (Francia y Noruega con
ISO_A2=-99 en el dataset, correspondidos por ADM0_A3, documentado).

## 3. Three.js — validación previa (D5)

Capa personalizada según el ejemplo oficial MapLibre + Three.js, con la
matriz de modelo mercator y la de globo según `projectionTransition`, un
solo mapa y una sola cámara (la de MapLibre), y **un único objeto**: el
pin del seleccionado (anillo + cono + esfera, en el color de su categoría,
con tamaño aparente compensado por zoom/latitud). Probado con una
coordenada real validada (Colegio Tajamar, ES-06, Madrid — GeoNames
3117735):

- ✅ Anclado al acercar (zoom 7) y en vista inclinada (pitch 58°), donde
  se aprecia su forma 3D — capturas 05 y 05b.
- ✅ Giro del globo: en la vista antípoda el marcador queda **oculto tras
  el globo** — captura 06.
- ✅ Cambio de selección (Tajamar → Senara) sin perder el marcador.
- ✅ Recursos liberados en `onRemove` (geometrías, materiales, renderer).
- ✅ Redimensionado: el mismo mapa se comporta en ventana de escritorio y
  en viewport móvil (390 px) — capturas 07–09.
- Respaldo: si la capa 3D fallara al añadirse, queda el marcador nativo
  (halo blanco sobre el punto), registrado en consola.

## 4. Recorrido funcional — 15/15 PASS

`node tests/functional-route.mjs` (Playwright, contra la build de
producción): Mundo (1.382 · 70 · 942) → España (296 · 272 con punto) →
Colegios (108 · 104) → ficha de Tajamar (localidad, estados y precisión
visibles) → marcador 3D renderizado y cambio de selección → Restablecer
(1.382) → **Países Bajos: 18 iniciativas, NL intacto, Club De Reusel en la
lista** → **ES-218 Can Viladoms sin coordenadas: cuenta 1 en totales, 0
con ubicación, aparece con distintivo «sin punto» y su ficha lo explica**
→ móvil con panel inferior. Sin errores de página. Compilación y
comprobación de tipos (`tsc --noEmit`) en verde.

Capturas en `docs/screenshots/`: 01 mundo · 02 España · 03 España+Colegios
· 04 ficha · 05 marcador 3D · 05b perfil 3D · 06 antípoda · 07–09 móvil.

## 5. Limitaciones conocidas de esta fase

- Base local sin detalle de calles ni etiquetas de texto en el mapa (las
  etiquetas requieren glifos; llegarán con el estilo CARTO o equivalente).
  Al acercar a una localidad se ven el país, el reticulado y los puntos.
- 356 registros sin coincidencia por textos de localidad compuestos
  (ver §2); cualquier mejora será una regla nueva revisable, no un recorte
  silencioso.
- El paquete del mapa (MapLibre + Three.js, ~1,6 MB) se carga diferido
  como chunk separado; la optimización fina es de la Fase 5.
- El extracto GeoNames de Rusia quedó truncado en la caché local; no
  afecta a los datos actuales (el único registro RU se resolvió en la
  primera pasada), pero habrá que completar la descarga antes de futuras
  segundas pasadas para RU.
- D7 sigue provisional: no se ha creado ningún PostgreSQL; la ruta base
  ya es configurable.

## 5 bis. Correcciones tras la revisión independiente (2026-11-11)

La primera revisión del repositorio público no certificó la fase y señaló
tres bloqueos. Corregidos y reverificados desde una copia limpia:

1. **MapLibre GL JS 5.24.0 → 6.17.0.** La 5.24.0 es vulnerable a
   GHSA-jrc7-96c5-q579 (XSS en `DOM.sanitize()`). La actualización exigió
   una adaptación real: en la v6 el worker va en un módulo aparte que el
   empaquetado no copia junto al chunk, y la build de producción dejaba
   el mapa en blanco (en desarrollo sí funcionaba). Se fija la URL del
   worker emitido por Vite con `setWorkerUrl`. Lo detectó la propia
   comprobación «sin errores de página» del recorrido: el resto de
   contadores pasaba con el lienzo vacío, así que la verificación visual
   de las capturas regeneradas forma parte de esta corrección.
   Auditoría: el endpoint de `npm audit` está bloqueado en el entorno de
   construcción por la política del registro proxy; como contraste
   independiente se consultó OSV (avisos de GitHub) para los 198 paquetes
   del `package-lock.json`: **0 vulnerabilidades**, y la 6.17.0 queda
   fuera del rango afectado del aviso.
2. **Recorrido reproducible desde un clon limpio.** Playwright pasa a ser
   dependencia de desarrollo del repo; el script usa el navegador
   administrado por Playwright, sin rutas absolutas (solo variables de
   entorno opcionales documentadas), y arranca su propio `vite preview`.
   Instrucciones en el README: `npm ci` → `npx playwright install
   chromium` → `npm run test:functional`.
3. **Historial atrás/adelante implementado.** Cambiar de país, de
   conjunto de categorías o de selección crea una entrada (`pushState`);
   escribir en el buscador actualiza la entrada actual (`replaceState`);
   `popstate` reaplica el estado de la URL con su vuelo de cámara. El
   recorrido añade 6 comprobaciones de historial.

Resultado de la reverificación (copia limpia, `npm ci`, tipos y build en
verde): **21/21 PASS**, con capturas de escritorio y móvil regeneradas
bajo MapLibre 6. El chunk cartográfico (1,61 MB) se mantiene como
limitación conocida hasta la Fase 5, como aceptó la revisión.

## 6. Cómo ejecutarlo

Ver `README.md`. En síntesis: `npm install` → `npm run dev` (los JSON de
datos ya están generados en `apps/web/public/data/`); `npm run build` y
`npx vite preview` para la build de producción; `npm run data` regenera
el catálogo desde el Excel.
