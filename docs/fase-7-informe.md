# Fase 7B — Renovación visual «Exploración inmersiva» (híbrida B + A)

Fecha: 2026-11-12. Estado: **implementada y verificada en local;
NO desplegada.** Producción sigue sirviendo la Fase 6 certificada
(VERSION `3330a057a2dd`). El redespliegue espera la revisión visual
de Jon y la certificación de Codex.

Dirección aprobada: propuesta B (globo protagonista, interfaz
flotante, un único acento ámbar) con el interior editorial de la A
solo en las fichas (jerarquía, secciones numeradas 01/02/03 y
evidencia como contenido editorial).

## 1. Qué se ha hecho, por entregas internas

**7B.1 · Sistema visual y portada mundial.** Tokens en `index.css`
(fondo `#04070D`, panel sólido de respaldo `#0A1120`, línea,
ámbar `#E8A33D` / suave `#F5D9A8`, tinta y atenuado). Clase
`.glass` SOLO para los paneles principales (cifras, país,
explorar, resultados, ficha, método, hoja móvil): desenfoque de
12 px con respaldo sólido si `backdrop-filter` no existe o si el
sistema pide transparencia reducida; botones, chips y tarjetas
son sólidos o casi. Layout nuevo en `App.tsx`: el mapa ocupa
toda la pantalla y todo lo demás flota — identidad discreta
arriba a la izquierda (con miga de pan Mundo / País / Iniciativa
cuando aplica), buscador en píldora centrada (iniciativa,
localidad, región y entidad, como siempre sobre el mismo
conjunto filtrado), acciones Restablecer/Método arriba a la
derecha, tarjeta de cifras abajo a la izquierda (siempre desde
la API), y abajo a la derecha **«Explorar por país →»** como
acción primaria y **«Categorías»** como secundaria. Sin lista de
resultados hasta que se busca o se filtra (comprobado). Pista
sutil de arrastre que desaparece con la primera interacción.

**7B.2 · País, filtros y resultados.** Vuelo Mundo → País de
1,5 s (banda 1,2–1,8). El país seleccionado se dibuja con
relleno ámbar al 7 % y contorno ámbar de 2 px (antes, línea
amarilla). El panel del país es una tarjeta flotante —no una
columna— con país, circunscripción, **Iniciativas / Con
ubicación / Sin punto**, coincidencia con la hoja Países,
estados de verificación, **chips de categoría con conteo que
filtran al pulsarlos**, evidencia de presencia, fuente principal
(visor/pestaña) y nota. Tira inferior plegable de «Primeras
iniciativas» (así se llaman: no existe criterio de «destacadas»
en los datos; es el orden oficial del listado) con acceso «Ver
las N iniciativas». URL e historial: sin cambios de
comportamiento (la batería de historial pasa intacta).

**7B.3 · Iniciativa, documentación, visor y móvil.** Ficha
híbrida: tarjeta inmersiva con el interior de la A — rúbrica de
categoría e ID, título en serif del sistema (Georgia; ninguna
fuente descargada), resumen esencial con la precisión geográfica
explicada en lenguaje llano, **01 La iniciativa**, **02
Ubicación y contacto** (con la explicación explícita de que el
punto es la localidad, no la dirección) y **03 Evidencia y
fuentes** como bloque editorial con las fuentes del directorio
(texto original visible si no hay enlace válido), la evidencia,
la doble comprobación y las fuentes catalogadas con su conteo
en la cabecera del bloque. La documentación **nace desplegada y
puede plegarse**: la decisión la permite plegada, pero es el
rasgo distintivo del Atlas y la batería certificada verifica su
presencia al abrir la ficha. Cierre con botón, **Escape** e
historial atrás; al abrirse, el foco va a la ficha. Visor con la
seguridad intacta (normalización única, solo HTTP/HTTPS,
sandbox, sin proxy, salida a pestaña nueva, aviso de
incrustación imposible) y la nueva piel; en móvil es pantalla
completa. Hoja móvil de **tres posiciones** (19/54/88 dvh): la
colapsada deja ver casi todo el globo y resume en una línea
(«1.382 iniciativas en 70 países» + con ubicación), sin repetir
cabeceras; áreas seguras respetadas; sin desbordamiento
horizontal (comprobado).

**7B.4 · Acabado y verificación.** Sin librerías nuevas (cero
dependencias añadidas); Three.js sigue en su chunk diferido
(529 KB) fuera del inicial (269 KB); el mapa sigue funcionando
con la base local de Natural Earth, sin CARTO. Movimiento:
vuelos 1,5 s / 0,85 s, paneles 200–300 ms, sin animaciones
continuas; con `prefers-reduced-motion` los vuelos son
instantáneos y la app funciona igual (comprobado). Sistema
cromático de categorías: la paleta contenida de la Fase 7A
sustituye a la anterior en mapa, chips, listas y fichas, siempre
con punto + texto.

## 2. Verificación (build local de producción, sin desplegar)

- Recorrido funcional completo: **55/55 PASS** — las 42
  comprobaciones heredadas de las fases certificadas más 13
  dirigidas nuevas (detalle en §5). Glifos: sin fallos (la
  comprobación de la Fase 6 sigue activa). PWA offline: pasa.
- `test:sw`: 3/3. La huella de la nueva compilación local es
  VERSION `30fcfc1e20f6` (solo local; producción no se ha
  tocado).
- Auditoría: el endpoint de `npm audit` está bloqueado en esta
  VM; auditoría equivalente por OSV sobre el lockfile:
  **297 paquetes, 0 vulnerabilidades**.
- Integridad y API: sin cambios en esta fase (la API no se ha
  tocado); el catálogo servido sigue siendo 1.382 / 70 / 942 /
  2.626 / 2.164.

## 3. Capturas

En `docs/fase-7b/`: `despues-mundo.png`, `despues-pais.png`,
`despues-iniciativa.png`, `despues-documentacion.png`,
`despues-visor.png` (opusdei.org sigue sin permitir incrustación:
el visor lo explica y ofrece la pestaña nueva, como estaba
certificado), `despues-movil-mundo.png`,
`despues-movil-resultados.png`, `despues-movil-iniciativa.png`.
El «antes» está en `docs/fase-7a/actual/`. El recorrido además
regeneró las capturas de `docs/screenshots/` con el nuevo diseño.

### Antes / después en una frase por vista
- **Mundo:** de tres columnas con dos inventarios permanentes a
  globo protagonista con buscador flotante, cifras en cristal y
  dos acciones; el panel de exploración nace cerrado y se abre
  desde las dos acciones (país con foco en su buscador, o
  directamente en la sección de categorías).
- **País:** de columna con relleno amarillo a tarjeta flotante
  con cifras del país (incluido «Sin punto»), chips que filtran
  y tira plegable de primeras iniciativas; España se contornea
  en ámbar sobre el mapa a pantalla completa.
- **Iniciativa:** de formulario etiqueta/valor a ficha editorial
  con resumen y secciones 01/02/03; la documentación es un bloque
  con entidad propia y su conteo de fuentes visible.
- **Móvil:** de hoja a media altura que tapaba el globo a hoja
  de tres posiciones cuya posición colapsada es una sola línea.

## 4. Decisiones tomadas dentro del margen dado
- Documentación desplegada por defecto (ver 7B.3).
- Serif de sistema (Georgia) en vez de fuente autoalojada: cero
  peso añadido y el mismo carácter editorial de los mockups.
- Las etiquetas de cifras usan versalitas por `font-variant`
  (no `text-transform`) para que lectores de pantalla y
  comprobaciones lean el texto real.

## 5. Correcciones de la primera revisión de certificación

Codex detuvo la primera certificación de la 7B por composición
visual; las cinco correcciones aplicadas:

1. **El panel de exploración nace cerrado en escritorio.** La
   portada es globo + buscador + cifras + dos acciones; solo
   queda visible la barra de despliegue del panel. «Explorar
   por país» lo abre y enfoca la búsqueda de país; «Categorías»
   lo abre directamente en su sección.
2. **Con una iniciativa abierta solo quedan mapa y ficha** (y la
   miga de pan): exploración, resultados, cifras y acciones se
   retiran; un control compacto «Filtros» permite reabrirlos.
   Al cerrar la ficha se restaura el estado anterior de los
   paneles; selección e historial no se tocan. Matiz necesario:
   escribir en el buscador con la ficha abierta reactiva los
   resultados — es el flujo certificado que salta de una ficha a
   otra buscando (p. ej., de BR-10 a CL-16) — sin perder la
   restauración al cerrar.
3. **Móvil:** al cambiar la iniciativa seleccionada la hoja va a
   la pestaña Ficha, a posición intermedia y con el contenido
   con `scrollTop = 0`: la primera vista muestra categoría,
   nombre, localidad, estados y el comienzo de la sección 01
   (también tras desplazar mucho la lista o venir de otra ficha,
   porque el reinicio se hace en cada cambio de selección).
4. **La marca ya no se recorta.** Causa: el bloque de la marca
   podía encogerse en la fila flexible y la píldora del buscador
   tapaba el texto desbordado, cercenando la última letra de
   «OPUS DEI». La marca es ahora de ancho fijo (no encoge, sin
   salto de línea) y quien cede espacio es el buscador.
   Verificado en 1280×720, 1440×900 y 1920×1080.
5. **Conteos del propio informe corregidos** (eran 42 + 7 = 49
   en la primera entrega, no «más 6»).

Comprobaciones dirigidas añadidas en esta ronda (6): panel
cerrado en la portada, apertura por país con foco, apertura por
categorías, ausencia de panel lateral con la ficha abierta,
marca completa visible en la vista de país y `scrollTop = 0`
de la ficha móvil tras una selección nueva. Total de la
batería: **42 heredadas + 13 dirigidas = 55/55 PASS**. Las
ocho capturas se han regenerado con la composición corregida.

Segunda detención (solo la marca): la cabecera se ha
reestructurado como capa independiente y aislada — el mapa
queda en `main` con `z-0` explícito y la barra superior es una
cuadrícula `max-content minmax(0, 1fr) max-content` con
`z-40` y `isolation: isolate`, con identidad, buscador y
acciones en celdas propias; ya no hay flex que pueda encoger
la marca ni elemento que componga sobre ella. La comprobación
de la marca exige ahora, además de la geometría anterior, que
los rectángulos de identidad, buscador y acciones no se
intersecten. Verificación visual a resolución completa de la
esquina de la marca en mundo, país, iniciativa, documentación
desplazada y Método abierto, a 1280×720, 1440×900 y
1920×1080: «ATLAS DE INICIATIVAS · OPUS DEI» y «Directorio
mundial de iniciativas» completos en todos los casos. Nota de
honestidad: a 1440×900 la geometría resultante es la misma
que ya producía el flex corregido, así que las capturas
regeneradas a ese tamaño salen idénticas byte a byte a las de
la ronda anterior — la corrección es estructural y queda
cubierta por la comprobación de intersecciones y por la
matriz de tamaños/estados, no por un cambio de píxeles a ese
tamaño.

Tercera detención (la marca en mundo e iniciativa): el
diagnóstico medido es que la caja del título medía 281 px
mientras el texto pintado ocupa ~302 px — la medición
intrínseca de Chromium inframida el título con tracking al
calcular el `max-content` de la celda, y el texto desbordaba
su caja hacia la celda del buscador (en esta máquina el
desborde quedaba visible; con métricas de fuente más anchas
queda tapado). Corrección: la primera columna de la
cuadrícula es de **ancho fijo (348 px) en escritorio** — la
caja medida del título pasa a ser exactamente 348 px, con
~46 px de margen sobre el texto — y la cabecera lleva una
**superficie opaca compositada** (degradado sólido
`rgba(4,7,13,0.95 → 0.85 → 0)`) con la identidad en
`position: relative; z-index: 10` dentro de la capa aislada.
Evidencias con el recorte exacto prescrito
(`ffmpeg -vf crop=520:130:0:0`, sin escalado) en
`docs/fase-7b/marca-{mundo,pais,iniciativa,documentacion}-1440.png`:
los cuatro muestran completos «ATLAS DE INICIATIVAS ·
OPUS DEI» y «Directorio mundial de iniciativas», revisados
píxel a píxel. Las capturas completas se regeneraron y esta
vez **sí cambian efectivamente** (mundo `c31ca5f5→fe482978`,
iniciativa `bf24bef3→c298e021`, también país y
documentación), porque el degradado y el desplazamiento del
buscador alteran la franja superior. La prueba geométrica se
mantiene como lo que es —una comprobación de layout—, no
como prueba del resultado en píxeles: la prueba de píxeles
son los recortes `marca-*`.

Cuarta detención (la evidencia de documentación no
correspondía a su captura): la causa estaba en el propio
guión de capturas, que acercaba la sección documental con
`scrollIntoView` — esa llamada desplazaba el viewport y la
captura completa salía corrida, mientras la evidencia de la
ronda anterior se había generado desplazando solo el aside.
Corrección completa: (a) el guión ya no usa `scrollIntoView`
en ningún punto — la documentación se acerca moviendo solo
el `scrollTop` del aside, calculado por diferencia de
posiciones, y cada captura exige antes y después
`scrollX = scrollY = scrollLeft = 0`, fallando si el
viewport se mueve; (b) cada recorte `marca-*` se deriva con
ffmpeg **del mismo fichero** de su captura completa dentro
del propio guión, y el manifiesto
`docs/fase-7b/marca-evidencias.sha256` registra los SHA-256
de los cuatro pares (verificable con `sha256sum -c`); (c)
endurecimiento en la aplicación: la raíz no permite
desplazamiento horizontal (`overflow-x: clip`), la ficha usa
`overscroll-behavior: contain`, y el único `scrollIntoView`
que quedaba en la app (el ancla de «Categorías») se sustituyó
por desplazamiento exclusivo del contenedor de la columna.
Resultado: `despues-documentacion.png` regenerada
(`f70246af→dd023e2e`) con la marca completa y el viewport en
cero; su recorte independiente coincide byte a byte con el
publicado (`ac6421a2`). Que los recortes de iniciativa y
documentación sean idénticos entre sí es ahora lo esperado
y está acreditado: al desplazar solo el aside, la franja de
la cabecera no cambia, y ambos recortes proceden de sus
propios ficheros completos según el manifiesto.

## 6. Pendiente
Revisión visual de Jon y certificación de Codex. Solo después,
redespliegue de la Fase 7B en Oracle con la misma disciplina de
la Fase 6 (verificación por la ruta pública real, perfil nuevo
y heredado). La Fase 8 sigue sin iniciar: espera a que Jon
confirme que el directorio v15 está estable.
