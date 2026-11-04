// Hands of Fate — ui/RoundWonScreen.ts
// Mockup 07. The round's score, line by line, counting up; then
//   1 · ALWAYS: TAKE ONE OF THEIR CARDS   (tap one; gold ring)
//   2 · THEN CHOOSE ONE                   (Health / Grid / Cards)
// Next round unlocks once both are picked. Grid asks row or column when both can grow.
// Next round goes to the boss intro on boss rounds, otherwise to planning.

import { _decorator, Node, UITransform, UIOpacity, Widget, tween, Vec3 } from 'cc';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run, RoundResult, RewardChoice, HEALTH_REWARD, CARDS_REWARD } from '../core/run';
import { Card } from '../core/cards';
import { formatTime } from '../core/scoring';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, FONT, COLOR } from './UiKit';
import { ButtonStyle, UiButton } from './UiButton';
import { CardView, CARD_W, CARD_H, cardWords } from './views';
import { buildTopBar, dashedLine, statRow } from './parts';
import { PlanningMessage } from './flow';
const { ccclass } = _decorator;

const MARGIN = 30;

@ccclass('RoundWonScreen')
export class RoundWonScreen extends GameScreen {
    private run: Run | null = null;
    private result: RoundResult | null = null;
    private takeId: number | null = null;
    private choice: RewardChoice | null = null;
    private content: Node | null = null;
    private next: UiButton | null = null;
    private counted = false;

    onShow(params?: unknown) {
        const p = params as { run?: Run; result?: RoundResult } | undefined;
        this.run = p?.run ?? Game.run;
        this.result = p?.result ?? this.run?.data.lastResult ?? null;
        if (!this.run || !this.result || this.run.phase !== 'reward') { ScreenManager.show('Title'); return; }
        UiKit.ready.then(() => this.scheduleOnce(() => this.build(), 0));
    }

    private build() {
        const run = this.run!, r = this.result!;
        if (!this.node.isValid) return;
        this.node.getComponent(Widget)?.updateAlignment();
        const ut = this.node.getComponent(UITransform)!;
        const W = Math.min(ut.width, 1080), H = ut.height;
        if (!this.content) this.content = makeNode(this.node, 'Content', W, H);
        clearChildren(this.content);
        const root = this.content;
        const L = -W / 2 + MARGIN, R = W / 2 - MARGIN, T = H / 2, B = -H / 2;
        const innerW = R - L;

        buildTopBar(root, run.score, `ROUND ${r.round} CLEARED`, 'Score, then rewards', L, R, T, () => this.toTitle());
        const scoreBottom = this.buildScore(root, r, L, R, T - 165);
        const takeBottom = this.buildTake(root, run, L, innerW, scoreBottom - 40);
        makeLabel(root, 'ChooseTitle', '2 · THEN CHOOSE ONE', { size: FONT.labelSmall, spacing: 2, color: COLOR.lilac, align: 'left', x: L, y: takeBottom - 45 });
        this.buildRewards(root, run, L, innerW, takeBottom - 75);

        this.next = makeButton(root, 'Next', ButtonStyle.Red, 'Next round', innerW, 100, { x: 0, y: B + 40 + 50 }, () => this.goNext());
        this.refreshNext();
    }

    // ---- 1. Score -------------------------------------------------------------------

    private buildScore(root: Node, r: RoundResult, L: number, R: number, top: number): number {
        const kit = UiKit.get();
        const s = r.score;
        const w = R - L + 10, h = 470;
        const panel = makeSprite(root, 'ScorePanel', kit.panelCream, w, h + 10, { x: 0, y: top - (h + 10) / 2 }, true).node;
        const x0 = -w / 2 + 40, x1 = w / 2 - 40;
        const lineTop = h / 2 - 40;
        const rows: [string, string, string, string?][] = [
            ['Hands fired', `${s.handsFired} hands`, `+${s.handBonus}`],
            ['Health left', `${s.cellsLeft} / ${s.cellsTotal}`, `+${s.healthBonus}`],
            ['Flawless', s.flawless ? 'no cells lost' : 'lost cells', `+${s.flawlessBonus}`],
            ['Time', `${formatTime(s.time)} · par ${formatTime(s.par)}`, `+${s.timeBonus}`],
        ];
        const nodes: Node[] = [];
        rows.forEach(([name, detail, value], i) => {
            const row = makeNode(panel, `Row${i}`, 0, 0, { y: lineTop - i * 55 });
            statRow(row, name, detail, value, x0, x1, 0);
            dashedLine(row, x0, x1, -28);
            nodes.push(row);
        });
        const subY = lineTop - 4 * 55;
        const sub = makeNode(panel, 'Subtotal', 0, 0, { y: subY });
        statRow(sub, 'Subtotal', '', s.subtotal.toLocaleString('en-US'), x0, x1, 0);
        const mult = makeNode(panel, 'Multiplier', 0, 0, { y: subY - 44 });
        statRow(mult, `Round ${r.round} multiplier`, '', `× ${s.multiplier.toFixed(1)}`, x0, x1, 0, '#D2453C');
        nodes.push(sub, mult);

        const totalBox = makeSprite(panel, 'TotalBox', kit.panelDark, x1 - x0 + 10, 100, { y: -h / 2 + 30 + 50 + 6 }, true).node;
        makeLabel(totalBox, 'Title', 'ROUND TOTAL', { size: FONT.label + 3, spacing: 2, color: COLOR.cream, align: 'left', x: -(x1 - x0) / 2 + 20, y: 3 });
        const total = makeLabel(totalBox, 'Total', '0', { size: FONT.title - 6, color: COLOR.gold, align: 'right', x: (x1 - x0) / 2 - 20, y: 3 });

        // Lines appear one by one, then the total counts up (shown at once on a rebuild).
        if (this.counted) {
            total.string = s.total.toLocaleString('en-US');
        } else {
            this.counted = true;
            nodes.forEach((n, i) => {
                n.setScale(0, 1, 1);
                tween(n).delay(0.08 * i).to(0.15, { scale: new Vec3(1, 1, 1) }).start();
            });
            const counter = { v: 0 };
            tween(counter).delay(0.08 * nodes.length).to(0.7, { v: s.total }, {
                onUpdate: () => { if (total.isValid) total.string = Math.round(counter.v).toLocaleString('en-US'); },
            }).start();
        }
        return top - h - 10;
    }

    // ---- 2. Take a card ---------------------------------------------------------------

    private buildTake(root: Node, run: Run, L: number, innerW: number, top: number): number {
        const kit = UiKit.get();
        const cards = run.takeableCards();
        const scale = cards.length <= 9 ? 1 : 0.75;
        const cw = CARD_W * scale, ch = CARD_H * scale, gap = 12;
        const perRow = Math.max(1, Math.floor((innerW - 60 + gap) / (cw + gap)));
        const rows = Math.ceil(cards.length / perRow);
        const h = 70 + rows * (ch + gap) + 10;
        const panel = makeSprite(root, 'TakePanel', kit.panelDark, innerW, h + 6, { x: L + innerW / 2, y: top - (h + 6) / 2 }, true).node;
        makeLabel(panel, 'Title', '1 · ALWAYS: TAKE ONE OF THEIR CARDS', { size: FONT.labelSmall, spacing: 2, color: COLOR.gold, align: 'left', x: -innerW / 2 + 33, y: h / 2 - 32 });
        cards.forEach((card, i) => {
            const row = Math.floor(i / perRow), col = i % perRow;
            const inRow = Math.min(perRow, cards.length - row * perRow);
            const rowW = inRow * cw + (inRow - 1) * gap;
            const x = -rowW / 2 + cw / 2 + col * (cw + gap);
            const y = h / 2 - 70 - ch / 2 - row * (ch + gap);
            const v = CardView.create(panel, card, cw, ch, x, y);
            v.setInHand(card.id === this.takeId);
            v.node.on(Node.EventType.TOUCH_END, () => this.pickCard(card));
        });
        return top - h - 6;
    }

    private pickCard(card: Card) {
        this.takeId = card.id;
        this.build();
    }

    // ---- 3. Rewards -------------------------------------------------------------------

    private buildRewards(root: Node, run: Run, L: number, innerW: number, top: number) {
        const kit = UiKit.get();
        const options = run.rewardOptions();
        const gap = 24, h = 330;
        const w = (innerW - gap * 2) / 3;
        const specs = [
            { kind: 'health' as const, badge: `+${HEALTH_REWARD}`, title: 'Health', color: '#D2453C', text: `+${HEALTH_REWARD} cells on your health grid`, full: 'Health is full' },
            { kind: 'grid' as const, badge: '+1', title: 'Grid', color: COLOR.ink, text: '+1 row or column for cards', full: 'Grid is 5×5' },
            { kind: 'cards' as const, badge: `×${CARDS_REWARD}`, title: 'Cards', color: '#3978A8', text: `${CARDS_REWARD} random cards · one duplicate`, full: '' },
        ];
        specs.forEach((spec, i) => {
            const opt = options.find((o) => o.kind === spec.kind)!;
            const x = L + w / 2 + i * (w + gap);
            const cardNode = makeNode(root, `Reward ${spec.kind}`, w, h + 7, { x, y: top - (h + 7) / 2 });
            makeSprite(cardNode, 'Panel', kit.panelCream, w, h + 7, {}, true);
            const selected = this.choice?.kind === spec.kind;
            if (selected) makeSprite(cardNode, 'Picked', kit.cardFrameGold, w + 12, h + 12, { y: 3 }, true);
            makeLabel(cardNode, 'Badge', spec.badge, { size: FONT.label + 6, color: COLOR.ink, align: 'left', x: -w / 2 + 24, y: h / 2 - 30 });

            // Icon
            const iconY = h / 2 - 105;
            if (spec.kind === 'health') makeSprite(cardNode, 'Icon', kit.frame('ui/icons/reward_health'), 65, 55, { y: iconY });
            else if (spec.kind === 'grid') makeSprite(cardNode, 'Icon', kit.frame('ui/icons/reward_grid'), 70, 55, { y: iconY });
            else [-1, 0, 1].forEach((k) => {
                const back = makeSprite(cardNode, `Back${k}`, kit.frame('cards/updated/back'), 45, 63, { x: k * 34, y: iconY });
                back.node.angle = -k * 8;
            });

            makeLabel(cardNode, 'Title', spec.title, { size: FONT.heading, color: spec.color, y: iconY - 72 });
            makeLabel(cardNode, 'Text', opt.available ? spec.text : spec.full, { font: 'body', size: 24, color: '#3D3450', y: iconY - 120, width: w - 40, height: 60, anchorY: 1 });

            if (!opt.available) {
                cardNode.addComponent(UIOpacity).opacity = 110; // shown, but dimmed and not clickable
                return;
            }
            if (spec.kind === 'grid') {
                const dirs = opt.directions ?? [];
                if (dirs.length === 2) {
                    // Two small buttons: + Row / + Column.
                    const bw = (w - 60) / 2;
                    (['row', 'col'] as const).forEach((dir, k) => {
                        const isOn = this.choice?.kind === 'grid' && this.choice.add === dir;
                        makeButton(cardNode, `Grid ${dir}`, isOn ? ButtonStyle.Red : ButtonStyle.Cream, dir === 'row' ? '+ Row' : '+ Col', bw, 70, { x: -w / 2 + 24 + bw / 2 + k * (bw + 12), y: -h / 2 + 50 }, () => this.choose({ kind: 'grid', add: dir }), 24);
                    });
                    return;
                }
                cardNode.on(Node.EventType.TOUCH_END, () => this.choose({ kind: 'grid', add: dirs[0] }));
                return;
            }
            cardNode.on(Node.EventType.TOUCH_END, () => this.choose(spec.kind === 'health' ? { kind: 'health' } : { kind: 'cards' }));
        });
    }

    private choose(c: RewardChoice) {
        this.choice = c;
        this.build();
    }

    private refreshNext() {
        if (this.next) this.next.interactable = this.takeId !== null && this.choice !== null;
    }

    // ---- Next ---------------------------------------------------------------------------

    private goNext() {
        const run = this.run!;
        if (this.takeId === null || !this.choice) return;
        const took = run.takeCard(this.takeId);
        const gained = run.chooseReward(this.choice);
        Game.saveRun();
        const r = this.result!;
        const message: PlanningMessage = {
            title: `Round ${r.round} won · +${r.score.total.toLocaleString('en-US')}`,
            body: this.choice.kind === 'cards'
                ? `Took the ${cardWords(took)}; ${gained.length} new cards are in the stash.`
                : this.choice.kind === 'grid'
                    ? `Took the ${cardWords(took)}. Your grid grew: fill the new ${this.choice.add === 'row' ? 'row' : 'column'}.`
                    : `Took the ${cardWords(took)}. You have ${run.data.healthCells} health cells now.`,
        };
        if (run.isBoss && ScreenManager.show('BossIntro', { run, message })) return;
        ScreenManager.show('Planning', { run, message });
    }

    private toTitle() {
        Game.saveRun();
        ScreenManager.show('Title');
    }
}
