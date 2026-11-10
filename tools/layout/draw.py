# Hands of Fate — tools/layout/draw.py: turns render.ts JSON into a PNG of boxes and text.
import json, sys
from PIL import Image, ImageDraw, ImageFont
d = json.load(open(sys.argv[1])); out = sys.argv[2]
W, H = d['W'], d['H']; s = 0.5
img = Image.new('RGB', (int(W*s), int(H*s)), '#16121C'); g = ImageDraw.Draw(img)
def font(px):
    try: return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', max(8, int(px)))
    except Exception: return ImageFont.load_default()
col = {'sprite': '#5a4a6a', 'button': '#c0392b', 'node': '#33404a', 'label': '#e8d9b0'}
def tr(b): return (b['x'] + W/2)*s, (H/2 - b['y'] - b['h'])*s, (b['x'] + b['w'] + W/2)*s, (H/2 - b['y'])*s
for b in d['boxes']:
    if b['kind'] == 'label': continue
    x0, y0, x1, y1 = tr(b)
    if b['w'] <= 0 or b['h'] <= 0: continue
    if b['depth'] <= 1: continue
    g.rectangle([x0, y0, x1, y1], outline=col[b['kind']], width=2 if b['kind']=='button' else 1)
def wrap(t, f, maxw):
    lines, cur = [], ''
    for word in t.split(' '):
        nxt = (cur + ' ' + word).strip()
        if g.textlength(nxt, font=f) <= maxw or not cur: cur = nxt
        else: lines.append(cur); cur = word
    lines.append(cur); return lines
warn = []
for b in d['boxes']:
    if b['kind'] != 'label' or not b['text']: continue
    x0, y0, x1, y1 = tr(b)
    px = b['size']*s*0.8; f = font(px); t = b['text']
    bw = x1 - x0
    if b['overflow'] == 2:  # SHRINK: scale down to fit the box
        while px > 6 and max(g.textlength(l, font=f) for l in wrap(t, f, bw)) * 0 + len(wrap(t, f, bw)) * px * 1.15 > (y1 - y0) + 1:
            px -= 1; f = font(px)
        if px < b['size']*s*0.8*0.7: warn.append(f"shrunk hard: {b['name']} '{t[:30]}'")
    lines = wrap(t, f, bw) if b['overflow'] in (2, 3) else [t]
    lh = px * 1.15; cy = (y0+y1)/2 - lh*len(lines)/2
    if b['overflow'] == 3 and lh*len(lines) > (y1-y0) + 2: warn.append(f"label taller than box: {b['name']}")
    for i, l in enumerate(lines):
        tw = g.textlength(l, font=f)
        g.text(((x0+x1)/2 - tw/2, cy + i*lh), l, fill='#e8d9b0', font=f)
        if b['overflow'] == 0 and (((x0+x1)/2 - tw/2) < 0 or ((x0+x1)/2 + tw/2) > W*s): warn.append(f"off screen: {b['name']} '{l[:30]}'")
for w in warn: print('  WARN', w)
# safe frame guides: 16:9 centre region
g.rectangle([0, 0, W*s-1, H*s-1], outline='#888', width=1)
img.save(out)
