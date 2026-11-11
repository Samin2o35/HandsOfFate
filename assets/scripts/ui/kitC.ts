// Hands of Fate — ui/kitC.ts
// The open-table kit (plan phase 5): every frame, button, cell, ring and medallion is
// a pixel map from ui/pixelart.ts turned into a SpriteFrame at runtime, so there are
// no image files to import and no editor steps. Frames are cached by size and kind.
//
// Sizes passed in are SCREEN pixels; pieces are drawn at the art pixel (half) and
// shown at exactly 2x with nearest filtering. Buttons are 9-sliced, so their
// textures are made at screen size (2x baked in) with their borders set.

import { Texture2D, ImageAsset, SpriteFrame, Node, Sprite, UITransform, Color, Rect, Size, Vec2, director, Director } from 'cc';
import * as px from './pixelart';
import { makeNode, makeSprite, makeLabel, FONT, textWidth, Place } from './UiKit';

const cache = new Map<string, SpriteFrame>();

// ---- Shared atlas pages (Stage B, decision 142) --------------------------------------------------
// Small pieces (cells, rings, medallions, buttons, flashes, rules, the white square) are packed
// into shared 1024 x 1024 pages instead of one texture each, so sprites next to each other can
// batch into one draw call. Big pieces (the brackets) keep their own texture. A page is
// re-uploaded at most once a frame, just before drawing, when pieces were added to it.
// Set ATLAS to false to go back to one texture per piece.
export const ATLAS = true;
const PAGE = 1024;
const GAP = 2;
const MAX_SIDE = PAGE - GAP * 2;
const MAX_AREA = 160 * 160;

interface Page { tex: Texture2D; data: Uint8Array; x: number; y: number; rowH: number; dirty: boolean; }
const pages: Page[] = [];
let flushQueued = false;

function newPage(): Page {
    const tex = new Texture2D();
    tex.reset({ width: PAGE, height: PAGE, format: Texture2D.PixelFormat.RGBA8888 });
    tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    const page: Page = { tex, data: new Uint8Array(PAGE * PAGE * 4), x: GAP, y: GAP, rowH: 0, dirty: true };
    pages.push(page);
    return page;
}

/** Finds room for w x h on a page (shelf packing): the page and the top-left corner. */
function place(w: number, h: number): { page: Page; x: number; y: number } {
    for (const page of pages) {
        if (page.x + w + GAP > PAGE) { page.y += page.rowH + GAP; page.x = GAP; page.rowH = 0; }
        if (page.y + h + GAP <= PAGE) {
            const at = { page, x: page.x, y: page.y };
            page.x += w + GAP;
            page.rowH = Math.max(page.rowH, h);
            return at;
        }
    }
    const page = newPage();
    page.x = GAP + w + GAP;
    page.rowH = h;
    return { page, x: GAP, y: GAP };
}

function flushPages() {
    flushQueued = false;
    for (const page of pages) if (page.dirty) { page.dirty = false; page.tex.uploadData(page.data); }
}

/** Shared pages in use (for the perf tool and tests). */
export function atlasPages(): number { return pages.length; }

function toFrame(p: px.Pix, key: string, slice = 0): SpriteFrame {
    const hit = cache.get(key);
    if (hit) return hit;
    const sf = new SpriteFrame();
    if (ATLAS && p.w <= MAX_SIDE && p.h <= MAX_SIDE && p.w * p.h <= MAX_AREA) {
        const { page, x, y } = place(p.w, p.h);
        for (let row = 0; row < p.h; row++) {
            page.data.set(p.data.subarray(row * p.w * 4, (row + 1) * p.w * 4), ((y + row) * PAGE + x) * 4);
        }
        page.dirty = true;
        if (!flushQueued) { flushQueued = true; director.once(Director.EVENT_BEFORE_DRAW, flushPages); }
        sf.reset({ texture: page.tex, rect: new Rect(x, y, p.w, p.h), originalSize: new Size(p.w, p.h), offset: new Vec2(0, 0), isRotate: false });
    } else {
        const img = new ImageAsset({ _data: p.data, _compressed: false, width: p.w, height: p.h, format: Texture2D.PixelFormat.RGBA8888 } as never);
        const tex = new Texture2D();
        tex.image = img;
        tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
        sf.texture = tex;
    }
    sf.packable = false;
    if (slice) { sf.insetLeft = slice; sf.insetRight = slice; sf.insetTop = slice; sf.insetBottom = slice; }
    sf.name = `kitC:${key}`;
    // The layout tool paints pieces from their own pixels (a page holds many).
    (sf as unknown as { _pix: px.Pix })._pix = p;
    cache.set(key, sf);
    return sf;
}

const art = (n: number) => Math.max(4, Math.round(n / 2));
const even = (n: number) => Math.round(n / 2) * 2;

/** A 2 x 2 white square, tinted in code (dims, covers, sparks). Replaces the old spark.png. */
export function whiteFrame(): SpriteFrame {
    return toFrame(new px.Pix(2, 2, [255, 255, 255, 255]), 'white');
}

// ---- Buttons (9-sliced) -----------------------------------------------------------------------

/** 12 art px square, 2x baked in; the 6-art-px edge (rail + clipped corner) never stretches. */
export function buttonFrame(look: px.ButtonLook, pressed = false): SpriteFrame {
    return toFrame(px.button(12, 12, look, pressed).scaled(2), `btn:${look}:${pressed ? 1 : 0}`, 10);
}

// ---- Frames ---------------------------------------------------------------------------------------

/** fill: a named colour, or any '#rrggbb' (a lit tier badge in the King's suit colour). */
export interface FrameOpts { closed?: boolean; caption?: string; color?: 'cream' | 'soft'; fill?: 'room0' | 'red' | 'cream' | string }

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
    const fill = o.fill === 'room0' ? px.PAL.room0 : o.fill === 'red' ? px.PAL.red : o.fill === 'cream' ? px.PAL.cream : o.fill?.startsWith('#') ? px.hex(o.fill) : undefined;
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

/** A dotted oval w x h screen pixels in any colour (the boss's glow in his suit colour). */
export function ovalFrame(w: number, h: number, hexColor: string): SpriteFrame {
    const aw = art(w), ah = art(h);
    return toFrame(px.dottedOval(aw, ah, px.hex(hexColor)), `oval:${aw}x${ah}:${hexColor}`);
}

/** A flat progress fill `w` screen pixels long at `fraction`, 2 art px high, in a colour. */
export function barFrame(w: number, fraction: number, hexColor: string): SpriteFrame {
    const aw = art(w), f = Math.round(aw * Math.max(0, Math.min(1, fraction)));
    return toFrame(px.bar(aw, 3, f, px.hex(hexColor)), `bar:${aw}:${f}:${hexColor}`);
}

/** The round-won reward pictures, lit or greyed (drawn here, not imported). */
export function rewardIcon(kind: 'health' | 'grid', on: boolean): { frame: SpriteFrame; w: number; h: number } {
    const p = kind === 'health' ? px.rewardHealth(on) : px.rewardGrid(on);
    return { frame: toFrame(p, `reward:${kind}:${on ? 1 : 0}`), w: p.w * 2, h: p.h * 2 };
}

/** A white outline round a cell `size` screen pixels across, tinted for hit / heal / rot / shield. */
export function flashFrame(size: number): { frame: SpriteFrame; px: number } {
    const n = Math.max(6, Math.round(size / 2));
    return { frame: toFrame(px.flashOutline(n), `flash:${n}`), px: n * 2 };
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
