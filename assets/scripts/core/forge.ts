// Hands of Fate — core/forge.ts
// The Forge (GDD): merge two identical cards (same suit and rank) into one,
// then pick one upgrade: change suit, rank +1, or rank −1.
// Ranks stay within 2..A, so A can't go up and 2 can't go down.

import { Card, Rank, Suit, SUITS } from './cards';

export type ForgeUpgrade =
    | { kind: 'suit'; suit: Suit }
    | { kind: 'rank'; delta: 1 | -1 };

export function canMerge(a: Card, b: Card): boolean {
    return a.id !== b.id && a.suit === b.suit && a.rank === b.rank;
}

/** Every upgrade allowed for this card. */
export function forgeUpgrades(card: Card): ForgeUpgrade[] {
    const out: ForgeUpgrade[] = SUITS.filter((s) => s !== card.suit).map((suit) => ({ kind: 'suit' as const, suit }));
    if (card.rank < 14) out.push({ kind: 'rank', delta: 1 });
    if (card.rank > 2) out.push({ kind: 'rank', delta: -1 });
    return out;
}

/** The card the merge makes. It keeps the first card's id. */
export function forgeResult(card: Card, upgrade: ForgeUpgrade): Card {
    if (upgrade.kind === 'suit') {
        if (upgrade.suit === card.suit) throw new Error('Change suit needs a different suit');
        return { id: card.id, suit: upgrade.suit, rank: card.rank };
    }
    const rank = card.rank + upgrade.delta;
    if (rank < 2 || rank > 14) throw new Error(`Rank ${rank} is outside 2..A`);
    return { id: card.id, suit: card.suit, rank: rank as Rank };
}

/** Pairs of identical cards a player owns (for lighting up the Forge). */
export function mergeablePairs(cards: readonly Card[]): [Card, Card][] {
    const out: [Card, Card][] = [];
    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) if (canMerge(cards[i], cards[j])) out.push([cards[i], cards[j]]);
    }
    return out;
}
