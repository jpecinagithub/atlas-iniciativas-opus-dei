#!/usr/bin/env python3
"""Puntos de etiqueta de país para el mapa.

Deriva un punto por país desde countries.geojson (el polígono mayor
de cada país y el centroide de su anillo exterior): las etiquetas de
MapLibre sobre polígonos repetirían el nombre en cada isla o
territorio separado (España saldría también en Canarias y Baleares).
Un punto por país, calculado de la geometría real, no inventado.

Uso: python3 tools/data/build_labels.py
Salida: apps/web/public/data/countries-labels.geojson
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SRC = os.path.join(ROOT, "apps", "web", "public", "data", "countries.geojson")
DST = os.path.join(ROOT, "apps", "web", "public", "data", "countries-labels.geojson")


def ring_area_centroid(ring):
    """Área con signo y centroide de un anillo (fórmula de la zapata)."""
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        cross = x1 * y2 - x2 * y1
        a += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    a *= 0.5
    if abs(a) < 1e-12:
        n = max(len(ring), 1)
        return 0.0, (sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n)
    return abs(a), (cx / (6 * a), cy / (6 * a))


def polygons(geom):
    if geom["type"] == "Polygon":
        yield geom["coordinates"]
    elif geom["type"] == "MultiPolygon":
        yield from geom["coordinates"]


def main():
    with open(SRC, encoding="utf-8") as fh:
        gj = json.load(fh)
    # Solo los países del directorio (70), con su nombre en español del
    # catálogo: el fondo de Natural Earth trae los ~241 países y sus
    # nombres en inglés, que no son los de la app.
    catalog_path = os.path.join(ROOT, "apps", "web", "public", "data", "catalog.json")
    with open(catalog_path, encoding="utf-8") as fh:
        catalog = json.load(fh)
    names = {c["code"]: c["name"] for c in catalog["countries"]}
    features = []
    for feat in gj["features"]:
        code = feat["properties"]["code"]
        if code not in names:
            continue
        best = None
        for poly in polygons(feat["geometry"]):
            area, centroid = ring_area_centroid(poly[0])
            if best is None or area > best[0]:
                best = (area, centroid)
        if best is None:
            continue
        features.append({
            "type": "Feature",
            "properties": {"code": code, "name": names[code]},
            "geometry": {"type": "Point", "coordinates": [round(best[1][0], 4), round(best[1][1], 4)]},
        })
    out = {"type": "FeatureCollection", "features": features}
    with open(DST, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(features)} puntos de etiqueta -> {DST}")


if __name__ == "__main__":
    main()
