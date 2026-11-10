"""Hands of Fate — tools/art/make_itch_extras.py

Extra images for the itch.io page (run from the project root):

    python tools/art/make_itch_extras.py        -> build/itch/extras/

  header_*.png     600x72    section headers for the description (plaque style)
  suits.png        600x150   what each suit does (the deck's own pips)
  hands.png        600x444   every hand and the shape it hits on a health grid
  bg_tile.png      160x160   page background tile (faint suits, drawn here, not from the deck)

Like make_itch_art.py: composed at half size, doubled with nearest-neighbour;
the deck's pips are used unchanged.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
RES = os.path.join(ROOT, 'assets', 'resources')
FONTS = os.path.join(ROOT, 'assets', 'fonts')
OUT = os.path.join(ROOT, 'build', 'itch', 'extras')

BG = (26, 21, 36)
PANEL = (43, 36, 56)
SHADOW = (14, 11, 20)
INK = (59, 50, 74)
CREAM = (236, 236, 224)
LILAC = (154, 144, 176)
GOLD = (233, 196, 106)
CELL = (210, 69, 60)
CELL_RIM = (242, 176, 168)
LOST = (18, 14, 26)
LOST_RIM = (61, 52, 80)
SUIT_HEX = {'S': (142, 71, 140), 'H': (201, 48, 56), 'C': (48, 156, 99), 'D': (57, 120, 168)}


def icon(suit):
    return Image.open(os.path.join(RES, 'ui', 'icons', f'suit_{suit}.png')).convert('RGBA')


def text_img(fontfile, size, text, color):
    f = ImageFont.truetype(os.path.join(FONTS, fontfile), size)
    l, t, r, b = f.getbbox(text)
    im = Image.new('RGBA', (r - l + 4, b - t + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    d.text((2 - l, 2 - t), text, font=f, fill=color)
    return im.crop(im.getbbox())


def heading(text, color=INK):
    return text_img('PixelifySans-SemiBold.ttf', 22, text, color)


def body(text, color=CREAM):
    """VT323 at 20 px, for the full-size image."""
    return text_img('VT323-Regular.ttf', 20, text, color)


def double(im):
    return im.resize((im.width * 2, im.height * 2), Image.NEAREST)


def plaque(c, x, y, w, h, fill=CREAM):
    d = ImageDraw.Draw(c)
    d.rectangle((x + 3, y + 3, x + w + 2, y + h + 2), fill=SHADOW)
    d.rectangle((x, y, x + w - 1, y + h - 1), fill=INK)
    d.rectangle((x + 2, y + 2, x + w - 3, y + h - 3), fill=fill)
    d.rectangle((x + 4, y + 4, x + w - 5, y + h - 5), outline=INK)
    for cx, cy in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)):
        d.point((cx, cy), fill=BG)


# ---- Section headers ----------------------------------------------------------------

def header(text, suits):
    c = Image.new('RGBA', (300, 36), BG + (255,))
    plaque(c, 1, 1, 296, 32)
    t = heading(text)
    left, right = icon(suits[0]), icon(suits[1])
    gap = 6
    w = left.width + gap + t.width + gap + right.width
    x = 150 - w // 2
    y = 1 + (32 - t.height) // 2
    c.alpha_composite(left, (x, 1 + (32 - left.height) // 2))
    c.alpha_composite(t, (x + left.width + gap, y))
    c.alpha_composite(right, (x + left.width + gap + t.width + gap, 1 + (32 - right.height) // 2))
    return double(c)


# ---- What each suit does --------------------------------------------------------------

SUITS = [
    ('S', 'ATTACK', 'breaks cells'),
    ('H', 'HEAL', 'restores cells'),
    ('C', 'ROT', "can't be healed"),
    ('D', 'SHIELD', 'blocks a hit'),
]


def suits_image():
    c = Image.new('RGBA', (300, 75), BG + (255,))
    d = ImageDraw.Draw(c)
    d.rectangle((0, 0, 299, 74), fill=PANEL)
    for i, (s, _, _) in enumerate(SUITS):
        p = icon(s)
        c.alpha_composite(p, (i * 75 + 37 - p.width // 2, 8))
    final = double(c)
    for i, (s, word, line) in enumerate(SUITS):
        cx = i * 150 + 75
        w = heading(word, SUIT_HEX[s])
        final.alpha_composite(w, (cx - w.width // 2, 64))
        b = body(line, LILAC)
        final.alpha_composite(b, (cx - b.width // 2, 104))
    return final


# ---- Hands and the shapes they hit ---------------------------------------------------

GRID_COLS, GRID_ROWS = 6, 4
HANDS = [  # name, cooldown, hit cells on a 6x4 grid (col, row)
    ('High card', 5.0, [(2, 1)]),
    ('Pair', 4.0, [(1, 1), (4, 2)]),
    ('Two pair', 3.5, [(0, 0), (1, 0), (4, 2), (4, 3)]),
    ('Three of a kind', 3.5, [(1, 1), (2, 1), (3, 1)]),
    ('Straight', 3.0, [(c, 1) for c in range(6)]),
    ('Flush (x2)', 3.0, [(2, 1), (3, 1), (2, 2), (3, 2)]),
    ('Full house', 2.5, [(1, 1), (2, 1), (3, 1), (1, 2), (2, 2), (3, 2)]),
    ('Four of a kind', 2.5, [(2, 0), (1, 1), (2, 1), (3, 1), (2, 2)]),
    ('Straight flush', 2.0, [(c, 1) for c in range(6)] + [(2, r) for r in range(4) if r != 1]),
]


def hands_image():
    tile_w, tile_h = 100, 74
    c = Image.new('RGBA', (300, 222), BG + (255,))
    d = ImageDraw.Draw(c)
    cell, gap = 9, 2
    gw = GRID_COLS * cell + (GRID_COLS - 1) * gap
    for i, (_, _, hits) in enumerate(HANDS):
        tx, ty = (i % 3) * tile_w, (i // 3) * tile_h
        d.rectangle((tx + 2, ty + 2, tx + tile_w - 3, ty + tile_h - 3), fill=PANEL)
        gx = tx + (tile_w - gw) // 2
        gy = ty + 8
        hit = set(hits)
        for r in range(GRID_ROWS):
            for col in range(GRID_COLS):
                x0, y0 = gx + col * (cell + gap), gy + r * (cell + gap)
                if (col, r) in hit:
                    d.rectangle((x0, y0, x0 + cell - 1, y0 + cell - 1), fill=GOLD)
                    d.rectangle((x0 + 2, y0 + 2, x0 + cell - 3, y0 + cell - 3), fill=LOST)
                else:
                    d.rectangle((x0, y0, x0 + cell - 1, y0 + cell - 1), fill=CELL_RIM)
                    d.rectangle((x0 + 1, y0 + 1, x0 + cell - 2, y0 + cell - 2), fill=CELL)
    final = double(c)
    for i, (name, cd, _) in enumerate(HANDS):
        cx = (i % 3) * 200 + 100
        ty = (i // 3) * 148
        n = body(name, CREAM)
        final.alpha_composite(n, (cx - n.width // 2, ty + 106))
        t = body(f'every {cd:.1f}s', LILAC)
        final.alpha_composite(t, (cx - t.width // 2, ty + 124))
    return final


# ---- Background tile (own drawing: tiny suits, very faint) ---------------------------

MINI = {
    'S': ['...#...', '..###..', '.#####.', '#######', '#######', '.#.#.#.', '...#...'],
    'H': ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    'C': ['..###..', '..###..', '##.#.##', '#######', '##.#.##', '...#...', '..###..'],
    'D': ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
}


def bg_tile():
    c = Image.new('RGB', (80, 80), BG)
    d = ImageDraw.Draw(c)
    faint = (33, 27, 45)
    spots = [('S', 6, 6), ('H', 46, 6), ('C', 26, 46), ('D', 66, 46)]
    for s, x, y in spots:
        for r, row in enumerate(MINI[s]):
            for k, ch in enumerate(row):
                if ch == '#':
                    d.point((x + k, y + r), fill=faint)
    return c.resize((160, 160), Image.NEAREST)


def main():
    os.makedirs(OUT, exist_ok=True)
    headers = {
        'how_it_plays': ('HOW IT PLAYS', 'SH'),
        'the_suits': ('THE SUITS', 'CD'),
        'the_hands': ('THE HANDS', 'HS'),
        'features': ('FEATURES', 'DC'),
        'controls': ('CONTROLS', 'SC'),
        'credits': ('CREDITS', 'HD'),
    }
    for key, (text, suits) in headers.items():
        header(text, suits).convert('RGB').save(os.path.join(OUT, f'header_{key}.png'))
    suits_image().convert('RGB').save(os.path.join(OUT, 'suits.png'))
    hands_image().convert('RGB').save(os.path.join(OUT, 'hands.png'))
    bg_tile().save(os.path.join(OUT, 'bg_tile.png'))
    for n in sorted(os.listdir(OUT)):
        p = os.path.join(OUT, n)
        print(f'{n:26s} {Image.open(p).size}  {os.path.getsize(p) // 1024} KB')


if __name__ == '__main__':
    main()
