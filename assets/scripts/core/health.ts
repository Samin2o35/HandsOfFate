// Hands of Fate — core/health.ts
// The health grid: your only health. Cells are laid out row by row; the last row
// may be shorter when the count doesn't fill it (e.g. 14 cells = 4, 4, 4, 2).

export type CellState = 'alive' | 'lost' | 'rotted';

export interface HealthCell {
    /** alive; lost (healable); rotted (not healable this fight). */
    state: CellState;
    /** A shield on a living cell absorbs the next attack or rot hit. */
    shield: boolean;
    readonly row: number;
    readonly col: number;
}

export interface HealthGrid {
    readonly cols: number;
    readonly rows: number;
    readonly cells: HealthCell[];
}

/** Player starts with 12 cells in a 4×3 grid (GDD). */
export const PLAYER_START_HEALTH = 12;

/**
 * Columns for a given number of cells: about 4:3 wide.
 * 12 → 4×3, 20 → 5×4, 24 → 6×4, 30 → 6×5, 60 → 9×7. Matches the mockups.
 */
export function healthCols(count: number): number {
    return Math.max(1, Math.round(Math.sqrt((count * 4) / 3)));
}

export function createHealthGrid(count: number, cols = healthCols(count)): HealthGrid {
    if (count < 1) throw new Error('A health grid needs at least 1 cell');
    const cells: HealthCell[] = [];
    for (let i = 0; i < count; i++) {
        cells.push({ state: 'alive', shield: false, row: Math.floor(i / cols), col: i % cols });
    }
    return { cols, rows: Math.ceil(count / cols), cells };
}

/** Index of the cell at row/col, or -1 if there's no cell there. */
export function cellIndexAt(g: HealthGrid, row: number, col: number): number {
    if (row < 0 || col < 0 || col >= g.cols) return -1;
    const i = row * g.cols + col;
    return i < g.cells.length ? i : -1;
}

export function livingCount(g: HealthGrid): number {
    return g.cells.reduce((n, c) => n + (c.state === 'alive' ? 1 : 0), 0);
}

export function isDead(g: HealthGrid): boolean {
    return livingCount(g) === 0;
}

/** Copy for previews or saves, so the original is never changed. */
export function cloneHealthGrid(g: HealthGrid): HealthGrid {
    return { cols: g.cols, rows: g.rows, cells: g.cells.map((c) => ({ ...c })) };
}

/** Text picture for tests and tools: O alive, S shielded, x lost, # rotted. */
export function healthToText(g: HealthGrid): string {
    const lines: string[] = [];
    for (let r = 0; r < g.rows; r++) {
        let line = '';
        for (let c = 0; c < g.cols; c++) {
            const i = cellIndexAt(g, r, c);
            if (i < 0) break;
            const cell = g.cells[i];
            line += cell.state === 'alive' ? (cell.shield ? 'S' : 'O') : cell.state === 'lost' ? 'x' : '#';
        }
        lines.push(line);
    }
    return lines.join('/');
}

/** Inverse of healthToText, for setting up tests: 'OOxS/O#OO'. */
export function healthFromText(text: string): HealthGrid {
    const rows = text.split('/');
    const cols = rows[0].length;
    const count = rows.reduce((n, r) => n + r.length, 0);
    const g = createHealthGrid(count, cols);
    rows.join('').split('').forEach((ch, i) => {
        const c = g.cells[i];
        if (ch === 'x') c.state = 'lost';
        else if (ch === '#') c.state = 'rotted';
        else if (ch === 'S') c.shield = true;
        else if (ch !== 'O') throw new Error(`Bad health cell "${ch}"`);
    });
    return g;
}
