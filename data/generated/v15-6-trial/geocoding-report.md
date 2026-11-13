# Informe de resolución de ubicaciones por GeoNames ID (Fase 8B, migración en seco)

Generado: 2026-11-13T14:38:55Z · Fuente: Directorio_Opus_Dei_MUNDIAL_v15-6.xlsx · Gazetteer: GeoNames, extracto local por ID (cities1000.txt + geonames_countries/<CC>.txt, descargado 2026-11-11, CC BY 4.0)

- Resueltas por GeoNames ID declarado (Precisión = localidad): **1387** (desde cities1000.txt: 1309; desde el dump por país: 78)
- Declaradas «sin resolver» en el libro (sin punto, sin re-geocodificar): **22**
- Correcciones manuales aplicadas: **0**
- IDs no encontrados en el extracto local (sin punto, laguna): **0**
- IDs cuyo país en el extracto difiere del País ISO (sin punto, anomalía): **0**
- País ISO distinto del Código país SIN excepción expresa (sin punto, anomalía): **0**
- País ISO distinto del Código país con excepción exacta de la lista cerrada (observación, no bloquea): **2**
- Total con punto: **1387 / 1409**.

## Anomalías del modo por ID

- Ninguna: todos los IDs declarados se encontraron en el extracto y en su país.

## Observaciones de trazabilidad (no bloquean el punto)

- `IE-15` (GeoNames ID 2655984): iso_differs_from_country_code_exception — País ISO «GB» != Código país «IE»: combinación exacta incluida en la lista cerrada de excepciones geográficas (directorio IE, geografía GB); el punto se resuelve por ID si el extracto coincide con el País ISO
- `IE-16` (GeoNames ID 2655984): iso_differs_from_country_code_exception — País ISO «GB» != Código país «IE»: combinación exacta incluida en la lista cerrada de excepciones geográficas (directorio IE, geografía GB); el punto se resuelve por ID si el extracto coincide con el País ISO

Códigos del directorio sin correspondencia en Natural Earth 50m: ninguno.
