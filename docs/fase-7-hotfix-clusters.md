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
