// Hands of Fate — tests/cards.test.ts
// Runs in Node with Vitest: `npm test` from the project root.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    SUITS, RANKS, makeCard, resetCardIds, cardLabel, rankLabel,
    updatedArtPath, classicArtPath, animStripPath, CARD_BACK_PATH, DEALER_CARD_PATH, DEALER_ANIM_PATH,
} from '../assets/scripts/core/cards';
import { CARD_RECTS } from '../assets/scripts/ui/cardAtlas';

const RES = join(__dirname, '..', 'assets', 'resources');
const png = (path: string) => join(RES, `${path}.png`);

describe('cards', () => {
    it('labels ranks and cards', () => {
        expect(rankLabel(10)).toBe('10');
        expect(rankLabel(14)).toBe('A');
        expect(cardLabel({ suit: 'C', rank: 10 })).toBe('10♣');
        expect(cardLabel({ suit: 'S', rank: 11 })).toBe('J♠');
    });

    it('gives every card a fresh id', () => {
        resetCardIds();
        const a = makeCard('D', 3);
        const b = makeCard('D', 3);
        expect(a.id).not.toBe(b.id);
    });

    // The game draws cards from the 1x atlas and the 1x strips only (decisions 144 and 169):
    // the 4x originals sit in art-source/, outside assets.
    it('has an atlas slot for every card of both decks, the back and the Joker', () => {
        expect(existsSync(png('atlas/cards'))).toBe(true);
        for (const suit of SUITS) for (const rank of RANKS) {
            expect(CARD_RECTS[updatedArtPath({ suit, rank })], updatedArtPath({ suit, rank })).toBeDefined();
            expect(CARD_RECTS[classicArtPath({ suit, rank })], classicArtPath({ suit, rank })).toBeDefined();
        }
        expect(CARD_RECTS[CARD_BACK_PATH]).toBeDefined();
        expect(CARD_RECTS[DEALER_CARD_PATH]).toBeDefined();
    });

    it('has a 1x strip for every face card and Ace, plus the Dealer', () => {
        const strip1x = (p: string) => png(p.replace(/^anim\//, 'anim1x/'));
        for (const suit of SUITS) for (const rank of [11, 12, 13, 14] as const) {
            const p = animStripPath({ suit, rank });
            expect(p).not.toBeNull();
            expect(existsSync(strip1x(p!)), p!).toBe(true);
        }
        expect(animStripPath({ suit: 'S', rank: 7 })).toBeNull();
        expect(existsSync(strip1x(DEALER_ANIM_PATH))).toBe(true);
    });
});
