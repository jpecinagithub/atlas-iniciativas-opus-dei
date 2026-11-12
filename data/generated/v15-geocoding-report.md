# Informe geográfico del v15 — Fase 8A (solo análisis)

Generado por `tools/data/audit_v14_v15.py` ejecutando el pipeline
actual (`build_catalog.py`) sobre el v15 en una caja de análisis
aislada, con las filas reordenadas **por nombre de cabecera** al
orden v14 (el generador lee por posición; ver §1 del informe
principal). Ninguna coordenada nueva queda aceptada para
producción: esto es un análisis comparativo.

## Resolución de ubicaciones

| | v14 | v15 |
|---|---|---|
| Con punto (localidad resuelta) | 942 | 936 |
| Ambiguas (sin punto) | 79 | 80 |
| Sin coincidencia (sin punto) | 356 | 356 |
| Sin localidad utilizable | 5 | 5 |
| **Total sin punto** | 440 | 441 |

## Comparación por ID (sobre los 1377 registros comunes)

- **Ganan punto:** 0 — —
- **Pierden punto:** 1 — `AU-08`
- **Cambian de geonameId conservando punto:** 0
- **Coordenadas distintas con el mismo geonameId y sin cambio del texto de localidad:** 0
- **Texto de localidad modificado:** 1 — `AU-08`
- **Texto de región modificado:** 0

El descenso neto de puntos (942 → 936)
se descompone en: los registros ausentes en v15 que tenían punto
y el único registro común que pierde el punto,
`AU-08`: su
localidad pasa a un nombre más preciso que el gazetteer no
resuelve de forma única (queda ambiguo). Es candidato a
corrección manual en la 8B; no se ha aceptado coordenada alguna.
