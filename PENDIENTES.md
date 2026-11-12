# Pendientes — Atlas de iniciativas · Opus Dei

Documento único de pendientes. Actualizado: 2026-11-12 (PROYECTO ENTREGADO: Fase 6 CERTIFICADA; en producción en https://jpecina.duckdns.org/atlas/).

## Revisión de la Fase 2 (2026-11-11) — CERTIFICADA
- [x] MapLibre GL JS actualizado a 6.17.0 (GHSA-jrc7-96c5-q579) con la URL del worker fijada; auditoría contrastada en OSV: 0 vulnerabilidades en el lockfile.
- [x] Recorrido funcional reproducible desde clon limpio (Playwright como devDependency, navegador administrado, sin rutas absolutas, servidor propio).
- [x] Historial atrás/adelante implementado (pushState/popstate) y cubierto en el recorrido: 21/21 PASS con capturas regeneradas.
- [x] SwiftShader ya no se fuerza en el recorrido (en Windows rompía WebGL): es opt-in con `ATLAS_FORCE_SWIFTSHADER=1`. Reverificado desde copia limpia sin variables especiales: 21/21 PASS.
- [x] Fase 2 certificada por la revisión independiente sobre clon de main (e9a9d2a) en Windows.

## Fase 3 (2026-11-11) — entregada para revisión
- [x] Esquema PostgreSQL (migraciones 001-002), importador transaccional e idempotente con informe de altas/cambios/ausentes sin borrado.
- [x] Catálogo de fuentes importado (2.626) y relaciones solo por URL exacta: 2.164 (3 ambiguas por URL duplicada, no creadas).
- [x] API Fastify completa y web leyendo de la API; humo 13/13 y recorrido 21/21.
- [x] Bloqueo de integridad corregido: `sourceSha256` en los artefactos y verificación previa en el importador (aborta sin crear corrida si no coincide); prueba reproducible `npm run test:integrity` 6/6.
- [x] Prueba de integridad portable a Windows (tsx resuelto como módulo y aserciones estrictas de arranque del proceso).
- [x] Fase 3 certificada por la revisión independiente (2026-11-12, clon de 89480c9).

## Fase 4 (2026-11-12) — entregada para revisión
- [x] Ficha documental completa desde el detalle de la API (evidencia, doble comprobación, fuentes catalogadas con visor y pestaña nueva).
- [x] Contexto de país (circunscripción, declarado vs calculado, estados, desglose por categoría, evidencia de presencia, nota y fuente principal).
- [x] Visor web solo tras acción del usuario, sin proxy anti-incrustación; aviso permanente y salida a pestaña nueva.
- [x] Recorrido ampliado a 27 comprobaciones: 27/27 PASS; capturas nuevas 10, 11 y 12.
- [x] Bloqueo del visor corregido: `normalizeExternalUrl` única (85 valores sin esquema de 6.205: dominios desnudos, comillas tipográficas y 2 textos documentales); el original se muestra como texto sin enlace si no normaliza; defensa en `openViewer`/`WebViewer` y `sandbox` en el iframe. Recorrido ampliado a 34/34 PASS (Puerto Rico abre https://www.paloblanco.org/; BR-10 y CL-16 sin enlace; `javascript:`/`data:` rechazados).
- [x] Clasificación de errores del recorrido corregida: solo se aceptan como esperados los del iframe externo (opusdei.org/paloblanco.org, incluido su X-Frame-Options); los de la app/API/mapa siguen fallando. 34/34 reproducible.
- [x] Clasificación portable a Windows: el 403 del iframe puede venir atribuido a `chrome-error://chromewebdata/`; solo es esperado con el contexto del visor activo (host externo guardado junto a cada mensaje, activado antes de abrir y desactivado al cerrar). Sin contexto, sigue siendo fallo.
- [x] Fase 4 certificada por la revisión (2026-11-12, clon de c6c3473, recorrido 34/34 en Windows).

## Decisiones
- [x] D1–D6 aprobadas y aplicadas. D1: Fuente 1/2 visibles en ficha aunque no haya coincidencia catalogada.
- [x] **D7 RESUELTA (Fase 6):** servidor reverificado — no existe un PostgreSQL compartido; cada proyecto corre el suyo en su stack (josemaria y josemaria-rag con pgvector, NEXUS con postgres:16-alpine), sin puertos publicados. El Atlas sigue el patrón de la casa: su propio postgres:16 en su stack, red interna, volumen y copias propios. Sin PostgreSQL nuevo en el host.

## Dependencias externas
- [ ] Clave **CARTO** (API key con restricción de dominio) si se adopta su mapa base. Sin ella: base local Natural Earth en oscuro, sin calles ni etiquetas de texto en el mapa.
- [ ] Proveedor + credencial de geocodificación con precisión `address` (por decidir). Resolución actual: `locality` con GeoNames (942 resueltas, 79 ambiguas, 356 sin coincidencia, 5 sin localidad).

## Datos
- [ ] 356 registros sin coincidencia, en gran parte por textos de localidad compuestos (barrio/ciudad, ciudad + provincia). Cualquier regla nueva para tratarlos debe revisarse antes de aplicarse.
- [ ] Completar la descarga del extracto GeoNames de Rusia (truncado en caché); hoy no afecta: RU-01 se resolvió en primera pasada.
- [ ] 102 Fuente 1 y 134 Fuente 2 con URL no catalogada: enlace conservado en ficha; relación catalogada solo con coincidencia exacta de URL — hecho en la Fase 3 (2.164 relaciones; 3 ambiguas por URL duplicada).
- [ ] V32-102 y V32-103 sin URL/país/fecha en origen: se importan tal cual (Fase 3).

## Fase 5 (2026-11-12) — entregada para revisión
- [x] Glifos SDF autoalojados generados desde Noto Sans (tools/fonts) y etiquetas: países (un punto por país, mayor polígono), conteo de agrupaciones y localidades.
- [x] PWA: manifiesto, iconos y service worker (precarga de carcasa; API con NetworkFirst; offline verificado en el recorrido). Inicialmente con vite-plugin-pwa; sustituido por SW propio en la segunda corrección.
- [x] Chunk del mapa reducido: Three.js en chunk propio bajo demanda (529 KB); MapView de 1.612 a 1.083 KB.
- [x] Acabado: favicon vectorial, theme-color, textos de Método y pie actualizados. Recorrido ampliado a 38/38 PASS.
- [x] Corrección de la revisión: propiedad `locality` en los puntos (las etiquetas no podían mostrar texto) con prueba de renderizado real a zoom 14; OFL.txt de Noto en tools/fonts; prueba offline con datos cacheados (1.382) en flujo de segunda visita; worker .mjs de MapLibre incluido en la precarga. Recorrido: 41/41 PASS.
- [x] Segunda corrección (cadena de dependencias): vite-plugin-pwa/workbox eliminados por sus 6 vulnerabilidades sin arreglo compatible (deepmerge sin fix; glob/minimatch exigen mayores incompatibles); service worker propio generado por un plugin local de Vite + manifiesto estático. Desde clon limpio: npm ci, auditoría OSV 0 avisos (297 paquetes), build, integridad OK, API 13/13, recorrido 41/41.
- [x] Tercera corrección (huella de versión): VERSION del SW = SHA-256 de los bytes reales de cada recurso precargado, incluidos los de public/ (antes nombre:tamaño, con la longitud del nombre para los públicos). Prueba reproducible `npm run test:sw` (cambio sin cambio de tamaño → cambia VERSION; restauración → vuelve). Batería repetida: todo verde.
- [x] Fase 5 certificada por la revisión (2026-11-12, clon de 5e38b8d: auditoría limpia, test:sw 3/3, recorrido 41/41).

## Fase 6 (2026-11-12) — desplegada, entregada para revisión
- [x] Servidor reverificado; D7 resuelta (ver Decisiones).
- [x] Paquete de despliegue en el repo: docker-compose.prod.yml, Dockerfiles de API y web, nginx interno, .dockerignore.
- [x] Arreglo exigido por el despliegue: la API escucha en HOST configurable (defecto 127.0.0.1; el compose fija 0.0.0.0 en la red interna). Humo local 13/13 sin regresión.
- [x] Segundo arreglo: el nginx interno servía el worker .mjs de MapLibre como octet-stream y el mapa quedaba en blanco en producción; default_type application/javascript para .mjs en deploy/nginx-web.conf. Reverificado contra la URL pública: 0 errores, mapa renderizado.
- [x] Stack en /opt/atlas (db + api + web en 127.0.0.1:8180), nginx del host con /atlas (copia previa en ~/nginx-backups/), importación completa (1.382/942/70/2.626/2.164).
- [x] Verificación por la ruta pública real: salud y humo de API 13/13 contra https://jpecina.duckdns.org/atlas, sw.js con la huella de la compilación certificada, persistencia tras down/up, vecinos intactos.
- [x] Copias: backup.sh + cron semanal (domingos 04:30, retención 30 días); primera copia restaurada a modo de prueba (1.382/2.164).
- [x] Corrección del bloqueo detectado por la revisión: glifos PBF fuera de formato (dimensiones con el margen sumado). Generador corregido y validado (1.024 glifos conformes), 4 PBF regenerados, recorrido endurecido (falla ante avisos de glifo; prueba negativa con 41 mensajes) y caché de glifos versionada con purga en activate y PBF dentro de la huella VERSION. Redesplegado (VERSION 3330a057a2dd) y verificado en producción con perfil nuevo y con perfil sembrado con la PWA defectuosa: 0 mensajes de glifo en ambos.
- [x] Fase 6 CERTIFICADA por la revisión (2026-11-12, clon limpio de 639627b: npm ci sin vulnerabilidades, test:sw 3/3, PBF decodificados 1.024/0 incoherencias e idénticos byte a byte a los servidos, SW 3330a057a2dd con caché de glifos versionada, perfil heredado limpio, recorrido oficial contra la URL pública 42/42). **Proyecto técnicamente entregado.** Las mejoras de puesta en escena y fases opcionales quedan como evolución posterior, fuera de esta entrega.

## Fase 7 (opcional, posterior a la entrega) — renovación visual
- [x] **Fase 7A entregada (2026-11-12):** diagnóstico + dos propuestas con mockups en `docs/fase-7a-propuestas.md` (A «Atlas editorial», B «Exploración inmersiva»; 8 mockups y 4 capturas del estado actual en `docs/fase-7a/`). Sin código tocado ni nada desplegado.
- [x] Dirección elegida por Jon y aprobada por Codex (2026-11-12): propuesta B con el interior editorial de la A en las fichas. (El documento de propuestas llegó truncado a GitHub —la marca de truncamiento quedó incrustada en el fichero al escribirlo— y se reparó en commit independiente `2bdb509`, verificado completo en el repo: 189 líneas, sin marcas.)
- [x] **Fase 7B implementada y verificada en local (2026-11-12), SIN desplegar:** layout inmersivo completo, panel de país con «Sin punto» y chips que filtran, tira plegable de primeras iniciativas, ficha híbrida 01/02/03 con documentación desplegada por defecto, visor reestilado con la seguridad intacta, hoja móvil de 3 posiciones, sistema cromático de la 7A, movimiento reducido. Recorrido 55/55 (42 heredadas + 13 dirigidas), test:sw 3/3 (VERSION local `f0c4f5cee3aa`), OSV 0 vulnerabilidades (297 paquetes). Primera revisión de Codex detenida por composición; aplicadas sus 5 correcciones (panel cerrado por defecto, mapa+ficha al abrir iniciativa con restauración, ficha móvil con scroll a cero, marca sin recorte y conteos del informe) — ver `docs/fase-7-informe.md` §5. Informe y capturas en `docs/fase-7-informe.md` y `docs/fase-7b/`.
- [ ] Revisión visual de Jon y certificación de Codex de la 7B. Solo después, redespliegue en Oracle. **Producción sigue en la Fase 6 certificada (`3330a057a2dd`).**
- [ ] Fase 8 (v15 y calidad geográfica): solo cuando Jon confirme que el v15 está estable; empieza por la auditoría comparativa 8A, sin tocar importador ni producción.
