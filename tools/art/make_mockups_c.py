"""Hands of Fate — tools/art/make_mockups_c.py

Every screen in the chosen style C, "open table" (picked 2026-11-11 from
build/style_options/style_C.png): no panels. Cream frame lines from the deck (a 3 px
rail that runs solid, then dotted, then double) are drawn straight on the smoke as
open brackets with a small-caps caption on the line; closed rails only for small
boxes (round, score, buttons). START ROUND and other main actions are a red card;
the chosen option is a cream card. Badges are the deck's round suit medallion with
12 timer dots. Health stays a grid of flat red cells with the count large beside it.
The Joker's card peeks over the top of the table.

The layouts are the game's own (tools/layout/render.ts records every node).

    python tools/art/make_mockups_c.py <smoke dir> <layout dir> <out dir>
"""
import json
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import artbase as st                    # noqa: E402  palette, fonts, pips, text
import make_style_options as so         # noqa: E402  rail, stock, medallion, cell

INK, CREAM, CREAM2 = st.INK, st.CREAM, st.CREAM2
RED, RED_HI, RED_LO = st.RED, st.RED_HI, st.RED_LO
GREEN, GREEN_LO = st.GREEN, st.GREEN_LO
BLUE, BLUE_HI, BLUE_LO = st.BLUE, st.BLUE_HI, st.BLUE_LO
PURPLE, GOLD, SOFT = st.PURPLE, so.GOLD, so.SOFT
ROOM0, ROOM1 = st.ROOM0, st.ROOM1
HEAD, BODY = so.HEAD, so.BODY
RES = st.RES
W, H = 1920, 1080

PRIMARY = {'StartRound', 'Next', 'Face', 'NewRun', 'Resume'}
PRIMARY_LABELS = {'Place it', 'Brilliant', 'FACE HIM', 'START ROUND', 'Next round', 'New Run'}


def hexc(h):
    return st.hx(h)


def lum(c):
    return (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255


def font(kind, size):
    return ImageFont.truetype(os.path.join(st.FONTS, BODY if kind == 'body' else HEAD), max(8, int(round(size))))


def cell_c(n, state='alive'):
    """A health cell: flat colour, ink outline, rounded like the pips. Lost = an empty hole."""
    base = so.cell(n, 'C')
    if state == 'alive':
        return base
    px = base.load()
    swap = {'rotted': {RED: GREEN, RED_HI: GREEN, RED_LO: GREEN_LO},
            'shield': {RED: BLUE, RED_HI: BLUE_HI, RED_LO: BLUE_LO},
            'lost': {RED: ROOM0, RED_HI: ROOM0, RED_LO: ROOM0, INK: SOFT}}[state]
    for y in range(base.height):
        for x in range(base.width):
            if px[x, y] in swap:
                px[x, y] = swap[px[x, y]]
    if state == 'rotted':
        # Mould: dark spots placed by hand.
        for x, y in ((4, 4), (5, 4), (4, 5), (n - 6, n // 2), (n - 5, n // 2), (n // 2 - 2, n - 5)):
            if 0 < x < n - 1 and 0 < y < n - 1:
                px[x, y] = GREEN_LO
    return base


class Mock:
    def __init__(self, layout, smoke):
        self.d = json.load(open(layout)) if layout else {'boxes': []}
        self.smoke = Image.open(smoke).convert('RGBA').resize((W, H), Image.NEAREST)
        self.img = self.smoke.copy()
        self.by = {}
        for b in self.d['boxes']:
            self.by.setdefault(b['name'], []).append(b)
        self.done = set()

    # ---- geometry --------------------------------------------------------------------------
    def rect(self, b):
        x = int(round(b['x'] + W / 2))
        y = int(round(H / 2 - b['y'] - b['h']))
        return x - x % 2, y - y % 2, int(round(b['w'])), int(round(b['h']))

    def inside(self, b, p):
        return (b['depth'] > p['depth'] and p['x'] - 1 <= b['x'] + b['w'] / 2 <= p['x'] + p['w'] + 1
                and p['y'] - 1 <= b['y'] + b['h'] / 2 <= p['y'] + p['h'] + 1)

    def kids(self, p):
        return [b for b in self.d['boxes'] if self.inside(b, p)]

    def eat(self, *bs):
        for b in bs:
            self.done.add(id(b))

    def paste(self, im, x, y):
        self.img.alpha_composite(im, (int(x), int(y)))

    # ---- drawing primitives -------------------------------------------------------------------
    def text(self, s, x, y, size, col, kind='head', align=0, w=0, h=0, shrink=True):
        f = font(kind, size)
        if shrink and w:
            while f.getlength(s) > w and size > 12:
                size -= 1
                f = font(kind, size)
        l, t, r, b = f.getbbox(s)
        tx = x - l if align == 0 else (x + w - (r - l) - l if align == 2 else x + (w - (r - l)) / 2 - l)
        ty = y + (h - (b - t)) / 2 - t if h else y - t
        d = ImageDraw.Draw(self.img)
        d.fontmode = '1'
        d.text((tx, ty), s, font=f, fill=col)
        return r - l

    def frame(self, x, y, w, h, caption=None, closed=False, col=CREAM, fill=None, ret=True):
        """An open bracket (top and left rails, a short return at the bottom right) or a closed rail."""
        x, y = x - x % 2, y - y % 2
        aw, ah = max(8, w // 2), max(8, h // 2)
        cap_w = (st.text(HEAD, 18, caption, col).width + 16) // 2 if caption else 0
        im = so.stock(aw, ah, fill) if fill else st.canvas(aw, ah)
        so.rail(im, col, inset=0, cap=(6, cap_w) if caption else None, plain=closed, sides='tlbr' if closed else 'tl')
        if not closed and ret:
            px = im.load()
            for i in range(min(28, aw // 3)):
                for k in (0, 2):
                    px[aw - 1 - i, ah - 1 - k] = col
            for i in range(min(18, ah // 3)):
                for k in (0, 2):
                    px[aw - 1 - k, ah - 1 - i] = col
        self.paste(st.x2(im), x, y)
        if caption:
            self.text(caption, x + 20, y - 6, 18, col)

    def dotted(self, x0, x1, y, col=SOFT):
        d = ImageDraw.Draw(self.img)
        for x in range(int(x0), int(x1), 8):
            d.rectangle([x, y, x + 3, y + 1], fill=col)

    def dotted_rect(self, x, y, w, h, col):
        d = ImageDraw.Draw(self.img)
        for k in range(0, w, 8):
            d.rectangle([x + k, y, x + k + 3, y + 1], fill=col)
            d.rectangle([x + k, y + h - 2, x + k + 3, y + h - 1], fill=col)
        for k in range(0, h, 8):
            d.rectangle([x, y + k, x + 1, y + k + 3], fill=col)
            d.rectangle([x + w - 2, y + k, x + w - 1, y + k + 3], fill=col)

    def dotted_ring(self, cx, cy, rx, ry, col, n=40, s=4):
        d = ImageDraw.Draw(self.img)
        for i in range(n):
            a = i * 2 * math.pi / n
            x, y = int(cx + math.cos(a) * rx), int(cy + math.sin(a) * ry)
            x, y = x - x % 2, y - y % 2
            d.rectangle([x, y, x + s - 1, y + s - 1], fill=col)

    def art(self, frame, x, y, w, h):
        p = os.path.join(RES, frame + '.png')
        if not os.path.exists(p):
            return
        im = Image.open(p).convert('RGBA')
        if frame.startswith('anim/'):
            im = im.crop((0, 0, 360, 504))
        self.paste(im.resize((max(1, w), max(1, h)), Image.NEAREST), x, y)

    def pip(self, suit, x, y, size, col=None):
        p = st.pip(suit)
        k = max(1, round(size / 18))
        p = st.x2(p, k) if k > 1 else p
        if col:
            px = p.load()
            for yy in range(p.height):
                for xx in range(p.width):
                    if px[xx, yy][3]:
                        px[xx, yy] = col
        self.paste(p, x + (size - p.width) // 2, y + (size - p.height) // 2)

    def button(self, x, y, w, h, label, kind='plain', size=None):
        """plain: cream rail on the smoke · primary: a red card · on: the chosen option, a cream card · muted."""
        x, y = x - x % 2, y - y % 2
        aw, ah = w // 2, h // 2
        if kind == 'primary':
            im = so.stock(aw, ah, RED)
            so.rail(im, INK, inset=0, plain=True)
            col = CREAM
        elif kind == 'on':
            im = so.stock(aw, ah, CREAM)
            so.rail(im, INK, inset=0, plain=True)
            col = INK
        else:
            im = st.canvas(aw, ah)
            line = SOFT if kind == 'muted' else CREAM
            so.rail(im, line, inset=0, plain=True)
            col = line
        self.paste(st.x2(im), x, y)
        size = size or (44 if h > 90 and kind == 'primary' else (36 if h > 90 else (30 if h > 64 else 24)))
        self.text(label, x + 14, y, size, col, align=1, w=w - 28, h=h)

    def btn(self, b, kind=None):
        x, y, w, h = self.rect(b)
        label = (b.get('label') or '').strip()
        if kind is None:
            kind = 'primary' if (b['name'] in PRIMARY or label in PRIMARY_LABELS) else 'plain'
        self.button(x, y, w, h, label, kind)
        self.eat(b, *self.kids(b))

    def label(self, b, col=None, size=None, kind=None):
        s = (b.get('text') or '').replace('\n', ' ')
        self.eat(b)
        if not s:
            return
        x, y, w, h = self.rect(b)
        c = col or hexc(b.get('color') or '#ecece0')
        if col is None and lum(c) < 0.36:
            c = CREAM          # ink text that sat on cream panels now sits on the smoke
        size = size or b.get('size') or 30
        kind = kind or b.get('font') or 'head'
        f = font(kind, size)
        if b.get('overflow') == 3 and f.getlength(s) > w > 40:
            words, lines, cur = s.split(' '), [], ''
            for wd in words:
                nxt = (cur + ' ' + wd).strip()
                if f.getlength(nxt) <= w or not cur:
                    cur = nxt
                else:
                    lines.append(cur)
                    cur = wd
            lines.append(cur)
            lh = size * 1.1
            ty = y + (h - lh * len(lines)) / 2
            for k, ln in enumerate(lines):
                self.text(ln, x, ty + k * lh + 2, size, c, kind, shrink=False)
            return
        align = b.get('align', 1)
        self.text(s, x, y, size, c, kind, align=align, w=w, h=h, shrink=b.get('overflow') in (2, 3))

    def element(self, b):
        """Anything not handled by name: labels, buttons, art, pips."""
        if id(b) in self.done:
            return
        frame = b.get('frame') or ''
        x, y, w, h = self.rect(b)
        if b['kind'] == 'label':
            self.label(b)
        elif b['kind'] == 'button':
            self.btn(b)
        elif frame.startswith('ui/icons/suit_'):
            self.pip(frame.split('suit_')[1][0], x, y, w)
        elif frame.startswith(('cards/', 'anim/', 'concept/', 'ui/')):
            self.art(frame, x, y, w, h)
        elif b['name'] == 'Locked':
            # Locked Aces: a dark cover over the art (never a tint of it).
            region = self.img.crop((x, y, x + w, y + h)).convert('RGB')
            dark = Image.blend(region, Image.new('RGB', region.size, ROOM0[:3]), 0.72).convert('RGBA')
            self.paste(dark, x, y)
        elif b['name'] == 'Track':
            self.frame(x, y, w, max(12, h), closed=True, col=SOFT)
        elif b['name'] == 'Empty' or b['name'].startswith('Empty'):
            self.dotted_rect(x, y, w, h, SOFT)
        self.eat(b)

    # ---- the shared top strip (planning, fight, round won) -----------------------------------
    def strip(self):
        by = self.by
        rnd = by['Round'][0]['text'].split()[-1]
        phase = by['Phase'][0]['text']
        pw = int(font('body', 34).getlength(phase))
        bw = max(420, 196 + pw + 40)
        self.frame(26, 20, bw, 72, closed=True)
        self.text('ROUND', 48, 20, 22, CREAM, h=72)
        self.text(rnd, 136, 18, 53, CREAM, h=72)
        self.text(phase, 196, 20, 34, CREAM2, kind='body', h=72)
        score = by['Score'][0]['text']
        sx = 1404
        self.frame(sx, 20, 320, 72, closed=True)
        self.text('SCORE', sx + 24, 20, 18, CREAM2, h=72)
        self.text(score, sx + 24, 18, 44, GOLD, align=2, w=320 - 48, h=72)
        ob = by['Options'][0]
        x, y, w, h = self.rect(ob)
        self.button(x, y, w, h + 2, 'Options', size=27)
        self.eat(*[b for b in self.d['boxes'] if b['depth'] <= 4 and b['name'] in
                   ('Round', 'Phase', 'Score', 'Extra', 'JokerSpot', 'Text', 'Options', 'Label') and b['y'] > 400])

    # ---- planning / fight -----------------------------------------------------------------------
    def table(self, fight=False, took=None):
        by, R = self.by, self.rect
        self.strip()
        boxes = self.d['boxes']

        # Your hands: one open bracket, dotted rules between hands.
        rows = sorted([b for n, bs in by.items() if n.startswith('Hand ') for b in bs], key=lambda b: -b['y'])
        top = (R(rows[0])[1] if rows else 140) - 30
        left = by.get('Leftovers')
        hh = len(rows) * 58 + 44 + (34 if left else 0)
        self.frame(26, top - 8, 408, hh, caption='YOUR HANDS')
        firing = rows[1]['name'] if (fight and len(rows) > 1) else None
        for i, b in enumerate(rows):
            x, y, w, h = R(b)
            y = top + 26 + i * 58
            kids = [c for c in boxes if c['depth'] == b['depth'] + 1 and b['x'] <= c['x'] <= b['x'] + b['w']
                    and b['y'] - 2 <= c['y'] <= b['y'] + b['h']]
            get = lambda n: next((c for c in kids if c['name'] == n), {})
            suit = get('Icon')['frame'][-1]
            pips = [c for c in kids if c['name'].startswith('Pip')]
            if b['name'] == firing:
                self.dotted_rect(x - 4, y + 2, w + 8, 50, GOLD)
            self.text(get('Tag')['text'], x + 10, y, 20, CREAM2, h=52)
            self.pip(suit, x + 50, y + 12, 27)
            self.text(get('Name')['text'], x + 88, y - 2, 24, CREAM, h=52, w=116)
            self.text(get('Effect')['text'], x + 204, y, 27, CREAM2, kind='body', h=52)
            for k in range(len(pips)):
                self.pip(suit, x + w + 6 - 18 - (len(pips) - 1 - k) * 17, y + 17, 18)
            if i < len(rows) - 1 or left:
                self.dotted(x + 6, x + w - 6, y + 54, ROOM1)
        if left:
            self.text(left[0]['text'], 48, top + 26 + len(rows) * 58 + 4, 26, SOFT, kind='body', h=30)

        # Your health.
        cells = [b for n, bs in by.items() if n.startswith('Cell') for b in bs]
        mine = [b for b in cells if b['x'] < -500]
        theirs = [b for b in cells if b['x'] > 200]
        gy = top - 8 + hh + 22
        mrows = len(set(R(b)[1] for b in mine))
        mh = max(168, mrows * 34 + 66)
        self.frame(26, gy, 408, mh, caption='YOUR HEALTH')
        mx, my = min(R(b)[0] for b in mine), min(R(b)[1] for b in mine)
        alive = 0
        for b in mine:
            x, y, w, h = R(b)
            state = b.get('cell') or 'alive'
            alive += state in ('alive', 'shield')
            self.paste(st.x2(cell_c(15, state)), 52 + (x - mx) * 34 // 36, gy + 40 + (y - my) * 34 // 36)
        self.text(str(alive), 250, gy + 30, 66, CREAM, align=2, w=90)
        self.text(f'/ {len(mine)}', 348, gy + 62, 34, CREAM2, kind='body')
        self.text('cells left', 250, gy + 110, 28, CREAM2, kind='body')

        # The stash (planning only).
        backs = [b for b in by.get('Back', []) if b['x'] < -500]
        if backs:
            bx, by_, bw, bh = R(backs[0])
            self.frame(26, by_ - 30, 408, bh + 40, caption='STASH')
            stash = [b for b in boxes if (b.get('frame') or '').startswith('cards/') and b['x'] < -560 and b['name'] == 'Art']
            step = min(97, (408 - 44 - 90) // max(1, len(stash) - 1))
            for i, b in enumerate(stash):
                x, y, w, h = R(b)
                self.art(b['frame'], 48 + i * step, y, w, h)

        # The board: the Joker peeks over the top of an open bracket.
        slots = [b for n, bs in by.items() if n.startswith('Slot ') for b in bs]
        badges = [b for n, bs in by.items() if n.startswith(('RowBadge', 'ColBadge')) for b in bs]
        rs = [R(b) for b in slots + badges]
        l, t = min(r[0] for r in rs) - 34, min(r[1] for r in rs) - 34
        r_, bt = max(r[0] + r[2] for r in rs) + 34, max(r[1] + r[3] for r in rs) + 30
        mid = (l + r_) // 2
        mid -= mid % 2
        self.art('anim/joker_true', mid - 90, 6, 180, 252)
        self.paste(self.smoke.crop((mid - 92, t, mid + 92, 262)), mid - 92, t)
        self.frame(l, t, r_ - l, bt - t, caption='YOUR TABLE')
        for b in slots:
            x, y, w, h = R(b)
            self.dotted_rect(x, y, w, h, ROOM1)
        for b in boxes:
            if b['name'] == 'Art' and b['x'] > -560:
                x, y, w, h = R(b)
                self.art(b['frame'], x, y, w, h)
        for b in by.get('InHand', []):
            x, y, w, h = R(b)
            self.dotted_rect(x, y, w, h, GOLD)
        for b in by.get('Selected', []):
            # A card charging to fire: lifted, with a pink dotted ring.
            x, y, w, h = R(b)
            self.dotted_rect(x, y, w, h, RED_HI)
        for i, b in enumerate(badges):
            x, y, w, h = R(b)
            icon = next((c for c in self.kids(b) if (c.get('frame') or '').startswith('ui/icons/suit_')), None)
            lit = (2 + i * 5) % 13 if fight else 12
            m = so.medallion(icon['frame'].split('suit_')[1][0] if icon else None, 'C', lit)
            self.paste(st.x2(m), x + (w - 72) // 2, y + (h - 72) // 2)

        # The right side: the opponent, or the Forge drawer over him.
        ob = by['Opponent'][0]
        ox, oy, ow, oh = R(ob)
        drawer = by.get('ForgeDrawer')
        if drawer:
            self.forge(drawer[0])
        else:
            self.opponent(ob, theirs)

        # Actions under the opponent.
        for b in boxes:
            if b['kind'] != 'button' or b['depth'] != 3 or b['y'] > -300:
                continue
            x, y, w, h = R(b)
            lab = b.get('label') or ''
            kind = 'primary' if b['name'] == 'StartRound' else 'plain'
            if lab in ('Close', 'Medium'):
                kind = 'on'
            self.button(x, y, w, h, lab, kind)
        if took is not None:
            pass
        return l, t, r_, bt

    def opponent(self, ob, theirs):
        by, R = self.by, self.rect
        ox, oy, ow, oh = R(ob)
        boss = by.get('Twist')
        self.frame(ox, oy, ow, oh, caption='ACROSS THE TABLE')
        av = by['Avatar'][0]
        ax, ay, aw, ah = R(av)
        self.art(av['frame'], ax, ay + 10, aw, ah)
        nb = [b for b in by['Name'] if b['x'] > 200][-1]
        x, y, w, h = R(nb)
        self.text(nb['text'], x, y + 10, 34, CREAM, h=h, w=ow - (x - ox) - 30)
        sub = by['Sub'][-1]['text']
        self.text(f'{sub}  ·  {len(theirs)} cells', x, y + 54, 30, CREAM2, kind='body')
        lines = sorted([b for n, bs in by.items() if n.startswith('Line ') for b in bs], key=lambda b: -b['y'])
        ly = ay + ah + 44
        self.text('THEIR HANDS', ox + 30, ly - 6, 18, CREAM2)
        for i, b in enumerate(lines):
            suit = by['Icon ' + b['name'][5:]][0]['frame'][-1]
            parts = b['text'].split(' · ')
            yy = ly + 26 + i * 50
            if i == 0 and getattr(self, 'their_firing', False):
                self.dotted_rect(ox + 22, yy, ow - 44, 46, GOLD)
            self.pip(suit, ox + 30, yy + 4, 36)
            self.text(parts[0], ox + 80, yy, 28, CREAM, h=44)
            self.text(parts[1], ox + 290, yy, 32, CREAM2, kind='body', h=44)
            self.text(parts[2], ox + ow - 30 - 200, yy, 32, CREAM2, kind='body', align=2, w=200, h=44)
            self.dotted(ox + 30, ox + ow - 30, yy + 46, ROOM1)
        hy2 = ly + 26 + len(lines) * 50 + 40
        self.text('THEIR HEALTH', ox + 30, hy2, 18, CREAM2)
        tx0, ty0 = min(R(b)[0] for b in theirs), min(R(b)[1] for b in theirs)
        alive = 0
        for b in theirs:
            x, y, w, h = R(b)
            state = b.get('cell') or 'alive'
            alive += state in ('alive', 'shield')
            self.paste(st.x2(cell_c(21, state)), ox + 30 + (x - tx0), hy2 + 36 + (y - ty0))
        self.text(str(alive), ox + ow - 200, hy2 + 60, 88, CREAM, align=2, w=110)
        self.text(f'/ {len(theirs)}', ox + ow - 82, hy2 + 104, 34, CREAM2, kind='body')
        self.their_grid = (ox + 30, hy2 + 36)

    def forge(self, dr):
        R = self.rect
        x, y, w, h = R(dr)
        self.frame(x, y, w, h, caption='THE FORGE')
        boxes = self.d['boxes']
        i = next(k for k, b in enumerate(boxes) if b is dr)
        kids = []
        for b in boxes[i + 1:]:
            if b['depth'] <= dr['depth']:
                break
            kids.append(b)
        for b in kids:
            if b['name'] in ('Panel', 'Forge') or b.get('text') == 'THE FORGE':
                self.eat(b)
            elif b['name'] in ('CardA', 'CardB'):
                bx, by_, bw, bh = R(b)
                self.art(b['frame'], bx - bw // 4, by_ - bh // 4 - 40, bw * 3 // 2, bh * 3 // 2)
                self.eat(b)
            elif b['name'] == 'Plus':
                bx, by_, bw, bh = R(b)
                self.text('+', bx - 10, by_ - 40, 66, CREAM, align=1, w=bw + 20, h=bh)
                self.eat(b)
        for b in kids:
            self.element(b)
        self.dotted(x + 30, x + w - 30, y + h - 128, ROOM1)

    # ---- the tutorial overlay --------------------------------------------------------------------
    def tutorial(self):
        boxes = self.d['boxes']
        i = [b['name'] for b in boxes].index('Tutorial')
        over = boxes[i + 1:]
        spot = next(b for b in over if b['name'] == 'Spotlight')
        sx, sy, sw, sh = self.rect(spot)
        dark = Image.blend(self.img.convert('RGB'), Image.new('RGB', self.img.size, ROOM0[:3]), 0.66).convert('RGBA')
        mask = Image.new('L', self.img.size, 255)
        ImageDraw.Draw(mask).ellipse([sx, sy, sx + sw, sy + sh], fill=0)
        self.img = Image.composite(dark, self.img, mask)
        self.dotted_ring(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, GOLD, n=160, s=4)
        dl = next(b for b in over if b['name'] == 'Dealer')
        x, y, w, h = self.rect(dl)
        self.frame(x, y, w, h, closed=True, fill=ROOM0)
        self.text('THE DEALER', x + 24, y - 6, 18, CREAM)
        for b in over:
            if b['name'] in ('Spotlight', 'Dim', 'Outline', 'Dealer', 'Body', 'Back', 'Tutorial') or id(b) in self.done:
                continue
            if b['name'] == 'Name' and b.get('text') == 'The Dealer':
                self.eat(b)
                continue
            if b['name'] == 'Text':
                self.label(b, col=CREAM, size=30, kind='body')
                continue
            self.element(b)

    # ---- a fight caught mid-throw ---------------------------------------------------------------
    def shot(self):
        R = self.rect
        cards = [R(b) for b in self.d['boxes'] if b['name'] == 'Art' and -560 < b['x'] < 200]
        gx, gy = self.their_grid
        sx, sy = cards[14][0] + 60, cards[14][1] + 60
        tx, ty = gx + 130, gy + 30
        cx, cy = (sx + tx) / 2, min(sy, ty) - 40
        d = ImageDraw.Draw(self.img)
        pts = []
        for k in range(0, 17):
            tt = k / 18.5
            u = 1 - tt
            pts.append((u * u * sx + 2 * u * tt * cx + tt * tt * tx, u * u * sy + 2 * u * tt * cy + tt * tt * ty))
        for (x, y) in pts[:-1:2]:
            x, y = int(x) - int(x) % 2, int(y) - int(y) % 2
            d.rectangle([x - 4, y - 4, x + 3, y + 3], fill=PURPLE)
        x, y = pts[-1]
        blade = st.x2(st.canvas(17, 4, CREAM)).rotate(-24, expand=True, resample=Image.NEAREST)
        self.paste(blade, int(x - blade.width / 2), int(y - blade.height / 2))
        # The last hit's number, with its suit, rising off their cells.
        f = font('head', 62)
        nx, ny = gx + 330, gy - 30
        dd = ImageDraw.Draw(self.img)
        dd.fontmode = '1'
        dd.text((nx + 4, ny + 4), '-3', font=f, fill=INK)
        dd.text((nx, ny), '-3', font=f, fill=GOLD)
        self.pip('S', nx - 46, ny + 14, 36)

    # ---- every other screen: frames by name, everything else as it is --------------------------
    OPEN = {'Tab': 'THE TAB', 'Stats': 'THE RUN', 'Twist': None, 'Ace': 'CLOSEST ACE', 'Panel': 'HIS TABLE'}
    CLOSED = ('Plaque', 'RoundPlaque', 'NamePlaque', 'ScorePanel', 'TotalBox', 'Counter')

    def generic(self, took=None):
        R = self.rect
        boxes = self.d['boxes']
        if 'Round' in self.by and 'JokerSpot' in self.by:
            self.strip()
            # The Joker over the top of the screen, as at the table.
            self.art('anim/joker_true', 870, 6, 180, 252)
            self.paste(self.smoke.crop((868, 104, 1052, 262)), 868, 104)
        for b in boxes:
            if id(b) in self.done:
                continue
            n = b['name']
            x, y, w, h = R(b)
            if n in self.CLOSED:
                self.frame(x, y, w, h, closed=True)
                self.eat(b)
            elif n in self.OPEN:
                cap = self.OPEN[n]
                self.frame(x, y, w, h, caption=cap)
                if n == 'Panel':
                    self.eat(*[k for k in self.kids(b) if k.get('text') == 'HIS TABLE'])
                self.eat(b)
            elif n.startswith('Ace ') and b['kind'] == 'node':
                self.frame(x, y, w, h)
                self.eat(b)
            elif n.startswith('Reward '):
                on = took is not None
                sel = on and n == 'Reward cards'
                self.frame(x, y, w, h, closed=True, col=CREAM if on else SOFT, fill=CREAM if sel else None)
                for k in self.kids(b):
                    if k['kind'] == 'label':
                        self.label(k, col=(INK if sel else (CREAM if on else SOFT)))
                    elif k['name'] == 'Back':
                        self.eat(k)
                self.eat(b)
            elif n == 'Glow':
                self.dotted_ring(x + w / 2, y + h / 2, w / 2 + 30, h / 2 + 10, hexc(b.get('fill') or '#8e478c'), n=56, s=6)
                self.eat(b)
            elif n.startswith('Tier'):
                lit = b.get('fill')
                self.frame(x, y, w, h, closed=True, col=CREAM, fill=hexc(lit) if lit else None)
                self.eat(b)
            elif n == 'Dashes' or n == 'Dash':
                if n == 'Dashes':
                    self.dotted(x, x + w, y, ROOM1)
                self.eat(b)
            elif n.startswith('Cell'):
                self.paste(st.x2(cell_c(max(8, (w + 1) // 2), b.get('cell') or 'alive')), x, y)
                self.eat(b)
            elif n == 'Track':
                self.frame(x, y - 2, w, 16, closed=True, col=SOFT)
                self.eat(b)
            elif n == 'Selected' or n == 'InHand':
                self.dotted_rect(x, y, w, h, GOLD)
                self.eat(b)
            else:
                self.element(b)
        return self.img


def title(smoke, out):
    m = Mock(None, smoke)
    # The deck fanned on the table, the name under it; tokens on the right.
    m.frame(80, 110, 800, 740, caption='HANDS OF FATE')
    hand = ['anim/S_13', 'anim/H_12', 'anim/joker_true', 'anim/C_11', 'anim/D_14']
    lifts = [28, 12, 0, 12, 28]
    for k in range(5):
        m.art(hand[k], 140 + k * 125, 170 + lifts[k], 180, 252)
    for k in range(5):
        if k in (0, 4):
            pass
    m.text('HANDS OF FATE', 120, 540, 88, CREAM, align=1, w=720, h=90)
    m.text('Build poker hands. They fight for you.', 120, 640, 40, RED, kind='body', align=1, w=720, h=40)
    m.dotted(160, 800, 712, ROOM1)
    m.text('Endless  ·  Four Kings  ·  Four Aces', 120, 730, 34, CREAM2, kind='body', align=1, w=720, h=40)
    names = ['Continue', 'New Run', 'How to play', 'Aces', 'Options', 'Quit']
    for k, n in enumerate(names):
        m.button(1087, 120 + k * 117, 666, 100, n, 'primary' if n == 'New Run' else 'plain', size=40)
    m.frame(1087, 853, 666, 92, closed=True)
    m.text('BEST', 1111, 853, 22, CREAM2, h=92)
    m.text('ROUND 23  ·  84,210', 1111, 851, 44, GOLD, align=2, w=618, h=92)
    m.text('Card art: Pixel Plebes by Greebles (Devlyn JD)', 0, 1030, 30, SOFT, kind='body', align=1, w=W, h=30)
    m.img.convert('RGB').save(out)


def main():
    smoke_dir, lay, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    felt = os.path.join(smoke_dir, 'smoke_felt.png')
    title(felt, os.path.join(out, '01_title.png'))

    m = Mock(os.path.join(lay, 's3.json'), felt)
    m.table()
    m.img.convert('RGB').save(os.path.join(out, '02_planning.png'))

    m = Mock(os.path.join(lay, 'c3.json'), felt)
    m.table()
    m.img.convert('RGB').save(os.path.join(out, '03_forge_drawer.png'))

    m = Mock(os.path.join(lay, 'm4.json'), felt)
    m.their_firing = False
    m.table(fight=True)
    m.shot()
    m.img.convert('RGB').save(os.path.join(out, '04_fight.png'))

    m = Mock(os.path.join(lay, 'm5.json'), felt)
    # Step 1 done: the K of Spades taken, so step 2 is open.
    for b in m.by.get('Step2', []):
        b['color'] = '#ecece0'
    for b in m.by.get('Step1Note', []):
        b['text'] = 'Taking the Jack of Spades: it goes to your stash.'
        b['color'] = '#fdd164'
    arts = [b for b in m.d['boxes'] if b['name'] == 'Art' and b['y'] > 0]
    if len(arts) > 2:
        b = arts[2]
        m.d['boxes'].append({'name': 'Selected', 'kind': 'sprite', 'x': b['x'] - 6, 'y': b['y'] - 6, 'w': b['w'] + 12,
                             'h': b['h'] + 12, 'depth': 9})
    m.generic(took=True)
    m.img.convert('RGB').save(os.path.join(out, '05_round_won.png'))

    for name, file, smoke in (('06_boss_intro', 'm6', 'smoke_spades.png'), ('07_run_over', 'm7', 'smoke_lost.png'),
                              ('08_aces', 'm8', 'smoke_felt.png'), ('09_options', 'm9', 'smoke_felt.png')):
        m = Mock(os.path.join(lay, file + '.json'), os.path.join(smoke_dir, smoke))
        if file == 'm9':
            for b in m.d['boxes']:
                if b['kind'] == 'button' and b.get('label') == 'Medium':
                    m.btn(b, 'on')
        if file == 'm7':
            for b in m.by.get('NewRun', []):
                m.btn(b, 'primary')
        m.generic()
        m.img.convert('RGB').save(os.path.join(out, name + '.png'))

    m = Mock(os.path.join(lay, 'm10.json'), felt)
    m.table()
    m.tutorial()
    m.img.convert('RGB').save(os.path.join(out, '10_tutorial.png'))

    files = sorted(f for f in os.listdir(out) if f[:2].isdigit())
    sheet = Image.new('RGB', (960 * 2 + 16, (540 + 16) * 5 - 16), ROOM0[:3])
    for k, f in enumerate(files):
        sheet.paste(Image.open(os.path.join(out, f)).resize((960, 540), Image.NEAREST), ((k % 2) * 976, (k // 2) * 556))
    sheet.save(os.path.join(out, 'mockups_sheet.png'))
    print('wrote', len(files), 'mockups to', out)


if __name__ == '__main__':
    main()
