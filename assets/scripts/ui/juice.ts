// Hands of Fate — ui/juice.ts (plan phase 3)
// Fight feel on top of the grey boxes: projectiles per suit, impacts, stacking
// numbers, a shake/zoom rig for the game layer, a light dim and a star burst.
// All of it is visual: the fight rules run exactly as before, only the picture
// waits for the projectile (see FightScreen).

import { Node, Vec3, Color, UITransform, UIOpacity, Sprite, tween, Tween } from 'cc';
import { Suit, SUIT_COLOR_HEX } from '../core/cards';
import { Game } from '../app/Game';
import { UiKit, makeSprite } from './UiKit';
import { Particles, EASE } from './particles';

export const FLIGHT = 0.38;   // seconds a projectile takes (real time, so speed doesn't change it)

function toLocal(layer: Node, world: Vec3): Vec3 {
    return layer.getComponent(UITransform)!.convertToNodeSpaceAR(world);
}

function square(layer: Node, name: string, w: number, h: number, color: string): Sprite {
    const s = makeSprite(layer, name, UiKit.get().spark, w, h);
    s.color = new Color().fromHEX(color);
    return s;
}

/** What each suit throws: ♠ a blade streak, ♣ a glob that splats, ♥ pink motes, ♦ blue shards. */
const LOOK: Record<Suit, { w: number; h: number; color: string; trail: string; spin: boolean; motes: number }> = {
    S: { w: 34, h: 8, color: '#ECECE0', trail: SUIT_COLOR_HEX.S, spin: false, motes: 1 },
    C: { w: 16, h: 16, color: '#309C63', trail: SUIT_COLOR_HEX.C, spin: false, motes: 1 },
    H: { w: 8, h: 8, color: '#D47564', trail: '#C93038', spin: false, motes: 3 },
    D: { w: 14, h: 14, color: '#94D2D4', trail: SUIT_COLOR_HEX.D, spin: true, motes: 1 },
};

/**
 * Flies from `from` to `to` (world positions) on a curve, leaving a trail, then
 * calls onLand. Hearts send a few small motes; the last one to land calls onLand.
 * The pieces are pooled (ui/particles.ts); past its cap a shot flies unseen but still lands on time.
 */
export function launch(layer: Node, from: Vec3, to: Vec3, suit: Suit, onLand: () => void, delay = 0) {
    const look = LOOK[suit];
    const a = toLocal(layer, from), b = toLocal(layer, to);
    let landed = 0;
    for (let m = 0; m < look.motes; m++) {
        // The curve bows to one side; hearts' motes each take a slightly different path.
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const bow = (0.22 + m * 0.12) * len * (m % 2 ? -1 : 1) * (dx >= 0 ? 1 : -1);
        const ctrl = new Vec3((a.x + b.x) / 2 - (dy / len) * bow, (a.y + b.y) / 2 + (dx / len) * bow + len * 0.15, 0);
        Particles.shot(layer, {
            from: a, to: b, ctrl, w: look.w, h: look.h, color: look.color,
            trailColor: look.trail, trailSize: Math.max(6, look.h - 2), flight: FLIGHT, delay: delay + m * 0.04,
            pointAlong: suit === 'S', spin: look.spin ? 18 : 0, angle: suit === 'D' ? 45 : 0,
            onLand: () => {
                if (suit === 'C' && layer.isValid) splat(layer, b);
                if (++landed === look.motes) onLand();
            },
        });
    }
}

/** ♣ lands as a splat: a few green drops thrown outward. */
function splat(layer: Node, at: Vec3) {
    for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
        const d = 24 + Math.random() * 16;
        Particles.dot(layer, {
            x: at.x, y: at.y, w: 8, h: 8, color: i % 2 ? '#3C5956' : '#309C63',
            tx: at.x + Math.cos(ang) * d, ty: at.y + Math.sin(ang) * d, move: 0.22, ease: EASE.quadOut, fade: 0.2, fadeDelay: 0.12,
        });
    }
}

// ---- Numbers ------------------------------------------------------------------------------

/** Numbers landing on the same grid within half a second stack upward instead of overlapping. */
const stacks = new WeakMap<Node, { until: number; count: number }>();
let clock = 0;
export function tickJuice(dt: number) { clock += dt; }

export function popNumber(layer: Node, grid: Node, world: Vec3, text: string, color: string, suit: Suit | null) {
    const st = stacks.get(grid);
    const count = st && clock < st.until ? st.count + 1 : 0;
    stacks.set(grid, { until: clock + 0.5, count });
    const p = toLocal(layer, world);
    Particles.number(layer, { x: p.x, y: p.y + count * 44, text, color, icon: suit ? UiKit.get().suitIcon(suit) : null });
}

// ---- Game-layer rig: shake and zoom ---------------------------------------------------------

/**
 * Moves and scales the screen's content node (not the camera, so the safe area
 * stays put). Shake is "trauma" that decays; zoom eases toward a point and back.
 * Both are off when Options → Screen shake is off.
 */
export class Rig {
    private trauma = 0;
    private zoom = 1;
    private zoomTo = 1;
    private pivot = new Vec3();
    private holdUntil = 0;
    private t = 0;

    constructor(private readonly node: Node) {}

    /** amount 0..1 (a pair hit about 0.25, a straight flush cross 1). */
    shake(amount: number) {
        if (!Game.settings.shake) return;
        this.trauma = Math.min(1, this.trauma + amount);
    }

    /** A quick 3% push toward `world` (full house or better). */
    punch(world: Vec3) {
        if (!Game.settings.shake || !this.node.isValid) return;
        const parent = this.node.parent?.getComponent(UITransform);
        this.pivot = parent ? parent.convertToNodeSpaceAR(world) : world.clone();
        this.zoomTo = 1.03;
        this.holdUntil = this.t + 0.16;
    }

    update(dt: number) {
        if (!this.node.isValid) return;
        this.t += dt;
        if (this.t > this.holdUntil) this.zoomTo = 1;
        this.zoom += (this.zoomTo - this.zoom) * Math.min(1, dt * (this.zoomTo > this.zoom ? 30 : 9));
        this.trauma = Math.max(0, this.trauma - dt * 2.2);
        const amp = 18 * this.trauma * this.trauma;
        const sx = amp ? (Math.random() * 2 - 1) * amp : 0;
        const sy = amp ? (Math.random() * 2 - 1) * amp : 0;
        // Scale about the pivot: the pivot point stays where it is on screen.
        const z = this.zoom;
        this.node.setScale(z, z, 1);
        this.node.setPosition(this.pivot.x * (1 - z) + sx, this.pivot.y * (1 - z) + sy, 0);
    }
}

// ---- Lights and bursts ------------------------------------------------------------------------

/** The lights dip (a boss twist): a dark sheet over the screen, in and out. */
export function dimLights(screen: Node, seconds = 0.6) {
    const ut = screen.getComponent(UITransform)!;
    const s = square(screen, 'Dim', ut.width + 8, ut.height + 8, '#16121C');
    const op = s.node.addComponent(UIOpacity);
    op.opacity = 0;
    tween(op).to(seconds * 0.3, { opacity: 150 }).delay(seconds * 0.3).to(seconds * 0.4, { opacity: 0 }).call(() => s.node.destroy()).start();
}

/** A gold star burst (round won). */
export function starBurst(layer: Node, world: Vec3, count = 16) {
    const at = toLocal(layer, world);
    for (let i = 0; i < count; i++) {
        const long = i % 2 === 0;
        const ang = (Math.PI * 2 * i) / count;
        const d = (long ? 300 : 210) + Math.random() * 40;
        Particles.dot(layer, {
            x: at.x, y: at.y, w: long ? 40 : 22, h: 8, color: i % 4 === 0 ? '#ECECE0' : '#FDD164', angle: ang * 180 / Math.PI,
            tx: at.x + Math.cos(ang) * d, ty: at.y + Math.sin(ang) * d, move: 0.45, ease: EASE.quadOut, fade: 0.3, fadeDelay: 0.3,
        });
    }
}

/** Cards of a firing hand flash and snap up, then drop back with a small bounce. */
export function firePop(card: Node, baseY: number) {
    Tween.stopAllByTarget(card);
    card.setScale(1, 1, 1);
    tween(card)
        .to(0.06, { scale: new Vec3(1.12, 1.12, 1), position: new Vec3(card.position.x, baseY + 16, 0) })
        .to(0.16, { scale: new Vec3(1, 1, 1), position: new Vec3(card.position.x, baseY, 0) }, { easing: 'backOut' })
        .start();
}
