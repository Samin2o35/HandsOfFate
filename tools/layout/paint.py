"""Hands of Fate — tools/layout/paint.py

Paints what a screen's code actually builds, from tools/layout/render.ts output:
the open-table pieces from their generated pixels (ui/kitC.ts), the card and
icon art from assets/resources, and every label in its font, size, colour and
alignment, over a smoke frame. Close to what Cocos shows, for checking the code
against the signed-off mockups without the editor.

    python tools/layout/paint.py <layout.json> <smoke.png> <out.png>
"""
import base64
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
RES = os.path.join(ROOT, 'assets', 'resources')
FONTS = os.path.join(ROOT, 'assets', 'fonts')


def font(kind, size):
    f = 'VT323-Regular.ttf' if kind == 'body' else 'PixelifySans-SemiBold.ttf'
    return ImageFont.truetype(os.path.join(FONTS, f), max(6, int(round(size))))


def nine(im, w, h, k):
    """9-slice im (inset k on every side) to w x h."""
    W, H = im.size
    out = Image.new('RGBA', (w, h))
    xs = [(0, k, 0, k), (k, W - k, k, w - k), (W - k, W, w - k, w)]
    ys = [(0, k, 0, k), (k, H - k, k, h - k), (H - k, H, h - k, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            if dx1 <= dx0 or dy1 <= dy0:
                continue
            out.paste(im.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.NEAREST), (dx0, dy0))
    return out


def tinted(im, rgb):
    r, g, b = [c / 255 for c in rgb]
    px = im.load()
    out = im.copy()
    op = out.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3]:
                op[x, y] = (int(p[0] * r), int(p[1] * g), int(p[2] * b), p[3])
    return out


def main():
    d = json.load(open(sys.argv[1]))
    W, H = int(d['W']), int(d['H'])
    img = Image.open(sys.argv[2]).convert('RGBA').resize((W, H), Image.NEAREST)
    frames = {}
    for k, f in d.get('frames', {}).items():
        frames[k] = (Image.frombytes('RGBA', (f['w'], f['h']), base64.b64decode(f['data'])), f['slice'])
    cache = {}

    def rect(b):
        return int(round(b['x'] + W / 2)), int(round(H / 2 - b['y'] - b['h'])), int(round(b['w'])), int(round(b['h']))

    def put(im, x, y, clip):
        if clip:
            cx, cy, cw, ch = rect(clip)
            layer = Image.new('RGBA', img.size)
            layer.alpha_composite(im, (x, y)) if 0 <= x and 0 <= y else layer.paste(im, (x, y), im)
            mask = Image.new('L', img.size, 0)
            ImageDraw.Draw(mask).rectangle([cx, cy, cx + cw - 1, cy + ch - 1], fill=255)
            layer.putalpha(Image.composite(layer.getchannel('A'), Image.new('L', img.size, 0), mask))
            img.alpha_composite(layer)
        else:
            tmp = Image.new('RGBA', img.size)
            tmp.paste(im, (x, y), im)
            img.alpha_composite(tmp)

    for b in d['boxes']:
        x, y, w, h = rect(b)
        if w <= 0 or h <= 0:
            continue
        fr = b.get('frame') or ''
        if b['kind'] == 'label':
            s = (b.get('text') or '').replace('\n', ' ')
            if not s:
                continue
            size = b.get('size') or 30
            f = font(b.get('font'), size)
            col = b.get('color') or '#ecece0'
            dr = ImageDraw.Draw(img)
            dr.fontmode = '1'
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
                lh = size * 1.15
                ty = y + (h - lh * len(lines)) / 2
                for k, ln in enumerate(lines):
                    l, t, r, bt = f.getbbox(ln)
                    al = b.get('align', 1)
                    tx = x - l if al == 0 else (x + w - (r - l) - l if al == 2 else x + (w - (r - l)) / 2 - l)
                    dr.text((tx, ty + k * lh + (lh - (bt - t)) / 2 - t), ln, font=f, fill=col)
                continue
            if b.get('overflow') == 2:
                while f.getlength(s) > w and size > 8:
                    size -= 1
                    f = font(b.get('font'), size)
            l, t, r, bt = f.getbbox(s)
            al = b.get('align', 1)
            tx = x - l if al == 0 else (x + w - (r - l) - l if al == 2 else x + (w - (r - l)) / 2 - l)
            ty = y + (h - (bt - t)) / 2 - t
            dr.text((tx, ty), s, font=f, fill=col)
            continue
        im = None
        if fr.startswith('kitC:') and fr in frames:
            src, sl = frames[fr]
            im = nine(src, w, h, sl) if sl else src.resize((w, h), Image.NEAREST)
        elif fr and not fr.startswith('kitC:'):
            p = os.path.join(RES, fr + '.png')
            if os.path.exists(p):
                key = (fr, w, h)
                if key not in cache:
                    a = Image.open(p).convert('RGBA')
                    if fr.startswith('anim/'):
                        a = a.crop((0, 0, 360, 504))
                    cache[key] = a.resize((w, h), Image.NEAREST)
                im = cache[key]
        elif b.get('fill') and b['kind'] != 'label':
            a = b.get('alpha')
            a = 255 if a is None else a
            hx = b['fill'].lstrip('#')
            im = Image.new('RGBA', (w, h), (int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16), a))
        if im is None:
            continue
        if b.get('tint'):
            im = tinted(im, b['tint'])
        put(im, x, y, b.get('clip'))
    img.convert('RGB').save(sys.argv[3])


if __name__ == '__main__':
    main()
