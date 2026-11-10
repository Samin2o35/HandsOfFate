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
import { Sound } from '../app/Sound';
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
import { finishRound, PlanningMessage } from './flow';
import { worldRect, unionRects } from './BoardView';
import { tutorialStep, setTutorialStep, finishTutorial, showTutorial, suitLegend } from './Tutorial';
/** runs:round of the last round whose cards were dealt in (see rebuild). */
let dealtRound = '';

const { ccclass } = _decorator;

const MARGIN = 30;

@ccclass('PlanningScreen')
export class PlanningScreen extends GameScreen {
    private run: Run | null = null;
    private selected: Card | null = null;
    private message: { title: string; body: string } | null = null;
    private content: Node | null = null;
    private dragLayer: Node | null = null;
    // Kept for the tutorial's spotlight.
    private board: BoardView | null = null;
    private forge: ForgeView | null = null;
    private healthNode: Node | null = null;
    private tutorial: Node | null = null;
    /** The info box and where it goes, so a tap can rebuild just the box. */
    private infoBox: Node | null = null;
    private infoArgs: [Node, number, number, number, number] | null = null;

    onShow(params?: unknown) {
        const p = params as { run?: Run; message?: PlanningMessage } | undefined;
        this.run = p?.run ?? Game.run;
        this.message = p?.message ?? null;
        if (!this.run) { ScreenManager.show('Title'); return; }
        if (this.run.phase === 'reward' && ScreenManager.show('RoundWon', { run: this.run })) return;
        Sound.music(this.run.isBoss ? 'boss' : 'menu');
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
        this.forge = new ForgeView(root, run, this.selected?.id ?? null, 0, forgeY, innerW + 20, forgeH, (made) => {
            if (tutorialStep() === 6) finishTutorial();
            this.selected = made;
            this.message = { title: `Forged the ${cardWords(made)}`, body: 'The two cards became one. Done for this round.' };
            Sound.play('forge');
            this.changed(made.id);
        });
        const youTop = forgeY + (forgeH + 10) / 2 + 15 + 165;

        // Board fills the space between the strip and the bottom block.
        const boardTop = stripTop - stripH - 18;
        const boardH = boardTop - youTop - 10;
        const board = this.board = new BoardView(this.content, this.dragLayer!, run, {
            left: L, top: boardTop, width: innerW, height: boardH,
            stashLeft: L + 465, stashTop: youTop, stashWidth: innerW - 465, stashHeight: 165,
        }, {
            changed: (id) => this.changed(id),
            selected: (card) => { this.selected = card; this.message = null; this.refreshSelection(); },
        }, this.selected?.id ?? null);

        // Info box beside the column labels.
        const infoLeft = board.colLabelsRight + 30;
        this.infoArgs = [root, infoLeft, R, board.colLabelsTop, board.colLabelsHeight];
        this.infoBox = this.buildInfoBox(root, run, infoLeft, R, board.colLabelsTop, board.colLabelsHeight);

        this.buildYou(root, run, L, youTop);

        // A new round's cards are dealt in once (not on every rebuild or when back from Options).
        const key = `${Game.profile.runs}:${run.round}`;
        if (dealtRound !== key) { dealtRound = key; board.dealIn(); }
        this.showTutorialStep();
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

        makeButton(root, 'Options', ButtonStyle.Dark, 'Options', 150, 87, { x: R - 75, y }, () => this.openOptions(), 27);
    }

    private buildInfoBox(root: Node, run: Run, left: number, right: number, top: number, h: number): Node | null {
        const kit = UiKit.get();
        const w = right - left;
        if (w < 200) return null;
        const box = makeSprite(root, 'InfoBox', kit.panelCream, w, h + 10, { x: left + w / 2, y: top - (h + 10) / 2 }, true).node;
        const x0 = -w / 2 + 30;
        const titleY = h / 2 - 20;
        const bodyY = titleY - 20;
        const bodySize = 24; // two lines must fit in the 105 px box

        if (this.message) {
            makeLabel(box, 'Title', this.message.title, { size: FONT.label + 3, color: COLOR.ink, align: 'left', x: x0, y: titleY });
            makeLabel(box, 'Body', this.message.body, { font: 'body', size: bodySize, color: COLOR.ink, align: 'left', x: x0, y: bodyY, width: w - 60, height: h - 50, anchorY: 1 });
            return box;
        }
        const card = this.selected;
        if (!card) {
            makeLabel(box, 'Title', 'Tap a card to see its hands', { size: FONT.label + 3, color: COLOR.ink, align: 'left', x: x0, y: titleY });
            makeLabel(box, 'Body', 'Drag to move. Drop on a card to swap, or on the stash to bench it.', { font: 'body', size: bodySize, color: COLOR.ink, align: 'left', x: x0, y: bodyY, width: w - 60, height: h - 50, anchorY: 1 });
            return box;
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
        return box;
    }

    private buildYou(root: Node, run: Run, L: number, top: number) {
        const kit = UiKit.get();
        // Avatar: the King roughout at 1× (96×144).
        makeSprite(root, 'Avatar', kit.frame('concept/king_roughout'), 96, 144, { x: L + 48, y: top - 12 - 72 });
        const cells = run.data.healthCells;
        makeLabel(root, 'YouLabel', `YOU · ${cells} / ${cells}`, { size: FONT.labelSmall, spacing: 2, color: COLOR.lilac, align: 'left', x: L + 126, y: top - 12 });
        this.healthNode = buildHealthGrid(root, cells, 300, 120, L + 126, top - 36).node;
    }

    // ---- Actions ----------------------------------------------------------------

    /**
     * A tap only changes the selection: the pink ring, the Forge's pair and the
     * info box. Update just those instead of rebuilding the whole screen (a full
     * rebuild is ~200 nodes, which a phone feels on every tap).
     */
    private refreshSelection() {
        const run = this.run;
        if (!run || !this.board || !this.infoArgs || !this.content?.isValid) { this.rebuild(); return; }
        const id = this.selected?.id ?? null;
        this.board.setSelected(id);
        this.forge?.setSelected(id);
        const old = this.infoBox;
        const index = old?.isValid ? old.getSiblingIndex() : -1;
        if (old?.isValid) { old.removeFromParent(); old.destroy(); }
        const [root, left, right, top, h] = this.infoArgs;
        this.infoBox = this.buildInfoBox(root, run, left, right, top, h);
        if (this.infoBox && index >= 0) this.infoBox.setSiblingIndex(index);
    }

    /** After any change: save, then rebuild. */
    private changed(movedId?: number) {
        Game.saveRun();
        // Tutorial step 2 is done once row 3 is full.
        if (tutorialStep() === 2 && this.run!.board().rows[2]?.full) setTutorialStep(3);
        this.rebuild();
        if (movedId !== undefined) this.board?.pop(movedId);
    }

    private openOptions() {
        Game.saveRun();
        if (!ScreenManager.show('Options', { back: 'Planning', backParams: { run: this.run } })) ScreenManager.show('Title');
    }

    // ---- Tutorial (steps 1, 2, 3 and 6 happen here) ---------------------------------

    private showTutorialStep() {
        if (this.tutorial?.isValid) this.tutorial.destroy();
        this.tutorial = null;
        const run = this.run!;
        let step = tutorialStep();
        if (!step || run.phase !== 'planning') return;
        // Steps 4–5 belong to the fight and the round won screen; past round 1 we're at step 6.
        if (run.round >= 2 && step < 6) { setTutorialStep(6); step = 6; }
        if (run.round === 1 && step === 2 && run.board().rows[2]?.full) { setTutorialStep(3); step = 3; }
        const board = this.board!;
        const again = () => this.showTutorialStep();

        if (step === 1) {
            this.tutorial = showTutorial(this.node, {
                step, at: 'top', button: 'Continue',
                spot: this.healthNode ? worldRect(this.healthNode) : null,
                onButton: () => { setTutorialStep(2); again(); },
            });
        } else if (step === 2) {
            this.tutorial = showTutorial(this.node, {
                step, at: 'top', button: 'Place it',
                spot: unionRects([board.rowRect(2), board.stashRect()]),
                onButton: () => this.placeTen(),
            });
        } else if (step === 3) {
            this.tutorial = showTutorial(this.node, {
                step, at: 'top', button: 'Fight!',
                spot: unionRects([board.colRect(2), ...board.labels.rows.map((l) => worldRect(l.node))]),
                extra: suitLegend,
                onButton: () => { setTutorialStep(4); this.startRound(); },
            });
        } else if (step === 6) {
            this.tutorial = showTutorial(this.node, {
                step, at: 'top', button: 'Finish',
                spot: this.forge ? worldRect(this.forge.root) : null,
                onButton: () => { finishTutorial(); again(); },
            });
        }
    }

    /** Step 2's button: moves the 10♣ (or the first stash card) into row 3's empty slot. */
    private placeTen() {
        const run = this.run!;
        const g = run.grid;
        const col = [0, 1, 2].find((c) => g.slots[2 * g.cols + c] === null);
        const card = run.stash.find((c) => c.rank === 10 && c.suit === 'C') ?? run.stash[0];
        if (col !== undefined && card) run.moveCard(card.id, { row: 2, col });
        Sound.play('card_place');
        this.changed(card?.id);
    }


    private startRound() {
        const run = this.run!;
        Game.saveRun();
        if (ScreenManager.show('Fight', { run })) return;
        // No fight screen in ScreenManager: play the round instantly.
        const fight = run.startFight();
        fight.runToEnd();
        finishRound(run, fight);
    }
}
