// Hands of Fate — ui/runOverBlood.ts (decision 173; replaces 162, 168, 171 and 172)
// On the run-over screen the fallen King lies in a pool of his own blood, as a body lies on
// the floor: the pool is drawn behind the card and reaches out past every edge, about as far
// as the boss's fire does, furthest below. It never stops bleeding:
// - blood keeps running out from under him (and down beside him) to the pool's edge, leaving
//   darker rivulets that fade;
// - where it reaches the edge, and all round the rim, the pool seeps outward: blobs swell out
//   of the edge, hold, and shrink back, so the edge creeps and breathes the whole time.
// No taps and nothing in front of the card: the card art is never covered or changed
// (Pixel Plebes terms). Drip behaviour from Samin's TrebzFX recording; our own pixels.
//
// The pool is drawn once (pixelart.bloodPool) as two images, body and ink outline, so the
// seeping blobs, with their own ink outlines on the same layer, merge into its edge.

import { _decorator, Component, Node, Sprite, UITransform, Color } from 'cc';
import { makeNode, makeSprite } from './UiKit';
import { whiteFrame, bloodDiscFrame, bloodPoolFrames } from './kitC';
const { ccclass } = _decorator;

const RED = '#C93038', RED_LO = '#A93B3B', SHINE = '#D47564', INK = '#3B324A';
/** The pool in art px (2 screen px each): 800 x 1080 on screen round a 480 x 720 card. */
const POOL_W = 400, POOL_H = 540;
/** The card's centre sits this many art px above the pool's centre. */
const POOL_UP = 5;
const SEEPS = 44;
const STAMPS = 160;
const DROPS = 10;

const even = (n: number) => Math.round(n / 2) * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Blob { outline: Sprite; body: Sprite; r: number; }
interface Seep extends Blob { used: boolean; t: number; grow: number; hold: number; full: number; shrinkAt: number; }
interface Stamp extends Blob { used: boolean; born: number; life: number; shrinkAt: number; }
interface Drop extends Blob {
    shine: Sprite;
    /** 0 free, 1 swelling, 2 running. */
    phase: number; t: number; hold: number; full: number;
    x: number; y: number; vy: number; g: number; lastY: number; endY: number;
}

@ccclass('RunOverBlood')
export class RunOverBlood extends Component {
    private seeps: Seep[] = [];
    private stamps: Stamp[] = [];
    private drops: Drop[] = [];
    /** Rim points in this node's space, with the outward direction. */
    private rim: { x: number; y: number; dx: number; dy: number }[] = [];
    /** The pool's lowest row per art column, in this node's space (NaN where empty). */
    private bottomAt: (x: number) => number = () => NaN;
    private cardW = 480;
    private cardH = 720;
    private clock = 0;
    private nextSeep = 0;
    private nextDrop = 0;
    private colors: Record<string, Color> = {};

    /** Behind `card` (w x h on screen, centred on its node). */
    static attach(parent: Node, card: Node, w: number, h: number): RunOverBlood {
        const holder = makeNode(parent, 'Blood', w, h, { x: card.position.x, y: card.position.y });
        holder.setSiblingIndex(card.getSiblingIndex());
        const b = holder.addComponent(RunOverBlood);
        b.setup(w, h);
        return b;
    }

    private setup(w: number, h: number) {
        this.cardW = w; this.cardH = h;
        for (const c of [RED, RED_LO, SHINE, INK]) this.colors[c] = new Color().fromHEX(c);
        const pool = bloodPoolFrames(POOL_W, POOL_H, w / 2, h / 2, POOL_UP);
        const dy = -POOL_UP * 2;
        const toX = (x: number) => (x - POOL_W / 2) * 2, toY = (y: number) => (POOL_H / 2 - y) * 2 + dy;
        this.rim = pool.rim.map(([x, y, ox, oy]) => ({ x: toX(x), y: toY(y), dx: ox, dy: -oy }));
        this.bottomAt = (x: number) => {
            const col = Math.round(x / 2 + POOL_W / 2);
            const b = pool.bottom[col];
            return b === undefined || b < 0 ? NaN : toY(b);
        };
        // Layers, back to front: ink outlines (pool and seeps), the reds of pool and seeps,
        // the rivulets' darker edges, their reds, the shines.
        const outlines = makeNode(this.node, 'Outlines', 1, 1);
        makeSprite(outlines, 'Pool', pool.outline, POOL_W * 2, POOL_H * 2, { y: dy });
        const bodies = makeNode(this.node, 'Bodies', 1, 1);
        makeSprite(bodies, 'Pool', pool.body, POOL_W * 2, POOL_H * 2, { y: dy });
        const runEdges = makeNode(this.node, 'RunEdges', 1, 1);
        const runs = makeNode(this.node, 'Runs', 1, 1);
        const shines = makeNode(this.node, 'Shines', 1, 1);
        const blob = (k: string, under: Node, over: Node, edge: string, fill: string): Blob => {
            const d = bloodDiscFrame(2);
            const outline = makeSprite(under, `O${k}`, d.frame, d.size, d.size);
            outline.color = this.colors[edge];
            const body = makeSprite(over, `B${k}`, d.frame, d.size, d.size);
            body.color = this.colors[fill];
            outline.node.active = false; body.node.active = false;
            return { outline, body, r: 0 };
        };
        for (let i = 0; i < SEEPS; i++) this.seeps.push({ ...blob(`p${i}`, outlines, bodies, INK, RED_LO), used: false, t: 0, grow: 1, hold: 1, full: 3, shrinkAt: 0 });
        for (let i = 0; i < STAMPS; i++) this.stamps.push({ ...blob(`s${i}`, runEdges, runs, RED_LO, RED), used: false, born: 0, life: 0, shrinkAt: 0 });
        for (let i = 0; i < DROPS; i++) {
            const shine = makeSprite(shines, `S${i}`, whiteFrame(), 2, 2);
            shine.color = this.colors[SHINE];
            shine.node.active = false;
            this.drops.push({ ...blob(`d${i}`, runEdges, runs, RED_LO, RED), shine, phase: 0, t: 0, hold: 0, full: 0, x: 0, y: 0, vy: 0, g: 0, lastY: 0, endY: 0 });
        }
        // Already bleeding when the screen opens.
        for (let i = 0; i < 300; i++) this.step(1 / 60);
    }

    update(dt: number) { this.step(Math.min(dt, 1 / 20)); }

    private step(dt: number) {
        this.clock += dt;
        this.nextSeep -= dt;
        if (this.nextSeep <= 0 && this.rim.length) {
            const at = this.rim[Math.floor(Math.random() * this.rim.length)];
            this.seepAt(at.x, at.y, at.dx, at.dy, rand(2, 6));
            this.nextSeep = rand(0.1, 0.3);
        }
        this.nextDrop -= dt;
        if (this.nextDrop <= 0) { this.startDrop(); this.nextDrop = rand(0.35, 0.9); }
        for (const s of this.seeps) if (s.used) this.stepSeep(s, dt);
        for (const d of this.drops) if (d.phase) this.stepDrop(d, dt);
        for (const s of this.stamps) {
            if (!s.used || this.clock < s.born + s.life || this.clock < s.shrinkAt) continue;
            s.shrinkAt = this.clock + 0.12;
            if (s.r <= 1) { this.hide(s); s.used = false; continue; }
            this.size(s, s.r - 1);
        }
    }

    /** A blob swells out of the pool's edge at (x, y), pushed a little outward, then shrinks back. */
    private seepAt(x: number, y: number, dx: number, dy: number, full: number) {
        let s = this.seeps.find((q) => !q.used);
        if (!s) s = this.seeps.reduce((a, b) => (a.t > b.t ? a : b));
        const out = rand(0, full * 1.4) * 2;
        const px = even(x + dx * out), py = even(y + dy * out);
        s.used = true; s.t = 0; s.full = Math.round(full); s.grow = rand(0.8, 2.2); s.hold = rand(1, 3.2); s.shrinkAt = 0;
        s.outline.node.setPosition(px, py, 0); s.body.node.setPosition(px, py, 0);
        this.size(s, 1);
        s.outline.node.active = true; s.body.node.active = true;
    }

    private stepSeep(s: Seep, dt: number) {
        s.t += dt;
        if (s.t < s.grow) {
            this.size(s, Math.max(1, Math.round(1 + (s.full - 1) * (s.t / s.grow))));
            return;
        }
        if (s.t < s.grow + s.hold || this.clock < s.shrinkAt) return;
        s.shrinkAt = this.clock + 0.18;
        if (s.r <= 1) { this.hide(s); s.used = false; return; }
        this.size(s, s.r - 1);
    }

    /** Blood comes out from under the King (mostly below him, sometimes beside him) and runs to the edge. */
    private startDrop() {
        const d = this.drops.find((q) => q.phase === 0);
        if (!d) return;
        const hw = this.cardW / 2, hh = this.cardH / 2;
        let x: number, y: number;
        if (Math.random() < 0.6) {
            x = rand(-hw + 20, hw - 20); y = -hh + 6;
        } else {
            const side = Math.random() < 0.5 ? -1 : 1;
            x = side * (hw + rand(8, 70)); y = rand(-hh * 0.2, hh * 0.7);
        }
        x = even(x);
        const endY = this.bottomAt(x);
        if (!(endY < y - 20)) return;
        d.x = x; d.y = y; d.lastY = y; d.vy = 0; d.endY = endY;
        d.full = Math.round(rand(3, 6));
        d.g = rand(50, 140);
        d.hold = rand(0.4, 1.1);
        d.phase = 1; d.t = 0;
        this.size(d, 1);
        this.show(d, true);
        this.place(d);
    }

    private stepDrop(d: Drop, dt: number) {
        d.t += dt;
        if (d.phase === 1) {
            const r = Math.max(1, Math.min(d.full, Math.round(1 + (d.full - 1) * (d.t / d.hold))));
            if (r !== d.r) { this.size(d, r); d.shine.node.active = r >= 3; }
            if (d.t >= d.hold) { d.phase = 2; d.t = 0; }
            this.place(d);
            return;
        }
        // Runs down across the floor, faster as it goes, now and then catching.
        d.vy = Math.min(220, d.vy + d.g * dt);
        if (d.vy > 40 && Math.random() < dt * 0.7) d.vy *= 0.25;
        d.y -= d.vy * dt;
        if (d.lastY - d.y >= Math.max(4, d.r * 2 * 0.55)) {
            d.lastY = d.y;
            this.stamp(d);
            if (Math.random() < 0.04 && d.r > 2) { this.size(d, d.r - 1); d.shine.node.active = d.r >= 3; }
        }
        if (d.y <= d.endY + d.r * 2) {
            // It reaches the edge and pushes the pool out there.
            this.seepAt(d.x, d.endY, 0, -1, d.r + 2);
            d.phase = 0; this.show(d, false);
            return;
        }
        this.place(d);
    }

    /** The rivulet: a blob left where the drop is; it fades by shrinking a pixel at a time. */
    private stamp(d: Drop) {
        let s = this.stamps.find((q) => !q.used);
        if (!s) s = this.stamps.reduce((a, b) => (a.born < b.born ? a : b));
        s.used = true; s.born = this.clock; s.life = rand(2.4, 4.2); s.shrinkAt = 0;
        s.body.color = this.colors[Math.random() < 0.5 ? RED : RED_LO];
        this.size(s, Math.max(1, d.r - (Math.random() < 0.35 ? 1 : 0)));
        const x = even(d.x), y = even(d.y);
        s.outline.node.setPosition(x, y, 0); s.body.node.setPosition(x, y, 0);
        s.outline.node.active = true; s.body.node.active = true;
    }

    private place(d: Drop) {
        const x = even(d.x), y = even(d.y);
        d.outline.node.setPosition(x, y, 0);
        d.body.node.setPosition(x, y, 0);
        d.shine.node.setPosition(x - even(d.r * 0.8), y + even(d.r * 0.8), 0);
    }

    private show(d: Drop, on: boolean) {
        d.outline.node.active = on; d.body.node.active = on; d.shine.node.active = on && d.r >= 3;
    }

    private hide(b: Blob) { b.outline.node.active = false; b.body.node.active = false; }

    /** Body radius r art px; the outline is one art pixel bigger all round. */
    private size(b: Blob, r: number) {
        if (b.r === r) return;
        b.r = r;
        const body = bloodDiscFrame(r), out = bloodDiscFrame(r + 1);
        b.body.spriteFrame = body.frame;
        b.body.node.getComponent(UITransform)!.setContentSize(body.size, body.size);
        b.outline.spriteFrame = out.frame;
        b.outline.node.getComponent(UITransform)!.setContentSize(out.size, out.size);
    }
}
