// Hands of Fate — ui/RunOverScreen.ts
// Mockup 09. The King Suicide art, "The King has fallen", the run's stats, who
// beat you, and the Ace you're closest to. The run is recorded in the profile
// and its save removed as soon as this screen opens.

import { _decorator, Node, UITransform, Widget, Color, tween, Vec3 } from 'cc';
import { Sound } from '../app/Sound';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run, RoundResult } from '../core/run';
import { HAND_INFO } from '../core/hands';
import { ACES, AceId, closestAce } from '../core/achievements';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, FONT } from './UiKit';
import { frame, barFrame, INK_TEXT } from './kitC';
import { ButtonStyle } from './UiButton';
import { CARD_W, CARD_H, buildAvatar } from './views';
import { dashedLine, statRow } from './parts';
import { celebrateAces } from './Modal';
const { ccclass } = _decorator;

const MARGIN = 30;

@ccclass('RunOverScreen')
export class RunOverScreen extends GameScreen {
    private run: Run | null = null;
    private result: RoundResult | null = null;
    private earned: AceId[] = [];
    private content: Node | null = null;

    onShow(params?: unknown) {
        const p = params as { run?: Run; result?: RoundResult; preview?: boolean } | undefined;
        this.run = p?.run ?? Game.run;
        this.result = p?.result ?? this.run?.data.lastResult ?? null;
        if (!this.run) { ScreenManager.show('Title'); return; }
        Sound.music(null);
        // hof.preview('RunOver') shows a sample run: don't record it or touch the profile.
        if (!p?.preview) {
            Game.endRun();
            this.earned = Game.takePendingAces();
        } else {
            this.earned = [];
        }
        UiKit.ready.then(() => this.scheduleOnce(() => {
            this.build();
            celebrateAces(this.node, this.earned);
        }, 0));
    }

    private build() {
        const run = this.run!;
        const kit = UiKit.get();
        if (!this.node.isValid) return;
        this.node.getComponent(Widget)?.updateAlignment();
        const ut = this.node.getComponent(UITransform)!;
        // Tall screens (4:3 tablets): keep the content in a centred band, not stretched to the edges.
        const W = Math.min(ut.width, 1920), H = Math.min(ut.height, 1200);
        if (!this.content) this.content = makeNode(this.node, 'Content', W, H);
        clearChildren(this.content);
        const root = this.content;
        const L0 = -W / 2 + MARGIN, R = W / 2 - MARGIN, T = H / 2, B = -H / 2;

        // Landscape: the fallen King on the left, the stats on the right.
        const artW = 480;
        const art = makeSprite(root, 'Fallen', kit.frame('concept/king_fallen_1x'), artW, 720, { x: L0 + 40 + artW / 2, y: 0 });
        art.node.setScale(1.08, 1.08, 1);
        tween(art.node).to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
        const L = L0 + 40 + artW + 80;
        const innerW = R - L;
        const cx = L + innerW / 2;

        const plaqueTop = T - 40, plaqueH = 140;
        const plaque = frame(root, 'Plaque', innerW + 10, plaqueH + 10, { x: cx, y: plaqueTop - (plaqueH + 10) / 2 }, { closed: true });
        makeLabel(plaque, 'Title', 'THE KING HAS FALLEN', { size: FONT.title - 6, spacing: 3, color: INK_TEXT.red, y: 20 });
        makeLabel(plaque, 'Sub', 'Your health grid is empty. The run is over.', { font: 'body', size: FONT.bodySmall, color: INK_TEXT.main, y: -32 });

        // Stats.
        const statsTop = plaqueTop - plaqueH - 30, statsH = 390;
        const stats = frame(root, 'Stats', innerW + 10, statsH + 10, { x: cx, y: statsTop - (statsH + 10) / 2 }, { caption: 'THE RUN' });
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
        buildAvatar(stats, 'Avatar', o.avatar, !!o.boss, CARD_W * 0.75, CARD_H * 0.75, { x: x0 + 34, y: avatarY });
        makeLabel(stats, 'BeatenBy', 'Beaten by', { font: 'body', size: FONT.bodySmall, color: INK_TEXT.second, align: 'left', x: x0 + 90, y: avatarY + 18 });
        makeLabel(stats, 'Who', this.result?.opponent ?? o.name, { size: FONT.label + 6, color: INK_TEXT.main, align: 'left', x: x0 + 90, y: avatarY - 16 });

        this.buildAce(root, L, innerW, statsTop - statsH - 34);

        const bw = (innerW - 18) / 2;
        makeButton(root, 'NewRun', ButtonStyle.Red, 'New Run', bw, 100, { x: L + bw / 2, y: B + 40 + 50 }, () => this.newRun());
        makeButton(root, 'Title', ButtonStyle.Dark, 'Title screen', bw, 100, { x: R - bw / 2, y: B + 40 + 50 }, () => ScreenManager.show('Title'));
    }

    /** "CLOSEST ACE · ENDLESS  Reach round 50 · best 14  [bar]", or the Ace just earned. */
    private buildAce(root: Node, L: number, innerW: number, top: number) {
        const kit = UiKit.get();
        const h = 135;
        const panel = frame(root, 'Ace', innerW, h + 6, { x: L + innerW / 2, y: top - (h + 6) / 2 }, { caption: 'CLOSEST ACE' });
        const justEarned = this.earned.length ? ACES.find((a) => a.id === this.earned[0])! : null;
        const close = justEarned ? null : closestAce(Game.profile);
        const ace = justEarned ?? close?.ace ?? null;
        const left = -innerW / 2 + 33;
        if (!ace) {
            makeLabel(panel, 'All', 'ALL FOUR ACES EARNED', { size: FONT.label + 3, spacing: 2, color: INK_TEXT.gold, align: 'left', x: left, y: 3 });
            return;
        }
        // The Classic Ace; a dark overlay (not a tint of the art) shows it's still locked.
        const card = makeSprite(panel, 'AceCard', kit.classicFrame({ suit: ace.suit, rank: 14 }), 66, 92, { x: left + 33, y: 3 });
        if (!justEarned) {
            const lock = makeSprite(card.node, 'Locked', kit.spark, 66, 92);
            lock.color = new Color(0x16, 0x12, 0x1c, 184);
        }
        const tx = left + 90;
        makeLabel(panel, 'Title', justEarned ? `ACE EARNED · ${ace.name.toUpperCase()}` : `CLOSEST ACE · ${ace.name.toUpperCase()}`, { size: FONT.labelSmall, spacing: 2, color: INK_TEXT.gold, align: 'left', x: tx, y: 36 });
        const best = Game.profile.aces[ace.id].best;
        makeLabel(panel, 'Goal', justEarned ? ace.goal : `${ace.goal} · best ${best.toLocaleString('en-US')}`, { font: 'body', size: FONT.bodySmall, color: INK_TEXT.main, align: 'left', x: tx, y: 4 });
        const barLeft = tx;
        const barTotal = Math.round((innerW / 2 - 33 - barLeft) / 2) * 2;
        frame(panel, 'Track', barTotal, 16, { x: barLeft + barTotal / 2, y: -30 }, { closed: true, color: 'soft' });
        const fraction = justEarned ? 1 : close!.fraction;
        if (fraction > 0) makeSprite(panel, 'Fill', barFrame(barTotal - 12, fraction, INK_TEXT.gold), barTotal - 12, 6, { x: barLeft + barTotal / 2, y: -30 });
    }

    private newRun() {
        const run = Game.newRun();
        ScreenManager.show('Planning', { run });
    }
}
