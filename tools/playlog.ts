// Hands of Fate — tools/playlog.ts
// Reads playtest logs (Options → Copy playtest log, pasted into a .json file per player)
// and prints the numbers phase 7 decides on, next to the bot's for the same question.
//   npx tsx tools/playlog.ts logs/*.json
//   npx tsx tools/playlog.ts --sample 30 > build/sample_log.json   (a log played by the bot, to try it out)

import * as fs from 'fs';
import * as path from 'path';
import { botRun } from './bot';
import type { PlayLogRound } from '../assets/scripts/app/PlayLog';

if (process.argv[2] === '--sample') {
    // A log in the same shape, played by the bot: lets the report be tried before any playtest.
    const n = Number(process.argv[3] ?? 20);
    const rounds: Partial<PlayLogRound>[] = [];
    for (let seed = 1; seed <= n; seed++) {
        for (const r of botRun(seed).results) {
            rounds.push({
                at: 0, seed, tutorial: false, round: r.round, opponent: r.opponent,
                boss: r.opponent.endsWith('table') ? null : r.opponent, won: r.won,
                seconds: r.score.time, cellsLeft: r.score.cellsLeft, cellsTotal: r.score.cellsTotal,
                roundScore: r.score.total, runScore: r.runScore, hands: [], theirHands: [], handsFired: r.score.handsFired,
                bestHand: null, forgeUsed: false, grid: '',
            });
        }
    }
    process.stdout.write(JSON.stringify(rounds));
    process.exit(0);
}

interface RunSummary { player: string; seed: number; reached: number; lostTo: string; boss: boolean; rounds: PlayLogRound[] }

const files = process.argv.slice(2);
if (!files.length) {
    console.log('Usage: npx tsx tools/playlog.ts <log.json> [more.json ...]');
    process.exit(1);
}

const runs: RunSummary[] = [];
const all: PlayLogRound[] = [];
for (const f of files) {
    const player = path.basename(f, path.extname(f));
    const rounds = (JSON.parse(fs.readFileSync(f, 'utf8')) as PlayLogRound[]).filter((r) => !r.tutorial);
    all.push(...rounds);
    let cur: RunSummary | null = null;
    for (const r of rounds) {
        // A new run starts when the seed changes or the round number goes back.
        if (!cur || cur.seed !== r.seed || r.round <= cur.reached) {
            cur = { player, seed: r.seed, reached: r.round, lostTo: '', boss: false, rounds: [] };
            runs.push(cur);
        }
        cur.reached = r.round;
        cur.rounds.push(r);
        if (!r.won) { cur.lostTo = r.opponent; cur.boss = r.boss !== null; }
    }
}

const ended = runs.filter((r) => r.lostTo);
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '–');
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

console.log(`\n  ${files.length} player(s), ${runs.length} runs (${ended.length} finished), ${all.length} rounds (tutorial left out)`);
console.log(`  Round reached (finished runs): median ${median(ended.map((r) => r.reached))}, best ${Math.max(0, ...ended.map((r) => r.reached))}`);

// The phase 7 check: bosses should no longer cause about half of all losses.
const bossLosses = ended.filter((r) => r.boss).length;
console.log(`  Lost to a King: ${bossLosses} of ${ended.length} (${pct(bossLosses, ended.length)})   <- the check: well under half`);
const by = new Map<string, number>();
for (const r of ended) by.set(r.boss ? r.lostTo : 'a table', (by.get(r.boss ? r.lostTo : 'a table') ?? 0) + 1);
console.log(`  Beaten by: ${Array.from(by.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`  Lost by round 4: ${ended.filter((r) => r.reached <= 4).length}`);

// Deferred 5: the early ♠ flush spike. Rounds 1–6 lost to a table holding a flush.
const early = all.filter((r) => r.round <= 6 && !r.won);
const flushEarly = early.filter((r) => r.theirHands.includes('flush')).length;
console.log(`  Rounds 1–6 lost: ${early.length}, against a flush: ${flushEarly}`);

// Deferred 6: the straight flush cross.
const sf = all.filter((r) => r.hands.includes('straightFlush')).length;
console.log(`  Rounds with a straight flush on your board: ${sf} (${pct(sf, all.length)})`);
const fl = all.filter((r) => r.hands.includes('flush')).length;
console.log(`  Rounds with a flush on your board: ${fl} (${pct(fl, all.length)})`);
console.log(`  Forge used: ${all.filter((r) => r.forgeUsed).length} of ${all.length} rounds`);
console.log(`  Median fight: ${median(all.map((r) => r.seconds)).toFixed(1)} game-seconds\n`);

for (const p of Array.from(new Set(runs.map((r) => r.player)))) {
    const mine = runs.filter((r) => r.player === p);
    console.log(`  ${p}: ${mine.map((r) => `round ${r.reached}${r.lostTo ? ` (${r.boss ? 'K' : 'table'})` : ' (unfinished)'}`).join(', ')}`);
}
console.log('\n  Bot, same check: `npm run sim -- 100 1 --quiet`. Rule sets to compare: core/rules.ts VARIANTS.\n');
