// Hands of Fate — ui/kitC.ts
// The open-table kit (plan phase 5): every frame, button, cell, ring and medallion is
// a pixel map from ui/pixelart.ts turned into a SpriteFrame at runtime, so there are
// no image files to import and no editor steps. Frames are cached by size and kind.
//
// Sizes passed in are SCREEN pixels; pieces are drawn at the art pixel (half) and
// shown at exactly 2x with nearest filtering. Buttons are 9-sliced, so their
// textures are made at screen size (2x baked in) with their borders set.

import { Texture2D, ImageAsset, SpriteFrame, Node, Sprite, UITransform, Color } from 'cc';
import * as px from './pixelart';
import { makeNode, makeSprite, makeLabel, FONT, textWidth, Place } from './UiKit';

const cache = new Map<string, SpriteFrame>();

function toFrame(p: px.Pix, key: string, slice = 0): SpriteFrame {
    const hit = cache.get(key);
    if (hit) return hit;
    const img = new ImageAsset({ _data: p.data, _compressed: false, width: p.w, height: p.h, format: Texture2D.PixelFormat.RGBA8888 } as never);
    const tex = new Texture2D();
    tex.image = img;
    tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    const sf = new SpriteFrame();
    sf.texture = tex;
    sf.packable = false;
    if (slice) { sf.insetLeft = slice; sf.insetRight = slice; sf.insetTop = slice; sf.insetBottom = slice; }
    sf.name = `kitC:${key}`;
    cache.set(key, sf);
    return sf;
}

const art = (n: number) => Math.max(4, Math.round(n / 2));
const even = (n: number) => Math.round(n / 2) * 2;

// ---- Buttons (9-sliced) -----------------------------------------------------------------------

/** 12 art px square, 2x baked in; the 6-art-px edge (rail + clipped corner) never stretches. */
export function buttonFrame(look: px.ButtonLook, pressed = false): SpriteFrame {
    return toFrame(px.button(12, 12, look, pressed).scaled(2), `btn:${look}:${pressed ? 1 : 0}`, 10);
}

// ---- Frames ---------------------------------------------------------------------------------------

export interface FrameOpts { closed?: boolean; caption?: string; color?: 'cream' | 'soft'; fill?: 'room0' | 'red' | 'cream' }

/**
 * A group's bracket (or a closed rail) w x h screen pixels, centred at `at` like
 * makeSprite. A caption sits in a gap in the top rail, small caps, like a card's tab.
 */
export function frame(parent: Node, name: string, w: number, h: number, at: Place, o: FrameOpts = {}): Node {
    const col = o.color === 'soft' ? px.PAL.soft : px.PAL.cream;
    const holder = makeNode(parent, name, even(w), even(h), at);
    let capW = 0;
    let cap = null;
    if (o.caption) {
        cap = makeLabel(holder, 'Caption', o.caption, { size: FONT.labelSmall, spacing: 2, color: o.color === 'soft' ? '#6E6276' : '#ECECE0', align: 'left' });
        capW = Math.ceil((textWidth(cap) + 16) / 2);
    }
    const aw = art(w), ah = art(h);
    const fill = o.fill === 'room0' ? px.PAL.room0 : o.fill === 'red' ? px.PAL.red : o.fill === 'cream' ? px.PAL.cream : undefined;
    const key = `frame:${aw}x${ah}:${o.closed ? 1 : 0}:${capW}:${o.color ?? 'c'}:${o.fill ?? ''}`;
    const sf = toFrame(px.frame(aw, ah, { closed: o.closed, col, fill, capW }), key);
    const s = makeSprite(holder, 'Rail', sf, aw * 2, ah * 2);
    s.node.setSiblingIndex(0);
    if (cap) {
        cap.node.setPosition(-aw + 20, ah);
        // A filled box floats over other things (the Dealer, pause): give its caption the same ground,
        // so whatever lies under the top edge can't show through the letters.
        if (o.closed && fill) {
            const band = makeSprite(holder, 'CaptionBand', toFrame(px.stock(aw, 14, fill), `stock:${aw}x14:${o.fill}`), aw * 2, 28, { x: 0, y: ah + 8 });
            band.node.setSiblingIndex(0);
        }
    }
    return holder;
}

/** A dotted rule between items, w screen pixels wide, its left end at x. */
export function rule(parent: Node, name: string, w: number, x: number, y: number, color: 'room1' | 'soft' = 'room1'): Sprite {
    const aw = art(w);
    const sf = toFrame(px.dottedRule(aw, color === 'soft' ? px.PAL.soft : px.PAL.room1), `rule:${aw}:${color}`);
    return makeSprite(parent, name, sf, aw * 2, 2, { x, y, anchorX: 0 });
}

// ---- Cards, cells, badges ---------------------------------------------------------------------

/** A dotted ring w x h screen pixels: gold round scoring cards, pink round charging ones. */
export function ringFrame(w: number, h: number, kind: 'gold' | 'pink' | 'slot' | 'cream'): SpriteFrame {
    const aw = art(w), ah = art(h);
    const col = kind === 'gold' ? px.PAL.gold : kind === 'pink' ? px.PAL.redHi : kind === 'cream' ? px.PAL.cream : px.PAL.room1;
    return toFrame(px.dottedRect(aw, ah, col), `ring:${aw}x${ah}:${kind}`);
}

/** A health cell for a cell `size` screen pixels across (the art adds a 2 px margin). */
export function cellFrame(size: number, state: px.CellState): SpriteFrame {
    const n = Math.max(6, Math.round(size / 2));
    return toFrame(px.cell(n, state), `cell:${n}:${state}`);
}

/** Screen size of a cell frame's sprite for a cell `size` across. */
export function cellSpriteSize(size: number): number {
    return (Math.max(6, Math.round(size / 2)) + 2) * 2;
}

/** The medallion's 12 dots: `lit` of them cream. suit = false for a line with no hand. */
export function medallionFrame(lit: number, suit = true): SpriteFrame {
    const l = Math.max(0, Math.min(12, Math.round(lit)));
    return toFrame(px.medallion(l, suit), `med:${suit ? l : 'none'}`);
}

/** Text colours of the open table. */
export const INK_TEXT = {
    main: '#ECECE0',
    second: '#CFC6B8',
    quiet: '#6E6276',
    gold: '#FDD164',
    red: '#C93038',
    ink: '#3B324A',
};

export function tint(s: Sprite, hexColor: string) { s.color = new Color().fromHEX(hexColor); }
export type { UITransform };
