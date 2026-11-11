"""Hands of Fate — tools/art/artbase.py (Stage B, decision 143)

The shared bits of the art tools: paths, the palette, and small helpers. They used to live
in make_style_sample.py (the felt look) and make_itch_art.py (the portrait itch page),
both removed with the felt era. Used by make_style_options.py (the open-table pieces),
make_mockups_c.py and make_itch_art_c.py.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
RES = os.path.join(ROOT, 'assets', 'resources')
FONTS = os.path.join(ROOT, 'assets', 'fonts')


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
CLEAR = (0, 0, 0, 0)

SUIT = {'S': PURPLE, 'H': RED, 'C': GREEN, 'D': BLUE}

FRAMES = 8          # every animated strip has 8 frames
FPS = 8             # same as AnimatedCard in the game


def canvas(w, h, fill=CLEAR):
    return Image.new('RGBA', (w, h), fill)


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


def pip(suit):
    return Image.open(os.path.join(RES, 'ui', 'icons', f'suit_{suit}.png')).convert('RGBA')


def card(strip, frame=0):
    """One frame of an animated card at 1x (90x126): the 4x strip cut and quartered exactly."""
    im = Image.open(os.path.join(RES, strip + '.png')).convert('RGBA')
    return im.crop((frame * 360, 0, frame * 360 + 360, 504)).resize((90, 126), Image.NEAREST)
