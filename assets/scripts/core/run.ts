// Hands of Fate — core/run.ts
// One run, start to end (GDD "Core loop and run structure"):
//   planning -> fight -> (won) reward -> next round planning ...
//                     -> (lost) over
// All run state lives in plain JSON data (RunData), so saving is just
// JSON.stringify(run.data) and loading is Run.fromJSON(text).

import { Card, Rank, RANKS, Suit, SUITS } from './cards';
import {
    Grid, cardsOnGrid, findCard, setCard, cardAt, canAddRow, canAddColumn, addRow, addColumn,
} from './grid';
import { evaluateBoard, BoardResult } from './evaluate';
import { HAND_INFO, HandCategory } from './hands';
import { createHealthGrid } from './health';
import { Fight } from './fight';
import { Rng } from './rng';
import { tutorialSetup, randomStartingDeck } from './decks';
import {
    Opponent, generateOpponent, opponentHealth, isBossRound, FaceRank,
} from './opponents';
import { BossCycle, newBossCycle, nextBoss, bossModifiers, bossSetupExtras } from './bosses';
import { scoreRound, RoundScore } from './scoring';
import { ForgeUpgrade, canMerge, forgeResult } from './forge';
import { RunProgress } from './achievements';

export const SAVE_VERSION = 1;
export const PLAYER_START_HEALTH = 12;
export const PLAYER_MAX_HEALTH = 60;
export const HEALTH_REWARD = 2;
export const CARDS_REWARD = 3;

export type Phase = 'planning' | 'fight' | 'reward' | 'over';

export type RewardChoice =
    | { kind: 'health' }
    | { kind: 'grid'; add: 'row' | 'col' }
    | { kind: 'cards' };

export interface RewardOption {
    kind: 'health' | 'grid' | 'cards';
    available: boolean;
    /** For grid: which directions can still grow. */
    directions?: ('row' | 'col')[];
}

export interface RoundResult {
    round: number;
    won: boolean;
    /** Opponent's name ("Jack of Clubs' table"). */
    opponent: string;
    score: RoundScore;
    /** Total run score after this round. */
    runScore: number;
}

/** Everything a run is. Plain data: safe to JSON.stringify and load back. */
export interface RunData {
    version: number;
    seed: number;
    rngState: number;
    tutorial: boolean;
    round: number;
    phase: Phase;
    score: number;
    grid: Grid;
    stash: Card[];
    healthCells: number;
    nextCardId: number;
    opponent: Opponent;
    forgeUsed: boolean;
    /** Reward phase: has the player taken one of the opponent's cards yet? */
    cardTaken: boolean;
    bosses: BossCycle;
    lastAvatar: { suit: Suit; rank: FaceRank } | null;
    lastResult: RoundResult | null;
    flawlessStreak: number;
    progress: RunProgress;
    totals: { handsFired: number; bestHand: HandCategory | null; roundsWon: number };
}

export interface NewRunOptions {
    seed: number;
    /** Fixed tutorial deck, starting with the 10♣ in the stash (tutorial step 2). */
    tutorial?: boolean;
}

export class Run {
    constructor(readonly data: RunData) {}

    // ---- Start, save, load ---------------------------------------------------

    static newRun(options: NewRunOptions): Run {
        const rng = new Rng(options.seed);
        const setup = options.tutorial ? tutorialSetup(true) : randomStartingDeck(rng);
        const data: RunData = {
            version: SAVE_VERSION,
            seed: options.seed,
            rngState: 0,
            tutorial: !!options.tutorial,
            round: 1,
            phase: 'planning',
            score: 0,
            grid: { rows: setup.grid.rows, cols: setup.grid.cols, slots: [] },
            stash: [],
            healthCells: PLAYER_START_HEALTH,
            nextCardId: 1,
            opponent: null as unknown as Opponent,
            forgeUsed: false,
            cardTaken: false,
            bosses: newBossCycle(),
            lastAvatar: null,
            lastResult: null,
            flawlessStreak: 0,
            progress: { round: 1, score: 0, bestFlawlessStreak: 0, oneSuitRound: 0 },
            totals: { handsFired: 0, bestHand: null, roundsWon: 0 },
        };
        const run = new Run(data);
        data.grid.slots = setup.grid.slots.map((c) => (c ? run.own(c) : null));
        data.stash = setup.stash.map((c) => run.own(c));
        run.makeOpponent(rng);
        data.rngState = rng.state;
        return run;
    }

    toJSON(): string {
        return JSON.stringify(this.data);
    }

    static fromJSON(text: string): Run {
        const data = JSON.parse(text) as RunData;
        if (data.version !== SAVE_VERSION) throw new Error(`Save version ${data.version} is not supported`);
        // A fight isn't saved: if the app closed mid-fight, the round restarts from planning.
        if (data.phase === 'fight') data.phase = 'planning';
        return new Run(data);
    }

    // ---- Reading state ---------------------------------------------------------

    get phase(): Phase { return this.data.phase; }
    get round(): number { return this.data.round; }
    get score(): number { return this.data.score; }
    get grid(): Grid { return this.data.grid; }
    get stash(): readonly Card[] { return this.data.stash; }
    get opponent(): Opponent { return this.data.opponent; }
    get isBoss(): boolean { return this.data.opponent.boss !== null; }

    /** Your board's hands right now (for the planning screen labels). */
    board(): BoardResult { return evaluateBoard(this.data.grid); }

    /** Every card you own: grid, then stash. */
    ownedCards(): Card[] { return [...cardsOnGrid(this.data.grid), ...this.data.stash]; }

    // ---- Planning --------------------------------------------------------------

    /**
     * Moves a card to a grid slot or the stash. Dropping on an occupied slot
     * swaps the two cards.
     */
    moveCard(cardId: number, to: { row: number; col: number } | 'stash'): void {
        this.require('planning');
        const g = this.data.grid;
        const from = findCard(g, cardId);
        const stashIndex = this.data.stash.findIndex((c) => c.id === cardId);
        if (!from && stashIndex < 0) throw new Error(`You don't own card ${cardId}`);
        const card = from ? cardAt(g, from.row, from.col)! : this.data.stash[stashIndex];

        if (to === 'stash') {
            if (!from) return;
            setCard(g, from.row, from.col, null);
            this.data.stash.push(card);
            return;
        }
        const occupant = cardAt(g, to.row, to.col);
        if (occupant?.id === card.id) return;
        if (from) {
            setCard(g, from.row, from.col, occupant);
        } else {
            this.data.stash.splice(stashIndex, 1);
            if (occupant) this.data.stash.splice(stashIndex, 0, occupant);
        }
        setCard(g, to.row, to.col, card);
    }

    /** Forge: merge two identical cards and upgrade the result. Once per round. */
    forge(cardIdA: number, cardIdB: number, upgrade: ForgeUpgrade): Card {
        this.require('planning');
        if (this.data.forgeUsed) throw new Error('The Forge was already used this round');
        const owned = this.ownedCards();
        const a = owned.find((c) => c.id === cardIdA);
        const b = owned.find((c) => c.id === cardIdB);
        if (!a || !b || !canMerge(a, b)) throw new Error('The Forge needs two identical cards');
        const result = forgeResult(a, upgrade);
        this.replaceCard(a.id, result);
        this.removeCard(b.id);
        this.data.forgeUsed = true;
        return result;
    }

    get forgeAvailable(): boolean { return this.phase === 'planning' && !this.data.forgeUsed; }

    // ---- Fight -----------------------------------------------------------------

    /** Builds the fight for this round. Play it, then pass it to finishFight(). */
    startFight(): Fight {
        this.require('planning');
        this.data.phase = 'fight';
        const o = this.data.opponent;
        const boss = o.boss;
        return new Fight(
            { hands: evaluateBoard(this.data.grid).hands, health: createHealthGrid(this.data.healthCells) },
            {
                hands: evaluateBoard(o.grid).hands,
                health: opponentHealth(o),
                cooldownMultiplier: o.cooldownMultiplier,
                ...(boss ? bossSetupExtras(boss.suit, boss.tier) : {}),
            },
            { modifiers: boss ? bossModifiers(boss.suit, boss.tier) : [] },
        );
    }

    /** Scores a finished fight and moves to the reward (won) or run over (lost). */
    finishFight(fight: Fight): RoundResult {
        this.require('fight');
        if (!fight.over) throw new Error('The fight is not over yet');
        const d = this.data;
        const won = fight.winner === 'player';
        const p = fight.player.stats;
        const score = scoreRound({
            round: d.round,
            boss: this.isBoss,
            handsFired: p.handsFired,
            handPoints: p.handPointsFired,
            cellsLeft: fight.player.living,
            cellsTotal: fight.player.startLiving,
            flawless: fight.enemy.stats.damageDealt === 0,
            time: fight.time,
        });

        d.totals.handsFired += p.handsFired;
        if (p.bestHand && (!d.totals.bestHand || HAND_INFO[p.bestHand].strength > HAND_INFO[d.totals.bestHand].strength)) {
            d.totals.bestHand = p.bestHand;
        }

        if (won) {
            d.score += score.total;
            d.totals.roundsWon++;
            d.flawlessStreak = score.flawless ? d.flawlessStreak + 1 : 0;
            d.progress.bestFlawlessStreak = Math.max(d.progress.bestFlawlessStreak, d.flawlessStreak);
            const suits = new Set(cardsOnGrid(d.grid).map((c) => c.suit));
            if (suits.size === 1) d.progress.oneSuitRound = Math.max(d.progress.oneSuitRound, d.round);
            d.phase = 'reward';
            d.cardTaken = false;
        } else {
            d.phase = 'over';
        }
        d.progress.score = d.score;
        d.lastResult = { round: d.round, won, opponent: d.opponent.name, score, runScore: d.score };
        return d.lastResult;
    }

    // ---- Rewards -----------------------------------------------------------------

    /** Cards on the opponent's board you can take (always take one, first). */
    takeableCards(): Card[] { return cardsOnGrid(this.data.opponent.grid); }

    /** Takes a copy of one of the opponent's cards into your stash. */
    takeCard(cardId: number): Card {
        this.require('reward');
        if (this.data.cardTaken) throw new Error('You already took a card this round');
        const card = this.takeableCards().find((c) => c.id === cardId);
        if (!card) throw new Error(`Card ${cardId} isn't on the opponent's board`);
        const mine = this.own(card);
        this.data.stash.push(mine);
        this.data.cardTaken = true;
        return mine;
    }

    rewardOptions(): RewardOption[] {
        const g = this.data.grid;
        const directions: ('row' | 'col')[] = [];
        if (canAddRow(g)) directions.push('row');
        if (canAddColumn(g)) directions.push('col');
        return [
            { kind: 'health', available: this.data.healthCells < PLAYER_MAX_HEALTH },
            { kind: 'grid', available: directions.length > 0, directions },
            { kind: 'cards', available: true },
        ];
    }

    /** Picks the reward and starts the next round. Returns new cards (Cards reward). */
    chooseReward(choice: RewardChoice): Card[] {
        this.require('reward');
        if (!this.data.cardTaken) throw new Error('Take one of their cards first');
        const option = this.rewardOptions().find((o) => o.kind === choice.kind)!;
        if (!option.available) throw new Error(`The ${choice.kind} reward isn't available`);
        const d = this.data;
        if (choice.kind === 'grid' && !option.directions!.includes(choice.add)) {
            throw new Error(`The grid can't grow by a ${choice.add}`);
        }
        const rng = new Rng(d.rngState); // the run's random stream, picked up where it left off
        let gained: Card[] = [];
        if (choice.kind === 'health') {
            d.healthCells = Math.min(PLAYER_MAX_HEALTH, d.healthCells + HEALTH_REWARD);
        } else if (choice.kind === 'grid') {
            if (choice.add === 'row') addRow(d.grid); else addColumn(d.grid);
        } else {
            gained = this.rollCards(rng);
            d.stash.push(...gained);
        }
        this.nextRound(rng);
        d.rngState = rng.state;
        return gained;
    }

    // ---- Internals ---------------------------------------------------------------

    private nextRound(rng: Rng) {
        const d = this.data;
        d.round++;
        d.phase = 'planning';
        d.forgeUsed = false;
        d.progress.round = Math.max(d.progress.round, d.round);
        this.makeOpponent(rng);
    }

    private makeOpponent(rng: Rng) {
        const d = this.data;
        const boss = isBossRound(d.round) ? nextBoss(d.bosses, rng) : undefined;
        d.opponent = generateOpponent(d.round, rng, { boss, avoid: d.lastAvatar ?? undefined });
        d.lastAvatar = d.opponent.avatar;
    }

    /** 3 random cards, one guaranteed duplicate of a card you own. */
    private rollCards(rng: Rng): Card[] {
        const owned = this.ownedCards();
        const dup = rng.pick(owned);
        const cards = [this.own({ suit: dup.suit, rank: dup.rank })];
        for (let i = 1; i < CARDS_REWARD; i++) {
            cards.push(this.own({ suit: rng.pick(SUITS), rank: rng.pick<Rank>(RANKS) }));
        }
        return rng.shuffle(cards);
    }

    /** A copy of a card with a fresh id that belongs to this run. */
    private own(card: { suit: Suit; rank: Rank }): Card {
        return { id: this.data.nextCardId++, suit: card.suit, rank: card.rank };
    }

    private replaceCard(id: number, next: Card) {
        const at = findCard(this.data.grid, id);
        if (at) { setCard(this.data.grid, at.row, at.col, next); return; }
        const i = this.data.stash.findIndex((c) => c.id === id);
        this.data.stash[i] = next;
    }

    private removeCard(id: number) {
        const at = findCard(this.data.grid, id);
        if (at) { setCard(this.data.grid, at.row, at.col, null); return; }
        this.data.stash = this.data.stash.filter((c) => c.id !== id);
    }

    private require(phase: Phase) {
        if (this.data.phase !== phase) throw new Error(`Can't do that during ${this.data.phase} (needs ${phase})`);
    }
}
