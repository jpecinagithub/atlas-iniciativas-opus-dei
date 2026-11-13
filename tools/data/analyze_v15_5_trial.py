#!/usr/bin/env python3
"""
Batería de verificación de la migración en seco al v15-5 (Fase 8B,
2026-11-13, corrección con las decisiones cerradas de Jon).

Verifica el catálogo de PRUEBA del v15-5 (data/generated/v15-5-trial/)
contra lo decidido y contra el catálogo de prueba del v15-4:

  1. 1.411 IDs únicos.
  2. Exactamente las 14 categorías de la aplicación (las del v14) y
     ninguna más; frente al v15-4 solo se mueven los 10 registros
     normalizados por decisión de Jon.
  3. 1.317 con punto y 94 sin punto; ES-218 con el punto del GeoNames
     ID 8379312 y ES-219 con el del 3110718.
  4. 69 países con registros (República Dominicana, 0 en la hoja).
  5. Estados: parciales 1.311 · contrastados 52 · Pendiente 36 ·
     Histórico 11 · Confirmado 1 (solo PR-06).
  6. Relaciones por URL exacta: 2.167, el mismo conjunto que en el
     v15-4 (la hoja Fuentes no cambia).
  7. Cero GeoNames ID sin coordenadas o con país del extracto
     distinto del País ISO (comprobación exhaustiva punto↔extracto).
  8. Hoja Países del v15-5 == conteos derivados del Directorio en los
     70 países, identidad por país y suma total 1.411.
  9. Regresión v14: el catálogo regenerado del v14 (directorio dado
     por --regresion) es idéntico al de producción salvo marcas
     temporales y la clave meta.geoMode.
 10. v15-5 frente a v15-4: solo difieren los 10 cambios de categoría,
     los 3 estados PL, los 2 puntos nuevos y los metadatos/hoja
     Países; cualquier otra diferencia se lista.

Salidas en data/generated/: v15-5-pendientes-94.csv (los 94 «sin
resolver» clasificados por motivo) y v15-5-comparacion.json (todas
las cifras). No escribe en producción ni en los trial: solo lee.

Uso: .venv/bin/python tools/data/analyze_v15_5_trial.py [--regresion DIR]
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).parent))
from build_catalog import load_geonames_by_id, read_sheet_by_name, COLUMNAS  # noqa: E402
from build_v15_5_book import CATEGORIAS, ESTADOS_PL  # noqa: E402
from openpyxl import load_workbook  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / "data" / "generated"
TRIAL5 = GEN / "v15-5-trial"
TRIAL4 = GEN / "v15-4-trial"
PROD_CATALOG = ROOT / "apps" / "web" / "public" / "data" / "catalog.json"
BOOK5 = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v15-5.xlsx"

ESPERADO_ESTADOS = {"Confirmado con datos parciales": 1311, "Confirmado y contrastado": 52,
                    "Pendiente": 36, "Histórico": 11, "Confirmado": 1}
PUNTOS_NUEVOS = {"ES-218": (8379312, 41.63395, 1.86394), "ES-219": (3110718, 41.47063, 2.08611)}
CLASIFICACION_ESPERADA_94 = {
    "Conflicto de jerarquía administrativa": 28, "Varios candidatos GeoNames": 23,
    "Sin coincidencia GeoNames": 16, "Localidad múltiple o contradictoria": 14,
    "Sin localidad o sin nota explicativa": 3, "Conflicto de país": 3,
    "Dirección contradictoria": 2, "Otros casos manuales": 5,
}


def clasificar_motivo(nota: str | None, localidad: str | None) -> str:
    """Las mismas reglas literales del análisis del v15-4."""
    n = (nota or "").strip()
    if not n:
        return "Sin localidad o sin nota explicativa"
    if "en otro país" in n or "discrepancia de país" in n:
        return "Conflicto de país"
    if "localidad en conflicto o múltiple" in n or "multiciudad" in n:
        return "Localidad múltiple o contradictoria"
    if "candidatos GeoNames sin desempatar" in n:
        return "Varios candidatos GeoNames"
    if "fuera de la provincia indicada" in n:
        return "Conflicto de jerarquía administrativa"
    if "GeoNames: sin coincidencia" in n:
        return "Sin coincidencia GeoNames"
    if "la dirección menciona" in n and "se retira" in n:
        return "Dirección contradictoria"
    return "Otros casos manuales"


def relations(cat, sources_file):
    """Relaciones con la semántica exacta de apps/api/src/import.ts."""
    by_url: dict[str, list[str]] = defaultdict(list)
    for s in sources_file["sources"]:
        if s["url"]:
            by_url[s["url"]].append(s["id"])
    created = ambiguous = unmatched1 = unmatched2 = 0
    detalle = []
    for i in cat["initiatives"]:
        for role, url in (("fuente_1", i["source1"]), ("fuente_2", i["source2"])):
            if not url:
                continue
            ids = by_url.get(url, [])
            if len(ids) == 1:
                created += 1
                detalle.append((i["id"], ids[0], role))
            elif len(ids) > 1:
                ambiguous += 1
            elif role == "fuente_1":
                unmatched1 += 1
            else:
                unmatched2 += 1
    return {"created": created, "ambiguousUrl": ambiguous,
            "unmatchedFuente1": unmatched1, "unmatchedFuente2": unmatched2,
            "detalle": detalle}


def diff_registros(a: dict, b: dict, excluir=("geocodedAt",)):
    """Diferencias campo a campo entre dos dicts de iniciativas
    (mismo ID), como {campo: (valor_a, valor_b)}."""
    diffs = {}
    for k in sorted(set(a) | set(b)):
        if k in excluir:
            continue
        if a.get(k) != b.get(k):
            diffs[k] = (a.get(k), b.get(k))
    return diffs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--regresion", type=Path, default=Path("/tmp/v14-regresion"),
                    help="directorio con el catálogo del v14 regenerado")
    args = ap.parse_args()

    trial5 = json.loads((TRIAL5 / "catalog.json").read_text(encoding="utf-8"))
    trial5_sources = json.loads((TRIAL5 / "sources.json").read_text(encoding="utf-8"))
    trial4 = json.loads((TRIAL4 / "catalog.json").read_text(encoding="utf-8"))
    trial4_sources = json.loads((TRIAL4 / "sources.json").read_text(encoding="utf-8"))
    prod = json.loads(PROD_CATALOG.read_text(encoding="utf-8"))
    by_id, _origen = load_geonames_by_id()

    wb = load_workbook(BOOK5, read_only=True, data_only=True)
    d_dicts, _ = read_sheet_by_name(wb["Directorio"], COLUMNAS, required=[])
    book = {d["id"]: d for d in d_dicts}

    T5 = {i["id"]: i for i in trial5["initiatives"]}
    T4 = {i["id"]: i for i in trial4["initiatives"]}
    out: dict = {"bateria": {}}
    B = out["bateria"]

    # ------------------------------------------------------------ 1
    B["1_ids"] = {"registros": len(trial5["initiatives"]), "unicos": len(T5),
                  "ok": len(T5) == 1411 == len(trial5["initiatives"])}

    # ------------------------------------------------------------ 2
    canonicas = list(prod["meta"]["categories"])  # las 14 del v14/app
    cats5 = Counter(i["category"] for i in T5.values())
    cats4 = Counter(i["category"] for i in T4.values())
    B["2_categorias"] = {
        "canonicas_14": canonicas,
        "conteo_v15_5": dict(cats5),
        "fuera_de_paleta": {c: n for c, n in cats5.items() if c not in canonicas},
        "delta_vs_v15_4": {c: (cats4.get(c, 0), cats5.get(c, 0))
                           for c in set(cats4) | set(cats5) if cats4.get(c, 0) != cats5.get(c, 0)},
        "ok": sorted(cats5) == sorted(canonicas),
    }

    # ------------------------------------------------------ 3 y 7
    con_punto = [i for i in T5.values() if i["lat"] is not None]
    sin_punto = [i for i in T5.values() if i["lat"] is None]
    errores_punto = []
    for i in con_punto:
        gid, decl = i["geonameId"], i["geo"]["geonamesIdDeclared"]
        if gid != decl:
            errores_punto.append((i["id"], f"geonameId catálogo {gid} != declarado {decl}"))
            continue
        fila = by_id.get(gid)
        if fila is None:
            errores_punto.append((i["id"], f"ID {gid} ausente del extracto"))
        elif (fila["lat"], fila["lng"]) != (i["lat"], i["lng"]):
            errores_punto.append((i["id"], f"punto != extracto ({fila['lat']},{fila['lng']})"))
        elif fila["country"] != i["geo"]["countryIso"]:
            errores_punto.append((i["id"], f"país extracto {fila['country']} != ISO {i['geo']['countryIso']}"))
        if i["geo"]["precisionDeclared"] != "localidad":
            errores_punto.append((i["id"], "con punto sin Precisión «localidad»"))
    B["3_puntos"] = {"con_punto": len(con_punto), "sin_punto": len(sin_punto),
                     "ok": len(con_punto) == 1317 and len(sin_punto) == 94}
    for rid, (gid, lat, lng) in PUNTOS_NUEVOS.items():
        i = T5[rid]
        fila = by_id[gid]
        B["3_puntos"][rid] = {"geonameId": i["geonameId"], "lat": i["lat"], "lng": i["lng"],
                              "esperado": (lat, lng),
                              "ok": i["geonameId"] == gid and (i["lat"], i["lng"]) == (lat, lng)
                              and (fila["lat"], fila["lng"]) == (lat, lng)}
    B["7_exhaustivo_extracto"] = {
        "errores": errores_punto,
        "ids_no_encontrados": sorted({i["geo"]["geonamesIdDeclared"] for i in T5.values()
                                      if i["geo"]["precisionDeclared"] == "localidad"
                                      and i["geo"]["geonamesIdDeclared"] not in by_id}),
        "sin_resolver_con_punto": [i["id"] for i in T5.values()
                                   if i["geo"]["precisionDeclared"] == "sin resolver" and i["lat"] is not None],
        "localidad_sin_punto": [i["id"] for i in T5.values()
                                if i["geo"]["precisionDeclared"] == "localidad" and i["lat"] is None],
        "ids_distintos": len({i["geo"]["geonamesIdDeclared"] for i in T5.values()
                              if i["geo"]["geonamesIdDeclared"] is not None}),
        "ok": not errores_punto,
    }

    # ------------------------------------------------------------ 4
    B["4_paises"] = {"con_registros": sum(1 for c in trial5["countries"] if c["computedTotal"] > 0),
                     "filas_en_catalogo": len(trial5["countries"]),
                     "ok": sum(1 for c in trial5["countries"] if c["computedTotal"] > 0) == 69}

    # ------------------------------------------------------------ 5
    estados5 = Counter(i["verificationState"] for i in T5.values())
    confirmados = [i["id"] for i in T5.values() if i["verificationState"] == "Confirmado"]
    B["5_estados"] = {"conteo": dict(estados5), "esperado": ESPERADO_ESTADOS,
                      "confirmado_suelto": confirmados,
                      "ok": dict(estados5) == ESPERADO_ESTADOS and confirmados == ["PR-06"]}

    # ------------------------------------------------------------ 6
    rel5 = relations(trial5, trial5_sources)
    rel4 = relations(trial4, trial4_sources)
    B["6_relaciones"] = {
        "v15_5": {k: v for k, v in rel5.items() if k != "detalle"},
        "v15_4": {k: v for k, v in rel4.items() if k != "detalle"},
        "mismo_conjunto_que_v15_4": sorted(rel5["detalle"]) == sorted(rel4["detalle"]),
        "fuentes_total_v15_5": trial5_sources["total"], "fuentes_total_v15_4": trial4_sources["total"],
        "fuentes_identicas": trial5_sources["sources"] == trial4_sources["sources"],
        "ok": rel5["created"] == 2167 and sorted(rel5["detalle"]) == sorted(rel4["detalle"]),
    }


    # ------------------------------------------------------------ 8
    ws = wb["Países"]
    hdr = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column + 1)]
    pos = {h: i + 1 for i, h in enumerate(hdr)}
    derivados = {c["name"]: c for c in trial5["countries"]}
    prob8, suma_total = [], 0
    mapa = {"Confirmado y contrastado": "contrastado", "Confirmado con datos parciales": "parcial",
            "Confirmado": "confirmado", "Pendiente": "pendiente", "Histórico": "historico"}
    for r in range(2, ws.max_row + 1):
        nombre = ws.cell(row=r, column=pos["País"]).value
        if not nombre:
            continue
        hoja = {"total": ws.cell(row=r, column=pos["Nº registros"]).value}
        for estado, clave in mapa.items():
            hoja[clave] = ws.cell(row=r, column=pos[estado]).value
        c = derivados[nombre]
        der = {"total": c["computedTotal"]}
        for estado, clave in mapa.items():
            der[clave] = c["computedVerification"].get(estado, 0)
        suma_total += hoja["total"]
        if hoja != der:
            prob8.append({"pais": nombre, "hoja": hoja, "derivado": der})
        if hoja["total"] != sum(hoja[k] for k in mapa.values()):
            prob8.append({"pais": nombre, "error": "identidad interna rota", "hoja": hoja})
    B["8_hoja_paises"] = {"paises_comprobados": 70, "problemas": prob8,
                          "suma_total_hoja": suma_total, "ok": not prob8 and suma_total == 1411}

    # ------------------------------------------------------------ 9
    reg = json.loads((args.regresion / "catalog.json").read_text(encoding="utf-8"))
    reg_sources = json.loads((args.regresion / "sources.json").read_text(encoding="utf-8"))
    prod_sources = json.loads((GEN / "sources.json").read_text(encoding="utf-8"))
    R = {i["id"]: i for i in reg["initiatives"]}
    P = {i["id"]: i for i in prod["initiatives"]}
    dif9 = []
    if set(R) != set(P):
        dif9.append(f"IDs distintos: +{sorted(set(R) - set(P))} -{sorted(set(P) - set(R))}")
    for rid in sorted(set(R) & set(P)):
        d = diff_registros(R[rid], P[rid])
        if d:
            dif9.append({"id": rid, "campos": {k: (str(v[0])[:60], str(v[1])[:60]) for k, v in d.items()}})
    paises_dif9 = [c["code"] for c, cp in zip(reg["countries"], prod["countries"]) if c != cp]
    geojson_ok = (args.regresion / "countries.geojson").read_bytes() == \
        (ROOT / "apps" / "web" / "public" / "data" / "countries.geojson").read_bytes()
    meta_dif9 = {k for k in set(reg["meta"]) | set(prod["meta"])
                 if reg["meta"].get(k) != prod["meta"].get(k)} - {"generatedAt", "geoMode"}
    B["9_regresion_v14"] = {
        "diferencias_iniciativas": dif9, "paises_distintos": paises_dif9,
        "geojson_byte_a_byte": geojson_ok,
        "fuentes_identicas": reg_sources["sources"] == prod_sources["sources"]
        and reg_sources["total"] == prod_sources["total"],
        "meta_difiere_solo_en": sorted(meta_dif9),
        "ok": not dif9 and not paises_dif9 and geojson_ok and not meta_dif9,
    }

    # ----------------------------------------------------------- 10
    difs10 = []
    for rid in sorted(T5):
        d = diff_registros(T4[rid], T5[rid])
        if d:
            difs10.append({"id": rid, "campos": d})
    por_campo = Counter()
    for e in difs10:
        for campo in e["campos"]:
            por_campo[campo] += 1
    cats_cambiadas = {e["id"]: e["campos"]["category"] for e in difs10 if "category" in e["campos"]}
    estados_cambiados = {e["id"]: e["campos"]["verificationState"] for e in difs10
                         if "verificationState" in e["campos"]}
    esperado_cat = {rid: (antes, canonica) for rid, (antes, canonica) in CATEGORIAS.items()}
    paises10 = []
    c4 = {c["code"]: c for c in trial4["countries"]}
    for c in trial5["countries"]:
        d = diff_registros(c4[c["code"]], c)
        if d:
            paises10.append({"code": c["code"], "campos": list(d)})
    meta10 = {k: (trial4["meta"].get(k), trial5["meta"].get(k))
              for k in set(trial4["meta"]) | set(trial5["meta"])
              if trial4["meta"].get(k) != trial5["meta"].get(k) and k != "generatedAt"}
    B["10_vs_v15_4"] = {
        "registros_con_diferencias": [e["id"] for e in difs10],
        "diferencias_por_campo": dict(por_campo),
        "categorias": cats_cambiadas, "categorias_ok": cats_cambiadas == esperado_cat,
        "estados": estados_cambiados,
        "estados_ok": estados_cambiados == {rid: ("Confirmado", "Confirmado y contrastado")
                                           for rid in ESTADOS_PL},
        "paises_con_diferencias": paises10,
        "meta_distinta": {k: (str(v[0])[:80], str(v[1])[:80]) for k, v in meta10.items()},
        "detalle": difs10,
    }

    # ------------------------------------------------- pendientes 94
    filas = []
    for i in sin_punto:
        d = book[i["id"]]
        filas.append({
            "id": i["id"], "nombre": i["name"], "pais": i["country"], "codigo_pais": i["countryCode"],
            "localidad_clasica": (d["locality"] or ""), "ciudad_canonica": (d.get("geo_canonical_city") or ""),
            "provincia_estado_geo": (d.get("geo_province") or ""),
            "direccion": (d["address"] or ""), "fuente_geografica": (d.get("geo_source") or ""),
            "motivo": clasificar_motivo(d.get("geo_notes"), d["locality"]),
            "nota_geografica": (d.get("geo_notes") or ""),
        })
    filas.sort(key=lambda f: (f["motivo"], f["id"]))
    with open(GEN / "v15-5-pendientes-94.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        w.writeheader(); w.writerows(filas)
    conteo = Counter(f["motivo"] for f in filas)
    out["clasificacion_94"] = {"cruce": dict(conteo), "esperada": CLASIFICACION_ESPERADA_94,
                               "ok": dict(conteo) == CLASIFICACION_ESPERADA_94}

    (GEN / "v15-5-comparacion.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    resumen = {k: (v.get("ok") if isinstance(v, dict) else v) for k, v in B.items()}
    print("BATERÍA:", json.dumps(resumen, ensure_ascii=False, indent=1))
    print("clasificación 94 ok:", out["clasificacion_94"]["ok"], dict(conteo))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
