// Hands of Fate — ui/RoundWonScreen.ts
// Landscape, two steps (plan phase 2, grey boxes):
//   left   the round's bar tab: score lines one by one, then the total counting up
//   right  1 Take one of their cards  (large heading; their cards on the table)
//          2 Then choose a reward     (greyed until a card is taken)
// Next round unlocks once both are picked. Grid asks row or column when both can grow.
// Next round goes to the boss intro on boss rounds, otherwise to planning.

import { _decorator, Node, UITransform, Widget, tween, Vec3, Color } from 'cc';
import { Sound } from '../app/Sound';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run, RoundResult, RewardChoice, HEALTH_REWARD, CARDS_REWARD } from '../core/run';
import { Card } from '../core/cards';
import { formatTime } from '../core/scoring';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, FONT, COLOR } from './UiKit';
import { ButtonStyle, UiButton } from './UiButton';
import { CardView, CARD_W, CARD_H, cardWords } from './views';
import { tableRegions, buildStrip, buildJoker, GREY } from './table';
import { frame, rewardIcon, ringFrame, INK_TEXT } from './kitC';
import { PlanningMessage } from './flow';
import { tutorialStep, setTutorialStep, showTutorial } from './Tutorial';
import { celebrateAces } from './Modal';
import { jokerLine } from './joker';
const { ccclass } = _decorator;

/** Height of a reward card. */
const REWARD_H = 250;


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
        Sound.music('menu');
        UiKit.ready.then(() => this.scheduleOnce(() => {
            this.build();
            celebrateAces(this.node, Game.takePendingAces(), () => this.tutorialStep5());
        }, 0));
    }

    /** Tutorial step 5: explain the two picks (the Dealer sits over the score). */
    private tutorialStep5() {
        if (tutorialStep() !== 5) return;
        const overlay = showTutorial(this.node, {
            step: 5, at: 'left', button: 'Got it', spot: null,
            onButton: () => { setTutorialStep(6); if (overlay.isValid) overlay.destroy(); },
        });
    }

    private build() {
        const run = this.run!, r = this.result!;
        if (!this.node.isValid) return;
        this.node.getComponent(Widget)?.updateAlignment();
        const g = tableRegions(this.node.getComponent(UITransform)!);
        if (!this.content) this.content = makeNode(this.node, 'Content', g.W, g.H);
        clearChildren(this.content);
        const root = this.content;

        buildStrip(root, g, r.round, 'Cleared · take a card, then a reward', run.score, () => this.toTitle());
        buildJoker(root, g, 0, g.T - 104, null, tutorialStep() > 0 ? '' : jokerLine('take'));
        const top = g.side.top, bottom = g.side.top - g.side.height;
        const tabW = 560;
        this.buildScore(root, r, g.L, top, tabW, top - bottom);

        // Right: the two steps, then Next round at the bottom right.
        const left = g.L + tabW + 60, w = g.R - left;
        const took = this.takeId !== null;
        // Step 2 sits low, just above Next round; step 1's cards get the room between (Stage C, decision 150).
        const nextW = 420, nextH = 100;
        const rewardsTop = bottom + nextH + 30 + REWARD_H;
        const stepTop = rewardsTop + 70;
        this.buildTake(root, run, left, w, top, top - 100 - (stepTop + 30));
        makeLabel(root, 'Step2', '2  Then choose a reward', { size: FONT.heading + 9, color: took ? GREY.text : GREY.dim, align: 'left', x: left, y: stepTop - 24 });
        this.buildRewards(root, run, left, w, rewardsTop, took);
        this.next = makeButton(root, 'Next', ButtonStyle.Red, 'Next round', nextW, nextH, { x: g.R - nextW / 2, y: bottom + nextH / 2 }, () => this.goNext());
        this.refreshNext();
    }

    // ---- The bar tab ------------------------------------------------------------------

    private buildScore(root: Node, r: RoundResult, left: number, top: number, w: number, h: number) {
        const s = r.score;
        const tab = frame(root, 'Tab', w, h, { x: left + w / 2, y: top - h / 2 }, { caption: 'THE TAB' });
        const x0 = -w / 2 + 32, x1 = w / 2 - 32;
        // Bigger than before (Stage C, decision 150): names 30, details 30, values 39.
        makeLabel(tab, 'Title', `ROUND ${r.round}`, { size: FONT.heading + 9, spacing: 2, color: GREY.text, align: 'left', x: x0, y: h / 2 - 48 });
        const lineTop = h / 2 - 124, pitch = 84;
        const rows: [string, string, string][] = [
            ['Hands fired', `${s.handsFired} hands`, `+${s.handBonus}`],
            ['Health left', `${s.cellsLeft} / ${s.cellsTotal}`, `+${s.healthBonus}`],
            ['Flawless', s.flawless ? 'no cells lost' : 'cells were lost', `+${s.flawlessBonus}`],
            ['Time', `${formatTime(s.time)} · par ${formatTime(s.par)}`, `+${s.timeBonus}`],
        ];
        const nodes: Node[] = [];
        const line = (name: string, detail: string, value: string, y: number, valueColor: string = GREY.text) => {
            const row = makeNode(tab, name, 0, 0, { y });
            makeLabel(row, 'Name', name, { size: 30, color: GREY.text, align: 'left', x: x0, y: detail ? 14 : 0 });
            if (detail) makeLabel(row, 'Detail', detail, { font: 'body', size: 30, color: GREY.soft, align: 'left', x: x0, y: -20 });
            makeLabel(row, 'Value', value, { size: FONT.heading + 6, color: valueColor, align: 'right', x: x1, y: 0 });
            nodes.push(row);
        };
        rows.forEach(([name, detail, value], i) => line(name, detail, value, lineTop - i * pitch));
        const subY = lineTop - 4 * pitch + 10;
        line('Subtotal', '', s.subtotal.toLocaleString('en-US'), subY);
        line(`Round ${r.round} multiplier`, '', `× ${s.multiplier.toFixed(1)}`, subY - 62, '#C93038');

        const totalBox = frame(tab, 'TotalBox', w - 40, 100, { y: -h / 2 + 20 + 50 }, { closed: true });
        makeLabel(totalBox, 'Title', 'ROUND TOTAL', { size: FONT.label + 3, spacing: 2, color: GREY.text, align: 'left', x: -(w - 40) / 2 + 20 });
        const total = makeLabel(totalBox, 'Total', '0', { size: FONT.title - 6, color: INK_TEXT.gold, align: 'right', x: (w - 40) / 2 - 20 });

        // Lines appear one by one, then the total counts up (shown at once on a rebuild).
        if (this.counted) {
            total.string = s.total.toLocaleString('en-US');
        } else {
            this.counted = true;
            nodes.forEach((n, i) => {
                n.setScale(0, 1, 1);
                tween(n).delay(0.08 * i).call(() => Sound.play('tick')).to(0.15, { scale: new Vec3(1, 1, 1) }).start();
            });
            const counter = { v: 0 };
            tween(counter).delay(0.08 * nodes.length).to(0.7, { v: s.total }, {
                onUpdate: () => { if (total.isValid) total.string = Math.round(counter.v).toLocaleString('en-US'); },
            }).call(() => Sound.play('total')).start();
        }
    }

    // ---- 1. Take a card ---------------------------------------------------------------

    /** The largest card size that fits their cards in at most two rows and maxH (decision 150). */
    private takeLayout(count: number, w: number, maxH: number): { scale: number; perRow: number; rows: number } {
        for (const scale of [1.5, 1.25, 1, 0.75]) {
            const gap = scale >= 1.5 ? 16 : 12;
            const perRow = Math.max(1, Math.floor((w + gap) / (CARD_W * scale + gap)));
            const rows = Math.ceil(count / perRow);
            if (rows <= 2 && rows * (CARD_H * scale + gap) - gap <= maxH) return { scale, perRow, rows };
        }
        const perRow = Math.max(1, Math.ceil(count / 2));
        return { scale: 0.5, perRow, rows: Math.ceil(count / perRow) };
    }

    private buildTake(root: Node, run: Run, left: number, w: number, top: number, maxH: number): number {
        const cards = run.takeableCards();
        const took = this.takeId !== null;
        makeLabel(root, 'Step1', '1  Take one of their cards', { size: FONT.heading + 9, color: GREY.text, align: 'left', x: left, y: top - 24 });
        const picked = cards.find((c) => c.id === this.takeId);
        makeLabel(root, 'Step1Note', picked ? `Taking the ${cardWords(picked)}: it goes to your stash.` : 'It goes to your stash.',
            { font: 'body', size: FONT.bodySmall, color: took ? COLOR.gold : GREY.soft, align: 'left', x: left, y: top - 66 });
        const cardsTop = top - 100;
        const { scale, perRow } = this.takeLayout(cards.length, w, maxH);
        const cw = CARD_W * scale, ch = CARD_H * scale, gap = scale >= 1.5 ? 16 : 12;
        let bottom = cardsTop;
        cards.forEach((card, i) => {
            const row = Math.floor(i / perRow), col = i % perRow;
            const x = left + cw / 2 + col * (cw + gap);
            const y = cardsTop - ch / 2 - row * (ch + gap);
            bottom = Math.min(bottom, y - ch / 2);
            const v = CardView.create(root, card, cw, ch, x, y);
            v.setInHand(card.id === this.takeId);
            v.node.on(Node.EventType.TOUCH_END, () => this.pickCard(card));
        });
        return bottom;
    }

    private pickCard(card: Card) {
        Sound.play('select');
        this.takeId = card.id;
        this.build();
    }

    // ---- 2. Rewards -------------------------------------------------------------------

    private buildRewards(root: Node, run: Run, left: number, w: number, top: number, open: boolean) {
        const kit = UiKit.get();
        const options = run.rewardOptions();
        const gap = 24, h = REWARD_H;
        const cw = Math.min(360, (w - gap * 2) / 3);
        const specs = [
            { kind: 'health' as const, badge: `+${HEALTH_REWARD}`, title: 'Health', color: GREY.text, text: `+${HEALTH_REWARD} cells on your health grid`, full: 'Health is full' },
            { kind: 'grid' as const, badge: '+1', title: 'Grid', color: GREY.text, text: '+1 row or column for cards', full: 'Grid is 5×5' },
            { kind: 'cards' as const, badge: `×${CARDS_REWARD}`, title: 'Cards', color: GREY.text, text: `${CARDS_REWARD} random cards · one duplicate`, full: '' },
        ];
        specs.forEach((spec, i) => {
            const opt = options.find((o) => o.kind === spec.kind)!;
            const x = left + cw / 2 + i * (cw + gap);
            const selected = this.choice?.kind === spec.kind;
            const cardNode = makeNode(root, `Reward ${spec.kind}`, cw, h, { x, y: top - h / 2 });
            // A closed rail: quiet until a card is taken, a cream card once picked.
            const live = opt.available && open;
            frame(cardNode, 'Back', cw, h, {}, { closed: true, color: live ? 'cream' : 'soft', fill: selected ? 'cream' : undefined });
            const ink = selected ? INK_TEXT.ink : live ? GREY.text : GREY.dim;
            const inkSoft = selected ? INK_TEXT.ink : live ? GREY.soft : GREY.dim;
            makeLabel(cardNode, 'Badge', spec.badge, { size: FONT.label + 6, color: ink, align: 'left', x: -cw / 2 + 20, y: h / 2 - 28 });

            const twoButtons = live && spec.kind === 'grid' && (opt.directions ?? []).length === 2;
            // With + Row / + Col along the bottom, the icon, title and line move up to make room.
            const iconY = h / 2 - (twoButtons ? 60 : 72);
            const titleY = iconY - (twoButtons ? 54 : 60), textY = iconY - (twoButtons ? 86 : 96);
            // Health and Grid are drawn pictures with their own greyed version. The Cards reward
            // shows the deck's backs, which are never tinted: a dark cover goes over them instead.
            if (twoButtons) {
                // + Row and + Col are cards of their own, each with your board in small and a dotted ghost where it grows.
                this.buildGrowTiles(cardNode, run, cw, h);
            } else if (spec.kind !== 'cards') {
                const icon = rewardIcon(spec.kind, live);
                makeSprite(cardNode, 'Icon', icon.frame, icon.w, icon.h, { y: iconY });
            } else {
                [-1, 0, 1].forEach((k) => {
                    const back = makeSprite(cardNode, `Back${k}`, kit.frame('cards/updated/back'), 45, 63, { x: k * 34, y: iconY });
                    if (!live) {
                        const cover = makeSprite(back.node, 'Cover', kit.spark, 45, 63);
                        cover.color = new Color(0x16, 0x12, 0x1c, 170);
                    }
                });
            }
            makeLabel(cardNode, 'Title', spec.title, { size: FONT.heading, color: selected ? INK_TEXT.ink : live ? spec.color : GREY.dim, y: twoButtons ? h / 2 - 34 : titleY });
            if (!twoButtons) makeLabel(cardNode, 'Text', opt.available ? spec.text : spec.full, { font: 'body', size: 26, color: inkSoft, y: textY, width: cw - 30, height: 56, anchorY: 1 });

            // Step 2 waits for step 1: shown, but greyed and not clickable.
            if (!live) return;
            if (spec.kind === 'grid') {
                const dirs = opt.directions ?? [];
                if (dirs.length === 2) return; // the tiles take the taps
                cardNode.on(Node.EventType.TOUCH_END, () => this.choose({ kind: 'grid', add: dirs[0] }));
                return;
            }
            cardNode.on(Node.EventType.TOUCH_END, () => this.choose(spec.kind === 'health' ? { kind: 'health' } : { kind: 'cards' }));
        });
    }

    /**
     * The Grid reward's two choices: "+ Row" and "+ Col" as small cards. The chosen one is
     * cream, the other an outline. Each shows your board as little cells, with the row or
     * column it would add as dotted ghosts (decision 150).
     */
    private buildGrowTiles(cardNode: Node, run: Run, cw: number, h: number) {
        const g = run.grid;
        const tw = Math.floor((cw - 52) / 2 / 2) * 2, th = 160;
        (['row', 'col'] as const).forEach((dir, k) => {
            const on = this.choice?.kind === 'grid' && this.choice.add === dir;
            const x = -cw / 2 + 20 + tw / 2 + k * (tw + 12), y = -h / 2 + 18 + th / 2;
            const tile = frame(cardNode, `Grow ${dir}`, tw, th, { x, y }, { closed: true, fill: on ? 'cream' : undefined });
            const rows = g.rows + (dir === 'row' ? 1 : 0), cols = g.cols + (dir === 'col' ? 1 : 0);
            // Little cells: 2 px gaps, card-shaped, sized to fit the tile above its label.
            const cwid = Math.max(8, Math.min(20, Math.floor(((tw - 36) - 4 * (cols - 1)) / cols / 2) * 2));
            const chei = Math.max(10, Math.min(Math.floor(cwid * 1.4 / 2) * 2, Math.floor(((th - 70) - 4 * (rows - 1)) / rows / 2) * 2));
            const gw = cols * cwid + (cols - 1) * 4, gh = rows * chei + (rows - 1) * 4;
            const ox = -gw / 2 + cwid / 2, oy = th / 2 - 18 - chei / 2 - Math.max(0, (th - 70 - gh) / 2);
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                const ghost = r >= g.rows || c >= g.cols;
                const at = { x: ox + c * (cwid + 4), y: oy - r * (chei + 4) };
                if (ghost) makeSprite(tile, `Ghost ${r},${c}`, ringFrame(cwid, chei, on ? 'pink' : 'gold'), cwid, chei, at);
                else {
                    const cell = makeSprite(tile, `Cell ${r},${c}`, UiKit.get().spark, cwid, chei, at);
                    cell.color = new Color().fromHEX(on ? INK_TEXT.ink : GREY.soft);
                }
            }
            makeLabel(tile, 'Label', dir === 'row' ? '+ Row' : '+ Col', { size: FONT.label + 2, color: on ? INK_TEXT.ink : GREY.text, y: -th / 2 + 24 });
            tile.on(Node.EventType.TOUCH_END, () => this.choose({ kind: 'grid', add: dir }));
        });
    }

    private choose(c: RewardChoice) {
        Sound.play('select');
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
        if (tutorialStep() === 5) setTutorialStep(6);
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
