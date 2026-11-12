// Hands of Fate — tests/trace.test.ts (Stage D, decision 154)
// The medallion's charging ring: palette colours only, lights from the bottom up both sides.
import { describe, it, expect } from 'vitest';
import { traceRing, PAL, TRACE_STEPS } from '../assets/scripts/ui/pixelart';

const key = (c: readonly number[]) => c.join(',');
const count = (p: ReturnType<typeof traceRing>, col: readonly number[]) => {
    let n = 0;
    for (let i = 0; i < p.data.length; i += 4) if (key([p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]]) === key(col)) n++;
    return n;
};

describe('traceRing', () => {
    it('uses only the suit colour, the ink track and cream, all opaque', () => {
        const allowed = new Set([key(PAL.purple), key(PAL.ink), key(PAL.cream)]);
        for (const lit of [0, 0.3, 1]) for (const suit of [true, false]) {
            const p = traceRing(lit, PAL.purple, suit);
            for (let i = 0; i < p.data.length; i += 4) {
                if (p.data[i + 3] === 0) continue;
                expect(allowed.has(key([p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]]))).toBe(true);
            }
        }
    });
    it('lights more as it charges, none at 0 and all at 1', () => {
        let last = -1;
        for (let s = 0; s <= TRACE_STEPS; s++) {
            const n = count(traceRing(s / TRACE_STEPS, PAL.green), PAL.green);
            expect(n).toBeGreaterThanOrEqual(last);
            last = n;
        }
        expect(count(traceRing(0, PAL.green), PAL.green)).toBe(0);
        expect(count(traceRing(1, PAL.green), PAL.ink)).toBe(0);
    });
    it('starts at the bottom and is the same on both sides', () => {
        const p = traceRing(0.25, PAL.blue);
        const c = PAL.blue;
        expect(key(p.get(17, 34))).toBe(key(c));  // bottom: lit
        expect(key(p.get(17, 1))).toBe(key(PAL.ink)); // top: not yet
        for (let y = 0; y < 36; y++) for (let x = 0; x < 18; x++) expect(key(p.get(x, y))).toBe(key(p.get(35 - x, y)));
    });
});
