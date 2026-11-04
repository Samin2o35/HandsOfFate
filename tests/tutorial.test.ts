// Hands of Fate — tests/tutorial.test.ts
// The tutorial run (seed 51, see app/Game.ts TUTORIAL_SEED) must teach what it says.
import { describe, it, expect } from 'vitest';
import { Run } from '../assets/scripts/core/run';
import { mergeablePairs } from '../assets/scripts/core/forge';
import { cardLabel } from '../assets/scripts/core/cards';

const TUTORIAL_SEED = 51;

describe('tutorial run', () => {
    it('step 2: the 10♣ finishes row 3 into the 35-point opening', () => {
        const run = Run.newRun({ seed: TUTORIAL_SEED, tutorial: true });
        expect(run.board().rows[2].full).toBe(false);
        const ten = run.stash.find((c) => c.rank === 10 && c.suit === 'C')!;
        run.moveCard(ten.id, { row: 2, col: 2 });
        expect(run.board().handPoints).toBe(35);
        expect(run.opponent.name).toBe("Jack of Spades' table");
    });

    it('step 4: a heal fires early, and round 1 is won', () => {
        const run = Run.newRun({ seed: TUTORIAL_SEED, tutorial: true });
        run.moveCard(run.stash.find((c) => c.rank === 10)!.id, { row: 2, col: 2 });
        const fight = run.startFight();
        const events = fight.runToEnd();
        const firstHeal = events.find((e) => e.side === 'player' && e.effect === 'heal');
        expect(firstHeal && firstHeal.time).toBeLessThan(10);
        expect(fight.winner).toBe('player');
    });

    it('step 6: round 2 still has the two 3♦ for the Forge', () => {
        const run = Run.newRun({ seed: TUTORIAL_SEED, tutorial: true });
        run.moveCard(run.stash.find((c) => c.rank === 10)!.id, { row: 2, col: 2 });
        const fight = run.startFight();
        fight.runToEnd();
        run.finishFight(fight);
        run.takeCard(run.takeableCards()[0].id);
        run.chooseReward({ kind: 'health' });
        expect(run.round).toBe(2);
        expect(mergeablePairs(run.ownedCards()).map(([a]) => cardLabel(a))).toContain('3♦');
    });
});
