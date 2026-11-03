// Hands of Fate — tests/evaluate.test.ts
// Hand evaluation: every hand type, scoring cards, suits and the tie rule,
// overlaps, leftovers, and the two real boards from the GDD and mockups.
import { describe, it, expect, beforeEach } from 'vitest';
import { resetCardIds, cardLabel } from '../assets/scripts/core/cards';
import { gridFromText } from '../assets/scripts/core/grid';
import { evaluateBoard, handsWithCard, Hand, BoardResult } from '../assets/scripts/core/evaluate';
import { tutorialSetup } from '../assets/scripts/core/decks';

beforeEach(() => resetCardIds());

/** Evaluates a single-row grid and returns its row hand. */
function row(text: string): Hand | null {
    return evaluateBoard(gridFromText(text)).rows[0].hand;
}
const scoring = (h: Hand | null) => h!.cards.map((pc) => cardLabel(pc.card));

describe('hand types in one line', () => {
    it('pair, scoring only the two cards', () => {
        const h = row('7S 7H KD');
        expect(h?.category).toBe('pair');
        expect(scoring(h)).toEqual(['7♠', '7♥']);
        expect(h!.kickers.map((k) => cardLabel(k.card))).toEqual(['K♦']);
        expect(h!.label).toBe('Pair 7s');
    });

    it('two pair', () => {
        const h = row('AD AC 3D 3S');
        expect(h?.category).toBe('twoPair');
        expect(h!.cards).toHaveLength(4);
    });

    it('three of a kind', () => {
        const h = row('7S 7H 7S KS');
        expect(h?.category).toBe('trips');
        expect(scoring(h)).toEqual(['7♠', '7♥', '7♠']);
        expect(h!.label).toBe('Trips 7s');
    });

    it('3-card straight, also inside a 4-card line', () => {
        expect(row('9H 10C JS')?.category).toBe('straight');
        const h = row('4S 5D 6S JS');
        expect(h?.category).toBe('straight');
        expect(scoring(h)).toEqual(['4♠', '5♦', '6♠']);
        expect(h!.label).toBe('Straight 4-5-6');
    });

    it('Ace is high and low in straights, but never wraps', () => {
        expect(row('QS KH AD')!.label).toBe('Straight Q-K-A');
        expect(row('AS 2H 3D')!.label).toBe('Straight A-2-3');
        expect(row('KS AH 2D')).toBeNull();
    });

    it('longest run wins, then the higher one', () => {
        expect(row('3S 4H 5D 6C 9S')!.label).toBe('Straight 3-4-5-6');
        expect(row('2S 3H 4D 6C 7S')!.label).toBe('Straight 2-3-4');
    });

    it('a straight beats a pair in the same line', () => {
        const h = row('5S 5H 6D 7C');
        expect(h?.category).toBe('straight');
        expect(scoring(h)).toEqual(['5♠', '6♦', '7♣']); // first 5 in reading order plays
    });

    it('flush: the whole line in one suit, from 3 cards', () => {
        expect(row('2H 9H QH')?.category).toBe('flush');
        const h = row('2H 5H 9H QH');
        expect(h?.category).toBe('flush');
        expect(h!.cards).toHaveLength(4);
        expect(h!.multiplier).toBe(2);
        expect(h!.label).toBe('Flush ♥');
    });

    it('3 of a suit inside a longer line is not a flush (round 7 mockup)', () => {
        expect(row('2H 9H KS QH')).toBeNull();
        expect(row('7S 7H 7S KS')?.category).toBe('trips');
    });

    it('full house needs 5 cards', () => {
        const h = row('9S 9H 9D 4C 4S');
        expect(h?.category).toBe('fullHouse');
        expect(h!.cards).toHaveLength(5);
    });

    it('four of a kind (and five of a kind counts as four)', () => {
        expect(row('8S 8H 8D 8C')?.category).toBe('quads');
        expect(row('8S 8H 8D 8C 8S')?.category).toBe('quads');
    });

    it('straight flush, even inside a longer flush', () => {
        expect(row('5H 6H 7H')?.category).toBe('straightFlush');
        const h = row('5H 6H 7H KH');
        expect(h?.category).toBe('straightFlush');
        expect(scoring(h)).toEqual(['5♥', '6♥', '7♥']);
    });

    it('a line with nothing in it makes no hand', () => {
        expect(row('7S 2H 4S AD')).toBeNull();
    });

    it('uses the GDD numbers', () => {
        const h = row('9S 9H 9D 4C 4S')!;
        expect([h.cooldown, h.points, h.pattern]).toEqual([2.5, 35, 'rect2x3']);
    });
});

describe('suit and effect', () => {
    it('majority suit decides', () => {
        const h = row('7S 7H 7S KS')!;
        expect([h.suit, h.effect]).toEqual(['S', 'attack']);
        expect(row('AD AC 3D 3S')!.effect).toBe('armor');
    });

    it('no majority: the highest card decides (tutorial: J♠ makes the straight attack)', () => {
        const h = row('9H 10C JS')!;
        expect([h.suit, h.effect]).toEqual(['S', 'attack']);
    });

    it('highest cards tie: the one placed first in reading order decides', () => {
        expect(row('5H 5S JS')!.effect).toBe('heal');
        expect(row('5S 5H JS')!.effect).toBe('attack');
    });

    it('tie-break only looks at the tied suits', () => {
        // ♠ 2, ♥ 2, ♣ 1: the 7♣ is never the deciding card.
        const h = row('7C 7S 7H 3S 3H')!;
        expect(h.category).toBe('fullHouse');
        expect(h.suit).toBe('S');
    });

    it('each suit maps to its effect', () => {
        expect(row('2C 2C 9H')!.effect).toBe('rot');
        expect(row('2H 2H 9S')!.effect).toBe('heal');
    });
});

describe('the board', () => {
    it('only full lines are read', () => {
        const r = evaluateBoard(gridFromText('7S 7H - / 2C 3D 9H / KS 4H 8C'));
        expect(r.rows[0].full).toBe(false);
        expect(r.rows[0].hand).toBeNull();
    });

    it('cards in no hand fire as high cards, even outside full lines', () => {
        const r = evaluateBoard(gridFromText('7S 7H - / 2C 3D 9H / KS 4H 8C'));
        const leftovers = r.hands.filter((h) => h.source === 'leftover');
        expect(leftovers).toHaveLength(8);
        expect(leftovers.every((h) => h.category === 'high' && h.cooldown === 5)).toBe(true);
        expect(leftovers[0].label).toBe('High card 7♠');
    });

    it('a card can score in a row and a column at once', () => {
        const r = evaluateBoard(gridFromText('5H 5S JS / 5D 3D 9H / 8C 2S 10C'));
        const fiveH = r.rows[0].slots[0]!.card;
        const hands = handsWithCard(r, fiveH.id);
        expect(hands.map((h) => h.id)).toEqual(['row-0', 'col-0']);
    });
});

/** Compact summary for comparing to the GDD tables: "Pair 5s heal". */
function summary(r: BoardResult, kind: 'rows' | 'cols'): (string | null)[] {
    return r[kind].map((l) => (l.hand ? `${l.hand.label} ${l.hand.effect}` : null));
}

describe('real boards', () => {
    it('tutorial deck: one hand of every suit, 35 hand points', () => {
        const { grid, stash } = tutorialSetup();
        const r = evaluateBoard(grid);
        expect(summary(r, 'rows')).toEqual(['Pair 5s heal', 'Pair 3s armor', 'Pair 8s rot']);
        expect(summary(r, 'cols')).toEqual([null, null, 'Straight 9-10-J attack']);
        expect(r.hands.filter((h) => h.source === 'leftover')).toHaveLength(0);
        expect(r.handPoints).toBe(35);
        expect(stash.map(cardLabel)).toEqual(['Q♥']);
    });

    it('tutorial step 2: row 3 is not full yet', () => {
        const r = evaluateBoard(tutorialSetup(true).grid);
        expect(r.rows[2].full).toBe(false);
        expect(r.rows[2].hand).toBeNull();
    });

    it('round 7 planning mockup', () => {
        const r = evaluateBoard(gridFromText(
            '7S 7H 7S KS / 2H 5H 9H QH / 4S 5D 6S JS / AD AC 3D 3S',
        ));
        expect(summary(r, 'rows')).toEqual([
            'Trips 7s attack', 'Flush ♥ heal', 'Straight 4-5-6 attack', 'Two pair armor',
        ]);
        expect(summary(r, 'cols')).toEqual([null, 'Pair 5s heal', null, 'Straight J-Q-K attack']);
        // Mockup info box: the 5♥ is in 2 hands, the flush (row 2) and the pair (column 2).
        const fiveH = r.rows[1].slots[1]!.card;
        expect(handsWithCard(r, fiveH.id).map((h) => h.label)).toEqual(['Flush ♥', 'Pair 5s']);
    });
});
