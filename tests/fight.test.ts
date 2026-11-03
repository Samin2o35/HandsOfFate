// Hands of Fate — tests/fight.test.ts
// Health grid, hit patterns, targeting, charges, timing, and the anti-stall rule.
import { describe, it, expect, beforeEach } from 'vitest';
import { resetCardIds, makeCard, SUITS, RANKS } from '../assets/scripts/core/cards';
import { createGrid, setCard, gridFromText } from '../assets/scripts/core/grid';
import { evaluateBoard, Hand } from '../assets/scripts/core/evaluate';
import {
    createHealthGrid, healthCols, healthFromText, healthToText, livingCount,
} from '../assets/scripts/core/health';
import { pickTargets, applyEffect } from '../assets/scripts/core/patterns';
import { Fight } from '../assets/scripts/core/fight';
import { Rng } from '../assets/scripts/core/rng';
import { tutorialSetup } from '../assets/scripts/core/decks';

beforeEach(() => resetCardIds());

const hands = (board: string): Hand[] => [...evaluateBoard(gridFromText(board)).hands];
/** The single row hand of a one-row board, e.g. hand('7S 7H 2D'). */
const hand = (board: string): Hand => evaluateBoard(gridFromText(board)).rows[0].hand!;

describe('health grid', () => {
    it('lays cells out about 4:3, like the mockups', () => {
        expect([12, 20, 24, 30, 60].map(healthCols)).toEqual([4, 5, 6, 6, 9]);
        const g = createHealthGrid(14);
        expect([g.cols, g.rows]).toEqual([4, 4]);
        expect(healthToText(g)).toBe('OOOO/OOOO/OOOO/OO');
    });

    it('reads and writes the text picture', () => {
        expect(healthToText(healthFromText('OSx#/OOOO'))).toBe('OSx#/OOOO');
    });
});

describe('effects and patterns', () => {
    it('attack destroys living cells; a shield absorbs one hit', () => {
        const g = healthFromText('SOO');
        applyEffect(g, 'attack', [0, 1]);
        expect(healthToText(g)).toBe('OxO');
        applyEffect(g, 'attack', [0]);
        expect(healthToText(g)).toBe('xxO');
    });

    it('heal restores lost cells but never rotted ones', () => {
        const g = healthFromText('x#O');
        applyEffect(g, 'heal', [0, 1]);
        expect(healthToText(g)).toBe('O#O');
    });

    it('targeting: a pair (2 cells) picks the two best cells, not dead ones', () => {
        const g = healthFromText('xxOO/xxOO');
        expect(pickTargets(g, 'twoCells', 'attack').cells).toEqual([2, 3]);
    });

    it('attackers do not see shields: they hit the front, where armor goes first', () => {
        const g = healthFromText('OOOO/OOOO');
        const armor = pickTargets(g, 'twoCells', 'armor').cells;
        applyEffect(g, 'armor', armor);
        expect(pickTargets(g, 'twoCells', 'attack').cells).toEqual(armor);
    });

    it('straight sweeps the row with the most living cells', () => {
        const g = healthFromText('xxOO/OOOx/OOOO');
        expect(pickTargets(g, 'sweepRow', 'attack').cells).toEqual([8, 9, 10, 11]);
    });

    it('rot hits one cell fewer: trips (line of 3) rots 2, as in the fight mockup', () => {
        const g = createHealthGrid(24);
        const { cells } = pickTargets(g, 'line3', 'rot');
        expect(cells).toHaveLength(2);
        applyEffect(g, 'rot', cells);
        expect(healthToText(g).split('#').length - 1).toBe(2);
    });

    it('rot on a single-cell pattern still hits 1', () => {
        expect(pickTargets(createHealthGrid(12), 'cell', 'rot').cells).toHaveLength(1);
    });

    it('heal lands where the most cells were lost', () => {
        const g = healthFromText('OOOO/OOxx/OOxx');
        expect(pickTargets(g, 'square2x2', 'heal').cells).toEqual([6, 7, 10, 11]);
    });

    it('every pattern fits on a small grid without errors', () => {
        for (const p of ['cell', 'twoCells', 'twoDominoes', 'line3', 'sweepRow', 'square2x2', 'rect2x3', 'plus', 'cross'] as const) {
            expect(pickTargets(createHealthGrid(3), p, 'attack').cells.length).toBeGreaterThan(0);
        }
    });
});

describe('fight timing and charges', () => {
    it('GDD worst case: a pair of spades kills a 24-cell grid in 48 s', () => {
        const f = new Fight({ hands: [hand('7S 7S 2H')] , healthCells: 12 }, { hands: [], healthCells: 24 });
        f.runToEnd();
        expect(f.winner).toBe('player');
        expect(f.time).toBeCloseTo(48, 5);
        expect(f.player.stats.handsFired).toBe(12);
        expect(f.player.stats.handPointsFired).toBe(60);
    });

    it('a hand first fires after one full cooldown, then every cooldown', () => {
        const f = new Fight({ hands: [hand('7S 7S 2H')], healthCells: 12 }, { hands: [], healthCells: 24 });
        expect(f.advance(3.99)).toHaveLength(0);
        const e = f.advance(0.02);
        expect(e).toHaveLength(1);
        expect(e[0].time).toBeCloseTo(4);
        expect(f.advance(4)).toHaveLength(1);
    });

    it('small steps and one big run give the same fight', () => {
        const setup = () => (resetCardIds(), new Fight(
            { hands: hands('5H 5S JS / 3D 3D 9H / 8C 8S 10C'), healthCells: 12 },
            { hands: hands('7S 7H KD / 2C 2C 9S / QH QD 4S'), healthCells: 14 },
        ));
        const a = setup(); const evA = a.runToEnd();
        const b = setup(); const evB = [];
        while (!b.over) evB.push(...b.advance(1 / 60));
        expect(evB.map((e) => `${e.side}:${e.handId}:${e.cells}`)).toEqual(evA.map((e) => `${e.side}:${e.handId}:${e.cells}`));
        expect(b.winner).toBe(a.winner);
    });

    it('heal waits until something is lost, and stops after 3 charges', () => {
        const f = new Fight(
            { hands: [hand('2H 2H 9D')], healthCells: 20 },
            { hands: [hand('7S 7S 2D')], healthCells: 60 },
        );
        const events = f.runToEnd();
        const heals = events.filter((e) => e.hand.effect === 'heal');
        expect(heals).toHaveLength(3);
        // The first heal can only happen after the first enemy hit at 4 s.
        expect(heals[0].time).toBeCloseTo(4);
        expect(heals.map((e) => e.chargesLeft)).toEqual([2, 1, 0]);
        expect(f.winner).toBe('enemy');
    });

    it('armor shields its own side, and shields soak hits', () => {
        const f = new Fight(
            { hands: [hand('3D 3D 9C')], healthCells: 12 },
            { hands: [hand('7S 7S 2D')], healthCells: 12 },
        );
        const ev = f.advance(4.01);
        expect(ev.map((e) => [e.side, e.hand.effect])).toEqual([['player', 'armor'], ['enemy', 'attack']]);
        expect(healthToText(f.player.health)).toBe('OOOO/OOOO/OOOO'); // the hit only popped the shields
    });

    it('flush doubles the effect for one charge (mockup: Flush ♥ healed 8)', () => {
        const flush = hand('2H 5H 9H QH');
        const f = new Fight({ hands: [flush], health: healthFromText('xxxxx/xxxxx/OOOOO/OOOOO') }, { hands: [], healthCells: 1 });
        const [e] = f.advance(3.01);
        expect(e.cells).toHaveLength(8);
        expect(e.chargesLeft).toBe(2);
    });

    it('on the same instant the player goes first', () => {
        const f = new Fight({ hands: [hand('7S 7S 2D')], healthCells: 2 }, { hands: [hand('7S 7S 2D')], healthCells: 2 });
        f.runToEnd();
        expect(f.winner).toBe('player');
        expect(f.time).toBeCloseTo(4);
    });

    it('a faster side (cooldown multiplier) fires sooner', () => {
        const f = new Fight({ hands: [], healthCells: 12 }, { hands: [hand('7S 7S 2D')], healthCells: 12, cooldownMultiplier: 0.9 });
        expect(f.advance(3.61)).toHaveLength(1);
    });

    it('tutorial opening beats a weak opponent', () => {
        const f = new Fight({ hands: [...evaluateBoard(tutorialSetup().grid).hands], healthCells: 12 },
            { hands: hands('2S 2C 7H / 9D 4S KC / 5H JD 3C'), healthCells: 12 });
        f.runToEnd();
        expect(f.winner).toBe('player');
        expect(f.player.stats.bestHand).toBe('straight');
    });
});

// ---------------------------------------------------------------------------
// Anti-stall: anything that undoes damage has charges, anything that deals it
// doesn't, and every opponent has at least one attack hand. So every fight ends.

function randomBoard(rng: Rng, needsAttack: boolean): Hand[] {
    const rows = rng.int(3, 5), cols = rng.int(3, 5);
    const g = createGrid(rows, cols);
    for (let i = 0; i < rows * cols; i++) {
        if (rng.chance(0.75)) setCard(g, Math.floor(i / cols), i % cols, makeCard(rng.pick(SUITS), rng.pick(RANKS)));
    }
    if (needsAttack) setCard(g, 0, 0, makeCard('S', rng.pick(RANKS)));
    const hs = [...evaluateBoard(g).hands];
    if (needsAttack && !hs.some((h) => h.effect === 'attack')) {
        // The ♠ card scored in a non-attack hand; add a lone ♠ high card so the rule holds.
        return [...hs, ...evaluateBoard(gridFromText('2S')).hands];
    }
    return hs;
}

describe('anti-stall', () => {
    it('3,000 random fights all end, none by timeout', () => {
        const rng = new Rng(20261103);
        let longest = 0;
        for (let i = 0; i < 3000; i++) {
            const f = new Fight(
                { hands: randomBoard(rng, false), healthCells: rng.int(12, 40) },
                { hands: randomBoard(rng, true), healthCells: rng.int(12, 60) },
            );
            f.runToEnd();
            expect(f.endReason).toBe('killed');
            longest = Math.max(longest, f.time);
        }
        console.log(`Longest of 3,000 random fights: ${longest.toFixed(1)} game-seconds`);
        expect(longest).toBeLessThan(3600);
    });

    it('the slowest legal fight still ends: one ♠ high card vs a wall of heals and armor', () => {
        const f = new Fight(
            { hands: hands('2S'), healthCells: 12 },
            { hands: hands('2H 5H 9H QH KH / 3D 6D 8D JD AD'), healthCells: 60 },
        );
        f.runToEnd();
        expect(f.endReason).toBe('killed');
        expect(livingCount(f.player.health)).toBe(12);
        console.log(`Slowest legal fight: ${f.time.toFixed(1)} game-seconds`);
    });
});
