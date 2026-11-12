#!/usr/bin/env python3
"""Iconos de la PWA: globo dorado sobre azul noche, en la línea del
favicon original. Genera los PNG del manifiesto y del sistema en
apps/web/public/icons/. Uso: python3 tools/build_icons.py
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "apps", "web", "public", "icons")
NAVY = (10, 17, 32, 255)
FILL = (27, 44, 77, 255)
GOLD = (245, 197, 66, 255)
BLUE = (126, 166, 221, 255)


def draw_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, size, size], fill=NAVY)
    else:
        r = int(size * 0.18)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=NAVY)
    c = size / 2
    rad = size * (0.29 if maskable else 0.31)
    w_gold = max(3, int(size * 0.028))
    w_blue = max(2, int(size * 0.014))
    box = [c - rad, c - rad, c + rad, c + rad]
    d.ellipse(box, fill=FILL)
    # Paralelos
    for f in (0.38, 0.72):
        ry = rad * f
        d.ellipse([c - rad, c - ry, c + rad, c + ry], outline=BLUE, width=w_blue)
    d.line([c - rad, c, c + rad, c], fill=BLUE, width=w_blue)
    # Meridianos
    for f in (0.38, 0.72):
        rx = rad * f
        d.ellipse([c - rx, c - rad, c + rx, c + rad], outline=BLUE, width=w_blue)
    d.line([c, c - rad, c, c + rad], fill=BLUE, width=w_blue)
    # Aro dorado y punto central
    d.ellipse(box, outline=GOLD, width=w_gold)
    pr = size * 0.032
    d.ellipse([c - pr, c - pr, c + pr, c + pr], fill=GOLD)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    draw_icon(192).save(os.path.join(OUT, "icon-192.png"))
    draw_icon(512).save(os.path.join(OUT, "icon-512.png"))
    draw_icon(512, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
    draw_icon(180).save(os.path.join(OUT, "apple-touch-icon.png"))
    print("iconos en", OUT)


if __name__ == "__main__":
    main()
