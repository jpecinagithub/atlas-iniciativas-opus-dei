#!/usr/bin/env python3
"""
Batería de verificación de la migración en seco al v15-6 (Fase 8C,
2026-11-13): catálogo de prueba data/generated/v15-6-trial/ generado
desde la copia normalizada Directorio_Opus_Dei_MUNDIAL_v15-6.xlsx.

Verifica, contra lo certificado y contra el v15-5 EN PRODUCCIÓN
(apps/web/public/data/catalog.json + data/generated/sources.json):

  1. 1.409 IDs únicos.
  2. Exactamente las 14 categorías canónicas; delta de conteos.
  3. 1.387 con punto y 22 sin punto; comprobación exhaustiva
     punto↔extracto por GeoNames ID; ningún «sin resolver» con
     punto; ninguna «localidad» sin punto; observaciones de
     trazabilidad IE-15/IE-16 (Belfast, ISO GB ≠ código IE).
  4. 69 países con registros, 70 filas.
  5. Estados: parciales 1.309 · contrastados 52 · Pendiente 36 ·
     Histórico 11 · Confirmado 1 (solo PR-06).
  6. Relaciones por URL exacta con la semántica del importador:
     2.159 creadas, 8 ambiguas, 130 F1 y 210 F2 sin coincidencia en
     el catálogo; y en la base del LIBRO (celdas crudas, la base de
     la proyección de Codex): 180 F1 y 471 F2 sin coincidencia.
     Descomposición del neto −8 frente a producción: 11 perdidas
     (7 por las bajas del registro, 4 por citas editadas en el
     libro nuevo) y 3 ganadas (las altas), cada una con su causa.
     Fuentes: 2.728 (+4 nuevas, 0 retiradas, 0 URL cambiadas);
     14 URL duplicadas.
  7. Hoja Países del v15-6 == conteos derivados del Directorio en
     los 70 países, identidad por país y suma 1.409.
  8. Regresión del generador sobre el v14 (referencia: el catálogo
     de producción v14 extraído del historial git) y sobre el v15-5
     (referencia: producción actual): sin diferencias de datos.
  9. Comparación completa v15-6 vs v15-5: altas [CO-37, ES-301,
     ES-302], bajas [CO-32, ES-153, ES-219, ES-230, MX-47], cambios
     por campo, puntos ganados (70: el libro nuevo asigna GeoNames
     ID a registros que el v15-5 dejaba sin resolver), puntos
     perdidos intencionados [ES-218, ES-240], desplazados: ninguno.

Salidas en data/generated/: v15-6-comparacion.json (todas las
cifras), v15-6-sin-punto-22.csv y v15-6-relaciones.csv (perdidas y
ganadas con causa). Solo lee: no escribe en producción ni en trial.

Uso: .venv/bin/python tools/data/analyze_v15_6_trial.py \
    [--regresion-v14 DIR] [--ref-v14 DIR] [--regresion-v15-5 DIR]
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_catalog import load_geonames_by_id, read_sheet_by_name, COLUMNAS  # noqa: E402
from build_v15_6_book import CATEGORIAS, ESTADOS_PL  # noqa: E402
from openpyxl import load_workbook  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / "data" / "generated"
TRIAL = GEN / "v15-6-trial"
PROD_CATALOG = ROOT / "apps" / "web" / "public" / "data" / "catalog.json"
PROD_SOURCES = GEN / "sources.json"
BOOK6 = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v15-6.xlsx"

ESPERADO_ESTADOS = {"Confirmado con datos parciales": 1309, "Confirmado y contrastado": 52,
                    "Pendiente": 36, "Histórico": 11, "Confirmado": 1}
ALTAS = ["CO-37", "ES-301", "ES-302"]
BAJAS = ["CO-32", "ES-153", "ES-219", "ES-230", "MX-47"]
PERDIDOS_INTENCIONADOS = ["ES-218", "ES-240"]


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
    diffs = {}
    for k in sorted(set(a) | set(b)):
        if k in excluir:
            continue
        if a.get(k) != b.get(k):
            diffs[k] = (a.get(k), b.get(k))
    return diffs


def comparacion_regresion(reg_dir: Path, ref_catalog: Path, ref_sources: Path, ref_geojson: Path | None):
    reg = json.loads((reg_dir / "catalog.json").read_text(encoding="utf-8"))
    reg_sources = json.loads((reg_dir / "sources.json").read_text(encoding="utf-8"))
    ref = json.loads(ref_catalog.read_text(encoding="utf-8"))
    ref_src = json.loads(ref_sources.read_text(encoding="utf-8"))
    R = {i["id"]: i for i in reg["initiatives"]}
    P = {i["id"]: i for i in ref["initiatives"]}
    dif = []
    if set(R) != set(P):
        dif.append(f"IDs distintos: +{sorted(set(R) - set(P))} -{sorted(set(P) - set(R))}")
    for rid in sorted(set(R) & set(P)):
        d = diff_registros(R[rid], P[rid])
        if d:
            dif.append({"id": rid, "campos": {k: (str(v[0])[:60], str(v[1])[:60]) for k, v in d.items()}})
    paises_dif = [c["code"] for c, cp in zip(reg["countries"], ref["countries"]) if c != cp]
    geojson_ok = None
    if ref_geojson is not None:
        geojson_ok = (reg_dir / "countries.geojson").read_bytes() == ref_geojson.read_bytes()
    meta_dif = {k for k in set(reg["meta"]) | set(ref["meta"])
                if reg["meta"].get(k) != ref["meta"].get(k)} - {"generatedAt", "geoMode"}
    return {
        "diferencias_iniciativas": dif, "paises_distintos": paises_dif,
        "geojson_byte_a_byte": geojson_ok,
        "fuentes_identicas": reg_sources["sources"] == ref_src["sources"]
        and reg_sources["total"] == ref_src["total"],
        "meta_difiere_solo_en": sorted(meta_dif),
        "ok": not dif and not paises_dif and geojson_ok is not False and not meta_dif,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--regresion-v14", type=Path, default=Path("/tmp/v14-regresion-8c"))
    ap.add_argument("--ref-v14", type=Path, default=Path("/tmp/v14-ref-8c"))
    ap.add_argument("--regresion-v15-5", type=Path, default=Path("/tmp/v15-5-regresion-8c"))
    args = ap.parse_args()

    trial = json.loads((TRIAL / "catalog.json").read_text(encoding="utf-8"))
    trial_sources = json.loads((TRIAL / "sources.json").read_text(encoding="utf-8"))
    prod = json.loads(PROD_CATALOG.read_text(encoding="utf-8"))
    prod_sources = json.loads(PROD_SOURCES.read_text(encoding="utf-8"))
    by_id, _origen = load_geonames_by_id()

    wb = load_workbook(BOOK6, read_only=True, data_only=True)
    d_dicts, _ = read_sheet_by_name(wb["Directorio"], COLUMNAS, required=[])
    book = {d["id"]: d for d in d_dicts}

    T = {i["id"]: i for i in trial["initiatives"]}
    P = {i["id"]: i for i in prod["initiatives"]}
    out: dict = {"bateria": {}}
    B = out["bateria"]

    # ------------------------------------------------------------ 1
    B["1_ids"] = {"registros": len(trial["initiatives"]), "unicos": len(T),
                  "ok": len(T) == 1409 == len(trial["initiatives"])}

    # ------------------------------------------------------------ 2
    canonicas = list(prod["meta"]["categories"])
    cats = Counter(i["category"] for i in T.values())
    cats_prod = Counter(i["category"] for i in P.values())
    B["2_categorias"] = {
        "canonicas_14": canonicas,
        "conteo_v15_6": dict(cats),
        "fuera_de_paleta": {c: n for c, n in cats.items() if c not in canonicas},
        "delta_vs_v15_5": {c: (cats_prod.get(c, 0), cats.get(c, 0))
                           for c in set(cats_prod) | set(cats) if cats_prod.get(c, 0) != cats.get(c, 0)},
        "ok": sorted(cats) == sorted(canonicas),
    }

    # ------------------------------------------------------------ 3
    con_punto = [i for i in T.values() if i["lat"] is not None]
    sin_punto = [i for i in T.values() if i["lat"] is None]
    errores = []
    for i in con_punto:
        gid, decl = i["geonameId"], i["geo"]["geonamesIdDeclared"]
        if gid != decl:
            errores.append((i["id"], f"geonameId catálogo {gid} != declarado {decl}"))
            continue
        fila = by_id.get(gid)
        if fila is None:
            errores.append((i["id"], f"ID {gid} ausente del extracto"))
        elif (fila["lat"], fila["lng"]) != (i["lat"], i["lng"]):
            errores.append((i["id"], f"punto != extracto ({fila['lat']},{fila['lng']})"))
        elif fila["country"] != i["geo"]["countryIso"]:
            errores.append((i["id"], f"país extracto {fila['country']} != ISO {i['geo']['countryIso']}"))
        if i["geo"]["precisionDeclared"] != "localidad":
            errores.append((i["id"], "con punto sin Precisión «localidad»"))
    obs = [i["id"] for i in T.values() if i["geo"]["countryIso"] != i["countryCode"]]
    B["3_puntos"] = {
        "con_punto": len(con_punto), "sin_punto": len(sin_punto),
        "sin_resolver_con_punto": [i["id"] for i in T.values()
                                   if i["geo"]["precisionDeclared"] == "sin resolver" and i["lat"] is not None],
        "localidad_sin_punto": [i["id"] for i in T.values()
                                if i["geo"]["precisionDeclared"] == "localidad" and i["lat"] is None],
        "observaciones_iso_distinto_codigo": {rid: (T[rid]["lat"], T[rid]["lng"]) for rid in obs},
        "errores_extracto": errores,
        "ok": len(con_punto) == 1387 and len(sin_punto) == 22 and not errores and obs == ["IE-15", "IE-16"],
    }

    # ------------------------------------------------------------ 4
    B["4_paises"] = {"con_registros": sum(1 for c in trial["countries"] if c["computedTotal"] > 0),
                     "filas_en_catalogo": len(trial["countries"]),
                     "ok": sum(1 for c in trial["countries"] if c["computedTotal"] > 0) == 69
                     and len(trial["countries"]) == 70}

    # ------------------------------------------------------------ 5
    estados = Counter(i["verificationState"] for i in T.values())
    confirmados = [i["id"] for i in T.values() if i["verificationState"] == "Confirmado"]
    estados_prod = Counter(i["verificationState"] for i in P.values())
    B["5_estados"] = {"conteo": dict(estados), "esperado": ESPERADO_ESTADOS,
                      "confirmado_suelto": confirmados,
                      "delta_vs_v15_5": {e: (estados_prod.get(e, 0), estados.get(e, 0))
                                         for e in set(estados_prod) | set(estados)
                                         if estados_prod.get(e, 0) != estados.get(e, 0)},
                      "ok": dict(estados) == ESPERADO_ESTADOS and confirmados == ["PR-06"]}

    # ------------------------------------------------------------ 6
    rel = relations(trial, trial_sources)
    rel_prod = relations(prod, prod_sources)
    set_rel = set(rel["detalle"]); set_prod = set(rel_prod["detalle"])
    perdidas = sorted(set_prod - set_rel)
    ganadas = sorted(set_rel - set_prod)
    S = {s["id"]: s for s in trial_sources["sources"]}
    SP = {s["id"]: s for s in prod_sources["sources"]}
    detalle_rel = []
    for rid, sid, role in perdidas:
        campo = "source1" if role == "fuente_1" else "source2"
        if rid in BAJAS:
            causa = "La iniciativa es una de las 5 bajas del directorio: su relación desaparece con ella."
        else:
            causa = (f"La cita de la iniciativa cambió en el libro nuevo ({campo}: "
                     f"«{P[rid][campo]}» → «{T[rid][campo]}») y la URL nueva no tiene "
                     f"fila en Fuentes; la fila {sid} conserva la URL antigua.")
        detalle_rel.append({"tipo": "perdida", "iniciativa": rid, "fuente": sid, "rol": role, "causa": causa})
    for rid, sid, role in ganadas:
        detalle_rel.append({"tipo": "ganada", "iniciativa": rid, "fuente": sid, "rol": role,
                            "causa": "Alta del directorio nuevo: su cita coincide por URL exacta con la fila de Fuentes."})
    urls_dup = [u for u, n in Counter(s["url"] for s in trial_sources["sources"] if s["url"]).items() if n > 1]
    B["6_relaciones"] = {
        "v15_6": {k: v for k, v in rel.items() if k != "detalle"},
        "v15_5_produccion": {k: v for k, v in rel_prod.items() if k != "detalle"},
        "perdidas": len(perdidas), "ganadas": len(ganadas),
        "neto": len(set_rel) - len(set_prod),
        "detalle": detalle_rel,
        "fuentes": {"total_v15_6": trial_sources["total"], "total_v15_5": prod_sources["total"],
                    "nuevas": sorted(set(S) - set(SP)), "retiradas": sorted(set(SP) - set(S)),
                    "url_cambiadas": [sid for sid in set(S) & set(SP) if S[sid]["url"] != SP[sid]["url"]]},
        "urls_duplicadas": len(urls_dup),
        "ok": rel["created"] == 2159 and rel["ambiguousUrl"] == 8
        and rel["unmatchedFuente1"] == 130 and rel["unmatchedFuente2"] == 210
        and len(perdidas) == 11 and len(ganadas) == 3 and len(urls_dup) == 14,
    }
    with open(GEN / "v15-6-relaciones.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["tipo", "iniciativa", "fuente", "rol", "causa"])
        w.writeheader(); w.writerows(detalle_rel)

    # --------------------------------------- 6b. Base del libro (celdas crudas)
    ws_f = wb["Fuentes"]
    f_hdr = [c.value for c in ws_f[1]]
    f_pos = {h: i for i, h in enumerate(f_hdr)}
    by_url_raw: Counter = Counter()
    n_fuentes_libro = 0
    for row in ws_f.iter_rows(min_row=2, values_only=True):
        if not row[f_pos["ID fuente"]]:
            continue
        n_fuentes_libro += 1
        if row[f_pos["URL"]]:
            by_url_raw[row[f_pos["URL"]]] += 1
    crudo = {}
    for nombre, clave in (("Fuente 1", "source1"), ("Fuente 2", "source2")):
        vals = [d[clave] for d in book.values() if d[clave] not in (None, "")]
        crudo[nombre] = {
            "no_vacias": len(vals),
            "exactas": sum(1 for v in vals if by_url_raw.get(v, 0) == 1),
            "ambiguas": sum(1 for v in vals if by_url_raw.get(v, 0) > 1),
            "sin_coincidencia": sum(1 for v in vals if by_url_raw.get(v, 0) == 0),
        }
    B["6b_relaciones_base_libro"] = {
        "fuentes_en_libro": n_fuentes_libro, "por_columna": crudo,
        "ok": crudo["Fuente 1"]["sin_coincidencia"] == 180 and crudo["Fuente 2"]["sin_coincidencia"] == 471
        and crudo["Fuente 1"]["ambiguas"] + crudo["Fuente 2"]["ambiguas"] == 8,
    }

    # ------------------------------------------------------------ 7
    ws = wb["Países"]
    hdr = [ws.cell(row=1, column=c).value for c in range(1, ws.max_column + 1)]
    pos = {h: i + 1 for i, h in enumerate(hdr)}
    derivados = {c["name"]: c for c in trial["countries"]}
    prob7, suma_total = [], 0
    mapa = {"Confirmado y contrastado": "contrastado", "Confirmado con datos parciales": "parcial",
            "Confirmado": "confirmado", "Pendiente": "pendiente", "Histórico": "historico"}
    n_paises = 0
    for r in range(2, ws.max_row + 1):
        nombre = ws.cell(row=r, column=pos["País"]).value
        if not nombre:
            continue
        n_paises += 1
        hoja = {"total": ws.cell(row=r, column=pos["Nº registros"]).value}
        for estado, clave in mapa.items():
            hoja[clave] = ws.cell(row=r, column=pos[estado]).value
        c = derivados[nombre]
        der = {"total": c["computedTotal"]}
        for estado, clave in mapa.items():
            der[clave] = c["computedVerification"].get(estado, 0)
        suma_total += hoja["total"]
        if hoja != der:
            prob7.append({"pais": nombre, "hoja": hoja, "derivado": der})
        if hoja["total"] != sum(hoja[k] for k in mapa.values()):
            prob7.append({"pais": nombre, "error": "identidad interna rota", "hoja": hoja})
    B["7_hoja_paises"] = {"paises_comprobados": n_paises, "problemas": prob7,
                          "suma_total_hoja": suma_total,
                          "ok": not prob7 and suma_total == 1409 and n_paises == 70}

    # ------------------------------------------------------------ 8
    B["8_regresion_v14"] = comparacion_regresion(
        args.regresion_v14, args.ref_v14 / "catalog.json", args.ref_v14 / "sources.json",
        args.ref_v14 / "countries.geojson")
    B["8b_regresion_v15_5"] = comparacion_regresion(
        args.regresion_v15_5, PROD_CATALOG, PROD_SOURCES,
        ROOT / "apps" / "web" / "public" / "data" / "countries.geojson")

    # ------------------------------------------------------------ 9
    altas = sorted(set(T) - set(P)); bajas = sorted(set(P) - set(T))
    comunes = sorted(set(T) & set(P))
    por_campo: Counter = Counter()
    detalle_cambios = []
    for rid in comunes:
        d = diff_registros(P[rid], T[rid])
        if d:
            detalle_cambios.append({"id": rid, "campos": {k: (str(v[0])[:80], str(v[1])[:80]) for k, v in d.items()}})
            for campo in d:
                por_campo[campo] += 1
    ganados = [r for r in comunes if P[r]["lat"] is None and T[r]["lat"] is not None]
    perdidos = [r for r in comunes if P[r]["lat"] is not None and T[r]["lat"] is None]
    desplazados = [{"id": r, "antes": (P[r]["lat"], P[r]["lng"]), "despues": (T[r]["lat"], T[r]["lng"])}
                    for r in comunes if P[r]["lat"] is not None and T[r]["lat"] is not None
                    and (P[r]["lat"], P[r]["lng"]) != (T[r]["lat"], T[r]["lng"])]
    cats_cambiadas = {e["id"]: e["campos"]["category"] for e in detalle_cambios if "category" in e["campos"]}
    esperado_cat = {rid: (antes, canonica) for rid, (antes, canonica) in CATEGORIAS.items()}
    estados_cambiados = {e["id"]: e["campos"]["verificationState"] for e in detalle_cambios
                         if "verificationState" in e["campos"]}
    B["9_vs_v15_5"] = {
        "altas": altas, "bajas": bajas,
        "altas_ok": altas == ALTAS, "bajas_ok": bajas == BAJAS,
        "cambios_por_campo": dict(por_campo),
        "categorias_cambiadas": cats_cambiadas,
        "categorias_ok": cats_cambiadas == {k: tuple(map(str, v)) for k, v in esperado_cat.items()} or
                         cats_cambiadas == esperado_cat,
        "estados_cambiados": estados_cambiados,
        "estados_ok": estados_cambiados == {rid: ("Confirmado", "Confirmado y contrastado") for rid in ESTADOS_PL},
        "puntos_ganados": {"n": len(ganados), "ids": ganados},
        "puntos_perdidos": {"n": len(perdidos), "ids": perdidos,
                            "intencionados_ok": perdidos == PERDIDOS_INTENCIONADOS},
        "puntos_desplazados": desplazados,
        "detalle_cambios": detalle_cambios,
        "ok": altas == ALTAS and bajas == BAJAS and perdidos == PERDIDOS_INTENCIONADOS
        and not desplazados,
    }

    # ------------------------------------------------- los 22 sin punto
    filas = []
    for i in sin_punto:
        d = book[i["id"]]
        filas.append({
            "id": i["id"], "nombre": i["name"], "pais": i["country"], "codigo_pais": i["countryCode"],
            "categoria": i["category"], "localidad_clasica": (d["locality"] or ""),
            "ciudad_canonica": (d.get("geo_canonical_city") or ""),
            "tenia_punto_en_v15_5": i["id"] in P and P[i["id"]]["lat"] is not None,
            "nota_geografica": (d.get("geo_notes") or ""),
        })
    filas.sort(key=lambda f: f["id"])
    with open(GEN / "v15-6-sin-punto-22.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        w.writeheader(); w.writerows(filas)
    out["sin_punto_22"] = filas

    (GEN / "v15-6-comparacion.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    resumen = {k: (v.get("ok") if isinstance(v, dict) else v) for k, v in B.items()}
    print("BATERÍA v15-6:", json.dumps(resumen, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
