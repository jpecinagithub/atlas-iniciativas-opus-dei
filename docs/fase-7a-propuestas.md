# Fase 7A — Diagnóstico visual y dos propuestas (sin implementar)

Fecha: 2026-11-12. Estado: **entregado para elección de Jon y
revisión de Codex. No se ha tocado código de la aplicación ni se ha
desplegado nada.** Los mockups son composiciones estáticas HTML/CSS
sobre la geografía real del proyecto (Natural Earth, proyección
plana por simplicidad del mockup); la implementación conservaría el
globo de MapLibre. Las cifras y nombres que aparecen son los reales
del directorio v14.

Capturas del estado actual (producción, 2026-11-12):
`actual/actual-espana-desktop.png`, `actual/actual-tajamar-desktop.png`,
`actual/actual-mundo-movil.png`, `actual/actual-resultados-movil.png`
(y la vista mundial ya conocida de las fases anteriores).

## 1. Diagnóstico

### Lo que funciona y se conserva en ambas propuestas
- El modelo de datos y su honestidad: cifras calculadas, «sin
  punto» declarado, evidencia y fuentes en la ficha, texto original
  siempre visible.
- La sincronización mapa/lista/ficha desde un único conjunto, el
  estado en la URL con historial atrás/adelante, la PWA/offline.
- El marcador 3D de selección (discreto y con respaldo), los vuelos
  a país con encuadre real, las etiquetas con glifos propios.
- El visor con sus restricciones de seguridad y su salida a pestaña
  nueva.

### Por qué hoy parece un panel administrativo
1. **La primera pantalla es una lista, no un atlas.** La columna
   izquierda (330 px) muestra siempre los 70 países y las 14
   categorías desplegadas: el ojo cae en dos inventarios antes que
   en el mapa, que queda reducido a ~60 % del ancho y con el globo
   pequeño.
2. **Tres columnas compiten.** Al abrir una ficha hay filtros +
   mapa + ficha a la vez: el mapa se estrecha a ~40 % y la ficha
   queda desconectada visualmente de su punto.
3. **Todo pesa lo mismo.** La ficha es una retahíla etiqueta/valor
   sin secciones ni respiro; la evidencia documental —el rasgo
   distintivo del proyecto— aparece como un párrafo más al final.
4. **Color sin sistema.** El país seleccionado se rellena de un
   amarillo plano y chillón; las categorías usan 14 colores
   saturados sin familia común; el marcador seleccionado es una
   mancha naranja sin relación con nada.
5. **Cifras enterradas.** Los tres números que cuentan la historia
   (1.382 / 70 / 942) son una línea pequeña de texto en la columna,
   repetida además en el pie de la hoja móvil.
6. **Móvil: la hoja tapa el mapa.** La hoja inferior a media altura
   recorta el globo, las pestañas Resultados/Filtros/Ficha están
   siempre presentes y la cabecera ocupa dos filas antes del mapa.
7. **Sin narrativa de niveles.** Nada indica «estás en el mundo /
   en un país / en una iniciativa» ni cómo se vuelve: la transición
   es un cambio de estado del panel, no un viaje.

## 2. Elementos comunes a las dos propuestas
- **Sistema cromático de categorías** (punto + texto siempre; el
  color nunca es el único canal). Familia contenida, tonos
  empolvados que funcionan sobre el mapa oscuro y sobre papel:
  Colegios `#C9973F` · Centros de mujeres `#B06A7E` · Centros de
  varones `#6E8FB8` · Residencias universitarias `#8A7BB8` ·
  Universidades `#C25E3A` · Casa de retiros `#5F9070` ·
  Asociaciones juveniles `#4E9CA8` · Escuelas de formación técnica
  `#A67C44` · Iglesias `#C7A94E` · Centros culturales `#5B84AE` ·
  Oficinas de Información `#7D8CA3` · Centros médicos `#B8524F` ·
  Centros de promoción social `#4F7D5A` · Clubes juveniles `#3FA08A`.
  Una sola familia de iconos (punto con pictograma simple en lista
  y ficha; en el mapa, punto de color).
- **Tres niveles con nombre y vuelta clara:** Mundo → País →
  Iniciativa, con migas o botón de retorno visibles en cada nivel.
- **La lista completa deja de ser la portada:** aparece al buscar,
  al filtrar o al pedirla («Explorar países», «Ver resultados»).
- **Divulgación progresiva en la ficha:** resumen primero;
  «Evidencia y fuentes» como bloque expandible.
- **Movimiento:** vuelos de mapa 1,2–1,8 s con easing suave;
  paneles 200–300 ms; todo anulado con `prefers-reduced-motion`.
- **Sin dependencias nuevas pesadas:** CSS y los componentes
  actuales; las tipografías, si se autoalojan, en woff2 con subset
  latino (≤ 60 KB por familia). Three.js sigue fuera del chunk
  inicial.

## 3. Propuesta A — «Atlas editorial»

Mockups: `a-mundo.png`, `a-pais.png`, `a-ficha.png`, `a-movil.png`.

**Idea.** El Atlas como publicación geográfica: cabecera de papel
con el título en serif, índice tipográfico de países, cifras como
sumario de portada y fichas que se leen como artículos con secciones
numeradas. El mapa oscuro hace de «lámina» a toda página.

- **Paleta:** papel `#F4EFE3`, tinta `#14213A`, ocre `#B98A2F` /
  `#E8C87E`, mar `#0B1322`, tierra `#1B2C4B`, bordes `#33507E`,
  texto secundario `#5A6577`.
- **Tipografía:** serif de titulares (Fraunces autoalojada; en el
  mockup, Georgia) + sans del sistema para interfaz. Mayúsculas con
  tracking ancho para rúbricas.
- **Composición:** cabecera 64 px; índice de 264 px en papel (solo
  los países con más presencia + «ver los 70»); cifras en serif
  52 px sobre el mapa; país con panel de papel de 392 px (nombre
  52 px, cifras, tabla de categorías, destacadas); ficha de papel
  de 430 px con secciones 01/02/03 y documentación plegada.
- **Móvil:** cabecera compacta, mapa protagonista, franja de cifras
  en papel y hoja con el índice; la hoja no pasa de ~40 % salvo al
  hacer scroll dentro de ella.
- **Ventajas:** identidad institucional y serena; legibilidad
  máxima de textos largos y de la documentación; reutiliza la
  estructura actual de paneles (menor riesgo); el contraste
  papel/mapa hace el producto inconfundible.
- **Inconvenientes:** menos «efecto descubrimiento»; el índice
  sigue visible (aunque reducido y con intención tipográfica); el
  papel exige cuidar mucho el contraste de las fotos inexistentes:
  todo es tipografía.
- **Coste estimado:** medio. Re-estilado completo de CSS y
  reordenación de paneles y ficha; sin tocar store, API, mapa ni
  SW en lo sustancial. La batería actual seguiría casi intacta.
- **Componentes:** se conservan cabecera, buscador, lista de
  países, lista de resultados, contexto de país, ficha y visor
  (re-estilados); cambia la StatsBar (a sumario), el panel de
  ficha (a secciones con plegado) y el estilo del mapa
  (selección ocre, sin relleno amarillo); se elimina la columna
  de categorías siempre desplegada (pasa a filtro bajo demanda).

## 4. Propuesta B — «Exploración inmersiva»

Mockups: `b-mundo.png`, `b-pais.png`, `b-ficha.png`, `b-movil.png`.

**Idea.** El globo lo ocupa todo y la interfaz flota sobre él en
cristal oscuro: búsqueda en píldora, cifras en una tarjeta de
cristal con números grandes y ligeros, y controles que solo
aparecen cuando se les llama. Cada nivel se siente como acercarse.

- **Paleta:** fondo `#04070D`, tierra `#0D1830`, bordes `#26436F`,
  cristal `rgba(8,13,25,.62)` con blur, acento único ámbar
  `#E8A33D`, texto `#EAF0FA` / secundario `#8CA3C7`. Los colores de
  categoría solo aparecen como puntos y bandas finas.
- **Tipografía:** sans del sistema en pesos ligeros para cifras
  (44 px, peso 200) y titulares; rúbricas en mayúsculas con
  tracking.
- **Composición:** sin columnas permanentes. Mundo: buscador
  flotante, tarjeta de cifras abajo-izquierda, acciones
  abajo-derecha («Categorías», «Explorar por país») que abren
  paneles flotantes. País: panel de cristal a la izquierda con
  chips de categoría y tira de tarjetas de resultados abajo.
  Iniciativa: tarjeta de cristal a la derecha con banda de color
  de la categoría y documentación plegada; el punto brilla sobre
  el mapa atenuado.
- **Móvil:** globo a pantalla completa, buscador flotante y hoja
  de cristal colapsada a una frase («1.382 iniciativas en 70
  países») con chips; sube solo cuando se explora.
- **Ventajas:** impacto inmediato y sensación de producto «vivo»;
  el mapa por fin es el protagonista; los controles progresivos
  reducen la densidad percibida a casi cero; la navegación por
  niveles se entiende sin explicación.
- **Inconvenientes:** el cristal (blur + translucidez) exige
  disciplina para no perder contraste ni rendimiento; la
  información densa (contexto documental de país, listas largas)
  encaja peor flotando que en una columna; mayor superficie de
  fallos visuales nuevos (solapes, paneles sobre el mapa).
- **Coste estimado:** alto. Reestructura el layout (de columnas
  fijas a capas flotantes), rehace los patrones móviles y exige
  más comprobaciones dirigidas nuevas.
- **Componentes:** se conserva la lógica (store, URL, API, SW) y
  el visor (re-estilado); cambian cabecera (a flotante), StatsBar
  (a tarjeta de cristal), paneles de país y ficha (a tarjetas
  flotantes) y la hoja móvil (a tres posiciones con colapsado
  mínimo); se eliminan las columnas permanentes.

## 5. Comparación y recomendación

| | A · Editorial | B · Inmersiva |
|---|---|---|
| Primera impresión | Portada de revista geográfica | Globo cinematográfico |
| Legibilidad documental | Máxima | Buena si el cristal se disciplina |
| Riesgo de implementación | Bajo-medio | Medio-alto |
| Coste | Medio | Alto |
| Carácter | Institucional, sereno | Descubrimiento, memorable |

**Mi recomendación, si hay que elegir una:** para este directorio
—documental, verificable, institucional— la **A** es la dirección
más segura y la que mejor envejece; la **B** gana si el objetivo
principal pasa a ser la difusión y el impacto en quien llega por
primera vez. Una vía híbrida razonable (B como estructura con las
fichas de A) es posible, pero conviene decidirla como dirección
única, no como mezcla al 50 %.

## 6. Qué se pide ahora

Elección de dirección por parte de Jon (A, B o la híbrida
delimitada) y revisión de Codex. La Fase 7B no comienza sin esa
elección, y nada se desplegará sin visto bueno y certificación,
según la regla de trabajo.