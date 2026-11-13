#!/usr/bin/env python3
"""
Análisis de la migración en seco v14 -> v15-4 (Fase 8B, 2026-11-13).

Verifica el catálogo de PRUEBA generado con el bloque geográfico del
v15-4 (data/generated/v15-4-trial/) y lo compara con el catálogo de
PRODUCCIÓN (v14, apps/web/public/data/catalog.json):

- Verificación exhaustiva de puntos contra el extracto local de
  GeoNames por ID (cada punto del catálogo de prueba debe ser la fila
  del extracto de su GeoNames ID declarado; ningún «sin resolver»
  puede tener punto).
- Relaciones documentales recalculadas con la semántica exacta del
  importador de la API (URL exacta contra la hoja Fuentes; creada solo
  si la URL identifica exactamente una fuente).
- Países: totales declarados en la hoja Países frente a los derivados
  del Directorio (toda discrepancia se lista; nunca se corrige).
- Comparación completa: altas, bajas, puntos ganados/perdidos,
  desplazados (con distancia), cambios de categoría y de estado.
- Listas de revisión en data/generated/:
    v15-4-pendientes-96.csv        los 96 «sin resolver» clasificados
    v15-4-retirados-19.csv         los 19 que pierden el punto del v14
    v15-4-desplazados.csv          puntos que se mueven entre versiones
    v15-4-ids-no-encontrados.csv   IDs declarados ausentes del extracto
    v15-4-comparacion.json         todas las cifras en bruto

No escribe en producción ni en el catálogo de prueba: solo lee y deja
las listas en data/generated/.

Uso: .venv/bin/python tools/data/analyze_v15_4_trial.py
"""
from __future__ import annotations

import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).parent))
from build_catalog import load_geonames_by_id, read_sheet_by_name, COLUMNAS  # noqa: E402
from openpyxl import load_workbook  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / "data" / "generated"
TRIAL = GEN / "v15-4-trial"
PROD_CATALOG = ROOT / "apps" / "web" / "public" / "data" / "catalog.json"
PROD_SOURCES = GEN / "sources.json"
BOOK = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v15-4.xlsx"

# Clasificación previa de los 96 pendientes (análisis de Jon/Codex,
# hoja «Geografía v15» y encargo de la migración en seco).
CLASIFICACION_PREVIA = {
    "Conflicto de jerarquía administrativa": 28,
    "Varios candidatos GeoNames": 23,
    "Sin coincidencia GeoNames": 16,
    "Localidad múltiple o contradictoria": 14,
    "Sin localidad o sin nota explicativa": 5,
    "Conflicto de país": 3,
    "Dirección contradictoria": 2,
    "Otros casos manuales": 5,
}


def clasificar_motivo(nota: str | None, localidad: str | None) -> str:
    """Motivo de un «sin resolver» a partir de su Nota geográfica.

    Reglas por frases literales de las notas del propio libro, en
    orden de prioridad (la primera que casa manda); el resto cae en
    «Otros casos manuales». Es una clasificación de lectura, no una
    corrección: la nota íntegra viaja siempre en la lista.
    """
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


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


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


def main() -> int:
    trial = json.loads((TRIAL / "catalog.json").read_text(encoding="utf-8"))
    trial_sources = json.loads((TRIAL / "sources.json").read_text(encoding="utf-8"))
    prod = json.loads(PROD_CATALOG.read_text(encoding="utf-8"))
    prod_sources = json.loads(PROD_SOURCES.read_text(encoding="utf-8"))
    by_id, _origen = load_geonames_by_id()

    wb = load_workbook(BOOK, read_only=True, data_only=True)
    d_dicts, _ = read_sheet_by_name(wb["Directorio"], COLUMNAS, required=[])
    book = {d["id"]: d for d in d_dicts}

    T = {i["id"]: i for i in trial["initiatives"]}
    P = {i["id"]: i for i in prod["initiatives"]}
    out: dict = {}

    # ------------------------------------------------ verificación trial
    verif = {}
    verif["registros"] = len(T)
    verif["ids_unicos"] = len(T) == len(trial["initiatives"])
    con_punto = [i for i in T.values() if i["lat"] is not None]
    sin_punto = [i for i in T.values() if i["lat"] is None]
    verif["con_punto"] = len(con_punto)
    verif["sin_punto"] = len(sin_punto)
    # Exhaustiva: cada punto == fila del extracto de su ID declarado.
    errores_punto = []
    for i in con_punto:
        gid = i["geonameId"]
        decl = i["geo"]["geonamesIdDeclared"]
        if gid != decl:
            errores_punto.append((i["id"], f"geonameId del catálogo {gid} != declarado {decl}"))
            continue
        fila = by_id.get(gid)
        if fila is None:
            errores_punto.append((i["id"], f"ID {gid} ausente del extracto"))
        elif fila["lat"] != i["lat"] or fila["lng"] != i["lng"]:
            errores_punto.append((i["id"], f"punto ({i['lat']},{i['lng']}) != extracto ({fila['lat']},{fila['lng']})"))
        elif fila["country"] != i["geo"]["countryIso"]:
            errores_punto.append((i["id"], f"país del extracto {fila['country']} != País ISO {i['geo']['countryIso']}"))
        if i["geo"]["precisionDeclared"] != "localidad":
            errores_punto.append((i["id"], f"con punto pero Precisión declarada «{i['geo']['precisionDeclared']}»"))
    verif["errores_punto_exhaustivo"] = errores_punto
    verif["sin_resolver_con_punto"] = [i["id"] for i in T.values()
                                       if i["geo"]["precisionDeclared"] == "sin resolver" and i["lat"] is not None]
    verif["localidad_sin_punto"] = [i["id"] for i in T.values()
                                    if i["geo"]["precisionDeclared"] == "localidad" and i["lat"] is None]
    verif["ids_no_encontrados"] = sorted({i["geo"]["geonamesIdDeclared"] for i in T.values()
                                          if i["geo"]["precisionDeclared"] == "localidad"
                                          and i["geo"]["geonamesIdDeclared"] not in by_id})
    verif["ids_distintos_declarados"] = len({i["geo"]["geonamesIdDeclared"] for i in T.values()
                                             if i["geo"]["geonamesIdDeclared"] is not None})
    verif["relaciones"] = {k: v for k, v in relations(trial, trial_sources).items() if k != "detalle"}
    verif["relaciones_prod"] = {k: v for k, v in relations(prod, prod_sources).items() if k != "detalle"}
    verif["fuentes_trial"] = trial_sources["total"]
    verif["fuentes_prod"] = prod_sources["total"]
    verif["estados_verificacion"] = dict(Counter(i["verificationState"] for i in T.values()))
    verif["categorias"] = dict(Counter(i["category"] for i in T.values()))
    verif["sexo_valores_distintos"] = len({i["sexRaw"] for i in T.values()})
    # Países: declarado (hoja Países) frente a derivado del Directorio.
    discrep_paises = []
    for c in trial["countries"]:
        suma_desglose = sum(v for v in c["declaredBreakdown"].values() if isinstance(v, (int, float)))
        suma_estados = sum(c["computedVerification"].values())
        prob = []
        if c["declaredTotal"] != c["computedTotal"]:
            prob.append(f"declaredTotal {c['declaredTotal']} != computedTotal {c['computedTotal']}")
        if suma_desglose != suma_estados:
            prob.append(f"desglose declarado suma {suma_desglose} != estados derivados {suma_estados} "
                        f"({c['computedVerification']})")
        if prob:
            discrep_paises.append({"code": c["code"], "name": c["name"], "problemas": prob})
    verif["paises_total"] = len(trial["countries"])
    verif["paises_con_registros"] = sum(1 for c in trial["countries"] if c["computedTotal"] > 0)
    verif["paises_discrepancias"] = discrep_paises
    out["verificacion_trial"] = verif

    # ------------------------------------------------------- comparación
    altas = sorted(set(T) - set(P))
    bajas = sorted(set(P) - set(T))
    comunes = sorted(set(T) & set(P))
    ganados = [i for i in comunes if P[i]["lat"] is None and T[i]["lat"] is not None]
    perdidos = [i for i in comunes if P[i]["lat"] is not None and T[i]["lat"] is None]
    altas_con_punto = [i for i in altas if T[i]["lat"] is not None]
    altas_sin_punto = [i for i in altas if T[i]["lat"] is None]
    desplazados = []
    for i in comunes:
        if P[i]["lat"] is not None and T[i]["lat"] is not None:
            if (P[i]["lat"], P[i]["lng"]) != (T[i]["lat"], T[i]["lng"]):
                desplazados.append({
                    "id": i, "name": T[i]["name"], "country": T[i]["country"],
                    "lat_v14": P[i]["lat"], "lng_v14": P[i]["lng"],
                    "lat_v15": T[i]["lat"], "lng_v15": T[i]["lng"],
                    "geonameId_v14": P[i]["geonameId"], "geonameId_v15": T[i]["geonameId"],
                    "km": round(haversine_km(P[i]["lat"], P[i]["lng"], T[i]["lat"], T[i]["lng"]), 2),
                })
    desplazados.sort(key=lambda x: -x["km"])
    comp = {
        "altas": altas, "bajas": bajas,
        "altas_con_punto": len(altas_con_punto), "altas_sin_punto": altas_sin_punto,
        "puntos_ganados": len(ganados), "puntos_perdidos": perdidos,
        "desplazados_total": len(desplazados),
        "desplazados_mas_25km": [d for d in desplazados if d["km"] > 25],
        "cambios_categoria": [{"id": i, "de": P[i]["category"], "a": T[i]["category"]}
                              for i in comunes if P[i]["category"] != T[i]["category"]],
        "cambios_estado": [{"id": i, "de": P[i]["verificationState"], "a": T[i]["verificationState"]}
                           for i in comunes if P[i]["verificationState"] != T[i]["verificationState"]],
        "relaciones_delta": verif["relaciones"]["created"] - verif["relaciones_prod"]["created"],
    }
    out["comparacion"] = comp
    out["desplazados"] = desplazados

    # ------------------------------------------------------------ listas
    # (a) los 96 pendientes clasificados
    filas96 = []
    for i in sin_punto:
        d = book[i["id"]]
        filas96.append({
            "id": i["id"], "nombre": i["name"], "pais": i["country"], "codigo_pais": i["countryCode"],
            "localidad_clasica": (d["locality"] or ""), "ciudad_canonica": (d.get("geo_canonical_city") or ""),
            "provincia_estado_geo": (d.get("geo_province") or ""),
            "direccion": (d["address"] or ""), "fuente_geografica": (d.get("geo_source") or ""),
            "motivo": clasificar_motivo(d.get("geo_notes"), d["locality"]),
            "nota_geografica": (d.get("geo_notes") or ""),
            "tenia_punto_v14": "sí" if i["id"] in P and P[i["id"]]["lat"] is not None else "no",
            "lat_v14": P[i["id"]]["lat"] if i["id"] in P else None,
            "lng_v14": P[i["id"]]["lng"] if i["id"] in P else None,
            "es_alta_nueva": "sí" if i["id"] in altas else "no",
        })
    filas96.sort(key=lambda f: (f["motivo"], f["id"]))
    with open(GEN / "v15-4-pendientes-96.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas96[0].keys()))
        w.writeheader(); w.writerows(filas96)
    conteo_motivos = Counter(f["motivo"] for f in filas96)
    clasif = {
        "cruce": dict(conteo_motivos),
        "previa": CLASIFICACION_PREVIA,
        "diferencias": {m: (conteo_motivos.get(m, 0), CLASIFICACION_PREVIA.get(m, 0))
                        for m in set(conteo_motivos) | set(CLASIFICACION_PREVIA)
                        if conteo_motivos.get(m, 0) != CLASIFICACION_PREVIA.get(m, 0)},
    }
    out["clasificacion_96"] = clasif

    # (b) los 19 retirados
    filas19 = []
    for i in perdidos:
        d = book[i]
        filas19.append({
            "id": i, "nombre": T[i]["name"], "pais": T[i]["country"],
            "localidad_v15": (d["locality"] or ""), "precision_v15": (d.get("geo_precision") or ""),
            "fuente_geografica_v15": (d.get("geo_source") or ""), "nota_geografica_v15": (d.get("geo_notes") or ""),
            "lat_v14": P[i]["lat"], "lng_v14": P[i]["lng"], "geonameId_v14": P[i]["geonameId"],
            "localidad_v14": P[i]["localityRaw"], "query_v14": P[i]["queryUsed"],
        })
    with open(GEN / "v15-4-retirados-19.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas19[0].keys()))
        w.writeheader(); w.writerows(filas19)

    # desplazados completos
    with open(GEN / "v15-4-desplazados.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(desplazados[0].keys()))
        w.writeheader(); w.writerows(desplazados)

    # (c) IDs no encontrados en el extracto (laguna explícita)
    no_enc = sorted({(i["id"], i["geo"]["geonamesIdDeclared"]) for i in T.values()
                     if i["geo"]["precisionDeclared"] == "localidad"
                     and i["geo"]["geonamesIdDeclared"] not in by_id})
    with open(GEN / "v15-4-ids-no-encontrados.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "geonames_id_declarado", "motivo"])
        for rid, gid in no_enc:
            w.writerow([rid, gid, "el ID no aparece en el extracto local de GeoNames"])
    out["ids_no_encontrados"] = [list(x) for x in no_enc]

    # (d) ES-218 / ES-219
    out["es_218_219"] = {}
    for rid in ("ES-218", "ES-219"):
        d = book[rid]
        out["es_218_219"][rid] = {
            "localidad": d["locality"], "direccion": d["address"],
            "precision": d.get("geo_precision"), "geonames_id": d.get("geo_geonames_id"),
            "ciudad_canonica": d.get("geo_canonical_city"), "nota": d.get("geo_notes"),
            "motivo_clasificado": clasificar_motivo(d.get("geo_notes"), d["locality"]),
            "punto_en_trial": T[rid]["lat"] is not None, "punto_en_v14": P[rid]["lat"] is not None,
        }

    (GEN / "v15-4-comparacion.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("verificacion_trial", "clasificacion_96", "es_218_219")},
                     ensure_ascii=False, indent=1)[:6000])
    print("comparación:", json.dumps({k: (v if not isinstance(v, list) else f"{len(v)} elementos")
                                     for k, v in comp.items()}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
