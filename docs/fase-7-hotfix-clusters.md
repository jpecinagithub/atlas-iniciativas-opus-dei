# Hotfix Fase 7 — Clústeres que nunca se desagrupan (P1)

Fecha: 2026-11-12. Alcance: solo interacción del mapa. Sin cambios
de datos, sin dependencias nuevas, **sin desplegar**: queda a la
espera de la revisión de Jon y la certificación de Codex. La
Fase 8A queda en pausa hasta que este hotfix se certifique y se
despliegue.

## El defecto

En `apps/web/src/components/MapView.tsx`, el clic en un clúster
hacía:

```ts
source.getClusterExpansionZoom(clusterId).then((zoom) => {
  map.easeTo({ center, zoom: Math.min(zoom + 0.5, 13) });
});
```

con la fuente configurada con `clusterMaxZoom: 13`. El tope de 13
podía dejar el clúster permanentemente sin desagrupar.

Además, muchas iniciativas comparten **exactamente** la coordenada
representativa de su localidad (la precisión del directorio es de
localidad; no es un error de datos). Esos grupos jamás se separan
por zoom: a cualquier nivel siguen siendo un único punto visual, y
el clic solo elegía —o ni eso— sin ofrecer acceso a cada ficha.
No se ha inventado ninguna posición ni se ha modificado ninguna
coordenada almacenada.

## La solución

### 1. Expansión sin tope (clústeres con coordenadas distintas)

El clic en un clúster ahora obtiene a la vez el zoom de expansión
(`getClusterExpansionZoom`) y las hojas (`getClusterLeaves`). Si
no todas comparten coordenada, se hace **un solo** `easeTo` a
`max(zoomDeExpansión + 0,5, zoomActual + 0,5)`: se permite superar
`clusterMaxZoom` cuando hace falta y el incremento mínimo de 0,5
garantiza progreso siempre. Desaparece el `Math.min(…, 13)`.

### 2. Detección de coincidentes y spiderfy

Si **todas** las hojas del clúster comparten la misma coordenada
exacta (comparada sobre los registros del catálogo, no sobre la
geometría del tile), no se hace zoom: se abre el grupo
coincidente.

El mismo tratamiento recibe el clic en la capa `puntos` (zoom
manual, cuando la fuente ya no agrupa): se cuentan las
iniciativas **filtradas** en esa coordenada exacta; si hay más de
una se abre el grupo, y si hay una sola se abre su ficha como
antes. Nunca se elige arbitrariamente la primera.

El despliegue (spiderfy) es exclusivamente visual y temporal:

- Dos fuentes GeoJSON propias y temporales: `desplegados`
  (puntos) y `desplegados-lineas` (línea fina de cada punto
  desplazado al ancla), con capas `desplegados`,
  `desplegados-lineas` y `desplegados-nombres` (nombre junto a
  cada punto), pintadas con la paleta de categorías de
  `apps/web/src/categories.ts`.
- Los puntos se distribuyen en un círculo **en píxeles**
  alrededor del ancla (`map.project`/`map.unproject`), con radio
  adaptado al número de iniciativas: `r = 34 + 3·N` px, con tope
  de 96 px (con 24 iniciativas —el máximo real del directorio—
  la separación entre vecinos sigue siendo ≈25 px). Con 2
  iniciativas el despliegue es horizontal, una a cada lado.
- Ningún desplazamiento se guarda: las coordenadas reales de los
  registros no se tocan, y al elegir una iniciativa el marcador
  de seleccionado se dibuja en su coordenada real, como siempre.

### 3. Selector de coincidentes

Nuevo componente `apps/web/src/components/CoincidentSelector.tsx`,
alimentado por un estado transitorio de la store
(`coincident: { anchor, ids, locality } | null`, con
`openCoincident`/`closeCoincident`):

- Título «N iniciativas en <localidad>» (p. ej. «2 iniciativas
  en Las Palmas de Gran Canaria») y una tarjeta por iniciativa
  con nombre, categoría, localidad y acción «Abrir ficha».
  Cada elemento es un botón independiente; también lo son los
  puntos del spiderfy en el mapa (hit-test prioritario).
- Al elegir: se abre la ficha normal (`select` de la store),
  `sel` se actualiza en la URL y el selector/spiderfy se cierran.
- Presentación: un único elemento con clases responsivas — en
  escritorio, tarjeta flotante a la derecha (el lugar de la
  ficha); en móvil, hoja inferior a todo lo ancho.

### 4. Hit-test unificado

Los tres manejadores por capa (clusters/puntos/países) se han
sustituido por **un solo** manejador de clic con
`queryRenderedFeatures` y prioridades deterministas:
`desplegados` > `clusters` > `puntos` > `paises-relleno`. Si el
clic no cae en ningún elemento interactivo, actúa como «clic
fuera»: cierra el selector si estaba abierto (y selecciona el
país, como antes).

### 5. Cierres del spiderfy/selector

Se cierra al: elegir una iniciativa, pulsar fuera en el mapa,
pulsar Escape, cambiar filtros (categorías o buscador), cambiar
de país, restablecer, navegar atrás/adelante (popstate), y al
**mover o alejar significativamente el mapa**. Umbrales del
movimiento, medidos desde la posición en que se abrió (la
referencia no se rearma con movimientos menores, para que la
deriva acumulada también cuente):

- |Δzoom| ≥ 0,5, o
- desplazamiento del ancla en pantalla ≥ 25 % del lado menor
  del lienzo.

Con un movimiento menor, el círculo en píxeles simplemente se
recoloca alrededor del ancla.

Los cambios de filtros/país/búsqueda/selección limpian el estado
en las propias acciones de la store (`setCountry`,
`toggleCategory`, `setCategories`, `setQuery`, `select`,
`reset`, `applyStateFromUrl`), el mismo sitio donde se gestionan
los demás estados de navegación.

### 6. Accesibilidad

- El selector es un `role="dialog"` con
  `aria-label="N iniciativas en esta ubicación"`.
- Recibe el foco al abrir; la lista es navegable por teclado
  (botones nativos, Tab/Enter).
- Escape lo cierra (listener en captura, para no cerrar a la vez
  la ficha) y el foco vuelve al lienzo del mapa (evento interno
  `atlas:focus-map` que escucha MapView; el lienzo es enfocable
  por programa).

## Discrepancia del encargo: Sevilla

El encargo describía «siete iniciativas» en la coordenada de
Sevilla (37.38283, -5.97317). La realidad de los datos v14 es
**dieciséis** iniciativas en esa coordenada exacta (ES-14,
ES-111, ES-112, ES-113, ES-164, ES-169, ES-170, ES-171, ES-172,
ES-208, ES-210, ES-236, ES-237, ES-262, ES-279, ES-291). Las
pruebas afirman la realidad («16 iniciativas en Sevilla») y este
informe deja constancia de la discrepancia. (Existen grupos de
exactamente 7 en Zagreb, Tegucigalpa y Zúrich; no se han usado
porque el caso pedido era Sevilla.) El máximo del directorio es
24 iniciativas en una coordenada (Roma) y Madrid tiene 21: el
radio adaptativo y la lista desplazable del selector cubren esa
escala.

## Pruebas

La batería (`tests/functional-route.mjs`) conserva las 53
comprobaciones anteriores y añade 15 dirigidas (68 en total):

**Escritorio — bloque «Hotfix clústeres» (13):**

1. Las Palmas abre el selector «2 iniciativas en Las Palmas de
   Gran Canaria» (España + Asociaciones juveniles, clic real en
   el píxel del clúster proyectado con `map.project`).
2. El selector lista Club Guayre y Asociación Gara.
3. El spiderfy despliega 2 puntos temporales con sus líneas al
   ancla (fuentes `desplegados`/`desplegados-lineas`,
   deduplicadas por id: `querySourceFeatures` devuelve un
   feature por tile cargado).
4. El selector recibe el foco al abrir.
5. Club Guayre abre su ficha desde el selector (`sel=ES-199`) y
   el selector se cierra.
6. El punto desplegado de Asociación Gara abre su ficha
   (`sel=ES-200`).
7. **Anti-bucle**: dos clics consecutivos sobre el mismo
   clúster no dejan el mismo centro, zoom y contenido: tras el
   primero el selector está abierto (antes no lo estaba) y tras
   el segundo sigue abierto, no el mismo «2» sin más.
8. Cambiar la categoría cierra el selector y vacía el spiderfy.
9. Sevilla muestra «16 iniciativas en Sevilla» (16 reales, no 7).
10. El selector de Sevilla lista las 16 iniciativas.
11. Escape cierra el selector y el foco vuelve al lienzo del
    mapa.
12. Un clúster con coordenadas distintas (zona de Madrid, 42
    puntos) acerca una sola vez (zoom 5 → 6,5) y se desagrupa:
    ya no queda ningún clúster con el mismo recuento junto al
    ancla.
13. Con zoom manual (15, sin agrupación), el clic sobre los
    puntos coincidentes de Las Palmas abre el selector y no una
    ficha arbitraria (la URL no lleva `sel`).

**Móvil (2):**

14. El selector se presenta en la parte inferior de la pantalla
    (hoja inferior, y > 422 en un viewport de 844).
15. Asociación Gara abre su ficha desde el selector
    (`sel=ES-200`).

Resultado: **68/68 comprobaciones PASS**, sin errores ni
advertencias de consola (las comprobaciones globales de glifos y
de errores de página siguen en verde). `npm run test:sw`:
huella del service worker OK.

## Capturas

- `docs/fase-7b/hotfix-laspalmas-desktop.png` — Las Palmas con
  los dos puntos desplegados (Guayre y Gara separados, con sus
  líneas al ancla) y el selector abierto.
- `docs/fase-7b/hotfix-selector-movil.png` — el selector como
  hoja inferior en móvil.

Generadas con `tests/capture-hotfix.mjs` contra el preview local.

## Ficheros tocados

- `apps/web/src/store.ts` — estado `coincident` y su limpieza en
  las acciones de navegación/filtrado.
- `apps/web/src/components/MapView.tsx` — expansión sin tope,
  detección de coincidentes, fuentes/capas del spiderfy,
  hit-test unificado, cierre por movimiento significativo,
  retorno de foco al lienzo.
- `apps/web/src/components/CoincidentSelector.tsx` — nuevo: el
  selector (escritorio y móvil) accesible por teclado.
- `apps/web/src/App.tsx` — renderiza el selector junto al visor.
- `tests/functional-route.mjs` — 15 comprobaciones dirigidas
  nuevas (53 → 68).
- `tests/capture-hotfix.mjs` — nuevo: capturas de entrega.

**No desplegado.** Pendiente: revisión de Jon y certificación de
Codex. Tras certificar y desplegar este hotfix, se reanuda la
Fase 8A.

## 8. Corrección de legibilidad del selector móvil (2026-11-12)

Jon aprobó la solución funcional en revisión de código y capturas y
pidió una única corrección antes de la certificación: en
`hotfix-selector-movil.png` la hoja y las cifras de la interfaz se
transparentaban a través del selector.

- En móvil (<1024 px) el selector es **opaco**: clase
  `glass-opaque-mobile` en `index.css` — fondo sólido
  `var(--atlas-panel-solid)` (**#0A1120**) y `backdrop-filter: none`,
  con el borde y la sombra del panel. En escritorio se conserva el
  cristal.
- Las tarjetas también son sólidas en móvil (#141F38, hover
  #1A2947); en escritorio conservan el fondo translúcido.
- El spiderfy sigue visible en el mapa libre sobre la hoja
  (verificado en la captura regenerada).
- Comprobación dirigida nueva en la batería: en viewport móvil, el
  fondo computado del selector es `rgb(10, 17, 32)` y el
  `backdrop-filter` es `none`.
- Regenerada **únicamente** `hotfix-selector-movil.png` (la de
  escritorio salió byte a byte idéntica).
- Verificación posterior: build limpio, `test:sw` OK y batería
  **69/69** (los 68 anteriores + la comprobación de opacidad).

**Sin desplegar**: a la espera de la certificación final.

## 9. Despliegue (2026-11-13)

Certificado por Jon el 2026-11-13 tras su comprobación independiente
(producción sin visor, selector opaco verificado, build y test:sw en
su máquina), que autorizó desplegar únicamente el hotfix.

- Desplegado desde `main` (`9018481`): VERSION de producción
  `ba80db8482f2` → **`16f503b787ab`**. Datos v14 intactos, sin
  reimportar.
- Verificación en el camino real, sin errores de consola:
  - Migración de la PWA: un cliente con la versión anterior pasa a
    la nueva sin errores (`verify-public migrate`).
  - Recorrido público completo (`verify-public fresh`): limpio.
  - **Escenario de Las Palmas en producción**: clic en el punto
    compartido → selector «2 iniciativas en Las Palmas de Gran
    Canaria» → Asociación Gara abre su ficha (sel=ES-200).
    Captura: `docs/fase-7b/prod-laspalmas-gara.png`.
- Con esto el defecto P1 queda cerrado en producción. Siguiente
  paso, cuando Jon lo ordene: revisión formal del resultado de la
  Fase 8A ya existente; la Fase 8B sigue sin iniciar.

## 10. Corrección posterior al despliegue: el círculo central (2026-11-13)

Jon, probando el despliegue, señaló que al desplegar un grupo
«aparece un círculo en el centro que tapa todo» y que las etiquetas
se amontonaban sobre el centro (capturas de Las Palmas y de
Santiago de Surco). Corrección aplicada el mismo día:

- Con el grupo abierto, sus iniciativas **salen de la fuente base**
  del mapa: en el ancla ya no se pinta el clúster, ni el punto
  apilado, ni el halo del seleccionado.
- El **marcador 3D** del seleccionado se retira mientras el grupo
  está abierto y vuelve al cerrarlo.
- Las **etiquetas** del spiderfy se anclan **hacia fuera** según el
  lado dominante de cada punto (capas por lado: arriba, abajo,
  izquierda, derecha); ningún nombre cae sobre el centro.
- Un clic en el centro vacío del despliegue ya no atraviesa hasta
  la capa de países (la batería lo detectó como regresión: cerraba
  el selector); el área del despliegue absorbe el clic.
- Dos comprobaciones dirigidas nuevas: ancla libre con el grupo
  abierto y anclajes de etiqueta hacia fuera. Batería: **71/71**,
  build limpio y `test:sw` OK. Capturas del hotfix regeneradas.

## 11. Hotfix 2 — el grupo permanece desplegado al consultar fichas (2026-11-13)

**Diagnóstico (de Jon, verificado por él en producción):** defecto
de interacción. Al seleccionar una iniciativa del grupo coincidente
(su ejemplo: Colegio Turicará, PE-12, en el grupo de Piura con
Colegio Vallesol, PE-13, y Universidad de Piura, PE-01),
`select()` ponía `coincident = null`: el spiderfy se desmontaba,
reaparecía el marcador 3D en la coordenada compartida y
desaparecían los puntos desplegados justo al consultar la ficha.

**Diseño:** se separan los dos estados que estaban unidos —
`coincident` mantiene el grupo y su representación cartográfica;
`coincidentPanelOpen` controla SOLO la lista flotante del
selector. La selección desde un punto desplegado o desde una
tarjeta del selector equivale a
`select(id, { fly: false, preserveCoincident: true })` +
`setCoincidentPanelOpen(false)`, sin tocar la cámara. Cerrar la
ficha de una iniciativa del grupo (`select(null)`) restaura el
selector con el grupo intacto. La seleccionada se distingue con
un anillo ámbar dentro del spiderfy (capa
`desplegados-resaltado`, propiedad `sel` por feature); el
marcador Three.js sigue desactivado mientras exista `coincident`
(incluida la guarda de su carga asíncrona). No se modifica ni se
almacena ninguna coordenada.

**Resize ≠ movimiento:** `map.on('resize')` marca el ajuste como
de layout, rearma la referencia del spiderfy con la nueva
geometría y el `moveend` acompañante se trata como recolocación,
no como gesto del usuario. El repintado por cambio de selección
dentro del grupo conserva la referencia de apertura (misma
identidad de objeto `coincident` ⇒ `keepReference`).

**Escape por etapas:** con la ficha del grupo abierta, el primer
Escape cierra SOLO la ficha (el manejador en captura del selector
está inactivo con la lista oculta) y el selector reaparece; el
segundo Escape cierra el grupo y el foco vuelve al lienzo. Sin
ficha, Escape cierra el grupo como hasta ahora. Se conservan los
cierres por clic fuera (con la guarda del radio), movimiento o
zoom significativo, filtros/país/búsqueda, Restablecer, cierre
explícito e historial (popstate no restaura grupos).

**Cambios por fichero:**
- `apps/web/src/store.ts`: estado `coincidentPanelOpen` y acción
  `setCoincidentPanelOpen`; `select` acepta
  `{ fly, preserveCoincident }` (compatible con el booleano
  anterior); todos los cierres del grupo resetean también el panel.
- `apps/web/src/components/MapView.tsx`: el clic en un punto
  desplegado selecciona con `preserveCoincident`; propiedad `sel`
  en el layout del spiderfy y capa `desplegados-resaltado`;
  manejador `resize` + guarda en `moveend`; el efecto del spiderfy
  se repinta al cambiar la selección conservando la referencia.
- `apps/web/src/components/CoincidentSelector.tsx`: se renderiza
  solo con `coincidentPanelOpen`; foco y Escape activos solo con
  la lista visible; las tarjetas seleccionan con
  `preserveCoincident`.
- `apps/web/src/App.tsx` y `Panels.tsx`: sin cambios (el Escape
  global y el botón «Cerrar ficha» ya llaman a `select(null)`,
  cuya nueva semántica restaura el selector).

**Pruebas (batería `tests/functional-route.mjs`): 91/91.** 22
comprobaciones llevan el prefijo «Hotfix 2» (nuevas o
reformuladas). Reformuladas por el nuevo comportamiento: la de
Club Guayre desde el selector (antes afirmaba que el selector se
cerraba; ahora: lista oculta, grupo desplegado, resaltado, cámara
quieta, sin 3D, Escape por etapas) y la del punto desplegado de
Asociación Gara (idem). Nuevas, sobre el grupo de Piura en
escritorio: apertura «3 iniciativas en Piura», las tres fichas
sucesivas (Turicará desde la tarjeta; Vallesol y Universidad de
Piura desde sus puntos) sin cerrar ni recalcular el grupo, zoom y
centro idénticos, anillo único sobre la seleccionada, marcador 3D
ausente, cierre de ficha con vuelta del selector, historial atrás
que cierra ficha y grupo, y cero advertencias de consola en el
tramo. En móvil: Las Palmas y Piura (pestaña Ficha, selector
oculto, puntos desplegados en el mapa, vuelta de la lista al
cerrar la ficha). Regresión de cierres en verde: categoría,
Restablecer, clic exterior, Escape e historial.

**Ajustes de la batería por la migración de datos (no de
comportamiento):** la batería corre contra el catálogo v15-5 ya
promovido, así que se actualizaron las cifras esperadas del
conjunto anterior (1.382 → 1.411; 70/942 → 69/1.317; España
296 → 299 y 272 → 283 con ubicación; España + Asociaciones
juveniles 60 → 59; Sevilla 16 → 15 tras la baja de ES-236) y el
ejemplo de registro sin coordenadas pasa de ES-218 (resuelto con
punto en el v15-5) a ES-19 (EFA Quintanes).

**Verificación:** build limpio, `test:sw` OK (3/3), batería
completa **91/91** contra PostgreSQL local recuperado e importado
con el v15-5 (la VM había perdido PostgreSQL en un reprovisado;
se reinstaló postgresql-16 y se recrearon rol y base `atlas`).

**Capturas** (cada una de su propio recorrido real):
`docs/fase-7b/hotfix2-piura-ficha-desktop.png` (SHA-256
`0f59eddb…a0783c`) y `docs/fase-7b/hotfix2-piura-ficha-movil.png`
(SHA-256 `1467415a…c9`), generadas con
`tests/capture-hotfix2.mjs`: spiderfy completo con las líneas al
ancla vacía, Turicará con su anillo y su ficha abierta, sin
marcador 3D. En móvil, un ajuste iterativo project/unproject del
script deja el despliegue en la franja visible sobre la hoja.

**Estado: verificado en local. NO desplegado** — pendiente de la
certificación de Jon, como manda la regla de fases.

## 12. Despliegue del hotfix 2 (2026-11-13)

Desplegado por orden expresa de Jon tras su certificación.
Producción servía la VERSION `e87934aab079` (código del hotfix 1,
datos v15-5); el despliegue es solo de código web — ningún dato
cambia (el diff contra el estado desplegado no contiene borrados
de ficheros, solo modificaciones en `store.ts`, `MapView.tsx` y
`CoincidentSelector.tsx`, más tests y docs).

- **VERSION: `e87934aab079` → `5722ebd12b04`** (leída del `sw.js`
  servido en el puerto del servidor tras reconstruir solo el
  servicio web con `docker-compose.prod.yml`; api y base de datos
  no se recrearon).
- **Sondas en el puerto del servidor (127.0.0.1:8180), todas 200:**
  índice, `data/catalog.json` (1.411 iniciativas, 1.317 localizadas,
  SHA del v15-5 `088655db…`), `data/countries.geojson`, glyphs y
  `api/health` con **1.411 / 1.317 / 2.724 / 2.167** — datos
  intactos.
- **Verificación pública** (`tests/verify-public.mjs`, con
  `ATLAS_HEADLINE='1.411 iniciativas'`): `migrate` — el perfil con
  el SW anterior carga, el SW nuevo se activa y, tras recargar,
  sirve la VERSION `5722ebd12b04` con **errores `[]`**; `fresh` —
  perfil nuevo, misma VERSION y conteos exactos, **errores `[]`**.
- **Verificación funcional del hotfix en producción** (Playwright
  contra la URL pública, grupo de Piura): 10/10 comprobaciones —
  selector «3 iniciativas en Piura»; spiderfy con 3 puntos y 3
  líneas (PE-01, PE-12, PE-13); la ficha de Colegio Turicará se
  abre (`sel=PE-12`) y la lista se oculta **sin desmontar el
  grupo** (siguen los 3 puntos y las 3 líneas); Turicará es el
  único resaltado y la capa de anillo renderiza solo PE-12; sin
  marcador 3D en el ancla (`markerVisible=false`) y con la cámara
  inmóvil (zoom 11 → 11, centro idéntico); al cerrar la ficha
  vuelve el selector con el grupo intacto; consola sin errores en
  todo el recorrido.
- **Captura:** `docs/fase-7b/prod-hotfix2-piura-ficha.png`, del
  recorrido real de producción (ficha de Turicará abierta, grupo
  desplegado y anillo visible). Nota de transparencia: el PNG
  resultante es byte-idéntico al de la captura local del §11
  (misma escena determinista: mismo build, mismos datos y un
  fondo cartográfico uniforme en esa zona); la hora de escritura
  del fichero corresponde a la corrida de producción.
