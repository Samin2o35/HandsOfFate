// Hands of Fate — ui/fx.ts
// Short effects drawn on an effects layer above everything:
//   flashRing  a ring that pops out from a cell and fades (hit, heal, rot, shield)
//   sparks     a few pixel squares flying out from a hit
//   floatText  "-3" / "+8" rising and fading
//   shake      a quick shake of a node (a grid being hit)
// Positions are world positions (node.worldPosition), so effects line up with
// whatever they're about, wherever it sits on screen.

import { Node, Color, UIOpacity, UITransform, Vec2, Vec3, tween } from 'cc';
import { UiKit, makeSprite, makeLabel, FONT } from './UiKit';

export const FX_COLOR = {
    hit: '#E9C46A',
    heal: '#FF8FB0',
    rot: '#4FB067',
    shield: '#3978A8',
    red: '#D2453C',
};

function toLocal(layer: Node, world: Vec3): Vec3 {
    return layer.getComponent(UITransform)!.convertToNodeSpaceAR(world);
}

function fadeOut(n: Node, seconds: number, delay = 0) {
    const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
    tween(op).delay(delay).to(seconds, { opacity: 0 }).call(() => n.destroy()).start();
}

export function flashRing(layer: Node, world: Vec3, size: number, color: string) {
    const s = makeSprite(layer, 'Flash', UiKit.get().ringWhite, size + 10, size + 10, {}, true);
    s.color = new Color().fromHEX(color);
    s.node.setPosition(toLocal(layer, world));
    s.node.setScale(1.35, 1.35, 1);
    tween(s.node).to(0.18, { scale: new Vec3(1, 1, 1) }).start();
    fadeOut(s.node, 0.4, 0.2);
}

export function sparks(layer: Node, world: Vec3, color: string, count = 4) {
    const start = toLocal(layer, world);
    for (let i = 0; i < count; i++) {
        const s = makeSprite(layer, 'Spark', UiKit.get().spark, 6, 6);
        s.color = new Color().fromHEX(color);
        s.node.setPosition(start);
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8;
        const dist = 22 + Math.random() * 18;
        const end = new Vec3(start.x + Math.cos(angle) * dist, start.y + Math.sin(angle) * dist, 0);
        tween(s.node).to(0.35, { position: end }, { easing: 'quadOut' }).start();
        fadeOut(s.node, 0.25, 0.15);
    }
}

export function floatText(layer: Node, world: Vec3, text: string, color: string) {
    const l = makeLabel(layer, 'Float', text, { size: FONT.heading + 6, color });
    l.enableShadow = true;
    l.shadowColor = new Color(18, 14, 26, 255);
    l.shadowOffset = new Vec2(3, -3);
    const p = toLocal(layer, world);
    l.node.setPosition(p);
    tween(l.node).to(0.8, { position: new Vec3(p.x, p.y + 50, 0) }, { easing: 'quadOut' }).start();
    fadeOut(l.node, 0.35, 0.5);
}

export function shake(n: Node, strength = 6) {
    const home = n.position.clone();
    tween(n)
        .to(0.04, { position: new Vec3(home.x + strength, home.y, 0) })
        .to(0.04, { position: new Vec3(home.x - strength, home.y, 0) })
        .to(0.04, { position: new Vec3(home.x + strength / 2, home.y, 0) })
        .to(0.04, { position: home })
        .start();
}

/** Briefly turns something on (a glow ring), then off. */
export function blink(n: Node, seconds = 0.35) {
    n.active = true;
    tween(n).delay(seconds).call(() => { n.active = false; }).start();
}

