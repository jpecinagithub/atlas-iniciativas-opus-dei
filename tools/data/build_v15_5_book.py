#!/usr/bin/env python3
"""
Crea la copia versionada v15-5 del Directorio (Fase 8B, 2026-11-13).

Copia `Directorio_Opus_Dei_MUNDIAL_v15-4.xlsx` a
`Directorio_Opus_Dei_MUNDIAL_v15-5.xlsx` SIN tocar el original e
incorpora EXACTAMENTE las decisiones cerradas de Jon (2026-11-13):

  (a) Categorías normalizadas a la paleta de 14 de la aplicación
      (desaparecen «Otros», «Escuelas de hostelería», «Residencia de
      estudiantes» y «Club juvenil»): 10 registros, cada cambio
      anotado en la hoja Cambios como categoría anterior → canónica.
      Sin alias en la aplicación: el cambio va en el dato.
  (b) Estados: PL-33, PL-34 y PL-35 pasan de «Confirmado» a
      «Confirmado y contrastado»; PR-06 permanece «Confirmado» (D1).
  (c) Hoja Países reconstruida íntegramente desde el Directorio ya
      corregido: 70 filas recalculadas, columna «Confirmado» añadida
      al desglose, valores materializados (no fórmulas), identidad
      por país Nº = contrastado + parciales + Confirmado + Pendiente
      + Histórico, total 1.411. República Dominicana permanece en
      cero con su explicación histórica. El resto de columnas
      (ámbito, evidencia, notas) no se toca.
  (d) ES-218 y ES-219 resueltas por revisión manual: Ciudad
      canónica, Provincia/Estado, País ISO, GeoNames ID (8379312 /
      3110718), Precisión «localidad», Fuente geográfica «GeoNames /
      revisión manual» y Nota geográfica que documenta la resolución
      (dirección y CP coincidentes con el lugar poblado oficial).
  (e) LEEME (entrada nueva al principio), Cambios (16 filas nuevas)
      y «Geografía v15» (recuentos actualizados: 1.317 / 94; el grupo
      «sin localidad o sin nota» pasa de 5 a 3) actualizados.

El script verifica antes de escribir cada valor esperado y PARA con
error si el libro no está en el estado previsto. Al final imprime el
SHA-256 de la copia (el hash no se escribe dentro del libro: la hoja
LEEME no registra hashes; queda en el informe y en el commit).

Uso: .venv/bin/python tools/data/build_v15_5_book.py
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v15-4.xlsx"
DST = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v15-5.xlsx"
SRC_SHA_ESPERADO = "5fca50bbd4bda7e686ce264198c6b49f419ba059a952f26cb2836b3bfcc0a4f8"
FECHA = "2026-11-13"

# Columnas de la hoja Directorio (1-based), por la cabecera vigente.
C_ID, C_CAT, C_ESTADO = 1, 3, 17
C_PAIS, C_CODIGO = 5, 6
C_CIUDAD, C_PROV, C_ISO, C_GNID, C_PREC, C_FUENTE, C_NOTA = 25, 27, 28, 29, 30, 31, 32

CATEGORIAS = {
    # id: (categoría anterior esperada, categoría canónica)
    "ES-294": ("Otros", "Escuelas de formación Técnica"),
    "PH-064": ("Otros", "Centros culturales"),
    "ES-299": ("Otros", "Residencias universitarias"),
    "JP-09": ("Otros", "Centros culturales"),
    "VE-20": ("Otros", "Centros de promoción social"),
    "VE-21": ("Otros", "Centros de promoción social"),
    "NG-33": ("Escuelas de hostelería", "Escuelas de formación Técnica"),
    "JP-11": ("Escuelas de hostelería", "Escuelas de formación Técnica"),
    "LB-04": ("Residencia de estudiantes", "Residencias universitarias"),
    "LB-05": ("Club juvenil", "Clubes juveniles"),
}
RECUPERAN_CANDIDATO3 = {"ES-294", "PH-064"}
ESTADOS_PL = ("PL-33", "PL-34", "PL-35")

RESOLUCIONES = {
    "ES-218": {
        "ciudad": "Castellbell i el Vilar", "gnid": 8379312, "cp": "08296",
        "direccion": "Carretera BV-1212, s/n, 08296 Castellbell i el Vilar, Barcelona",
    },
    "ES-219": {
        "ciudad": "Sant Cugat del Vallès", "gnid": 3110718, "cp": "08172",
        "direccion": "Parque de Collserola, s/n, 08172 Sant Cugat del Vallès, Barcelona",
    },
}

ESTADO_A_COLUMNA = {
    "Confirmado y contrastado": "contrastado",
    "Confirmado con datos parciales": "parcial",
    "Confirmado": "confirmado",
    "Pendiente": "pendiente",
    "Histórico": "historico",
}


def geo_bloque(ws, row):
    """Foto del bloque geográfico de una fila, para la hoja Cambios."""
    claves = {C_CIUDAD: "Ciudad canónica", C_PROV: "Provincia/Estado",
              C_ISO: "País ISO", C_GNID: "GeoNames ID", C_PREC: "Precisión",
              C_FUENTE: "Fuente geográfica", C_NOTA: "Notas geográficas"}
    return {nombre: ws.cell(row=row, column=col).value for col, nombre in claves.items()}


def main() -> int:
    sha_src = hashlib.sha256(SRC.read_bytes()).hexdigest()
    if sha_src != SRC_SHA_ESPERADO:
        print(f"PARADA: el SHA-256 del v15-4 no coincide ({sha_src})", file=sys.stderr)
        return 1
    if DST.exists():
        print(f"PARADA: ya existe {DST.name}; no se sobrescribe una copia versionada", file=sys.stderr)
        return 1

    shutil.copyfile(SRC, DST)
    wb = load_workbook(DST)
    ws = wb["Directorio"]

    fila_de = {}
    for row in ws.iter_rows(min_row=2):
        rid = row[0].value
        if rid:
            fila_de[rid] = row[0].row
    assert len(fila_de) == 1411, f"IDs únicos: {len(fila_de)}"

    cambios = []  # (hoja, celda, antes, después, motivo) para la hoja Cambios

    # ------------------------------------------------ (a) Categorías
    for rid, (anterior, canonica) in CATEGORIAS.items():
        r = fila_de[rid]
        celda = ws.cell(row=r, column=C_CAT)
        assert celda.value == anterior, f"{rid}: categoría «{celda.value}» != esperada «{anterior}»"
        celda.value = canonica
        motivo = (f"Normalización de categorías a la paleta de 14 de la aplicación "
                  f"(decisión de Jon, {FECHA}): «{anterior}» → «{canonica}». "
                  f"Sin alias en la aplicación: el cambio va en el dato.")
        if rid in RECUPERAN_CANDIDATO3:
            motivo += " Recupera expresamente la clasificación aprobada en el candidato 3."
        cambios.append(("Directorio", f"C{r} (Categoría principal)", anterior, canonica, motivo))

    # ------------------------------------------------ (b) Estados PL
    r_pr06 = fila_de["PR-06"]
    assert ws.cell(row=r_pr06, column=C_ESTADO).value == "Confirmado", "PR-06 no está en «Confirmado»"
    for rid in ESTADOS_PL:
        r = fila_de[rid]
        celda = ws.cell(row=r, column=C_ESTADO)
        assert celda.value == "Confirmado", f"{rid}: estado «{celda.value}» != «Confirmado»"
        celda.value = "Confirmado y contrastado"
        cambios.append(("Directorio", f"Q{r} (Estado de verificación)", "Confirmado",
                        "Confirmado y contrastado",
                        f"Decisión de Jon ({FECHA}): el registro tiene web propia, segunda fuente "
                        f"del titular y doble comprobación documentada; «Confirmado» sería una "
                        f"degradación artificial. PR-06 permanece «Confirmado» conforme a D1."))

    # ------------------------------------------------ (d) ES-218 / ES-219
    for rid, res in RESOLUCIONES.items():
        r = fila_de[rid]
        antes = geo_bloque(ws, r)
        assert antes["Precisión"] == "sin resolver" and antes["GeoNames ID"] is None, f"{rid}: {antes}"
        assert ws.cell(row=r, column=C_ISO).value == "ES"
        nota = (f"Resolución manual (decisión de Jon, {FECHA}): la dirección "
                f"({res['direccion']}) y el código postal {res['cp']} coinciden con el lugar "
                f"poblado oficial de GeoNames (geonameid {res['gnid']}, {res['ciudad']}). "
                f"Se asignan la ciudad canónica y el GeoNames ID; el libro no lleva "
                f"coordenadas: el punto del catálogo sale del extracto GeoNames por ID.")
        ws.cell(row=r, column=C_CIUDAD).value = res["ciudad"]
        ws.cell(row=r, column=C_PROV).value = "Barcelona"
        ws.cell(row=r, column=C_GNID).value = res["gnid"]
        ws.cell(row=r, column=C_PREC).value = "localidad"
        ws.cell(row=r, column=C_FUENTE).value = "GeoNames / revisión manual"
        ws.cell(row=r, column=C_NOTA).value = nota
        despues = geo_bloque(ws, r)
        cambios.append(("Directorio", f"{rid} · resolución geográfica {FECHA} (decisiones de Jon)",
                        json.dumps(antes, ensure_ascii=False), json.dumps(despues, ensure_ascii=False),
                        f"Resolución manual aprobada por Jon ({FECHA}): defecto del dato "
                        f"subsanado en origen — dirección y código postal {res['cp']} "
                        f"coincidentes con el lugar poblado oficial de GeoNames "
                        f"({res['gnid']}). No deben pasar a producción como defectos conocidos."))

    # ------------------------------------------------ (c) Hoja Países
    por_pais: dict[str, Counter] = defaultdict(Counter)
    total_estados = Counter()
    for row in ws.iter_rows(min_row=2):
        if not row[0].value:
            continue
        estado = row[C_ESTADO - 1].value
        assert estado in ESTADO_A_COLUMNA, f"estado no previsto: «{estado}»"
        por_pais[row[C_PAIS - 1].value][ESTADO_A_COLUMNA[estado]] += 1
        total_estados[ESTADO_A_COLUMNA[estado]] += 1
    assert sum(total_estados.values()) == 1411

    wp = wb["Países"]
    cabecera = [wp.cell(row=1, column=c).value for c in range(1, wp.max_column + 1)]
    assert "Confirmado" not in cabecera, "la hoja Países ya tiene columna «Confirmado»"
    wp.insert_cols(11)  # K = «Confirmado», entre «Confirmado con datos parciales» y «Pendiente»
    hdr = wp.cell(row=1, column=11)
    hdr.value = "Confirmado"
    ref = wp.cell(row=1, column=10)
    from copy import copy as _copy
    hdr.font, hdr.fill = _copy(ref.font), _copy(ref.fill)
    hdr.alignment, hdr.border = _copy(ref.alignment), _copy(ref.border)
    if wp.column_dimensions["J"].width:
        wp.column_dimensions["K"].width = wp.column_dimensions["J"].width
    nombres_hoja = set()
    for r in range(2, wp.max_row + 1):
        nombre = wp.cell(row=r, column=1).value
        if not nombre:
            continue
        nombres_hoja.add(nombre)
        c = por_pais.get(nombre, Counter())
        valores = [sum(c.values()), c["contrastado"], c["parcial"], c["confirmado"],
                   c["pendiente"], c["historico"]]
        assert valores[0] == sum(valores[1:]), f"identidad rota en {nombre}: {valores}"
        for j, v in enumerate(valores):
            wp.cell(row=r, column=8 + j).value = v
    sin_fila = set(por_pais) - nombres_hoja
    assert not sin_fila, f"países del Directorio sin fila en Países: {sin_fila}"
    wp.auto_filter.ref = f"A1:N{wp.max_row}"
    cambios.append(("Países", "H2:N71 (recuentos y desglose)",
                    "Recuentos heredados del v14: 12 países desactualizados y sin columna "
                    "«Confirmado» (la identidad no cerraba: Puerto Rico declaraba 6 con "
                    "desglose 0+5+0+0)",
                    "Hoja reconstruida íntegramente desde el Directorio ya corregido: 70 "
                    "filas recalculadas, columna «Confirmado» añadida al desglose y valores "
                    "materializados. Identidad por país: Nº registros = Confirmado y "
                    "contrastado + Confirmado con datos parciales + Confirmado + Pendiente "
                    "+ Histórico; la suma de Nº registros es 1.411. República Dominicana "
                    "permanece con cero registros y su explicación histórica en la propia "
                    "hoja. Ámbito, evidencia, fuente principal, avance y notas no se tocan.",
                    f"Decisión de Jon ({FECHA}): reconstruir la hoja Países desde el "
                    f"Directorio (D6), no corregirla país por país."))

    # ------------------------------------------------ (e) Cambios
    wc = wb["Cambios"]
    for fila in cambios:
        wc.append(list(fila))

    # ------------------------------------------------ (e) LEEME
    wl = wb["LEEME"]
    wl.insert_rows(1)
    wl.cell(row=1, column=1).value = (
        f"v15-5 ({FECHA}), copia versionada del v15-4 con las decisiones cerradas de Jon "
        f"incorporadas (el v15-4 no se toca): (1) Categorías normalizadas a la paleta de "
        f"14 de la aplicación —desaparecen «Otros», «Escuelas de hostelería», «Residencia "
        f"de estudiantes» y «Club juvenil»—: ES-294 → Escuelas de formación Técnica y "
        f"PH-064 → Centros culturales (recuperan expresamente la clasificación aprobada "
        f"en el candidato 3); ES-299 y LB-04 → Residencias universitarias; JP-09 → "
        f"Centros culturales; VE-20 y VE-21 → Centros de promoción social; NG-33 y JP-11 "
        f"→ Escuelas de formación Técnica; LB-05 → Clubes juveniles. Cada cambio consta "
        f"en Cambios como categoría anterior → categoría canónica; sin alias en la "
        f"aplicación. (2) Estados: PL-33, PL-34 y PL-35 pasan a «Confirmado y "
        f"contrastado» (web propia, segunda fuente del titular y doble comprobación "
        f"documentada); PR-06 permanece «Confirmado» conforme a D1. Totales: 1.311 "
        f"«Confirmado con datos parciales» · 52 «Confirmado y contrastado» · 36 "
        f"«Pendiente» · 11 «Histórico» · 1 «Confirmado». (3) Hoja Países reconstruida "
        f"íntegramente desde el Directorio (70 filas recalculadas, columna «Confirmado» "
        f"añadida, valores materializados; total 1.411; República Dominicana permanece "
        f"en cero con su explicación histórica). (4) ES-218 y ES-219 resueltas por "
        f"revisión manual: Castellbell i el Vilar (GeoNames 8379312) y Sant Cugat del "
        f"Vallès (GeoNames 3110718), Precisión «localidad», fuente «GeoNames / revisión "
        f"manual». Resultado geográfico: 1.317 con punto y 94 sin resolver (93,3 % de "
        f"cobertura). El libro no lleva coordenadas: los puntos salen del extracto "
        f"GeoNames por ID al regenerar el catálogo (migración en seco de la Fase 8B, "
        f"sin importar ni desplegar)."
    )
    wl.auto_filter.ref = f"A1:B{wl.max_row}"

    # ------------------------------------------------ (e) Geografía v15
    wg = wb["Geografía v15"]
    conteos = {
        13: sum(1 for row in ws.iter_rows(min_row=2) if row[0].value and row[25].value),
        14: sum(1 for row in ws.iter_rows(min_row=2) if row[0].value and row[28].value),
        15: sum(1 for row in ws.iter_rows(min_row=2) if row[0].value and row[31].value),
        16: sum(1 for row in ws.iter_rows(min_row=2) if row[0].value and row[26].value),
        17: sum(1 for row in ws.iter_rows(min_row=2) if row[0].value and row[30].value == "GeoNames"),
        18: sum(1 for row in ws.iter_rows(min_row=2) if row[0].value and row[30].value == "GeoNames / revisión manual"),
        19: sum(1 for row in ws.iter_rows(min_row=2) if row[0].value and row[30].value == "revisión manual (pendiente)"),
        20: sum(1 for row in ws.iter_rows(min_row=2) if row[0].value and row[29].value == "localidad"),
        21: sum(1 for row in ws.iter_rows(min_row=2) if row[0].value and row[29].value == "sin resolver"),
    }
    esperados_viejo = {13: 265, 14: 1315, 15: 180, 16: 1392, 17: 1237, 18: 78, 19: 96, 20: 1315, 21: 96}
    for fila, viejo in esperados_viejo.items():
        actual = wg.cell(row=fila, column=2).value
        assert actual == viejo, f"Geografía v15 fila {fila}: {actual} != {viejo} (¿hoja distinta?)"
    for fila, nuevo in conteos.items():
        wg.cell(row=fila, column=2).value = nuevo
    wg.cell(row=29, column=1).value = f"Corrección v15-5 ({FECHA})"
    wg.cell(row=29, column=2).value = (
        "Decisiones cerradas de Jon aplicadas en la copia v15-5: ES-218 (Castellbell i "
        "el Vilar, GeoNames 8379312) y ES-219 (Sant Cugat del Vallès, GeoNames 3110718) "
        "resueltas por revisión manual —dirección y códigos postales 08296/08172 "
        "coincidentes con el lugar poblado oficial—. Con punto: 1.317; sin resolver: "
        "94. Reclasificación de motivos de los pendientes: «Sin localidad o sin nota "
        "explicativa» pasa de 5 a 3; los demás grupos no cambian (Conflicto de "
        "jerarquía administrativa 28 · Varios candidatos GeoNames 23 · Sin coincidencia "
        "GeoNames 16 · Localidad múltiple o contradictoria 14 · Conflicto de país 3 · "
        "Dirección contradictoria 2 · Otros casos manuales 5)."
    )

    wb.save(DST)
    sha = hashlib.sha256(DST.read_bytes()).hexdigest()
    print(f"v15-5 creado: {DST.name}")
    print(f"SHA-256 v15-5: {sha}")
    print(f"SHA-256 v15-4 (intacto): {hashlib.sha256(SRC.read_bytes()).hexdigest()}")
    print(f"Estados resultantes: {dict(total_estados)} (total {sum(total_estados.values())})")
    print(f"Recuentos geográficos: {conteos}")
    print(f"Filas añadidas a Cambios: {len(cambios)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
