// Hands of Fate — ui/AchievementsScreen.ts
// Mockup 10, landscape: the four Aces in one row. Each shows its Classic Ace card (a dark
// "LOCKED" overlay sits on top of the art until it's earned; the art itself is
// never tinted), its name with the suit icon, the goal, a progress bar and the best.

import { _decorator, Node, UITransform, Widget, Color } from 'cc';
import { Sound } from '../app/Sound';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { ACES } from '../core/achievements';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, textWidth, FONT } from './UiKit';
import { frame, ringFrame, barFrame, INK_TEXT } from './kitC';
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
        // Tall screens (4:3 tablets): keep the content in a centred band, not stretched to the edges.
        const W = Math.min(ut.width, 1920), H = Math.min(ut.height, 1200);
        if (!this.content) this.content = makeNode(this.node, 'Content', W, H);
        clearChildren(this.content);
        const root = this.content;
        const T = H / 2, B = -H / 2;

        const plaque = frame(root, 'Plaque', 520, 130, { y: T - 40 - 65 }, { closed: true });
        makeLabel(plaque, 'Title', 'THE FOUR ACES', { size: FONT.heading + 9, spacing: 3, color: INK_TEXT.main, y: 20 });
        makeLabel(plaque, 'Sub', 'The hardest feats. Each takes many runs.', { font: 'body', size: FONT.bodySmall, color: INK_TEXT.second, y: -24 });

        // One row of four, centred between the plaque and the Back button.
        const colX = [-690, -230, 230, 690];
        const top = T - 205;
        ACES.forEach((ace, i) => {
            const prog = Game.profile.aces[ace.id];
            const x = colX[i];
            const cell = makeNode(root, `Ace ${ace.id}`, 440, 480, { x, y: top - 240 });
            // Each Ace sits in its own open bracket on the smoke.
            frame(cell, 'Bracket', 440, 480, {}).setSiblingIndex(0);
            const cardY = 240 - 126;
            makeSprite(cell, 'Card', kit.classicFrame({ suit: ace.suit, rank: 14 }), 180, 252, { y: cardY });
            if (prog.earned) {
                makeSprite(cell, 'Ring', ringFrame(204, 276, 'gold'), 204, 276, { y: cardY });
            } else {
                // A dark cover laid over the art (the art itself is never tinted), LOCKED across it.
                const lock = makeSprite(cell, 'Locked', kit.spark, 180, 252, { y: cardY });
                lock.color = new Color(0x16, 0x12, 0x1c, 184);
                makeLabel(cell, 'LockedText', 'LOCKED', { size: FONT.label + 3, spacing: 2, color: INK_TEXT.main, y: cardY });
            }
            const nameY = cardY - 126 - 36;
            const name = makeLabel(cell, 'Name', ace.name, { size: FONT.heading + 3, color: INK_TEXT.main, y: nameY });
            makeSprite(cell, 'Suit', kit.suitIcon(ace.suit), 27, 27, { x: -textWidth(name) / 2 - 24, y: nameY });
            makeLabel(cell, 'Goal', `${ace.goal}.`, { font: 'body', size: 26, color: INK_TEXT.second, y: nameY - 32, width: 400, height: 62, anchorY: 1 });
            const barY = nameY - 118;
            // Progress: a soft closed rail with a flat gold fill inside it.
            frame(cell, 'Track', 380, 16, { y: barY }, { closed: true, color: 'soft' });
            const fraction = Math.min(1, prog.best / ace.target);
            if (fraction > 0) makeSprite(cell, 'Fill', barFrame(368, fraction, INK_TEXT.gold), 368, 6, { y: barY });
            const bestText = prog.earned ? 'Earned!' : `Best: ${prog.best.toLocaleString('en-US')} / ${ace.target.toLocaleString('en-US')}`;
            makeLabel(cell, 'Best', bestText, { font: 'body', size: 26, color: prog.earned ? INK_TEXT.gold : INK_TEXT.second, y: barY - 34 });
        });

        makeButton(root, 'Back', ButtonStyle.Dark, 'Back', 600, 100, { y: B + 40 + 50 }, () => ScreenManager.show('Title'));
    }
}
