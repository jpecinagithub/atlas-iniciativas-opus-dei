# Fase 3 — Datos completos y backend

Entregada para revisión el 2026-11-11, tras la certificación de la Fase 2.
La experiencia visual no cambia: cambia de dónde salen los datos. La web
ya no lee un JSON estático, sino la API del Atlas servida desde
PostgreSQL, alimentada por una importación transaccional e idempotente
del directorio v14.

## 1. Qué se ha construido

**Esquema PostgreSQL** (`db/migrations/`, sin PostGIS), el mínimo de la
Fase 1: `initiatives` (ID del Excel como PK estable, campos originales y
normalizados, ubicación y procedencia), `countries`, `sources`,
`initiative_sources` e `import_runs`, más una columna `ord` (migración
002) con la posición de cada fila en el archivo: la API sirve las filas
en el orden de la fuente, no reordenado por ID.

**Importador** (`apps/api/src/import.ts`). Lee los artefactos del
pipeline (`catalog.json` y el nuevo `sources.json` con las 2.626 fuentes
de la hoja Fuentes, incluida su 8ª columna de notas) y carga en UNA
transacción:
- Upsert por ID con hash de contenido por fila: el informe distingue
  **altas, cambios y sin cambios**.
- Los registros presentes en la base y ausentes del archivo se
  **informan como ausentes y no se borran**.
- Cada corrida queda registrada en `import_runs` con el hash SHA-256
  del Excel y su resumen.
- Relaciones `initiative_sources` solo por **coincidencia exacta de
  URL**: 2.164 creadas (Fuente 1: 1.228; Fuente 2: 939; menos 3 casos en
  que la URL está duplicada en el catálogo y la relación sería ambigua,
  que no se crean y se cuentan). Sin coincidencia catalogada: 102 de
  Fuente 1 y 134 de Fuente 2; el enlace se conserva siempre en la ficha
  (decisión D1).

**API Fastify** (`apps/api`, puerto 3001): `GET /api/health`,
`GET /api/catalog` (ligero: sin evidencia ni doble comprobación, que son
textos documentales de la ficha completa), `GET /api/initiatives/:id`
(ficha completa + fuentes catalogadas relacionadas),
`GET /api/countries/:code` (conteos calculados desde Directorio),
`GET /api/sources` (paginado, con búsqueda) y `GET /api/sources/:id`
(con sus iniciativas relacionadas). Los conteos de países se calculan
siempre de las iniciativas (D6); la hoja Países solo aporta lo declarado
como contraste.

**Web**: `store.load` pide `/api/catalog`; Vite redirige `/api` a la API
en desarrollo y en preview. El `countries.geojson` sigue siendo un
activo estático generado por el pipeline (la geometría no vive en la
base; se guarda el bbox de encuadre por país). Las relaciones de fuentes
se consumen desde el endpoint de detalle; su presentación documental en
la ficha es de la Fase 4.

## 2. Verificación ejecutada

- **Importación inicial** en base vacía: 70 países, 2.626 fuentes y
  1.382 iniciativas insertadas; 2.164 relaciones; 942 con ubicación.
- **Idempotencia**: segunda importación idéntica → 0 altas, 0 cambios,
  todo «sin cambios», relaciones estables.
- **Detección de cambios**: alterado el nombre de ES-06 en el artefacto
  → la importación informa exactamente 1 cambio; al restaurar, 1 cambio
  de vuelta; la siguiente, todo sin cambios.
- **Ausentes sin borrado**: retirado NL-18 del artefacto → informado
  como ausente y la base sigue sirviendo Club De Reusel (1.382).
- **Humo de API** (`tests/api-smoke.mjs`, nuevo): **13/13 PASS** —
  conteos, catálogo ligero sin textos largos, detalle ES-06 con sus 2
  fuentes catalogadas, país ES (296, Colegios 108), paginación y
  búsqueda de fuentes, F-0001 con 6 iniciativas relacionadas, 404.
- **Recorrido web completo** (`npm run test:functional`, que ahora
  también compila la API y la arranca si no responde): **21/21 PASS**
  con la web leyendo de la API, sin errores de página.
- **Orden fiel a la fuente**: la secuencia de IDs que sirve
  `/api/catalog` es idéntica a la del artefacto generado del Excel.

## 3. Incidencia del entorno (sin impacto en el proyecto)

A mitad de la verificación, la máquina virtual de construcción fue
reaprovisionada y PostgreSQL desapareció por completo (binarios y
datos), un fallo ya conocido de este entorno. Se reinstaló PostgreSQL
16, se recrearon base y usuario propios del proyecto y se reimportó:
como la base se reconstruye entera desde el Excel, no se perdió nada.
La verificación completa (humo + recorrido) se repitió después sobre la
base reconstruida, con los mismos resultados.

## 4. Límites y notas

- La base y el usuario PostgreSQL de desarrollo son propios del
  proyecto (`atlas`). La decisión de producción sigue siendo la **D7**,
  para la Fase 6: comprobar primero el PostgreSQL existente del servidor.
  El `docker-compose.yml` incluido es solo una comodidad de desarrollo
  local, no una decisión de despliegue.
- `import_runs` puede mostrar huecos en la numeración: las secuencias de
  PostgreSQL no son transaccionales y una importación abortada consume
  un número sin dejar corrida registrada (quedó constancia de ello en la
  primera tentativa, fallida por un JSONB mal serializado y corregida).
- El resumen geográfico fino (ambiguas/sin coincidencia por grupo) sigue
  viviendo en el informe del pipeline (`data/generated/`); la API
  informa ubicadas/no ubicadas y el estado de revisión por registro.

## 5. Corrección de integridad (revisión de la Fase 3, 2026-11-11)

La revisión detectó un bloqueo real: el importador leía los datos de
`catalog.json`/`sources.json` pero registraba en `import_runs` el hash
del Excel presente; si el Excel se sustituía sin regenerar los
artefactos, la corrida acreditaría una versión que no es la importada.

Corregido como se pidió:
1. El pipeline incluye `sourceSha256` (SHA-256 del Excel) en
   `catalog.json` y en `sources.json`.
2. El importador comprueba **antes de migrar o abrir la transacción**
   que ambos hashes coinciden con el Excel presente; si falta el hash o
   difiere, aborta con el motivo y el hash esperado, **sin crear
   ninguna corrida**.
3. Prueba reproducible nueva: `npm run test:integrity`
   (`tests/import-integrity.mjs`) — sustituye el Excel por una copia con
   un byte añadido dejando los artefactos antiguos: la importación se
   rechaza (salida 1, motivo de hash) y `import_runs` no crece; al
   restaurar el Excel, la importación vuelve a funcionar y la corrida
   válida sí se registra. Resultado: **6/6 PASS**.

Repetida la verificación completa tras la corrección: importación
normal (0 altas, 0 cambios, 2.164 relaciones), humo de API **13/13** y
recorrido web **21/21**.
