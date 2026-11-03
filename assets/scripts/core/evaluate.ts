// Hands of Fate — core/evaluate.ts
// Turns a grid into hands. Rules (GDD "The grid and poker hands", "Suits and effects"):
//  - Every FULL row and FULL column is read as a poker hand (pair or better).
//  - Only the scoring cards make the hand; the rest of the line are kickers.
//  - A card can score in a row hand and a column hand at once (fires on both timers).
//  - Any card on the grid that scores in no hand fires alone as a high card.
//  - Straights count from a 3-card run anywhere in the line; Ace is high, and low in A-2-3.
//  - Flushes need the whole line in one suit (so 3 cards on a 3-wide grid, 5 on a 5-wide).
//    This matches the round 7 mockup, where 3 spades in a 4-card line is not a flush.
//  - Effect = most common suit among scoring cards. Tie: highest card of the
//    tied suits; if those tie in rank, the one first in reading order.

import { Card, Rank, Suit, SUITS, rankLabel, cardLabel, SUIT_SYMBOL } from './cards';
import { Grid } from './grid';
import { HAND_INFO, HandCategory, HitPattern, Effect, EFFECT_OF_SUIT, MIN_STRAIGHT, MIN_FLUSH } from './hands';

export interface PlacedCard {
    readonly card: Card;
    readonly row: number;
    readonly col: number;
    /** Reading order on the grid: row * cols + col. Lower = placed first. */
    readonly order: number;
}

export type HandSource = 'row' | 'col' | 'leftover';

export interface Hand {
    /** Stable id: "row-0", "col-2", or "card-17" for a leftover high card. */
    readonly id: string;
    readonly source: HandSource;
    /** Row or column number (0-based); for leftovers, the card's reading order. */
    readonly index: number;
    readonly category: HandCategory;
    /** The cards that make the hand fire. */
    readonly cards: readonly PlacedCard[];
    /** Line cards that don't score (empty for leftovers). */
    readonly kickers: readonly PlacedCard[];
    readonly suit: Suit;
    readonly effect: Effect;
    readonly cooldown: number;
    readonly points: number;
    readonly pattern: HitPattern;
    readonly multiplier: number;
    /** Short label, e.g. "Pair 8s", "Straight 9-10-J", "Flush ♥". */
    readonly label: string;
}

export interface LineResult {
    readonly kind: 'row' | 'col';
    readonly index: number;
    /** Slots in the line, null where empty. */
    readonly slots: readonly (PlacedCard | null)[];
    readonly full: boolean;
    /** null when the line is not full or makes no hand (UI shows "–" / "No hand"). */
    readonly hand: Hand | null;
}

export interface BoardResult {
    readonly rows: readonly LineResult[];
    readonly cols: readonly LineResult[];
    /** Every hand that will fire: row hands, then column hands, then leftover high cards. */
    readonly hands: readonly Hand[];
    /** Sum of hand points of all hands on the board (opponent budget, previews). */
    readonly handPoints: number;
}

// ---------------------------------------------------------------------------

export function evaluateBoard(g: Grid): BoardResult {
    const placed = (r: number, c: number): PlacedCard | null => {
        const order = r * g.cols + c;
        const card = g.slots[order];
        return card ? { card, row: r, col: c, order } : null;
    };

    const rows: LineResult[] = [];
    for (let r = 0; r < g.rows; r++) {
        const slots: (PlacedCard | null)[] = [];
        for (let c = 0; c < g.cols; c++) slots.push(placed(r, c));
        rows.push(lineResult('row', r, slots));
    }
    const cols: LineResult[] = [];
    for (let c = 0; c < g.cols; c++) {
        const slots: (PlacedCard | null)[] = [];
        for (let r = 0; r < g.rows; r++) slots.push(placed(r, c));
        cols.push(lineResult('col', c, slots));
    }

    const lineHands = [...rows, ...cols].map((l) => l.hand).filter((h): h is Hand => h !== null);
    const scoringIds = new Set<number>();
    for (const h of lineHands) for (const pc of h.cards) scoringIds.add(pc.card.id);

    const leftovers: Hand[] = [];
    for (let i = 0; i < g.slots.length; i++) {
        const pc = placed(Math.floor(i / g.cols), i % g.cols);
        if (pc && !scoringIds.has(pc.card.id)) leftovers.push(makeHand('leftover', pc.order, 'high', [pc], []));
    }

    const hands = [...lineHands, ...leftovers];
    return { rows, cols, hands, handPoints: hands.reduce((s, h) => s + h.points, 0) };
}

/** All hands a card fires in (for the "5♥ in 2 hands" info box). */
export function handsWithCard(result: BoardResult, cardId: number): Hand[] {
    return result.hands.filter((h) => h.cards.some((pc) => pc.card.id === cardId));
}

// ---------------------------------------------------------------------------

function lineResult(kind: 'row' | 'col', index: number, slots: (PlacedCard | null)[]): LineResult {
    const full = slots.every((s) => s !== null);
    let hand: Hand | null = null;
    if (full) {
        const cards = slots as PlacedCard[];
        const best = bestLineHand(cards);
        if (best) {
            const scoring = new Set(best.cards.map((pc) => pc.card.id));
            const kickers = cards.filter((pc) => !scoring.has(pc.card.id));
            hand = makeHand(kind, index, best.category, best.cards, kickers, best.runText);
        }
    }
    return { kind, index, slots, full, hand };
}

interface Candidate {
    category: HandCategory;
    cards: PlacedCard[];
    /** "4-5-6" for straights. */
    runText?: string;
}

/** Best hand (pair or better) a full line makes, or null. Exported for tests. */
export function bestLineHand(line: readonly PlacedCard[]): Candidate | null {
    const cards = [...line].sort((a, b) => a.order - b.order);

    // Same-rank groups, biggest first, then higher rank first.
    const byRank = new Map<Rank, PlacedCard[]>();
    for (const pc of cards) {
        const list = byRank.get(pc.card.rank) ?? [];
        list.push(pc);
        byRank.set(pc.card.rank, list);
    }
    const groups = [...byRank.values()]
        .filter((g) => g.length >= 2)
        .sort((a, b) => b.length - a.length || b[0].card.rank - a[0].card.rank);

    const bySuit = new Map<Suit, PlacedCard[]>();
    for (const pc of cards) {
        const list = bySuit.get(pc.card.suit) ?? [];
        list.push(pc);
        bySuit.set(pc.card.suit, list);
    }
    // A flush is the whole line in one suit (3+ cards). A straight flush is a
    // straight (3+ run, may sit inside a longer line) whose cards share a suit.
    const flushCards = cards.length >= MIN_FLUSH && bySuit.size === 1 ? cards : null;
    let sf: ReturnType<typeof findRun> = null;
    for (const list of bySuit.values()) {
        const run = list.length >= MIN_STRAIGHT ? findRun(list) : null;
        if (run && (!sf || run.cards.length > sf.cards.length)) sf = run;
    }

    // Strongest first; the first one found wins.
    if (sf) return { category: 'straightFlush', cards: sf.cards, runText: sf.text };
    if (groups[0]?.length >= 4) return { category: 'quads', cards: groups[0] };
    if (groups[0]?.length === 3 && groups[1]) return { category: 'fullHouse', cards: [...groups[0], ...groups[1]] };
    if (flushCards) return { category: 'flush', cards: flushCards };
    const run = findRun(cards);
    if (run) return { category: 'straight', cards: run.cards, runText: run.text };
    if (groups[0]?.length === 3) return { category: 'trips', cards: groups[0] };
    if (groups.length >= 2) return { category: 'twoPair', cards: [...groups[0], ...groups[1]] };
    if (groups.length === 1) return { category: 'pair', cards: groups[0] };
    return null;
}

/**
 * Longest run of consecutive ranks (3+), Ace high or low (A-2-3). On equal length
 * the higher run wins. With duplicate ranks, the card first in reading order plays.
 */
function findRun(cards: readonly PlacedCard[]): { cards: PlacedCard[]; text: string } | null {
    const atValue = new Map<number, PlacedCard>(); // value 1 = Ace low
    for (const pc of [...cards].sort((a, b) => a.order - b.order)) {
        const r = pc.card.rank;
        if (!atValue.has(r)) atValue.set(r, pc);
        if (r === 14 && !atValue.has(1)) atValue.set(1, pc);
    }
    let best: { cards: PlacedCard[]; values: number[] } | null = null;
    let run: PlacedCard[] = [];
    let values: number[] = [];
    for (let v = 1; v <= 14; v++) {
        const pc = atValue.get(v);
        if (!pc) { run = []; values = []; continue; }
        run.push(pc);
        values.push(v);
        if (run.length >= MIN_STRAIGHT && (!best || run.length >= best.cards.length)) {
            best = { cards: [...run], values: [...values] };
        }
    }
    if (!best) return null;
    const text = best.values.map((v) => (v === 1 ? 'A' : rankLabel(v as Rank))).join('-');
    return { cards: best.cards, text };
}

/** The suit that decides a hand's effect (see the rules at the top of this file). */
export function decideSuit(scoring: readonly PlacedCard[]): Suit {
    const counts = new Map<Suit, number>();
    for (const pc of scoring) counts.set(pc.card.suit, (counts.get(pc.card.suit) ?? 0) + 1);
    const most = Math.max(...counts.values());
    const tied = SUITS.filter((s) => counts.get(s) === most);
    if (tied.length === 1) return tied[0];
    const contenders = scoring
        .filter((pc) => tied.includes(pc.card.suit))
        .sort((a, b) => b.card.rank - a.card.rank || a.order - b.order);
    return contenders[0].card.suit;
}

function makeHand(
    source: HandSource, index: number, category: HandCategory,
    cards: PlacedCard[], kickers: PlacedCard[], runText?: string,
): Hand {
    const info = HAND_INFO[category];
    const suit = decideSuit(cards);
    const id = source === 'leftover' ? `card-${cards[0].card.id}` : `${source}-${index}`;
    return {
        id, source, index, category,
        cards: [...cards].sort((a, b) => a.order - b.order),
        kickers,
        suit,
        effect: EFFECT_OF_SUIT[suit],
        cooldown: info.cooldown,
        points: info.points,
        pattern: info.pattern,
        multiplier: info.multiplier,
        label: handLabel(category, cards, suit, runText),
    };
}

function plural(rank: Rank): string { return rankLabel(rank) + 's'; }

function handLabel(category: HandCategory, cards: PlacedCard[], suit: Suit, runText?: string): string {
    const top = cards.reduce((a, b) => (b.card.rank > a.card.rank ? b : a)).card;
    switch (category) {
        case 'high': return `High card ${cardLabel(cards[0].card)}`;
        case 'pair': return `Pair ${plural(cards[0].card.rank)}`;
        case 'twoPair': return 'Two pair';
        case 'trips': return `Trips ${plural(cards[0].card.rank)}`;
        case 'straight': return `Straight ${runText}`;
        case 'flush': return `Flush ${SUIT_SYMBOL[suit]}`;
        case 'fullHouse': return 'Full house';
        case 'quads': return `Four ${plural(top.rank)}`;
        case 'straightFlush': return `Straight flush ${runText} ${SUIT_SYMBOL[suit]}`;
    }
}
