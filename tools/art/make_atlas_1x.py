"""Hands of Fate — tools/art/make_atlas_1x.py (Stage B, decision 144)

Every Pixel Plebes file in assets/resources is 1x pixel art enlarged exactly 4x (each art
pixel is a 4x4 block; this tool checks that and stops if not). The game draws cards at
2x, 1.5x, 1x and 0.75x and the animated strips at 2x and 3x, all with nearest filtering,
so a 1x copy shows exactly the same screen pixels at every one of those sizes: the art is
not changed, only stored smaller. This makes:

  assets/resources/atlas/cards.png    every card of both decks (and the back, the Joker) at 1x
                                      in one texture, so cards can batch; ~5 MB on the GPU, not ~78 MB
  assets/resources/anim1x/<name>.png  each 8-frame strip at 1x (720 x 126)
  assets/scripts/ui/cardAtlas.ts      where each card sits in the atlas

and a .meta for each new image (a plain texture, nearest filter, no alpha fixing). The 4x
originals stay where they are. Run from the project root with Cocos closed:

    python3 tools/art/make_atlas_1x.py
"""
import json
import os
import sys
import uuid

import numpy as np
from PIL import Image

ROOT = os.getcwd()
RES = os.path.join(ROOT, 'assets', 'resources')
# The 4x originals: art-source/ since decision 169 (outside assets), else the old place.
SRC = os.path.join(ROOT, 'art-source') if os.path.isdir(os.path.join(ROOT, 'art-source', 'cards')) else RES
W, H, GAP, COLS = 90, 126, 2, 12


def one_x(path):
    """The 1x art of a 4x file; stops if the file isn't exact 4x4 blocks."""
    a = np.array(Image.open(path).convert('RGBA'))
    h, w = a.shape[:2]
    small = a[::4, ::4]
    if h % 4 or w % 4 or not (np.repeat(np.repeat(small, 4, 0), 4, 1) == a).all():
        sys.exit(f'{path} is not exact 4x blocks; not packing it')
    return Image.fromarray(small, 'RGBA')


def meta_for(png, name):
    """A texture import for a new image: nearest filter, clamp, no mipmaps, no alpha fixing. An existing meta is left as it is."""
    mp = png + '.meta'
    if os.path.exists(mp):
        return  # Cocos owns it once imported: never rewrite (it would undo the editor's own fields)
    u = str(uuid.uuid4())
    meta = {
        'ver': '1.0.27', 'importer': 'image', 'imported': False, 'uuid': u, 'files': ['.json', '.png'],
        'subMetas': {'6c48a': {
            'importer': 'texture', 'uuid': f'{u}@6c48a', 'displayName': name, 'id': '6c48a', 'name': 'texture',
            'userData': {'wrapModeS': 'clamp-to-edge', 'wrapModeT': 'clamp-to-edge', 'minfilter': 'nearest',
                         'magfilter': 'nearest', 'mipfilter': 'none', 'anisotropy': 0, 'isUuid': True,
                         'imageUuidOrDatabaseUri': u, 'visible': False},
            'ver': '1.0.22', 'imported': False, 'files': ['.json'], 'subMetas': {}}},
        'userData': {'type': 'texture', 'hasAlpha': True, 'fixAlphaTransparencyArtifacts': False, 'redirect': f'{u}@6c48a'},
    }
    with open(mp, 'w') as f:
        json.dump(meta, f, indent=2)


def folder_meta(d):
    mp = d + '.meta'
    if os.path.exists(mp):
        return
    with open(mp, 'w') as f:
        json.dump({'ver': '1.2.0', 'importer': 'directory', 'imported': True, 'uuid': str(uuid.uuid4()),
                   'files': [], 'subMetas': {}, 'userData': {}}, f, indent=2)


def main():
    # ---- Cards: both decks in one atlas ----
    paths = []
    for deck in ('updated', 'classic'):
        d = os.path.join(SRC, 'cards', deck)
        for f in sorted(os.listdir(d)):
            if f.endswith('.png'):
                paths.append(f'cards/{deck}/{f[:-4]}')
    rows = (len(paths) + COLS - 1) // COLS
    aw, ah = GAP + COLS * (W + GAP), GAP + rows * (H + GAP)
    atlas = Image.new('RGBA', (aw, ah), (0, 0, 0, 0))
    rects = {}
    for k, p in enumerate(paths):
        im = one_x(os.path.join(SRC, p + '.png'))
        if im.size != (W, H):
            sys.exit(f'{p}: {im.size} at 1x, expected {W}x{H}')
        x, y = GAP + (k % COLS) * (W + GAP), GAP + (k // COLS) * (H + GAP)
        atlas.paste(im, (x, y))
        rects[p] = [x, y]
    out = os.path.join(RES, 'atlas')
    os.makedirs(out, exist_ok=True)
    folder_meta(out)
    png = os.path.join(out, 'cards.png')
    atlas.save(png)
    meta_for(png, 'cards')
    print(f'atlas/cards.png {aw}x{ah}: {len(paths)} cards')

    ts = ['// Hands of Fate — ui/cardAtlas.ts. Made by tools/art/make_atlas_1x.py; do not edit by hand.',
          '// Where each card sits in assets/resources/atlas/cards.png (1x art, 90 x 126 each).',
          "export const CARD_ATLAS = 'atlas/cards';",
          f'export const CARD_ATLAS_W = {W};', f'export const CARD_ATLAS_H = {H};',
          'export const CARD_RECTS: Record<string, readonly [number, number]> = {']
    ts += [f"    '{p}': [{x}, {y}]," for p, (x, y) in rects.items()]
    ts += ['};', '']
    with open(os.path.join(ROOT, 'assets', 'scripts', 'ui', 'cardAtlas.ts'), 'w') as f:
        f.write('\n'.join(ts))

    # ---- Animated strips at 1x ----
    src = os.path.join(SRC, 'anim')
    out = os.path.join(RES, 'anim1x')
    os.makedirs(out, exist_ok=True)
    folder_meta(out)
    n = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith('.png'):
            continue
        png = os.path.join(out, f)
        one_x(os.path.join(src, f)).save(png)
        meta_for(png, f[:-4])
        n += 1
    print(f'anim1x: {n} strips')


if __name__ == '__main__':
    main()
