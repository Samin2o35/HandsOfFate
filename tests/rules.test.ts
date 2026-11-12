// Hands of Fate — tests/rules.test.ts
// The phase 7 rule knobs: the defaults are today's rules, and each variant does what it says.

import { describe, it, expect, afterEach } from 'vitest';
import { RULES, DEFAULT_RULES, VARIANTS, useRules } from '../assets/scripts/core/rules';
import { gridFromText } from '../assets/scripts/core/grid';
import { evaluateBoard } from '../assets/scripts/core/evaluate';
import { randomStartingDeck, deckProblems } from '../assets/scripts/core/decks';
import { generateOpponent } from '../assets/scripts/core/opponents';
import { Rng } from '../assets/scripts/core/rng';

afterEach(() => useRules('current'));

describe('rule knobs', () => {
    it('start as the current rules', () => {
        expect(RULES).toEqual(DEFAULT_RULES);
        expect(DEFAULT_RULES.minFlush).toBe(3);
    });

    it('flush4: three of a suit across a 3-wide row is no longer a flush', () => {
        const g = gridFromText('2H 7H JH / 3S 4D 9C / 5C 8S QD');
        expect(evaluateBoard(g).rows[0].hand?.category).toBe('flush');
        useRules('flush4');
        expect(evaluateBoard(g).rows[0].hand).toBeNull();
    });

    it('flush4: a 3-card straight flush becomes a straight; 4 cards still make one', () => {
        const three = gridFromText('5S 6S 7S / 2H 9D QC / 3C JH KD');
        const four = gridFromText('5S 6S 7S 8S / 2H 9D QC 4D / 3C JH KD 2C / 10H 9C 3D 4C');
        useRules('flush4');
        expect(evaluateBoard(three).rows[0].hand?.category).toBe('straight');
        expect(evaluateBoard(four).rows[0].hand?.category).toBe('straightFlush');
    });

    it('flush4: strict decks still deal, and every deal passes the stricter rules', () => {
        useRules('flush4');
        const rng = new Rng(5);
        for (let i = 0; i < 200; i++) expect(deckProblems(randomStartingDeck(rng).parts)).toEqual([]);
    });

    it('softer Kings get a smaller budget and fewer cells', () => {
        const normal = generateOpponent(5, new Rng(3), { boss: { suit: 'S', tier: 1 } });
        useRules('softKings');
        const soft = generateOpponent(5, new Rng(3), { boss: { suit: 'S', tier: 1 } });
        expect(soft.healthCells).toBe(normal.healthCells - 4);
        expect(soft.budget).toBeLessThan(normal.budget);
    });

    it('every variant names only real knobs', () => {
        for (const v of Object.values(VARIANTS)) for (const k of Object.keys(v)) expect(k in DEFAULT_RULES).toBe(true);
    });
    it('high cards use the highCardCooldown knob (default 5.0 s, decision 157)', async () => {
        const { evaluateBoard } = await import('../assets/scripts/core/evaluate');
        const { Run } = await import('../assets/scripts/core/run');
        const run = Run.newRun({ seed: 51, tutorial: true } as any);
        const highs = () => evaluateBoard(run.grid).hands.filter((h) => h.category === 'high');
        expect(highs().length).toBeGreaterThan(0);
        expect(highs().every((h) => h.cooldown === 5.0)).toBe(true);
        useRules('highCard35');
        expect(highs().every((h) => h.cooldown === 3.5)).toBe(true);
        useRules('current');
        expect(RULES.highCardCooldown).toBe(5.0);
    });
});
