// Hands of Fate — core/decks.ts
// Starting decks: the fixed tutorial deck (GDD "Starting deck") and the random
// decks for every later run (GDD "Random starting decks").

import { Card, Rank, Suit, SUITS, makeCard, parseCard } from './cards';
import { Grid, createGrid, gridFromText, setCard } from './grid';
import { evaluateBoard } from './evaluate';
import { EFFECT_OF_SUIT } from './hands';
import { Rng } from './rng';

export interface StartingSetup {
    grid: Grid;
    stash: Card[];
}

// ---- Tutorial ----------------------------------------------------------------

/**
 * The suggested opening on the 3×3 grid. Makes one hand of every suit:
 *   Row 1  5♥ 5♠ J♠   Pair of 5s  -> Heal  (5♥ first in reading order)
 *   Row 2  3♦ 3♦ 9♥   Pair of 3s  -> Armor
 *   Row 3  8♣ 8♠ 10♣  Pair of 8s  -> Rot   (8♣ first)
 *   Col 3  J♠ 9♥ 10♣  Straight 9-10-J -> Attack (J♠ is highest)
 */
export const TUTORIAL_LAYOUT = '5H 5S JS / 3D 3D 9H / 8C 8S 10C';
export const TUTORIAL_STASH = ['QH'];

/** Tutorial step 2 starts with row 3 unfinished: the 10♣ waits in the stash. */
export const TUTORIAL_STEP2_LAYOUT = '5H 5S JS / 3D 3D 9H / 8C 8S -';
export const TUTORIAL_STEP2_STASH = ['10C', 'QH'];

export function tutorialSetup(step2 = false): StartingSetup {
    return {
        grid: gridFromText(step2 ? TUTORIAL_STEP2_LAYOUT : TUTORIAL_LAYOUT),
        stash: (step2 ? TUTORIAL_STEP2_STASH : TUTORIAL_STASH).map(parseCard),
    };
}

// ---- Random starting decks -----------------------------------------------------
// Template: 3 pairs + a 3-card run + 1 spare. The pairs fill the rows, the run
// fills column 3, the spare goes to the stash. Best opening: 3 pairs + straight = 35.

export const STARTING_HAND_POINTS = 35;

export interface DeckParts {
    pairs: [Card, Card][];
    /** Top to bottom in column 3. */
    run: Card[];
    spare: Card;
}

/** The dealt layout for a deck: pair i fills row i, run card i ends row i. */
export function layoutDeck(parts: DeckParts): StartingSetup {
    const g = createGrid(3, 3);
    parts.pairs.forEach(([a, b], r) => {
        setCard(g, r, 0, a);
        setCard(g, r, 1, b);
        setCard(g, r, 2, parts.run[r]);
    });
    return { grid: g, stash: [parts.spare] };
}

/** Every rule a random deck breaks (empty = valid). */
export function deckProblems(parts: DeckParts): string[] {
    const problems: string[] = [];
    const all = [...parts.pairs.flat(), ...parts.run, parts.spare];
    if (all.length !== 10) problems.push('needs 10 cards');

    // Ranks: 2..K, three different pair ranks, run shares no rank with a pair.
    if (all.some((c) => c.rank === 14)) problems.push('no Aces in starting decks');
    const pairRanks = parts.pairs.map(([a, b]) => (a.rank === b.rank ? a.rank : -1));
    if (pairRanks.includes(-1)) problems.push('a pair has two ranks');
    if (new Set(pairRanks).size !== 3) problems.push('pair ranks must all differ');
    const runRanks = parts.run.map((c) => c.rank).sort((a, b) => a - b);
    if (runRanks[1] !== runRanks[0] + 1 || runRanks[2] !== runRanks[1] + 1) problems.push('run is not 3 in a row');
    if (runRanks.some((r) => pairRanks.includes(r))) problems.push('run shares a rank with a pair');

    // Suits: a 3-3-2-2 split; at most one pair in a single suit.
    const counts = SUITS.map((s) => all.filter((c) => c.suit === s).length).sort();
    if (counts.join() !== '2,2,3,3') problems.push('suits must split 3-3-2-2');
    if (parts.pairs.filter(([a, b]) => a.suit === b.suit).length > 1) problems.push('only one pair may share a suit');

    // Too strong: trips, a straight flush anywhere, a run the spare extends to 4.
    const rankCount = new Map<number, number>();
    for (const c of all) rankCount.set(c.rank, (rankCount.get(c.rank) ?? 0) + 1);
    if ([...rankCount.values()].some((n) => n >= 3)) problems.push('can make three of a kind');
    for (const s of SUITS) {
        const ranks = new Set<number>(all.filter((c) => c.suit === s).map((c) => c.rank));
        if ([...ranks].some((r) => ranks.has(r + 1) && ranks.has(r + 2))) problems.push('can make a straight flush');
    }
    if (parts.spare.rank === runRanks[0] - 1 || parts.spare.rank === runRanks[2] + 1) problems.push('spare extends the run to 4');

    // The dealt layout must be exactly 3 pairs + the straight (no flush lines, no extra straights).
    const result = evaluateBoard(layoutDeck(parts).grid);
    const rowsOk = result.rows.every((l) => l.hand?.category === 'pair');
    const colsOk = result.cols[0].hand === null && result.cols[1].hand === null && result.cols[2].hand?.category === 'straight';
    if (!rowsOk || !colsOk || result.handPoints !== STARTING_HAND_POINTS) problems.push('layout is not 3 pairs + a straight');

    // Effect check: at least one damage hand and one defensive hand, from different hands.
    // A pair can take either of its suits (by placement order); the run's suit is fixed.
    const options: Suit[][] = [...parts.pairs.map(([a, b]) => [a.suit, b.suit]), [result.cols[2].hand?.suit ?? 'S']];
    const damage = (s: Suit) => EFFECT_OF_SUIT[s] === 'attack' || EFFECT_OF_SUIT[s] === 'rot';
    const ok = options.some((a, i) => a.some(damage) && options.some((b, j) => j !== i && b.some((s) => !damage(s))));
    if (!ok) problems.push('needs a damage hand and a defensive hand');

    return problems;
}

/** Deals a random starting deck that passes every rule. Re-rolls until it does. */
export function randomStartingDeck(rng: Rng): StartingSetup & { parts: DeckParts; tries: number } {
    for (let tries = 1; tries <= 10000; tries++) {
        const parts = dealTemplate(rng);
        if (deckProblems(parts).length === 0) return { ...layoutDeck(parts), parts, tries };
    }
    throw new Error('Could not deal a valid starting deck');
}

function dealTemplate(rng: Rng): DeckParts {
    const ranks = Array.from({ length: 12 }, (_, i) => (i + 2) as Rank); // 2..K
    const runStart = rng.int(2, 11);
    const runRanks = [runStart, runStart + 1, runStart + 2] as Rank[];
    const pairRanks = rng.shuffle(ranks.filter((r) => !runRanks.includes(r))).slice(0, 3);
    const spareRank = rng.pick(ranks.filter((r) => !pairRanks.includes(r) && r !== runStart - 1 && r !== runStart + 3));

    // 3-3-2-2: two random suits get 3 cards.
    const big = rng.shuffle(SUITS).slice(0, 2);
    const suits = rng.shuffle(SUITS.flatMap((s) => (big.includes(s) ? [s, s, s] : [s, s])));
    let k = 0;
    const card = (rank: Rank) => makeCard(suits[k++], rank);
    return {
        pairs: pairRanks.map((r) => [card(r), card(r)] as [Card, Card]),
        run: rng.shuffle(runRanks).map(card),
        spare: card(spareRank),
    };
}
