// Hands of Fate — ui/Modal.ts
// Full-screen pop-ups drawn on top of a screen:
//   confirmBox   "Replace your saved run?"  Yes / No
//   celebrateAce the Ace earned celebration (card pops in with a gold ring and sparks)
// Both dim the screen and block touches underneath until closed.

import { Node, UITransform, Color, BlockInputEvents, tween, Vec3 } from 'cc';
import { ACES, AceId } from '../core/achievements';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, FONT, COLOR } from './UiKit';
import { ButtonStyle } from './UiButton';
import { sparks, FX_COLOR } from './fx';

/** A dimmed layer over the whole host that swallows touches. */
export function dimLayer(host: Node, name: string, alpha = 200): Node {
    const ut = host.getComponent(UITransform)!;
    const layer = makeNode(host, name, ut.width, ut.height);
    layer.addComponent(BlockInputEvents);
    const dim = makeSprite(layer, 'Dim', UiKit.get().spark, ut.width, ut.height);
    dim.color = new Color(10, 8, 16, alpha);
    return layer;
}

export function confirmBox(host: Node, title: string, text: string, yes: string, no: string, onYes: () => void, onNo?: () => void): Node {
    const kit = UiKit.get();
    const layer = dimLayer(host, 'Confirm');
    const panel = makeSprite(layer, 'Panel', kit.panelCream, 760, 420, {}, true).node;
    makeLabel(panel, 'Title', title, { size: FONT.heading + 6, spacing: 2, color: COLOR.ink, y: 130 });
    makeLabel(panel, 'Text', text, { font: 'body', size: FONT.bodySmall + 3, color: COLOR.ink, y: 50, width: 640, height: 90 });
    const close = () => { if (layer.isValid) layer.destroy(); };
    makeButton(panel, 'Yes', ButtonStyle.Red, yes, 310, 100, { x: -170, y: -100 }, () => { close(); onYes(); });
    makeButton(panel, 'No', ButtonStyle.Dark, no, 310, 100, { x: 170, y: -100 }, () => { close(); onNo?.(); });
    return layer;
}

/** Shows each earned Ace in turn; calls onDone when the last one is closed. */
export function celebrateAces(host: Node, aces: AceId[], onDone?: () => void) {
    if (aces.length === 0) { onDone?.(); return; }
    const [first, ...rest] = aces;
    celebrateAce(host, first, () => celebrateAces(host, rest, onDone));
}

export function celebrateAce(host: Node, id: AceId, onClose?: () => void): Node {
    const kit = UiKit.get();
    const ace = ACES.find((a) => a.id === id)!;
    const layer = dimLayer(host, 'AceEarned', 215);

    makeLabel(layer, 'Banner', 'ACE EARNED', { size: FONT.title, spacing: 5, color: COLOR.gold, y: 560 });
    // The card at 2× with a gold ring and a pulsing glow behind it.
    const holder = makeNode(layer, 'Card', 200, 280, { y: 220 });
    const glow = makeSprite(holder, 'Glow', kit.ringWhite, 250, 330, {}, true);
    glow.color = new Color().fromHEX(COLOR.gold);
    tween(glow.node).repeatForever(tween(glow.node).to(0.6, { scale: new Vec3(1.06, 1.06, 1) }).to(0.6, { scale: new Vec3(1, 1, 1) })).start();
    makeSprite(holder, 'Ace', kit.classicFrame({ suit: ace.suit, rank: 14 }), 180, 252);
    makeSprite(holder, 'Ring', kit.cardFrameGold, 192, 264, {}, true);
    holder.setScale(0.2, 0.2, 1);
    tween(holder).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).call(() => {
        for (let i = 0; i < 4; i++) sparks(layer, holder.worldPosition, i % 2 ? FX_COLOR.hit : COLOR.cream, 8);
    }).start();

    const title = makeSprite(layer, 'Plaque', kit.panelCream, 760, 200, { y: -60 }, true).node;
    makeSprite(title, 'Suit', kit.suitIcon(ace.suit), 36, 36, { x: -150, y: 40 });
    makeLabel(title, 'Name', ace.name.toUpperCase(), { size: FONT.title - 12, spacing: 3, color: COLOR.ink, x: 20, y: 40 });
    makeLabel(title, 'Goal', `${ace.goal}.`, { font: 'body', size: FONT.bodySmall + 3, color: COLOR.ink, y: -30, width: 680, height: 70 });

    makeButton(layer, 'Close', ButtonStyle.Red, 'Brilliant', 500, 100, { y: -300 }, () => {
        if (layer.isValid) layer.destroy();
        onClose?.();
    });
    return layer;
}
