// Hands of Fate — ui/impacts.ts (Stage E, decisions 158–161)
// What a landing projectile does to the cells it reaches, one look per effect, each with a
// few variants picked at random so repeated hits don't look stamped:
//   attack   a blood burst and splatter; the hit cells then bleed for about a second
//   rot      green ooze that bubbles and drips
//   heal     pink sparkles and plus signs rising
//   shield   a blue ring flash with shards
//   blocked  shards bouncing off the armour
// Plus `flinch` + `bleed` for the opponent's portrait and your health block when hurt.
// Everything is pooled pieces of ui/particles.ts: no timers, no tweens per piece. The pieces
// are white pixel shapes (pixelart.fxPiece) tinted to palette colours, kept on the 2 px grid,
// turned only in quarter turns and scaled in whole art pixels, so they stay crisp.

import { Node, Vec3, Tween, tween, UITransform } from 'cc';
import { fxAny, fxFrame } from './kitC';
import { Particles, toLayer } from './particles';
import type { FxKind } from './pixelart';

export const BLOOD = { main: '#C93038', dark: '#A93B3B' };
const GREEN = { main: '#309C63', dark: '#3C5956' };
const PINK = '#D47564', CREAM = '#ECECE0';
const BLUE = { hi: '#94D2D4', main: '#3978A8' };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const quarter = () => Math.floor(Math.random() * 4) * 90;

/** A piece flying out under gravity, fading near the end. */
function fling(layer: Node, kind: FxKind, at: Vec3, color: string, vx: number, vy: number, o: { gravity?: number; life?: number; delay?: number; spin?: number; variant?: number; scaleFrom?: number; scaleTo?: number } = {}) {
    const f = o.variant === undefined ? fxAny(kind) : fxFrame(kind, o.variant);
    const life = o.life ?? 0.5;
    Particles.dot(layer, {
        x: at.x, y: at.y, w: f.w, h: f.h, color, frame: f.frame, angle: kind === 'drop' ? 0 : quarter(),
        vx, vy, gravity: o.gravity ?? 900, spin: o.spin, delay: o.delay, life,
        fade: life * 0.4, fadeDelay: life * 0.6, scaleFrom: o.scaleFrom, scaleTo: o.scaleTo,
    });
}

/** A piece that sits still (a splat on the cell), fading. */
function stamp(layer: Node, kind: FxKind, at: Vec3, color: string, life: number, o: { scaleFrom?: number; scaleTo?: number; delay?: number; dx?: number; dy?: number } = {}) {
    const f = fxAny(kind);
    Particles.dot(layer, {
        x: at.x + (o.dx ?? 0), y: at.y + (o.dy ?? 0), w: f.w, h: f.h, color, frame: f.frame, angle: quarter(), life,
        fade: life * 0.5, fadeDelay: life * 0.5, scaleFrom: o.scaleFrom, scaleTo: o.scaleTo, delay: o.delay,
    });
}

// ---- Attack: blood ------------------------------------------------------------------------

/** Blood on one hit cell. `big` (0..1) grows with the hit; `dir` is the way the shot was going. */
export function bloodBurst(layer: Node, world: Vec3, big: number, dir: Vec3 | null) {
    const at = toLayer(layer, world);
    const v = Math.floor(Math.random() * 3);
    // The splat itself, punched in a size up then settling.
    stamp(layer, 'splat', at, pick([BLOOD.main, BLOOD.main, BLOOD.dark]), 0.7 + big * 0.3, { scaleFrom: 1.5, scaleTo: 1 });
    const n = 4 + Math.round(big * 3);
    if (v === 0) {
        // Radial burst: drops thrown all round, falling.
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + rand(0, 0.6), sp = rand(160, 300);
            fling(layer, 'drop', at, i % 3 ? BLOOD.main : BLOOD.dark, Math.cos(a) * sp, Math.sin(a) * sp + 120, { life: rand(0.45, 0.7) });
        }
    } else if (v === 1) {
        // Spray: carried on along the shot's path.
        const ang = dir ? Math.atan2(dir.y, dir.x) : rand(0, Math.PI * 2);
        for (let i = 0; i < n + 2; i++) {
            const a = ang + rand(-0.55, 0.55), sp = rand(200, 420);
            fling(layer, i % 2 ? 'drop' : 'shard', at, i % 3 ? BLOOD.main : BLOOD.dark, Math.cos(a) * sp, Math.sin(a) * sp + 80, { life: rand(0.35, 0.6), gravity: 700 });
        }
    } else {
        // Fountain: up and over, then down.
        for (let i = 0; i < n; i++) {
            fling(layer, 'drop', at, i % 3 ? BLOOD.main : BLOOD.dark, rand(-160, 160), rand(260, 420), { life: rand(0.6, 0.85), gravity: 1300 });
        }
        stamp(layer, 'splat', at, BLOOD.dark, 0.6, { dx: rand(-14, 14), dy: rand(-14, 14), delay: 0.08 });
    }
}

/** Just a splat on a cell (the extra cells of a big hit). */
export function splatOn(layer: Node, world: Vec3) {
    stamp(layer, 'splat', toLayer(layer, world), Math.random() < 0.7 ? BLOOD.main : BLOOD.dark, 0.8, { scaleFrom: 1.5, scaleTo: 1 });
}

/** A hit cell keeps bleeding for about a second: a few drops run down from it. */
export function cellBleed(layer: Node, world: Vec3, size: number, seconds = 1) {
    const at = toLayer(layer, world);
    const drops = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < drops; i++) {
        const from = new Vec3(at.x + rand(-size * 0.3, size * 0.3), at.y - size * 0.3, 0);
        fling(layer, 'drop', from, i % 2 ? BLOOD.main : BLOOD.dark, 0, rand(-10, 0), {
            gravity: rand(140, 260), life: rand(0.45, 0.7), delay: (i / drops) * seconds * 0.85 + rand(0, 0.1), variant: 0,
        });
    }
}

// ---- Rot: ooze ----------------------------------------------------------------------------

export function ooze(layer: Node, world: Vec3, size: number) {
    const at = toLayer(layer, world);
    stamp(layer, 'blob', at, GREEN.main, 0.8, { scaleFrom: 1, scaleTo: 1.5 });
    const many = Math.random() < 0.5;
    // Bubbles rise and pop (they just stop).
    const bubbles = many ? 4 : 2;
    for (let i = 0; i < bubbles; i++) {
        const f = fxAny('bubble');
        Particles.dot(layer, {
            x: at.x + rand(-size * 0.35, size * 0.35), y: at.y + rand(-4, 6), w: f.w, h: f.h, frame: f.frame, color: i % 2 ? GREEN.main : CREAM,
            vx: rand(-10, 10), vy: rand(40, 80), gravity: 0, delay: rand(0, 0.5), life: rand(0.35, 0.6),
        });
    }
    // Drips run down.
    const drips = many ? 2 : 4;
    for (let i = 0; i < drips; i++) {
        fling(layer, 'drop', new Vec3(at.x + rand(-size * 0.3, size * 0.3), at.y - size * 0.25, 0), i % 2 ? GREEN.main : GREEN.dark, 0, 0,
            { gravity: rand(120, 220), life: rand(0.5, 0.8), delay: rand(0.05, 0.55), variant: 1 });
    }
}

// ---- Heal: sparkles and plus signs ----------------------------------------------------------

export function healSparkle(layer: Node, world: Vec3, size: number) {
    const at = toLayer(layer, world);
    const ringOf = Math.random() < 0.5;
    const n = 4;
    for (let i = 0; i < n; i++) {
        const kind: FxKind = i % 2 ? 'sparkle' : 'plus';
        const f = fxAny(kind);
        const x = ringOf ? at.x + Math.cos((i / n) * Math.PI * 2) * size * 0.45 : at.x + rand(-size * 0.4, size * 0.4);
        Particles.dot(layer, {
            x, y: at.y + rand(-size * 0.3, 0), w: f.w, h: f.h, frame: f.frame, color: i % 3 === 2 ? CREAM : PINK,
            vx: rand(-14, 14), vy: rand(70, 130), gravity: -40, delay: i * 0.07, life: rand(0.55, 0.8), fade: 0.25, fadeDelay: 0.4,
        });
    }
}

// ---- Shield: a ring flash with shards ------------------------------------------------------

export function shieldFlash(layer: Node, world: Vec3) {
    const at = toLayer(layer, world);
    const f = fxFrame('ring');
    Particles.dot(layer, { x: at.x, y: at.y, w: f.w, h: f.h, frame: f.frame, color: BLUE.hi, life: 0.32, scaleFrom: 0.6, scaleTo: 1.6, fade: 0.14, fadeDelay: 0.18 });
    const n = Math.random() < 0.5 ? 4 : 6;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), sp = rand(120, 200);
        fling(layer, 'shard', at, i % 2 ? BLUE.hi : BLUE.main, Math.cos(a) * sp, Math.sin(a) * sp, { gravity: 200, life: rand(0.3, 0.45) });
    }
}

// ---- Blocked: shards bounce off ------------------------------------------------------------

export function blockedBounce(layer: Node, world: Vec3, dir: Vec3 | null) {
    const at = toLayer(layer, world);
    const back = dir ? Math.atan2(-dir.y, -dir.x) : Math.PI / 2;
    const f = fxFrame('ring');
    Particles.dot(layer, { x: at.x, y: at.y, w: f.w, h: f.h, frame: f.frame, color: CREAM, life: 0.18, scaleFrom: 1, scaleTo: 1.4, fade: 0.08, fadeDelay: 0.1 });
    for (let i = 0; i < 6; i++) {
        const a = back + rand(-0.9, 0.9), sp = rand(220, 380);
        fling(layer, 'shard', at, pick([BLUE.hi, CREAM, BLUE.main]), Math.cos(a) * sp, Math.sin(a) * sp + 160, { gravity: 1100, life: rand(0.45, 0.65), spin: rand(8, 14) });
    }
}

// ---- Portrait and health block: flinch and bleed -------------------------------------------

const home = new WeakMap<Node, Vec3>();

/** A hard little jolt away from the hit and back, scaled by the damage (0..1). Never drifts. */
export function flinch(n: Node, amount: number) {
    if (!n.isValid) return;
    let h = home.get(n);
    if (!h) { h = n.position.clone(); home.set(n, h); }
    Tween.stopAllByTarget(n);
    n.setPosition(h);
    const d = Math.round((6 + amount * 14) / 2) * 2, side = Math.random() < 0.5 ? -1 : 1;
    tween(n)
        .to(0.03, { position: new Vec3(h.x + d * side, h.y - d / 2, 0) })
        .to(0.05, { position: new Vec3(h.x - (d / 2) * side, h.y + 2, 0) })
        .to(0.07, { position: new Vec3(h.x + 2 * side, h.y, 0) })
        .to(0.06, { position: h })
        .start();
}

/** Blood on a portrait or the health block: a splat or two on it, then drips running down off it. */
export function bleedOn(layer: Node, target: Node, amount: number) {
    const ut = target.getComponent(UITransform);
    if (!ut || !target.isValid) return;
    const at = toLayer(layer, target.worldPosition);
    const w = ut.width, h = ut.height;
    const splats = 1 + Math.round(amount * 2);
    for (let i = 0; i < splats; i++) {
        stamp(layer, 'splat', at, i % 2 ? BLOOD.dark : BLOOD.main, 1.1, { dx: rand(-w * 0.3, w * 0.3), dy: rand(-h * 0.2, h * 0.3), delay: i * 0.05, scaleFrom: 1.5, scaleTo: 1 });
    }
    const drips = 2 + Math.round(amount * 3);
    for (let i = 0; i < drips; i++) {
        fling(layer, 'drop', new Vec3(at.x + rand(-w * 0.4, w * 0.4), at.y + rand(-h * 0.3, h * 0.2), 0), i % 2 ? BLOOD.main : BLOOD.dark, 0, 0,
            { gravity: rand(220, 420), life: rand(0.7, 1.1), delay: rand(0, 0.6), variant: i % 2 });
    }
}
