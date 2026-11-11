"""Hands of Fate — tools/art/make_style_options.py

One screen (planning, 3x3 so cards are at exactly 2x), four UI styles to pick from.
Every style is built from what the cards themselves do (read pixel by pixel from
the deck): cream stock with clipped corners, the 3 px "rail" frame (two thin ink
lines that turn solid in places and dotted in others), ink tabs with small caps,
round suit medallions, the ink card back with cream line ornament, flat colour
blocks with ink outlines, the tan band behind the face cards.

Rules kept: deck colours + two room darks only, no semi-transparent pixels, UI at
exactly 2x, the cards unaltered, smoke background, health as a grid of cells.

    python tools/art/make_style_options.py <planning-layout.json> <smoke.png> <out-dir>
"""
import json
import os
import sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_style_sample as st  # noqa: E402  (palette, fonts, pips)

INK, CREAM, CREAM2 = st.INK, st.CREAM, st.CREAM2
RED, RED_HI, RED_LO = st.RED, st.RED_HI, st.RED_LO
BLUE, GREEN, PURPLE = st.BLUE, st.GREEN, st.PURPLE
TEAL = st.hx('#3c5956')
TAN = st.hx('#d3b39a')       # the band behind the face cards
TAN_LO = st.hx('#a0938e')
GOLD = st.hx('#fdd164')
OCHRE = st.hx('#d9a066')
SOFT = st.hx('#6e6276')
ROOM0, ROOM1 = st.ROOM0, st.ROOM1
CLEAR = (0, 0, 0, 0)
HEAD = 'PixelifySans-SemiBold.ttf'
BODY = 'VT323-Regular.ttf'


# ---- Card-frame primitives (art pixels; shown at 2x) ---------------------------------------

def stock(w, h, fill):
    """A card-shaped blank: corners clipped exactly like the deck's cards."""
    im = st.canvas(w, h)
    px = im.load()
    for y in range(h):
        for x in range(w):
            dx, dy = min(x, w - 1 - x), min(y, h - 1 - y)
            if (dy == 0 and dx < 2) or (dy == 1 and dx < 1):
                continue
            px[x, y] = fill
    return im


def rail(im, col, inset=3, cap=None, plain=False, sides='tlbr'):
    """
    The deck's frame: a 3 px rail (line, gap, line) that runs solid for a stretch,
    dotted for a stretch, and breaks for a caption. Point-symmetric like the cards:
    solid top-left, solid bottom-right. cap = (start, width) leaves a gap on top.
    """
    w, h = im.size
    px = im.load()
    x0, y0, x1, y1 = inset, inset, w - 1 - inset, h - 1 - inset
    L, V = x1 - x0 + 1, y1 - y0 + 1

    def kind_top(i):
        if cap and cap[0] - 2 <= i < cap[0] + cap[1] + 2:
            return 'gap'
        if plain:
            return 'double'
        a = (cap[0] + cap[1] + 2) if cap else 0
        s_end = max(a + 8, int(L * 0.58))
        if i < s_end:
            return 'solid'
        if i < s_end + 16:
            return 'dot'
        return 'double'

    def kind_bottom(i):
        if plain:
            return 'double'
        j = L - 1 - i
        s_end = int(L * 0.52)
        if j < s_end:
            return 'solid'
        if j < s_end + 16:
            return 'dot'
        return 'double'

    def kind_left(i):
        return 'solid' if (not plain and i < min(16, V // 4)) else 'double'

    def kind_right(i):
        return 'solid' if (not plain and V - 1 - i < min(16, V // 4)) else 'double'

    def put(x, y):
        if 0 <= x < w and 0 <= y < h:
            px[x, y] = col

    for i in range(L):
        for side, kind, yy in (('t', kind_top(i), y0), ('b', kind_bottom(i), y1 - 2)):
            if side not in sides or kind == 'gap':
                continue
            x = x0 + i
            put(x, yy)
            put(x, yy + 2)
            if kind == 'solid' or (kind == 'dot' and i % 2 == 0):
                put(x, yy + 1)
    for i in range(V):
        for side, kind, xx in (('l', kind_left(i), x0), ('r', kind_right(i), x1 - 2)):
            if side not in sides:
                continue
            y = y0 + i
            if cap and side == 'l' and False:
                continue
            put(xx, y)
            put(xx + 2, y)
            if kind == 'solid':
                put(xx + 1, y)
    return im


def diamond(im, cx, cy, col):
    """The cross-hatched diamond from the card back's corners (5x5... 7x7)."""
    px = im.load()
    for dx, dy in ((0, -3), (1, -2), (2, -1), (3, 0), (2, 1), (1, 2), (0, 3), (-1, 2), (-2, 1), (-3, 0), (-2, -1), (-1, -2),
                   (0, -1), (-1, 0), (1, 0), (0, 1)):
        if 0 <= cx + dx < im.width and 0 <= cy + dy < im.height:
            px[cx + dx, cy + dy] = col


def scroll(im, cx, cy, col):
    """A small flourish from the card back: a pill of three rings between two bars."""
    px = im.load()
    rows = [
        '..###..###..###..',
        '.#...##...##...#.',
        '##.#.##.#.##.#.##',
        '.#...##...##...#.',
        '..###..###..###..',
    ]
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == '#':
                px[cx - 8 + x, cy - 2 + y] = col
    for d in range(10, 22):
        px[cx - d, cy] = col
        px[cx + d, cy] = col
        if d % 2 == 0:
            px[cx - d, cy - 2] = col
            px[cx + d, cy + 2] = col


def medallion(suit, style, lit=12):
    """The round suit medallion from the centre of the face cards, with 12 timer dots."""
    s = 36
    im = st.canvas(s, s)
    px = im.load()
    c = (s - 1) / 2
    disc, ring, ring2 = {'A': (CREAM, INK, None), 'B': (INK, CREAM, None), 'C': (None, None, None),
                         'D': (CREAM, st.SUIT[suit] if suit else SOFT, INK)}[style]
    for y in range(s):
        for x in range(s):
            r = ((x - c) ** 2 + (y - c) ** 2) ** 0.5
            if disc and r < 10.6:
                px[x, y] = disc
            elif ring and r < (13.2 if style == 'D' else 12.6):
                px[x, y] = ring
            elif ring2 and r < 14.2:
                px[x, y] = ring2
    # Timer dots on a circle, like the dotted stretch of the rail.
    import math
    dot_on = st.SUIT[suit] if suit else None
    dot_off = ROOM1 if style in ('B', 'C') else SOFT
    for i in range(12):
        a = -math.pi / 2 + i * math.pi / 6
        rr = 16.6
        x, y = int(round(c + math.cos(a) * rr)), int(round(c + math.sin(a) * rr))
        col = (dot_on if (suit and i < lit) else dot_off)
        if style in ('B', 'C') and suit and i < lit:
            col = CREAM if style == 'C' else dot_on
        for ddx in (0, 1):
            for ddy in (0, 1):
                if 0 <= x + ddx - 1 < s and 0 <= y + ddy - 1 < s:
                    px[x + ddx - 1, y + ddy - 1] = col
    if suit:
        im.alpha_composite(st.pip(suit), (9, 9))
    else:
        col = CREAM if style in ('B', 'C') else SOFT
        for x in range(14, 22):
            px[x, 17] = col
            px[x, 18] = col
    return im


def cell(n, style):
    """One health cell, n art px square. Flat red, ink outline, the pips' rounded corners."""
    im = st.canvas(n + 2, n + 2)
    px = im.load()
    for y in range(n):
        for x in range(n):
            dx, dy = min(x, n - 1 - x), min(y, n - 1 - y)
            if dx + dy < 2:
                continue
            edge = dx == 0 or dy == 0 or dx + dy == 2
            if style == 'B':
                c = CREAM if edge else (INK if (dx == 1 or dy == 1 or dx + dy == 3) else RED)
            else:
                c = INK if edge else RED
                if not edge and dy == 1 and y < n / 2 and 2 <= x < n - 3:
                    c = RED_HI
                if not edge and (dy == 1 and y > n / 2):
                    c = RED_LO
            px[x, y] = c
    if style == 'D':
        # A solid ink drop to the lower right, like the offset on the deck's rank letters.
        out = st.canvas(n + 2, n + 2)
        sh = Image.new('RGBA', im.size, INK)
        out.paste(sh, (2, 2), im)
        out.alpha_composite(im)
        return out
    return im


# ---- The screen ---------------------------------------------------------------------------

class Screen:
    def __init__(self, layout, smoke, style):
        self.d = json.load(open(layout))
        self.style = style
        self.W, self.H = 1920, 1080
        self.img = Image.open(smoke).convert('RGBA').resize((self.W, self.H), Image.NEAREST)
        self.regions = []   # (x, y, w, h, 'cream' | 'ink' | 'tan' | 'red')
        self.by = {}
        for b in self.d['boxes']:
            self.by.setdefault(b['name'], []).append(b)

    def rect(self, b):
        x = int(round(b['x'] + self.W / 2))
        y = int(round(self.H / 2 - b['y'] - b['h']))
        return x - x % 2, y - y % 2, int(round(b['w'])), int(round(b['h']))

    def paste(self, im, x, y):
        self.img.alpha_composite(im, (int(x), int(y)))

    def bg_at(self, x, y):
        for rx, ry, rw, rh, kind in reversed(self.regions):
            if rx <= x <= rx + rw and ry <= y <= ry + rh:
                return kind
        return 'smoke'

    def text(self, s, x, y, size, col, font=HEAD, align=0, w=0, h=0):
        t = st.text(font, size, s, col)
        tx = x if align == 0 else (x + w - t.width if align == 2 else x + (w - t.width) // 2)
        ty = y + (h - t.height) // 2 if h else y
        self.paste(t, tx, ty)
        return t.width

    # A panel in this style's material. Returns nothing; records the region for text colours.
    def panel(self, x, y, w, h, caption=None, kind=None, plain=False, ornate=False, tab=None):
        s = self.style
        kind = kind or {'A': 'cream', 'B': 'ink', 'C': 'none', 'D': 'cream'}[s]
        aw, ah = w // 2, h // 2
        cap_w = 0
        if caption:
            cap_w = (st.text(HEAD, 18, caption, INK).width + 16) // 2
        cap = (9, cap_w) if caption else None
        if kind == 'none':
            im = st.canvas(aw, ah)
            rail(im, CREAM, inset=0, cap=(6, cap_w) if caption else None, plain=plain, sides='tl' if not plain else 'tlbr')
            # Open style: only the top-left bracket and a short bottom-right return.
            px = im.load()
            for i in range(min(28, aw // 3)):
                for k in (0, 2):
                    px[aw - 1 - i, ah - 1 - k] = CREAM
            for i in range(min(18, ah // 3)):
                for k in (0, 2):
                    px[aw - 1 - k, ah - 1 - i] = CREAM
            self.paste(st.x2(im), x, y)
            if caption:
                self.text(caption, x + 12 + 8, y - 6, 18, CREAM)
            return
        fill = {'cream': CREAM, 'ink': INK, 'tan': TAN, 'red': RED}[kind]
        line = INK if kind in ('cream', 'tan') else CREAM
        im = stock(aw, ah, fill)
        if kind in ('cream', 'tan'):
            # The card's own edge: one shade step along the bottom and right.
            px = im.load()
            for xx in range(2, aw - 2):
                px[xx, ah - 1] = CREAM2 if kind == 'cream' else TAN_LO
        rail(im, line, inset=3, cap=cap, plain=plain)
        if ornate and aw > 60 and ah > 40:
            for cx, cy in ((11, 11), (aw - 12, 11), (11, ah - 12), (aw - 12, ah - 12)):
                diamond(im, cx, cy, line)
            if aw > 120:
                scroll(im, aw // 2, ah - 12, line)
        self.paste(st.x2(im), x, y)
        self.regions.append((x, y, w, h, kind))
        if caption:
            cx, cy = x + 2 * (3 + cap[0]), y + 2
            tcol = tab or (INK if kind in ('cream', 'tan') else CREAM)
            tw = cap_w * 2
            ImageDraw.Draw(self.img).rectangle([cx, cy, cx + tw - 1, cy + 21], fill=tcol)
            self.text(caption, cx, cy, 18, CREAM if tcol != CREAM else INK, align=1, w=tw, h=22)

    def button(self, b, primary=False, tone=None):
        x, y, w, h = self.rect(b)
        s = self.style
        label = b.get('label') or ''
        size = 44 if h > 90 and primary else (36 if h > 90 else 26)
        aw, ah = w // 2, h // 2
        if s == 'A':
            im = stock(aw, ah - 2, RED if primary else CREAM)
            rail(im, CREAM if primary else INK, inset=3, plain=not primary)
            edge = stock(aw, ah - 2, INK)               # the card's thickness underneath
            self.paste(st.x2(edge), x, y + 4)
            self.paste(st.x2(im), x, y)
            col = CREAM if primary else INK
        elif s == 'B':
            im = stock(aw, ah, CREAM if primary else INK)
            rail(im, INK if primary else CREAM, inset=3, plain=not primary)
            if primary:
                diamond(im, 12, ah // 2, INK)
                diamond(im, aw - 13, ah // 2, INK)
            self.paste(st.x2(im), x, y)
            col = RED if primary else CREAM
        elif s == 'C':
            if primary:
                im = stock(aw, ah, RED)
                rail(im, INK, inset=0, plain=True)
                col = CREAM
            else:
                im = st.canvas(aw, ah)
                rail(im, CREAM, inset=0, plain=True)
                col = CREAM
            self.paste(st.x2(im), x, y)
        else:
            fill = tone or (RED if primary else BLUE)
            body = stock(aw - 3, ah - 3, fill)
            px = body.load()
            for yy in range(body.height):
                for xx in range(body.width):
                    if px[xx, yy][3]:
                        dx, dy = min(xx, body.width - 1 - xx), min(yy, body.height - 1 - yy)
                        if dx == 0 or dy == 0 or (dx + dy) == 2:
                            px[xx, yy] = INK
            for xx in range(4, body.width - 4):
                if xx % 2 == 0 or xx < body.width * 0.6:
                    px[xx, 3] = CREAM
            sh = stock(aw - 3, ah - 3, INK)
            self.paste(st.x2(sh), x + 6, y + 6)
            self.paste(st.x2(body), x, y)
            t = st.text(HEAD, size, label, INK)
            self.paste(t, x + (w - 6 - t.width) // 2 + 3, y + (h - 6 - t.height) // 2 + 3)
            w, h = w - 6, h - 6
            col = CREAM
        self.text(label, x, y - (2 if s == 'A' else 0), size, col, align=1, w=w, h=h)

    def card(self, frame, x, y, w, h):
        p = os.path.join(st.RES, frame + '.png')
        im = Image.open(p).convert('RGBA')
        if frame.startswith('anim/'):
            im = im.crop((0, 0, 360, 504))
        self.paste(im.resize((w, h), Image.NEAREST), x, y)

    def dotted(self, x0, x1, y, col):
        d = ImageDraw.Draw(self.img)
        for x in range(x0, x1, 8):
            d.rectangle([x, y, x + 3, y + 1], fill=col)

    def render(self):
        s = self.style
        by, R = self.by, self.rect
        on_dark = s in ('B', 'C')
        fg = CREAM if on_dark else INK
        soft = CREAM2 if on_dark else SOFT

        # The Joker's card, peeking over the top edge behind the table.

        # --- Top strip: round, score, Options ---
        rx, ry, rw, rh = R(by['Round'][0])
        self.panel(26, 20, 420, 72, kind='tan' if s == 'D' else None, plain=True)
        rcol = {'A': RED, 'B': CREAM, 'C': CREAM, 'D': INK}[s]
        self.text('ROUND', 48, 20, 22, fg if s != 'D' else INK, h=72)
        self.text('5', 136, 18, 53, rcol, h=72)
        if s == 'D':
            self.text('5', 139, 21, 53, INK, h=72)
            self.text('5', 136, 18, 53, RED, h=72)
        self.text('Planning', 196, 20, 34, soft if s != 'D' else INK, font=BODY, h=72)
        sx = 1404
        self.panel(sx, 20, 320, 72, kind='ink' if s in ('A', 'D') else None, plain=True)
        dark_score = s != 'C' or True
        self.text('SCORE', sx + 24, 20, 18, CREAM2, h=72)
        self.text('18,450', sx + 24, 18, 44, GOLD, align=2, w=320 - 48, h=72)
        self.button(dict(by['Options'][0], label='Options'), tone=TEAL)

        # --- Left: your hands (one card, dotted rules between hands) ---
        rows = [b for n, bs in by.items() if n.startswith('Hand ') for b in bs]
        rows.sort(key=lambda b: -b['y'])
        x0, y0, w0, _ = R(rows[0])
        top = y0 - 30
        hx, hy, hw, hh = 26, top - 8, 408, (len(rows) * 58) + 44
        self.panel(hx, hy, hw, hh, caption='YOUR HANDS', tab=PURPLE if s == 'D' else None)
        for i, b in enumerate(rows):
            x, y, w, h = R(b)
            y = top + 26 + i * 58
            kids = [c for c in self.d['boxes'] if c['depth'] == b['depth'] + 1 and b['x'] <= c['x'] <= b['x'] + b['w']
                    and b['y'] - 2 <= c['y'] <= b['y'] + b['h']]
            tag = next(c for c in kids if c['name'] == 'Tag')['text']
            name = next(c for c in kids if c['name'] == 'Name')['text']
            eff = next(c for c in kids if c['name'] == 'Effect')['text']
            suit = next(c for c in kids if c['name'] == 'Icon')['frame'][-1]
            pips = [c for c in kids if c['name'].startswith('Pip')]
            if s == 'D':
                # The line's tag as a colour block, like a rank in the card's corner.
                ImageDraw.Draw(self.img).rectangle([x + 8, y + 8, x + 47, y + 43], fill=INK)
                ImageDraw.Draw(self.img).rectangle([x + 6, y + 6, x + 43, y + 39], fill=st.SUIT[suit])
                self.text(tag, x + 6, y + 6, 20, CREAM, align=1, w=38, h=34)
            else:
                self.text(tag, x + 10, y, 20, soft, h=52)
            self.paste(st.x2(st.pip(suit)) if s == 'D' else st.pip(suit).resize((27, 27), Image.NEAREST), x + (54 if s == 'D' else 50), y + (8 if s == 'D' else 13))
            self.text(name, x + (96 if s == 'D' else 88), y - 2, 24, fg, h=52)
            self.text(eff, x + (214 if s == 'D' else 204), y, 27, soft if s != 'C' else CREAM2, font=BODY, h=52)
            for k in range(len(pips)):
                self.paste(st.pip(suit), x + w + 6 - 18 - (len(pips) - 1 - k) * 17, y + 17)
            if i < len(rows) - 1:
                self.dotted(x + 6, x + w - 6, y + 54, soft if s != 'C' else ROOM1)

        # --- Left: your health grid ---
        cells = [b for n, bs in by.items() if n.startswith('Cell') for b in bs]
        mine = [b for b in cells if b['x'] < 0]
        theirs = [b for b in cells if b['x'] > 0]
        gy = hy + hh + 22
        self.panel(26, gy, 408, 168, caption='YOUR HEALTH', tab=RED if s == 'D' else None)
        mx, my = min(R(b)[0] for b in mine), min(R(b)[1] for b in mine)
        for b in mine:
            x, y, w, h = R(b)
            self.paste(st.x2(cell(15, s)), 52 + (x - mx) * 34 // 36, gy + 40 + (y - my) * 34 // 36)
        ncol = RED if not on_dark else CREAM
        self.text('12', 250, gy + 30, 66, ncol, align=2, w=90)
        self.text('/ 12', 348, gy + 62, 34, soft, font=BODY)
        self.text('cells left', 250, gy + 110, 28, soft, font=BODY)

        # --- Left: the stash ---
        bx, by_, bw, bh = R(by['Back'][0])
        self.panel(26, by_ - 30, 408, bh + 40, caption='STASH', tab=TEAL if s == 'D' else None)
        stash = [b for b in self.d['boxes'] if (b.get('frame') or '').startswith('cards/') and b['w'] == 90 and b['x'] < -500]
        step = min(97, (408 - 44 - 90) // max(1, len(stash) - 1))
        for i, b in enumerate(stash):
            x, y, w, h = R(b)
            self.card(b['frame'], 48 + i * step, y, w, h)

        # --- Middle: the board ---
        slots = [b for n, bs in by.items() if n.startswith('Slot ') for b in bs]
        badges = [b for n, bs in by.items() if n.startswith(('RowBadge', 'ColBadge')) for b in bs]
        rs = [R(b) for b in slots + badges]
        l, t = min(r[0] for r in rs) - 34, min(r[1] for r in rs) - 34
        r_, bt = max(r[0] + r[2] for r in rs) + 34, max(r[1] + r[3] for r in rs) + 30
        self.card('anim/joker_true', (l + r_) // 2 - 90 - ((l + r_) // 2) % 2, 6, 180, 252)
        if s == 'C':
            ImageDraw.Draw(self.img).rectangle([(l + r_) // 2 - 92, t, (l + r_) // 2 + 92, 262], fill=ROOM0)
            self.img.alpha_composite(Image.open(sys.argv[2]).convert('RGBA').resize((1920, 1080), Image.NEAREST).crop(((l + r_) // 2 - 92, t, (l + r_) // 2 + 92, 262)), ((l + r_) // 2 - 92, t))
        mat = {'A': 'ink', 'B': 'ink', 'C': 'none', 'D': 'tan'}[s]
        self.panel(l, t, r_ - l, bt - t, kind=mat, ornate=(s == 'B'), caption='YOUR TABLE' if s != 'B' else None,
                   tab=CREAM if s == 'A' else (INK if s == 'D' else None))
        for b in self.d['boxes']:
            if b['name'] == 'Art' and b['w'] == 180:
                x, y, w, h = R(b)
                self.card(b['frame'], x, y, w, h)
        for b in by.get('InHand', []):
            x, y, w, h = R(b)
            d = ImageDraw.Draw(self.img)
            ring = GOLD if s != 'D' else INK
            # A dotted gold rail around scoring cards, in the frame's own language.
            for k in range(0, w, 8):
                d.rectangle([x + k, y, x + k + 3, y + 1], fill=ring)
                d.rectangle([x + k, y + h - 2, x + k + 3, y + h - 1], fill=ring)
            for k in range(0, h, 8):
                d.rectangle([x, y + k, x + 1, y + k + 3], fill=ring)
                d.rectangle([x + w - 2, y + k, x + w - 1, y + k + 3], fill=ring)
        for b in badges:
            x, y, w, h = R(b)
            icon = next((c for c in self.d['boxes'] if (c.get('frame') or '').startswith('ui/icons/suit_')
                         and b['x'] <= c['x'] <= b['x'] + b['w'] and b['y'] <= c['y'] <= b['y'] + b['h'] and c['depth'] == b['depth'] + 1), None)
            style = s if not (s == 'A') else 'A'
            m = medallion(icon['frame'][-1] if icon else None, 'B' if (s == 'A') else style, 12)
            if s == 'A':
                m = medallion(icon['frame'][-1] if icon else None, 'A', 12)
            self.paste(st.x2(m), x + (w - 72) // 2, y + (h - 72) // 2)

        # --- Right: the opponent ---
        ox, oy, ow, oh = R(by['Opponent'][0])
        self.panel(ox, oy, ow, oh, caption='ACROSS THE TABLE', ornate=(s == 'B'), tab=BLUE if s == 'D' else None)
        ax, ay, aw_, ah_ = R(by['Avatar'][0])
        if s == 'D':
            # The tan band the face cards stand on, behind the portrait.
            ImageDraw.Draw(self.img).rectangle([ox + 14, ay + 116, ox + ow - 15, ay + ah_ - 14], fill=TAN)
        self.card(by['Avatar'][0]['frame'], ax, ay + 10, aw_, ah_)
        nb = by['Name'][-1]
        x, y, w, h = R(nb)
        self.text(nb['text'], x, y + 10, 34, fg, h=h)
        self.text('Round 5  ·  20 cells', x, y + 54, 30, soft, font=BODY)
        lines = [b for n, bs in by.items() if n.startswith('Line ') for b in bs]
        lines.sort(key=lambda b: -b['y'])
        ly = ay + ah_ + 44
        self.text('THEIR HANDS', ox + 30, ly - 6, 18, soft)
        for i, b in enumerate(lines):
            suit = by['Icon ' + b['name'][5:]][0]['frame'][-1]
            parts = b['text'].split(' · ')
            yy = ly + 26 + i * 50
            self.paste(st.x2(st.pip(suit)), ox + 30, yy + 4)
            self.text(parts[0], ox + 80, yy, 28, fg, h=44)
            self.text(parts[1], ox + 250, yy, 32, st.SUIT[suit] if not on_dark else CREAM2, font=BODY, h=44)
            self.text(parts[2], ox + ow - 30 - 200, yy, 32, soft, font=BODY, align=2, w=200, h=44)
            self.dotted(ox + 30, ox + ow - 30, yy + 46, soft if s != 'C' else ROOM1)
        hy2 = ly + 26 + len(lines) * 50 + 40
        self.text('THEIR HEALTH', ox + 30, hy2, 18, soft)
        tx0, ty0 = min(R(b)[0] for b in theirs), min(R(b)[1] for b in theirs)
        for b in theirs:
            x, y, w, h = R(b)
            self.paste(st.x2(cell(21, s)), ox + 30 + (x - tx0), hy2 + 36 + (y - ty0))
        self.text('20', ox + ow - 200, hy2 + 60, 88, RED if not on_dark else CREAM, align=2, w=110)
        self.text('/ 20', ox + ow - 82, hy2 + 104, 34, soft, font=BODY)

        # --- Actions ---
        self.button(dict(by['ForgeButton'][0], label='Forge'), tone=BLUE)
        self.button(dict(by['StartRound'][0], label='START ROUND'), primary=True)
        return self.img


NAMES = {'A': 'A  CARD STOCK', 'B': 'B  CARD BACK', 'C': 'C  OPEN TABLE', 'D': 'D  FACE CARD'}


def main():
    layout, smoke, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    shots = []
    for s in 'ABCD':
        im = Screen(layout, smoke, s).render().convert('RGB')
        im.save(os.path.join(out, f'style_{s}.png'))
        shots.append((s, im))
    sheet = Image.new('RGB', (1920 + 20, 1080 + 20 + 80), ROOM0[:3])
    for k, (s, im) in enumerate(shots):
        x, y = (k % 2) * 970, (k // 2) * 590
        sheet.paste(im.resize((960, 540), Image.NEAREST), (x, y + 40))
        t = st.text(HEAD, 26, NAMES[s], CREAM)
        sheet.paste(t, (x + 8, y + 8), t)
    sheet.save(os.path.join(out, 'style_options_sheet.png'))
    print('wrote', out)


if __name__ == '__main__':
    main()
