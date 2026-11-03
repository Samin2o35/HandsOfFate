// Hands of Fate — core/patterns.ts
// Hit patterns and automatic targeting. A hand's pattern is placed on the target
// health grid where it does the most good:
//   attack / rot -> most living cells (attackers don't see shields)
//   heal         -> most lost cells (rotted cells can't be healed)
//   armor        -> most living, unshielded cells
// Ties go to the placement first in reading order, so fights are repeatable.
// Because attacks and armor both fill from the front (top-left), shields sit
// where hits land first, and actually block them.

import { Effect, HitPattern } from './hands';
import { HealthGrid, HealthCell, cellIndexAt } from './health';

type Shape = readonly (readonly [number, number])[]; // [row, col] offsets

const row = (n: number): Shape => Array.from({ length: n }, (_, i) => [0, i] as const);
const col = (n: number): Shape => Array.from({ length: n }, (_, i) => [i, 0] as const);
const rect = (h: number, w: number): Shape => {
    const out: [number, number][] = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push([r, c]);
    return out;
};

/** Each pattern as one or more shapes (orientations). Composite and full-line patterns are handled below. */
const SHAPES: Partial<Record<HitPattern, Shape[]>> = {
    cell: [[[0, 0]]],
    line3: [row(3), col(3)],
    square2x2: [rect(2, 2)],
    rect2x3: [rect(2, 3), rect(3, 2)],
    plus: [[[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]],
};
const SINGLE: Shape[] = [[[0, 0]]];
const DOMINO: Shape[] = [row(2), col(2)];

/** How many cells a pattern covers on this grid (rot hits one fewer). */
export function patternSize(pattern: HitPattern, g: HealthGrid): number {
    switch (pattern) {
        case 'cell': return 1;
        case 'twoCells': return 2;
        case 'line3': return 3;
        case 'square2x2':
        case 'twoDominoes': return 4;
        case 'plus': return 5;
        case 'rect2x3': return 6;
        case 'sweepRow': return g.cols;
        case 'cross': return g.cols + g.rows - 1;
    }
}

export function cellValue(effect: Effect, c: HealthCell): number {
    switch (effect) {
        case 'attack':
        case 'rot': return c.state === 'alive' ? 1 : 0; // attackers don't see shields
        case 'heal': return c.state === 'lost' ? 1 : 0;
        case 'armor': return c.state === 'alive' && !c.shield ? 1 : 0;
    }
}

/** Every placement of the given shapes, anchored on every cell. */
function shapePlacements(g: HealthGrid, shapes: Shape[]): number[][] {
    const out: number[][] = [];
    for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
            if (cellIndexAt(g, r, c) < 0) continue;
            for (const shape of shapes) {
                const idx: number[] = [];
                for (const [dr, dc] of shape) {
                    const i = cellIndexAt(g, r + dr, c + dc);
                    if (i >= 0) idx.push(i);
                }
                out.push(idx);
            }
        }
    }
    return out;
}

function rowCells(g: HealthGrid, r: number): number[] {
    const idx: number[] = [];
    for (let c = 0; c < g.cols; c++) { const i = cellIndexAt(g, r, c); if (i >= 0) idx.push(i); }
    return idx;
}

function placements(g: HealthGrid, pattern: HitPattern): number[][] {
    if (pattern === 'sweepRow') return Array.from({ length: g.rows }, (_, r) => rowCells(g, r));
    if (pattern === 'cross') {
        const out: number[][] = [];
        for (const cell of g.cells) {
            const idx = new Set(rowCells(g, cell.row));
            for (let r = 0; r < g.rows; r++) { const i = cellIndexAt(g, r, cell.col); if (i >= 0) idx.add(i); }
            out.push([...idx].sort((a, b) => a - b));
        }
        return out;
    }
    return shapePlacements(g, SHAPES[pattern] ?? SINGLE);
}

function bestOf(cands: number[][], value: (i: number) => number, exclude: Set<number>): number[] {
    let best: number[] = [];
    let bestValue = 0;
    for (const cand of cands) {
        const idx = cand.filter((i) => !exclude.has(i));
        const v = idx.reduce((s, i) => s + value(i), 0);
        if (v > bestValue + 1e-9) { bestValue = v; best = idx; }
    }
    return best;
}

/**
 * Where a pattern lands for an effect. Returns the cell indices it covers
 * (may include cells it doesn't change), or [] when it would do nothing.
 */
export function pickArea(g: HealthGrid, pattern: HitPattern, effect: Effect): number[] {
    const value = (i: number) => cellValue(effect, g.cells[i]);
    if (pattern === 'twoCells' || pattern === 'twoDominoes') {
        const parts = pattern === 'twoCells' ? SINGLE : DOMINO;
        const first = bestOf(shapePlacements(g, parts), value, new Set());
        const second = bestOf(shapePlacements(g, parts), value, new Set(first));
        return [...first, ...second];
    }
    return bestOf(placements(g, pattern), value, new Set());
}

/**
 * The cells an effect will actually change. Rot hits one fewer cell than
 * its pattern (minimum 1), keeping the most valuable ones.
 */
export function pickTargets(g: HealthGrid, pattern: HitPattern, effect: Effect): { area: number[]; cells: number[] } {
    const area = pickArea(g, pattern, effect);
    let cells = area.filter((i) => cellValue(effect, g.cells[i]) > 0);
    if (effect === 'rot') {
        const limit = Math.max(1, patternSize(pattern, g) - 1);
        cells = [...cells]
            .sort((a, b) => cellValue(effect, g.cells[b]) - cellValue(effect, g.cells[a]) || a - b)
            .slice(0, limit)
            .sort((a, b) => a - b);
    }
    return { area, cells };
}

/** Applies an effect to cells and changes them in place. */
export function applyEffect(g: HealthGrid, effect: Effect, cells: readonly number[]): void {
    for (const i of cells) {
        const c = g.cells[i];
        switch (effect) {
            case 'attack':
            case 'rot':
                if (c.state !== 'alive') break;
                if (c.shield) c.shield = false;
                else c.state = effect === 'attack' ? 'lost' : 'rotted';
                break;
            case 'heal':
                if (c.state === 'lost') c.state = 'alive';
                break;
            case 'armor':
                if (c.state === 'alive') c.shield = true;
                break;
        }
    }
}
