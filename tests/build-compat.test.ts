// Hands of Fate — tests/build-compat.test.ts
// Cocos's release build compiles our TypeScript with Babel in "loose" mode. In
// loose mode a spread assumes an array: [...set] becomes [].concat(set) (a list
// holding the Set itself) and Math.max(...map.values()) becomes
// Math.max.apply(Math, iterator) (-Infinity). The editor preview doesn't do
// this, so such code works in the preview and breaks only in the build. That is
// how New Run crashed on itch.io. Use Array.from(...) for a Set, a Map or an
// iterator.
//
// 1. The rules code (core + the bot) is compiled exactly that way and must play
//    the same games as the normal code.
// 2. The UI/app code can't run outside Cocos, so it's scanned for spreads of a
//    Set, a Map or an iterator.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { transformFileSync } from '@babel/core';
import { botRun } from '../tools/bot';

const ROOT = path.resolve(__dirname, '..');
const SEEDS = [1, 2, 3];
const MAX_ROUNDS = 30;

function compileLoose(outDir: string) {
    const files = [
        ...fs.readdirSync(path.join(ROOT, 'assets/scripts/core')).filter((f) => f.endsWith('.ts')).map((f) => `assets/scripts/core/${f}`),
        'tools/bot.ts',
    ];
    for (const f of files) {
        const res = transformFileSync(path.join(ROOT, f), {
            babelrc: false, configFile: false, filename: f,
            presets: [
                ['@babel/preset-env', { loose: true, targets: 'ie 11', modules: 'commonjs' }],
                ['@babel/preset-typescript', { allowDeclareFields: true }],
            ],
        });
        const out = path.join(outDir, f.replace(/\.ts$/, '.js'));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, res!.code!);
    }
}

describe('release-build compatibility', () => {
    it('rules code compiled like the Cocos build plays the same games', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hof-loose-'));
        try {
            compileLoose(dir);
            const req = createRequire(path.join(dir, 'index.js'));
            const loose = req(path.join(dir, 'tools/bot.js')) as { botRun: typeof botRun };
            for (const seed of SEEDS) {
                const a = botRun(seed, MAX_ROUNDS);
                const b = loose.botRun(seed, MAX_ROUNDS);
                expect([b.roundReached, b.score], `seed ${seed}`).toEqual([a.roundReached, a.score]);
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }, 120_000);

    it('UI and app code never spread a Set, a Map or an iterator', () => {
        const bad: string[] = [];
        for (const sub of ['assets/scripts/ui', 'assets/scripts/app', 'assets/scripts/core']) {
            for (const f of fs.readdirSync(path.join(ROOT, sub)).filter((n) => n.endsWith('.ts'))) {
                const text = fs.readFileSync(path.join(ROOT, sub, f), 'utf8');
                // Names declared as a Set or Map in this file.
                const setNames = new Set<string>();
                for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*(?::\s*(?:Set|Map)<[^=]*)?=\s*new\s+(?:Set|Map)\b/g)) setNames.add(m[1]);
                for (const m of text.matchAll(/(?:private|readonly|public)?\s*(\w+)\s*:\s*(?:Set|Map)</g)) setNames.add(m[1]);
                text.split('\n').forEach((line, i) => {
                    const hits = [
                        /\.\.\.\s*new\s+(Set|Map)\b/.test(line),
                        /\.\.\.\s*[\w.$]+\.(values|keys|entries)\(\)/.test(line),
                        [...line.matchAll(/\.\.\.\s*(?:this\.)?(\w+)\b(?!\s*[.(\[])/g)].some((m) => setNames.has(m[1])),
                    ];
                    if (hits.some(Boolean)) bad.push(`${sub}/${f}:${i + 1}: ${line.trim()}`);
                });
            }
        }
        expect(bad, 'use Array.from(...) instead of spreading these').toEqual([]);
    });
});
