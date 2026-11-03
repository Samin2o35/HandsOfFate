// Hands of Fate — core/rng.ts
// Seeded random numbers (mulberry32). The same seed always gives the same
// sequence, so a run can be saved, replayed and tested. Never use Math.random
// in /core.

export class Rng {
    /** Current state. Save this number to resume the exact same sequence. */
    state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    /** Float in [0, 1). */
    next(): number {
        let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Integer from min to max, both included. */
    int(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1));
    }

    chance(p: number): boolean {
        return this.next() < p;
    }

    pick<T>(items: readonly T[]): T {
        if (items.length === 0) throw new Error('pick() from an empty list');
        return items[Math.floor(this.next() * items.length)];
    }

    /** Shuffled copy (Fisher–Yates). */
    shuffle<T>(items: readonly T[]): T[] {
        const out = [...items];
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }
}
