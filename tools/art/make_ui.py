"""Hands of Fate — tools/art/make_ui.py

Draws the UI kit to match the mockups (all sizes are the mockup's x1.5, for the
1080x1920 layout). Every image is drawn pixel by pixel, flat colours only, so
it stays crisp with Nearest filtering.

Run from the project root:   python3 tools/art/make_ui.py
Writes:
  assets/art/ui/*.png              panels and buttons (9-slice)
  assets/resources/ui/icons/*.png  suit icons (cut from your card art, unchanged)
  tools/art/slices.json            9-slice borders, read by tools/set-nearest.mjs
"""

import json
import os
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UI = os.path.join(ROOT, 'assets', 'art', 'ui')
ICONS = os.path.join(ROOT, 'assets', 'resources', 'ui', 'icons')
CARDS = os.path.join(ROOT, 'assets', 'resources', 'cards', 'updated')


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


# Sampled from the mockups.
INK = hexc('2b2438')          # borders, dark text
SHADOW = hexc('120e1a')       # drop shadows under buttons
DEEP = hexc('0e0b13')         # drop shadow under big panels
CREAM = hexc('efeee4')        # panel and button face
RED = hexc('d2453c')          # main action button
BLUE = hexc('3978a8')         # secondary action (♦ blue)
DARK_FACE = hexc('3d3450')    # Quit / back buttons
DARK_FILL = hexc('2b2438')    # dark panel fill
DARK_LINE = hexc('4e4856')    # dark panel inner line
CLEAR = (0, 0, 0, 0)

BORDER = 5        # ink border (mockup 3 px x1.5, rounded up)
CORNER = 3        # corner cut, gives the slightly rounded look
BTN_SHADOW = 7    # drop shadow under buttons (mockup 5 px x1.5)

slices = {}
os.makedirs(UI, exist_ok=True)
os.makedirs(ICONS, exist_ok=True)


def darker(c, f=0.86):
    return (int(c[0] * f), int(c[1] * f), int(c[2] * f), c[3])


def rounded_rect(img, x0, y0, x1, y1, colour, corner=CORNER):
    """Fills a rectangle (inclusive) with its corners cut in a small stair."""
    px = img.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            dx = min(x - x0, x1 - x)
            dy = min(y - y0, y1 - y)
            if dx + dy < corner - 1 and dx < corner and dy < corner:
                continue
            px[x, y] = colour


def frame(img, x0, y0, x1, y1, colour, width):
    """Draws a rectangle outline `width` px thick (inclusive coords)."""
    px = img.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if x < x0 + width or x > x1 - width or y < y0 + width or y > y1 - width:
                px[x, y] = colour


def save(img, name, border):
    """border = [left, top, right, bottom] for 9-slice."""
    img.save(os.path.join(UI, name + '.png'))
    slices[name] = border


# ---- Buttons ------------------------------------------------------------------
# Normal: face on top, shadow below. Pressed: face drops by the shadow height,
# no shadow. Same size, so the Button can swap them without moving anything.

def button(name, face, border=INK, w=48, h=48):
    inner = BORDER + 4
    # normal
    img = Image.new('RGBA', (w, h), CLEAR)
    rounded_rect(img, 0, BTN_SHADOW, w - 1, h - 1, SHADOW)          # shadow peeks out below
    rounded_rect(img, 0, 0, w - 1, h - 1 - BTN_SHADOW, border)       # ink border
    rounded_rect(img, BORDER, BORDER, w - 1 - BORDER, h - 1 - BTN_SHADOW - BORDER, face, corner=1)
    save(img, f'btn_{name}', [inner, inner, inner, inner + BTN_SHADOW])
    # pressed: shifted down, a touch darker
    img = Image.new('RGBA', (w, h), CLEAR)
    rounded_rect(img, 0, BTN_SHADOW, w - 1, h - 1, border)
    rounded_rect(img, BORDER, BTN_SHADOW + BORDER, w - 1 - BORDER, h - 1 - BORDER, darker(face), corner=1)
    save(img, f'btn_{name}_pressed', [inner, inner + BTN_SHADOW, inner, inner])


button('red', RED)
button('cream', CREAM)
button('blue', BLUE)
button('dark', DARK_FACE)
# Disabled (e.g. Continue with no save): greyed face, softer border.
button('disabled', hexc('c9c6bd'), border=hexc('6b6577'))


# ---- Panels ---------------------------------------------------------------------

def panel_cream(name='panel_cream', w=64, h=64, shadow=10, gap=7, line=3):
    """Cream card stock with the ink double border (logo plaque, score panels)."""
    img = Image.new('RGBA', (w, h), CLEAR)
    rounded_rect(img, 0, shadow, w - 1, h - 1, DEEP)
    rounded_rect(img, 0, 0, w - 1, h - 1 - shadow, INK)
    rounded_rect(img, BORDER, BORDER, w - 1 - BORDER, h - 1 - shadow - BORDER, CREAM, corner=1)
    i = BORDER + gap
    frame(img, i, i, w - 1 - i, h - 1 - shadow - i, INK, line)
    b = i + line + 4
    save(img, name, [b, b, b, b + shadow])


def panel_cream_single(name='panel_cream_single', w=48, h=48, shadow=7):
    """Cream panel with one ink border (hand labels, small cards of info)."""
    img = Image.new('RGBA', (w, h), CLEAR)
    rounded_rect(img, 0, shadow, w - 1, h - 1, SHADOW)
    rounded_rect(img, 0, 0, w - 1, h - 1 - shadow, INK)
    rounded_rect(img, BORDER, BORDER, w - 1 - BORDER, h - 1 - shadow - BORDER, CREAM, corner=1)
    b = BORDER + 4
    save(img, name, [b, b, b, b + shadow])


def panel_dark(name='panel_dark', w=64, h=64, shadow=6, gap=6, line=3):
    """Dark panel with a lighter inner line (Best run, opponent strip)."""
    img = Image.new('RGBA', (w, h), CLEAR)
    rounded_rect(img, 0, shadow, w - 1, h - 1, SHADOW)
    rounded_rect(img, 0, 0, w - 1, h - 1 - shadow, SHADOW)
    rounded_rect(img, BORDER, BORDER, w - 1 - BORDER, h - 1 - shadow - BORDER, DARK_FILL, corner=1)
    i = BORDER + gap
    frame(img, i, i, w - 1 - i, h - 1 - shadow - i, DARK_LINE, line)
    b = i + line + 4
    save(img, name, [b, b, b, b + shadow])


panel_cream()
panel_cream_single()
panel_dark()


# ---- Suit icons --------------------------------------------------------------------
# The centre pip of each 2-card, cut out of your Pixel Plebes art at 1x (90x126)
# with the cream card stock made transparent. The pip itself is not changed.

CARD_CREAM = (236, 236, 224)
INK_CARD = (59, 50, 74)


def cut_pip(suit):
    card = Image.open(os.path.join(CARDS, f'{suit}_2.png')).convert('RGBA')
    small = card.resize((card.width // 4, card.height // 4), Image.NEAREST)
    px = small.load()
    pts = [(x, y) for x in range(28, 62) for y in range(14, 60)
           if px[x, y][3] > 0 and px[x, y][:3] not in (CARD_CREAM, INK_CARD)]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    pip = small.crop((x0, y0, x1 + 1, y1 + 1))
    pp = pip.load()
    for y in range(pip.height):
        for x in range(pip.width):
            if pp[x, y][:3] == CARD_CREAM:
                pp[x, y] = CLEAR
    # Centre on a 18x18 canvas so all four icons share one size.
    out = Image.new('RGBA', (18, 18), CLEAR)
    out.alpha_composite(pip, ((18 - pip.width) // 2, (18 - pip.height) // 2))
    return out


if __name__ == '__main__':
    if not os.path.isdir(CARDS):
        sys.exit('Card art not found at assets/resources/cards/updated. Run from the project root.')
    for s in 'SHCD':
        cut_pip(s).save(os.path.join(ICONS, f'suit_{s}.png'))
    with open(os.path.join(os.path.dirname(__file__), 'slices.json'), 'w') as f:
        json.dump(slices, f, indent=2)
    print(f'Wrote {len(slices)} UI images to assets/art/ui and 4 suit icons to assets/resources/ui/icons')
