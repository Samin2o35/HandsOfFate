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
//   dots      the medallion's 12 timer dots
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

/**
 * The medallion around a badge's suit pip (36x36): 12 dots on a circle, `lit` of
 * them cream (the timer), the rest room dark. suit = false draws the empty-line dash.
 */
export function medallion(lit: number, suit = true): Pix {
    const s = 36, c = (s - 1) / 2;
    const p = new Pix(s, s);
    for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 6;
        const x = Math.round(c + Math.cos(a) * 16.6), y = Math.round(c + Math.sin(a) * 16.6);
        const col = suit && i < lit ? PAL.cream : PAL.room1;
        for (const dx of [0, 1]) for (const dy of [0, 1]) p.set(x + dx - 1, y + dy - 1, col);
    }
    if (!suit) for (let x = 14; x < 22; x++) { p.set(x, 17, PAL.cream); p.set(x, 18, PAL.cream); }
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

/** A dotted oval (the boss's glow): n 2x2 dots spaced evenly round an ellipse filling w x h. */
export function dottedOval(w: number, h: number, col: RGBA, n = 56): Pix {
    const p = new Pix(w, h);
    const rx = (w - 2) / 2, ry = (h - 2) / 2;
    for (let i = 0; i < n; i++) {
        const a = (i * 2 * Math.PI) / n;
        const x = Math.round(rx + Math.cos(a) * rx), y = Math.round(ry + Math.sin(a) * ry);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) p.set(x + dx, y + dy, col);
    }
    return p;
}

/** A flat bar: `fill` art pixels of colour from the left, the rest clear (progress inside a rail). */
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
