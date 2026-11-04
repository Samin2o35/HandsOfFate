// Hands of Fate — ui/BossIntroScreen.ts
// Mockup 08. Before a boss round's planning: the animated King, his name and
// meeting, the twist with tier badges, what changed since last time, the counter,
// and his table. FACE HIM goes on to planning.

import { _decorator, Node, UITransform, Widget, Color, tween, Vec3 } from 'cc';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run } from '../core/run';
import { Suit, SUIT_COLOR_HEX } from '../core/cards';
import { BOSSES, twistText, twistChange, meetingText, tierNumeral } from '../core/bosses';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, textWidth, FONT, COLOR } from './UiKit';
import { ButtonStyle } from './UiButton';
import { AnimatedCard } from './AnimatedCard';
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
        const W = Math.min(ut.width, 1080), H = ut.height;
        if (!this.content) this.content = makeNode(this.node, 'Content', W, H);
        clearChildren(this.content);
        const root = this.content;
        const L = -W / 2 + MARGIN, R = W / 2 - MARGIN, T = H / 2, B = -H / 2;
        const innerW = R - L;
        const suitColor = SUIT_COLOR_HEX[boss.suit];

        buildTopBar(root, run.score, `ROUND ${run.round}`, 'Boss round', L, R, T, () => this.toTitle());

        // The King, animated, with a soft glow in his suit colour.
        const kingY = T - 165 - 189;
        const glow = makeSprite(root, 'Glow', kit.ringWhite, 300, 408, { y: kingY }, true);
        glow.color = new Color().fromHEX(suitColor);
        tween(glow.node).repeatForever(tween(glow.node).to(0.9, { scale: new Vec3(1.04, 1.04, 1) }).to(0.9, { scale: new Vec3(1, 1, 1) })).start();
        const king = makeSprite(root, 'King', kit.classicFrame({ suit: boss.suit, rank: 13 }), 270, 378, { y: kingY });
        const anim = king.node.addComponent(AnimatedCard);
        anim.strip = `anim/${boss.suit}_13`;
        anim.randomStart = false;

        // Name plaque.
        const nameTop = T - 570, nameH = 130;
        const name = makeSprite(root, 'NamePlaque', kit.panelCream, innerW + 10, nameH + 10, { y: nameTop - (nameH + 10) / 2 }, true).node;
        makeLabel(name, 'Meeting', `BOSS · ${meetingText(boss.tier).toUpperCase()}`, { size: FONT.labelSmall, spacing: 2, color: '#3D3450', y: 34 });
        const title = makeLabel(name, 'Name', info.name.toUpperCase(), { size: FONT.title - 6, spacing: 3, color: COLOR.ink, y: -14 });
        const tw = textWidth(title);
        makeSprite(name, 'Suit', kit.suitIcon(boss.suit), 45, 45, { x: -tw / 2 - 36, y: -12 });

        // Twist panel: name + tier badges, rule for this tier, what changed.
        const twistTop = nameTop - nameH - 20, twistH = 200;
        const twist = makeSprite(root, 'Twist', kit.panelCream, innerW + 10, twistH + 10, { y: twistTop - (twistH + 10) / 2 }, true).node;
        const x0 = -(innerW + 10) / 2 + 40, x1 = (innerW + 10) / 2 - 40;
        makeLabel(twist, 'Name', info.twist.toUpperCase(), { size: FONT.heading + 6, spacing: 2, color: suitColor, align: 'left', x: x0, y: twistH / 2 - 36 });
        for (let i = 0; i < TIER_BADGES; i++) {
            const lit = i < boss.tier;
            const bx = x1 - 30 - (TIER_BADGES - 1 - i) * 68;
            const badge = makeSprite(twist, `Tier${i}`, lit ? kit.buttonNormal[1] : kit.buttonNormal[3], 60, 66, { x: bx, y: twistH / 2 - 38 }, true);
            if (lit) badge.color = new Color().fromHEX(suitColor);
            makeLabel(badge.node, 'N', tierNumeral(i + 1), { size: FONT.label + 3, color: lit ? COLOR.cream : '#7D768C', y: 4 });
        }
        if (boss.tier > TIER_BADGES) makeLabel(twist, 'TierMore', `Tier ${tierNumeral(boss.tier)}`, { size: FONT.labelSmall, color: suitColor, align: 'right', x: x1, y: twistH / 2 - 80 });
        makeLabel(twist, 'Rule', twistText(boss.suit, boss.tier), { font: 'body', size: FONT.bodySmall + 3, color: COLOR.ink, align: 'left', x: x0, y: 10, width: x1 - x0, height: 56, anchorY: 0.5 });
        const change = twistChange(boss.suit, boss.tier) ?? 'Each time you meet him, this gets one tier stronger.';
        makeLabel(twist, 'Change', `Tier ${tierNumeral(boss.tier)}: ${change}`, { font: 'body', size: 24, color: '#3D3450', align: 'left', x: x0, y: -twistH / 2 + 48, width: x1 - x0, height: 32 });

        // Counter strip.
        const counterTop = twistTop - twistH - 20, counterH = 66;
        const counter = makeSprite(root, 'Counter', kit.panelDark, innerW, counterH + 6, { x: L + innerW / 2, y: counterTop - (counterH + 6) / 2 }, true).node;
        const cs = COUNTER_SUIT[boss.suit];
        makeSprite(counter, 'Icon', kit.suitIcon(cs), 27, 27, { x: -innerW / 2 + 45, y: 3 });
        const cl = makeLabel(counter, 'Label', 'Counter:', { size: FONT.label + 3, color: SUIT_COLOR_HEX[cs], align: 'left', x: -innerW / 2 + 70, y: 3 });
        makeLabel(counter, 'Text', info.counter.replace(/^\S+\s/, ''), { font: 'body', size: FONT.bodySmall, color: COLOR.cream, align: 'left', x: -innerW / 2 + 80 + textWidth(cl), y: 3 });

        // His table (no avatar: he's right above).
        const tableTop = counterTop - counterH - 26;
        buildOpponentStrip(root, run.opponent, L, tableTop, innerW, 330, undefined, false);

        makeButton(root, 'Face', ButtonStyle.Red, 'FACE HIM', innerW, 100, { x: 0, y: B + 40 + 50 }, () => this.face(), FONT.button + 6);
    }

    private face() {
        ScreenManager.show('Planning', { run: this.run, message: this.message });
    }

    private toTitle() {
        Game.saveRun();
        ScreenManager.show('Title');
    }
}
