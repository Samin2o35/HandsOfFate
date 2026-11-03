// Hands of Fate — tests/grid.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resetCardIds, cardLabel, parseCard } from '../assets/scripts/core/cards';
import {
    createGrid, gridFromText, cardAt, setCard, findCard, addRow, addColumn,
    canAddColumn, MAX_GRID_SIDE,
} from '../assets/scripts/core/grid';

beforeEach(() => resetCardIds());

describe('parseCard', () => {
    it('reads letters and symbols', () => {
        expect(cardLabel(parseCard('10c'))).toBe('10♣');
        expect(cardLabel(parseCard('J♠'))).toBe('J♠');
        expect(parseCard('AH').rank).toBe(14);
        expect(() => parseCard('1S')).toThrow();
        expect(() => parseCard('5X')).toThrow();
    });
});

describe('grid', () => {
    it('builds from text with empty slots', () => {
        const g = gridFromText('5H 5S JS / 3D - 9H');
        expect([g.rows, g.cols]).toEqual([2, 3]);
        expect(cardAt(g, 1, 1)).toBeNull();
        expect(cardLabel(cardAt(g, 0, 2)!)).toBe('J♠');
    });

    it('sets and finds cards', () => {
        const g = createGrid(3, 3);
        const c = parseCard('QH');
        expect(setCard(g, 2, 1, c)).toBeNull();
        expect(findCard(g, c.id)).toEqual({ row: 2, col: 1 });
        expect(setCard(g, 2, 1, null)).toBe(c);
    });

    it('grows by a row or a column and keeps every card in place', () => {
        const g = gridFromText('2S 3S / 4S 5S');
        addColumn(g);
        addRow(g);
        expect([g.rows, g.cols]).toEqual([3, 3]);
        expect(cardLabel(cardAt(g, 1, 1)!)).toBe('5♠');
        expect(cardAt(g, 0, 2)).toBeNull();
        expect(cardAt(g, 2, 0)).toBeNull();
    });

    it(`stops at ${MAX_GRID_SIDE} wide`, () => {
        const g = createGrid(3, MAX_GRID_SIDE);
        expect(canAddColumn(g)).toBe(false);
        expect(() => addColumn(g)).toThrow();
        expect(() => cardAt(g, 3, 0)).toThrow();
    });
});
