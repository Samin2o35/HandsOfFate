// Hands of Fate — tools/sim.ts
// Plays many runs with the bot and prints how far they get: a quick balance check.
//   npm run sim            (20 runs)
//   npm run sim -- 100 7   (100 runs, starting from seed 7)
//   npm run sim -- 60 1 flush4   (the same seeds under another rule set, core/rules.ts VARIANTS)

import { botRun } from './bot';
import { useRules } from '../assets/scripts/core/rules';

const runs = Number(process.argv[2] ?? 20);
const firstSeed = Number(process.argv[3] ?? 1);
const variant = process.argv[4] ?? 'current';
useRules(variant);
const quiet = process.argv.includes('--quiet');
const killedBy = new Map<string, number>();
let early = 0;
const reached: number[] = [];
const scores: number[] = [];
let bossLosses = 0;
const started = Date.now();

for (let seed = firstSeed; seed < firstSeed + runs; seed++) {
    const r = botRun(seed);
    const last = r.results[r.results.length - 1];
    const boss = !last.opponent.endsWith('table');
    if (boss) bossLosses++;
    const who = boss ? last.opponent.replace(/^King of /, 'K ') : 'table';
    killedBy.set(who, (killedBy.get(who) ?? 0) + 1);
    if (r.roundReached <= 4) early++;
    reached.push(r.roundReached);
    scores.push(r.score);
    const best = r.results.reduce((b, x) => Math.max(b, x.score.total), 0);
    if (!quiet) console.log(`  seed ${String(seed).padStart(4)}  round ${String(r.roundReached).padStart(3)}  score ${String(r.score).padStart(9)}  best round ${String(best).padStart(6)}  beaten by ${last.opponent}${boss ? ' (boss)' : ''}`);
}

const sorted = [...reached].sort((a, b) => a - b);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
console.log(`\n  Rules: ${variant}`);
console.log(`  ${runs} runs in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`  Round reached: median ${pct(0.5)}, middle half ${pct(0.25)}–${pct(0.75)}, best ${sorted[sorted.length - 1]}`);
console.log(`  Median score: ${[...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)]}`);
console.log(`  Lost to a boss: ${bossLosses} of ${runs} (${Math.round(100 * bossLosses / runs)}%)`);
console.log(`  Lost by round 4: ${early} of ${runs}`);
console.log(`  Beaten by: ${Array.from(killedBy.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
