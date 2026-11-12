#!/usr/bin/env python3
"""Auditoría comparativa Fase 8A: Directorio v14 → v15 (candidato 1).

SOLO ANÁLISIS: no importa en PostgreSQL, no toca la API ni la
interfaz, no despliega. Lee los dos Excel (sin modificarlos), el
catálogo v14 vigente y el catálogo v15 generado en la caja de
análisis (~/workspace/.atlas-8a-sandbox) por build_catalog.py con
las filas reordenadas por nombre de cabecera.

Salidas:
  data/generated/v14-v15-diff.json
  data/generated/v14-v15-diff.csv
  data/generated/v15-anomalias.csv
  data/generated/v15-geocoding-report.md
  docs/fase-8a-comparativa-v14-v15.md

Reproducir (desde la raíz del repo):
  tools/data/.venv/bin/python tools/data/build_catalog.py  # (no: ver MD)
  # 1) caja de análisis — ver «Comandos exactos» del informe.
  # 2) tools/data/.venv/bin/python tools/data/audit_v14_v15.py
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[2]
V14 = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v14.xlsx"
V15 = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v15-candidato-1.xlsx"
SANDBOX = Path.home() / "workspace" / ".atlas-8a-sandbox"
CAT14 = ROOT / "apps" / "web" / "public" / "data" / "catalog.json"
CAT15 = SANDBOX / "apps" / "web" / "public" / "data" / "catalog.json"
GEO14 = ROOT / "data" / "generated" / "geocoding-report.json"
GEO15 = SANDBOX / "data" / "generated" / "geocoding-report.json"
GEN = ROOT / "data" / "generated"

MISSING = {"", "No localizado", "No localizada", "No consta", "NL"}
KNOWN_CATEGORIES = [
    "Asociaciones juveniles", "Casa de retiros", "Centros culturales",
    "Centros de mujeres", "Centros de promoción social", "Centros de varones",
    "Centros Médicos", "Clubes juveniles", "Colegios",
    "Escuelas de formación Técnica", "Iglesias",
    "Oficinas de Información", "Residencias universitarias", "Universidades",
]


def cell(v) -> str:
    if v is None:
        return ""
    if hasattr(v, "isoformat"):
        try:
            return v.date().isoformat()
        except Exception:
            return v.isoformat()
    return str(v)


def is_missing(s: str) -> bool:
    return s.strip() in MISSING


def formal_norm(s: str) -> str:
    """Normalización SOLO formal: espacios, mayúsculas, comillas, guiones."""
    t = unicodedata.normalize("NFC", s)
    t = t.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    t = t.replace("–", "-").replace("—", "-")
    t = re.sub(r"\s+", " ", t).strip().casefold()
    return t


def loose_norm(s: str) -> str:
    """Sin acentos ni mayúsculas (detectar variantes de escritura)."""
    t = unicodedata.normalize("NFD", formal_norm(s))
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def real_rows(ws):
    return [r for r in ws.iter_rows(values_only=True)
            if not all(v is None or (isinstance(v, str) and v.strip() == "") for v in r)]


def load_sheet(path: Path, sheet: str):
    wb = load_workbook(path, read_only=True, data_only=True)
    rows = real_rows(wb[sheet])
    wb.close()
    header = [cell(c) for c in rows[0]]
    return header, rows[1:]


def directorio(path: Path):
    header, data = load_sheet(path, "Directorio")
    idx = {h: i for i, h in enumerate(header)}
    by_id: dict[str, dict[str, str]] = {}
    order: list[str] = []
    dups: list[str] = []
    for r in data:
        row = {h: cell(r[idx[h]]) if idx[h] < len(r) else "" for h in header}
        rid = row["ID único"].strip()
        if not rid:
            continue
        if rid in by_id:
            dups.append(rid)
        else:
            order.append(rid)
        by_id[rid] = row
    return header, by_id, order, dups


def count_formulas(path: Path, sheet: str, max_rows: int) -> int:
    wb = load_workbook(path, read_only=True, data_only=False)
    ws = wb[sheet]
    n = 0
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i > max_rows:
            break
        n += sum(1 for v in r if isinstance(v, str) and v.startswith("="))
    wb.close()
    return n


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    anomalies: list[dict] = []

    def anomaly(tipo, rid, campo, detalle):
        anomalies.append({"tipo": tipo, "id": rid, "campo": campo, "detalle": detalle})

    # ------------------------------------------------ 1. Estructura
    wb14 = load_workbook(V14, read_only=True, data_only=True)
    sheets14 = wb14.sheetnames
    wb14.close()
    wb15 = load_workbook(V15, read_only=True, data_only=True)
    sheets15 = wb15.sheetnames
    leeme = ""
    if "LEEME" in sheets15:
        for r in wb15["LEEME"].iter_rows(values_only=True):
            if r and r[0]:
                leeme = cell(r[0])
                break
    wb15.close()

    h14, d14, order14, dups14 = directorio(V14)
    h15, d15, order15, dups15 = directorio(V15)
    cols_added = [h for h in h15 if h not in h14]
    cols_removed = [h for h in h14 if h not in h15]
    cols_moved = [
        {"columna": h, "pos_v14": h14.index(h) + 1, "pos_v15": h15.index(h) + 1}
        for h in h14 if h in h15 and h14.index(h) != h15.index(h)
    ]
    formulas = {
        "v14": {s: count_formulas(V14, s, 1500) for s in ("Directorio", "Países", "Fuentes")},
        "v15": {s: count_formulas(V15, s, 1500) for s in ("Directorio", "Países", "Fuentes")},
    }
    new_cols_fill = {
        c: sum(1 for r in d15.values() if r[c].strip() and not is_missing(r[c]))
        for c in cols_added
    }
    for rid in dups15:
        anomaly("id_duplicado", rid, "ID único", "El ID aparece más de una vez en el Directorio v15")
    for rid in dups14:
        anomaly("id_duplicado_v14", rid, "ID único", "Duplicado ya presente en v14")

    # ------------------------------------------------ 2/3. Identidad y diff por ID
    ids14, ids15 = set(d14), set(d15)
    added = sorted(ids15 - ids14)
    missing = sorted(ids14 - ids15)
    common = sorted(ids14 & ids15)
    diff_rows: list[dict] = []
    unchanged = 0
    modified: dict[str, list[dict]] = {}
    formal_only_ids: list[str] = []
    field_change_counts: Counter = Counter()
    field_formal_counts: Counter = Counter()
    for rid in added:
        diff_rows.append({"id": rid, "tipo": "alta", "campo": "*registro*", "v14": "", "v15": d15[rid]["Nombre oficial"], "clase": "real"})
    for rid in missing:
        diff_rows.append({"id": rid, "tipo": "ausente_en_v15", "campo": "*registro*", "v14": d14[rid]["Nombre oficial"], "v15": "", "clase": "real"})
    for rid in common:
        changes = []
        for f in h14:
            a, b = d14[rid][f], d15[rid][f]
            if a == b:
                continue
            if is_missing(a) and is_missing(b):
                clase = "formal"  # cambia el marcador de ausencia, no el contenido
            elif formal_norm(a) == formal_norm(b):
                clase = "formal"
            else:
                clase = "real"
            changes.append({"campo": f, "v14": a, "v15": b, "clase": clase})
            diff_rows.append({"id": rid, "tipo": "modificado", "campo": f, "v14": a, "v15": b, "clase": clase})
            field_change_counts[f] += 1
            if clase == "formal":
                field_formal_counts[f] += 1
        if not changes:
            unchanged += 1
        else:
            modified[rid] = changes
            if all(c["clase"] == "formal" for c in changes):
                formal_only_ids.append(rid)
    # ID reutilizado: mismo ID, nombre Y país distintos (contenido real)
    reused = []
    for rid in common:
        if (formal_norm(d14[rid]["Nombre oficial"]) != formal_norm(d15[rid]["Nombre oficial"])
                and d14[rid]["Código país"] != d15[rid]["Código país"]):
            reused.append(rid)
            anomaly("id_reutilizado", rid, "ID único",
                    f"v14: {d14[rid]['Nombre oficial']} ({d14[rid]['Código país']}) → v15: {d15[rid]['Nombre oficial']} ({d15[rid]['Código país']})")
    # Prefijo del ID frente a Código país
    def prefix_mismatches(d):
        out = []
        for rid, r in d.items():
            prefix = rid.split("-")[0]
            if prefix != r["Código país"].strip():
                out.append(rid)
        return out
    pm14, pm15 = prefix_mismatches(d14), prefix_mismatches(d15)
    for rid in pm15:
        anomaly("prefijo_distinto_codigo", rid, "Código país",
                f"prefijo {rid.split('-')[0]} ≠ código {d15[rid]['Código país']}")
    # Pérdidas de campos con valor en v14
    for rid in common:
        for f in ("Nombre oficial", "País", "Código país", "Localidad"):
            if not is_missing(d14[rid][f]) and is_missing(d15[rid][f]):
                anomaly("perdida_campo", rid, f, f"v14: «{d14[rid][f]}» → v15: «{d15[rid][f]}»")

    # ------------------------------------------------ 4. Países
    def paises(path):
        header, data = load_sheet(path, "Países")
        idx = {h: i for i, h in enumerate(header)}
        out = {}
        for r in data:
            code = cell(r[idx["Código"]]).strip()
            if not code:
                continue
            out[code] = {
                "nombre": cell(r[idx["País"]]),
                "declarado": cell(r[idx["Nº registros"]]),
                "breakdown": {k: cell(r[idx[k]]) for k in
                              ("Confirmado y contrastado", "Confirmado con datos parciales", "Pendiente", "Histórico")},
            }
        return out
    p14, p15 = paises(V14), paises(V15)

    def computed(d):
        tot = Counter()
        brk = defaultdict(Counter)
        for r in d.values():
            code = r["Código país"].strip()
            tot[code] += 1
            brk[code][r["Estado de verificación"].strip()] += 1
        return tot, brk
    c14, b14 = computed(d14)
    c15, b15 = computed(d15)

    def paises_check(p, c, b, tag):
        issues = []
        for code, info in p.items():
            try:
                decl = int(float(info["declarado"])) if info["declarado"] else None
            except ValueError:
                decl = None
            calc = c.get(code, 0)
            try:
                brk_sum = sum(int(float(v)) for v in info["breakdown"].values() if v)
            except ValueError:
                brk_sum = None
            if decl != calc or (brk_sum is not None and brk_sum != calc):
                issues.append({"codigo": code, "pais": info["nombre"], "declarado": decl,
                               "suma_desglose": brk_sum, "calculado_directorio": calc})
                anomaly(f"paises_declarado_vs_calculado_{tag}", "", "Países",
                        f"{info['nombre']} ({code}): declarado {decl}, desglose {brk_sum}, calculado {calc}")
        return issues
    issues14 = paises_check(p14, c14, b14, "v14")
    issues15 = paises_check(p15, c15, b15, "v15")
    countries14 = sorted(c14)
    countries15 = sorted(c15)

    # ------------------------------------------------ 5. Categorías y listas
    cats14 = Counter(r["Categoría principal"].strip() for r in d14.values())
    cats15 = Counter(r["Categoría principal"].strip() for r in d15.values())
    new_cats = sorted(set(cats15) - set(KNOWN_CATEGORIES))
    for c in new_cats:
        anomaly("categoria_fuera_de_lista", "", "Categoría principal",
                f"«{c}» no está entre las 14 conocidas ({cats15[c]} registros)")
    variant_groups: dict[str, list[str]] = defaultdict(set)
    for c in list(cats14) + list(cats15):
        variant_groups[loose_norm(c)].add(c)
    variants = {k: sorted(v) for k, v in variant_groups.items() if len(v) > 1}
    for k, v in variants.items():
        anomaly("categoria_variante_escritura", "", "Categoría principal",
                f"variantes de una misma categoría: {v}")
    cat_changes = [rid for rid in common
                   if d14[rid]["Categoría principal"] != d15[rid]["Categoría principal"]]
    list_fields = {}
    for f in ("Sexo", "Estado de verificación", "Estado de actividad"):
        v14set = Counter(r[f].strip() for r in d14.values())
        v15set = Counter(r[f].strip() for r in d15.values())
        nuevos = sorted(set(v15set) - set(v14set))
        list_fields[f] = {"v14": dict(v14set), "v15": dict(v15set), "valores_nuevos_en_v15": nuevos}
        for v in nuevos:
            anomaly("valor_nuevo_en_lista", "", f, f"valor nuevo en v15: «{v}» ({v15set[v]} registros)")

    # ------------------------------------------------ 8. Fuentes
    def fuentes(path):
        header, data = load_sheet(path, "Fuentes")
        idx = {h: i for i, h in enumerate(header)}
        rows = []
        for r in data:
            rows.append({h: cell(r[idx[h]]) if idx[h] < len(r) else "" for h in header})
        return rows
    f14, f15 = fuentes(V14), fuentes(V15)
    urls14 = Counter(r["URL"].strip() for r in f14 if r["URL"].strip())
    urls15 = Counter(r["URL"].strip() for r in f15 if r["URL"].strip())
    fu_added = sorted(set(urls15) - set(urls14))
    fu_removed = sorted(set(urls14) - set(urls15))
    fu_dup15 = sorted(u for u, n in urls15.items() if n > 1)
    for u in fu_dup15:
        anomaly("url_duplicada_en_fuentes", "", "Fuentes", f"URL repetida en la hoja Fuentes v15 (x{urls15[u]}): {u}")

    def url_ok(u: str) -> bool:
        return bool(re.match(r"^https?://\S+$", u.strip()))

    def relations(d, urls_counter, tag):
        urlset = set(urls_counter)
        rel = amb = un1 = un2 = 0
        amb_ids, un1_ids, un2_ids = [], [], []
        for rid, r in d.items():
            for key, un, un_ids in (("Fuente 1", "1", un1_ids), ("Fuente 2", "2", un2_ids)):
                u = r[key].strip()
                if is_missing(u):
                    continue
                if not url_ok(u):
                    if "http" in u:
                        sub = "url_con_texto_anadido"
                    elif re.search(r"\b[\w-]+\.(org|com|es|de|net|edu|info|de|it|fr|pt|mx|ar|cl|pe|co)\b", u):
                        sub = "dominio_con_nota_sin_url"
                    else:
                        sub = "texto_libre_sin_url"
                    anomaly(f"fuente_sin_url_exacta_{tag}", rid, key, f"[{sub}] {u[:120]}")
                if u in urlset:
                    if urls_counter[u] > 1:
                        amb += 1
                        amb_ids.append(rid)
                    else:
                        rel += 1
                else:
                    if un == "1":
                        un1 += 1
                        un1_ids.append(rid)
                    else:
                        un2 += 1
                        un2_ids.append(rid)
        return {"relaciones_exactas": rel, "ambiguas": amb, "sin_coincidencia_f1": un1,
                "sin_coincidencia_f2": un2, "ambiguas_ids": sorted(set(amb_ids)),
                "sin_f1_ids": un1_ids, "sin_f2_ids": un2_ids}
    rel14 = relations(d14, urls14, "v14")
    rel15 = relations(d15, urls15, "v15")
    fu_dup14 = sorted(u for u, n in urls14.items() if n > 1)

    # ------------------------------------------------ 6. Geografía
    cat14 = {i["id"]: i for i in json.loads(CAT14.read_text(encoding="utf-8"))["initiatives"]}
    cat15 = {i["id"]: i for i in json.loads(CAT15.read_text(encoding="utf-8"))["initiatives"]}
    geo14 = json.loads(GEO14.read_text(encoding="utf-8"))
    geo15 = json.loads(GEO15.read_text(encoding="utf-8"))
    gained, lost, gid_changed, coord_moved_same_text = [], [], [], []
    for rid in common:
        a, b = cat14.get(rid), cat15.get(rid)
        if not a or not b:
            continue
        pa, pb = a["lat"] is not None, b["lat"] is not None
        if pb and not pa:
            gained.append(rid)
        if pa and not pb:
            lost.append(rid)
            anomaly("geo_perdida", rid, "Localidad",
                    f"tenía punto en v14 ({a['geonameId']}) y lo pierde en v15; localidad v15: «{d15[rid]['Localidad']}»")
        if pa and pb:
            if a["geonameId"] != b["geonameId"]:
                gid_changed.append({"id": rid, "v14": a["geonameId"], "v15": b["geonameId"]})
            elif (a["lat"], a["lng"]) != (b["lat"], b["lng"]):
                loc_same = formal_norm(d14[rid]["Localidad"]) == formal_norm(d15[rid]["Localidad"])
                if loc_same:
                    coord_moved_same_text.append(rid)
                    anomaly("geo_coordenada_sin_cambio_de_texto", rid, "Localidad",
                            f"mismo geonameId {a['geonameId']} pero coordenadas distintas sin cambiar la localidad")
    loc_changed = [rid for rid in common if d14[rid]["Localidad"] != d15[rid]["Localidad"]]
    reg_changed = [rid for rid in common if d14[rid]["Región/Provincia/Estado"] != d15[rid]["Región/Provincia/Estado"]]

    # ------------------------------------------------ Detalles para el informe
    wb15x = load_workbook(V15, read_only=True, data_only=True)
    retirada_sheets = [s for s in wb15x.sheetnames if "Retiradas" in s or "Históricos" in s]
    retirada_found: dict[str, list[str]] = defaultdict(list)
    for sname in retirada_sheets:
        for row in wb15x[sname].iter_rows(values_only=True):
            for c in row:
                if isinstance(c, str):
                    for rid in missing:
                        if rid in c:
                            retirada_found[rid].append(sname)
    wb15x.close()
    ausentes_detalle = [
        {"id": rid, "nombre": d14[rid]["Nombre oficial"], "pais": d14[rid]["País"],
         "categoria": d14[rid]["Categoría principal"], "estado": d14[rid]["Estado de verificación"],
         "tenia_punto": cat14.get(rid, {}).get("lat") is not None,
         "consta_en": sorted(set(retirada_found.get(rid, [])))}
        for rid in missing
    ]
    otros_detalle = [
        {"id": rid, "nombre": d15[rid]["Nombre oficial"],
         "categoria_v14": d14[rid]["Categoría principal"], "categoria_v15": d15[rid]["Categoría principal"]}
        for rid in cat_changes
    ]
    sexo_nuevos = list_fields["Sexo"]["valores_nuevos_en_v15"]
    sexo_nuevos_afectados = sum(1 for r in d15.values() if r["Sexo"].strip() in sexo_nuevos)
    adicionales_efectivas = sum(
        1 for r in d15.values()
        if r.get("Categorías adicionales", "").strip()
        and r["Categorías adicionales"].strip() not in MISSING
        and r["Categorías adicionales"].strip() != "No aplicable")
    recipients14 = Counter(i["recipients"] for i in cat14.values())
    recipients15 = Counter(i["recipients"] for i in cat15.values())
    estados14 = Counter(r["Estado de verificación"].strip() for r in d14.values())
    estados15 = Counter(r["Estado de verificación"].strip() for r in d15.values())

    # ------------------------------------------------ 9. Impacto
    impact = {
        "iniciativas": {"v14": len(d14), "v15": len(d15)},
        "paises": {"v14": len(countries14), "v15": len(countries15)},
        "con_punto": {"v14": geo14["locatedTotal"], "v15": geo15["locatedTotal"]},
        "sin_punto": {"v14": len(d14) - geo14["locatedTotal"], "v15": len(d15) - geo15["locatedTotal"]},
        "relaciones_exactas": {"v14": rel14["relaciones_exactas"], "v15": rel15["relaciones_exactas"]},
        "fichas_modificadas": len(modified),
        "artefactos_bytes": {
            "catalog_v14": CAT14.stat().st_size, "catalog_v15": CAT15.stat().st_size,
        },
    }

    result = {
        "meta": {
            "v14": {"fichero": V14.name, "bytes": V14.stat().st_size, "sha256": sha256(V14)},
            "v15": {"fichero": V15.name, "bytes": V15.stat().st_size, "sha256": sha256(V15),
                    "nota_leeme": leeme[:400]},
        },
        "estructura": {
            "hojas_v14": sheets14, "hojas_v15": sheets15,
            "hojas_nuevas": [s for s in sheets15 if s not in sheets14],
            "columnas_directorio": {"v14": h14, "v15": h15, "anadidas": cols_added,
                                    "retiradas": cols_removed, "movidas": cols_moved},
            "relleno_columnas_nuevas": new_cols_fill,
            "formulas": formulas,
            "filas_directorio": {"v14": len(d14), "v15": len(d15)},
        },
        "identidad": {
            "duplicados_v14": dups14, "duplicados_v15": dups15,
            "altas": added, "ausentes_en_v15": missing,
            "sin_cambios": unchanged, "modificados": len(modified),
            "solo_formales": formal_only_ids, "ids_reutilizados": reused,
            "prefijo_distinto_v14": pm14, "prefijo_distinto_v15": pm15,
            "cambios_por_campo": dict(field_change_counts),
            "formales_por_campo": dict(field_formal_counts),
        },
        "paises": {
            "codigos_v14": countries14, "codigos_v15": countries15,
            "nuevos": sorted(set(countries15) - set(countries14)),
            "eliminados": sorted(set(countries14) - set(countries15)),
            "declarado_vs_calculado_v14": issues14,
            "declarado_vs_calculado_v15": issues15,
            "totales_calculados": {"v14": dict(c14), "v15": dict(c15)},
        },
        "categorias": {
            "v14": dict(cats14), "v15": dict(cats15), "nuevas": new_cats,
            "variantes": variants, "cambios_por_id": cat_changes,
            "listas": list_fields,
        },
        "fuentes": {
            "filas": {"v14": len(f14), "v15": len(f15)},
            "urls_unicas": {"v14": len(urls14), "v15": len(urls15)},
            "urls_anadidas": fu_added, "urls_retiradas": fu_removed,
            "urls_duplicadas_v14": fu_dup14, "urls_duplicadas_v15": fu_dup15,
            "relaciones_v14": {k: v for k, v in rel14.items() if not k.endswith("_ids")},
            "relaciones_v15": {k: v for k, v in rel15.items() if not k.endswith("_ids")},
        },
        "geografia": {
            "v14": {"localizadas": geo14["locatedTotal"], "stats": geo14["geoStats"]},
            "v15": {"localizadas": geo15["locatedTotal"], "stats": geo15["geoStats"]},
            "ganan_punto": gained, "pierden_punto": lost,
            "geonameid_cambiado": gid_changed,
            "coordenada_sin_cambio_de_texto": coord_moved_same_text,
            "localidad_modificada": loc_changed, "region_modificada": reg_changed,
        },
        "impacto": impact,
        "anomalias": anomalies,
        "modificados_detalle": modified,
        "detalles": {
            "ausentes": ausentes_detalle,
            "recategorizados": otros_detalle,
            "sexo_valores_nuevos": sexo_nuevos,
            "sexo_nuevos_afectados": sexo_nuevos_afectados,
            "categorias_adicionales_efectivas": adicionales_efectivas,
            "recipients": {"v14": dict(recipients14), "v15": dict(recipients15)},
            "estados": {"v14": dict(estados14), "v15": dict(estados15)},
        },
    }

    GEN.mkdir(parents=True, exist_ok=True)
    (GEN / "v14-v15-diff.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(GEN / "v14-v15-diff.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "tipo", "campo", "valor_v14", "valor_v15", "clase"])
        for r in diff_rows:
            w.writerow([r["id"], r["tipo"], r["campo"], r["v14"], r["v15"], r["clase"]])
    with open(GEN / "v15-anomalias.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["tipo", "id", "campo", "detalle"])
        for a in anomalies:
            w.writerow([a["tipo"], a["id"], a["campo"], a["detalle"]])

    write_reports(result)
    print(json.dumps({
        "registros": [len(d14), len(d15)], "altas": len(added), "ausentes": len(missing),
        "sin_cambios": unchanged, "modificados": len(modified), "solo_formales": len(formal_only_ids),
        "reutilizados": reused, "duplicados_v15": dups15,
        "paises": [len(countries14), len(countries15)],
        "issues_paises_v14": len(issues14), "issues_paises_v15": len(issues15),
        "categorias_nuevas": new_cats, "variantes": variants,
        "relaciones": [rel14["relaciones_exactas"], rel15["relaciones_exactas"]],
        "geo": [geo14["locatedTotal"], geo15["locatedTotal"]],
        "ganan": len(gained), "pierden": len(lost), "gid": len(gid_changed),
        "anomalias": len(anomalies),
    }, ensure_ascii=False, indent=1))
    return 0


def _lst(ids, cap=40):
    ids = list(ids)
    if len(ids) <= cap:
        return ", ".join(f"`{i}`" for i in ids) or "—"
    return ", ".join(f"`{i}`" for i in ids[:cap]) + f" … (+{len(ids) - cap} más en el JSON/CSV)"


def write_reports(r: dict) -> None:
    e, i, p, c, f, g, d = (r["estructura"], r["identidad"], r["paises"], r["categorias"],
                           r["fuentes"], r["geografia"], r["detalles"])
    imp = r["impacto"]
    atipos = Counter(a["tipo"] for a in r["anomalias"])
    sin_url15 = {k: v for k, v in atipos.items() if k.startswith("fuente_sin_url_exacta_v15")}
    sin_url14 = sum(v for k, v in atipos.items() if k.startswith("fuente_sin_url_exacta_v14"))
    sub15 = Counter()
    for a in r["anomalias"]:
        if a["tipo"].startswith("fuente_sin_url_exacta_v15"):
            m = re.search(r"\[(.+?)\]", a["detalle"])
            if m:
                sub15[m.group(1)] += 1
    bloqueantes = len(i["duplicados_v15"]) + len(i["ids_reutilizados"]) + len(e["columnas_directorio"]["retiradas"])

    # ------------------------------------------ informe geográfico v15
    geo_md = f"""# Informe geográfico del v15 — Fase 8A (solo análisis)

Generado por `tools/data/audit_v14_v15.py` ejecutando el pipeline
actual (`build_catalog.py`) sobre el v15 en una caja de análisis
aislada, con las filas reordenadas **por nombre de cabecera** al
orden v14 (el generador lee por posición; ver §1 del informe
principal). Ninguna coordenada nueva queda aceptada para
producción: esto es un análisis comparativo.

## Resolución de ubicaciones

| | v14 | v15 |
|---|---|---|
| Con punto (localidad resuelta) | {g['v14']['localizadas']} | {g['v15']['localizadas']} |
| Ambiguas (sin punto) | {g['v14']['stats'].get('ambiguous', 0)} | {g['v15']['stats'].get('ambiguous', 0)} |
| Sin coincidencia (sin punto) | {g['v14']['stats'].get('not_found', 0)} | {g['v15']['stats'].get('not_found', 0)} |
| Sin localidad utilizable | {g['v14']['stats'].get('no_locality', 0)} | {g['v15']['stats'].get('no_locality', 0)} |
| **Total sin punto** | {imp['sin_punto']['v14']} | {imp['sin_punto']['v15']} |

## Comparación por ID (sobre los {e['filas_directorio']['v14'] - len(i['ausentes_en_v15'])} registros comunes)

- **Ganan punto:** {len(g['ganan_punto'])} — {_lst(g['ganan_punto'])}
- **Pierden punto:** {len(g['pierden_punto'])} — {_lst(g['pierden_punto'])}
- **Cambian de geonameId conservando punto:** {len(g['geonameid_cambiado'])}
- **Coordenadas distintas con el mismo geonameId y sin cambio del texto de localidad:** {len(g['coordenada_sin_cambio_de_texto'])}
- **Texto de localidad modificado:** {len(g['localidad_modificada'])} — {_lst(g['localidad_modificada'])}
- **Texto de región modificado:** {len(g['region_modificada'])}

El descenso neto de puntos ({g['v14']['localizadas']} → {g['v15']['localizadas']})
se descompone en: los registros ausentes en v15 que tenían punto
y el único registro común que pierde el punto,
`{g['pierden_punto'][0] if g['pierden_punto'] else '—'}`: su
localidad pasa a un nombre más preciso que el gazetteer no
resuelve de forma única (queda ambiguo). Es candidato a
corrección manual en la 8B; no se ha aceptado coordenada alguna.
"""
    (GEN / "v15-geocoding-report.md").write_text(geo_md, encoding="utf-8")

    # ------------------------------------------ informe principal
    aus_rows = "\n".join(
        f"| `{a['id']}` | {a['nombre']} | {a['pais']} | {a['categoria']} | "
        f"{'sí' if a['tenia_punto'] else 'no'} | {', '.join(a['consta_en']) or 'no localizada'} |"
        for a in d["ausentes"])
    campos = sorted(i["cambios_por_campo"].items(), key=lambda kv: -kv[1])
    campos_rows = "\n".join(
        f"| {k} | {v} | {i['formales_por_campo'].get(k, 0)} |" for k, v in campos)
    paises_rows = "\n".join(
        f"| {x['pais']} ({x['codigo']}) | {x['declarado']} | {x['suma_desglose']} | {x['calculado_directorio']} |"
        for x in (p["declarado_vs_calculado_v15"] or [])) or "| — | — | — | — |"
    cats_rows = "\n".join(
        f"| {k} | {c['v14'].get(k, 0)} | {c['v15'].get(k, 0)} |"
        for k in sorted(set(c["v14"]) | set(c["v15"]), key=lambda k: -c["v15"].get(k, 0)))
    sexo_list = "\n".join(f"- «{v}»" for v in d["sexo_valores_nuevos"]) or "- —"
    anom_rows = "\n".join(f"| {k} | {v} |" for k, v in sorted(atipos.items())) or "| — | 0 |"
    mov_rows = "\n".join(
        f"| {m['columna']} | {m['pos_v14']} | {m['pos_v15']} |"
        for m in e["columnas_directorio"]["movidas"]) or "| — | — | — |"

    md = f"""# Fase 8A — Auditoría comparativa v14 → v15 (candidato 1)

**Alcance:** solo análisis. No se ha importado nada en
PostgreSQL, no se ha tocado la API ni la interfaz y no se ha
desplegado ningún dato. Producción sigue con el v14. Los dos
Excel quedan intactos: el v14 conserva su SHA-256 y el v15 se
copió a `data/source/` con nombre versionado, sin modificar el
original subido por Jon.

| | v14 (vigente) | v15-candidato-1 |
|---|---|---|
| Fichero | `Directorio_Opus_Dei_MUNDIAL_v14.xlsx` | `Directorio_Opus_Dei_MUNDIAL_v15-candidato-1.xlsx` |
| Tamaño | {r['meta']['v14']['bytes']:,} bytes | {r['meta']['v15']['bytes']:,} bytes |
| SHA-256 | `{r['meta']['v14']['sha256']}` | `{r['meta']['v15']['sha256']}` |
| Registros en Directorio | {e['filas_directorio']['v14']} | {e['filas_directorio']['v15']} |
| Países con registros | {imp['paises']['v14']} | {imp['paises']['v15']} |
| Con punto en el mapa | {imp['con_punto']['v14']} | {imp['con_punto']['v15']} |
| Relaciones exactas con Fuentes | {imp['relaciones_exactas']['v14']} | {imp['relaciones_exactas']['v15']} |

Nota de procedencia: la hoja `LEEME` del v15 registra como
último cambio interno la «v45 (2026-11-11)»: el fichero que Jon
denomina v15 es la exportación 15 de un libro de trabajo con
versionado propio (v45) y 37 hojas, la mayoría de trabajo
(Resueltos/Retiradas por lotes). Empieza así: «{r['meta']['v15']['nota_leeme'][:180]}…»

## Resumen ejecutivo

- El v15 **no es una ampliación: es una pasada de corrección**
  sobre el mismo directorio. **0 altas, {len(i['ausentes_en_v15'])}
  bajas, {i['sin_cambios']} registros idénticos y
  {i['modificados']} modificados** (todos con al menos un cambio
  real de contenido; cambios meramente formales por registro: 0).
- **Las 5 bajas están documentadas en el propio libro**
  (hojas `Retiradas v41`/`Retiradas v42`): no son pérdidas.
  Una de ellas, `DO-01`, era el único registro de República
  Dominicana, que **desaparece como país** ({imp['paises']['v14']} → {imp['paises']['v15']}).
- El barrido de verificación del libro se refleja en los
  datos: «Confirmado y contrastado» pasa de
  {d['estados']['v14'].get('Confirmado y contrastado', 0)} a
  {d['estados']['v15'].get('Confirmado y contrastado', 0)} registros, y los campos más
  tocados son Fecha de consulta ({i['cambios_por_campo'].get('Fecha de consulta', 0)}),
  Resultado de doble comprobación ({i['cambios_por_campo'].get('Resultado doble comprobación', 0)})
  y Código postal ({i['cambios_por_campo'].get('Código postal', 0)}).
- **Integridad limpia en lo esencial:** 0 IDs duplicados,
  0 IDs reutilizados con otra iniciativa, 0 columnas v14
  perdidas, 0 variantes tipográficas de categoría, y la única
  discrepancia declarado/calculado de Países es la ya conocida
  de Puerto Rico, idéntica en ambas versiones.
- **Tres frentes requieren decisión antes de migrar:** la
  categoría nueva «Otros» (2 registros recategorizados), el
  campo Sexo convertido en texto libre descriptivo
  ({len(d['sexo_valores_nuevos'])} valores nuevos que afectan a
  {d['sexo_nuevos_afectados']} registros) y la deriva de Fuente 2
  hacia citas sin URL exacta (las relaciones exactas bajan de
  {imp['relaciones_exactas']['v14']} a {imp['relaciones_exactas']['v15']} y las
  Fuente 2 sin coincidencia suben de
  {f['relaciones_v14']['sin_coincidencia_f2']} a {f['relaciones_v15']['sin_coincidencia_f2']}).
- **El mayor riesgo no está en los datos, está en nuestro
  pipeline:** el generador lee el Directorio **por posición de
  columna** y el v15 reordena e inserta columnas. Importar el
  v15 con el pipeline actual **mezclaría los campos sin dar
  error**. La 8B debe leer por nombre de cabecera (esta
  auditoría ya lo hace así en su caja de análisis).

## 1. Estructura

- Hojas: v14 tiene 3 ({", ".join(e['hojas_v14'])}); el v15
  tiene {len(e['hojas_v15'])}, con {len(e['hojas_nuevas'])} nuevas
  (LEEME, Instituciones, Resumen, Verificación, Conciliación_V,
  Discrepancias, Pendientes, Cobertura, Auditoría, Cambios y
  las hojas de Resueltos/Retiradas por lote). Solo Directorio,
  Países y Fuentes alimentan la aplicación.
- Directorio: {len(e['columnas_directorio']['v14'])} columnas
  en v14 → {len(e['columnas_directorio']['v15'])} en v15.
  **Añadidas:** {", ".join(e['columnas_directorio']['anadidas']) or '—'}.
  **Retiradas:** {", ".join(e['columnas_directorio']['retiradas']) or 'ninguna'}.
- Columnas desplazadas (posición v14 → v15):

| Columna | v14 | v15 |
|---|---|---|
{mov_rows}

- Relleno de las columnas nuevas en v15: Nombre alternativo
  {e['relleno_columnas_nuevas'].get('Nombre alternativo', 0)} registros;
  Web específica {e['relleno_columnas_nuevas'].get('Web específica', 0)};
  Google Maps {e['relleno_columnas_nuevas'].get('Google Maps', 0)};
  Categorías adicionales con valor efectivo
  {d['categorias_adicionales_efectivas']} (el resto lleva
  «No aplicable» o marcador de ausencia). La aplicación actual
  no tiene campos para estas cuatro columnas: su destino es
  una decisión de la 8B.
- Fórmulas en Directorio/Países/Fuentes: 0 en ambas versiones
  (valores literales; tipos homogéneos con v14).

## 2. Identidad e integridad

- Totales: {e['filas_directorio']['v14']} → {e['filas_directorio']['v15']};
  IDs únicos {e['filas_directorio']['v15']} de {e['filas_directorio']['v15']} en v15
  (**duplicados: {len(i['duplicados_v15'])}**).
- **Altas respecto al v14: {len(i['altas'])}.** Ausentes en
  v15: {len(i['ausentes_en_v15'])}, todos documentados como
  retiradas en el propio libro:

| ID | Nombre (v14) | País | Categoría | ¿Tenía punto? | Consta retirada en |
|---|---|---|---|---|---|
{aus_rows}

- **IDs reutilizados con otra iniciativa: {len(i['ids_reutilizados'])}**
  (mismo ID con nombre y país distintos a la vez).
- Coherencia prefijo del ID ↔ Código país: sin discrepancias
  en v15 ({len(i['prefijo_distinto_v15'])}); en v14,
  {len(i['prefijo_distinto_v14'])}.
- Pérdidas de campos clave (nombre/país/código/localidad con
  valor en v14 y ausencia en v15): ver anomalías
  `perdida_campo` en el CSV (total de anomalías registradas:
  {len(r['anomalias'])}).

## 3. Diferencias por registro

- Sin cambios: **{i['sin_cambios']}**. Modificados:
  **{i['modificados']}**. Con cambios solo formales: **{len(i['solo_formales'])}**.
- La comparación distingue cambio **formal** (espacios,
  mayúsculas, comillas o guiones, o cambio del marcador de
  ausencia) de cambio **real** de contenido; el detalle
  completo, campo a campo con valor v14 y v15, está en
  `data/generated/v14-v15-diff.csv` y `.json`.
- Cambios por campo (registros) y cuántos son solo formales:

| Campo | Cambios | Solo formales |
|---|---|---|
{campos_rows}

## 4. Países

- Países con registros: {imp['paises']['v14']} → {imp['paises']['v15']}.
  Nuevo: ninguno. Eliminado: **República Dominicana (DO)**,
  consecuencia directa de la retirada de su único registro
  (`DO-01`), documentada en `Retiradas v41`.
- Totales declarados en la hoja Países frente a calculados
  desde el Directorio — discrepancias en v15:

| País | Declarado | Suma del desglose | Calculado |
|---|---|---|---|
{paises_rows}

  Es el caso ya conocido de **Puerto Rico (PR-06)**: la hoja
  declara 6 y el Directorio tiene 6, pero el desglose por
  estados suma 5 porque un registro lleva el estado suelto
  «Confirmado», fuera de las cuatro columnas del desglose.
  **La misma discrepancia, con las mismas cifras, ya existe
  en el v14**: no es una regresión del v15. En v14 también es
  la única. Los conteos oficiales de la aplicación seguirán
  derivándose del Directorio.

## 5. Categorías y normalización

- Las 14 categorías conocidas se mantienen; aparece una
  nueva, **«Otros»**, con {c['v15'].get('Otros', 0)} registros, ambos por
  recategorización expresa:
  {"; ".join(f"`{o['id']}` ({o['nombre']}) pasa de {o['categoria_v14']} a Otros" for o in d['recategorizados']) or '—'}.
  Sin variantes tipográficas (acentos/mayúsculas) de ninguna
  categoría en ninguna versión. Cambios de categoría por ID:
  {len(c['cambios_por_id'])}, los dos citados.

| Categoría | v14 | v15 |
|---|---|---|
{cats_rows}

- **Sexo:** el v15 lo convierte en texto libre descriptivo:
  {len(d['sexo_valores_nuevos'])} valores nuevos que afectan a
  {d['sexo_nuevos_afectados']} registros, por ejemplo:
{sexo_list}
  La clasificación por destinatarios del pipeline los sigue
  resolviendo por su prefijo («Ambos sexos», «Mixto»,
  «Hombres y mujeres»…): la distribución resultante sería
  {d['recipients']['v15']} frente a {d['recipients']['v14']} en v14.
  No se ha normalizado nada globalmente; que Sexo pase a ser
  lista cerrada + nota, o se acepte el texto libre, es una
  decisión para Jon.
- **Estado de verificación:** {d['estados']['v15']} en v15
  frente a {d['estados']['v14']} en v14. El estado suelto
  «Confirmado» (PR-06) persiste con 1 registro.
- **Estado de actividad:** sin valores nuevos.
- **Regla `NL`:** se ha aplicado por campo y valor completo,
  como en el pipeline (en `Código país`, NL sigue siendo
  Países Bajos y nunca ausencia); ningún recuento de esta
  auditoría trata «NL» como ausencia fuera de esa regla.

## 6. Geografía

Pipeline actual ejecutado sobre el v15 en modo análisis
(detalle completo en `data/generated/v15-geocoding-report.md`):

| | v14 | v15 |
|---|---|---|
| Con punto | {g['v14']['localizadas']} | {g['v15']['localizadas']} |
| Ambiguas | {g['v14']['stats'].get('ambiguous', 0)} | {g['v15']['stats'].get('ambiguous', 0)} |
| Sin coincidencia | {g['v14']['stats'].get('not_found', 0)} | {g['v15']['stats'].get('not_found', 0)} |
| Sin localidad utilizable | {g['v14']['stats'].get('no_locality', 0)} | {g['v15']['stats'].get('no_locality', 0)} |

- Ganan punto: {len(g['ganan_punto'])}. Pierden punto siendo
  registros comunes: {len(g['pierden_punto'])} ({_lst(g['pierden_punto'])}).
- El resto de la bajada ({g['v14']['localizadas']} → {g['v15']['localizadas']})
  son las bajas documentadas que tenían punto.
- Solo **1** texto de localidad cambia en todo el directorio
  ({_lst(g['localidad_modificada'])}): es el caso que pierde el punto — la
  localidad nueva es más precisa en el texto pero ambigua
  para el gazetteer. Ningún registro cambia de geonameId ni
  de coordenadas sin cambiar el texto. Ninguna coordenada
  nueva queda aceptada automáticamente: la resolución de ese
  caso (corrección manual) es decisión de la 8B.

## 7. Direcciones y contactos

Registros con cambio real por campo (detalle en el diff):
Dirección completa {i['cambios_por_campo'].get('Dirección completa', 0)} ·
Código postal {i['cambios_por_campo'].get('Código postal', 0)} ·
Localidad {i['cambios_por_campo'].get('Localidad', 0)} ·
Región {i['cambios_por_campo'].get('Región/Provincia/Estado', 0)} ·
Teléfono {i['cambios_por_campo'].get('Teléfono', 0)} ·
Email {i['cambios_por_campo'].get('Email de contacto', 0)} ·
Web oficial {i['cambios_por_campo'].get('Web oficial', 0)} ·
Entidad titular {i['cambios_por_campo'].get('Entidad titular', 0)} ·
Sexo/destinatarios {i['cambios_por_campo'].get('Sexo', 0)} ·
Tipo de vinculación {i['cambios_por_campo'].get('Tipo de vinculación', 0)}.
Son el grueso del barrido de corrección del libro (sede de
MX-04, nueva sede de MX-06, direcciones de CL-31, AR-04 y
AR-05, según la hoja LEEME).

## 8. Fuentes y documentación

- Hoja Fuentes: {f['filas']['v14']} → {f['filas']['v15']} filas;
  URLs únicas {f['urls_unicas']['v14']} → {f['urls_unicas']['v15']};
  **+{len(f['urls_anadidas'])} URLs añadidas, −{len(f['urls_retiradas'])} retiradas**.
  URLs repetidas dentro de la hoja: {len(f['urls_duplicadas_v14'])} en v14 y
  {len(f['urls_duplicadas_v15'])} en v15 (preexistentes; son la causa de las
  relaciones ambiguas).
- Relaciones por coincidencia **exacta** de URL (única regla
  automática, sin cambios):

| | v14 | v15 |
|---|---|---|
| Relaciones exactas | {f['relaciones_v14']['relaciones_exactas']} | {f['relaciones_v15']['relaciones_exactas']} |
| Ambiguas (URL en varias fuentes) | {f['relaciones_v14']['ambiguas']} | {f['relaciones_v15']['ambiguas']} |
| Fuente 1 sin coincidencia | {f['relaciones_v14']['sin_coincidencia_f1']} | {f['relaciones_v15']['sin_coincidencia_f1']} |
| Fuente 2 sin coincidencia | {f['relaciones_v14']['sin_coincidencia_f2']} | {f['relaciones_v15']['sin_coincidencia_f2']} |

- **Deriva de formato en Fuente 2:** en v15 hay
  {sum(sin_url15.values())} valores de Fuente 1/2 que no son una URL exacta
  (en v14, {sin_url14}), desglosados en
  {dict(sub15)}: citas del tipo «dominio (nota)» o texto libre
  («dbk.de (Conferencia Episcopal Alemana…)») que la regla de
  URL exacta no puede enlazar con el catálogo. Es la causa
  principal de que las Fuente 2 sin coincidencia suban de
  {f['relaciones_v14']['sin_coincidencia_f2']} a {f['relaciones_v15']['sin_coincidencia_f2']}.
  Evidencia, doble comprobación y fecha de consulta cambian
  en {i['cambios_por_campo'].get('Evidencia de vinculación', 0)},
  {i['cambios_por_campo'].get('Resultado doble comprobación', 0)} y
  {i['cambios_por_campo'].get('Fecha de consulta', 0)} registros respectivamente:
  es el barrido de verificación, no un deterioro.

## 9. Impacto previsto (sin importar nada)

| Magnitud | v14 | v15 | Δ |
|---|---|---|---|
| Iniciativas | {imp['iniciativas']['v14']} | {imp['iniciativas']['v15']} | {imp['iniciativas']['v15'] - imp['iniciativas']['v14']:+d} |
| Países | {imp['paises']['v14']} | {imp['paises']['v15']} | {imp['paises']['v15'] - imp['paises']['v14']:+d} |
| Con punto | {imp['con_punto']['v14']} | {imp['con_punto']['v15']} | {imp['con_punto']['v15'] - imp['con_punto']['v14']:+d} |
| Sin punto | {imp['sin_punto']['v14']} | {imp['sin_punto']['v15']} | {imp['sin_punto']['v15'] - imp['sin_punto']['v14']:+d} |
| Relaciones exactas | {imp['relaciones_exactas']['v14']} | {imp['relaciones_exactas']['v15']} | {imp['relaciones_exactas']['v15'] - imp['relaciones_exactas']['v14']:+d} |
| Fichas que cambiarían | — | {imp['fichas_modificadas']} modificadas + {len(i['ausentes_en_v15'])} retiradas | |
| catalog.json | {imp['artefactos_bytes']['catalog_v14']:,} B | {imp['artefactos_bytes']['catalog_v15']:,} B | |

Los filtros y conteos visibles se derivan de estas cifras:
un país menos en el selector (República Dominicana), la
categoría «Otros» fuera del sistema cromático actual de 14,
{imp['con_punto']['v15']} marcadores y los estados con
{d['estados']['v15'].get('Confirmado y contrastado', 0)} contrastados.

## Anomalías registradas

Detalle completo en `data/generated/v15-anomalias.csv`
({len(r['anomalias'])} filas). Por tipo:

| Tipo | Nº |
|---|---|
{anom_rows}

Ninguna anomalía se ha corregido silenciosamente: todas
quedan documentadas tal como salen de los ficheros.

## Cambios potencialmente peligrosos

1. **El pipeline actual corrompería el v15.** El generador
   (`build_catalog.py`) desempaqueta cada fila por posición
   en el orden v14 y tiene tres aserciones con las cifras del
   v14 (1.382 registros, 1.382 IDs, 70 países) además del
   nombre de fichero fijado. Con el v15 —columnas insertadas
   y reordenadas— generaría un catálogo con los campos
   mezclados (el país sería la categoría, etc.) y su hash
   coincidiría con el Excel, con lo que el importador lo
   aceptaría. **No se debe ejecutar `npm run data` sobre el
   v15 hasta que la 8B lea por nombre de cabecera.** (El
   importador sí se protege frente a artefactos de OTRO
   Excel: exige que el SHA-256 del catálogo y del Excel
   coincidan.)
2. **República Dominicana desaparece del mapa y del
   selector** al retirarse su único registro. Está
   documentado en el libro, pero es un cambio visible que
   conviene confirmar expresamente.
3. **«Otros» queda fuera del sistema de categorías**: la
   interfaz conoce 14 categorías con color propio; dos
   fichas (una ex-Colegios, una ex-Universidades) caerían en
   una categoría sin tratamiento definido.
4. **Sexo como texto libre**: si una futura edición empieza
   un valor con otra fórmula («Centro mixto…»), la
   clasificación por destinatarios lo mandaría a «no consta»
   sin avisar. El texto descriptivo es valioso como nota,
   frágil como clave.
5. **`AU-08` perdería su punto** por ambigüedad del nuevo
   nombre de localidad, aunque la sede no se ha movido.

## Decisiones que necesita tomar Jon

1. Confirmar las 5 retiradas y, en particular, la
   desaparición de República Dominicana como país del Atlas.
2. «Otros»: ¿se añade como 15ª categoría con su color, se
   mapea a otra en la importación, o vuelven ES-294 y PH-064
   a su categoría en el Excel?
3. Sexo: ¿lista cerrada + el texto descriptivo a una nota
   (¿en «Nombre alternativo»/evidencia?), o se mantiene el
   texto libre asumiendo la clasificación por prefijo?
4. Fuente 2 con citas sin URL: ¿se aceptan como evidencia no
   enlazable (quedan como texto, sin relación), o se
   normalizan a URL en el Excel cuando exista?
5. AU-08: ¿corrección manual de coordenadas (localidad
   Kensington, Sídney) en la 8B, o se acepta que quede sin
   punto hasta resolver el gazetteer?
6. Columnas nuevas (Nombre alternativo, Categorías
   adicionales, Web específica, Google Maps): ¿se incorporan
   a la ficha en la 8B o quedan fuera de la aplicación?
7. El estado suelto «Confirmado» de PR-06: ¿se corrige en el
   Excel a uno de los cuatro estados del desglose?

## Recomendación

**APTO para preparar la migración (Fase 8B), con las
decisiones anteriores tomadas antes de importar.** Los datos
del v15 son íntegros y trazables (0 duplicados, 0
reutilizaciones, bajas documentadas, discrepancia de países
heredada y conocida). **NO APTO para importar con el
pipeline actual sin cambios**: la lectura posicional de
columnas es un bloqueante técnico de nuestro lado, no del
fichero, y forma parte del trabajo de la 8B (leer por nombre
de cabecera, parametrizar las aserciones y aceptar la versión
del directorio como dato explícito). Bloqueantes en los
datos: {bloqueantes}.

## Comandos exactos para reproducir la auditoría

```bash
cd ~/workspace/atlas-iniciativas-opus-dei

# 0) El v15 ya copiado (sin tocar el original ni el v14):
#    data/source/Directorio_Opus_Dei_MUNDIAL_v15-candidato-1.xlsx
sha256sum data/source/Directorio_Opus_Dei_MUNDIAL_v14.xlsx \\
          data/source/Directorio_Opus_Dei_MUNDIAL_v15-candidato-1.xlsx

# 1) Caja de análisis aislada (el generador escribe en
#    apps/web/public/data y data/generated de SU raíz):
SB=~/workspace/.atlas-8a-sandbox
mkdir -p $SB/data/cache $SB/data/source $SB/data/generated \\
         $SB/apps/web/public/data $SB/tools
cp -r tools/data $SB/tools/ && rm -rf $SB/tools/data/.venv
for f in admin1CodesASCII.txt cities1000.txt ne_50m_admin_0_countries.json; do
  ln -s ~/workspace/atlas-iniciativas-opus-dei/data/cache/$f $SB/data/cache/$f
done
ln -s ~/workspace/atlas-iniciativas-opus-dei/data/cache/geonames_countries \\
      $SB/data/cache/geonames_countries
cp data/cache/geocoding_cache.json $SB/data/cache/
cp data/source/Directorio_Opus_Dei_MUNDIAL_v15-candidato-1.xlsx \\
   $SB/data/source/Directorio_Opus_Dei_MUNDIAL_v14.xlsx

# 2) Adaptaciones SOLO en la copia de la caja (el repo no se toca):
#    - las 3 aserciones con cifras v14 pasan a «print» de análisis;
#    - la agrupación de ambiguos/sin coincidencia usa payload.get;
#    - tras leer el Directorio, las filas se reordenan al orden
#      v14 POR NOMBRE de cabecera (las 23 columnas v14 existen
#      en el v15) antes del desempaquetado posicional.

# 3) Pipeline geográfico sobre el v15 (en la caja):
tools/data/.venv/bin/python $SB/tools/data/build_catalog.py

# 4) Auditoría comparativa y generación de entregables:
tools/data/.venv/bin/python tools/data/audit_v14_v15.py
```

Entregables: este informe, `data/generated/v14-v15-diff.json`,
`data/generated/v14-v15-diff.csv`,
`data/generated/v15-geocoding-report.md` y
`data/generated/v15-anomalias.csv`. **La Fase 8B no se ha
iniciado.**
"""
    (ROOT / "docs" / "fase-8a-comparativa-v14-v15.md").write_text(md, encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
