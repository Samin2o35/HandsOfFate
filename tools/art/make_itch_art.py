"""Hands of Fate — tools/art/make_itch_art.py

Makes the itch.io page images from the game's own art (run from the project root):

    python tools/art/make_itch_art.py            -> build/itch/

  cover.png / cover.gif   630x500   store cover (the GIF animates the five cards on hover)
  banner.png              960x300   page header
  embed_bg.png            450x800   portrait embed (before landscape; kept for reference)
  embed_bg_landscape.png  960x540   behind itch's "Run game" button, landscape embed (centre clear)
  embed_bg_landscape@2x   1920x1080 the same, doubled, for a 1920x1080 embed

Pixel Plebes terms: the cards are placed upright, whole, at exact scales (the 4x art
halved to 2x), never rotated, recoloured or redrawn. Everything is composed at half
size, then doubled with nearest-neighbour so every pixel stays square.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
RES = os.path.join(ROOT, 'assets', 'resources')
FONTS = os.path.join(ROOT, 'assets', 'fonts')
OUT = os.path.join(ROOT, 'build', 'itch')

BG = (26, 21, 36)
GLOW1 = (33, 27, 45)
GLOW2 = (40, 33, 55)
SHADOW = (14, 11, 20)
INK = (59, 50, 74)
CREAM = (236, 236, 224)
LILAC = (154, 144, 176)
GOLD = (233, 196, 106)

# The hand on the cover: K of Spades, Q of Hearts, A of Hearts (front), J of Clubs, Joker.
HAND = ['anim/S_13', 'anim/H_12', 'anim/H_14', 'anim/C_11', 'anim/joker_true']
FRAMES = 8          # every animated strip has 8 frames
FPS = 8             # same as AnimatedCard in the game


def card(strip, frame=0):
    """One frame of an animated card at 1x (90x126): the 4x strip cut and quartered exactly."""
    im = Image.open(os.path.join(RES, strip + '.png')).convert('RGBA')
    return im.crop((frame * 360, 0, frame * 360 + 360, 504)).resize((90, 126), Image.NEAREST)


def icon(suit):
    return Image.open(os.path.join(RES, 'ui', 'icons', f'suit_{suit}.png')).convert('RGBA')


def text_img(fontfile, size, text, color):
    """Aliased (hard-edged) text on a transparent layer, trimmed to its pixels."""
    f = ImageFont.truetype(os.path.join(FONTS, fontfile), size)
    l, t, r, b = f.getbbox(text)
    im = Image.new('RGBA', (r - l + 4, b - t + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    d.text((2 - l, 2 - t), text, font=f, fill=color)
    return im.crop(im.getbbox())


def glow(canvas, cx, cy, rx, ry):
    d = ImageDraw.Draw(canvas)
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=GLOW1)
    d.ellipse((cx - rx * 0.7, cy - ry * 0.7, cx + rx * 0.7, cy + ry * 0.7), fill=GLOW2)


def place_hand(canvas, frame, x0, top, step, lift, order=(0, 4, 1, 3, 2), strips=HAND):
    """Five upright cards in a gentle arc (outer cards lower); the middle one in front."""
    for i in order:
        x, y = x0 + i * step, top + lift[i]
        canvas.alpha_composite(Image.new('RGBA', (90, 126), SHADOW + (255,)), (x + 3, y + 3))
        canvas.alpha_composite(card(strips[i], frame), (x, y))


def plaque(canvas, x, y, w, h):
    """The logo plaque from the title screen: shadow, ink border, cream, inner ink line."""
    d = ImageDraw.Draw(canvas)
    d.rectangle((x + 3, y + 3, x + w + 2, y + h + 2), fill=SHADOW)
    d.rectangle((x, y, x + w - 1, y + h - 1), fill=INK)
    d.rectangle((x + 2, y + 2, x + w - 3, y + h - 3), fill=CREAM)
    d.rectangle((x + 4, y + 4, x + w - 5, y + h - 5), outline=INK)
    # cut corners, like the UI kit
    for cx, cy in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)):
        d.point((cx, cy), fill=BG)


def title_row(canvas, cx, y):
    """Spade pip, HANDS OF FATE, heart pip, centred on cx (half-size pixels)."""
    title = text_img('PixelifySans-SemiBold.ttf', 22, 'HANDS OF FATE', INK)
    s, hrt = icon('S'), icon('H')
    gap = 6
    w = s.width + gap + title.width + gap + hrt.width
    x = cx - w // 2
    canvas.alpha_composite(s, (x, y + (title.height - s.height) // 2))
    canvas.alpha_composite(title, (x + s.width + gap, y))
    canvas.alpha_composite(hrt, (x + s.width + gap + title.width + gap, y + (title.height - hrt.height) // 2))
    return title.height


def double(im):
    return im.resize((im.width * 2, im.height * 2), Image.NEAREST)


def tagline(final, cx, y, color=INK, text='Build poker hands. They fight for you.'):
    """The small line is drawn at full size (VT323 is crisp at 20 px)."""
    t = text_img('VT323-Regular.ttf', 20, text, color)
    final.alpha_composite(t, (cx - t.width // 2, y))


# ---- Cover 630x500 ------------------------------------------------------------------

def cover(frame):
    c = Image.new('RGBA', (315, 250), BG + (255,))
    glow(c, 157, 86, 125, 92)
    place_hand(c, frame, x0=22, top=12, step=45, lift=[14, 6, 0, 6, 14])
    px, py, pw, ph = 30, 156, 255, 62
    plaque(c, px, py, pw, ph)
    title_row(c, 157, py + 12)
    # suit pips row under the plaque
    pips = [icon(s) for s in 'SHCD']
    x = 157 - (4 * 18 + 3 * 10) // 2
    for i, p in enumerate(pips):
        c.alpha_composite(p, (x + i * 28, 228))
    final = double(c)
    tagline(final, 315, (py + 40) * 2 + 2)
    return final


# ---- Banner 960x300 -----------------------------------------------------------------

def banner():
    c = Image.new('RGBA', (480, 150), BG + (255,))
    glow(c, 240, 75, 235, 70)
    # two cards each side, plaque in the middle
    for x, y, strip in ((6, 18, 'anim/S_13'), (36, 8, 'anim/H_12')):
        c.alpha_composite(Image.new('RGBA', (90, 126), SHADOW + (255,)), (x + 3, y + 3))
        c.alpha_composite(card(strip), (x, y))
    for x, y, strip in ((384, 18, 'anim/joker_true'), (354, 8, 'anim/C_11')):
        c.alpha_composite(Image.new('RGBA', (90, 126), SHADOW + (255,)), (x + 3, y + 3))
        c.alpha_composite(card(strip), (x, y))
    pw, ph = 216, 62
    px, py = 240 - pw // 2, 44
    plaque(c, px, py, pw, ph)
    title_row(c, 240, py + 12)
    final = double(c)
    tagline(final, 480, (py + 40) * 2 + 2)
    return final


# ---- Embed background 450x800 ---------------------------------------------------------

def embed_bg():
    c = Image.new('RGBA', (225, 400), BG + (255,))
    glow(c, 112, 95, 110, 70)
    place_hand(c, 0, x0=7, top=34, step=30, lift=[12, 5, 0, 5, 12])
    # middle (about y 170-250) left clear for itch's Run game button
    pw, ph = 211, 62
    px, py = 7, 290
    plaque(c, px, py, pw, ph)
    title_row(c, 112, py + 12)
    final = double(c)
    tagline(final, 225, (py + 40) * 2 + 2)
    credit = text_img('VT323-Regular.ttf', 20, 'Card art: Pixel Plebes by Greebles (Devlyn JD)', LILAC)
    final.alpha_composite(credit, (225 - credit.width // 2, 760))
    return final


# ---- Embed background 960x540 (landscape) ----------------------------------------------

def embed_bg_landscape():
    c = Image.new('RGBA', (480, 270), BG + (255,))
    glow(c, 240, 135, 230, 120)
    # Title plaque, top centre.
    pw, ph = 216, 62
    px, py = 240 - pw // 2, 18
    plaque(c, px, py, pw, ph)
    title_row(c, 240, py + 12)
    # Two cards each side, low; the middle (about y 105-185) stays clear for Run game.
    for x, y, strip in ((22, 128, 'anim/S_13'), (58, 116, 'anim/H_12')):
        c.alpha_composite(Image.new('RGBA', (90, 126), SHADOW + (255,)), (x + 3, y + 3))
        c.alpha_composite(card(strip), (x, y))
    for x, y, strip in ((368, 128, 'anim/joker_true'), (332, 116, 'anim/C_11')):
        c.alpha_composite(Image.new('RGBA', (90, 126), SHADOW + (255,)), (x + 3, y + 3))
        c.alpha_composite(card(strip), (x, y))
    # Suit pips under the button area.
    pips = [icon(s) for s in 'SHCD']
    x = 240 - (4 * 18 + 3 * 10) // 2
    for i, p in enumerate(pips):
        c.alpha_composite(p, (x + i * 28, 214))
    final = double(c)
    tagline(final, 480, (py + 40) * 2 + 2)
    credit = text_img('VT323-Regular.ttf', 20, 'Card art: Pixel Plebes by Greebles (Devlyn JD)', LILAC)
    final.alpha_composite(credit, (480 - credit.width // 2, 540 - 34))
    return final


def main():
    os.makedirs(OUT, exist_ok=True)
    frames = [cover(f) for f in range(FRAMES)]
    frames[0].convert('RGB').save(os.path.join(OUT, 'cover.png'))
    # GIF: same palette for all frames so nothing flickers
    pal = frames[0].convert('RGB').quantize(colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    gif = [f.convert('RGB').quantize(palette=pal, dither=Image.NONE) for f in frames]
    gif[0].save(os.path.join(OUT, 'cover.gif'), save_all=True, append_images=gif[1:],
                duration=int(1000 / FPS), loop=0, optimize=False, disposal=1)
    banner().convert('RGB').save(os.path.join(OUT, 'banner.png'))
    embed_bg().convert('RGB').save(os.path.join(OUT, 'embed_bg.png'))
    land = embed_bg_landscape().convert('RGB')
    land.save(os.path.join(OUT, 'embed_bg_landscape.png'))
    double(land).save(os.path.join(OUT, 'embed_bg_landscape@2x.png'))
    for n in ('cover.png', 'cover.gif', 'banner.png', 'embed_bg.png', 'embed_bg_landscape.png', 'embed_bg_landscape@2x.png'):
        p = os.path.join(OUT, n)
        print(f'{n:13s} {Image.open(p).size}  {os.path.getsize(p) // 1024} KB')


if __name__ == '__main__':
    main()
