// Hands of Fate — tools/board.ts
// Type in a board, see every hand it makes. Rows split by "/", "-" = empty slot.
//   npm run board -- "5H 5S JS / 3D 3D 9H / 8C 8S 10C"
// With no board given, it shows the tutorial opening.

import { cardLabel } from '../assets/scripts/core/cards';
import { gridFromText } from '../assets/scripts/core/grid';
import { evaluateBoard, LineResult } from '../assets/scripts/core/evaluate';
import { EFFECT_NAME } from '../assets/scripts/core/hands';
import { TUTORIAL_LAYOUT } from '../assets/scripts/core/decks';

const text = process.argv.slice(2).join(' ').trim() || TUTORIAL_LAYOUT;
const grid = gridFromText(text);
const result = evaluateBoard(grid);

const cell = (s: LineResult['slots'][number]) => (s ? cardLabel(s.card) : '·').padStart(4);
const describe = (l: LineResult) =>
    !l.full ? '(not full)'
        : !l.hand ? '–'
            : `${l.hand.label.padEnd(18)} ${EFFECT_NAME[l.hand.effect].padEnd(7)} ${l.hand.cooldown.toFixed(1)}s  ${l.hand.points} pts`;

console.log('');
result.rows.forEach((r) => console.log(`${r.slots.map(cell).join('')}    Row ${r.index + 1}: ${describe(r)}`));
console.log('');
result.cols.forEach((c) => console.log(`  Column ${c.index + 1}: ${describe(c)}`));
const leftovers = result.hands.filter((h) => h.source === 'leftover');
if (leftovers.length) {
    console.log('');
    leftovers.forEach((h) => console.log(`  ${h.label.padEnd(18)} ${EFFECT_NAME[h.effect].padEnd(7)} ${h.cooldown.toFixed(1)}s`));
}
console.log(`\n  ${result.hands.length} hands, ${result.handPoints} hand points\n`);
