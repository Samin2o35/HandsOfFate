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
import { UiKit, makeNode, makeSprite } from './UiKit';
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
        const pink = makeSprite(holder, 'Selected', kit.cardFramePink, w + 22, h + 22, {}, true).node;
        makeSprite(holder, 'Art', kit.cardFrame(card), w, h);
        const gold = makeSprite(holder, 'InHand', kit.cardFrameGold, w + 10, h + 10, {}, true).node;
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
}

/** An empty card slot (dashed outline). */
export function buildSlot(parent: Node, name: string, w: number, h: number, x: number, y: number): Node {
    return makeSprite(parent, name, UiKit.get().slotFor(w), w, h, { x, y }).node;
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
}

/**
 * Draws a health grid that fits inside maxW × maxH, anchored at its top-left
 * corner (x, y). Cells are at most 36 px apart by default (maxPitch), with a 20% gap.
 */
/** Their health grid has room for bigger cells (opponent panel). */
export const THEIR_PITCH = 52;

export function buildHealthGrid(parent: Node, health: HealthGrid | number, maxW: number, maxH: number, x: number, y: number, maxPitch = 36): HealthGridParts {
    const kit = UiKit.get();
    const count = typeof health === 'number' ? health : health.cells.length;
    const cols = typeof health === 'number' ? healthCols(count) : health.cols;
    const rows = Math.ceil(count / cols);
    const gapRatio = 0.2;
    const pitch = Math.min(maxPitch, Math.floor(maxW / (cols - gapRatio)), Math.floor(maxH / (rows - gapRatio)));
    const size = Math.max(4, Math.round(pitch * (1 - gapRatio)));
    const width = cols * pitch - (pitch - size);
    const height = rows * pitch - (pitch - size);
    const node = makeNode(parent, 'HealthGrid', width, height, { x, y, anchorX: 0, anchorY: 1 });
    const cells: Sprite[] = [];
    for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        const cell = makeSprite(node, `Cell${i}`, kit.cellAlive, size, size, { x: c * pitch + size / 2, y: -(r * pitch + size / 2) });
        // Shield (♦) or rot (♣) mark on top, hidden until needed.
        const mark = makeSprite(cell.node, 'Mark', null, Math.round(size * 0.66), Math.round(size * 0.66));
        mark.node.active = false;
        cells.push(cell);
    }
    const parts = { node, cells, width, height };
    if (typeof health !== 'number') paintHealth(parts, health);
    return parts;
}

/** Shows each cell's state: alive (♦ mark if shielded), lost, or rotted (♣ mark). */
export function paintHealth(parts: HealthGridParts, g: HealthGrid) {
    const kit = UiKit.get();
    g.cells.forEach((c, i) => {
        const sprite = parts.cells[i];
        if (!sprite) return;
        sprite.spriteFrame = c.state === 'alive' ? kit.cellAlive : c.state === 'lost' ? kit.cellLost : kit.cellRotted;
        const mark = sprite.node.getChildByName('Mark')?.getComponent(Sprite);
        if (!mark) return;
        const showShield = c.state === 'alive' && c.shield;
        const showRot = c.state === 'rotted';
        mark.node.active = showShield || showRot;
        if (showShield) mark.spriteFrame = kit.suitIcon('D');
        else if (showRot) mark.spriteFrame = kit.suitIcon('C');
    });
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

/** Width/height helper for a node built by these functions. */
export function sizeOf(n: Node): { w: number; h: number } {
    const ut = n.getComponent(UITransform)!;
    return { w: ut.width, h: ut.height };
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
