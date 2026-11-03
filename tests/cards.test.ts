// Hands of Fate — tests/cards.test.ts
// Runs in Node with Vitest: `npm test` from the project root.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    SUITS, RANKS, makeCard, resetCardIds, cardLabel, rankLabel,
    updatedArtPath, classicArtPath, animStripPath, CARD_BACK_PATH, DEALER_ANIM_PATH,
} from '../assets/scripts/core/cards';

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

    it('has Updated and Classic art for all 52 cards', () => {
        for (const suit of SUITS) for (const rank of RANKS) {
            expect(existsSync(png(updatedArtPath({ suit, rank }))), updatedArtPath({ suit, rank })).toBe(true);
            expect(existsSync(png(classicArtPath({ suit, rank }))), classicArtPath({ suit, rank })).toBe(true);
        }
    });

    it('has animated strips for every face card and Ace, plus the Dealer', () => {
        for (const suit of SUITS) for (const rank of [11, 12, 13, 14] as const) {
            const p = animStripPath({ suit, rank });
            expect(p).not.toBeNull();
            expect(existsSync(png(p!)), p!).toBe(true);
        }
        expect(animStripPath({ suit: 'S', rank: 7 })).toBeNull();
        expect(existsSync(png(CARD_BACK_PATH))).toBe(true);
        expect(existsSync(png(DEALER_ANIM_PATH))).toBe(true);
    });
});
