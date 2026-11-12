// Hands of Fate — ui/views.ts
// Small building blocks shared by the planning and fight screens:
//   CardView        a card's art, with the gold "in a hand" ring and pink "selected" ring
//   buildHealthGrid the grid of health cells
//   buildMiniBoard  an opponent's table, small
// Hand badges and the hand list live in table.ts.

import { _decorator, Component, Node, Sprite, UITransform } from 'cc';
import { Card, Rank, rankLabel, SUIT_NAME } from '../core/cards';
import { Grid } from '../core/grid';
import { Hand } from '../core/evaluate';
import { HandCategory } from '../core/hands';
import { HealthGrid, healthCols } from '../core/health';
import { Trace } from './trace';
import { UiKit, makeNode, makeSprite } from './UiKit';
import { ringFrame, cellFrame, cellSpriteSize } from './kitC';

/** Open-table pieces sit on whole art pixels: sizes rounded to even screen pixels. */
const even = (n: number) => Math.round(n / 2) * 2;
import { AnimatedCard } from './AnimatedCard';
const { ccclass } = _decorator;

/** Card size at 1× art. */
export const CARD_W = 90;
export const CARD_H = 126;

/** Card scale for a grid (Build Log decision 2): side 3 → 2×, 4 → 1.5×, 5 → 1×. */
export function cardScaleFor(g: Grid): number {
    const side = Math.max(g.rows, g.cols);
    return side <= 3 ? 2 : side === 4 ? 1.5 : 1;
}

// ---- Card ---------------------------------------------------------------------

@ccclass('CardView')
export class CardView extends Component {
    card: Card | null = null;
    private gold: Node | null = null;
    private pink: Node | null = null;

    /** Builds a card node: art, plus rings that start hidden. */
    static create(parent: Node, card: Card, w: number, h: number, x: number, y: number): CardView {
        const kit = UiKit.get();
        const holder = makeNode(parent, `Card ${card.id}`, w, h, { x, y });
        // Open table: dotted rings, gold round a scoring card, pink (outside it) when picked or charging.
        const pink = makeSprite(holder, 'Selected', ringFrame(w + 24, h + 24, 'pink'), even(w + 24), even(h + 24)).node;
        makeSprite(holder, 'Art', kit.cardFrame(card), w, h);
        const gold = makeSprite(holder, 'InHand', ringFrame(w + 12, h + 12, 'gold'), even(w + 12), even(h + 12)).node;
        pink.active = false;
        gold.active = false;
        const view = holder.addComponent(CardView);
        view.card = card;
        view.gold = gold;
        view.pink = pink;
        return view;
    }

    setInHand(on: boolean) { if (this.gold) this.gold.active = on; }
    setSelected(on: boolean) { if (this.pink) this.pink.active = on; }

    /** The charging outline round the card (fights, decision 156): made on first use, just outside the card. */
    trace: Trace | null = null;
    addTrace(): Trace {
        if (this.trace) return this.trace;
        const ut = this.node.getComponent(UITransform)!;
        this.trace = new Trace(this.node, 'Trace', even(ut.width + 12), even(ut.height + 12));
        return this.trace;
    }
}

/** An empty card slot: a dotted cream outline, clear on the smoke (Stage C, decision 152). A card covers it. */
export function buildSlot(parent: Node, name: string, w: number, h: number, x: number, y: number): Node {
    return makeSprite(parent, name, ringFrame(w, h, 'cream'), even(w), even(h), { x, y }).node;
}

// ---- Hand text -----------------------------------------------------------------

const SHORT: Record<HandCategory, string> = {
    high: 'HIGH', pair: 'PAIR', twoPair: 'TWO PAIR', trips: 'TRIPS', straight: 'STRAIGHT',
    flush: 'FLUSH', fullHouse: 'FULL HOUSE', quads: 'FOUR', straightFlush: 'STR. FLUSH',
};

function plural(r: Rank) { return `${rankLabel(r)}s`; }

/** "TRIPS 3s", "PAIR Js", "FLUSH" (the opponent list and short labels). */
export function shortName(h: Hand): string {
    const r = h.cards[0].card.rank;
    switch (h.category) {
        case 'pair':
        case 'trips': return `${SHORT[h.category]} ${plural(r)}`;
        case 'quads': return `FOUR ${plural(r)}`;
        case 'high': return `HIGH ${rankLabel(r)}`;
        default: return SHORT[h.category];
    }
}

/** "K of Spades": card names for on-screen text (the fonts have no suit symbols). */
export function cardWords(c: Pick<Card, 'suit' | 'rank'>): string {
    return `${rankLabel(c.rank)} of ${SUIT_NAME[c.suit]}`;
}

/** "3.5s" */
export function cooldownText(seconds: number): string { return `${seconds.toFixed(1)}s`; }

// ---- Health grid --------------------------------------------------------------------

export interface HealthGridParts {
    node: Node;
    cells: Sprite[];
    width: number;
    height: number;
    /** Cell size in screen pixels (the sprites carry a small margin of the art). */
    cellSize?: number;
}

export function buildHealthGrid(parent: Node, health: HealthGrid | number, maxW: number, maxH: number, x: number, y: number, maxPitch = 36, gapRatio = 0.2): HealthGridParts {
    const count = typeof health === 'number' ? health : health.cells.length;
    const cols = typeof health === 'number' ? healthCols(count) : health.cols;
    const rows = Math.ceil(count / cols);
    const pitch = Math.min(maxPitch, Math.floor(maxW / (cols - gapRatio)), Math.floor(maxH / (rows - gapRatio)));
    const size = Math.max(4, Math.round(pitch * (1 - gapRatio)));
    const width = cols * pitch - (pitch - size);
    const height = rows * pitch - (pitch - size);
    const node = makeNode(parent, 'HealthGrid', width, height, { x, y, anchorX: 0, anchorY: 1 });
    const cells: Sprite[] = [];
    for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        // Open table: the cell's colour shows its state (red, green rotted, blue shielded, an empty outline when lost).
        const cs = cellSpriteSize(size);
        const cell = makeSprite(node, `Cell${i}`, cellFrame(size, 'alive'), cs, cs, { x: c * pitch + size / 2 + (cs - size) / 2, y: -(r * pitch + size / 2) - (cs - size) / 2 });
        cells.push(cell);
    }
    const parts = { node, cells, width, height, cellSize: size };
    if (typeof health !== 'number') paintHealth(parts, health);
    return parts;
}

/** Shows each cell's state by its colour: alive, shielded, rotted, or lost. */
export function paintHealth(parts: HealthGridParts, g: HealthGrid) {
    const size = cellSizeOf(parts);
    g.cells.forEach((c, i) => {
        const sprite = parts.cells[i];
        if (!sprite) return;
        const state = c.state === 'alive' ? (c.shield ? 'shield' : 'alive') : c.state === 'lost' ? 'lost' : 'rotted';
        sprite.spriteFrame = cellFrame(size, state);
    });
}

/** The cell size a grid was built with (its sprites are a little bigger: the art's margin). */
function cellSizeOf(parts: HealthGridParts): number {
    return parts.cellSize ?? 24;
}

// ---- Mini board (opponent table) ---------------------------------------------------------

/** An opponent's grid, small, anchored top-left at (x, y). Returns its size. */
export function buildMiniBoard(parent: Node, g: Grid, maxW: number, maxH: number, x: number, y: number): { node: Node; width: number; height: number } {
    const kit = UiKit.get();
    const gap = 6;
    const scale = Math.min(0.5, (maxW - gap * (g.cols - 1)) / (g.cols * CARD_W), (maxH - gap * (g.rows - 1)) / (g.rows * CARD_H));
    const w = Math.floor(CARD_W * scale), h = Math.floor(CARD_H * scale);
    const width = g.cols * w + (g.cols - 1) * gap;
    const height = g.rows * h + (g.rows - 1) * gap;
    const node = makeNode(parent, 'MiniBoard', width, height, { x, y, anchorX: 0, anchorY: 1 });
    for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
            const card = g.slots[r * g.cols + c];
            const cx = c * (w + gap) + w / 2, cy = -(r * (h + gap) + h / 2);
            if (card) makeSprite(node, `Mini ${r},${c}`, kit.cardFrame(card), w, h, { x: cx, y: cy });
            else buildSlot(node, `Empty ${r},${c}`, w, h, cx, cy);
        }
    }
    return { node, width, height };
}

/**
 * An opponent's portrait. Normal tables: their Classic face card. Bosses: their
 * King from the animated set, the same art the boss intro shows. The Updated
 * King is frame 1 of that strip, so it stands in while the strip loads.
 */
export function buildAvatar(parent: Node, name: string, avatar: Pick<Card, 'suit' | 'rank'>, boss: boolean,
    w: number, h: number, pos: { x?: number; y?: number } = {}): Sprite {
    const kit = UiKit.get();
    if (!boss) return makeSprite(parent, name, kit.classicFrame(avatar), w, h, pos);
    const king = { suit: avatar.suit, rank: 13 as Rank };
    const sprite = makeSprite(parent, name, kit.cardFrame(king), w, h, pos);
    const anim = sprite.node.addComponent(AnimatedCard);
    anim.strip = `anim/${king.suit}_13`;
    anim.randomStart = false;
    return sprite;
}
