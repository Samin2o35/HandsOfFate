// Hands of Fate — tools/layout/perf.mjs (npm run perf)
// Plays a late fight frame by frame against the cc stand-in and prints what Cocos would have to
// do each frame: nodes made and destroyed, label texts re-rendered, sprite frames and colours
// set, live tweens and pooled effect pieces. Default: a round 10 King of Hearts against a full
// 5x5 board at Fast. Usage: npm run perf [-- <round> <board side> <slow|medium|fast>]
import { execFileSync } from 'node:child_process';

const [round = '10', side = '5', speed = 'fast'] = process.argv.slice(2);
const env = { ...process.env, PERF: '1', SIMULATE: '1', FILL: side, SPEED: speed };
const out = execFileSync('npx', ['tsx', '--tsconfig', 'tools/layout/tsconfig.json', 'tools/layout/render.ts', 'Fight', '1920', '1080',
    'build/perf.json', 'boss', round], { env, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'inherit'] });
console.log(out.split('\n').filter((l) => l.startsWith('PERF') || l.startsWith('SIM')).join('\n'));
