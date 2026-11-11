// Hands of Fate — tests/richwrap.test.ts
// The Dealer's lines are wrapped by us, not by Cocos (decision 135): Cocos trims each wrapped
// RichText piece, which ate the space before coloured words ("yourhealth", "Thehighest").
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { wrapRich, plainLines, monoColumns } from '../assets/scripts/ui/richwrap';
import { STEP_TEXT } from '../assets/scripts/ui/tutorialText';

const strip = (s: string) => s.replace(/<[^>]+>/g, '');

describe('wrapRich', () => {
    it('breaks at spaces and never past the column limit', () => {
        const out = wrapRich('one two three four five six', 9);
        expect(plainLines(out)).toEqual(['one two', 'three', 'four five', 'six']);
    });
    it('ignores tags when counting and keeps them intact', () => {
        const out = wrapRich('This grid is your <color=#FDD164>health</color>: lose it all', 18);
        expect(plainLines(out).every((l) => l.length <= 18)).toBe(true);
        expect(out).toContain('<color=#FDD164>health</color>');
    });
    it('keeps an overlong word whole', () => {
        expect(plainLines(wrapRich('a supercalifragilistic b', 6))).toEqual(['a', 'supercalifragilistic', 'b']);
    });
    it('keeps existing line breaks', () => {
        expect(plainLines(wrapRich('ab cd\nef gh', 20))).toEqual(['ab cd', 'ef gh']);
    });
    for (const width of [500, 1000 - 220, 1860 - 220]) {
        const cols = monoColumns(width, 32);
        it(`every Dealer line at ${width} px keeps every space, no line starts or ends with one`, () => {
            for (const text of Object.values(STEP_TEXT)) {
                const out = wrapRich(text, cols);
                // Only spaces become breaks: same words, same spacing.
                expect(strip(out).replace(/\n/g, ' ')).toBe(strip(text).replace(/\n/g, ' '));
                for (const line of plainLines(out)) {
                    expect(line.length).toBeLessThanOrEqual(cols);
                    expect(line).toBe(line.trim());
                }
            }
        });
    }
});

describe('cc/env', () => {
    it("no script uses EDITOR, which is also true in the editor's preview (decision 132)", () => {
        const dir = path.resolve(__dirname, '../assets/scripts');
        const files: string[] = [];
        const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) =>
            e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ts') && files.push(path.join(d, e.name)));
        walk(dir);
        const bad = files.filter((f) => /import\s*\{[^}]*\bEDITOR\b[^}]*\}\s*from\s*'cc\/env'/.test(fs.readFileSync(f, 'utf8')));
        expect(bad.map((f) => path.relative(dir, f))).toEqual([]);
    });
});
