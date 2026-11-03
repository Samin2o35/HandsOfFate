// Hands of Fate — core/cards.ts
// Pure TypeScript: no 'cc' imports anywhere in /core, so it runs in Node tests too.

/** ♠ Spades, ♥ Hearts, ♣ Clubs, ♦ Diamonds */
export type Suit = 'S' | 'H' | 'C' | 'D';
export const SUITS: readonly Suit[] = ['S', 'H', 'C', 'D'];

/** 2..10, J = 11, Q = 12, K = 13, A = 14 (Ace high). */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export interface Card {
    /** Unique per run, so two 3♦ can be told apart (Forge, drag and drop). */
    readonly id: number;
    readonly suit: Suit;
    readonly rank: Rank;
}

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };
export const SUIT_NAME: Record<Suit, string> = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' };

/** Pip colours sampled from the Updated deck (GDD: hearts red, diamonds blue, spades purple, clubs green). */
export const SUIT_COLOR_HEX: Record<Suit, string> = { S: '#8e478c', H: '#c93038', C: '#309c63', D: '#3978a8' };
/** Card stock and ink colours, sampled from the same art. Background is from the mockups. */
export const PALETTE = { cream: '#ecece0', ink: '#3b324a', background: '#1a1524', panelDark: '#2b2438', red: '#d2453c' } as const;

export function isRank(n: number): n is Rank {
    return Number.isInteger(n) && n >= 2 && n <= 14;
}

export function rankLabel(rank: Rank): string {
    switch (rank) {
        case 11: return 'J';
        case 12: return 'Q';
        case 13: return 'K';
        case 14: return 'A';
        default: return String(rank);
    }
}

/** "10♣", "J♠" */
export function cardLabel(c: { suit: Suit; rank: Rank }): string {
    return rankLabel(c.rank) + SUIT_SYMBOL[c.suit];
}

let nextId = 1;
/** Creates a card with a fresh id. Use resetCardIds() at the start of a run or a test. */
export function makeCard(suit: Suit, rank: Rank): Card {
    return { id: nextId++, suit, rank };
}
export function resetCardIds(start = 1): void {
    nextId = start;
}

// ---- Art lookup -----------------------------------------------------------
// Paths are relative to assets/resources and match the renamed art pack:
//   cards/updated/S_13  -> K♠ (Updated deck, used on grids, stash, Forge)
//   cards/classic/C_11  -> J♣ (Classic deck, opponent avatars and Aces)
//   anim/H_13           -> animated K♥ strip (8 frames, 360×504 each)

/** Size of one card at 1× art (the 4× files are 360×504). */
export const CARD_W_1X = 90;
export const CARD_H_1X = 126;

export function updatedArtPath(c: { suit: Suit; rank: Rank }): string {
    return `cards/updated/${c.suit}_${c.rank}`;
}
export function classicArtPath(c: { suit: Suit; rank: Rank }): string {
    return `cards/classic/${c.suit}_${c.rank}`;
}
/** Animated strips exist for J, Q, K and A only. */
export function animStripPath(c: { suit: Suit; rank: Rank }): string | null {
    return c.rank >= 11 ? `anim/${c.suit}_${c.rank}` : null;
}
export const CARD_BACK_PATH = 'cards/updated/back';
export const DEALER_CARD_PATH = 'cards/updated/joker_true';
export const DEALER_ANIM_PATH = 'anim/joker_true';
export const ANIM_FRAMES = 8;
