// Hands of Fate — ui/particles.ts (Stage B, decision 140)
// Every short-lived effect piece (projectiles, trail dots, sparks, splats, stars, cell
// flashes, floating numbers) comes from one pool and is moved by one update loop here,
// instead of a new node and a tween or two per piece. A late fight used to make and
// destroy ~7 nodes and keep up to ~560 tweens alive every frame; now nodes are reused
// and capped, and the dots all share the white square's texture, so they batch.
//
// ScreenManager adds this component to the Canvas (no editor step). The layout tool
// calls Particles.tick() itself.
//
//   Particles.dot(layer, {...})     a square or a frame that moves, fades, swaps frames, blinks
//   Particles.shot(layer, {...})    a projectile on a curve, dropping trail dots, then onLand
//   Particles.number(layer, {...})  "-3" with a suit pip, popping up and fading
// Positions are in the layer's own space.

import { _decorator, Component, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Color, Vec3, Label, Vec2 } from 'cc';
import { whiteFrame } from './kitC';
import { makeLabel, makeSprite, FONT } from './UiKit';
const { ccclass } = _decorator;

/** At most this many of each live at once; past it, new dots are skipped and shots fly unseen. */
export const LIMITS = { dots: 460, shots: 64, numbers: 16 };
/** Trails stop adding dots this close to the dot cap, so impacts always have room (Stage E). */
export const TRAIL_ROOM = 240;

export type Ease = (t: number) => number;
export const EASE = {
    linear: ((t) => t) as Ease,
    quadOut: ((t) => 1 - (1 - t) * (1 - t)) as Ease,
    sineIn: ((t) => 1 - Math.cos((t * Math.PI) / 2)) as Ease,
    backOut: ((t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }) as Ease,
};

export interface DotOptions {
    x: number; y: number;
    w: number; h: number;
    color: string;
    /** Default: the white square (tinted by color). */
    frame?: SpriteFrame;
    /** Move to (tx, ty) over `move` seconds. */
    tx?: number; ty?: number; move?: number; ease?: Ease;
    /** Fade out over `fade` seconds after `fadeDelay`. With no fade the dot just ends at `life`. */
    fade?: number; fadeDelay?: number;
    /** Total seconds (default: the end of the move or the fade, whichever is later). */
    life?: number;
    angle?: number;
    /** Swap to another frame and size at a given age (the cell flash: wide, then snug). */
    swapAt?: number; swapFrame?: SpriteFrame; swapW?: number; swapH?: number;
    /** Hidden between these ages (the flash's blink). */
    hideFrom?: number; hideTo?: number;
    /** Draw just below this node (trail dots under their projectile). */
    below?: Node;
    /** Physics instead of a tween move (Stage E): velocity px/s, gravity px/s² (down). */
    vx?: number; vy?: number; gravity?: number;
    /** Quarter turns per second (whole quarter turns only, so the pixels stay square). */
    spin?: number;
    /** Scale from → to over the life (linear). */
    scaleFrom?: number; scaleTo?: number;
    /** Seconds before it appears. */
    delay?: number;
}

export interface ShotOptions {
    from: Vec3; to: Vec3;
    /** Control point of the quadratic curve; with ctrl2 the curve is cubic. */
    ctrl: Vec3;
    ctrl2?: Vec3;
    /** A small bright head drawn over the body (Stage E). */
    headColor?: string; headSize?: number;
    /** Trail: a dot every `trailEvery` px (default 14), living `trailLife` s (0.18), shrinking to `trailShrink` (1), with gaps (0..1 chance to skip). */
    trailEvery?: number; trailLife?: number; trailShrink?: number; trailGaps?: number;
    w: number; h: number;
    color: string;
    trailColor: string; trailSize: number;
    flight: number;
    delay?: number;
    /** Blades point along their path; shards spin. */
    pointAlong?: boolean; spin?: number;
    angle?: number;
    onLand: () => void;
}

export interface NumberOptions {
    x: number; y: number;
    text: string; color: string;
    icon?: SpriteFrame | null;
}

interface Piece { node: Node; sprite: Sprite; op: UIOpacity; ut: UITransform; }

interface Dot extends Piece {
    age: number; life: number; o: DotOptions; swapped: boolean; hidden: boolean;
    x: number; y: number; vx: number; vy: number; shown: boolean;
}

interface Shot {
    layer: Node; piece: Piece | null; head: Piece | null; age: number; o: ShotOptions;
    lastX: number; lastY: number; started: boolean;
}

interface Num { layer: Node; holder: Node; label: Label; icon: Sprite; op: UIOpacity; age: number; x: number; y: number; }

const pool: Piece[] = [];
const numberPool: Num[] = [];
const dots: Dot[] = [];
const shots: Shot[] = [];
const nums: Num[] = [];

/** Work done, for tools/layout's perf report and the tests. */
export const particleStats = { made: 0, reused: 0, skipped: 0 };

function colorOf(hex: string): Color { return new Color().fromHEX(hex); }

/** A pooled sprite on `layer`, shown, opaque, unrotated, on top (or just below `below`). */
function take(layer: Node, frame: SpriteFrame, w: number, h: number, color: string, below?: Node): Piece {
    let p: Piece | undefined;
    while (pool.length && !p) {
        const q = pool.pop()!;
        if (q.node.isValid) p = q;
    }
    if (p) {
        particleStats.reused++;
        if (p.node.parent !== layer) { p.node.layer = layer.layer; p.node.setParent(layer); }
        p.node.active = true;
        p.node.setSiblingIndex(layer.children.length - 1);
    } else {
        particleStats.made++;
        const sprite = makeSprite(layer, 'Fx', frame, w, h);
        const node = sprite.node;
        p = { node, sprite, op: node.addComponent(UIOpacity), ut: node.getComponent(UITransform)! };
    }
    if (p.sprite.spriteFrame !== frame) p.sprite.spriteFrame = frame;
    p.sprite.enabled = true;
    p.ut.setContentSize(w, h);
    p.sprite.color = colorOf(color);
    p.op.opacity = 255;
    p.node.angle = 0;
    p.node.setScale(1, 1, 1);
    if (below?.isValid && below.parent === layer) p.node.setSiblingIndex(below.getSiblingIndex());
    return p;
}

function give(p: Piece) {
    if (!p.node.isValid) return;
    p.node.active = false;
    pool.push(p);
}

@ccclass('HoFParticles')
export class Particles extends Component {
    /** A hidden node under the Canvas that keeps the pieces between screens (decision 165). */
    private static park: Node | null = null;

    onLoad() {
        const n = new Node('ParkedFx');
        n.layer = this.node.layer;
        this.node.addChild(n);
        n.active = false;
        Particles.park = n;
    }

    update(dt: number) { Particles.tick(dt); }

    /**
     * Before a screen is destroyed (ScreenManager): every piece, live or waiting, moves to the
     * parked node instead of being destroyed with the screen, and the live ones stop. The next
     * screen reuses them, so a run no longer makes and destroys thousands of nodes.
     */
    static parkAll() {
        const park = Particles.park;
        if (!park?.isValid) return;
        const keep = (n: Node) => { if (n.isValid && n.parent !== park) n.setParent(park); };
        for (const d of dots) { keep(d.node); pool.push(d); }
        for (const s of shots) { if (s.piece) { keep(s.piece.node); pool.push(s.piece); } if (s.head) { keep(s.head.node); pool.push(s.head); } }
        for (const p of pool) keep(p.node);
        for (const n of nums) { n.holder.active = false; numberPool.push(n); }
        for (const n of numberPool) keep(n.holder);
        dots.length = 0; shots.length = 0; nums.length = 0;
        // Only the pieces themselves (not dots' extra state) go back to the pool.
        for (let i = 0; i < pool.length; i++) { const q = pool[i]; pool[i] = { node: q.node, sprite: q.sprite, op: q.op, ut: q.ut }; }
    }

    /** Live pieces right now (dots, shots, numbers). */
    static get live(): number { return dots.length + shots.length + nums.length; }
    /** Pieces waiting in the pool (the layout tool's run-after-run check). */
    static get pooled(): number { return pool.length + numberPool.length; }

    static dot(layer: Node, o: DotOptions): void {
        if (!layer.isValid) return;
        if (dots.length >= LIMITS.dots) { particleStats.skipped++; return; }
        const p = take(layer, o.frame ?? whiteFrame(), o.w, o.h, o.color, o.below);
        p.node.setPosition(o.x, o.y, 0);
        if (o.angle) p.node.angle = o.angle;
        if (o.scaleFrom !== undefined) p.node.setScale(o.scaleFrom, o.scaleFrom, 1);
        const delay = o.delay ?? 0;
        if (delay > 0) p.node.active = false;
        const end = Math.max(o.move ?? 0, (o.fadeDelay ?? 0) + (o.fade ?? 0));
        dots.push({ ...p, age: -delay, life: o.life ?? end, o, swapped: false, hidden: false, x: o.x, y: o.y, vx: o.vx ?? 0, vy: o.vy ?? 0, shown: delay <= 0 });
    }

    static shot(layer: Node, o: ShotOptions): void {
        if (!layer.isValid) return;
        let piece: Piece | null = null;
        if (shots.length < LIMITS.shots) {
            piece = take(layer, whiteFrame(), o.w, o.h, o.color);
            piece.node.setPosition(o.from);
            piece.node.active = false;
            if (o.angle) piece.node.angle = o.angle;
        } else particleStats.skipped++;
        let head: Piece | null = null;
        if (piece && o.headColor) {
            const hs = o.headSize ?? Math.max(4, Math.round(Math.min(o.w, o.h) / 2));
            head = take(layer, whiteFrame(), hs, hs, o.headColor);
            head.node.setPosition(o.from);
            head.node.active = false;
        }
        shots.push({ layer, piece, head, age: -(o.delay ?? 0), o, lastX: o.from.x, lastY: o.from.y, started: false });
    }

    static number(layer: Node, o: NumberOptions): void {
        if (!layer.isValid) return;
        if (nums.length >= LIMITS.numbers) { particleStats.skipped++; return; }
        let n: Num | undefined;
        while (numberPool.length && !n) { const q = numberPool.pop()!; if (q.holder.isValid) n = q; }
        if (!n) {
            const holder = new Node('Number');
            holder.layer = layer.layer;
            layer.addChild(holder);
            holder.addComponent(UITransform);
            const label = makeLabel(holder, 'Text', o.text, { size: FONT.heading + 9, color: o.color });
            label.enableShadow = true;
            label.shadowColor = new Color(18, 14, 26, 255);
            label.shadowOffset = new Vec2(3, -3);
            const icon = makeSprite(holder, 'Icon', null, 26, 26);
            n = { layer, holder, label, icon, op: holder.addComponent(UIOpacity), age: 0, x: 0, y: 0 };
        } else if (n.holder.parent !== layer) { n.holder.layer = layer.layer; n.holder.setParent(layer); }
        n.layer = layer;
        n.holder.active = true;
        n.holder.setSiblingIndex(layer.children.length - 1);
        if (n.label.string !== o.text) n.label.string = o.text;
        n.label.color = colorOf(o.color);
        n.label.node.setPosition(o.icon ? 14 : 0, 0, 0);
        n.icon.node.active = !!o.icon;
        if (o.icon) { n.icon.spriteFrame = o.icon; n.icon.node.setPosition(-22 - o.text.length * 9, 0, 0); }
        n.op.opacity = 255;
        n.age = 0; n.x = o.x; n.y = o.y;
        n.holder.setPosition(o.x, o.y, 0);
        n.holder.setScale(0.4, 0.4, 1);
        nums.push(n);
    }

    /** Advances everything by dt seconds (real time). */
    static tick(dt: number) {
        for (let i = dots.length - 1; i >= 0; i--) {
            const d = dots[i];
            d.age += dt;
            if (!d.node.isValid) { dots.splice(i, 1); continue; }
            if (d.age < 0) continue;
            if (!d.shown) { d.shown = true; d.node.active = true; }
            if (d.age >= d.life) { give(d); dots.splice(i, 1); continue; }
            const o = d.o;
            if (o.move && o.tx !== undefined && o.ty !== undefined) {
                const k = (o.ease ?? EASE.linear)(Math.min(1, d.age / o.move));
                d.node.setPosition(o.x + (o.tx - o.x) * k, o.y + (o.ty - o.y) * k, 0);
            } else if (o.vx !== undefined || o.vy !== undefined || o.gravity) {
                d.vy -= (o.gravity ?? 0) * dt;
                d.x += d.vx * dt; d.y += d.vy * dt;
                // On the 2 px art grid, so the pieces stay crisp.
                d.node.setPosition(Math.round(d.x / 2) * 2, Math.round(d.y / 2) * 2, 0);
            }
            if (o.spin) d.node.angle = (o.angle ?? 0) + Math.floor(d.age * o.spin) * 90;
            if (o.scaleTo !== undefined) {
                const a = o.scaleFrom ?? 1, k = Math.min(1, d.age / Math.max(0.001, d.life));
                // Stepped so the drawn size stays a whole number of art pixels.
                const big = Math.max(2, o.w, o.h), sc = Math.max(2, Math.round((a + (o.scaleTo - a) * k) * big / 2) * 2) / big;
                d.node.setScale(sc, sc, 1);
            }
            if (o.fade) {
                const f = (d.age - (o.fadeDelay ?? 0)) / o.fade;
                if (f > 0) d.op.opacity = Math.max(0, Math.round(255 * (1 - f)));
            }
            if (!d.swapped && o.swapAt !== undefined && d.age >= o.swapAt && o.swapFrame) {
                d.swapped = true;
                d.sprite.spriteFrame = o.swapFrame;
                d.ut.setContentSize(o.swapW ?? o.w, o.swapH ?? o.h);
            }
            if (o.hideFrom !== undefined && o.hideTo !== undefined) {
                const hide = d.age >= o.hideFrom && d.age < o.hideTo;
                if (hide !== d.hidden) { d.hidden = hide; d.sprite.enabled = !hide; }
            }
        }

        for (let i = shots.length - 1; i >= 0; i--) {
            const s = shots[i];
            if (!s.layer.isValid) { shots.splice(i, 1); continue; }
            s.age += dt;
            if (s.age < 0) continue;
            const o = s.o, p = s.piece;
            if (p && !p.node.isValid) s.piece = null;
            if (s.head && !s.head.node.isValid) s.head = null;
            if (s.piece && !s.started) { s.started = true; s.piece.node.active = true; if (s.head) s.head.node.active = true; }
            const t = EASE.sineIn(Math.min(1, s.age / o.flight)), u = 1 - t;
            let x: number, y: number;
            if (o.ctrl2) {
                // Cubic: two control points (Stage E's random paths).
                const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
                x = a * o.from.x + b * o.ctrl.x + c * o.ctrl2.x + d * o.to.x;
                y = a * o.from.y + b * o.ctrl.y + c * o.ctrl2.y + d * o.to.y;
            } else {
                x = u * u * o.from.x + 2 * u * t * o.ctrl.x + t * t * o.to.x;
                y = u * u * o.from.y + 2 * u * t * o.ctrl.y + t * t * o.to.y;
            }
            if (s.piece) {
                const n = s.piece.node;
                const ang = Math.atan2(y - n.position.y, x - n.position.x) * 180 / Math.PI;
                if (o.pointAlong) n.angle = ang;
                if (o.spin) n.angle += o.spin;
                n.setPosition(x, y, 0);
                if (s.head) {
                    // The head sits at the front of the body, along its path.
                    const r = (o.pointAlong ? o.w : Math.max(o.w, o.h)) / 4, rad = ang * Math.PI / 180;
                    s.head.node.setPosition(x + Math.cos(rad) * r, y + Math.sin(rad) * r, 0);
                }
                const every = o.trailEvery ?? 14;
                if (Math.hypot(x - s.lastX, y - s.lastY) > every) {
                    if ((!o.trailGaps || Math.random() >= o.trailGaps) && dots.length < LIMITS.dots - TRAIL_ROOM) {
                        Particles.dot(s.layer, { x, y, w: o.trailSize, h: o.trailSize, color: o.trailColor, fade: o.trailLife ?? 0.18,
                            scaleFrom: 1, scaleTo: o.trailShrink ?? 1, below: n });
                    }
                    s.lastX = x; s.lastY = y;
                }
            }
            if (s.age >= o.flight) {
                if (s.piece) give(s.piece);
                if (s.head) give(s.head);
                shots.splice(i, 1);
                o.onLand();
            }
        }

        for (let i = nums.length - 1; i >= 0; i--) {
            const n = nums[i];
            n.age += dt;
            if (!n.holder.isValid) { nums.splice(i, 1); continue; }
            if (n.age >= 0.9) { n.holder.active = false; numberPool.push(n); nums.splice(i, 1); continue; }
            // Pop 0.4 → 1.15 (0.12 s, back out) → 1 (0.08 s), then rise 46 px over 0.7 s; fade from 0.6 s.
            const a = n.age;
            const sc = a < 0.12 ? 0.4 + 0.75 * EASE.backOut(a / 0.12) : a < 0.2 ? 1.15 - 0.15 * ((a - 0.12) / 0.08) : 1;
            n.holder.setScale(sc, sc, 1);
            const rise = a > 0.2 ? 46 * EASE.quadOut(Math.min(1, (a - 0.2) / 0.7)) : 0;
            n.holder.setPosition(n.x, n.y + rise, 0);
            if (a > 0.6) n.op.opacity = Math.max(0, Math.round(255 * (1 - (a - 0.6) / 0.3)));
        }
    }

    /** Drops everything (tests). */
    static reset() {
        dots.length = 0; shots.length = 0; nums.length = 0; pool.length = 0; numberPool.length = 0;
        particleStats.made = 0; particleStats.reused = 0; particleStats.skipped = 0;
    }
}

/** Layer-space position of a world point. */
export function toLayer(layer: Node, world: Vec3): Vec3 {
    return layer.getComponent(UITransform)!.convertToNodeSpaceAR(world);
}
