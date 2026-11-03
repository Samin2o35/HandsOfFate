// Hands of Fate — core/grid.ts
// The card grid as plain data (easy to save and copy), plus helpers.
// Slots are stored row by row, so slot index = reading order
// (left to right, top to bottom), which the tie rule uses.

import { Card, parseCard } from './cards';

export interface Grid {
    rows: number;
    cols: number;
    /** rows × cols entries, row by row. null = empty slot. */
    slots: (Card | null)[];
}

/** Grid reward stops here (a 5-wide line is needed for a full house). */
export const MAX_GRID_SIDE = 5;

export function createGrid(rows: number, cols: number): Grid {
    if (rows < 1 || cols < 1 || rows > MAX_GRID_SIDE || cols > MAX_GRID_SIDE) {
        throw new Error(`Grid ${rows}×${cols} is outside 1..${MAX_GRID_SIDE}`);
    }
    return { rows, cols, slots: new Array(rows * cols).fill(null) };
}

export function slotIndex(g: Grid, row: number, col: number): number {
    if (row < 0 || col < 0 || row >= g.rows || col >= g.cols) {
        throw new Error(`Slot ${row},${col} is outside the ${g.rows}×${g.cols} grid`);
    }
    return row * g.cols + col;
}

export function cardAt(g: Grid, row: number, col: number): Card | null {
    return g.slots[slotIndex(g, row, col)];
}

/** Puts a card (or null) in a slot and returns whatever was there before. */
export function setCard(g: Grid, row: number, col: number, card: Card | null): Card | null {
    const i = slotIndex(g, row, col);
    const old = g.slots[i];
    g.slots[i] = card;
    return old;
}

/** Finds a card on the grid by id. */
export function findCard(g: Grid, cardId: number): { row: number; col: number } | null {
    const i = g.slots.findIndex((c) => c !== null && c.id === cardId);
    return i < 0 ? null : { row: Math.floor(i / g.cols), col: i % g.cols };
}

export function cardsOnGrid(g: Grid): Card[] {
    return g.slots.filter((c): c is Card => c !== null);
}

export function canAddRow(g: Grid): boolean { return g.rows < MAX_GRID_SIDE; }
export function canAddColumn(g: Grid): boolean { return g.cols < MAX_GRID_SIDE; }

/** Grid reward: adds an empty row at the bottom. Cards keep their places. */
export function addRow(g: Grid): void {
    if (!canAddRow(g)) throw new Error('Grid already has the most rows');
    g.slots.push(...new Array(g.cols).fill(null));
    g.rows++;
}

/** Grid reward: adds an empty column on the right. Cards keep their places. */
export function addColumn(g: Grid): void {
    if (!canAddColumn(g)) throw new Error('Grid already has the most columns');
    const next: (Card | null)[] = [];
    for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) next.push(g.slots[r * g.cols + c]);
        next.push(null);
    }
    g.slots = next;
    g.cols++;
}

/**
 * Builds a grid from text, rows split by "/", "-" for an empty slot:
 *   gridFromText('5H 5S JS / 3D 3D 9H / 8C 8S -')
 */
export function gridFromText(text: string): Grid {
    const rows = text.split('/').map((r) => r.trim().split(/\s+/));
    const cols = rows[0].length;
    if (rows.some((r) => r.length !== cols)) throw new Error('Every row needs the same number of slots');
    const g = createGrid(rows.length, cols);
    rows.forEach((r, ri) => r.forEach((t, ci) => {
        if (t !== '-' && t !== '.') setCard(g, ri, ci, parseCard(t));
    }));
    return g;
}
