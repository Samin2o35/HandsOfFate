// Hands of Fate — tests/replay.test.ts
// The fight screen redraws grids by replaying each event's cells with
// applyEffect on its own copy. This checks the copy always ends up identical
// to the real fight, including flushes hitting shielded cells twice and boss twists.
import { describe, it, expect } from 'vitest';
import { Run } from '../assets/scripts/core/run';
import { cloneHealthGrid, healthToText } from '../assets/scripts/core/health';
import { applyEffect } from '../assets/scripts/core/patterns';
import { botPlanning, botReward } from '../tools/bot';

describe('event replay matches the fight', () => {
    it('for every fight of 4 bot runs (bosses included)', () => {
        let fights = 0;
        for (let seed = 1; seed <= 4; seed++) {
            const run = Run.newRun({ seed });
            while (run.phase !== 'over' && run.round <= 25) {
                botPlanning(run);
                const fight = run.startFight();
                const view = { player: cloneHealthGrid(fight.player.health), enemy: cloneHealthGrid(fight.enemy.health) };
                while (!fight.over) {
                    for (const e of fight.advance(1 / 30)) applyEffect(view[e.target], e.effect, e.cells);
                }
                expect(healthToText(view.player)).toBe(healthToText(fight.player.health));
                expect(healthToText(view.enemy)).toBe(healthToText(fight.enemy.health));
                fights++;
                if (run.finishFight(fight).won) botReward(run);
            }
        }
        expect(fights).toBeGreaterThan(20);
    }, 60_000);
});
