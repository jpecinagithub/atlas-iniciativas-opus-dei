#!/usr/bin/env python3
"""
Atlas de iniciativas · Opus Dei — preparación de datos (Fase 2; lectura
por nombre y resolución por GeoNames ID desde la Fase 8B, 2026-11-13).

Lee un Excel del Directorio (única fuente), conserva todos los valores
originales, normaliza lo necesario para búsqueda/filtros y resuelve
ubicaciones de localidad. La hoja Directorio se lee POR NOMBRE de
cabecera (mapa COLUMNAS), nunca por posición: el libro puede reordenar
o añadir columnas sin romper el pipeline.

Dos modos de resolución geográfica:

1. Por GeoNames ID (libros con el bloque geográfico v15: columnas
   «GeoNames ID» y «Precisión»):
   - Precisión == «localidad» y GeoNames ID presente: la coordenada
     sale SOLO del extracto local de GeoNames buscando por ID (mapa
     ID → fila construido desde cities1000.txt y, para los IDs que no
     están ahí, desde los dumps completos por país
     geonames_countries/<CC>.txt; extracto local descargado el
     2026-11-11 de download.geonames.org, dumps diarios sin número de
     versión). No se re-geocodifica por texto ningún registro.
   - Precisión == «sin resolver»: SIN punto, aunque el libro traiga ID
     (no lo trae) o la localidad sea reconocible. Queda en listas.
   - Si un ID no aparece en el extracto local, o la fila del extracto
     es de otro país que el «País ISO» de la ficha, el registro queda
     sin punto y consta como anomalía en el informe (laguna explícita,
     nunca se rellena con otra coordenada).
   - Correcciones manuales (manual_corrections.json) siguen mandando.

2. Por texto (compatibilidad: libros sin bloque geográfico, p. ej. el
   v14): coincidencia exacta de nombre/asciiname/alias contra el mismo
   extracto local (cities1000), con desambiguación por región (admin1)
   y segunda pasada por el extracto completo por país. Si persiste la
   ambigüedad: SIN coordenada, constancia en el informe. Nunca se
   elige la ciudad más poblada ni el primer resultado.

En ambos modos: "NL" solo es marcador de ausencia como valor completo
en campos donde significa "No localizado"; en Código país es Países
Bajos. Las cifras esperadas (registros, países) se derivan del propio
libro en cada corrida, no de constantes de una versión concreta.

Salidas (por defecto, apps/web/public/data/ + data/generated/):
  catalog.json         catálogo completo + países + meta (con el
                       SHA-256 del Excel: el importador lo exige)
  countries.geojson    base Natural Earth 50m (países del libro
                       marcados, resto del mundo)
  sources.json         catálogo de fuentes (hoja Fuentes)
  geocoding-report.json / .md   informe de resolución de ubicaciones

Uso:
  .venv/bin/python tools/data/build_catalog.py \
      [--source data/source/<libro>.xlsx] [--out-dir DIR] \
      [--sources-out FICHERO] [--report-dir DIR]

  Sin --source se usa el libro fijado por SOURCE_NAME (el v14 por
  defecto histórico). Las corridas de prueba (migración en seco) deben
  dirigir TODAS las salidas fuera de producción.
Requiere en data/cache/: cities1000.txt, admin1CodesASCII.txt,
ne_50m_admin_0_countries.json y geonames_countries/<CC>.txt
(descargas documentadas en README).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[2]
SOURCE_NAME = "Directorio_Opus_Dei_MUNDIAL_v14.xlsx"
CACHE = ROOT / "data" / "cache"
OUT = ROOT / "apps" / "web" / "public" / "data"
GEN = ROOT / "data" / "generated"
CORRECTIONS = Path(__file__).with_name("manual_corrections.json")
GEOCACHE = CACHE / "geocoding_cache.json"

MISSING = {"", "No localizado", "No localizada", "No consta", "NL"}

# Mapa EXPLÍCITO de columnas de la hoja Directorio, por nombre exacto de
# cabecera. Las 23 primeras son el bloque clásico (presente en todos los
# libros); las 9 últimas son el bloque geográfico añadido en el v15
# (opcionales: un libro sin ellas se procesa en modo texto).
COLUMNAS = {
    # clave interna -> cabecera en el libro
    "id": "ID único",
    "name": "Nombre oficial",
    "category": "Categoría principal",
    "sexo": "Sexo",
    "country": "País",
    "country_code": "Código país",
    "continent": "Continente",
    "region": "Región/Provincia/Estado",
    "locality": "Localidad",
    "address": "Dirección completa",
    "postal_code": "Código postal",
    "phone": "Teléfono",
    "web": "Web oficial",
    "entity": "Entidad titular",
    "linkage": "Tipo de vinculación",
    "evidence": "Evidencia de vinculación",
    "verification": "Estado de verificación",
    "activity": "Estado de actividad",
    "consulted": "Fecha de consulta",
    "source1": "Fuente 1",
    "source2": "Fuente 2",
    "double_check": "Resultado doble comprobación",
    "email": "Email de contacto",
    # Bloque geográfico v15 (opcional)
    "geo_locality_original": "Localidad original",
    "geo_canonical_city": "Ciudad canónica",
    "geo_district": "Barrio/Distrito",
    "geo_province": "Provincia/Estado",
    "geo_country_iso": "País ISO",
    "geo_geonames_id": "GeoNames ID",
    "geo_precision": "Precisión",
    "geo_source": "Fuente geográfica",
    "geo_notes": "Notas geográficas",
}
GEO_BLOCK_KEYS = [k for k in COLUMNAS if k.startswith("geo_")]
CLASSIC_KEYS = [k for k in COLUMNAS if not k.startswith("geo_")]

# Hoja Países, también por nombre (13 columnas).
PAISES_COLUMNAS = {
    "name": "País",
    "code": "Código",
    "continent": "Continente",
    "circumscription": "Circunscripción (lista 4-jun-2024)",
    "presence_evidence": "Evidencia de presencia",
    "main_source": "Fuente principal",
    "advance": "Avance de investigación",
    "declared_total": "Nº registros",
    "declared_contrastado": "Confirmado y contrastado",
    "declared_parcial": "Confirmado con datos parciales",
    "declared_pendiente": "Pendiente",
    "declared_historico": "Histórico",
    "note": "Nota",
}


def read_sheet_by_name(ws, columnas: dict[str, str], required: list[str]):
    """Lee una hoja como lista de dicts clave->valor, por cabecera.

    Falla con mensaje claro si falta una cabecera requerida; las
    opcionales ausentes simplemente no aparecen en los dicts (los
    consumidores usan .get()).
    """
    rows = real_rows(ws)
    if not rows:
        raise ValueError("hoja vacía")
    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    pos: dict[str, int] = {}
    for key, cabecera in columnas.items():
        if cabecera in header:
            pos[key] = header.index(cabecera)
        elif key in required:
            raise ValueError(f"falta la columna requerida «{cabecera}» en la hoja")
    out = []
    for r in rows[1:]:
        out.append({key: (r[i] if i < len(r) else None) for key, i in pos.items()})
    return out, pos


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


def load_geonames_by_id():
    """Mapa GeoNames ID -> fila del extracto local, para el modo por ID.

    Fuentes, en este orden (la primera aparición manda y se anota de
    qué fichero sale cada ID):
      1. cities1000.txt (extracto mundial de localidades >= 1000 hab.)
      2. geonames_countries/<CC>.txt (dump completo por país, todas
         las clases; cubre localidades que cities1000 no trae)
    Extracto local descargado el 2026-11-11 de download.geonames.org
    (dumps diarios, sin número de versión; marca interna del zip de
    cities1000: 2026-11-11). GeoNames, CC BY 4.0.
    Devuelve (by_id, origen) con origen: gid -> nombre del fichero.
    """
    by_id: dict[int, dict] = {}
    origen: dict[int, str] = {}

    def scan(path: Path, tag: str):
        with open(path, encoding="utf-8") as f:
            for line in f:
                p = line.rstrip("\n").split("\t")
                if len(p) < 15 or not p[0].isdigit():
                    continue
                gid = int(p[0])
                if gid in by_id:
                    continue
                by_id[gid] = {
                    "geonameId": gid,
                    "name": p[1],
                    "lat": float(p[4]),
                    "lng": float(p[5]),
                    "country": p[8],
                    "admin1Code": f"{p[8]}.{p[10]}" if p[10] else None,
                }
                origen[gid] = tag

    scan(CACHE / "cities1000.txt", "cities1000.txt")
    countries_dir = CACHE / "geonames_countries"
    if countries_dir.exists():
        for path in sorted(countries_dir.glob("*.txt")):
            scan(path, f"geonames_countries/{path.name}")
    return by_id, origen


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
    ap = argparse.ArgumentParser(description="Genera el catálogo del Atlas desde un Excel del Directorio.")
    ap.add_argument("--source", type=Path, default=ROOT / "data" / "source" / SOURCE_NAME,
                    help="Excel del Directorio (por defecto, el v14 fijado)")
    ap.add_argument("--out-dir", type=Path, default=OUT,
                    help="Directorio de catalog.json y countries.geojson (por defecto, el de producción web)")
    ap.add_argument("--sources-out", type=Path, default=GEN / "sources.json",
                    help="Fichero sources.json (por defecto, data/generated/sources.json)")
    ap.add_argument("--report-dir", type=Path, default=GEN,
                    help="Directorio de geocoding-report.json/.md (por defecto, data/generated)")
    args = ap.parse_args()
    source = args.source
    out_dir, sources_out, report_dir = args.out_dir, args.sources_out, args.report_dir

    for needed in ("cities1000.txt", "admin1CodesASCII.txt", "ne_50m_admin_0_countries.json"):
        if not (CACHE / needed).exists():
            print(f"Falta data/cache/{needed} (ver README)", file=sys.stderr)
            return 1
    if not source.exists():
        print(f"No existe el Excel fuente: {source}", file=sys.stderr)
        return 1
    wb = load_workbook(source, read_only=True, data_only=True)
    d_dicts, d_pos = read_sheet_by_name(wb["Directorio"], COLUMNAS, required=CLASSIC_KEYS)
    ids = [d["id"] for d in d_dicts]
    assert len(ids) == len(set(ids)), "IDs duplicados en la hoja Directorio"
    has_geo_block = all(k in d_pos for k in ("geo_geonames_id", "geo_precision"))
    geo_mode = "geonames-id" if has_geo_block else "text"

    corrections = {}
    if CORRECTIONS.exists():
        corrections = json.loads(CORRECTIONS.read_text(encoding="utf-8")).get("corrections", {})
    cache = {}
    if GEOCACHE.exists():
        cache = json.loads(GEOCACHE.read_text(encoding="utf-8"))
    cache_before = json.dumps(cache, sort_keys=True)

    index, admin1 = load_geonames()
    by_id, by_id_origen = load_geonames_by_id() if geo_mode == "geonames-id" else ({}, {})
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # Huella del Excel del que salen TODOS los artefactos de esta corrida.
    # El importador la exige: si el Excel cambia sin regenerar, la
    # importación se rechaza en vez de acreditar datos que no son suyos.
    source_sha = hashlib.sha256(source.read_bytes()).hexdigest()

    initiatives = []
    pending_second_pass: list[dict] = []
    geo_stats = Counter()
    ambiguous_groups: dict[str, dict] = {}
    notfound_groups: Counter = Counter()
    id_anomalies: list[dict] = []
    for d in d_dicts:
        rid = d["id"]
        name, category, sexo = d["name"], d["category"], d["sexo"]
        country, ccode, continent = d["country"], d["country_code"], d["continent"]
        region, locality = d["region"], d["locality"]
        address, postal, phone, web = d["address"], d["postal_code"], d["phone"], d["web"]
        entity, linkage, evidence = d["entity"], d["linkage"], d["evidence"]
        verif, activity, consulted = d["verification"], d["activity"], d["consulted"]
        src1, src2, double_check, email = d["source1"], d["source2"], d["double_check"], d["email"]
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
        if geo_mode == "geonames-id":
            # El bloque geográfico del libro se conserva en el catálogo
            # para trazabilidad (qué ID y qué precisión declaró la
            # fuente, con sus notas); la coordenada NO sale del libro:
            # sale del extracto GeoNames por ID.
            rec["geo"] = {
                "localityOriginal": raw(d.get("geo_locality_original")),
                "canonicalCity": raw(d.get("geo_canonical_city")),
                "district": raw(d.get("geo_district")),
                "province": raw(d.get("geo_province")),
                "countryIso": raw(d.get("geo_country_iso")),
                "geonamesIdDeclared": int(d["geo_geonames_id"]) if d.get("geo_geonames_id") not in (None, "") else None,
                "precisionDeclared": raw(d.get("geo_precision")),
                "source": raw(d.get("geo_source")),
                "notes": raw(d.get("geo_notes")),
            }
        # Ubicación: corrección manual > resolución según el modo > sin punto
        if rid in corrections:
            c = corrections[rid]
            rec.update(lat=c["lat"], lng=c["lng"], precision=c.get("precision", "locality"),
                       geocodingProvider="manual", geocodedAt=now, reviewStatus="manual")
            geo_stats["manual"] += 1
        elif geo_mode == "geonames-id":
            precision_decl = str(d.get("geo_precision") or "").strip()
            gid_val = d.get("geo_geonames_id")
            iso = str(d.get("geo_country_iso") or "").strip()
            if precision_decl == "localidad" and gid_val not in (None, ""):
                gid = int(gid_val)
                rec["queryUsed"] = f"geonames-id|{gid}"
                if iso != str(ccode).strip():
                    geo_stats["iso_mismatch"] += 1
                    id_anomalies.append({"id": rid, "geonameId": gid, "reason": "iso_mismatch",
                                         "detail": f"País ISO «{iso}» != Código país «{ccode}»"})
                elif gid not in by_id:
                    geo_stats["id_not_in_extract"] += 1
                    id_anomalies.append({"id": rid, "geonameId": gid, "reason": "id_not_in_extract",
                                         "detail": "el ID no aparece en el extracto local de GeoNames"})
                elif by_id[gid]["country"] != iso:
                    geo_stats["id_country_mismatch"] += 1
                    id_anomalies.append({"id": rid, "geonameId": gid, "reason": "id_country_mismatch",
                                         "detail": f"la fila del extracto es de {by_id[gid]['country']} y la ficha declara {iso}"})
                else:
                    row_g = by_id[gid]
                    rec.update(lat=row_g["lat"], lng=row_g["lng"], precision="locality",
                               geocodingProvider="GeoNames (por ID)", geonameId=gid,
                               geocodedAt=now, reviewStatus="accepted")
                    geo_stats["resolved_by_id"] += 1
                    geo_stats[f"id_from_{by_id_origen[gid]}"] += 1
            elif precision_decl == "localidad":
                geo_stats["declared_locality_without_id"] += 1
                id_anomalies.append({"id": rid, "geonameId": None, "reason": "declared_locality_without_id",
                                     "detail": "Precisión «localidad» sin GeoNames ID en el libro"})
            else:
                # «sin resolver» (o precisión no reconocida): sin punto,
                # sin re-geocodificar por texto. Decisión del libro.
                geo_stats["declared_unresolved"] += 1
                if precision_decl != "sin resolver":
                    id_anomalies.append({"id": rid, "geonameId": None, "reason": "unknown_precision",
                                         "detail": f"Precisión no reconocida: «{precision_decl}»"})
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

    if geo_mode == "text":
        # Segunda pasada: extracto completo por país (lugares poblados
        # que cities1000 no incluye por población). Mismas reglas
        # conservadoras. (Solo en modo texto; en modo por ID no se
        # re-geocodifica nada.)
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

        # La caché solo se reescribe si cambió (una corrida de prueba
        # contra la misma caché no debe tocar el fichero).
        if json.dumps(cache, sort_keys=True) != cache_before:
            GEOCACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")

    # ---------------------------------------------------------------- Países
    p_dicts, _ = read_sheet_by_name(wb["Países"], PAISES_COLUMNAS,
                                    required=["name", "code", "declared_total"])
    counts = Counter(r["country"] for r in initiatives)
    verif_counts: dict[str, Counter] = defaultdict(Counter)
    for r in initiatives:
        verif_counts[r["country"]][r["verificationState"]] += 1
    located_counts = Counter(r["country"] for r in initiatives if r["lat"] is not None)
    countries = []
    for d in p_dicts:
        declared = d["declared_total"]
        countries.append({
            "name": raw(d["name"]), "code": raw(d["code"]), "continent": raw(d["continent"]),
            "circumscription": raw(d["circumscription"]), "presenceEvidence": raw(d["presence_evidence"]),
            "mainSource": raw(d["main_source"]), "note": raw(d["note"]),
            "declaredTotal": int(declared) if isinstance(declared, (int, float)) else None,
            "declaredBreakdown": {"contrastado": d["declared_contrastado"], "parcial": d["declared_parcial"],
                                  "pendiente": d["declared_pendiente"], "historico": d["declared_historico"]},
            "computedTotal": counts.get(raw(d["name"]), 0),
            "computedLocated": located_counts.get(raw(d["name"]), 0),
            "computedVerification": dict(verif_counts.get(raw(d["name"]), {})),
        })
    total_records = len(initiatives)
    assert sum(c["computedTotal"] for c in countries) == total_records, (
        f"la suma de países ({sum(c['computedTotal'] for c in countries)}) no cubre "
        f"los {total_records} registros del Directorio: hay países del Directorio "
        "sin fila en la hoja Países o nombres que no coinciden")

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
    out_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    sources_out.parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "sourceFile": source.name,
        "sourceSha256": source_sha,
        "generatedAt": now,
        "geoMode": geo_mode,
        "totalInitiatives": len(initiatives),
        "totalCountries": len(countries),
        "categories": sorted({r["category"] for r in initiatives}),
        "continents": sorted({r["continent"] for r in initiatives}),
        "verificationStates": sorted({r["verificationState"] for r in initiatives}),
        "located": sum(1 for r in initiatives if r["lat"] is not None),
        "geoStats": dict(geo_stats),
        "attribution": ("Ubicaciones de localidad: GeoNames (CC BY 4.0), punto representativo de la localidad. "
                        "Límites: Natural Earth."),
        "naturalEarthMissingCodes": missing_ne,
    }
    catalog = {"meta": meta, "countries": countries, "initiatives": initiatives}
    (out_dir / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # Catálogo de fuentes (hoja Fuentes) para la importación de la Fase 3.
    # Se lee también por nombre; la 8ª columna no tiene encabezado en
    # origen: son notas y se localiza por posición tras la cabecera.
    f_rows = real_rows(wb["Fuentes"])
    f_header = [str(h).strip() if h is not None else "" for h in f_rows[0]]
    f_pos = {name: f_header.index(name) for name in
             ("ID fuente", "Institución emisora (dominio)", "Título / página", "URL", "País",
              "Naturaleza de la fuente", "Fecha de consulta") if name in f_header}
    sources = []
    for r in f_rows[1:]:
        def cell(name, _r=r):
            i = f_pos.get(name)
            return _r[i] if i is not None and i < len(_r) else None
        if not cell("ID fuente"):
            continue
        notes_idx = max(f_pos.values()) + 1 if f_pos else None
        sources.append({
            "id": raw(cell("ID fuente")), "domain": raw(cell("Institución emisora (dominio)")),
            "title": raw(cell("Título / página")), "url": raw(cell("URL")),
            "country": raw(cell("País")), "nature": raw(cell("Naturaleza de la fuente")),
            "consultedAt": raw(cell("Fecha de consulta")),
            "notes": raw(r[notes_idx]) if notes_idx is not None and notes_idx < len(r) else None,
        })
    sources_out.write_text(json.dumps(
        {"generatedAt": now, "sourceSha256": source_sha, "total": len(sources), "sources": sources},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out_dir / "countries.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    # Las salidas web deben ser legibles por cualquier usuario del
    # contenedor (nginx no corre como root; con 0660 devolvería 403).
    for _f in ("catalog.json", "countries.geojson"):
        os.chmod(out_dir / _f, 0o644)

    report = {
        "generatedAt": now, "geoMode": geo_mode, "geoStats": dict(geo_stats),
        "locatedTotal": meta["located"], "total": len(initiatives),
        "idAnomalies": id_anomalies,
        "ambiguousGroups": sorted(ambiguous_groups.values(), key=lambda x: x["queryUsed"]),
        "notFoundGroups": [{"queryUsed": k, "records": v} for k, v in notfound_groups.most_common()],
        "naturalEarthMissingCodes": missing_ne,
    }
    (report_dir / "geocoding-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    if geo_mode == "geonames-id":
        lines = [
            "# Informe de resolución de ubicaciones por GeoNames ID (Fase 8B, migración en seco)", "",
            f"Generado: {now} · Fuente: {source.name} · Gazetteer: GeoNames, extracto local por ID "
            "(cities1000.txt + geonames_countries/<CC>.txt, descargado 2026-11-11, CC BY 4.0)", "",
            f"- Resueltas por GeoNames ID declarado (Precisión = localidad): **{geo_stats['resolved_by_id']}** "
            f"(desde cities1000.txt: {geo_stats['id_from_cities1000.txt']}; desde el dump por país: "
            f"{sum(v for k, v in geo_stats.items() if k.startswith('id_from_geonames_countries'))})",
            f"- Declaradas «sin resolver» en el libro (sin punto, sin re-geocodificar): **{geo_stats['declared_unresolved']}**",
            f"- Correcciones manuales aplicadas: **{geo_stats['manual']}**",
            f"- IDs no encontrados en el extracto local (sin punto, laguna): **{geo_stats['id_not_in_extract']}**",
            f"- IDs cuyo país en el extracto difiere del País ISO (sin punto, anomalía): **{geo_stats['id_country_mismatch']}**",
            f"- País ISO distinto del Código país (sin punto, anomalía): **{geo_stats['iso_mismatch']}**",
            f"- Total con punto: **{meta['located']} / {total_records}**.", "",
            "## Anomalías del modo por ID", "",
        ]
        if id_anomalies:
            for a in id_anomalies:
                lines.append(f"- `{a['id']}` (GeoNames ID {a['geonameId']}): {a['reason']} — {a['detail']}")
        else:
            lines.append("- Ninguna: todos los IDs declarados se encontraron en el extracto y en su país.")
        lines += ["", f"Códigos del directorio sin correspondencia en Natural Earth 50m: {missing_ne or 'ninguno'}.", ""]
    else:
        lines = [
            "# Informe de resolución de ubicaciones (Fase 2)", "",
            f"Generado: {now} · Fuente: {source.name} · Gazetteer: GeoNames cities1000 (extracto local, CC BY 4.0)", "",
            f"- Resueltas con precisión de localidad (punto representativo GeoNames): **{geo_stats['resolved_locality']}** (de ellas, {geo_stats['resolved_second_pass']} en la segunda pasada con el extracto por país)",
            f"- Correcciones manuales aplicadas: **{geo_stats['manual']}**",
            f"- Ambiguas (varias coincidencias sin desambiguación por región; sin coordenada): **{geo_stats['ambiguous']}** registros en {len(ambiguous_groups)} grupos",
            f"- Sin coincidencia en el extracto (sin coordenada): **{geo_stats['not_found']}** registros en {len(notfound_groups)} grupos",
            f"- Sin localidad en origen (sin coordenada): **{geo_stats['no_locality']}**",
            f"- Total con punto: **{meta['located']} / {total_records}**. El resto sigue en lista y recuentos, sin marcador.", "",
            "## Grupos ambiguos", "",
        ]
        for g in report["ambiguousGroups"]:
            lines.append(f"- `{g['queryUsed']}` — {g['candidates']} candidatas (geonameIds {g['candidateIds']})")
        lines += ["", "## Grupos sin coincidencia (top)", ""]
        for g in report["notFoundGroups"][:60]:
            lines.append(f"- `{g['queryUsed']}` — {g['records']} registro(s)")
        lines += ["", f"Códigos del directorio sin correspondencia en Natural Earth 50m: {missing_ne or 'ninguno'}.", ""]
    (report_dir / "geocoding-report.md").write_text("\n".join(lines), encoding="utf-8")

    print(json.dumps(meta, ensure_ascii=False, indent=1))
    if geo_mode == "text":
        print("ambiguous groups:", len(ambiguous_groups), "| not-found groups:", len(notfound_groups))
    else:
        print("anomalías por ID:", len(id_anomalies))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
