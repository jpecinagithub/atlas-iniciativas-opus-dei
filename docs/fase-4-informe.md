# Fase 4 — Exploración completa

Entregada para revisión el 2026-11-12, tras la certificación de la Fase 3.
La fase completa la exploración: la ficha se vuelve documental, el país
seleccionado tiene su propio contexto, y las webs de las iniciativas y
de las fuentes se pueden visitar dentro de la app.

## 1. Qué se ha construido

**Ficha documental completa.** La ficha básica sigue saliendo al
instante del catálogo ligero; en paralelo se pide el detalle a la API
(`GET /api/initiatives/:id`, con caché por registro) y al llegar se
añaden las secciones documentales:
- **Evidencia de vinculación** y **Doble comprobación**, con el texto
  íntegro del directorio.
- **Fuentes catalogadas**: las relaciones por coincidencia exacta de URL
  de la Fase 3, presentadas con su papel (Fuente 1 / Fuente 2), título,
  dominio, naturaleza, fecha de consulta e identificador, y dos salidas
  por fuente: «Ver en el visor» y «Abrir en pestaña nueva ↗». Cuando una
  fuente del registro no tiene coincidencia catalogada, el enlace de la
  ficha básica se mantiene, como manda la D1.
- Si el detalle no puede cargarse, la ficha básica queda completa y un
  aviso discreto dice que la documentación no está disponible.

**Contexto de país.** Al seleccionar un país, sobre la lista aparece su
tarjeta de contexto (en escritorio y en la pestaña de resultados del
móvil), construida solo con datos del archivo y sin mezclar lo declarado
con lo calculado:
- Nombre, continente y **circunscripción**.
- Cifra que manda: registros del Directorio y cuántos tienen ubicación.
- Contraste con la hoja Países: si coincide, lo dice; si no, declara la
  diferencia (y si el desglose por estados de la propia hoja no suma su
  total, también, como pasa con el «Confirmado» suelto de PR-06).
- Estados de verificación del país con sus conteos y **desglose por
  categoría** calculado de las iniciativas del país (D6), ignorando los
  demás filtros activos.
- **Evidencia de presencia** y **nota del directorio**, recortadas con
  «Leer más» cuando son largas (la de España lo es mucho).
- Fuente principal del país, abrible en el visor o en pestaña nueva.

**Visor web.** Una capa a pantalla completa que **solo se abre tras una
acción expresa del usuario**: «Ver en el visor» en las fuentes
catalogadas, «Ver la web en el visor» en el contacto de la ficha y
«Fuente principal del país en el visor». Muestra el sitio y la URL
completa, botón de «Abrir en pestaña nueva ↗» y cierre (✕ o Escape).
Carga la página **directamente desde su sitio, sin servidor intermedio
ni ningún mecanismo para saltarse la prohibición de incrustar**: un
aviso permanente lo explica, y si el sitio lo prohíbe (opusdei.org, por
ejemplo), el área queda en blanco y la salida es la pestaña nueva. No
hay proxy anti-X-Frame-Options, como fijó la especificación.

## 2. Verificación ejecutada

- **Recorrido oficial ampliado a 27 comprobaciones: 27/27 PASS.** Las 6
  nuevas de la fase: contexto de país (circunscripción y cifra; desglose
  con Colegios 108), ficha documental (evidencia y doble comprobación
  presentes), fuentes catalogadas relacionadas (Tajamar: 2) y visor
  (se abre con la fuente de opusdei.org cargada en el iframe y se
  cierra). Sin errores de página.
- **Humo de API: 13/13 PASS** e **integridad de importación: OK**, sin
  cambios (la fase no toca datos ni backend).
- **Capturas nuevas**: `10-ficha-documental-desktop.png` (la evidencia
  se lee en la ficha), `11-visor-web.png` (el visor abierto sobre
  opusdei.org: área en blanco porque el sitio no permite incrustarse, y
  el aviso con la salida a pestaña nueva, que es el comportamiento
  diseñado) y `12-contexto-pais.png` (la tarjeta de España completa).
  El resto de capturas se regeneraron: la tarjeta de contexto mueve el
  panel izquierdo cuando hay país seleccionado, sin cambiar el mapa ni
  los datos.
- Revisión visual propia de las capturas nuevas antes de entregar.

## 3. Límites y notas

- El visor no puede detectar de forma fiable si un sitio ha bloqueado
  la incrustación (el navegador no lo notifica); por eso el aviso es
  permanente en vez de prometer un diagnóstico. La alternativa de
  pestaña nueva está siempre a un clic.
- El detalle documental se cachea por sesión y registro; los cambios de
  la base solo se ven tras recargar la app, como el resto del catálogo.
- Siguen intactas las limitaciones aceptadas: chunk cartográfico de
  1,61 MB (Fase 5), base sin calles sin clave CARTO y 440 registros sin
  punto.
