// Hands of Fate — core/opponents.ts
// Opponent tables (GDD "Opponents, bosses and run end", "Opponent scaling").
// Each round's table is built to a hand-point budget, so difficulty rises
// smoothly whatever cards it draws. The generator starts from a random table
// and keeps tweaking cards, keeping each change that moves it closer to the
// budget, while holding the table rules:
//  - at least one attack hand (anti-stall)
//  - about half its cards in its avatar's suit

import { Card, Rank, RANKS, Suit, SUITS, SUIT_NAME, makeCard } from './cards';
import { Grid, createGrid, cardsOnGrid } from './grid';
import { evaluateBoard } from './evaluate';
import { HealthGrid, createHealthGrid } from './health';
import { Rng } from './rng';
import { bossHealth } from './bosses';

// ---- Scaling numbers (starting values to tune in playtests) --------------------

export const budgetFor = (round: number) => 5 + 8 * round;
export const BUDGET_SPREAD = 0.1;
export const healthFor = (round: number) => Math.min(60, 10 + 2 * round);
export const fillFor = (round: number) => Math.min(1, 0.6 + 0.04 * round);
export const BOSS_EVERY = 5;
export const BOSS_BUDGET_MULT = 1.3;
export const BOSS_EXTRA_HEALTH = 10;

/** Columns × rows. Mockup round 7: a table 3 wide, 4 tall. */
export function gridSizeFor(round: number): { cols: number; rows: number } {
    if (round <= 4) return { cols: 3, rows: 3 };
    if (round <= 9) return { cols: 3, rows: 4 };
    if (round <= 19) return { cols: 4, rows: 4 };
    if (round <= 29) return { cols: 4, rows: 5 };
    return { cols: 5, rows: 5 };
}

/** None until round 30, then cooldowns −5% per 10 rounds (round 30: −5%, 40: −10%). Capped at −50%. */
export function cooldownMultiplierFor(round: number): number {
    if (round < 30) return 1;
    return Math.max(0.5, 1 - 0.05 * (Math.floor(round / 10) - 2));
}

export const isBossRound = (round: number) => round % BOSS_EVERY === 0;

// ---- Opponent ------------------------------------------------------------------

export type FaceRank = 11 | 12 | 13;
const FACE_NAME: Record<FaceRank, string> = { 11: 'Jack', 12: 'Queen', 13: 'King' };

export interface Opponent {
    readonly round: number;
    /** Classic face card shown as the avatar (bosses: their King). */
    readonly avatar: { suit: Suit; rank: FaceRank };
    /** "Jack of Clubs' table" / "King of Clubs" */
    readonly name: string;
    readonly grid: Grid;
    readonly healthCells: number;
    readonly cooldownMultiplier: number;
    /** Target hand points this table was built for, and what it reached. */
    readonly budget: number;
    readonly handPoints: number;
    /** Set on boss rounds. */
    readonly boss: { suit: Suit; tier: number } | null;
}

export interface OpponentOptions {
    /** Boss to build (every 5th round). */
    boss?: { suit: Suit; tier: number };
    /** Avatar to avoid (last round's), so the same face doesn't repeat. */
    avoid?: { suit: Suit; rank: FaceRank };
}

export function generateOpponent(round: number, rng: Rng, options: OpponentOptions = {}): Opponent {
    const boss = options.boss ?? null;
    let avatar: { suit: Suit; rank: FaceRank };
    if (boss) {
        avatar = { suit: boss.suit, rank: 13 };
    } else {
        do {
            avatar = { suit: rng.pick(SUITS), rank: rng.pick<FaceRank>([11, 12, 13]) };
        } while (options.avoid && avatar.suit === options.avoid.suit && avatar.rank === options.avoid.rank);
    }

    const spread = 1 - BUDGET_SPREAD + rng.next() * 2 * BUDGET_SPREAD;
    const budget = Math.round(budgetFor(round) * spread * (boss ? BOSS_BUDGET_MULT : 1));
    const { cols, rows } = gridSizeFor(round);
    const grid = buildTable(rng, rows, cols, Math.round(rows * cols * fillFor(round)), avatar.suit, budget);
    // Opponent cards get ids -1, -2, ... in reading order: never confused with
    // yours, and the same every time for the same seed.
    let id = 0;
    grid.slots = grid.slots.map((c) => (c ? { id: --id, suit: c.suit, rank: c.rank } : null));
    const healthCells = healthFor(round) + (boss ? BOSS_EXTRA_HEALTH : 0);

    return {
        round, avatar, grid, healthCells, budget, boss,
        name: boss ? `${FACE_NAME[avatar.rank]} of ${SUIT_NAME[avatar.suit]}` : `${FACE_NAME[avatar.rank]} of ${SUIT_NAME[avatar.suit]}' table`,
        cooldownMultiplier: cooldownMultiplierFor(round),
        handPoints: evaluateBoard(grid).handPoints,
    };
}

/** The opponent's health grid at the start of a fight. */
export function opponentHealth(o: Opponent): HealthGrid {
    return o.boss ? bossHealth(o.boss.suit, o.boss.tier, o.healthCells) : createHealthGrid(o.healthCells);
}

// ---- Table search --------------------------------------------------------------

const ITERATIONS = 700;
const RESTARTS = 3;

function buildTable(rng: Rng, rows: number, cols: number, filled: number, suit: Suit, budget: number): Grid {
    let best: Grid | null = null;
    let bestCost = Infinity;
    for (let k = 0; k < RESTARTS && bestCost > 0; k++) {
        const { grid, cost } = searchTable(rng, rows, cols, filled, suit, budget);
        if (cost < bestCost) { best = grid; bestCost = cost; }
    }
    return best!;
}

function searchTable(rng: Rng, rows: number, cols: number, filled: number, suit: Suit, budget: number): { grid: Grid; cost: number } {
    const all = Array.from({ length: rows * cols }, (_, i) => i);
    const randomSuit = () => (rng.chance(0.5) ? suit : rng.pick(SUITS));
    const randomCard = () => makeCard(randomSuit(), rng.pick(RANKS));

    const g = createGrid(rows, cols);
    for (const i of rng.shuffle(all).slice(0, Math.max(1, filled))) g.slots[i] = randomCard();

    let cost = tableCost(g, suit, budget);
    for (let it = 0; it < ITERATIONS && cost > 0; it++) {
        const full = all.filter((i) => g.slots[i] !== null);
        const empty = all.filter((i) => g.slots[i] === null);
        const i = rng.pick(full);
        const old = g.slots[i]!;
        const roll = rng.next();
        if (roll < 0.2 && empty.length > 0) {
            // Move a card into an empty slot (lets small tables complete lines).
            const j = rng.pick(empty);
            g.slots[j] = old;
            g.slots[i] = null;
            const c = tableCost(g, suit, budget);
            if (c <= cost) cost = c;
            else { g.slots[i] = old; g.slots[j] = null; }
            continue;
        }
        let next: Card;
        if (roll < 0.55) next = makeCard(old.suit, rng.pick(RANKS));
        else if (roll < 0.85) next = makeCard(randomSuit(), old.rank);
        else next = randomCard();
        g.slots[i] = next;
        const c = tableCost(g, suit, budget);
        if (c <= cost) cost = c;
        else g.slots[i] = old;
    }
    return { grid: g, cost };
}

/** 0 = on budget (within 5%) with every rule held; bigger = worse. */
function tableCost(g: Grid, suit: Suit, budget: number): number {
    const result = evaluateBoard(g);
    const tolerance = Math.max(2, budget * 0.05);
    let cost = Math.max(0, Math.abs(result.handPoints - budget) - tolerance);
    if (!result.hands.some((h) => h.effect === 'attack')) cost += 1000;
    const cards = cardsOnGrid(g);
    const inSuit = cards.filter((c) => c.suit === suit).length;
    const wanted = cards.length / 2;
    if (Math.abs(inSuit - wanted) > 1) cost += 50 * (Math.abs(inSuit - wanted) - 1);
    return cost;
}

/** Copy of a card for the player to keep (fresh id assigned by the run). */
export function copyOf(card: Card): { suit: Suit; rank: Rank } {
    return { suit: card.suit, rank: card.rank };
}
