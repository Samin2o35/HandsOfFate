// Hands of Fate — ui/BossIntroScreen.ts
// Mockup 08. Before a boss round's planning: the animated King, his name and
// meeting, the twist with tier badges, what changed since last time, the counter,
// and his table. FACE HIM goes on to planning.

import { _decorator, Node, UITransform, Widget, tween, Vec3 } from 'cc';
import { Sound } from '../app/Sound';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run } from '../core/run';
import { Suit, SUIT_COLOR_HEX } from '../core/cards';
import { BOSSES, twistText, twistChange, meetingText, tierNumeral } from '../core/bosses';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, textWidth, FONT } from './UiKit';
import { frame, INK_TEXT } from './kitC';
import { Aura } from '../app/Aura';
import { ButtonStyle } from './UiButton';
import { buildAvatar } from './views';
import { buildOpponentStrip } from './OpponentStrip';
import { buildTopBar } from './parts';
import { PlanningMessage } from './flow';
const { ccclass } = _decorator;

const MARGIN = 30;
/** The suit whose effect counters each boss (from the GDD's Counter column). */
const COUNTER_SUIT: Record<Suit, Suit> = { S: 'D', H: 'C', C: 'D', D: 'S' };
const TIER_BADGES = 4;

@ccclass('BossIntroScreen')
export class BossIntroScreen extends GameScreen {
    private run: Run | null = null;
    private message: PlanningMessage | undefined;
    private content: Node | null = null;

    onShow(params?: unknown) {
        const p = params as { run?: Run; message?: PlanningMessage } | undefined;
        this.run = p?.run ?? Game.run;
        this.message = p?.message;
        if (!this.run || !this.run.opponent.boss) { ScreenManager.show('Planning', { run: this.run }); return; }
        Sound.music('boss');
        Sound.play('boss');
        UiKit.ready.then(() => this.scheduleOnce(() => this.build(), 0));
    }

    private build() {
        const run = this.run!;
        const boss = run.opponent.boss!;
        const info = BOSSES[boss.suit];
        const kit = UiKit.get();
        if (!this.node.isValid) return;
        this.node.getComponent(Widget)?.updateAlignment();
        const ut = this.node.getComponent(UITransform)!;
        const W = Math.min(ut.width, 1920), H = ut.height;
        if (!this.content) this.content = makeNode(this.node, 'Content', W, H);
        clearChildren(this.content);
        const root = this.content;
        const L = -W / 2 + MARGIN, R = W / 2 - MARGIN, T = H / 2, B = -H / 2;
        const suitColor = SUIT_COLOR_HEX[boss.suit];

        buildTopBar(root, run.score, `ROUND ${run.round}`, 'Boss round', L, R, T, () => this.toTitle());

        // Tall screens (4:3 tablets): the body sits in a centred band under the top bar.
        const bT = Math.min(T, 600), bB = Math.max(B, -600);
        // Landscape: the King and FACE HIM on the left, what he does on the right.
        const leftW = 620;
        const leftX = L + leftW / 2;
        const colL = L + leftW + 60, colW = R - colL;
        const colX = colL + colW / 2;

        // The King, animated, in an aura of the background's smoke in his suit colour (Stage E, decision 163).
        const kingY = 40;
        Aura.attach(root, 'Aura', 270, 378, { x: leftX, y: kingY }, suitColor);
        const king = buildAvatar(root, 'King', { suit: boss.suit, rank: 13 }, true, 270, 378, { x: leftX, y: kingY }).node;
        // He drops in.
        king.setScale(1.25, 1.25, 1);
        tween(king).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        makeButton(root, 'Face', ButtonStyle.Red, 'FACE HIM', leftW, 100, { x: leftX, y: bB + 40 + 50 }, () => this.face(), FONT.button + 6);

        // Name plaque.
        const nameTop = bT - 150, nameH = 120;
        const name = frame(root, 'NamePlaque', colW, nameH + 10, { x: colX, y: nameTop - (nameH + 10) / 2 }, { closed: true });
        makeLabel(name, 'Meeting', `BOSS · ${meetingText(boss.tier).toUpperCase()}`, { size: FONT.labelSmall, spacing: 2, color: INK_TEXT.second, y: 30 });
        const title = makeLabel(name, 'Name', info.name.toUpperCase(), { size: FONT.title - 6, spacing: 3, color: INK_TEXT.main, y: -16 });
        const tw = textWidth(title);
        makeSprite(name, 'Suit', kit.suitIcon(boss.suit), 45, 45, { x: -tw / 2 - 36, y: -14 });

        // Twist panel: name + tier badges, rule for this tier, what changed.
        const twistTop = nameTop - nameH - 26, twistH = 200;
        const twist = frame(root, 'Twist', colW, twistH + 10, { x: colX, y: twistTop - (twistH + 10) / 2 });
        const x0 = -colW / 2 + 40, x1 = colW / 2 - 40;
        makeLabel(twist, 'Name', info.twist.toUpperCase(), { size: FONT.heading + 6, spacing: 2, color: suitColor, align: 'left', x: x0, y: twistH / 2 - 36 });
        for (let i = 0; i < TIER_BADGES; i++) {
            const lit = i < boss.tier;
            const bx = x1 - 30 - (TIER_BADGES - 1 - i) * 68;
            // Lit tiers are filled in his suit colour; the rest are empty rails.
            const badge = frame(twist, `Tier${i}`, 60, 66, { x: bx, y: twistH / 2 - 38 }, { closed: true, color: lit ? 'cream' : 'soft', fill: lit ? suitColor : undefined });
            makeLabel(badge, 'N', tierNumeral(i + 1), { size: FONT.label + 3, color: lit ? INK_TEXT.main : INK_TEXT.quiet, y: 2 });
        }
        if (boss.tier > TIER_BADGES) makeLabel(twist, 'TierMore', `Tier ${tierNumeral(boss.tier)}`, { size: FONT.labelSmall, color: suitColor, align: 'right', x: x1, y: twistH / 2 - 80 });
        makeLabel(twist, 'Rule', twistText(boss.suit, boss.tier), { font: 'body', size: FONT.bodySmall + 3, color: INK_TEXT.main, align: 'left', x: x0, y: 10, width: x1 - x0, height: 56, anchorY: 0.5 });
        const change = twistChange(boss.suit, boss.tier) ?? 'Each time you meet him, this gets one tier stronger.';
        makeLabel(twist, 'Change', `Tier ${tierNumeral(boss.tier)}: ${change}`, { font: 'body', size: 26, color: INK_TEXT.second, align: 'left', x: x0, y: -twistH / 2 + 48, width: x1 - x0, height: 32 });

        // Counter strip.
        const counterTop = twistTop - twistH - 26, counterH = 66;
        const counter = frame(root, 'Counter', colW, counterH + 6, { x: colX, y: counterTop - (counterH + 6) / 2 }, { closed: true });
        const cs = COUNTER_SUIT[boss.suit];
        makeSprite(counter, 'Icon', kit.suitIcon(cs), 27, 27, { x: -colW / 2 + 45, y: 3 });
        const cl = makeLabel(counter, 'Label', 'Counter:', { size: FONT.label + 3, color: SUIT_COLOR_HEX[cs], align: 'left', x: -colW / 2 + 70, y: 3 });
        makeLabel(counter, 'Text', info.counter.replace(/^\S+\s/, ''), { font: 'body', size: FONT.bodySmall, color: INK_TEXT.main, align: 'left', x: -colW / 2 + 80 + textWidth(cl), y: 3 });

        // His table (no avatar: he's on the left). Fills down to the bottom margin.
        const tableTop = counterTop - counterH - 30;
        const tableH = Math.min(330, tableTop - (bB + 40));
        buildOpponentStrip(root, run.opponent, colL, tableTop, colW, tableH, undefined, false);
    }

    private face() {
        ScreenManager.show('Planning', { run: this.run, message: this.message });
    }

    private toTitle() {
        Game.saveRun();
        ScreenManager.show('Title');
    }
}
