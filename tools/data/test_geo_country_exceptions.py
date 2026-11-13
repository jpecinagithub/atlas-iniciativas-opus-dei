#!/usr/bin/env python3
"""
Prueba negativa de la lista cerrada de excepciones geográficas
(Fase 8C, corrección de Jon de 2026-11-13).

El generador (tools/data/build_catalog.py) tolera una diferencia
entre el «País ISO» geográfico y el «Código país» del directorio
SOLO en las combinaciones exactas de GEO_COUNTRY_EXCEPTIONS
(IE-15 / IE / GB / 2655984 e IE-16 / IE / GB / 2655984, Belfast).
Cualquier otra discrepancia debe BLOQUEAR el punto y constar como
anomalía en el informe de resolución.

Esta prueba lo verifica de extremo a extremo con una discrepancia
FICTICIA: copia el libro v15-6 a un directorio temporal, cambia el
«País ISO» de ES-01 (Pamplona, ID 3114472) de ES a PT sin tocar su
GeoNames ID, y regenera el catálogo contra salidas temporales.
Debe cumplirse:

  1. ES-01 queda SIN punto (bloqueado) y la única anomalía del
     informe es la suya, con reason «iso_differs_from_country_code».
  2. El total con punto baja exactamente en uno: 1.386.
  3. Control positivo en la misma corrida: IE-15 e IE-16 conservan
     su punto de Belfast (54.59682, -5.92541; ID 2655984) y constan
     como observaciones con reason
     «iso_differs_from_country_code_exception».

El libro del repo no se toca; todas las salidas van a /tmp.

Uso: .venv/bin/python tools/data/test_geo_country_exceptions.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[2]
BOOK = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v15-6.xlsx"
VICTIM = "ES-01"
FAKE_ISO = "PT"

failures = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global failures
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures += 1


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="atlas-geo-exc-"))
    fake_book = tmp / "Directorio_ficticio.xlsx"

    # --- Libro ficticio: ES-01 con País ISO PT (ID español intacto)
    wb = load_workbook(BOOK)
    ws = wb["Directorio"]
    header = [c.value for c in ws[1]]
    col_id = header.index("ID único") + 1
    col_iso = header.index("País ISO") + 1
    col_gid = header.index("GeoNames ID") + 1
    found = None
    for row in range(2, ws.max_row + 1):
        if ws.cell(row=row, column=col_id).value == VICTIM:
            found = (ws.cell(row=row, column=col_iso).value,
                     ws.cell(row=row, column=col_gid).value)
            ws.cell(row=row, column=col_iso).value = FAKE_ISO
            break
    assert found is not None, f"{VICTIM} no aparece en el Directorio del v15-6"
    check(f"Libro ficticio: {VICTIM} pasa de ISO {found[0]} a {FAKE_ISO} (GeoNames ID {found[1]} intacto)",
          found[0] == "ES")
    wb.save(fake_book)

    # --- Regeneración completa contra salidas temporales
    out_dir, report_dir = tmp / "out", tmp / "report"
    r = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "data" / "build_catalog.py"),
         "--source", str(fake_book), "--out-dir", str(out_dir),
         "--sources-out", str(tmp / "sources.json"), "--report-dir", str(report_dir)],
        capture_output=True, text=True)
    check("La regeneración con el libro ficticio termina sin error", r.returncode == 0,
          r.stderr.strip().splitlines()[-1] if r.returncode != 0 and r.stderr else "")

    catalog = json.loads((out_dir / "catalog.json").read_text(encoding="utf-8"))
    report = json.loads((report_dir / "geocoding-report.json").read_text(encoding="utf-8"))
    by_id = {i["id"]: i for i in catalog["initiatives"]}

    # --- 1. La discrepancia ficticia bloquea el punto y es anomalía
    victim = by_id[VICTIM]
    check(f"{VICTIM} queda sin punto (bloqueada)", victim["lat"] is None and victim["lng"] is None,
          f"lat={victim['lat']}")
    anomalies = report["idAnomalies"]
    check("La única anomalía del informe es la de la víctima",
          len(anomalies) == 1 and anomalies[0]["id"] == VICTIM
          and anomalies[0]["reason"] == "iso_differs_from_country_code",
          json.dumps(anomalies, ensure_ascii=False)[:200])

    # --- 2. Total: exactamente un punto menos que el certificado
    check("Total con punto = 1.386 (1.387 − 1 bloqueada)",
          catalog["meta"]["located"] == 1386, str(catalog["meta"]["located"]))

    # --- 3. Control positivo: las dos excepciones exactas conservan
    for rid in ("IE-15", "IE-16"):
        rec = by_id[rid]
        check(f"{rid} conserva el punto de Belfast por la excepción expresa",
              (rec["lat"], rec["lng"], rec["geonameId"]) == (54.59682, -5.92541, 2655984),
              f"{rec['lat']}, {rec['lng']}, ID {rec['geonameId']}")
    obs = {o["id"]: o["reason"] for o in report["idObservations"]}
    check("IE-15 e IE-16 constan como observaciones de excepción (y nadie más)",
          obs == {"IE-15": "iso_differs_from_country_code_exception",
                  "IE-16": "iso_differs_from_country_code_exception"},
          json.dumps(obs, ensure_ascii=False))

    print("\nExcepciones geográficas: OK" if failures == 0 else f"\n{failures} FALLOS")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
