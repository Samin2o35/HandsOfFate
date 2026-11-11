// Hands of Fate — ui/PlanningScreen.ts
// Planning on the shared landscape table (ui/table.ts, plan phase 2, grey boxes):
//   left   your hands in words, your health, the stash
//   middle your board, with the same small badge on every row and column
//   right  the opponent: portrait, their hands in words, their health
//   under  the Forge button and START ROUND
// The Forge opens as a drawer over the opponent panel. Everything is rebuilt
// from the run when it changes; a tap only repaints the selection.

import { _decorator, Node, UITransform, Widget, screen } from 'cc';
import { Sound } from '../app/Sound';
import { GameScreen } from './GameScreen';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run } from '../core/run';
import { Card } from '../core/cards';
import { Hand, evaluateBoard } from '../core/evaluate';
import { opponentHealth } from '../core/opponents';
import { mergeablePairs } from '../core/forge';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, FONT } from './UiKit';
import { ButtonStyle } from './UiButton';
import { BoardView, worldRect, unionRects } from './BoardView';
import { ForgeView } from './ForgeView';
import { showTheirTable } from './TheirTable';
import { cardWords } from './views';
import { finishRound, PlanningMessage } from './flow';
import { tutorialStep, setTutorialStep, finishTutorial, showTutorial, suitLegend } from './Tutorial';
import { jokerLine, Moment } from './joker';
import {
    tableRegions, TableRegions, buildStrip, buildHandList, paintEntry, buildOpponentPanel, ListEntry, GREY, buildJoker, buildHealthBlock,
} from './table';
import { frame, rule, ringFrame } from './kitC';
import { healthCols } from '../core/health';

/** runs:round of the last round whose cards were dealt in (see rebuild). */
let dealtRound = '';

const { ccclass } = _decorator;

const STASH_H = 180;

@ccclass('PlanningScreen')
export class PlanningScreen extends GameScreen {
    private run: Run | null = null;
    private selected: Card | null = null;
    /** A tapped hand (list line or badge): its cards get the pink ring. */
    private pickedHand: string | null = null;
    private message: { title: string; body: string } | null = null;
    /** The drawer over the opponent panel: the Forge or the whole stash (Stage C). */
    private drawer: 'forge' | 'stash' | null = null;
    private get forgeOpen() { return this.drawer === 'forge'; }
    private content: Node | null = null;
    private dragLayer: Node | null = null;
    private board: BoardView | null = null;
    private forge: ForgeView | null = null;
    private forgeButton: Node | null = null;
    private healthNode: Node | null = null;
    private tutorial: Node | null = null;
    private entries: ListEntry[] = [];

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
        const g = tableRegions(this.node.getComponent(UITransform)!);
        if (!this.content) {
            this.content = makeNode(this.node, 'Content', g.W, g.H);
            this.dragLayer = makeNode(this.node, 'DragLayer', g.W, g.H);
        }
        clearChildren(this.content);
        clearChildren(this.dragLayer!);
        const root = this.content;
        this.forge = null;

        buildStrip(root, g, run.round, run.isBoss ? 'Boss round · planning' : 'Planning', run.score, () => this.openOptions());

        // Left column: your hands from the top, then your health, the stash at the bottom.
        const side = g.side;
        const sideBottom = side.top - side.height;
        const stashTop = sideBottom + STASH_H;
        const cells = run.data.healthCells;
        const healthH = Math.max(168, Math.ceil(cells / healthCols(cells)) * 34 + 66);

        const o = g.opponent;
        const board = this.board = new BoardView(root, this.dragLayer!, run, {
            left: g.board.left, top: g.board.top, width: g.board.width, height: g.board.height,
            stashLeft: side.left, stashTop, stashWidth: side.width, stashHeight: STASH_H,
            drawer: this.drawer === 'stash' ? { left: o.left, top: o.top, width: o.width, height: o.height } : undefined,
        }, {
            changed: (id) => this.changed(id),
            selected: (card) => { this.selected = card; this.pickedHand = null; this.message = null; this.refreshSelection(); },
            badge: (id) => this.pickHand(id),
            stashDrawer: () => this.toggleDrawer('stash'),
        }, this.selected?.id ?? null);
        // His line when there's no round news (none during the tutorial: the Dealer is talking).
        const moment: Moment = this.forgeOpen ? 'forge' : run.opponent.boss ? 'king' : run.round === 1 ? 'newRun' : 'planning';
        const quote = tutorialStep() > 0 ? '' : jokerLine(moment, run.round);
        buildJoker(root, g, board.block.left + board.block.width / 2, board.frameTop, this.message, quote);

        const listTop = side.top + 4;
        const listMax = listTop - (stashTop + 4) - 22 - healthH - 22;
        const list = buildHandList(root, run.board().hands, side.left, listTop, side.width, listMax, (h) => this.pickHand(h.id));
        this.entries = list.entries;
        this.healthNode = buildHealthBlock(root, side.left, list.bottom - 22, side.width, cells).grid.node;

        // A drawer (the Forge or the stash) takes the opponent's place while it's open.
        if (this.drawer === 'forge') this.buildForgeDrawer(root, run, g);
        else if (this.drawer !== 'stash') this.buildOpponent(root, run, g);
        this.buildActions(root, run, g);
        this.refreshSelection(false);

        // A new round's cards are dealt in once (not on every rebuild or when back from Options).
        const key = `${Game.profile.runs}:${run.round}`;
        if (dealtRound !== key) { dealtRound = key; board.dealIn(); }
        this.showTutorialStep();
    }

    // ---- Parts ------------------------------------------------------------------

    private buildOpponent(root: Node, run: Run, g: TableRegions) {
        const o = run.opponent;
        const cooldownOf = (h: Hand) => h.cooldown * o.cooldownMultiplier;
        const result = evaluateBoard(o.grid);
        buildOpponentPanel(root, g.opponent, o, result.hands, cooldownOf, opponentHealth(o),
            () => showTheirTable(this.node, run, o, result, cooldownOf));
    }

    private buildActions(root: Node, run: Run, g: TableRegions) {
        const a = g.actions;
        const y = a.top - a.height / 2;
        const forgeW = 220, gap = 20;
        const ready = run.forgeAvailable && mergeablePairs(run.ownedCards()).length > 0;
        const fx = a.left + forgeW / 2;
        // A gold ring when two identical cards are waiting to be forged.
        if (ready && !this.forgeOpen) makeSprite(root, 'ForgeGlow', ringFrame(forgeW + 16, a.height + 16, 'gold'), forgeW + 16, a.height + 16, { x: fx, y });
        const fb = makeButton(root, 'ForgeButton', this.forgeOpen ? ButtonStyle.Cream : ButtonStyle.Dark, this.forgeOpen ? 'Close' : 'Forge', forgeW, a.height, { x: fx, y }, () => this.toggleForge(), 30);
        this.forgeButton = fb.node;
        const startW = a.width - forgeW - gap;
        makeButton(root, 'StartRound', ButtonStyle.Red, 'START ROUND', startW, a.height, { x: a.left + forgeW + gap + startW / 2, y }, () => this.startRound(), FONT.button + 6);
    }

    /** The Forge as a drawer over the opponent panel. */
    private buildForgeDrawer(root: Node, run: Run, g: TableRegions) {
        const r = g.opponent;
        const drawer = frame(root, 'ForgeDrawer', r.width, r.height, { x: r.left + r.width / 2, y: r.top - r.height / 2 }, { caption: 'THE FORGE' });
        const x0 = -r.width / 2 + 30;
        makeLabel(drawer, 'What', 'Two identical cards become one better card. Once per round.', { font: 'body', size: 30, color: GREY.soft, align: 'left', x: x0, y: r.height / 2 - 70, width: r.width - 60, height: 40 });
        makeLabel(drawer, 'Tip', 'Pick a pair above, or tap one of its cards on your board.', { font: 'body', size: 27, color: GREY.dim, align: 'left', x: x0, y: -r.height / 2 + 50, width: r.width - 60, height: 36 });
        rule(drawer, 'Rule', r.width - 60, x0, -r.height / 2 + 90);
        this.forge = new ForgeView(drawer, run, this.selected?.id ?? null, 0, 0, r.width - 60, 500, (made) => {
            if (tutorialStep() === 6) finishTutorial();
            this.selected = made;
            this.drawer = null;
            this.message = { title: `Forged the ${cardWords(made)}`, body: 'The two cards became one. Done for this round.' };
            Sound.play('forge');
            this.changed(made.id);
        });
    }

    // ---- Actions ----------------------------------------------------------------

    private toggleForge() { this.toggleDrawer('forge'); }

    private toggleDrawer(which: 'forge' | 'stash') {
        this.drawer = this.drawer === which ? null : which;
        this.rebuild();
    }

    /** A tapped hand (list line or badge): ring its cards; tap it again to clear. */
    private pickHand(id: string | null) {
        Sound.play('select');
        this.pickedHand = id && id !== this.pickedHand ? id : null;
        this.selected = null;
        this.refreshSelection();
    }

    /**
     * A tap only changes the selection: the pink rings, the Forge's pair and the
     * highlighted hand lines. Update just those instead of rebuilding the screen.
     */
    private refreshSelection(full = true) {
        const run = this.run;
        if (!run || !this.board || !this.content?.isValid) { if (full) this.rebuild(); return; }
        const hand: Hand | undefined = this.pickedHand ? run.board().hands.find((h) => h.id === this.pickedHand) : undefined;
        if (hand) this.board.highlight(hand.cards.map((pc) => pc.card.id));
        else this.board.setSelected(this.selected?.id ?? null);
        this.forge?.setSelected(this.selected?.id ?? null);
        const cardId = this.selected?.id;
        for (const e of this.entries) {
            const picked = e.hand.id === this.pickedHand || (cardId !== undefined && e.hand.cards.some((pc) => pc.card.id === cardId));
            paintEntry(e, picked ? 'picked' : 'normal');
        }
    }

    /** After any change: save, then rebuild. */
    private changed(movedId?: number) {
        Game.saveRun();
        this.pickedHand = null;
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
        // The Dealer sits over the opponent panel, so your side of the table stays visible.
        if (step === 1) {
            this.tutorial = showTutorial(this.node, {
                step, at: 'right', button: 'Continue',
                spot: this.healthNode ? worldRect(this.healthNode) : null,
                onButton: () => { setTutorialStep(2); again(); },
            });
        } else if (step === 2) {
            this.tutorial = showTutorial(this.node, {
                step, at: 'right', button: 'Place it',
                spot: unionRects([board.rowRect(2), board.stashRect()]),
                onButton: () => this.placeTen(),
            });
        } else if (step === 3) {
            this.tutorial = showTutorial(this.node, {
                step, at: 'right', button: 'Fight!',
                spot: unionRects([board.colRect(2), ...board.badges.rows.map((b) => worldRect(b.node))]),
                extra: suitLegend,
                onButton: () => { setTutorialStep(4); this.startRound(); },
            });
        } else if (step === 6) {
            this.tutorial = showTutorial(this.node, {
                step, at: 'right', button: 'Finish',
                spot: this.forgeButton ? worldRect(this.forgeButton) : null,
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
        this.drawer = null;
        Game.saveRun();
        if (ScreenManager.show('Fight', { run })) return;
        // No fight screen in ScreenManager: play the round instantly.
        const fight = run.startFight();
        fight.runToEnd();
        finishRound(run, fight);
    }
}
