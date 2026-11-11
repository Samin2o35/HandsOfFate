// Hands of Fate — app/PlayLog.ts
// The playtest log: one line per round played, kept on the device so a playtester can
// hand it over afterwards (Options → Copy playtest log, or `hof.playlog()` in the browser
// console). tools/playlog.ts reads what they send and prints the same numbers as the
// bot sim, so people and the bot can be compared. Nothing is sent anywhere.

import { sys } from 'cc';
import type { Run, RoundResult } from '../core/run';
import type { Fight } from '../core/fight';
import { cardsOnGrid } from '../core/grid';
import { evaluateBoard } from '../core/evaluate';

const KEY = 'hof.playlog';
const MAX_ROUNDS = 2000;

export interface PlayLogRound {
    /** When it was played (ms since 1970). */
    at: number;
    seed: number;
    tutorial: boolean;
    round: number;
    opponent: string;
    boss: string | null;
    won: boolean;
    seconds: number;
    cellsLeft: number;
    cellsTotal: number;
    roundScore: number;
    runScore: number;
    grid: string;
    /** The hands on your board this round, e.g. ["pair", "straight", ...]. */
    hands: string[];
    theirHands: string[];
    handsFired: number;
    bestHand: string | null;
    forgeUsed: boolean;
}

function read(): PlayLogRound[] {
    try {
        const raw = sys.localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as PlayLogRound[]) : [];
    } catch {
        return [];
    }
}

/** What the log needs from the run, taken before the fight is scored (scoring moves the run on). */
export interface PlayLogSnapshot {
    seed: number; tutorial: boolean; boss: string | null; grid: string; hands: string[]; theirHands: string[]; forgeUsed: boolean;
}

export const PlayLog = {
    snapshot(run: Run): PlayLogSnapshot {
        const d = (run as unknown as { data: { seed: number; tutorial: boolean; forgeUsed: boolean } }).data;
        const board = evaluateBoard(run.grid);
        const theirs = evaluateBoard(run.opponent.grid);
        const handsOf = (b: typeof board) => [...b.rows, ...b.cols].filter((l) => l.hand).map((l) => l.hand!.category as string);
        return {
            seed: d.seed, tutorial: d.tutorial, forgeUsed: d.forgeUsed,
            boss: run.opponent.boss ? `${run.opponent.boss.suit}${run.opponent.boss.tier}` : null,
            grid: `${run.grid.cols}x${run.grid.rows} (${cardsOnGrid(run.grid).length} cards)`,
            hands: handsOf(board), theirHands: handsOf(theirs),
        };
    },

    /** Called once per finished fight, with the snapshot taken just before it was scored. */
    add(snap: PlayLogSnapshot, fight: Fight, result: RoundResult) {
        try {
            const entry: PlayLogRound = {
                at: Date.now(),
                seed: snap.seed,
                tutorial: snap.tutorial,
                round: result.round,
                opponent: result.opponent,
                boss: snap.boss,
                won: result.won,
                seconds: Math.round(fight.time * 10) / 10,
                cellsLeft: result.score.cellsLeft,
                cellsTotal: result.score.cellsTotal,
                roundScore: result.score.total,
                runScore: result.runScore,
                grid: snap.grid,
                hands: snap.hands,
                theirHands: snap.theirHands,
                handsFired: fight.player.stats.handsFired,
                bestHand: fight.player.stats.bestHand,
                forgeUsed: snap.forgeUsed,
            };
            const all = read();
            all.push(entry);
            sys.localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_ROUNDS)));
        } catch (e) {
            console.warn('Play log not saved', e);
        }
    },
    all: read,
    text(): string {
        return JSON.stringify(read());
    },
    count(): number {
        return read().length;
    },
    clear() {
        sys.localStorage.removeItem(KEY);
    },
};
