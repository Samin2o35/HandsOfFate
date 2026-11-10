// Hands of Fate — tools/layout/run-all.mjs (npm run layout)
// Draws the phase 1 screens at phone (19.5:9), desktop/itch (16:9) and tablet (4:3)
// shapes into build/layout/*.png. Needs Python 3 with Pillow for the drawing step.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'build/layout';
mkdirSync(out, { recursive: true });
const sizes = [[2340, 1080], [1920, 1080], [1920, 1440]];
const jobs = [['Options'], ['Achievements'], ['BossIntro', 'S', '1'], ['BossIntro', 'D', '4'], ['RunOver'], ['Ace']];
const py = process.platform === 'win32' ? 'python' : 'python3';
for (const [w, h] of sizes) for (const [screen, ...args] of jobs) {
    const f = join(out, `${screen}${args.join('')}-${w}x${h}`);
    const log = execFileSync('npx', ['tsx', '--tsconfig', 'tools/layout/tsconfig.json', 'tools/layout/render.ts', screen, String(w), String(h), `${f}.json`, ...args],
        { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'ignore'] });
    process.stdout.write(log.trim().split('\n').pop() + '\n');
    process.stdout.write(execFileSync(py, ['tools/layout/draw.py', `${f}.json`, `${f}.png`], { encoding: 'utf8' }));
}
console.log(`Pictures in ${out}`);
