// Hands of Fate — ui/AchievementsScreen.ts
// Mockup 10: the four Aces in a 2×2 grid. Each shows its Classic Ace card (a dark
// "LOCKED" overlay sits on top of the art until it's earned; the art itself is
// never tinted), its name with the suit icon, the goal, a progress bar and the best.

import { _decorator, Node, UITransform, Widget, Color } from 'cc';
import { Sound } from '../app/Sound';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { ACES } from '../core/achievements';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, textWidth, FONT, COLOR } from './UiKit';
import { ButtonStyle } from './UiButton';
const { ccclass } = _decorator;

@ccclass('AchievementsScreen')
export class AchievementsScreen extends GameScreen {
    private content: Node | null = null;

    onShow() {
        Game.load();
        Sound.music('menu');
        UiKit.ready.then(() => this.scheduleOnce(() => this.build(), 0));
    }

    private build() {
        const kit = UiKit.get();
        if (!this.node.isValid) return;
        this.node.getComponent(Widget)?.updateAlignment();
        const ut = this.node.getComponent(UITransform)!;
        const W = Math.min(ut.width, 1080), H = ut.height;
        if (!this.content) this.content = makeNode(this.node, 'Content', W, H);
        clearChildren(this.content);
        const root = this.content;
        const T = H / 2, B = -H / 2;

        const plaque = makeSprite(root, 'Plaque', kit.panelCream, 520, 130, { y: T - 40 - 65 }, true).node;
        makeLabel(plaque, 'Title', 'THE FOUR ACES', { size: FONT.heading + 9, spacing: 3, color: COLOR.ink, y: 20 });
        makeLabel(plaque, 'Sub', 'The hardest feats. Each takes many runs.', { font: 'body', size: FONT.bodySmall, color: '#3D3450', y: -24 });

        const colX = [-270, 270];
        const rowTop = [T - 225, T - 732];
        ACES.forEach((ace, i) => {
            const prog = Game.profile.aces[ace.id];
            const x = colX[i % 2], top = rowTop[Math.floor(i / 2)];
            const cell = makeNode(root, `Ace ${ace.id}`, 500, 480, { x, y: top - 240 });
            const cardY = 240 - 126;
            makeSprite(cell, 'Card', kit.classicFrame({ suit: ace.suit, rank: 14 }), 180, 252, { y: cardY });
            if (prog.earned) {
                makeSprite(cell, 'Ring', kit.cardFrameGold, 192, 264, { y: cardY }, true);
            } else {
                const lock = makeSprite(cell, 'Locked', kit.spark, 180, 252, { y: cardY });
                lock.color = new Color(18, 14, 26, 150);
                makeLabel(cell, 'LockedText', 'LOCKED', { size: FONT.label + 3, spacing: 2, color: COLOR.cream, y: cardY });
            }
            const nameY = cardY - 126 - 36;
            const name = makeLabel(cell, 'Name', ace.name, { size: FONT.heading + 3, color: COLOR.cream, y: nameY });
            makeSprite(cell, 'Suit', kit.suitIcon(ace.suit), 27, 27, { x: -textWidth(name) / 2 - 24, y: nameY });
            makeLabel(cell, 'Goal', `${ace.goal}.`, { font: 'body', size: 26, color: COLOR.lilac, y: nameY - 32, width: 460, height: 62, anchorY: 1 });
            const barY = nameY - 118;
            makeSprite(cell, 'Track', kit.barTrack, 440, 14, { y: barY }, true);
            const fraction = Math.min(1, prog.best / ace.target);
            if (fraction > 0) makeSprite(cell, 'Fill', kit.barFillGold, Math.max(14, 440 * fraction), 14, { x: -220, y: barY, anchorX: 0 }, true);
            const bestText = prog.earned ? 'Earned!' : `Best: ${prog.best.toLocaleString('en-US')} / ${ace.target.toLocaleString('en-US')}`;
            makeLabel(cell, 'Best', bestText, { font: 'body', size: 26, color: prog.earned ? COLOR.gold : COLOR.cream, y: barY - 34 });
        });

        makeButton(root, 'Back', ButtonStyle.Dark, 'Back', W - 60, 100, { y: B + 40 + 50 }, () => ScreenManager.show('Title'));
    }
}
