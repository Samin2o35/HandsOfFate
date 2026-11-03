// Hands of Fate — tests/run.test.ts
// Stage 4: scoring, Forge, starting decks, opponents, bosses, Aces, the run
// state machine, saving, and whole runs played by the bot.
import { describe, it, expect, beforeEach } from 'vitest';
import { resetCardIds, parseCard, cardLabel } from '../assets/scripts/core/cards';
import { cardsOnGrid, gridFromText } from '../assets/scripts/core/grid';
import { evaluateBoard } from '../assets/scripts/core/evaluate';
import { healthFromText, healthToText, createHealthGrid } from '../assets/scripts/core/health';
import { Fight } from '../assets/scripts/core/fight';
import { Rng } from '../assets/scripts/core/rng';
import { scoreRound, parTime } from '../assets/scripts/core/scoring';
import { forgeUpgrades, forgeResult, canMerge } from '../assets/scripts/core/forge';
import { randomStartingDeck, deckProblems, STARTING_HAND_POINTS, DeckParts } from '../assets/scripts/core/decks';
import {
    generateOpponent, gridSizeFor, healthFor, cooldownMultiplierFor, budgetFor, isBossRound,
} from '../assets/scripts/core/opponents';
import {
    newBossCycle, nextBoss, bossModifiers, bossHealth, bossSetupExtras, twistChange, twistText,
} from '../assets/scripts/core/bosses';
import { newProfile, updateProfile, closestAce } from '../assets/scripts/core/achievements';
import { Run } from '../assets/scripts/core/run';
import { botRound, botRun, botPlanning } from '../tools/bot';

beforeEach(() => resetCardIds());

const hand = (row: string) => evaluateBoard(gridFromText(row)).rows[0].hand!;

describe('scoring', () => {
    it('matches the round won mockup: round 7 = 1,440', () => {
        const s = scoreRound({
            round: 7, boss: false, handsFired: 27, handPoints: 415,
            cellsLeft: 15, cellsTotal: 20, flawless: false, time: 25,
        });
        expect([s.handBonus, s.healthBonus, s.flawlessBonus, s.timeBonus]).toEqual([415, 150, 0, 35]);
        expect(s.par).toBe(32);
        expect(s.subtotal).toBe(600);
        expect(s.multiplier).toBeCloseTo(2.4);
        expect(s.total).toBe(1440);
    });

    it('par time: 25 + round, capped at 60, bosses +15', () => {
        expect(parTime(7, false)).toBe(32);
        expect(parTime(40, false)).toBe(60);
        expect(parTime(35, true)).toBe(75);
    });

    it('flawless adds 100, and no time bonus over par', () => {
        const s = scoreRound({ round: 1, boss: false, handsFired: 3, handPoints: 15, cellsLeft: 12, cellsTotal: 12, flawless: true, time: 40 });
        expect(s.flawlessBonus).toBe(100);
        expect(s.timeBonus).toBe(0);
    });
});

describe('forge', () => {
    it('offers suit changes and ranks within 2..A', () => {
        expect(forgeUpgrades(parseCard('AS')).some((u) => u.kind === 'rank' && u.delta === 1)).toBe(false);
        expect(forgeUpgrades(parseCard('2S')).some((u) => u.kind === 'rank' && u.delta === -1)).toBe(false);
        expect(forgeUpgrades(parseCard('7S'))).toHaveLength(5);
        expect(cardLabel(forgeResult(parseCard('3D'), { kind: 'rank', delta: 1 }))).toBe('4♦');
        expect(canMerge(parseCard('3D'), parseCard('3H'))).toBe(false);
    });

    it('tutorial round: the two 3♦ merge once per round', () => {
        const run = Run.newRun({ seed: 1, tutorial: true });
        const threes = run.ownedCards().filter((c) => c.rank === 3);
        const made = run.forge(threes[0].id, threes[1].id, { kind: 'suit', suit: 'S' });
        expect(cardLabel(made)).toBe('3♠');
        expect(run.ownedCards()).toHaveLength(9);
        expect(() => run.forge(threes[0].id, threes[1].id, { kind: 'rank', delta: 1 })).toThrow();
    });
});

describe('starting decks', () => {
    it('1,000 random decks all follow the template and open at 35', () => {
        const rng = new Rng(7);
        let tries = 0;
        for (let i = 0; i < 1000; i++) {
            const d = randomStartingDeck(rng);
            tries += d.tries;
            expect(deckProblems(d.parts)).toEqual([]);
            expect(evaluateBoard(d.grid).handPoints).toBe(STARTING_HAND_POINTS);
            expect(d.stash).toHaveLength(1);
        }
        expect(tries / 1000).toBeLessThan(5); // GDD: "a few tries at most"
    });

    it('flags rule breaks', () => {
        const c = parseCard;
        const parts: DeckParts = {
            pairs: [[c('5H'), c('5S')], [c('3D'), c('3D')], [c('8C'), c('8S')]],
            run: [c('JS'), c('9H'), c('10C')],
            spare: c('QH'),
        };
        // The GDD's own tutorial deck: its spare Q♥ extends 9-10-J to 4. Fine for
        // the fixed tutorial, but random decks would re-roll it.
        expect(deckProblems(parts)).toEqual(['spare extends the run to 4']);
        expect(deckProblems({ ...parts, spare: c('5D') })).toContain('can make three of a kind');
    });
});

describe('opponents', () => {
    it('scaling numbers follow the GDD table', () => {
        expect([1, 7, 20, 40].map(budgetFor)).toEqual([13, 61, 165, 325]);
        expect([1, 7, 20, 40].map(healthFor)).toEqual([12, 24, 50, 60]);
        expect([1, 7, 20, 40].map((r) => `${gridSizeFor(r).cols}×${gridSizeFor(r).rows}`)).toEqual(['3×3', '3×4', '4×5', '5×5']);
        expect([1, 29, 30, 40, 55].map(cooldownMultiplierFor)).toEqual([1, 1, 0.95, 0.9, 0.85]);
        expect([4, 5, 10, 11].map(isBossRound)).toEqual([false, true, true, false]);
    });

    it('tables land near the budget, always with an attack hand', () => {
        const rng = new Rng(3);
        for (const round of [1, 2, 3, 4, 6, 7, 9, 12, 18, 24, 31, 40, 55]) {
            for (let k = 0; k < 4; k++) {
                const o = generateOpponent(round, rng);
                const result = evaluateBoard(o.grid);
                expect(Math.abs(result.handPoints - o.budget), `round ${round}`).toBeLessThanOrEqual(Math.max(8, o.budget * 0.15));
                expect(result.hands.some((h) => h.effect === 'attack')).toBe(true);
                const cards = cardsOnGrid(o.grid);
                const inSuit = cards.filter((c) => c.suit === o.avatar.suit).length;
                expect(Math.abs(inSuit - cards.length / 2)).toBeLessThanOrEqual(2);
            }
        }
    });

    it('names the table after its face card; bosses are Kings with more health', () => {
        const rng = new Rng(4);
        expect(generateOpponent(1, rng).name).toMatch(/^(Jack|Queen|King) of (Spades|Hearts|Clubs|Diamonds)' table$/);
        const boss = generateOpponent(5, rng, { boss: { suit: 'C', tier: 1 } });
        expect(boss.name).toBe('King of Clubs');
        expect(boss.avatar).toEqual({ suit: 'C', rank: 13 });
        expect(boss.healthCells).toBe(healthFor(5) + 10);
    });
});

describe('bosses', () => {
    it('meets all four Kings before any repeats, one tier up each meeting', () => {
        const cycle = newBossCycle();
        const rng = new Rng(9);
        const first = [0, 1, 2, 3].map(() => nextBoss(cycle, rng));
        expect(new Set(first.map((b) => b.suit)).size).toBe(4);
        expect(first.every((b) => b.tier === 1)).toBe(true);
        const second = [0, 1, 2, 3].map(() => nextBoss(cycle, rng));
        expect(second.every((b) => b.tier === 2)).toBe(true);
    });

    it('♠ Execution: every 8 s a blade hits your fullest row; shields block it', () => {
        const f = new Fight(
            { hands: [], health: healthFromText('OOOO/OOOO/SOOO') },
            { hands: [], healthCells: 12 },
            { modifiers: bossModifiers('S', 1) },
        );
        const e = f.advance(8.01);
        expect(e).toHaveLength(1);
        expect(e[0].label).toBe('Execution');
        expect(healthToText(f.player.health)).toBe('xxOO/OOOO/SOOO'); // tier 1: 2 cells
    });

    it('♥ Second Wind: heals once when he drops below half, never rotted cells', () => {
        const f = new Fight(
            { hands: [hand('7S 7S 2D')], healthCells: 12 },
            { hands: [], health: createHealthGrid(8) },
            { modifiers: bossModifiers('H', 1) },
        );
        const events = f.runToEnd();
        const wind = events.filter((e) => e.label === 'Second Wind');
        expect(wind).toHaveLength(1);
        expect(wind[0].cells).toHaveLength(4); // tier 1: 2 + 2
        expect(f.winner).toBe('player');
    });

    it('♣ Blight: rot spreads to a neighbour every 12 − tier s; shields stop it', () => {
        const f = new Fight(
            { hands: [], health: healthFromText('#OOO/SOOO') },
            { hands: [], healthCells: 12 },
            { modifiers: bossModifiers('C', 2) },
        );
        expect(f.advance(9.99)).toHaveLength(0);
        f.advance(0.02);
        expect(healthToText(f.player.health)).toBe('##OO/SOOO'); // the shielded cell below can't rot
    });

    it('♦ Fortress: starts shielded with extra armor charges', () => {
        expect(healthToText(bossHealth('D', 2, 12))).toBe('SSSS/SSOO/OOOO'); // 2 + 2×2
        expect(bossSetupExtras('D', 3)).toEqual({ extraCharges: { armor: 3 } });
    });

    it('intro text matches the boss mockup (Blight, second meeting)', () => {
        expect(twistText('C', 2)).toBe('Rotted cells on your grid spread to a neighbour every 10 s.');
        expect(twistChange('C', 2)).toBe('Spreads every 10 s (was 11 s).');
        expect(twistChange('C', 1)).toBeNull();
    });
});

describe('aces', () => {
    it('tracks bests across runs and earns each Ace once', () => {
        const p = newProfile();
        expect(updateProfile(p, { round: 14, score: 12480, bestFlawlessStreak: 3, oneSuitRound: 11 })).toEqual([]);
        expect(closestAce(p)!.ace.id).toBe('oneSuit'); // 11/30 is the closest
        expect(updateProfile(p, { round: 50, score: 5000, bestFlawlessStreak: 1, oneSuitRound: 0 })).toEqual(['endless']);
        expect(p.aces.endless.earned).toBe(true);
        expect(p.bestScore).toBe(12480);
        expect(updateProfile(p, { round: 60, score: 0, bestFlawlessStreak: 0, oneSuitRound: 0 })).toEqual([]);
    });
});

describe('run', () => {
    it('the same seed deals the same run', () => {
        const a = Run.newRun({ seed: 42 });
        const b = Run.newRun({ seed: 42 });
        expect(a.toJSON()).toBe(b.toJSON());
        expect(Run.newRun({ seed: 43 }).toJSON()).not.toBe(a.toJSON());
    });

    it('tutorial run starts with the 10♣ in the stash', () => {
        const run = Run.newRun({ seed: 1, tutorial: true });
        expect(run.stash.map(cardLabel)).toEqual(['10♣', 'Q♥']);
        run.moveCard(run.stash[0].id, { row: 2, col: 2 });
        expect(run.board().handPoints).toBe(35);
    });

    it('moving onto a full slot swaps, and the stash takes cards back', () => {
        const run = Run.newRun({ seed: 1, tutorial: true });
        const tl = run.grid.slots[0]!;
        const br = run.grid.slots[7]!;
        run.moveCard(tl.id, { row: 2, col: 1 });
        expect(run.grid.slots[7]!.id).toBe(tl.id);
        expect(run.grid.slots[0]!.id).toBe(br.id);
        run.moveCard(tl.id, 'stash');
        expect(run.stash.some((c) => c.id === tl.id)).toBe(true);
    });

    it('a full round: planning → fight → reward → round 2', () => {
        const run = Run.newRun({ seed: 1, tutorial: true });
        run.moveCard(run.stash[0].id, { row: 2, col: 2 });
        expect(() => run.chooseReward({ kind: 'health' })).toThrow(); // not in reward phase
        const fight = run.startFight();
        fight.runToEnd();
        const result = run.finishFight(fight);
        expect(result.won).toBe(true);
        expect(result.score.total).toBeGreaterThan(0);
        expect(run.phase).toBe('reward');
        expect(() => run.chooseReward({ kind: 'health' })).toThrow(); // must take a card first
        run.takeCard(run.takeableCards()[0].id);
        run.chooseReward({ kind: 'cards' });
        expect(run.round).toBe(2);
        expect(run.phase).toBe('planning');
        expect(run.stash).toHaveLength(1 + 1 + 3); // Q♥, their card, 3 new cards
    });

    it('every 5th round is a boss', () => {
        const run = Run.newRun({ seed: 5 });
        while (run.round < 5 && run.phase !== 'over') botRound(run);
        if (run.phase !== 'over') expect(run.opponent.boss?.tier).toBe(1);
    });

    it('save and load mid-run: the loaded copy plays out exactly the same', () => {
        const run = Run.newRun({ seed: 11 });
        botRound(run);
        botRound(run);
        const saved = run.toJSON();
        const copy = Run.fromJSON(saved);
        for (let i = 0; i < 6 && run.phase !== 'over'; i++) { botRound(run); botRound(copy); }
        expect(copy.toJSON()).toBe(run.toJSON());
    });

    it('a save made mid-fight restarts that round from planning', () => {
        const run = Run.newRun({ seed: 2 });
        botPlanning(run);
        run.startFight();
        expect(Run.fromJSON(run.toJSON()).phase).toBe('planning');
    });
});

describe('whole runs (bot)', () => {
    it('3 bot runs all end, with scores that only go up (more: npm run sim)', () => {
        const reached: number[] = [];
        for (let seed = 1; seed <= 3; seed++) {
            const r = botRun(seed);
            expect(r.results[r.results.length - 1].won).toBe(false);
            let last = 0;
            for (const res of r.results) {
                expect(res.runScore).toBeGreaterThanOrEqual(last);
                last = res.runScore;
            }
            reached.push(r.roundReached);
        }
        console.log(`Bot runs reached rounds: ${reached.join(', ')}`);
    }, 60_000);
});
