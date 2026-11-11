"""Hands of Fate - tools/art/make_itch_art_c.py

The itch.io page images in the open-table style (phase 8), made from the game's own
art and the same frame rails as the mockups (make_mockups_c.py):

    python3 tools/art/make_itch_art_c.py          -> build/itch_c/

  cover.png / cover.gif     630x500    store cover (the GIF plays the cards' own animation)
  banner.png                960x300    page header
  embed_bg.png              960x540    behind itch's "Run game" button (middle kept clear)
  screenshots/*.png         1920x1080  the screens as drawn from the game's layout code

Pixel Plebes terms: cards are placed whole and upright at exact scales (the 4x art
quartered to 1x, or halved to 2x), never rotated, recoloured or redrawn.
"""
import os
import shutil
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_mockups_c as mc            # noqa: E402  Mock: frame, text, dotted, art
import artbase as old                  # noqa: E402  card(strip, frame) at 1x

OUT = os.path.join(os.getcwd(), 'build', 'itch_c')
SMOKE = os.path.join(os.getcwd(), 'build', 'style', 'smoke_felt.png')
HAND = ['anim/S_13', 'anim/H_12', 'anim/joker_true', 'anim/C_11', 'anim/D_14']
LIFTS = [14, 6, 0, 6, 14]


class Sheet(mc.Mock):
    """A Mock on a canvas of any size, its smoke cut from the game's smoke (6 px blocks kept whole)."""

    def __init__(self, w, h, ox=600, oy=300):
        smoke = Image.open(SMOKE).convert('RGBA').resize((mc.W, mc.H), Image.NEAREST)
        ox, oy = ox - ox % 6, oy - oy % 6
        self.smoke = smoke.crop((ox, oy, ox + w, oy + h))
        self.img = self.smoke.copy()
        self.d, self.by, self.done = {'boxes': []}, {}, set()

    def card1x(self, strip, x, y, frame=0):
        self.paste(old.card(strip, frame), x, y)


def fan(s, x0, top, step, frame=0):
    """The title's hand at 1x: K♠ Q♥ Joker J♣ A♦, the outer cards lower, the Joker in front."""
    for k in (0, 4, 1, 3, 2):
        s.card1x(HAND[k], x0 + k * step, top + LIFTS[k], frame)


def name_block(s, cx, y, w, big=60, small=30, modes=True):
    s.text('HANDS OF FATE', cx - w // 2, y, big, mc.CREAM, align=1, w=w, h=big + 4)
    s.text('Build poker hands. They fight for you.', cx - w // 2, y + big + 14, small, mc.RED, kind='body', align=1, w=w, h=small)
    if modes:
        s.dotted(cx - w // 2 + 40, cx + w // 2 - 40, y + big + small + 34, mc.ROOM1)
        s.text('Endless  ·  Four Kings  ·  Four Aces', cx - w // 2, y + big + small + 48, small - 4, mc.CREAM2, kind='body', align=1, w=w, h=small)


def cover(frame=0):
    s = Sheet(630, 500)
    s.frame(20, 30, 590, 446, caption='THE JOKER\'S TABLE')
    fan(s, 78, 74, 96, frame)
    name_block(s, 315, 238, 560)
    s.text('Card art: Pixel Plebes by Greebles (Devlyn JD)', 0, 448, 22, mc.SOFT, kind='body', align=1, w=630, h=22)
    return s.img


def banner():
    s = Sheet(960, 300, 300, 420)
    s.frame(20, 26, 920, 252)
    for x, y, strip in ((48, 92, 'anim/S_13'), (118, 74, 'anim/H_12')):
        s.card1x(strip, x, y)
    for x, y, strip in ((822, 92, 'anim/D_14'), (752, 74, 'anim/C_11')):
        s.card1x(strip, x, y)
    s.card1x('anim/joker_true', 435, 38)
    name_block(s, 480, 172, 520, big=52, small=26, modes=False)
    return s.img


def embed_bg():
    s = Sheet(960, 540, 480, 240)
    # The name at the top, the hand low; the middle (about y 200-340) stays clear for "Run game".
    name_block(s, 480, 40, 700, big=60, small=30, modes=False)
    s.frame(40, 336, 880, 172, caption='THE JOKER\'S TABLE')
    fan(s, 250, 352, 96)
    s.text('Card art: Pixel Plebes by Greebles (Devlyn JD)', 0, 514, 22, mc.SOFT, kind='body', align=1, w=960, h=22)
    return s.img


def main():
    os.makedirs(os.path.join(OUT, 'screenshots'), exist_ok=True)
    frames = [cover(f).convert('RGB') for f in range(old.FRAMES)]
    frames[0].save(os.path.join(OUT, 'cover.png'))
    pal = [f.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    pal[0].save(os.path.join(OUT, 'cover.gif'), save_all=True, append_images=pal[1:], duration=1000 // old.FPS, loop=0, disposal=1)
    banner().convert('RGB').save(os.path.join(OUT, 'banner.png'))
    embed_bg().convert('RGB').save(os.path.join(OUT, 'embed_bg.png'))
    shots = [('build/p5b/Title.png', '1_title'), ('build/p5/plan.png', '2_planning'), ('build/p5/fight.png', '3_fight'),
             ('build/p5/forge.png', '4_forge'), ('build/p5/won.png', '5_round_won'), ('build/p5b/BossIntro.png', '6_king')]
    for src, name in shots:
        if os.path.exists(src):
            shutil.copy(src, os.path.join(OUT, 'screenshots', name + '.png'))
    print('written to', OUT)


if __name__ == '__main__':
    main()
