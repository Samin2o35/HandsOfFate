// Hands of Fate — ui/flame.ts (decision 167)
// A pixel fire burning behind a card: the boss King on his intro (in his suit's colours) and
// an earned Ace (gold). Drawn from Samin's fire references as ideas, in our own pixels:
// round blobs are born hot at the base and along the sides, rise and sway, shrink, and cool
// step by step (cream core, then the bright, middle and dark colours of the suit, then smoke),
// with embers thrown up past the flames. The card covers the middle, so what shows is fire
// licking round its edges and climbing above it.
//
// Every piece is a white pixel disc (kitC.flameDiscFrame), one flame pixel = 4 screen px,
// sized only in whole pixels and recoloured only in flat palette steps, kept on the 4 px grid.
// A fixed pool of nodes, made once and reused; nothing is created while it burns. Cocos's
// ParticleSystem2D was not used: it blends colours and scales smoothly, so it can't give the
// stepped, crisp look, and this pool is already one batch of about 130 sprites.
// Options → Background: Full burns at full rate, Low at half, Off holds the fire still.

import { _decorator, Component, Node, Sprite, Color, UITransform } from 'cc';
import { makeNode, makeSprite } from './UiKit';
import { flameDiscFrame } from './kitC';
import { Smoke } from '../app/Smoke';
const { ccclass } = _decorator;

/** Hot to cold: core, then the suit's bright, middle, dark colours, then smoke. Palette only. */
export const FLAME_RAMPS: Record<string, readonly string[]> = {
    H: ['#ECECE0', '#FDD164', '#D47564', '#C93038', '#A93B3B', '#3B324A'],
    D: ['#ECECE0', '#94D2D4', '#3978A8', '#047B96', '#3B324A'],
    C: ['#ECECE0', '#94D2D4', '#309C63', '#3C5956', '#3B324A'],
    S: ['#ECECE0', '#D47564', '#8E478C', '#8E478C', '#3B324A'],
    gold: ['#ECECE0', '#FDD164', '#D47564', '#A93B3B', '#3B324A'],
};

const BLOBS = 180;
const EMBERS = 16;
/** Flame pixel (screen px): positions snap to it. */
const PX = 4;
const MAX_R = 14;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const snap = (v: number) => Math.round(v / PX) * PX;

interface Blob {
    sprite: Sprite; ut: UITransform;
    alive: boolean; age: number; life: number;
    x: number; y: number; vx: number; vy: number; r0: number;
    phase: number; stage: number; r: number;
    /** First colour step: the base starts white-hot, the sides and top at the bright colour. */
    hot: number;
}

@ccclass('HoFFlame')
export class Flame extends Component {
    private ramp: readonly string[] = FLAME_RAMPS.H;
    private colors: Color[] = [];
    private layers: Node[] = [];
    private blobs: Blob[] = [];
    private embers: Blob[] = [];
    private w = 270;
    private h = 378;
    private spawnAcc = 0;
    private emberAcc = 0;
    private clock = 0;

    /**
     * Fire behind a card w x h centred at (x, y) in `parent`. Add it before the card, so it
     * draws behind. `ramp` is a suit ('S', 'H', 'C', 'D') or 'gold'.
     */
    static attach(parent: Node, name: string, w: number, h: number, at: { x?: number; y?: number }, ramp: string): Flame {
        const n = makeNode(parent, name, w, h, { x: at.x ?? 0, y: at.y ?? 0 });
        const f = n.addComponent(Flame);
        f.setup(w, h, FLAME_RAMPS[ramp] ?? FLAME_RAMPS.H);
        return f;
    }

    private setup(w: number, h: number, ramp: readonly string[]) {
        this.w = w; this.h = h; this.ramp = ramp;
        this.colors = ramp.map((c) => new Color().fromHEX(c));
        // One layer per step, coldest at the back, so hot cores always sit on top.
        for (let i = ramp.length - 1; i >= 0; i--) this.layers[i] = makeNode(this.node, `Step${i}`, 1, 1);
        for (let i = ramp.length - 1; i >= 0; i--) this.layers[i].setSiblingIndex(ramp.length - 1 - i);
        const make = (k: number): Blob => {
            const d = flameDiscFrame(1);
            const sprite = makeSprite(this.layers[0], `Blob${k}`, d.frame, d.size, d.size);
            sprite.node.active = false;
            return { sprite, ut: sprite.node.getComponent(UITransform)!, alive: false, age: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, r0: 1, phase: 0, stage: -1, r: -1, hot: 0 };
        };
        for (let k = 0; k < BLOBS; k++) this.blobs.push(make(k));
        for (let k = 0; k < EMBERS; k++) this.embers.push(make(BLOBS + k));
        // Start already burning: run two seconds ahead.
        for (let i = 0; i < 120; i++) this.step(1 / 60);
    }

    update(dt: number) {
        const motion = Smoke.motion();
        if (motion === 'off') return;
        this.step(Math.min(dt, 1 / 20) * (motion === 'low' ? 0.6 : 1));
    }

    private step(dt: number) {
        this.clock += dt;
        // About 160 blobs alive at once at full rate.
        this.spawnAcc += dt * 125;
        while (this.spawnAcc >= 1) { this.spawnAcc--; this.spawnBlob(); }
        this.emberAcc += dt * 11;
        while (this.emberAcc >= 1) { this.emberAcc--; this.spawnEmber(); }
        const top = this.h / 2;
        for (const b of this.blobs) {
            if (!b.alive) continue;
            b.age += dt;
            if (b.age >= b.life) { this.kill(b); continue; }
            const k = b.age / b.life;
            // Rise, a little faster as it goes; sway; above the card, draw in toward the middle.
            b.vy += 60 * dt;
            const sway = Math.sin(this.clock * 3.1 + b.phase) * 26;
            const pull = b.y > top - 60 ? -b.x * 1.6 : 0;
            b.x += (b.vx + sway + pull) * dt;
            b.y += b.vy * dt;
            // Shrinks to nothing; cools through the steps (the core only at the very start).
            const r = Math.max(1, Math.round(b.r0 * (1 - k * 0.92)));
            const n = this.ramp.length - 1;
            const stage = Math.min(n, k < 0.14 ? b.hot : Math.max(b.hot, 1 + Math.floor(Math.pow((k - 0.14) / 0.86, 0.85) * n)));
            this.paint(b, r, stage);
            b.sprite.node.setPosition(snap(b.x), snap(b.y), 0);
        }
        for (const e of this.embers) {
            if (!e.alive) continue;
            e.age += dt;
            if (e.age >= e.life) { this.kill(e); continue; }
            const k = e.age / e.life;
            e.x += (e.vx + Math.sin(this.clock * 7 + e.phase) * 30) * dt;
            e.y += e.vy * dt;
            e.vy *= 1 - 0.8 * dt;
            // Embers stay small and bright, then go dark; they flicker near the end.
            const stage = k < 0.5 ? 1 : k < 0.8 ? 2 : this.ramp.length - 1;
            this.paint(e, 0, stage);
            e.sprite.node.active = !(k > 0.7 && Math.floor(e.age * 20) % 3 === 0);
            e.sprite.node.setPosition(snap(e.x), snap(e.y), 0);
        }
    }

    private spawnBlob() {
        const b = this.blobs.find((q) => !q.alive);
        if (!b) return;
        const w = this.w / 2, h = this.h / 2;
        const where = Math.random();
        let big: number;
        if (where < 0.24) {
            // Along the bottom edge: the white-hot base.
            b.x = rand(-w - 16, w + 16); b.y = rand(-h - 14, -h + 24); big = 1; b.hot = 0;
        } else if (where < 0.5) {
            // The rim: bigger, darker, further out and behind, so the fire has a dark edge.
            const s = Math.random() < 0.5 ? -1 : 1;
            b.x = s * (w + rand(20, 56)); b.y = rand(-h, h * 0.6); big = 1.05;
            b.hot = Math.max(1, this.ramp.length - 3);
        } else if (where < 0.88) {
            // Up a side, mostly just outside the edge, so the fire wraps round the card and climbs.
            const s = Math.random() < 0.5 ? -1 : 1;
            b.x = s * (w + rand(-8, 36)); b.y = rand(-h, h * 0.45); big = 0.9; b.hot = 1;
        } else {
            // Over the top edge: feeds the plume above the card.
            b.x = rand(-w * 0.7, w * 0.7); b.y = rand(h * 0.6, h); big = 0.8; b.hot = 1;
        }
        b.vx = rand(-12, 12);
        b.vy = rand(120, 210);
        b.life = rand(0.85, 1.45);
        b.r0 = Math.round(rand(6, MAX_R) * big);
        b.phase = rand(0, Math.PI * 2);
        this.wake(b);
    }

    private spawnEmber() {
        const e = this.embers.find((q) => !q.alive);
        if (!e) return;
        const w = this.w / 2, h = this.h / 2;
        e.x = rand(-w - 20, w + 20); e.y = rand(-h * 0.3, h);
        e.vx = rand(-50, 50); e.vy = rand(160, 300);
        e.life = rand(0.6, 1.3); e.phase = rand(0, Math.PI * 2);
        this.wake(e);
    }

    private wake(b: Blob) {
        b.alive = true; b.age = 0; b.stage = -1; b.r = -1;
        b.sprite.node.active = true;
    }

    private kill(b: Blob) {
        b.alive = false;
        b.sprite.node.active = false;
    }

    /** Only touches the sprite when its size or colour step changes. */
    private paint(b: Blob, r: number, stage: number) {
        if (r !== b.r) {
            b.r = r;
            const d = flameDiscFrame(Math.min(MAX_R, r));
            b.sprite.spriteFrame = d.frame;
            b.ut.setContentSize(d.size, d.size);
        }
        if (stage !== b.stage) {
            b.stage = stage;
            b.sprite.color = this.colors[stage];
            b.sprite.node.setParent(this.layers[stage]);
        }
    }
}
