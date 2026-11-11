#!/usr/bin/env python3
"""
Atlas de iniciativas · Opus Dei — preparación de datos (Fase 2).

Lee el Excel v14 (única fuente), conserva todos los valores originales,
normaliza lo necesario para búsqueda/filtros y resuelve ubicaciones de
localidad con un extracto LOCAL de GeoNames (cities1000, CC BY 4.0),
con reglas conservadoras:

- Coincidencia exacta de nombre/asciiname/alias dentro del país correcto.
- Si hay varias, se intenta desambiguar con la región (admin1 de GeoNames).
- Si persiste la ambigüedad: SIN coordenada, constancia en el informe.
  Nunca se elige la ciudad más poblada ni el primer resultado.
- La clave de caché incluye país + región (si existe) + localidad.
- Las correcciones manuales (manual_corrections.json) mandan siempre y
  una reimportación nunca las sobrescribe.
- "NL" solo es marcador de ausencia como valor completo en campos donde
  significa "No localizado"; en Código país es Países Bajos.

Salidas (apps/web/public/data/):
  catalog.json    catálogo completo (campos cortos + largos) + países + meta
  countries.geojson  base Natural Earth 50m (70 países marcados, resto mundo)
  geocoding-report.json / data/generated/geocoding-report.md

Uso:
  .venv/bin/python tools/data/build_catalog.py
Requiere en data/cache/: cities1000.txt, admin1CodesASCII.txt,
ne_50m_admin_0_countries.json (descargas documentadas en README).
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v14.xlsx"
CACHE = ROOT / "data" / "cache"
OUT = ROOT / "apps" / "web" / "public" / "data"
GEN = ROOT / "data" / "generated"
CORRECTIONS = Path(__file__).with_name("manual_corrections.json")
GEOCACHE = CACHE / "geocoding_cache.json"

MISSING = {"", "No localizado", "No localizada", "No consta", "NL"}


def is_missing(v) -> bool:
    return v is None or str(v).strip() in MISSING


def raw(v):
    """Valor original tal cual (string) o None si la celda está vacía."""
    if v is None:
        return None
    return str(v)


def norm_text(v) -> str:
    """Normalización para búsqueda/coincidencia: minúsculas, sin acentos."""
    if v is None:
        return ""
    s = unicodedata.normalize("NFD", str(v))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def recipients_bucket(sexo: str | None) -> str:
    t = (sexo or "").strip()
    if t == "No consta":
        return "no_consta"
    if t == "No aplicable":
        return "no_aplicable"
    if t.startswith("Femenino"):
        return "femenino"
    if t.startswith("Masculino"):
        return "masculino"
    if t.startswith("Mixto") or t.startswith("Hombres y mujeres"):
        return "mixto_programas_separados"
    return "no_consta"


def activity_normalized(act: str | None, rec_id: str) -> str:
    if rec_id in ("PA-03", "PA-04"):
        return "no_determinado"
    t = (act or "").strip()
    if t == "Activo":
        return "activo"
    if t.startswith("Cerrado"):
        return "cerrado"
    if t == "Pendiente de confirmar":
        return "pendiente_confirmar"
    if t.startswith("Trasladado"):
        return "trasladado_pendiente"
    return "no_determinado"


# ---------------------------------------------------------------- GeoNames
def load_geonames():
    admin1 = {}  # "ES.M" -> (name, asciiname)
    with open(CACHE / "admin1CodesASCII.txt", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3:
                admin1[parts[0]] = (parts[1], parts[2])
    # index: country -> normalized name -> [candidates]
    index: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    with open(CACHE / "cities1000.txt", encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) < 15:
                continue
            gid, name, ascii_name, alternates = p[0], p[1], p[2], p[3]
            lat, lng, country, adm1 = float(p[4]), float(p[5]), p[8], p[10]
            entry = {
                "geonameId": int(gid),
                "name": name,
                "lat": lat,
                "lng": lng,
                "admin1Code": f"{country}.{adm1}" if adm1 else None,
                "population": int(p[14]) if p[14].isdigit() else 0,
            }
            names = {norm_text(name), norm_text(ascii_name)}
            for alt in alternates.split(","):
                if alt.strip():
                    names.add(norm_text(alt))
            for n in names:
                if n:
                    index[country][n].append(entry)
    return index, admin1


RESOLVER_VERSION = "v2"  # v2: cities1000 + segunda pasada por extracto de país


def resolve_locality(index, admin1, country: str, region, locality: str, cache: dict):
    """Devuelve (status, payload). status: resolved | ambiguous | not_found"""
    key_raw = f"{RESOLVER_VERSION}|{country}|{norm_text(region) if not is_missing(region) else ''}|{norm_text(locality)}"
    key = hashlib.sha256(key_raw.encode()).hexdigest()
    if key in cache:
        return cache[key]["status"], cache[key]["payload"]
    candidates = list({c["geonameId"]: c for c in index.get(country, {}).get(norm_text(locality), [])}.values())
    if not candidates:
        result = ("not_found", {"queryUsed": key_raw, "candidates": 0})
    elif len(candidates) == 1:
        c = candidates[0]
        result = ("resolved", {"queryUsed": key_raw, "candidates": 1, **c})
    else:
        region_n = norm_text(region) if not is_missing(region) else ""
        filtered = []
        if region_n:
            for c in candidates:
                adm = admin1.get(c["admin1Code"] or "", ("", ""))
                if norm_text(adm[0]) == region_n or norm_text(adm[1]) == region_n:
                    filtered.append(c)
        if len(filtered) == 1:
            result = ("resolved", {"queryUsed": key_raw, "candidates": len(candidates),
                                    "disambiguatedBy": "region", **filtered[0]})
        else:
            result = ("ambiguous", {"queryUsed": key_raw, "candidates": len(candidates),
                                    "candidateIds": [c["geonameId"] for c in candidates]})
    cache[key] = {"key": key_raw, "status": result[0], "payload": result[1]}
    return result


def second_pass_country(country: str, targets: dict[str, str | None], admin1) -> dict[str, tuple[str, dict]]:
    """
    Segunda pasada sobre el extracto completo por país de GeoNames
    (geonames_countries/<CC>.txt), solo lugares poblados (clase P) y solo
    coincidencia exacta de nombre/asciiname normalizado. Mismas reglas de
    aceptación: única, o única tras filtrar por región; si no, ambigua.
    Devuelve {localidad_normalizada: (status, payload)}.
    """
    path = CACHE / "geonames_countries" / f"{country}.txt"
    results: dict[str, tuple[str, dict]] = {}
    if not path.exists():
        return {t: ("not_found", {"candidates": 0, "secondPass": "sin extracto de país"}) for t in targets}
    wanted = set(targets)
    candidates: dict[str, list[dict]] = defaultdict(list)
    with open(path, encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) < 15 or p[6] != "P":
                continue
            names = {norm_text(p[1]), norm_text(p[2])}
            hits = names & wanted
            if not hits:
                continue
            entry = {
                "geonameId": int(p[0]), "name": p[1],
                "lat": float(p[4]), "lng": float(p[5]),
                "admin1Code": f"{country}.{p[10]}" if p[10] else None,
                "population": int(p[14]) if p[14].isdigit() else 0,
            }
            for h in hits:
                candidates[h].append(entry)
    for target, region in targets.items():
        cands = list({c["geonameId"]: c for c in candidates.get(target, [])}.values())
        query = f"{country}|{norm_text(region) if region else ''}|{target}"
        if not cands:
            results[target] = ("not_found", {"queryUsed": query, "candidates": 0, "secondPass": True})
        elif len(cands) == 1:
            results[target] = ("resolved", {"queryUsed": query, "candidates": 1, "secondPass": True, **cands[0]})
        else:
            region_n = norm_text(region) if region else ""
            filtered = []
            if region_n:
                for c in cands:
                    adm = admin1.get(c["admin1Code"] or "", ("", ""))
                    if norm_text(adm[0]) == region_n or norm_text(adm[1]) == region_n:
                        filtered.append(c)
            if len(filtered) == 1:
                results[target] = ("resolved", {"queryUsed": query, "candidates": len(cands),
                                                "disambiguatedBy": "region", "secondPass": True, **filtered[0]})
            else:
                results[target] = ("ambiguous", {"queryUsed": query, "candidates": len(cands),
                                                 "candidateIds": [c["geonameId"] for c in cands], "secondPass": True})
    return results


# ------------------------------------------------------------------- Excel
def real_rows(ws):
    return [r for r in ws.iter_rows(values_only=True)
            if not all(v is None or (isinstance(v, str) and v.strip() == "") for v in r)]


def main() -> int:
    for needed in ("cities1000.txt", "admin1CodesASCII.txt", "ne_50m_admin_0_countries.json"):
        if not (CACHE / needed).exists():
            print(f"Falta data/cache/{needed} (ver README)", file=sys.stderr)
            return 1
    wb = load_workbook(SOURCE, read_only=True, data_only=True)
    d_rows = real_rows(wb["Directorio"])
    header, data = d_rows[0], d_rows[1:]
    assert len(data) == 1382, len(data)
    assert len({r[0] for r in data}) == 1382

    corrections = {}
    if CORRECTIONS.exists():
        corrections = json.loads(CORRECTIONS.read_text(encoding="utf-8")).get("corrections", {})
    cache = {}
    if GEOCACHE.exists():
        cache = json.loads(GEOCACHE.read_text(encoding="utf-8"))

    index, admin1 = load_geonames()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    initiatives = []
    pending_second_pass: list[dict] = []
    geo_stats = Counter()
    ambiguous_groups: dict[str, dict] = {}
    notfound_groups: Counter = Counter()
    for r in data:
        (rid, name, category, sexo, country, ccode, continent, region, locality,
         address, postal, phone, web, entity, linkage, evidence, verif, activity,
         consulted, src1, src2, double_check, email) = (list(r) + [None] * 23)[:23]
        rec = {
            "id": rid,
            "name": raw(name),
            "category": raw(category),
            "sexRaw": raw(sexo),
            "recipients": recipients_bucket(raw(sexo)),
            "country": raw(country),
            "countryCode": raw(ccode),  # "NL" aquí es Países Bajos, nunca ausencia
            "continent": raw(continent),
            "region": None if is_missing(region) else raw(region),
            "regionRaw": raw(region),
            "locality": None if is_missing(locality) else raw(locality),
            "localityRaw": raw(locality),
            "address": None if is_missing(address) else raw(address),
            "addressRaw": raw(address),
            "postalCode": None if is_missing(postal) else raw(postal),
            "phone": None if is_missing(phone) else raw(phone),
            "web": None if is_missing(web) else raw(web),
            "entity": None if is_missing(entity) else raw(entity),
            "entityRaw": raw(entity),
            "linkageType": raw(linkage),
            "evidence": raw(evidence),
            "verificationState": raw(verif),
            "activityStateRaw": raw(activity),
            "activityState": activity_normalized(raw(activity), rid),
            "consultedAt": raw(consulted),
            "source1": None if is_missing(src1) else raw(src1),
            "source2": None if is_missing(src2) else raw(src2),
            "doubleCheck": raw(double_check),
            "email": None if is_missing(email) else raw(email),
            "searchText": norm_text(" ".join(str(x) for x in (name, locality, region, entity) if x and not is_missing(x))),
            "lat": None, "lng": None, "precision": "unknown",
            "geocodingProvider": None, "geonameId": None,
            "geocodedAt": None, "queryUsed": None, "reviewStatus": "pending",
        }
        # Ubicación: corrección manual > GeoNames por localidad > sin punto
        if rid in corrections:
            c = corrections[rid]
            rec.update(lat=c["lat"], lng=c["lng"], precision=c.get("precision", "locality"),
                       geocodingProvider="manual", geocodedAt=now, reviewStatus="manual")
            geo_stats["manual"] += 1
        elif rec["locality"]:
            status, payload = resolve_locality(index, admin1, str(ccode), region, str(locality), cache)
            rec["queryUsed"] = payload.get("queryUsed")
            if status == "resolved":
                rec.update(lat=payload["lat"], lng=payload["lng"], precision="locality",
                           geocodingProvider="GeoNames", geonameId=payload["geonameId"],
                           geocodedAt=now, reviewStatus="accepted")
                geo_stats["resolved_locality"] += 1
            elif status == "ambiguous":
                geo_stats["ambiguous"] += 1
                ambiguous_groups[payload["queryUsed"]] = payload
            else:
                pending_second_pass.append(rec)
        else:
            geo_stats["no_locality"] += 1
        initiatives.append(rec)

    # Segunda pasada: extracto completo por país (lugares poblados que
    # cities1000 no incluye por población). Mismas reglas conservadoras.
    by_country: dict[str, dict[str, str | None]] = defaultdict(dict)
    for rec in pending_second_pass:
        by_country[str(rec["countryCode"])][norm_text(rec["locality"])] = rec["regionRaw"]
    second_results: dict[str, dict[str, tuple[str, dict]]] = {}
    for cc, targets in by_country.items():
        second_results[cc] = second_pass_country(cc, targets, admin1)
        print(f"segunda pasada {cc}: {len(targets)} grupos")
    for rec in pending_second_pass:
        status, payload = second_results[str(rec["countryCode"])][norm_text(rec["locality"])]
        rec["queryUsed"] = payload.get("queryUsed", rec["queryUsed"])
        if status == "resolved":
            rec.update(lat=payload["lat"], lng=payload["lng"], precision="locality",
                       geocodingProvider="GeoNames (extracto por país)", geonameId=payload["geonameId"],
                       geocodedAt=now, reviewStatus="accepted")
            geo_stats["resolved_locality"] += 1
            geo_stats["resolved_second_pass"] += 1
        elif status == "ambiguous":
            geo_stats["ambiguous"] += 1
            ambiguous_groups[payload["queryUsed"]] = payload
        else:
            geo_stats["not_found"] += 1
            notfound_groups[payload["queryUsed"]] += 1

    GEOCACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")

    # ---------------------------------------------------------------- Países
    p_rows = real_rows(wb["Países"])
    p_header, p_data = p_rows[0], p_rows[1:]
    counts = Counter(r["country"] for r in initiatives)
    verif_counts: dict[str, Counter] = defaultdict(Counter)
    for r in initiatives:
        verif_counts[r["country"]][r["verificationState"]] += 1
    located_counts = Counter(r["country"] for r in initiatives if r["lat"] is not None)
    countries = []
    for r in p_data:
        (pname, code, cont, circ, evid, main_src, _adv, declared, cc_, cp_, pend_, hist_, note) = (list(r) + [None] * 13)[:13]
        countries.append({
            "name": raw(pname), "code": raw(code), "continent": raw(cont),
            "circumscription": raw(circ), "presenceEvidence": raw(evid),
            "mainSource": raw(main_src), "note": raw(note),
            "declaredTotal": int(declared) if isinstance(declared, (int, float)) else None,
            "declaredBreakdown": {"contrastado": cc_, "parcial": cp_, "pendiente": pend_, "historico": hist_},
            "computedTotal": counts.get(raw(pname), 0),
            "computedLocated": located_counts.get(raw(pname), 0),
            "computedVerification": dict(verif_counts.get(raw(pname), {})),
        })
    assert sum(c["computedTotal"] for c in countries) == 1382
    assert len(countries) == 70

    # ------------------------------------------------------- Natural Earth
    ne = json.loads((CACHE / "ne_50m_admin_0_countries.json").read_text(encoding="utf-8"))
    # Natural Earth (mirror 50m) trae ISO_A2=-99 para Francia y Noruega:
    # correspondencia documentada por ADM0_A3.
    adm0_fix = {"FRA": "FR", "NOR": "NO"}
    dir_codes = {c["code"] for c in countries}
    features = []
    matched = set()
    for f in ne["features"]:
        p = f["properties"]
        iso2 = p.get("ISO_A2")
        if iso2 in (None, "-99"):
            iso2 = adm0_fix.get(p.get("ADM0_A3", ""), iso2)
        in_directory = iso2 in dir_codes
        if in_directory:
            matched.add(iso2)
        features.append({
            "type": "Feature",
            "properties": {"code": iso2, "name": p.get("NAME"), "inDirectory": in_directory},
            "geometry": f["geometry"],
        })
    missing_ne = sorted(dir_codes - matched)
    # bbox por país del directorio (de la geometría NE, nunca de puntos)
    def bbox_of(geom):
        coords = []
        def walk(c):
            if isinstance(c, list) and c and isinstance(c[0], (int, float)):
                coords.append(c)
            elif isinstance(c, list):
                for x in c:
                    walk(x)
        walk(geom["coordinates"])
        lngs = [c[0] for c in coords]; lats = [c[1] for c in coords]
        return [min(lngs), min(lats), max(lngs), max(lats)]
    feat_by_code = {f["properties"]["code"]: f for f in features if f["properties"]["inDirectory"]}
    for c in countries:
        f = feat_by_code.get(c["code"])
        c["bbox"] = bbox_of(f["geometry"]) if f else None

    # ---------------------------------------------------------------- Salida
    OUT.mkdir(parents=True, exist_ok=True)
    GEN.mkdir(parents=True, exist_ok=True)
    meta = {
        "sourceFile": SOURCE.name,
        "generatedAt": now,
        "totalInitiatives": len(initiatives),
        "totalCountries": len(countries),
        "categories": sorted({r["category"] for r in initiatives}),
        "continents": sorted({r["continent"] for r in initiatives}),
        "verificationStates": sorted({r["verificationState"] for r in initiatives}),
        "located": sum(1 for r in initiatives if r["lat"] is not None),
        "geoStats": dict(geo_stats),
        "attribution": "Ubicaciones de localidad: GeoNames (CC BY 4.0), punto representativo de la localidad. Límites: Natural Earth.",
        "naturalEarthMissingCodes": missing_ne,
    }
    catalog = {"meta": meta, "countries": countries, "initiatives": initiatives}
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # Catálogo de fuentes (hoja Fuentes) para la importación de la Fase 3.
    # La 8ª columna no tiene encabezado en origen: son notas; se conservan.
    f_rows = real_rows(wb["Fuentes"])
    sources = []
    for r in f_rows[1:]:
        if not r[0]:
            continue
        sources.append({
            "id": raw(r[0]), "domain": raw(r[1]), "title": raw(r[2]), "url": raw(r[3]),
            "country": raw(r[4]), "nature": raw(r[5]), "consultedAt": raw(r[6]),
            "notes": raw(r[7]) if len(r) > 7 else None,
        })
    (GEN / "sources.json").write_text(json.dumps(
        {"generatedAt": now, "total": len(sources), "sources": sources},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "countries.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    report = {
        "generatedAt": now, "geoStats": dict(geo_stats),
        "locatedTotal": meta["located"], "total": len(initiatives),
        "ambiguousGroups": sorted(ambiguous_groups.values(), key=lambda x: x["queryUsed"]),
        "notFoundGroups": [{"queryUsed": k, "records": v} for k, v in notfound_groups.most_common()],
        "naturalEarthMissingCodes": missing_ne,
    }
    (GEN / "geocoding-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [
        "# Informe de resolución de ubicaciones (Fase 2)", "",
        f"Generado: {now} · Fuente: {SOURCE.name} · Gazetteer: GeoNames cities1000 (extracto local, CC BY 4.0)", "",
        f"- Resueltas con precisión de localidad (punto representativo GeoNames): **{geo_stats['resolved_locality']}** (de ellas, {geo_stats['resolved_second_pass']} en la segunda pasada con el extracto por país)",
        f"- Correcciones manuales aplicadas: **{geo_stats['manual']}**",
        f"- Ambiguas (varias coincidencias sin desambiguación por región; sin coordenada): **{geo_stats['ambiguous']}** registros en {len(ambiguous_groups)} grupos",
        f"- Sin coincidencia en el extracto (sin coordenada): **{geo_stats['not_found']}** registros en {len(notfound_groups)} grupos",
        f"- Sin localidad en origen (sin coordenada): **{geo_stats['no_locality']}**",
        f"- Total con punto: **{meta['located']} / 1382**. El resto sigue en lista y recuentos, sin marcador.", "",
        "## Grupos ambiguos", "",
    ]
    for g in report["ambiguousGroups"]:
        lines.append(f"- `{g['queryUsed']}` — {g['candidates']} candidatas (geonameIds {g['candidateIds']})")
    lines += ["", "## Grupos sin coincidencia (top)", ""]
    for g in report["notFoundGroups"][:60]:
        lines.append(f"- `{g['queryUsed']}` — {g['records']} registro(s)")
    lines += ["", f"Códigos del directorio sin correspondencia en Natural Earth 50m: {missing_ne or 'ninguno (70/70)'}.", ""]
    (GEN / "geocoding-report.md").write_text("\n".join(lines), encoding="utf-8")

    print(json.dumps(meta, ensure_ascii=False, indent=1))
    print("ambiguous groups:", len(ambiguous_groups), "| not-found groups:", len(notfound_groups))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
