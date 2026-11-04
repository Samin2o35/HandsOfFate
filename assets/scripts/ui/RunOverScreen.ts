// Hands of Fate — ui/RunOverScreen.ts
// Mockup 09. The King Suicide art, "The King has fallen", the run's stats, who
// beat you, and the Ace you're closest to. The run is recorded in the profile
// and its save removed as soon as this screen opens.

import { _decorator, Node, UITransform, Widget, Color, tween, Vec3 } from 'cc';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run, RoundResult } from '../core/run';
import { HAND_INFO } from '../core/hands';
import { ACES, AceId, closestAce } from '../core/achievements';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, FONT, COLOR } from './UiKit';
import { ButtonStyle } from './UiButton';
import { CARD_W, CARD_H } from './views';
import { dashedLine, statRow } from './parts';
const { ccclass } = _decorator;

const MARGIN = 30;

@ccclass('RunOverScreen')
export class RunOverScreen extends GameScreen {
    private run: Run | null = null;
    private result: RoundResult | null = null;
    private earned: AceId[] = [];
    private content: Node | null = null;

    onShow(params?: unknown) {
        const p = params as { run?: Run; result?: RoundResult } | undefined;
        this.run = p?.run ?? Game.run;
        this.result = p?.result ?? this.run?.data.lastResult ?? null;
        if (!this.run) { ScreenManager.show('Title'); return; }
        this.earned = Game.endRun();
        UiKit.ready.then(() => this.scheduleOnce(() => this.build(), 0));
    }

    private build() {
        const run = this.run!;
        const kit = UiKit.get();
        if (!this.node.isValid) return;
        this.node.getComponent(Widget)?.updateAlignment();
        const ut = this.node.getComponent(UITransform)!;
        const W = Math.min(ut.width, 1080), H = ut.height;
        if (!this.content) this.content = makeNode(this.node, 'Content', W, H);
        clearChildren(this.content);
        const root = this.content;
        const L = -W / 2 + MARGIN, R = W / 2 - MARGIN, T = H / 2, B = -H / 2;
        const innerW = R - L;

        // The art at 2× of its 240×360 1× file (crisp), dropping in.
        const art = makeSprite(root, 'Fallen', kit.frame('concept/king_fallen_1x'), 480, 720, { y: T - 60 - 360 });
        art.node.setScale(1.08, 1.08, 1);
        tween(art.node).to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();

        const plaqueTop = T - 835, plaqueH = 140;
        const plaque = makeSprite(root, 'Plaque', kit.panelCream, innerW + 10, plaqueH + 10, { y: plaqueTop - (plaqueH + 10) / 2 }, true).node;
        makeLabel(plaque, 'Title', 'THE KING HAS FALLEN', { size: FONT.title - 6, spacing: 3, color: '#D2453C', y: 20 });
        makeLabel(plaque, 'Sub', 'Your health grid is empty. The run is over.', { font: 'body', size: FONT.bodySmall, color: COLOR.ink, y: -32 });

        // Stats.
        const statsTop = plaqueTop - plaqueH - 30, statsH = 390;
        const stats = makeSprite(root, 'Stats', kit.panelCream, innerW + 10, statsH + 10, { y: statsTop - (statsH + 10) / 2 }, true).node;
        const x0 = -(innerW + 10) / 2 + 40, x1 = (innerW + 10) / 2 - 40;
        const best = run.data.totals.bestHand;
        const rows: [string, string][] = [
            ['Reached', `Round ${run.round}`],
            ['Run score', run.score.toLocaleString('en-US')],
            ['Hands fired', run.data.totals.handsFired.toLocaleString('en-US')],
            ['Best hand', best ? HAND_INFO[best].name : '–'],
        ];
        rows.forEach(([name, value], i) => {
            const y = statsH / 2 - 42 - i * 56;
            statRow(stats, name, '', value, x0, x1, y);
            dashedLine(stats, x0, x1, y - 28);
        });
        const o = run.opponent;
        const avatarY = -statsH / 2 + 70;
        makeSprite(stats, 'Avatar', kit.classicFrame(o.avatar), CARD_W * 0.75, CARD_H * 0.75, { x: x0 + 34, y: avatarY });
        makeLabel(stats, 'BeatenBy', 'Beaten by', { font: 'body', size: FONT.bodySmall, color: '#3D3450', align: 'left', x: x0 + 90, y: avatarY + 18 });
        makeLabel(stats, 'Who', this.result?.opponent ?? o.name, { size: FONT.label + 6, color: COLOR.ink, align: 'left', x: x0 + 90, y: avatarY - 16 });

        this.buildAce(root, L, innerW, statsTop - statsH - 30);

        const bw = (innerW - 18) / 2;
        makeButton(root, 'NewRun', ButtonStyle.Red, 'New Run', bw, 100, { x: L + bw / 2, y: B + 40 + 50 }, () => this.newRun());
        makeButton(root, 'Title', ButtonStyle.Dark, 'Title screen', bw, 100, { x: R - bw / 2, y: B + 40 + 50 }, () => ScreenManager.show('Title'));
    }

    /** "CLOSEST ACE · ENDLESS  Reach round 50 · best 14  [bar]", or the Ace just earned. */
    private buildAce(root: Node, L: number, innerW: number, top: number) {
        const kit = UiKit.get();
        const h = 135;
        const panel = makeSprite(root, 'Ace', kit.panelDark, innerW, h + 6, { x: L + innerW / 2, y: top - (h + 6) / 2 }, true).node;
        const justEarned = this.earned.length ? ACES.find((a) => a.id === this.earned[0])! : null;
        const close = justEarned ? null : closestAce(Game.profile);
        const ace = justEarned ?? close?.ace ?? null;
        const left = -innerW / 2 + 33;
        if (!ace) {
            makeLabel(panel, 'All', 'ALL FOUR ACES EARNED', { size: FONT.label + 3, spacing: 2, color: COLOR.gold, align: 'left', x: left, y: 3 });
            return;
        }
        // The Classic Ace; a dark overlay (not a tint of the art) shows it's still locked.
        const card = makeSprite(panel, 'AceCard', kit.classicFrame({ suit: ace.suit, rank: 14 }), 66, 92, { x: left + 33, y: 3 });
        if (!justEarned) {
            const lock = makeSprite(card.node, 'Locked', kit.spark, 66, 92);
            lock.color = new Color(18, 14, 26, 150);
        }
        const tx = left + 90;
        makeLabel(panel, 'Title', justEarned ? `ACE EARNED · ${ace.name.toUpperCase()}` : `CLOSEST ACE · ${ace.name.toUpperCase()}`, { size: FONT.labelSmall, spacing: 2, color: COLOR.gold, align: 'left', x: tx, y: 36 });
        const best = Game.profile.aces[ace.id].best;
        makeLabel(panel, 'Goal', justEarned ? ace.goal : `${ace.goal} · best ${best.toLocaleString('en-US')}`, { font: 'body', size: FONT.bodySmall, color: COLOR.cream, align: 'left', x: tx, y: 4 });
        const barLeft = tx;
        const barTotal = innerW / 2 - 33 - barLeft;
        makeSprite(panel, 'Track', kit.barTrack, barTotal, 12, { x: barLeft + barTotal / 2, y: -30 }, true);
        const fraction = justEarned ? 1 : close!.fraction;
        if (fraction > 0) makeSprite(panel, 'Fill', kit.barFillGold, Math.max(12, barTotal * fraction), 12, { x: barLeft, y: -30, anchorX: 0 }, true);
    }

    private newRun() {
        const run = Game.newRun();
        ScreenManager.show('Planning', { run });
    }
}
