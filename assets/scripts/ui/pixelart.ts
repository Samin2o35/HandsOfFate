// Hands of Fate — ui/pixelart.ts
// The open-table style (plan phase 5) as pixel maps: plain TypeScript, no Cocos, so
// it's tested in Node against the tool that drew the signed-off mockups
// (tools/art/make_mockups_c.py). ui/kitC.ts turns these into SpriteFrames.
//
// Everything is in art pixels (shown at 2x). The pieces come from the cards:
//   rail      the card's frame: a 3 px rail (line, gap, line) that runs solid, then
//             dotted, then double, with a gap for a caption
//   stock     a card blank with the deck's clipped corners
//   cell      a health cell: flat colour, ink outline, the pips' rounded corners
//   rings     the medallion's charging ring (traceRing)
//   fx        white impact pieces and flame discs, tinted in code
//   dotted    dotted rings and rules

export type RGBA = readonly [number, number, number, number];

export function hex(h: string): RGBA {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255];
}

/** The palette (style guide, "open table"). */
export const PAL = {
    ink: hex('#3b324a'),
    cream: hex('#ecece0'),
    cream2: hex('#cfc6b8'),
    room0: hex('#16121c'),
    room1: hex('#241e2e'),
    soft: hex('#6e6276'),
    red: hex('#c93038'), redHi: hex('#d47564'), redLo: hex('#a93b3b'),
    green: hex('#309c63'), greenLo: hex('#3c5956'),
    blue: hex('#3978a8'), blueHi: hex('#94d2d4'), blueLo: hex('#047b96'),
    gold: hex('#fdd164'),
    purple: hex('#8e478c'),
};

export class Pix {
    readonly data: Uint8Array;
    constructor(readonly w: number, readonly h: number, fill?: RGBA) {
        this.data = new Uint8Array(w * h * 4);
        if (fill) for (let i = 0; i < w * h; i++) this.data.set(fill, i * 4);
    }
    set(x: number, y: number, c: RGBA) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        this.data.set(c, (y * this.w + x) * 4);
    }
    get(x: number, y: number): RGBA {
        const i = (y * this.w + x) * 4;
        return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
    }
    /** A copy scaled up by a whole number (for 9-slice frames, which are drawn 1:1). */
    scaled(k: number): Pix {
        const out = new Pix(this.w * k, this.h * k);
        for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
            const i = (Math.floor(y / k) * this.w + Math.floor(x / k)) * 4;
            out.data.set(this.data.subarray(i, i + 4), (y * out.w + x) * 4);
        }
        return out;
    }
    /** A short fingerprint of the pixels (tests compare it with the Python tool). */
    hash(): string {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < this.data.length; i++) { h ^= this.data[i]; h = Math.imul(h, 16777619) >>> 0; }
        return `${this.w}x${this.h}:${h.toString(16)}`;
    }
}

const same = (a: RGBA, b: RGBA) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

/** A card blank: the deck's clipped corners (2 pixels on the edge row, 1 on the next). */
export function stock(w: number, h: number, fill: RGBA): Pix {
    const p = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = Math.min(x, w - 1 - x), dy = Math.min(y, h - 1 - y);
        if ((dy === 0 && dx < 2) || (dy === 1 && dx < 1)) continue;
        p.set(x, y, fill);
    }
    return p;
}

type Kind = 'solid' | 'dot' | 'double' | 'gap';

/**
 * The card's rail. Point-symmetric like the cards: solid from the top-left, solid
 * into the bottom-right. cap = [start, width] leaves a gap in the top rail for a caption.
 * plain = a closed, even double line all round. sides picks which rails to draw.
 */
export function rail(p: Pix, col: RGBA, inset = 3, cap: [number, number] | null = null, plain = false, sides = 'tlbr'): Pix {
    const { w, h } = p;
    const x0 = inset, y0 = inset, x1 = w - 1 - inset, y1 = h - 1 - inset;
    const L = x1 - x0 + 1, V = y1 - y0 + 1;
    const top = (i: number): Kind => {
        if (cap && cap[0] - 2 <= i && i < cap[0] + cap[1] + 2) return 'gap';
        if (plain) return 'double';
        const a = cap ? cap[0] + cap[1] + 2 : 0;
        const sEnd = Math.max(a + 8, Math.floor(L * 0.58));
        return i < sEnd ? 'solid' : i < sEnd + 16 ? 'dot' : 'double';
    };
    const bottom = (i: number): Kind => {
        if (plain) return 'double';
        const j = L - 1 - i, sEnd = Math.floor(L * 0.52);
        return j < sEnd ? 'solid' : j < sEnd + 16 ? 'dot' : 'double';
    };
    const left = (i: number): Kind => (!plain && i < Math.min(16, Math.floor(V / 4)) ? 'solid' : 'double');
    const right = (i: number): Kind => (!plain && V - 1 - i < Math.min(16, Math.floor(V / 4)) ? 'solid' : 'double');
    for (let i = 0; i < L; i++) {
        const x = x0 + i;
        for (const [side, kind, yy] of [['t', top(i), y0], ['b', bottom(i), y1 - 2]] as [string, Kind, number][]) {
            if (!sides.includes(side) || kind === 'gap') continue;
            p.set(x, yy, col);
            p.set(x, yy + 2, col);
            if (kind === 'solid' || (kind === 'dot' && i % 2 === 0)) p.set(x, yy + 1, col);
        }
    }
    for (let i = 0; i < V; i++) {
        const y = y0 + i;
        for (const [side, kind, xx] of [['l', left(i), x0], ['r', right(i), x1 - 2]] as [string, Kind, number][]) {
            if (!sides.includes(side)) continue;
            p.set(xx, y, col);
            p.set(xx + 2, y, col);
            if (kind === 'solid') p.set(xx + 1, y, col);
        }
    }
    return p;
}

/**
 * A group's bracket: the top and left rails with a short return at the bottom right
 * (open), or an even rail all round (closed). capW = the caption's width in art pixels
 * (its gap starts 6 in). fill = a card blank under a closed rail.
 */
export function frame(w: number, h: number, opts: { closed?: boolean; col?: RGBA; fill?: RGBA; capW?: number } = {}): Pix {
    const col = opts.col ?? PAL.cream;
    const p = opts.fill ? stock(w, h, opts.fill) : new Pix(w, h);
    const cap: [number, number] | null = opts.capW ? [6, opts.capW] : null;
    rail(p, col, 0, cap, !!opts.closed, opts.closed ? 'tlbr' : 'tl');
    if (!opts.closed) {
        for (let i = 0; i < Math.min(28, Math.floor(w / 3)); i++) for (const k of [0, 2]) p.set(w - 1 - i, h - 1 - k, col);
        for (let i = 0; i < Math.min(18, Math.floor(h / 3)); i++) for (const k of [0, 2]) p.set(w - 1 - k, h - 1 - i, col);
    }
    return p;
}

/** A button: red card / cream card (an ink rail on a blank) or a cream / soft outline. */
export type ButtonLook = 'red' | 'cream' | 'outline' | 'muted';
export function button(w: number, h: number, look: ButtonLook, pressed = false): Pix {
    if (look === 'red' || look === 'cream') {
        const fill = look === 'red' ? (pressed ? PAL.redLo : PAL.red) : (pressed ? PAL.cream2 : PAL.cream);
        return rail(stock(w, h, fill), PAL.ink, 0, null, true);
    }
    const p = pressed ? stock(w, h, PAL.room1) : new Pix(w, h);
    return rail(p, look === 'muted' ? PAL.soft : PAL.cream, 0, null, true);
}

export type CellState = 'alive' | 'lost' | 'rotted' | 'shield';

/** A health cell, n art pixels square (on an n+2 canvas, like the Python tool). */
export function cell(n: number, state: CellState = 'alive'): Pix {
    const p = new Pix(n + 2, n + 2);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = Math.min(x, n - 1 - x), dy = Math.min(y, n - 1 - y);
        if (dx + dy < 2) continue;
        const edge = dx === 0 || dy === 0 || dx + dy === 2;
        let c = edge ? PAL.ink : PAL.red;
        if (!edge && dy === 1 && y < n / 2 && x >= 2 && x < n - 3) c = PAL.redHi;
        if (!edge && dy === 1 && y > n / 2) c = PAL.redLo;
        p.set(x, y, c);
    }
    if (state === 'alive') return p;
    const swap: [RGBA, RGBA][] = state === 'rotted' ? [[PAL.red, PAL.green], [PAL.redHi, PAL.green], [PAL.redLo, PAL.greenLo]]
        : state === 'shield' ? [[PAL.red, PAL.blue], [PAL.redHi, PAL.blueHi], [PAL.redLo, PAL.blueLo]]
            : [[PAL.red, PAL.room0], [PAL.redHi, PAL.room0], [PAL.redLo, PAL.room0], [PAL.ink, PAL.soft]];
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const c = p.get(x, y);
        const to = swap.find(([a]) => same(a, c));
        if (to) p.set(x, y, to[1]);
    }
    if (state === 'rotted') {
        // Mould: dark spots placed by hand.
        const half = Math.floor(n / 2);
        for (const [x, y] of [[4, 4], [5, 4], [4, 5], [n - 6, half], [n - 5, half], [half - 2, n - 5]]) {
            if (x > 0 && x < n - 1 && y > 0 && y < n - 1) p.set(x, y, PAL.greenLo);
        }
    }
    return p;
}

/** A dotted ring round a card (scoring: gold, charging: pink): 2 on, 2 off, 1 px. */
export function dottedRect(w: number, h: number, col: RGBA): Pix {
    const p = new Pix(w, h);
    for (let k = 0; k < w; k += 4) for (const d of [0, 1]) { p.set(k + d, 0, col); p.set(k + d, h - 1, col); }
    for (let k = 0; k < h; k += 4) for (const d of [0, 1]) { p.set(0, k + d, col); p.set(w - 1, k + d, col); }
    return p;
}

/** A dotted rule between items. */
export function dottedRule(w: number, col: RGBA): Pix {
    const p = new Pix(w, 1);
    for (let k = 0; k < w; k += 4) for (const d of [0, 1]) p.set(k + d, 0, col);
    return p;
}

export function bar(w: number, h: number, fill: number, col: RGBA): Pix {
    const p = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < Math.min(w, fill); x++) p.set(x, y, col);
    return p;
}

/** The greyed version of a drawn icon: fills become the room colour, outlines soft. */
export function muted(p: Pix): Pix {
    const out = new Pix(p.w, p.h);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const c = p.get(x, y);
        if (!c[3]) continue;
        out.set(x, y, same(c, PAL.ink) || same(c, PAL.cream) || same(c, PAL.gold) ? PAL.soft : PAL.room1);
    }
    return out;
}

function blit(dst: Pix, src: Pix, ox: number, oy: number) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c[3]) dst.set(ox + x, oy + y, c);
    }
}

/** Health reward: two living cells with a gold plus over them (40 x 28). */
export function rewardHealth(on = true): Pix {
    const p = new Pix(40, 28);
    blit(p, cell(14), 3, 11);
    blit(p, cell(14), 21, 11);
    for (let k = -3; k <= 3; k++) for (const d of [0, 1]) { p.set(20 + k, 4 + d, PAL.gold); p.set(20 + d, 4 + k, PAL.gold); }
    return on ? p : muted(p);
}

/** A little card for the Grid picture: cream, ink edge with cut corners, one red pip (7 x 10). */
function tinyCard(): Pix {
    const p = new Pix(7, 10);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 7; x++) {
        const corner = (x === 0 || x === 6) && (y === 0 || y === 9);
        if (corner) continue;
        const edge = x === 0 || x === 6 || y === 0 || y === 9;
        p.set(x, y, edge ? PAL.ink : PAL.cream);
    }
    p.set(3, 4, PAL.red); p.set(3, 5, PAL.red);
    return p;
}

/** Grid reward: two rows of little cards and a dotted gold row to come (25 x 34). */
export function rewardGrid(on = true): Pix {
    const p = new Pix(25, 34);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const x = c * 9, y = r * 12;
        blit(p, r < 2 ? tinyCard() : dottedRect(7, 10, PAL.gold), x, y);
    }
    return on ? p : muted(p);
}

/** A 1-pixel outline with the 2-pixel corner step, in white (tinted in code): the cell flash (n x n). */
export function flashOutline(n: number): Pix {
    const p = new Pix(n, n);
    const W: RGBA = [255, 255, 255, 255];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = Math.min(x, n - 1 - x), dy = Math.min(y, n - 1 - y);
        if (dx + dy < 2) continue;
        if (dx === 0 || dy === 0 || dx + dy === 2) p.set(x, y, W);
    }
    return p;
}

// ---- Charging traces (Stage D, decision 154) -----------------------------------------------------
// As a hand charges, a line in its colour lights from the bottom centre up both sides and
// meets at the top, over a dark ink track (like the card borders in the reference
// targetRef.gif). The same idea for the medallion ring, the hand lines and the cards.

/** Steps a trace is drawn in (frames are cached per step). */
export const TRACE_STEPS = 24;

/**
 * The medallion ring (36 x 36): a 2 px circle, lit `lit` (0..1) of the way round from the
 * bottom, both ways at once, in `col`; the rest ink. suit = false adds the empty-line dash.
 */
export function traceRing(lit: number, col: RGBA, suit = true, track: RGBA = PAL.ink): Pix {
    const s = 36, c = (s - 1) / 2;
    const p = new Pix(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
        if (r < 15.2 || r > 17.4) continue;
        // 0 at the bottom, 1 at the top, the same on both sides.
        const along = Math.abs(Math.atan2(dx, dy)) / Math.PI;
        p.set(x, y, suit && lit > 0 && along <= lit + 1e-9 ? col : track);
    }
    if (!suit) for (let x = 14; x < 22; x++) { p.set(x, 17, PAL.cream); p.set(x, 18, PAL.cream); }
    return p;
}

// ---- Impact pieces (Stage E, decision 158) -------------------------------------------------------
// White one-colour shapes, tinted to a palette colour in code, so each piece is exact palette.
// A few seeded variants each; the FX GIFs were looked at for ideas only (radial splats with
// thrown droplets; a bright head with a tapering dotted trail), nothing is copied.

const W1: RGBA = [255, 255, 255, 255];

/** A tiny repeatable random (mulberry32). */
export function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export type FxKind = 'splat' | 'drop' | 'plus' | 'sparkle' | 'shard' | 'bubble' | 'ring' | 'blob';
export const FX_VARIANTS: Record<FxKind, number> = { splat: 4, drop: 2, plus: 2, sparkle: 2, shard: 4, bubble: 2, ring: 1, blob: 3 };

/** A splat: a lumpy core with spikes and a few thrown droplets (s x s, s = 17). */
function splat(v: number): Pix {
    const s = 17, c = 8, rnd = seeded(101 + v * 7);
    const p = new Pix(s, s);
    // Lumpy core: radius varies with angle.
    const lumps = [0, 0, 0, 0, 0, 0, 0, 0].map(() => 3 + rnd() * 1.8);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = x - c, dy = y - c, a = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2) * 8;
        const i = Math.floor(a) % 8, f = a - Math.floor(a);
        const r = lumps[i] * (1 - f) + lumps[(i + 1) % 8] * f;
        if (Math.hypot(dx, dy) <= r) p.set(x, y, W1);
    }
    // Spikes, then a droplet at the end of some.
    const n = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd() * 0.6, len = 5 + rnd() * 3;
        for (let t = 3; t < len; t += 0.5) {
            const x = Math.round(c + Math.cos(a) * t), y = Math.round(c + Math.sin(a) * t);
            p.set(x, y, W1);
            // Thick at the root, thin at the tip.
            if (t < len * 0.6) p.set(Math.round(x - Math.sin(a)), Math.round(y + Math.cos(a)), W1);
        }
        if (rnd() < 0.6) {
            const d = len + 1.5;
            const dx = Math.round(c + Math.cos(a) * d), dy = Math.round(c + Math.sin(a) * d);
            p.set(dx, dy, W1); if (rnd() < 0.5) p.set(dx + 1, dy, W1);
        }
    }
    return p;
}

/** A falling drop: round bottom, pointed top (3 x 5 or 4 x 6). */
function drop(v: number): Pix {
    const rows = v === 0 ? ['.#.', '.#.', '###', '###', '.#.'] : ['.##.', '.##.', '####', '####', '####', '.##.'];
    return fromRows(rows);
}

function fromRows(rows: string[]): Pix {
    const p = new Pix(rows[0].length, rows.length);
    // Rows are written top-down; Pix rows are drawn top-down too.
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') p.set(x, y, W1); });
    return p;
}

const FX_ROWS: Partial<Record<FxKind, string[][]>> = {
    plus: [
        ['..#..', '..#..', '#####', '..#..', '..#..'],
        ['.#.', '###', '.#.'],
    ],
    sparkle: [
        ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'],
        ['..#..', '.###.', '#####', '.###.', '..#..'],
    ],
    shard: [
        ['#..', '##.', '###', '.##', '..#'],
        ['##', '##', '#.', '#.'],
        ['.#', '##', '##', '#.'],
        ['###.', '.###'],
    ],
    bubble: [
        ['.##.', '#..#', '#..#', '.##.'],
        ['..##..', '.#..#.', '#....#', '#....#', '.#..#.', '..##..'],
    ],
};

/** A hollow ring (13 x 13), the shield flash. */
function ring(): Pix {
    const s = 13, c = 6, p = new Pix(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const r = Math.hypot(x - c, y - c);
        if (r >= 4.6 && r <= 6.2) p.set(x, y, W1);
    }
    return p;
}

/** A soft lumpy blob (ooze), 9 x 7. */
function blob(v: number): Pix {
    const rnd = seeded(303 + v * 11), w = 9, h = 7, p = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x - 4) / 4.4, dy = (y - 3) / 3.3, wob = 1 + (rnd() - 0.5) * 0.35;
        if (dx * dx + dy * dy <= wob) p.set(x, y, W1);
    }
    return p;
}

/** One impact piece, white. */
export function fxPiece(kind: FxKind, variant: number): Pix {
    const v = ((variant % FX_VARIANTS[kind]) + FX_VARIANTS[kind]) % FX_VARIANTS[kind];
    switch (kind) {
        case 'splat': return splat(v);
        case 'drop': return drop(v);
        case 'ring': return ring();
        case 'blob': return blob(v);
        default: return fromRows(FX_ROWS[kind]![v]);
    }
}

/** A white filled disc of radius r (art px), for the flame's blobs (decision 167). */
export function disc(r: number): Pix {
    const s = r * 2 + 1, p = new Pix(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        if ((x - r) * (x - r) + (y - r) * (y - r) <= r * r + r * 0.6) p.set(x, y, W1);
    }
    return p;
}

/**
 * The pool of blood the fallen King lies in (decision 173), w x h art px, drawn once. It
 * surrounds a card of cardW x cardH art px whose centre sits `up` art px above the pool's
 * centre, and reaches out past every edge like the boss's fire, furthest below (it ran down).
 * Two images, so seeping blobs can merge with it: `body` (palette reds, darker pooled patches,
 * a darker rim, pink glints) and `outline` (the shape grown by one pixel, in ink).
 * Also returns `rim`: points on its edge with an outward direction, and `bottom[x]`: the
 * lowest filled row of each column (-1 if none), for blood running down to the edge.
 */
export function bloodPool(w: number, h: number, cardW: number, cardH: number, up: number, seed = 11): {
    body: Pix; outline: Pix; rim: [number, number, number, number][]; bottom: number[]; card: [number, number];
} {
    const rnd = seeded(seed);
    const mask = new Uint8Array(w * h);
    const ccx = w / 2, ccy = h / 2 - up;
    const hw = cardW / 2, hh = cardH / 2;
    const disc = (cx: number, cy: number, r: number) => {
        for (let y = Math.max(2, Math.floor(cy - r)); y <= Math.min(h - 3, Math.ceil(cy + r)); y++)
            for (let x = Math.max(2, Math.floor(cx - r)); x <= Math.min(w - 3, Math.ceil(cx + r)); x++)
                if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) mask[y * w + x] = 1;
    };
    // How far the pool reaches past the card, by direction: a few slow waves, more below.
    const waves = Array.from({ length: 5 }, (_, i) => ({ k: i + 2, ph: rnd() * Math.PI * 2, a: 0.5 + rnd() * 0.5 }));
    const room = Math.min((w - cardW) / 2, (h - cardH) / 2 - Math.abs(up)) - 4;
    const reach = (a: number) => {
        let v = 0;
        for (const q of waves) v += Math.sin(a * q.k + q.ph) * q.a;
        const down = Math.max(0, Math.sin(a));
        return room * (0.5 + v * 0.13 + down * 0.25);
    };
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        // Distance from a smaller box inside the card, so the pool's corners come out round.
        const dx = Math.max(0, Math.abs(x - ccx) - (hw - 50)), dy = Math.max(0, Math.abs(y - ccy) - (hh - 50));
        const d = Math.hypot(dx, dy) - 50;
        if (d <= reach(Math.atan2(y - ccy, x - ccx))) mask[y * w + x] = 1;
    }
    // A lumpy edge: lobes pushed out along the rim, and little satellite pools beyond it.
    const edgeAt = (a: number) => {
        const ex = Math.cos(a), ey = Math.sin(a);
        // Walk outward from the card centre to the edge of the pool.
        let t = 0;
        while (t < w + h) {
            const x = Math.round(ccx + ex * t), y = Math.round(ccy + ey * t);
            if (x < 0 || y < 0 || x >= w || y >= h || !mask[y * w + x]) break;
            t += 1;
        }
        return [ccx + ex * t, ccy + ey * t];
    };
    for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + rnd() * 0.2;
        const [ex, ey] = edgeAt(a);
        disc(ex, ey, room * (0.08 + rnd() * 0.16));
    }
    // A few tongues that ran further, mostly downward.
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 2 + (rnd() - 0.5) * 2.6;
        let [ex, ey] = edgeAt(a), r = room * (0.1 + rnd() * 0.06);
        const len = room * (0.15 + rnd() * 0.3);
        for (let t = 0; t < len; t += 1.5) { disc(ex + Math.cos(a) * t, ey + Math.sin(a) * t, r); r = Math.max(2, r * 0.985); }
        disc(ex + Math.cos(a) * len, ey + Math.sin(a) * len, r + 1.5);
    }
    for (let i = 0; i < 18; i++) {
        const a = rnd() * Math.PI * 2;
        const [ex, ey] = edgeAt(a);
        const out = 3 + rnd() * room * 0.25;
        disc(ex + Math.cos(a) * out, ey + Math.sin(a) * out, 1 + rnd() * 2.2);
    }
    const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
    // Colour: red, darker pooled patches (coarse value noise), a darker band just inside the rim,
    // and short pink glints where the light catches it (outside the card, where they show).
    const g = 8, gw = Math.ceil(w / g) + 2, grid = Array.from({ length: gw * (Math.ceil(h / g) + 2) }, () => rnd());
    const noise = (x: number, y: number) => {
        const gx = x / g, gy = y / g, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
        const v = (a: number, b: number) => grid[b * gw + a];
        const top = v(ix, iy) * (1 - fx) + v(ix + 1, iy) * fx, bot = v(ix, iy + 1) * (1 - fx) + v(ix + 1, iy + 1) * fx;
        return top * (1 - fy) + bot * fy;
    };
    const body = new Pix(w, h), outline = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (filled(x, y)) {
            const edge = !(filled(x - 2, y) && filled(x + 2, y) && filled(x, y - 2) && filled(x, y + 2));
            // His shadow: the blood is thickest and darkest right against him.
            const near = Math.max(Math.abs(x - ccx) - hw, Math.abs(y - ccy) - hh) < 2 + noise(x * 2.3 + 40, y * 2.3) * 16;
            body.set(x, y, edge || near || noise(x, y) > 0.74 ? PAL.redLo : PAL.red);
            outline.set(x, y, PAL.ink);
        } else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
            outline.set(x, y, PAL.ink);
        }
    }
    const inCard = (x: number, y: number) => Math.abs(x - ccx) <= hw && Math.abs(y - ccy) <= hh;
    for (let i = 0, made = 0; i < 900 && made < 34; i++) {
        const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h), len = 3 + Math.floor(rnd() * 6);
        let ok = !inCard(x, y) && !inCard(x + len, y);
        for (let k = -3; k <= len + 3 && ok; k++) ok = filled(x + k, y) && filled(x + k, y - 3) && filled(x + k, y + 3);
        if (!ok) continue;
        for (let k = 0; k < len; k++) body.set(x + k, y, PAL.redHi);
        if (rnd() < 0.5) body.set(x + 1, y - 1, PAL.redHi);
        made++;
    }
    // Rim points (every few pixels round the edge) with the outward direction from the card.
    const rim: [number, number, number, number][] = [];
    for (let y = 0; y < h; y += 3) for (let x = (y * 7) % 3; x < w; x += 3) {
        if (!filled(x, y) || (filled(x - 1, y) && filled(x + 1, y) && filled(x, y - 1) && filled(x, y + 1))) continue;
        const dx = x - ccx, dy = y - ccy, n = Math.hypot(dx, dy) || 1;
        rim.push([x, y, dx / n, dy / n]);
    }
    const bottom: number[] = [];
    for (let x = 0; x < w; x++) {
        let b = -1;
        for (let y = h - 1; y >= 0; y--) if (filled(x, y)) { b = y; break; }
        bottom.push(b);
    }
    return { body, outline, rim, bottom, card: [ccx, ccy] };
}
