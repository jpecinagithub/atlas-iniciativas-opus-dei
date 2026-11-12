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

- Recorrido funcional completo: **49/49 PASS** — las 42
  comprobaciones heredadas de las fases certificadas más 6
  dirigidas nuevas: acciones de exploración visibles, ausencia
  de lista antes de filtrar, figura «Sin punto» en el panel de
  país, secciones 01/02/03 de la ficha, cierre con Escape, sin
  desbordamiento horizontal en móvil y funcionamiento con
  movimiento reducido. Glifos: sin fallos (la comprobación de la
  Fase 6 sigue activa). PWA offline: pasa.
- `test:sw`: 3/3. La huella de la nueva compilación local es
  VERSION `a07a09f3db3e` (solo local; producción no se ha
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
  dos acciones; el panel de exploración sigue a un clic (y nace
  abierto en escritorio, como pedía la batería de historial).
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
- Panel «Explorar» abierto por defecto en escritorio: es la
  acción primaria hecha visible y mantiene intacta la batería
  certificada (país y categoría se operan sin pasos previos).
- Documentación desplegada por defecto (ver 7B.3).
- Serif de sistema (Georgia) en vez de fuente autoalojada: cero
  peso añadido y el mismo carácter editorial de los mockups.
- Las etiquetas de cifras usan versalitas por `font-variant`
  (no `text-transform`) para que lectores de pantalla y
  comprobaciones lean el texto real.

## 5. Pendiente
Revisión visual de Jon y certificación de Codex. Solo después,
redespliegue de la Fase 7B en Oracle con la misma disciplina de
la Fase 6 (verificación por la ruta pública real, perfil nuevo
y heredado). La Fase 8 sigue sin iniciar: espera a que Jon
confirme que el directorio v15 está estable.
