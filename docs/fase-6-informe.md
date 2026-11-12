# Fase 6 — Despliegue en Oracle y entrega

Fecha: 2026-11-12. Despliegue público en
**https://jpecina.duckdns.org/atlas/**

## 1. El servidor, reverificado (no de memoria)

`iadelveloper-server` (Oracle, aarch64, Ubuntu): 24 días encendido,
carga ~0,1, 130 GB libres de disco y ~17 GB de RAM disponible. Lo que
corre: josemaria (API + pgvector), josemaria-rag (backend + pgvector
+ Ollama), NEXUS (API + worker + postgres:16-alpine), Portainer y
varios servicios de voz/LLM. El nginx del host reparte
`jpecina.duckdns.org` por rutas desde `sites-enabled/mi-gps`, con el
patrón `location /proyecto/ → proxy_pass a 127.0.0.1:<puerto>`.

## 2. D7, resuelta con esa evidencia

D7 pedía comprobar primero si el Atlas podía vivir como base +
usuario en «el PostgreSQL existente». La comprobación da una
respuesta clara: **no existe un PostgreSQL compartido**. Cada
proyecto del servidor corre el suyo dentro de su propio stack
(josemaria y josemaria-rag con pgvector, NEXUS con
postgres:16-alpine), ninguno publica el puerto fuera de su red
interna y dos de ellos son instalaciones pgvector al servicio de sus
RAG. Meter la base del Atlas en el contenedor de otro proyecto lo
acoplaría a su ciclo de vida, sus reinicios y sus copias.

**Resolución:** el Atlas sigue el patrón de la casa — su propio
`postgres:16-alpine` dentro de su stack, solo en la red interna del
proyecto, con volumen propio (`atlas_pgdata`) y copias propias. No se
instala ningún PostgreSQL nuevo en el host. D7 queda cerrada.

## 3. Qué se despliega

`/opt/atlas` en el servidor (contenido del repo, sin caché de datos
ni `node_modules`: 13 MB) con `docker-compose.prod.yml`:

- **db** — postgres:16-alpine, red interna únicamente, volumen
  `atlas_pgdata`, healthcheck `pg_isready`.
- **api** — imagen propia (`apps/api/Dockerfile`): compila la API y
  conserva la estructura del repo que el importador y las
  migraciones necesitan (raíz resuelta desde `dist/`). Sin puerto
  publicado; la alcanza el nginx interno.
- **web** — imagen propia (`apps/web/Dockerfile`): compila la web
  con `VITE_BASE_PATH=/atlas/` y la sirve con un nginx interno
  (`deploy/nginx-web.conf`) que sirve la SPA y redirige `/api/` a la
  API. Publica solo `127.0.0.1:8180`.
- Los tres con `restart: unless-stopped`.

La contraseña de la base se generó en el propio servidor y vive solo
en `/opt/atlas/.env` (permisos 600); no está en el repo ni en la
imagen. El nginx del host ganó dos bloques calcados de los de
josemaria-rag (`= /atlas` → 301 a `/atlas/`; `/atlas/` → proxy a
127.0.0.1:8180), con copia previa del fichero en
`~/nginx-backups/mi-gps.2026-11-12-atlas.bak`.

**Dos arreglos que el despliegue exigió:**

1. La API escuchaba solo en `127.0.0.1`, inalcanzable desde el
   contenedor web. Ahora escucha en `HOST` (defecto `127.0.0.1`, como
   antes; el compose fija `0.0.0.0` dentro de la red interna del
   stack). Verificado sin regresión: humo de API local 13/13.
2. **El worker de MapLibre no cargaba en producción** y el mapa
   quedaba en blanco (datos y fichas sí funcionaban). Causa: el
   nginx interno servía el `.mjs` del worker como
   `application/octet-stream` — su `mime.types` no conoce la
   extensión — y el navegador rechaza un worker con ese tipo. En
   desarrollo no se veía porque Vite sí lo sirve bien. Arreglo en
   `deploy/nginx-web.conf`: `default_type application/javascript`
   solo para `.mjs`. Tras redesplegar el contenedor web, la sonda
   contra la cadena pública real da **0 errores de consola** y el
   mapa renderiza (globo, etiquetas de país y agrupaciones, ver §4).

## 4. Datos y verificación (ruta pública real)

- Importación dentro del stack: 1.382 iniciativas (942 con punto),
  70 países, 2.626 fuentes, **2.164 relaciones**, corrida nº 1
  registrada con el hash del Excel v14.
- `GET /atlas/api/health` público: conteos exactos. Humo de API
  completo **contra la URL pública: 13/13 PASS**.
- La raíz `/atlas` redirige a `/atlas/`; el `sw.js` público es el de
  la compilación certificada (VERSION `c0cb04d1bdf1`, la huella del
  contenido con base `/atlas/`), servido con `Cache-Control:
  no-cache`. El GeoJSON (3,7 MB) y el catálogo (1,8 MB) responden.
- **Persistencia:** `docker compose down` + `up` completo → los
  conteos y la corrida de importación sobreviven (volumen).
- **Vecinos intactos:** josemaria-rag sigue en 200 tras el cambio de
  nginx. (El 404 de `/josemaria/` es el comportamiento propio de su
  API en la raíz — su `/docs` da 200 —, anterior a este despliegue.)
- Verificación en navegador sobre la URL pública real: portada con
  contadores 1.382/70/942, España con 296/272 y su contexto, ficha de
  Tajamar completa (dirección, contacto y sus 2 fuentes catalogadas)
  y, tras el arreglo del §3, mapa renderizado con 0 errores de
  consola — captura del globo con etiquetas y agrupaciones tomada a
  través de la cadena pública completa.

## 5. Copias de seguridad

`/opt/atlas/backup.sh`: `pg_dump` comprimido en
`/opt/atlas/backups/`, retención 30 días, programado en el cron del
usuario los **domingos 04:30**. Primera copia ejecutada y
**restauración probada**: volcada en una base temporal dio 1.382
iniciativas y 2.164 relaciones; la base de prueba se eliminó.

## 6. Límites y notas

- El despliegue sirve exactamente la compilación certificada en la
  Fase 5 (mismo contenido; la única diferencia es la ruta base
  `/atlas/`, que cambia la huella del SW, como debe ser).
- Actualizar los datos en el futuro = el camino de siempre:
  regenerar artefactos desde el Excel corregido, redeploy de la
  imagen de la API (trae los artefactos y el Excel) y
  `docker compose run --rm api node dist/import.js`.
- Sin autenticación, como se decidió en la especificación: es un
  atlas de información pública verificada.

## 7. Corrección posterior a la primera revisión (2026-11-12)

La revisión detectó que **los glifos autoalojados eran defectuosos**
y la certificación se detuvo ahí, con razón: MapLibre rechazaba cada
rango («Unable to load glyph range… RangeError: mismatched image
size») y dibujaba las etiquetas con su renderizado local de
respaldo, así que las etiquetas visibles no acreditaban los PBF.

**Causa raíz** (leída en el parser de MapLibre y contrastada con
glifos de referencia de fontnik): en el formato, `width`/`height`
son la caja de tinta SIN el margen SDF y el bitmap debe medir
exactamente (width+6)×(height+6). Mi generador guardaba las
dimensiones CON el margen ya sumado. De paso, las métricas salían
desplazadas: `left` restaba el margen y `top` lo sumaba; lo correcto
es `left` = bearing de la tinta y `top` = bearing superior −
ascendente de la fuente (a 24 px, `fontBoundingBoxAscent` = 26 en
Noto Sans; comprobado glifo a glifo contra la referencia: A → −9,
g → −13, Á → −4).

**Correcciones aplicadas:**
1. `tools/fonts/build_glyphs.mjs`: dimensiones y métricas según el
   contrato (documentado en su cabecera) y **validación automática**
   del contrato por glifo antes de escribir cada rango. Regenerados
   los 4 PBF: 1.024 glifos, 0 incoherencias al decodificarlos.
2. El recorrido no veía el fallo porque MapLibre avisa por
   `console.warn`, no por error: ahora captura esos avisos y tiene
   una comprobación propia («Glifos autoalojados: sin fallos de
   carga ni de tamaño»). **Prueba negativa:** con los PBF antiguos
   restaurados temporalmente, la misma captura recoge 41 mensajes de
   fallo; con los nuevos, el recorrido pasa **42/42**.
3. La caché de glifos del service worker era CacheFirst con nombre
   fijo: los PBF defectuosos habrían quedado para siempre en los
   navegadores que ya visitaron el Atlas. Ahora la caché se llama
   `atlas-glifos-<VERSION>`, el `activate` borra cualquier caché de
   glifos que no sea la vigente (incluida la antigua sin versión) y
   **los bytes de los PBF entran en la huella VERSION** (antes no:
   un cambio solo de glifos no habría cambiado VERSION).

**Redespliegue y verificación en producción** (VERSION nueva
`3330a057a2dd`): perfil nuevo → 0 mensajes de glifo, cachés
versionadas creadas; **perfil sembrado antes del redespliegue con
la PWA defectuosa** (SW `c0cb04d1bdf1` y caché `atlas-glifos` sin
versión) → al volver, el SW nuevo se activa, las cachés antiguas
desaparecen y, tras recargar, 0 mensajes de glifo con las etiquetas
renderizadas desde los PBF del servidor.

**Certificación (2026-11-12):** la revisión certificó la Fase 6
desde un clon limpio de `639627b` — npm ci sin vulnerabilidades,
build de producción, test:sw 3/3, los 4 PBF decodificados (1.024
glifos, 0 incoherencias) e idénticos byte a byte a los servidos en
producción, SW `3330a057a2dd` con la caché de glifos versionada,
perfil heredado sin avisos tras la actualización y recorrido
oficial contra la URL pública 42/42. **Proyecto técnicamente
entregado.**
