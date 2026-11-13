#!/usr/bin/env python3
"""
Crea la copia versionada v15-6 del Directorio (Fase 8C, 2026-11-13).

Copia `Directorio_Opus_Dei_MUNDIAL_v15.xlsx` (el libro NUEVO entregado
por Jon, archivado byte a byte con SHA-256
d541e1396f7aaea09f6dfdf12738f5135e96eaf0bcb592318fcd35f70d6771ca)
a `Directorio_Opus_Dei_MUNDIAL_v15-6.xlsx` SIN tocar el original, e
incorpora EXACTAMENTE las normalizaciones necesarias para respetar
las decisiones ya certificadas (las mismas de la Fase 8B):

  (a) Categorías normalizadas a la paleta de 14 de la aplicación: el
      libro entregado reintroduce «Otros» (×6), «Escuelas de
      hostelería» (×2), «Residencia de estudiantes» (×1) y «Club
      juvenil» (×1): 10 registros, cada cambio anotado en la hoja
      Cambios como categoría anterior → canónica. Sin alias en la
      aplicación: el cambio va en el dato.
  (b) Estados: PL-33, PL-34 y PL-35 vuelven a venir como «Confirmado»
      y pasan a «Confirmado y contrastado»; PR-06 permanece
      «Confirmado» (D1, único).
  (c) Hoja Países: se añade la columna «Confirmado» al desglose (el
      libro entregado no la trae: Polonia declara 35 con desglose 32
      y Puerto Rico 6 con desglose 5) y se recalculan los conteos
      desde el Directorio ya corregido, con valores materializados e
      identidad por país Nº = contrastado + parciales + Confirmado +
      Pendiente + Histórico; total 1.409. El resto de columnas
      (ámbito, evidencia, notas) no se toca.
  (d) LEEME (entrada nueva al principio) y Cambios (filas nuevas)
      actualizados. Este libro no trae hoja «Geografía v15»: los
      recuentos geográficos (1.387 «localidad» / 22 «sin resolver»)
      quedan escritos en la entrada de LEEME.

El script localiza las columnas POR NOMBRE de cabecera, verifica
antes de escribir cada valor esperado y PARA con error si el libro
no está en el estado previsto. Al final imprime el SHA-256 de la
copia importable.

Uso: .venv/bin/python tools/data/build_v15_6_book.py
"""
from __future__ import annotations

import hashlib
import sys
from collections import Counter, defaultdict
from copy import copy as _copy
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v15.xlsx"
DST = ROOT / "data" / "source" / "Directorio_Opus_Dei_MUNDIAL_v15-6.xlsx"
SRC_SHA_ESPERADO = "d541e1396f7aaea09f6dfdf12738f5135e96eaf0bcb592318fcd35f70d6771ca"
FECHA = "2026-11-13"

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

ESTADO_A_CLAVE = {
    "Confirmado y contrastado": "contrastado",
    "Confirmado con datos parciales": "parcial",
    "Confirmado": "confirmado",
    "Pendiente": "pendiente",
    "Histórico": "historico",
}
CLAVE_A_COLUMNA = {
    "contrastado": "Confirmado y contrastado",
    "parcial": "Confirmado con datos parciales",
    "confirmado": "Confirmado",
    "pendiente": "Pendiente",
    "historico": "Histórico",
}


def columnas(ws) -> dict[str, int]:
    """Mapa nombre de cabecera → columna (1-based) de la fila 1."""
    return {c.value: c.column for c in ws[1] if c.value}


def main() -> int:
    sha_src = hashlib.sha256(SRC.read_bytes()).hexdigest()
    if sha_src != SRC_SHA_ESPERADO:
        print(f"PARADA: el SHA-256 del libro entregado no coincide ({sha_src})", file=sys.stderr)
        return 1
    if DST.exists():
        print(f"PARADA: ya existe {DST.name}; no se sobrescribe una copia versionada", file=sys.stderr)
        return 1

    import shutil
    shutil.copyfile(SRC, DST)
    wb = load_workbook(DST)
    ws = wb["Directorio"]
    col = columnas(ws)
    C_ID, C_CAT, C_ESTADO, C_PAIS = col["ID único"], col["Categoría principal"], col["Estado de verificación"], col["País"]
    C_PREC, C_GNID = col["Precisión"], col["GeoNames ID"]

    fila_de = {}
    for row in ws.iter_rows(min_row=2):
        rid = row[C_ID - 1].value
        if rid:
            fila_de[rid] = row[C_ID - 1].row
    assert len(fila_de) == 1409, f"IDs únicos: {len(fila_de)}"

    cambios = []  # filas para la hoja Cambios

    # ------------------------------------------------ (a) Categorías
    for rid, (anterior, canonica) in CATEGORIAS.items():
        r = fila_de[rid]
        celda = ws.cell(row=r, column=C_CAT)
        assert celda.value == anterior, f"{rid}: categoría «{celda.value}» != esperada «{anterior}»"
        celda.value = canonica
        motivo = (f"Normalización de categorías a la paleta de 14 certificada "
                  f"(decisión de Jon, Fase 8B; reaplicada en la Fase 8C, {FECHA}): "
                  f"«{anterior}» → «{canonica}». Sin alias en la aplicación: "
                  f"el cambio va en el dato.")
        if rid in RECUPERAN_CANDIDATO3:
            motivo += " Recupera expresamente la clasificación aprobada en el candidato 3."
        cambios.append(("Directorio", f"{rid} (Categoría principal)", anterior, canonica, motivo))

    # ------------------------------------------------ (b) Estados PL
    r_pr06 = fila_de["PR-06"]
    assert ws.cell(row=r_pr06, column=C_ESTADO).value == "Confirmado", "PR-06 no está en «Confirmado»"
    for rid in ESTADOS_PL:
        r = fila_de[rid]
        celda = ws.cell(row=r, column=C_ESTADO)
        assert celda.value == "Confirmado", f"{rid}: estado «{celda.value}» != «Confirmado»"
        celda.value = "Confirmado y contrastado"
        cambios.append(("Directorio", f"{rid} (Estado de verificación)", "Confirmado",
                        "Confirmado y contrastado",
                        f"Decisión certificada de Jon (Fase 8B, reaplicada en la 8C, "
                        f"{FECHA}): el registro tiene web propia, segunda fuente del "
                        f"titular y doble comprobación documentada; «Confirmado» "
                        f"sería una degradación artificial. PR-06 permanece "
                        f"«Confirmado» conforme a D1."))

    # --------------------------------------- verificación del conjunto
    por_pais: dict[str, Counter] = defaultdict(Counter)
    total_estados: Counter = Counter()
    cats: Counter = Counter()
    prec: Counter = Counter()
    for row in ws.iter_rows(min_row=2):
        if not row[C_ID - 1].value:
            continue
        estado = row[C_ESTADO - 1].value
        assert estado in ESTADO_A_CLAVE, f"estado no previsto: «{estado}»"
        por_pais[row[C_PAIS - 1].value][ESTADO_A_CLAVE[estado]] += 1
        total_estados[ESTADO_A_CLAVE[estado]] += 1
        cats[row[C_CAT - 1].value] += 1
        p = row[C_PREC - 1].value
        prec[p] += 1
        if p == "localidad":
            assert row[C_GNID - 1].value is not None, "«localidad» sin GeoNames ID"
        else:
            assert row[C_GNID - 1].value is None, "«sin resolver» con GeoNames ID"
    assert sum(total_estados.values()) == 1409
    assert dict(total_estados) == {"parcial": 1309, "contrastado": 52, "pendiente": 36,
                                   "historico": 11, "confirmado": 1}, dict(total_estados)
    assert dict(prec) == {"localidad": 1387, "sin resolver": 22}, dict(prec)
    CANONICAS = {"Asociaciones juveniles", "Casa de retiros", "Centros Médicos",
                 "Centros culturales", "Centros de mujeres", "Centros de promoción social",
                 "Centros de varones", "Clubes juveniles", "Colegios",
                 "Escuelas de formación Técnica", "Iglesias", "Oficinas de Información",
                 "Residencias universitarias", "Universidades"}
    assert set(cats) == CANONICAS, f"categorías fuera de la paleta: {set(cats) - CANONICAS}"

    # ------------------------------------------------ (c) Hoja Países
    wp = wb["Países"]
    pcol = columnas(wp)
    assert "Confirmado" not in pcol, "la hoja Países ya tiene columna «Confirmado»"
    pos_parcial = pcol["Confirmado con datos parciales"]
    wp.insert_cols(pos_parcial + 1)
    hdr = wp.cell(row=1, column=pos_parcial + 1)
    hdr.value = "Confirmado"
    ref = wp.cell(row=1, column=pos_parcial)
    hdr.font, hdr.fill = _copy(ref.font), _copy(ref.fill)
    hdr.alignment, hdr.border = _copy(ref.alignment), _copy(ref.border)
    letra = wp.cell(row=1, column=pos_parcial).column_letter
    if wp.column_dimensions[letra].width:
        wp.column_dimensions[hdr.column_letter].width = wp.column_dimensions[letra].width
    pcol = columnas(wp)  # recalcular tras insertar
    nombres_hoja = set()
    for r in range(2, wp.max_row + 1):
        nombre = wp.cell(row=r, column=pcol["País"]).value
        if not nombre:
            continue
        nombres_hoja.add(nombre)
        c = por_pais.get(nombre, Counter())
        valores = {"Nº registros": sum(c.values())}
        for clave, columna_nombre in CLAVE_A_COLUMNA.items():
            valores[columna_nombre] = c[clave]
        assert valores["Nº registros"] == sum(v for k, v in valores.items() if k != "Nº registros"), \
            f"identidad rota en {nombre}: {valores}"
        for columna_nombre, v in valores.items():
            wp.cell(row=r, column=pcol[columna_nombre]).value = v
    sin_fila = set(por_pais) - nombres_hoja
    assert not sin_fila, f"países del Directorio sin fila en Países: {sin_fila}"
    cambios.append(("Países", "Recuentos y desglose (70 filas)",
                    "El libro entregado suma bien los totales (1.409 y país por país), "
                    "pero su desglose no tiene columna «Confirmado»: Polonia declara 35 "
                    "con desglose 32 y Puerto Rico 6 con desglose 5 (los «Confirmado» "
                    "de PL-33/34/35 y PR-06 no se contaban).",
                    "Columna «Confirmado» añadida al desglose y conteos recalculados "
                    "desde el Directorio ya corregido (valores materializados). "
                    "Identidad por país: Nº registros = Confirmado y contrastado + "
                    "Confirmado con datos parciales + Confirmado + Pendiente + "
                    "Histórico; la suma de Nº registros es 1.409. República "
                    "Dominicana permanece con cero registros y su explicación en la "
                    "propia hoja. Ámbito, evidencia, fuente principal, avance y notas "
                    "no se tocan.",
                    f"Misma solución certificada en la Fase 8B para la copia v15-5: la "
                    f"hoja Países debe cuadrar con el Directorio corregido (D6)."))

    # ------------------------------------------------ (d) Cambios
    wc = wb["Cambios"]
    for fila in cambios:
        wc.append(list(fila))

    # ------------------------------------------------ (d) LEEME
    wl = wb["LEEME"]
    wl.insert_rows(1)
    wl.cell(row=1, column=1).value = (
        f"v15-6 ({FECHA}), copia versionada y normalizada del libro v15 entregado por "
        f"Jon (archivado como Directorio_Opus_Dei_MUNDIAL_v15.xlsx, SHA-256 "
        f"{SRC_SHA_ESPERADO}; el original no se toca). Incorpora solo las "
        f"normalizaciones exigidas por las decisiones ya certificadas: (1) Categorías "
        f"reducidas a la paleta de 14 —el libro reintroducía «Otros» (×6), «Escuelas "
        f"de hostelería» (×2), «Residencia de estudiantes» y «Club juvenil»—: ES-294 "
        f"→ Escuelas de formación Técnica y PH-064 → Centros culturales (recuperan "
        f"la clasificación del candidato 3); ES-299 y LB-04 → Residencias "
        f"universitarias; JP-09 → Centros culturales; VE-20 y VE-21 → Centros de "
        f"promoción social; NG-33 y JP-11 → Escuelas de formación Técnica; LB-05 → "
        f"Clubes juveniles. Cada cambio consta en Cambios como categoría anterior → "
        f"canónica; sin alias en la aplicación. (2) Estados: PL-33, PL-34 y PL-35 "
        f"pasan a «Confirmado y contrastado»; PR-06 permanece «Confirmado» (D1, "
        f"único). Totales: 1.309 «Confirmado con datos parciales» · 52 «Confirmado y "
        f"contrastado» · 36 «Pendiente» · 11 «Histórico» · 1 «Confirmado» = 1.409. "
        f"(3) Hoja Países: columna «Confirmado» añadida al desglose y conteos "
        f"recalculados desde el Directorio corregido (identidad por país; total "
        f"1.409; República Dominicana en cero con su explicación). Geografía sin "
        f"cambios: 1.387 con Precisión «localidad» y GeoNames ID, 22 «sin resolver». "
        f"Pérdidas de punto intencionadas y documentadas en sus notas: ES-218 (no se "
        f"fuerza el núcleo urbano de Castellbell i el Vilar para la finca Viladoms) "
        f"y ES-240 (retirado el GeoNames de Valencia, incorrecto; ambigüedad "
        f"Canals/Serratella/Aiacor). Altas frente al v15-5: CO-37, ES-301, ES-302. "
        f"Bajas: CO-32, ES-153, ES-219, ES-230, MX-47 (manifiesto de poda v15-6). "
        f"El libro no lleva coordenadas: los puntos salen del extracto GeoNames por "
        f"ID al regenerar el catálogo (migración en seco de la Fase 8C, sin "
        f"importar ni desplegar)."
    )

    wb.save(DST)
    sha = hashlib.sha256(DST.read_bytes()).hexdigest()
    print(f"v15-6 creado: {DST.name}")
    print(f"SHA-256 v15-6: {sha}")
    print(f"SHA-256 original v15 (intacto): {hashlib.sha256(SRC.read_bytes()).hexdigest()}")
    print(f"Estados resultantes: {dict(total_estados)} (total {sum(total_estados.values())})")
    print(f"Precisión: {dict(prec)}")
    print(f"Categorías (14): {dict(cats)}")
    print(f"Filas añadidas a Cambios: {len(cambios)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
