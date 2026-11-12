// Hands of Fate — ui/runOverBlood.ts (Stage E, decision 162; feedback item 16)
// On the run-over screen, blood runs slowly down the fallen King's card and pools beneath it,
// looping. The card art is never touched: the streams run just outside its side edges and the
// pool sits behind its bottom edge (Pixel Plebes terms). A fixed handful of nodes, reused for
// every loop; positions and lengths stay on the 2 px art grid.

import { _decorator, Component, Node, Sprite, UITransform, Color } from 'cc';
import { makeNode, makeSprite } from './UiKit';
import { whiteFrame, fxFrame, ellipseFrame } from './kitC';
import { Particles } from './particles';
import { BLOOD } from './impacts';
const { ccclass } = _decorator;

const even = (n: number) => Math.round(n / 2) * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Stream widths (px), thick and thin, so the six don't read as one ruled pattern. */
const WIDTHS = [6, 4, 8, 4, 6, 8];

interface Stream {
    body: Sprite; head: Sprite; x: number; w: number;
    /** Phase: 0 waiting, 1 running down, 2 dripping, 3 tail running off. */
    phase: number; t: number; wait: number; run: number;
    top: number; end: number; drips: number;
}

@ccclass('RunOverBlood')
export class RunOverBlood extends Component {
    private streams: Stream[] = [];
    private pool: Sprite | null = null;
    private poolDark: Sprite | null = null;
    private poolW = 0;
    private poolTo = 0;
    private poolMax = 0;
    private cardTop = 0;
    private cardBottom = 0;

    /** Sets up round `card` (w x h on screen), drawn just under it so its bottom edge covers the pool's top. */
    static attach(parent: Node, card: Node, w: number, h: number): RunOverBlood {
        const holder = makeNode(parent, 'Blood', 1, 1);
        // Drawn under the card: the pool tucks behind its bottom edge.
        holder.setSiblingIndex(card.getSiblingIndex());
        const b = holder.addComponent(RunOverBlood);
        b.setup(card.position.x, card.position.y, w, h);
        return b;
    }

    private setup(cx: number, cy: number, w: number, h: number) {
        this.cardTop = cy + h / 2;
        this.cardBottom = cy - h / 2;
        this.poolMax = even(w * 0.95);
        this.poolW = even(w * 0.25);
        this.poolTo = this.poolW;
        const py = even(this.cardBottom - 12);
        this.poolDark = makeSprite(this.node, 'PoolDark', null, 1, 1, { x: cx, y: py - 4 });
        this.poolDark.color = colorOf(BLOOD.dark);
        this.pool = makeSprite(this.node, 'Pool', null, 1, 1, { x: cx, y: py });
        this.pool.color = colorOf(BLOOD.main);
        this.paintPool();
        // Three streams down each side, just outside the edge, at different heights.
        const xs = [cx - w / 2 - 5, cx - w / 2 - 11, cx + w / 2 + 5, cx + w / 2 + 11, cx - w / 2 - 5, cx + w / 2 + 5];
        xs.forEach((x, i) => {
            const body = makeSprite(this.node, `Stream${i}`, whiteFrame(), WIDTHS[i], 2, { x: even(x), y: 0 });
            const hex = i % 3 === 1 ? BLOOD.dark : BLOOD.main;
            body.color = colorOf(hex);
            body.node.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
            const d = fxFrame('drop', 1);
            const head = makeSprite(this.node, `Head${i}`, d.frame, d.w, d.h, { x: even(x), y: 0 });
            head.color = colorOf(hex);
            const s: Stream = { body, head, x: even(x), w: WIDTHS[i], phase: 0, t: 0, wait: 0.6 + i * 0.7 + rand(0, 0.8), run: 0, top: 0, end: 0, drips: 0 };
            this.hide(s);
            this.streams.push(s);
        });
    }

    private hide(s: Stream) { s.body.node.active = false; s.head.node.active = false; }

    private paintPool() {
        const w = even(this.poolW), h = Math.max(10, even(w * 0.1));
        this.pool!.spriteFrame = ellipseFrame(w, h);
        this.pool!.node.getComponent(UITransform)!.setContentSize(w, h);
        this.poolDark!.spriteFrame = ellipseFrame(w + 16, h + 6);
        this.poolDark!.node.getComponent(UITransform)!.setContentSize(w + 16, h + 6);
    }

    update(dt: number) {
        for (const s of this.streams) this.step(s, dt);
        // The pool grows in steps as blood reaches it, then breathes a little.
        if (this.poolW < this.poolTo) {
            this.poolW = Math.min(this.poolTo, this.poolW + 40 * dt);
            // Repainted every 16 px of growth only (each size is one cached frame).
            if (Math.floor(this.poolW / 16) !== Math.floor((this.poolW - 40 * dt) / 16)) this.paintPool();
        }
    }

    private step(s: Stream, dt: number) {
        s.t += dt;
        const len = this.cardTop - this.cardBottom;
        if (s.phase === 0) {
            if (s.t < s.wait) return;
            // Starts somewhere on the upper part of the edge; runs down at a slow, uneven pace.
            s.top = even(this.cardTop - rand(0.05, 0.5) * len);
            s.end = even(this.cardBottom + 2);
            s.run = rand(2.6, 4.2);
            s.phase = 1; s.t = 0;
            s.body.node.active = true; s.head.node.active = true;
        }
        if (s.phase === 1) {
            // Ease out a little and stutter: blood creeps.
            const k = Math.min(1, s.t / s.run);
            const creep = k + Math.sin(k * 23) * 0.012;
            const y = even(s.top - (s.top - s.end) * Math.min(1, creep));
            this.paint(s, s.top, y);
            if (k >= 1) { s.phase = 2; s.t = 0; s.drips = 0; }
            return;
        }
        if (s.phase === 2) {
            // Drips fall from the stream's end into the pool.
            if (s.t > 0.5 * (s.drips + 1) && s.drips < 3) {
                s.drips++;
                const d = fxFrame('drop', 0);
                Particles.dot(this.node, { x: s.x, y: s.end - 8, w: d.w, h: d.h, frame: d.frame, color: BLOOD.main, vx: 0, vy: 0, gravity: 300, life: 0.25 });
                this.poolTo = Math.min(this.poolMax, this.poolTo + 14);
            }
            if (s.t > 1.8) { s.phase = 3; s.t = 0; }
            return;
        }
        // Phase 3: the tail runs down after it; then it waits and starts again elsewhere.
        const k = Math.min(1, s.t / 1.6);
        const top = even(s.top - (s.top - s.end) * k * k);
        this.paint(s, top, s.end);
        if (k >= 1) { this.hide(s); s.phase = 0; s.t = 0; s.wait = rand(1.5, 4); }
    }

    private paint(s: Stream, top: number, bottom: number) {
        const h = Math.max(2, even(top - bottom));
        s.body.node.setPosition(s.x, top, 0);
        s.body.node.getComponent(UITransform)!.setContentSize(s.w, h);
        s.head.node.setPosition(s.x, bottom - 4, 0);
    }
}

const colorOf = (hex: string) => new Color().fromHEX(hex);
