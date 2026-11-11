"""Hands of Fate — tools/art/make_style_sample.py (plan phase 4)

The style sample sheet: the first pieces of the Joker's table drawn to the deck's
own rules, for sign-off before anything else is drawn. Run from the project root:

    python tools/art/make_style_sample.py      -> build/style/style_sample.png (1920x1080, game size)
                                                  build/style/style_sample_zoom.png (pieces at 4x)

Rules (style guide): only the deck's sampled colours plus the two room darks; no
semi-transparent pixels; 1 px ink outlines (2 px on big shapes); 2-pixel corner
steps; flat shading with one highlight and one shadow step; light from the top
left; drawn at the card's art pixel (1x = 90x126 card) and shown at exactly 2x.
Every piece is a pixel map built row by row; wear (cracks, fray, chalk smudges) is
placed by hand at fixed coordinates, not scattered at random.

Signed off 2026-11-11 with two changes: shielded chips are blue chips (not a ring),
and the cracked chip shows an obvious crack and a broken rim. Rot is green with
mould spots, so it doesn't look like a crack.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
RES = os.path.join(ROOT, 'assets', 'resources')
FONTS = os.path.join(ROOT, 'assets', 'fonts')
OUT = os.path.join(ROOT, 'build', 'style')


def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


# ---- The palette: deck colours (sampled from the cards) + room darks -------------------------
INK = hx('#3b324a')       # the deck's outline
CREAM = hx('#ecece0')     # card face
CREAM2 = hx('#cfc6b8')    # card face shadow
ROOM0 = hx('#16121c')     # room, darkest
ROOM1 = hx('#241e2e')     # room, panels
RED, RED_HI, RED_LO = hx('#c93038'), hx('#d47564'), hx('#a93b3b')
GREEN, GREEN_LO = hx('#309c63'), hx('#3c5956')
BLUE, BLUE_HI, BLUE_LO = hx('#3978a8'), hx('#94d2d4'), hx('#047b96')
PURPLE = hx('#8e478c')
BRASS_HI, BRASS, BRASS_MID, BRASS_LO = hx('#fdd164'), hx('#d9a066'), hx('#b58057'), hx('#8a503e')
WOOD_DK = hx('#8f4e24')
GREY = hx('#6e6276')
GREY2 = hx('#827094')
CLEAR = (0, 0, 0, 0)

SUIT = {'S': PURPLE, 'H': RED, 'C': GREEN, 'D': BLUE}


def canvas(w, h, fill=CLEAR):
    return Image.new('RGBA', (w, h), fill)


def from_map(rows, key):
    """A pixel map: one string per row, one character per pixel, `key` maps characters to colours."""
    h, w = len(rows), max(len(r) for r in rows)
    im = canvas(w, h)
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                px[x, y] = key[ch]
    return im


def x2(im, k=2):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def text(fontfile, size, s, color):
    """Hard-edged text (no anti-aliasing), trimmed."""
    f = ImageFont.truetype(os.path.join(FONTS, fontfile), size)
    l, t, r, b = f.getbbox(s)
    im = canvas(r - l + 4, b - t + 4)
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    d.text((2 - l, 2 - t), s, font=f, fill=color)
    return im.crop(im.getbbox())


def card2x(path):
    """A card at 2x: the 4x file halved exactly."""
    im = Image.open(os.path.join(RES, path)).convert('RGBA')
    return im.resize((im.width // 2, im.height // 2), Image.NEAREST)


def pip(suit):
    return Image.open(os.path.join(RES, 'ui', 'icons', f'suit_{suit}.png')).convert('RGBA')


# ---- 1. Felt ------------------------------------------------------------------------------------
# A corner of the mat: green felt, a cream running stitch 5 px in from the edge, a 2 px
# ink edge with stepped corners, a little fray where the stitch is worn.

def felt(w=150, h=96):
    im = canvas(w, h)
    px = im.load()
    for y in range(h):
        for x in range(w):
            corner = (x < 2 or x >= w - 2) and (y < 2 or y >= h - 2)
            if corner and not ((x in (1, w - 2)) and (y in (1, h - 2))):
                continue
            edge = x < 2 or y < 2 or x >= w - 2 or y >= h - 2
            px[x, y] = INK if edge else GREEN_LO
    # Light from the top left: one highlight row and column inside the edge, shadow bottom right.
    for x in range(3, w - 3):
        px[x, 2] = GREEN
        px[x, h - 3] = ROOM1
    for y in range(3, h - 3):
        px[2, y] = GREEN
        px[w - 3, y] = ROOM1
    # Nap of the felt: short diagonal fibres in a fixed, uneven pattern (placed, not random).
    fibres = [(14, 17), (31, 9), (52, 22), (77, 13), (103, 19), (126, 11), (21, 41), (47, 36), (69, 47),
              (94, 39), (118, 44), (138, 30), (11, 63), (38, 70), (61, 59), (88, 68), (112, 61), (133, 74),
              (26, 84), (55, 81), (82, 86), (108, 83), (129, 55), (7, 30)]
    for i, (fx, fy) in enumerate(fibres):
        if fx < w - 6 and fy < h - 6:
            px[fx, fy] = GREEN
            px[fx + 1, fy + 1] = GREEN if i % 3 else ROOM1
    # Running stitch 5 px in: 3 on, 3 off.
    for x in range(7, w - 7):
        if (x // 3) % 2 == 0:
            px[x, 5] = CREAM2
            px[x, h - 6] = CREAM2
    for y in range(7, h - 7):
        if (y // 3) % 2 == 0:
            px[5, y] = CREAM2
            px[w - 6, y] = CREAM2
    # Wear: a few stitches missing near the bottom right, and a frayed nick in the edge.
    for x in (w - 30, w - 29, w - 28, w - 24, w - 23):
        px[x, h - 6] = GREEN_LO
    px[w - 40, h - 1] = CLEAR
    px[w - 39, h - 1] = CLEAR
    px[w - 39, h - 2] = GREEN_LO
    px[w - 1, 37] = CLEAR
    px[w - 2, 38] = GREEN_LO
    return im


# ---- 2. Chips (health) ---------------------------------------------------------------------------
# Top view, 16x16: ink rim, cream edge marks at the four quarters, a darker inner ring,
# highlight top left and shadow bottom right.

CHIP = [
    '......oooo......',
    '...oooRwwRooo...',
    '..ohhhRwwRRRRo..',
    '.ohhhhddddRRRRo.',
    '.ohhddRRRRddRRo.',
    'owwhdRRRRRRdRwwo',
    'owwhdRRRRRRdRwwo',
    'oRRdRRRRRRRRdRRo',
    'oRRdRRRRRRRRdRRo',
    'owwRdRRRRRRdLwwo',
    'owwRdRRRRRRdLwwo',
    '.oRRddRRRRddLLo.',
    '.oRRRRddddLLLLo.',
    '..oRRRRwwLLLLo..',
    '...oooRwwLooo...',
    '......oooo......',
]


def chip(state='alive', cracked=False):
    """alive (red), rotted (green with mould), shielded (a blue ♦ chip); cracked=True breaks it."""
    key = {'o': INK, 'w': CREAM, 'h': RED_HI, 'R': RED, 'd': RED_LO, 'L': RED_LO}
    if state == 'rotted':
        key = {'o': INK, 'w': CREAM2, 'h': GREEN, 'R': GREEN, 'd': GREEN_LO, 'L': GREEN_LO}
    if state == 'shielded':
        key = {'o': INK, 'w': CREAM, 'h': BLUE_HI, 'R': BLUE, 'd': BLUE_LO, 'L': BLUE_LO}
    im = from_map(CHIP, key)
    px = im.load()
    if state == 'rotted':
        # Mould: three dark spots of different sizes, placed by hand.
        for x, y in ((5, 5), (6, 5), (5, 6), (9, 7), (10, 7), (9, 8), (10, 8), (11, 8), (6, 10), (7, 10), (7, 11)):
            px[x, y] = GREEN_LO
        for x, y in ((6, 6), (10, 9), (7, 11)):
            px[x, y] = ROOM1
    if cracked:
        # A piece broken out of the rim at the upper right, and a crack running to the lower left.
        for x, y in ((12, 1), (12, 2), (13, 2), (13, 3), (14, 3), (14, 4)):
            px[x, y] = CLEAR
        for x, y in ((11, 1), (11, 2), (12, 3), (13, 4), (14, 5)):
            px[x, y] = INK
        for x, y in ((11, 4), (10, 5), (10, 6), (9, 7), (8, 7), (8, 8), (7, 9), (6, 10), (5, 11), (5, 12)):
            px[x, y] = ROOM1
        for x, y in ((11, 5), (9, 6), (7, 8), (6, 9)):
            px[x, y] = RED_HI
    return im


def chip_lost():
    """An empty spot on the felt where a chip was: the chip's outline in the room dark."""
    rows = [''.join('o' if ch == 'o' else '.' for ch in r) for r in CHIP]
    return from_map(rows, {'o': ROOM1})


def chip_stack(n=5):
    """Side view: chips 16 px wide, 3 px tall each, the top face on top."""
    w = 16
    top = [
        '...oooooooooo...',
        '.oohhhwwhhhhhoo.',
        'ohhhhRRRRRRhhhRo',
        'oRRRRRRRRRRRRRRo',
        '.ooRRRwwRRRRRoo.',
    ]
    band = [
        'oRRwwRRRRRwwRRdo',
        'oddwwddddddwwddo',
        '.oooooooooooooo.',
    ]
    h = len(top) - 1 + n * len(band)
    im = canvas(w, h + 1)
    key = {'o': INK, 'w': CREAM, 'h': RED_HI, 'R': RED, 'd': RED_LO}
    y = h + 1 - len(band)
    for i in range(n):
        im.alpha_composite(from_map(band, key), (0, y))
        y -= len(band)
    im.alpha_composite(from_map(top, key), (0, y + len(band) - len(top) + 1))
    return im


# ---- 3. Token button (brass) ----------------------------------------------------------------------
# A brass token with a 2-step corner, ink outline, a highlight lip along the top, a
# darker lip along the bottom, and a 2 px solid shadow under it (pressed: no shadow, 2 px lower).

def token(w, h, pressed=False):
    im = canvas(w, h + 2)
    px = im.load()
    oy = 2 if pressed else 0
    for y in range(h):
        for x in range(w):
            cut = (x == 0 or x == w - 1) and (y < 2 or y >= h - 2) or (x == 1 or x == w - 2) and (y == 0 or y == h - 1)
            if cut:
                continue
            edge = x == 0 or y == 0 or x == w - 1 or y == h - 1 or ((x == 1 or x == w - 2) and (y == 1 or y == h - 2))
            if edge:
                c = INK
            elif y == 1 or (y == 2 and 2 < x < w - 3):
                c = BRASS_HI
            elif y >= h - 3:
                c = BRASS_LO
            elif y >= h - 5:
                c = BRASS_MID
            else:
                c = BRASS
            px[x, y + oy] = c
    if not pressed:
        for x in range(2, w):
            px[x, h + 1] = ROOM0
            if px[x, h][3] == 0:
                px[x, h] = ROOM0
    # Wear on the brass: rubbed spots on the top lip, a small dent at the right.
    for x in (6, 7, 19):
        px[x, 1 + oy] = BRASS
    px[w - 7, h - 3 + oy] = BRASS_MID
    return im


# ---- 4. Slate (score) --------------------------------------------------------------------------------

def slate(w=118, h=46):
    im = canvas(w, h)
    px = im.load()
    for y in range(h):
        for x in range(w):
            cut = (x < 2 or x >= w - 2) and (y < 2 or y >= h - 2) and not ((x in (1, w - 2)) and (y in (1, h - 2)))
            if cut:
                continue
            outline = x == 0 or y == 0 or x == w - 1 or y == h - 1 or (x in (1, w - 2) and y in (1, h - 2))
            frame = x < 5 or y < 5 or x >= w - 5 or y >= h - 5
            if outline:
                c = INK
            elif frame:
                if y < 2 or x < 2:
                    c = BRASS
                elif y >= h - 2 or x >= w - 2:
                    c = WOOD_DK
                else:
                    c = BRASS_MID if (x + 3 * y) % 11 else BRASS_LO   # grain
            else:
                c = ROOM1 if (x == 5 or y == 5) else INK
            px[x, y] = c
    # A wiped smudge in the lower left of the slate.
    # (placed relative to the bottom, so any slate height keeps it)
    for x, y in ((9, 35), (10, 35), (11, 36), (12, 36), (13, 36), (14, 35), (10, 37), (11, 37), (15, 36), (16, 37)):
        if h >= 24 and x < w - 6:
            px[x, y - 46 + h] = GREY
    return im


# ---- 5. Hand badge -------------------------------------------------------------------------------------
# 32x32: a round felt disc in a brass rim, the suit's own pip in the middle, and 12
# timer ticks around it (lit in the suit colour as the hand charges).

def badge(suit, lit=12, spent=False):
    s = 32
    im = canvas(s, s)
    px = im.load()
    cx = cy = (s - 1) / 2
    for y in range(s):
        for x in range(s):
            r = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if r < 10.5:
                px[x, y] = GREEN_LO if not spent else ROOM1
            elif r < 12.2:
                tl = (x + y) < s - 3
                px[x, y] = (BRASS_HI if tl else BRASS_LO) if r < 11.4 else (BRASS if tl else BRASS_MID)
            elif r < 13.2:
                px[x, y] = INK
    ticks = [(15, 0), (22, 2), (27, 7), (29, 15), (27, 22), (22, 27), (15, 29), (8, 27), (3, 22), (1, 15), (3, 8), (8, 2)]
    for i, (tx, ty) in enumerate(ticks):
        c = ROOM1 if spent or i >= lit else SUIT[suit]
        for dx in (0, 1):
            for dy in (0, 1):
                px[tx + dx, ty + dy] = c
    p = pip(suit)
    if spent:
        pp = p.load()
        for y in range(p.height):
            for x in range(p.width):
                if pp[x, y][3]:
                    pp[x, y] = GREY
    im.alpha_composite(p, (7, 7))
    return im


# ---- 6. Bar tab (round results) ------------------------------------------------------------------------
# A paper slip: cream, a shaded right edge, a torn zigzag bottom, a punched hole at the top.

def bar_tab(w=150, h=128):
    im = canvas(w, h + 1)
    px = im.load()
    for y in range(h - 4):
        for x in range(w):
            cut = (x < 2 or x >= w - 2) and y < 2 and not (x in (1, w - 2) and y == 1)
            if cut:
                continue
            if x == 0 or y == 0 or x == w - 1 or (x in (1, w - 2) and y == 1):
                px[x, y] = INK
            elif x >= w - 4:
                px[x, y] = CREAM2
            else:
                px[x, y] = CREAM
    # Torn bottom: a zigzag 4 px deep, period 8.
    for x in range(w):
        k = x % 8
        depth = k if k <= 4 else 8 - k
        for y in range(h - 4, h - 4 + depth):
            px[x, y] = CREAM2 if x >= w - 4 else CREAM
        px[x, h - 4 + depth] = INK
    # A punched hole and a fold crease.
    for x, y in ((w // 2 - 1, 5), (w // 2, 5), (w // 2 - 1, 6), (w // 2, 6)):
        px[x, y] = ROOM0
    for x in range(3, w - 4, 2):
        px[x, 58] = CREAM2
    return im


# ---- Sheet ---------------------------------------------------------------------------------------------

def label(sheet, s, x, y, color=CREAM2, size=40):
    t = text('VT323-Regular.ttf', size, s, color)
    sheet.alpha_composite(t, (x, y))
    return t.height


def heading(sheet, s, x, y):
    sheet.alpha_composite(text('PixelifySans-SemiBold.ttf', 44, s, CREAM), (x, y))


def main():
    os.makedirs(OUT, exist_ok=True)
    W, H = 1920, 1080
    sheet = canvas(W, H, ROOM0)

    heading(sheet, 'HANDS OF FATE  ·  STYLE SAMPLE', 60, 40)
    label(sheet, 'Game size (2x). Deck colours + room darks only. Light from the top left.', 60, 104, GREY2)

    # Felt mat with the cards on it, and a badge at the end of the row.
    fx, fy = 60, 170
    sheet.alpha_composite(x2(felt(330, 210)), (fx, fy))
    sheet.alpha_composite(card2x('cards/updated/S_13.png'), (fx + 60, fy + 84))
    sheet.alpha_composite(card2x('cards/updated/H_12.png'), (fx + 260, fy + 84))
    sheet.alpha_composite(x2(badge('S', 7)), (fx + 470, fy + 176))
    label(sheet, 'FELT MAT · stitched edge · 2x cards · badge 7/12', fx, fy + 430)

    # Chips: states, a health grid and stacks.
    cx, cy = 780, 180
    heading(sheet, 'CHIPS = HEALTH', cx, cy - 10)
    row_y = cy + 70
    states = [('alive', chip('alive')), ('cracked', chip('alive', cracked=True)), ('lost', chip_lost()),
              ('rotted', chip('rotted')), ('shield', chip('shielded'))]
    x = cx
    for name, im in states:
        big = x2(im)
        sheet.alpha_composite(big, (x + (40 - big.width) // 2, row_y + (40 - big.height) // 2))
        label(sheet, name, x - 4, row_y + 52, CREAM2, 32)
        x += 110
    gx, gy = cx, row_y + 130
    sw = x2(felt(4 * 20 + 14, 3 * 20 + 14))
    sheet.alpha_composite(sw, (gx, gy))
    for r in range(3):
        for c in range(4):
            i = r * 4 + c
            im = (chip_lost() if i in (3, 7) else chip('rotted') if i == 6 else chip('shielded') if i in (0, 1)
                  else chip('alive', cracked=(i == 9)))
            big = x2(im)
            sheet.alpha_composite(big, (gx + 14 + c * 40 + (32 - big.width) // 2, gy + 14 + r * 40 + (32 - big.height) // 2))
    label(sheet, 'YOU · 9 / 12', gx + sw.width + 24, gy + 40, CREAM, 40)
    sx = cx + 330
    for i, n in enumerate((6, 4, 2)):
        st = x2(chip_stack(n))
        sheet.alpha_composite(st, (sx + i * 44, gy + sw.height - st.height))
    label(sheet, 'stacks', sx, gy + sw.height + 14, CREAM2, 32)

    # Tokens: START ROUND, pressed, and a small one.
    tx, ty = 1430, 180
    heading(sheet, 'BRASS TOKENS', tx, ty - 10)
    for i, (w, h, s, pressed) in enumerate(((180, 48, 'START ROUND', False), (180, 48, 'START ROUND', True), (90, 40, 'Forge', False))):
        tok = x2(token(w, h, pressed))
        yy = ty + 70 + i * 130
        sheet.alpha_composite(tok, (tx, yy))
        t = text('PixelifySans-SemiBold.ttf', 44, s, INK)
        sheet.alpha_composite(t, (tx + (tok.width - t.width) // 2, yy + (4 if pressed else 0) + (h * 2 - t.height) // 2 - 2))
        label(sheet, 'pressed' if pressed else ('' if i == 0 else 'small'), tx + tok.width + 16, yy + 30, CREAM2, 32)

    # Bar tab with a round's lines.
    bx0, by0 = 60, 690
    heading(sheet, 'BAR TAB = ROUND WON', bx0, by0 - 10)
    tab = x2(bar_tab())
    sheet.alpha_composite(tab, (bx0, by0 + 60))
    lines = [('ROUND 7', ''), ('Hands  9', '+80'), ('Chips  9/12', '+90'), ('Time   0:21', '+85'), ('x 1.6', ''), ('TOTAL', '1,240')]
    yy = by0 + 60 + 22
    for i, (left, right) in enumerate(lines):
        big = i in (0, 5)
        font = 'PixelifySans-SemiBold.ttf' if big else 'VT323-Regular.ttf'
        sheet.alpha_composite(text(font, 32, left, RED if i == 4 else INK), (bx0 + 24, yy))
        if right:
            r = text(font, 32, right, RED if big else INK)
            sheet.alpha_composite(r, (bx0 + tab.width - 30 - r.width, yy))
        yy += 32 if i not in (0, 3) else 44
    label(sheet, 'torn edge,', bx0 + tab.width + 20, by0 + 120, GREY2, 32)
    label(sheet, 'punched hole', bx0 + tab.width + 20, by0 + 156, GREY2, 32)

    # Slate with the score.
    slx, sly = 780, 690
    heading(sheet, 'SLATE = SCORE', slx, sly - 10)
    sl = x2(slate())
    sheet.alpha_composite(sl, (slx, sly + 60))
    digits = text('VT323-Regular.ttf', 64, '18,450', CREAM)
    sheet.alpha_composite(digits, (slx + (sl.width - digits.width) // 2, sly + 60 + (sl.height - digits.height) // 2 - 2))

    # Badges at three moments.
    bx, by = 1430, 690
    heading(sheet, 'HAND BADGES', bx, by - 10)
    for i, (suit, lit, spent, name) in enumerate((('H', 12, False, 'ready'), ('C', 5, False, 'charging'), ('D', 0, True, 'spent'))):
        sheet.alpha_composite(x2(badge(suit, lit, spent)), (bx + i * 140, by + 70))
        label(sheet, name, bx + i * 140, by + 146, CREAM2, 32)

    # Every colour used, framed in ink so the room darks show.
    pal = [INK, CREAM, CREAM2, ROOM0, ROOM1, RED, RED_HI, RED_LO, GREEN, GREEN_LO, BLUE, BLUE_HI, BLUE_LO, PURPLE,
           BRASS_HI, BRASS, BRASS_MID, BRASS_LO, WOOD_DK, GREY, GREY2]
    for i, c in enumerate(pal):
        sw = canvas(36, 36, INK)
        sw.alpha_composite(canvas(32, 32, c), (2, 2))
        sheet.alpha_composite(sw, (60 + i * 40, 1030))
    label(sheet, 'every colour used', 60 + len(pal) * 40 + 16, 1032, GREY2, 32)
    label(sheet, 'Card art: Pixel Plebes by Greebles (Devlyn JD)', 1300, 1032, GREY2, 32)
    sheet.convert('RGB').save(os.path.join(OUT, 'style_sample.png'))

    # Zoom sheet: pieces at 4x for checking pixels.
    z = canvas(1000, 300, ROOM0)
    x = 20
    for im in (chip('alive'), chip('alive', True), chip_lost(), chip('rotted'), chip('shielded'), chip_stack(5),
               badge('S', 7), badge('D', 0, True)):
        big = x2(im, 4)
        z.alpha_composite(big, (x, 20))
        x += big.width + 16
    z.alpha_composite(x2(token(60, 22), 4), (20, 180))
    z.convert('RGB').save(os.path.join(OUT, 'style_sample_zoom.png'))
    for n in ('style_sample.png', 'style_sample_zoom.png'):
        p = os.path.join(OUT, n)
        print(n, Image.open(p).size, os.path.getsize(p) // 1024, 'KB')


if __name__ == '__main__':
    main()
