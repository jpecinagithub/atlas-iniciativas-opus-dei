# Atlas de iniciativas · Opus Dei

Web app para explorar visualmente la presencia y las iniciativas vinculadas
al Opus Dei en el mundo, a partir del directorio verificado
`Directorio_Opus_Dei_MUNDIAL_v14.xlsx` (1.382 registros, 70 países o
territorios, 14 categorías).

Estado: **Fase 3** (datos completos y backend). La web lee el catálogo de
una API (Fastify) servida desde PostgreSQL, importado del Excel con un
proceso transaccional e idempotente. Ver `docs/fase-1-informe.md`,
`docs/fase-2-informe.md` y `docs/fase-3-informe.md`.

## Puesta en marcha

Requisitos: Node 20+, Python 3.11+ y un PostgreSQL 16 accesible
(propio del proyecto; en local puedes levantarlo con
`docker compose up -d db` o usar uno ya instalado, creando la base y el
usuario `atlas` — ver `apps/api/.env.example`).

```bash
# 1) Dependencias
npm install

# 2) Datos (solo si hay que regenerar los artefactos desde el Excel)
python3 -m venv tools/data/.venv
tools/data/.venv/bin/pip install -r tools/data/requirements.txt
#    Descargas previas en data/cache/ (ver «Datos» más abajo)
npm run data        # catalog.json + countries.geojson + sources.json

# 3) Base de datos: migraciones + importación (idempotente)
npm run import      # informa altas/cambios/ausentes; no borra nada

# 4) API y web (dos terminales)
npm run api         # http://127.0.0.1:3001 (GET /api/health, /api/catalog…)
npm run dev         # http://127.0.0.1:5173 (Vite redirige /api a la API)

# 5) Producción local
npm run build       # tsc --noEmit + vite build → apps/web/dist
cd apps/web && npx vite preview --port 4173   # también redirige /api
```

Variables: `DATABASE_URL` y `PORT` para la API (defectos de desarrollo
en `apps/api/.env.example`). La ruta base es configurable para un
despliegue en subruta: `VITE_BASE_PATH=/subruta/ npm run build`.

Comprobaciones: `npm run test:api` (humo de la API, 13 comprobaciones),
`npm run test:integrity` (el importador rechaza artefactos que no
proceden del Excel presente, sin registrar la corrida) y
`npm run test:functional` (recorrido web completo; arranca la API si no
responde y la importación si la base está vacía).

## Datos

Fuente única: `data/source/Directorio_Opus_Dei_MUNDIAL_v14.xlsx` (no se
modifica). El pipeline `tools/data/build_catalog.py`:

1. Lee las 3 hojas conservando todos los valores originales.
2. Normaliza para búsqueda/filtros (por campo y por valor completo; «NL»
   en Código país es Países Bajos, nunca «No localizado»).
3. Resuelve ubicaciones de localidad con extractos **locales** de
   GeoNames (CC BY 4.0): `cities1000` y, en segunda pasada, el extracto
   completo por país (solo lugares poblados). Coincidencia exacta dentro
   del país, desambiguación por región cuando es posible; las ambiguas
   quedan **sin coordenada**. Se conserva el `geonameId` de cada
   coincidencia aceptada. Caché persistente en `data/cache/` y
   correcciones manuales en `tools/data/manual_corrections.json`.
4. Genera la base cartográfica desde Natural Earth 50m (los 70 códigos
   verificados; Francia y Noruega llegan con ISO_A2=-99 y se corresponden
   por ADM0_A3, documentado en el pipeline) y los encuadres por país.
5. Escribe el informe `data/generated/geocoding-report.md`.

Descargas previas (en `data/cache/`): de GeoNames,
`cities1000.zip`, `admin1CodesASCII.txt` y `<CC>.zip` por país; de
Natural Earth (mirror GeoJSON), `ne_50m_admin_0_countries.json`.

Sin clave CARTO (la documentación actual la exige), el mapa usa la base
local de países de Natural Earth en oscuro, limitada a ese detalle: no
hay calles. La configuración del estilo es intercambiable.

## Verificación de la Fase 2

Reproducible desde un clon limpio (Playwright es dependencia de
desarrollo del repo y el recorrido arranca su propio servidor de preview):

```bash
npm ci
npx playwright install chromium   # navegador administrado por Playwright
npm run test:functional           # compila la app y ejecuta el recorrido
```

Recorre Mundo → España → Colegios → ficha de Tajamar → marcador 3D →
restablecer, Países Bajos, un registro sin coordenadas y la navegación
atrás/adelante del navegador, y deja las capturas en `docs/screenshots/`.
Resultado tras las correcciones de la revisión: **21/21**.

La URL refleja filtros y selección y participa en el historial: cambiar
de país, de categorías o de selección crea una entrada navegable;
escribir en el buscador solo actualiza la entrada actual.

## Estructura

```
apps/web/        React + TypeScript + Vite, MapLibre GL, Three.js, Zustand
apps/api/        API Fastify + PostgreSQL (pg) e importador del Excel
db/migrations/   Esquema SQL versionado
tools/data/      Pipeline Python (openpyxl + httpx)
data/source/     Excel v14 (original intacto)
data/generated/  Informes de generación y catálogo de fuentes (sources.json)
docs/            Informes de fase y capturas
tests/           Recorrido funcional documentado y humo de la API
```
