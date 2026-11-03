// Hands of Fate — ui/PlanningScreen.ts
// Mockup 05. Everything on this screen depends on the run (grid size, cards,
// hands, health), so it is built in code from the run every time something
// changes. The prefab only needs this component on a full-screen root node.
//
// Layout, top to bottom (1080-wide design pixels):
//   top bar (score, round, options) · opponent strip · your board + hand labels
//   · info box · you + health + stash · the Forge · START ROUND
// The top part is pinned to the top and the bottom part to the bottom; on tall
// phones the board gets the extra room.
//
// Until the fight screen exists (stage 7), START ROUND plays the fight
// instantly in the background, picks a reward for you, and moves on, so you
// can already play run after run here.

import { _decorator, Node, UITransform, Widget, screen } from 'cc';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run } from '../core/run';
import { Card, rankLabel } from '../core/cards';
import { handsWithCard } from '../core/evaluate';
import { HAND_INFO, EFFECT_NAME } from '../core/hands';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, textWidth, FONT, COLOR } from './UiKit';
import { ButtonStyle } from './UiButton';
import { BoardView } from './BoardView';
import { ForgeView } from './ForgeView';
import { buildOpponentStrip } from './OpponentStrip';
import { buildHealthGrid, cardWords } from './views';
const { ccclass } = _decorator;

const MARGIN = 30;

@ccclass('PlanningScreen')
export class PlanningScreen extends GameScreen {
    private run: Run | null = null;
    private selected: Card | null = null;
    private message: { title: string; body: string } | null = null;
    private content: Node | null = null;
    private dragLayer: Node | null = null;

    onShow(params?: unknown) {
        const p = params as { run?: Run } | undefined;
        this.run = p?.run ?? Game.run;
        if (!this.run) { ScreenManager.show('Title'); return; }
        screen.on('window-resize', this.rebuild, this);
        UiKit.ready.then(() => this.scheduleOnce(() => this.rebuild(), 0));
    }

    onHide() {
        screen.off('window-resize', this.rebuild, this);
    }

    /** Rebuilds the whole screen from the run. */
    rebuild() {
        const run = this.run;
        if (!run || !this.node.isValid) return;
        this.node.getComponent(Widget)?.updateAlignment();
        const size = this.node.getComponent(UITransform)!;
        // Wide screens (tablets) keep a 1080-wide layout; the rest is side margin.
        const W = Math.min(size.width, 1080), H = size.height;

        if (!this.content) {
            this.content = makeNode(this.node, 'Content', W, H);
            this.dragLayer = makeNode(this.node, 'DragLayer', W, H);
        }
        clearChildren(this.content);
        clearChildren(this.dragLayer!);
        const root = this.content;
        const L = -W / 2 + MARGIN;           // left edge
        const R = W / 2 - MARGIN;            // right edge
        const T = H / 2;                     // top edge
        const B = -H / 2;                    // bottom edge
        const innerW = R - L;

        this.buildTopBar(root, run, L, R, T);
        const stripTop = T - 150;
        const stripH = 330;
        buildOpponentStrip(root, run.opponent, L, stripTop, innerW, stripH);

        // Bottom block, pinned to the bottom: START ROUND, the Forge, you + stash.
        const startH = 100;
        const startY = B + 30 + startH / 2;
        makeButton(root, 'StartRound', ButtonStyle.Red, 'START ROUND', innerW, startH, { x: 0, y: startY }, () => this.startRound(), FONT.button + 6);
        const forgeH = 140;
        const forgeY = startY + startH / 2 + 22 + (forgeH + 10) / 2;
        new ForgeView(root, run, this.selected?.id ?? null, 0, forgeY, innerW + 20, forgeH, (made) => {
            this.selected = made;
            this.message = { title: `Forged the ${cardWords(made)}`, body: 'The two cards became one. Done for this round.' };
            this.changed();
        });
        const youTop = forgeY + (forgeH + 10) / 2 + 15 + 165;

        // Board fills the space between the strip and the bottom block.
        const boardTop = stripTop - stripH - 18;
        const boardH = boardTop - youTop - 10;
        const board = new BoardView(this.content, this.dragLayer!, run, {
            left: L, top: boardTop, width: innerW, height: boardH,
            stashLeft: L + 465, stashTop: youTop, stashWidth: innerW - 465, stashHeight: 165,
        }, {
            changed: () => this.changed(),
            selected: (card) => { this.selected = card; this.message = null; this.rebuild(); },
        }, this.selected?.id ?? null);

        // Info box beside the column labels.
        const infoLeft = board.colLabelsRight + 30;
        this.buildInfoBox(root, run, infoLeft, R, board.colLabelsTop, board.colLabelsHeight);

        this.buildYou(root, run, L, youTop);
    }

    // ---- Parts ------------------------------------------------------------------

    private buildTopBar(root: Node, run: Run, L: number, R: number, T: number) {
        const kit = UiKit.get();
        const y = T - 22 - 50;
        const score = makeSprite(root, 'ScorePanel', kit.panelDark, 195, 100 + 6, { x: L + 97, y: y - 3 }, true).node;
        makeLabel(score, 'Title', 'SCORE', { size: FONT.labelSmall, spacing: 2, color: COLOR.cream, align: 'left', x: -75, y: 22 });
        makeLabel(score, 'Value', run.score.toLocaleString('en-US'), { size: FONT.heading, color: COLOR.gold, align: 'left', x: -75, y: -14 });

        const plaque = makeSprite(root, 'RoundPlaque', kit.panelCream, 324, 120 + 10, { x: 0, y: y - 5 }, true).node;
        makeLabel(plaque, 'Round', `ROUND ${run.round}`, { size: FONT.heading + 9, spacing: 2, color: COLOR.ink, y: 18 });
        makeLabel(plaque, 'Phase', run.isBoss ? 'Boss round · Planning' : 'Planning', { font: 'body', size: FONT.bodySmall, color: '#3D3450', y: -22 });

        makeButton(root, 'Options', ButtonStyle.Dark, 'Options', 150, 87, { x: R - 75, y }, () => this.toTitle(), 27);
    }

    private buildInfoBox(root: Node, run: Run, left: number, right: number, top: number, h: number) {
        const kit = UiKit.get();
        const w = right - left;
        if (w < 200) return;
        const box = makeSprite(root, 'InfoBox', kit.panelCream, w, h + 10, { x: left + w / 2, y: top - (h + 10) / 2 }, true).node;
        const x0 = -w / 2 + 30;
        const titleY = h / 2 - 20;
        const bodyY = titleY - 20;
        const bodySize = 24; // two lines must fit in the 105 px box

        if (this.message) {
            makeLabel(box, 'Title', this.message.title, { size: FONT.label + 3, color: COLOR.ink, align: 'left', x: x0, y: titleY });
            makeLabel(box, 'Body', this.message.body, { font: 'body', size: bodySize, color: COLOR.ink, align: 'left', x: x0, y: bodyY, width: w - 60, height: h - 50, anchorY: 1 });
            return;
        }
        const card = this.selected;
        if (!card) {
            makeLabel(box, 'Title', 'Tap a card to see its hands', { size: FONT.label + 3, color: COLOR.ink, align: 'left', x: x0, y: titleY });
            makeLabel(box, 'Body', 'Drag to move. Drop on a card to swap, or on the stash to bench it.', { font: 'body', size: bodySize, color: COLOR.ink, align: 'left', x: x0, y: bodyY, width: w - 60, height: h - 50, anchorY: 1 });
            return;
        }
        const result = run.board();
        const hands = handsWithCard(result, card.id).filter((hd) => hd.source !== 'leftover');
        const onGrid = run.grid.slots.some((c) => c?.id === card.id);
        // Title: 5 [♥] · in 2 hands
        const rank = makeLabel(box, 'Rank', rankLabel(card.rank), { size: FONT.label + 3, color: COLOR.ink, align: 'left', x: x0, y: titleY });
        let tx = x0 + textWidth(rank) + 4;
        makeSprite(box, 'Suit', kit.suitIcon(card.suit), 24, 24, { x: tx + 12, y: titleY });
        tx += 30;
        const summary = !onGrid ? '· in the stash' : hands.length === 0 ? '· high card' : `· in ${hands.length} hand${hands.length > 1 ? 's' : ''}`;
        makeLabel(box, 'Summary', summary, { size: FONT.label + 3, color: COLOR.ink, align: 'left', x: tx, y: titleY });

        let body: string;
        if (!onGrid) body = 'Drag it onto the grid to use it.';
        else if (hands.length === 0) {
            const lone = handsWithCard(result, card.id)[0];
            body = lone ? `No hand: fires alone as a high card (${EFFECT_NAME[lone.effect]}, ${lone.cooldown.toFixed(1)}s).` : '';
        } else {
            const parts = hands.map((hd) => `${HAND_INFO[hd.category].name} (${hd.source === 'row' ? 'row' : 'column'} ${hd.index + 1})`);
            body = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.` : `${parts[0]}.`;
        }
        makeLabel(box, 'Body', body, { font: 'body', size: bodySize, color: COLOR.ink, align: 'left', x: x0, y: bodyY, width: w - 60, height: h - 50, anchorY: 1 });
    }

    private buildYou(root: Node, run: Run, L: number, top: number) {
        const kit = UiKit.get();
        // Avatar: the King roughout at 1× (96×144).
        makeSprite(root, 'Avatar', kit.frame('concept/king_roughout'), 96, 144, { x: L + 48, y: top - 12 - 72 });
        const cells = run.data.healthCells;
        makeLabel(root, 'YouLabel', `YOU · ${cells} / ${cells}`, { size: FONT.labelSmall, spacing: 2, color: COLOR.lilac, align: 'left', x: L + 126, y: top - 12 });
        buildHealthGrid(root, cells, 300, 120, L + 126, top - 36);
    }

    // ---- Actions ----------------------------------------------------------------

    /** After any change: save, then rebuild. */
    private changed() {
        Game.saveRun();
        this.rebuild();
    }

    private toTitle() {
        Game.saveRun();
        ScreenManager.show('Title');
    }

    private startRound() {
        const run = this.run!;
        if (ScreenManager.show('Fight', { run })) return;

        // No fight screen yet (stage 7): play the round instantly.
        const fight = run.startFight();
        fight.runToEnd();
        const result = run.finishFight(fight);
        Game.recordProgress();
        const s = result.score;
        console.log(`Round ${result.round} ${result.won ? 'won' : 'lost'} vs ${result.opponent} in ${fight.time.toFixed(1)} s (quick play until stage 7)`, s);
        if (!result.won) {
            if (!ScreenManager.show('RunOver', { result })) {
                Game.endRun();
                console.log(`Run over at round ${result.round}, score ${run.score}. (Run over screen comes in stage 8.)`);
                ScreenManager.show('Title');
            }
            return;
        }
        if (ScreenManager.show('RoundWon', { run, result })) return;

        // No reward screen yet (stage 8): take their best card and the Cards reward.
        const best = [...run.takeableCards()].sort((a, b) => b.rank - a.rank)[0];
        const took = run.takeCard(best.id);
        const gained = run.chooseReward({ kind: 'cards' });
        console.log(`Quick play reward: took the ${cardWords(took)}; new cards: ${gained.map(cardWords).join(', ')}`);
        Game.saveRun();
        this.selected = null;
        this.message = {
            title: `Round ${result.round} won · +${s.total.toLocaleString('en-US')}`,
            body: `Took the ${cardWords(took)} and 3 new cards (see the stash). ${s.cellsLeft}/${s.cellsTotal} cells left.`,
        };
        this.rebuild();
    }
}
