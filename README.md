# Atlas de iniciativas · Opus Dei

Web app para explorar visualmente la presencia y las iniciativas vinculadas
al Opus Dei en el mundo, a partir del directorio verificado
`Directorio_Opus_Dei_MUNDIAL_v14.xlsx` (1.382 registros, 70 países o
territorios, 14 categorías).

Estado: **Fase 2** (primera experiencia visual). El catálogo es JSON
generado del Excel; PostgreSQL y la API completa llegan en la Fase 3.
Ver `docs/fase-1-informe.md` y `docs/fase-2-informe.md`.

## Puesta en marcha

Requisitos: Node 20+ y Python 3.11+.

```bash
# 1) Dependencias
npm install

# 2) Datos (solo si hay que regenerar el catálogo)
python3 -m venv tools/data/.venv
tools/data/.venv/bin/pip install -r tools/data/requirements.txt
#    Descargas previas en data/cache/ (ver «Datos» más abajo)
npm run data        # genera apps/web/public/data/catalog.json + countries.geojson

# 3) Desarrollo
npm run dev         # http://127.0.0.1:5173

# 4) Producción local
npm run build       # tsc --noEmit + vite build → apps/web/dist
cd apps/web && npx vite preview --port 4173
```

La ruta base es configurable para un despliegue en subruta:
`VITE_BASE_PATH=/subruta/ npm run build`.

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

```bash
node tests/functional-route.mjs   # con la app servida en :4173
```

Recorre Mundo → España → Colegios → ficha de Tajamar → marcador 3D →
restablecer, Países Bajos y un registro sin coordenadas, y deja las
capturas en `docs/screenshots/`. Resultado de la entrega: **15/15**.

## Estructura

```
apps/web/        React + TypeScript + Vite, MapLibre GL, Three.js, Zustand
tools/data/      Pipeline Python (openpyxl + httpx)
data/source/     Excel v14 (original intacto)
data/generated/  Informes de generación
docs/            Informes de fase y capturas
tests/           Recorrido funcional documentado
```
