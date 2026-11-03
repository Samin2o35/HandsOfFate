// Hands of Fate — tools/fight.ts
// Plays two boards against each other and prints the fight, event by event.
//   npm run fight -- "<your board>" "<their board>" [your cells] [their cells]
//   npm run fight -- "5H 5S JS / 3D 3D 9H / 8C 8S 10C" "2S 2C 7H / 9D 4S KC / 5H JD 3C" 12 14
// With no boards: the tutorial opening vs a small round 1 table.
// Health pictures: O alive, S shielded, x lost, # rotted.

import { gridFromText } from '../assets/scripts/core/grid';
import { evaluateBoard } from '../assets/scripts/core/evaluate';
import { EFFECT_NAME } from '../assets/scripts/core/hands';
import { healthToText, cloneHealthGrid, HealthGrid } from '../assets/scripts/core/health';
import { applyEffect } from '../assets/scripts/core/patterns';
import { Fight } from '../assets/scripts/core/fight';
import { TUTORIAL_LAYOUT } from '../assets/scripts/core/decks';

// Friendly errors for typos in a board ("Not a card", rows of different lengths).
process.on('uncaughtException', (e) => { console.error(`\n  ${e.message}\n`); process.exit(1); });

const [mine = TUTORIAL_LAYOUT, theirs = '2S 2C 7H / 9D 4S KC / 5H JD 3C', myCells = '12', theirCells = '12'] = process.argv.slice(2);

const fight = new Fight(
    { hands: evaluateBoard(gridFromText(mine)).hands, healthCells: Number(myCells) },
    { hands: evaluateBoard(gridFromText(theirs)).hands, healthCells: Number(theirCells) },
);

// Replay each event's changes on copies, so every line shows the grid at that moment.
const view: Record<'player' | 'enemy', HealthGrid> = {
    player: cloneHealthGrid(fight.player.health),
    enemy: cloneHealthGrid(fight.enemy.health),
};
const pic = (s: 'player' | 'enemy') => healthToText(view[s]).replace(/\//g, ' ');
console.log(`\n  start   you  ${pic('player')}\n          them ${pic('enemy')}\n`);

for (const e of fight.runToEnd()) {
    applyEffect(view[e.target], e.effect, e.cells);
    const who = e.side === 'player' ? 'you ' : 'them';
    const what = `${e.label} · ${EFFECT_NAME[e.effect]}`.padEnd(30);
    const charges = Number.isFinite(e.chargesLeft) ? ` (${e.chargesLeft} left)` : '';
    console.log(`  ${e.time.toFixed(1).padStart(5)}s  ${who}  ${what} ${String(e.cells.length).padStart(2)} cells${charges.padEnd(10)}  → ${e.target === 'player' ? 'you ' : 'them'} ${pic(e.target)}`);
}

const p = fight.player.stats;
console.log(`\n  ${fight.winner === 'player' ? 'You win' : 'You lose'} at ${fight.time.toFixed(1)} s (${fight.endReason})`);
console.log(`  You: ${p.handsFired} hands fired, ${p.handPointsFired} hand points, best ${p.bestHand ?? '–'}, ${fight.player.living}/${fight.player.startLiving} cells left\n`);
