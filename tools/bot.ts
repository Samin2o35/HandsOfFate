// Hands of Fate — tools/bot.ts
// A simple automatic player, for tests and balance simulations. It is not
// meant to be good, just reasonable: it forges when it can, shuffles its cards
// around to raise its board's hand points, and rotates through the rewards.

import { Run, RoundResult } from '../assets/scripts/core/run';
import { cardsOnGrid } from '../assets/scripts/core/grid';
import { evaluateBoard } from '../assets/scripts/core/evaluate';
import { forgeUpgrades, mergeablePairs } from '../assets/scripts/core/forge';

/** Rough cells per firing for each pattern (a straight sweeps a ~5-wide row). */
const CELLS: Record<string, number> = {
    cell: 1, twoCells: 2, twoDominoes: 4, line3: 3, sweepRow: 5, square2x2: 4, rect2x3: 6, plus: 5, cross: 9,
};

/** Mostly damage per second, a little defence, a little hand points (score). */
function boardValue(run: Run): number {
    const r = evaluateBoard(run.grid);
    let damage = 0, defence = 0;
    for (const h of r.hands) {
        const perSec = (CELLS[h.pattern] * h.multiplier) / h.cooldown;
        if (h.effect === 'attack') damage += perSec;
        else if (h.effect === 'rot') damage += perSec * 0.9;
        else defence += perSec;
    }
    return 10 * damage + 3 * Math.min(defence, damage) + 0.1 * r.handPoints;
}

/** Greedy: try every swap, keep the ones that raise the board's value. */
export function arrangeBoard(run: Run): void {
    const g = run.grid;
    const slots = () => Array.from({ length: g.rows * g.cols }, (_, i) => ({ row: Math.floor(i / g.cols), col: i % g.cols }));

    // Fill empty slots first, highest cards first.
    for (const s of slots()) {
        if (g.slots[s.row * g.cols + s.col] || run.stash.length === 0) continue;
        const best = [...run.stash].sort((a, b) => b.rank - a.rank)[0];
        run.moveCard(best.id, s);
    }

    let value = boardValue(run);
    for (let pass = 0; pass < 3; pass++) {
        let improved = false;
        for (const s of slots()) {
            const candidates = [...cardsOnGrid(g), ...run.stash];
            for (const card of candidates) {
                const here = g.slots[s.row * g.cols + s.col];
                if (!here || here.id === card.id) continue;
                run.moveCard(card.id, s); // swap (or stash card in, slot card out)
                const v = boardValue(run);
                if (v > value) { value = v; improved = true; continue; }
                run.moveCard(here.id, s); // undo: put the old card back, which swaps the other one back too
            }
        }
        if (!improved) break;
    }
}

export function botPlanning(run: Run): void {
    if (run.forgeAvailable) {
        const pair = mergeablePairs(run.ownedCards())[0];
        if (pair) {
            const ups = forgeUpgrades(pair[0]);
            const up = ups.find((u) => u.kind === 'rank' && u.delta === 1) ?? ups[0];
            run.forge(pair[0].id, pair[1].id, up);
        }
    }
    arrangeBoard(run);
}

export function botReward(run: Run): void {
    const take = [...run.takeableCards()].sort((a, b) => b.rank - a.rank)[0];
    run.takeCard(take.id);
    const opts = run.rewardOptions();
    const grid = opts.find((o) => o.kind === 'grid')!;
    const health = opts.find((o) => o.kind === 'health')!;
    // Grid only pays off when the stash can fill the new line straight away.
    const g = run.grid;
    const add = grid.directions?.includes('col') && (g.cols <= g.rows || !grid.directions.includes('row')) ? 'col' : 'row';
    const needed = add === 'col' ? g.rows : g.cols;
    if (grid.available && run.stash.length >= needed) {
        run.chooseReward({ kind: 'grid', add });
    } else if (health.available && run.round % 2 === 0) {
        run.chooseReward({ kind: 'health' });
    } else {
        run.chooseReward({ kind: 'cards' });
    }
}

/** Plays one round from planning to the next planning (or run over). */
export function botRound(run: Run): RoundResult {
    botPlanning(run);
    const fight = run.startFight();
    fight.runToEnd();
    const result = run.finishFight(fight);
    if (result.won) botReward(run);
    return result;
}

export interface BotRunSummary {
    seed: number;
    roundReached: number;
    score: number;
    beatenBy: string;
    results: RoundResult[];
}

/** Plays a whole run until it's lost (or maxRounds as a safety stop). */
export function botRun(seed: number, maxRounds = 200, tutorial = false): BotRunSummary {
    const run = Run.newRun({ seed, tutorial });
    const results: RoundResult[] = [];
    while (run.phase !== 'over' && run.round <= maxRounds) results.push(botRound(run));
    const last = results[results.length - 1];
    return { seed, roundReached: run.round, score: run.score, beatenBy: last.opponent, results };
}
