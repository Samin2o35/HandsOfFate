// Hands of Fate — ui/fx.ts
// Short effects drawn on an effects layer above everything:
//   flashRing  a crisp outline that pops round a cell and blinks out (hit, heal, rot, shield)
//   sparks     a few pixel squares flying out from a hit
// Positions are world positions (node.worldPosition), so effects line up with
// whatever they're about, wherever it sits on screen. Flashes and sparks are pooled
// pieces of ui/particles.ts (Stage B).

import { Node, Vec3 } from 'cc';
import { flashFrame } from './kitC';
import { Particles, EASE, toLayer } from './particles';

/** Effect colours, all from the open-table palette (gold, the heart pink, the deck's green, blue, red). */
export const FX_COLOR = {
    hit: '#FDD164',
    heal: '#D47564',
    rot: '#309C63',
    shield: '#3978A8',
    red: '#C93038',
};

/**
 * A crisp outline pops round a changed cell: drawn wide, then snug, then it blinks
 * out. Two drawn sizes instead of a smooth scale, so the pixels stay whole. Pooled
 * (ui/particles.ts): 0.07 s wide, snug until 0.27 s, hidden 0.27–0.33 s, gone at 0.41 s.
 */
export function flashRing(layer: Node, world: Vec3, size: number, color: string) {
    const wide = flashFrame(size + 20), snug = flashFrame(size + 8);
    const at = toLayer(layer, world);
    Particles.dot(layer, {
        x: at.x, y: at.y, w: wide.px, h: wide.px, color, frame: wide.frame, life: 0.41,
        swapAt: 0.07, swapFrame: snug.frame, swapW: snug.px, swapH: snug.px, hideFrom: 0.27, hideTo: 0.33,
    });
}

/** A few pixel squares flying out from a hit (pooled). */
export function sparks(layer: Node, world: Vec3, color: string, count = 4) {
    const start = toLayer(layer, world);
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8;
        const dist = 22 + Math.random() * 18;
        Particles.dot(layer, {
            x: start.x, y: start.y, w: 6, h: 6, color,
            tx: start.x + Math.cos(angle) * dist, ty: start.y + Math.sin(angle) * dist, move: 0.35, ease: EASE.quadOut,
            fade: 0.25, fadeDelay: 0.15,
        });
    }
}
