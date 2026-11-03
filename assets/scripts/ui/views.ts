// Hands of Fate — ui/views.ts
// Small building blocks shared by the planning and fight screens:
//   CardView        a card's art, with the gold "in a hand" ring and pink "selected" ring
//   buildHandLabel  the dark panels next to rows and under columns
//   buildHealthGrid the grid of health cells
//   buildMiniBoard  an opponent's table, small
// All sizes are in 1080-wide design pixels.

import { _decorator, Component, Node, Sprite, UITransform } from 'cc';
import { Card, Rank, rankLabel, SUIT_NAME } from '../core/cards';
import { Grid } from '../core/grid';
import { Hand } from '../core/evaluate';
import { HAND_INFO, HandCategory, EFFECT_NAME, EFFECT_CHARGES } from '../core/hands';
import { HealthGrid, healthCols } from '../core/health';
import { UiKit, makeNode, makeSprite, makeLabel, FONT, COLOR, caps, textWidth } from './UiKit';
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

// ---- Hand labels ------------------------------------------------------------------

export interface HandLabelParts {
    node: Node;
    /** Cooldown bar fill (the fight screen scales it). */
    fill: Node | null;
    fillWidth: number;
    /** Charge pip nodes, left to right (the fight screen greys spent ones). */
    pips: Node[];
}

/**
 * The panel beside a row. With no hand: "NO HAND" (row not full) or "–".
 * `full` = the line is full (so "–" means no pair or better).
 */
export function buildRowLabel(parent: Node, hand: Hand | null, full: boolean, w: number, h: number, x: number, y: number): HandLabelParts {
    const kit = UiKit.get();
    const node = makeSprite(parent, 'RowLabel', kit.panelDark, w, h + 6, { x, y: y - 3 }, true).node;
    const left = -w / 2 + 27;
    const top = h / 2;
    if (!hand) {
        makeLabel(node, 'None', full ? '–' : 'NO HAND', { size: FONT.label, spacing: 2, color: COLOR.dim, align: 'left', x: left, y: 3 });
        return { node, fill: null, fillWidth: 0, pips: [] };
    }
    // Title: THREE OF A KIND, or FLUSH ♥ · ×2
    const title = makeLabel(node, 'Title', caps(HAND_INFO[hand.category].name), { size: FONT.label, spacing: 2, color: COLOR.cream, align: 'left', x: left, y: top - 30 });
    if (hand.multiplier > 1) {
        let tx = left + textWidth(title) + 10;
        makeSprite(node, 'TitleIcon', kit.suitIcon(hand.suit), 18, 18, { x: tx + 9, y: top - 30 });
        tx += 26;
        makeLabel(node, 'Mult', `· ×${hand.multiplier}`, { size: FONT.label, color: COLOR.cream, align: 'left', x: tx, y: top - 30 });
    }
    // Effect line: [icon] Attack · 3.5s  ♥♥♥
    const midY = 0;
    makeSprite(node, 'Icon', kit.suitIcon(hand.suit), 27, 27, { x: left + 13, y: midY });
    const effect = makeLabel(node, 'Effect', `${EFFECT_NAME[hand.effect]} · ${cooldownText(hand.cooldown)}`, { font: 'body', size: FONT.body, color: COLOR.cream, align: 'left', x: left + 38, y: midY });
    const pips: Node[] = [];
    const charges = EFFECT_CHARGES[hand.effect];
    if (Number.isFinite(charges)) {
        let px = left + 38 + textWidth(effect) + 16;
        for (let i = 0; i < charges; i++) {
            pips.push(makeSprite(node, `Pip${i}`, kit.suitIcon(hand.suit), 24, 24, { x: px + 12, y: midY }).node);
            px += 28;
        }
    }
    // Cooldown bar (full while planning)
    const barW = w - 54;
    const barY = -h / 2 + 24;
    makeSprite(node, 'BarTrack', kit.barTrack, barW, 12, { x: 0, y: barY }, true);
    const fill = makeSprite(node, 'BarFill', kit.barFill, barW, 12, { x: -barW / 2, y: barY, anchorX: 0 }, true).node;
    return { node, fill, fillWidth: barW, pips };
}

/** The small panel under a column: PAIR / ♥ 4.0 / ♥♥♥ / bar. */
export function buildColumnLabel(parent: Node, hand: Hand | null, full: boolean, w: number, h: number, x: number, y: number): HandLabelParts {
    const kit = UiKit.get();
    const node = makeSprite(parent, 'ColLabel', kit.panelDark, w, h + 6, { x, y: y - 3 }, true).node;
    if (!hand) {
        makeLabel(node, 'None', full ? '–' : '·', { size: FONT.label, color: COLOR.dim, y: 3 });
        return { node, fill: null, fillWidth: 0, pips: [] };
    }
    const top = h / 2;
    makeLabel(node, 'Title', SHORT[hand.category], { size: FONT.labelSmall, spacing: 1, color: COLOR.cream, y: top - 24 });
    const row = makeNode(node, 'Row', 0, 0, { y: top - 52 });
    const cd = makeLabel(row, 'Cooldown', hand.cooldown.toFixed(1), { font: 'body', size: FONT.bodySmall, color: COLOR.cream, align: 'left', x: 0 });
    const total = 22 + 4 + textWidth(cd);
    makeSprite(row, 'Icon', kit.suitIcon(hand.suit), 22, 22, { x: -total / 2 + 11 });
    cd.node.setPosition(-total / 2 + 26, 0);
    const pips: Node[] = [];
    const charges = EFFECT_CHARGES[hand.effect];
    if (Number.isFinite(charges)) {
        for (let i = 0; i < charges; i++) {
            pips.push(makeSprite(node, `Pip${i}`, kit.suitIcon(hand.suit), 20, 20, { x: (i - (charges - 1) / 2) * 24, y: top - 78 }).node);
        }
    }
    const barW = w - 30;
    const barY = -h / 2 + 18;
    makeSprite(node, 'BarTrack', kit.barTrack, barW, 12, { x: 0, y: barY }, true);
    const fill = makeSprite(node, 'BarFill', kit.barFillGold, barW, 12, { x: -barW / 2, y: barY, anchorX: 0 }, true).node;
    return { node, fill, fillWidth: barW, pips };
}

// ---- Health grid --------------------------------------------------------------------

export interface HealthGridParts {
    node: Node;
    cells: Sprite[];
    width: number;
    height: number;
}

/**
 * Draws a health grid that fits inside maxW × maxH, anchored at its top-left
 * corner (x, y). Cells are at most 30 px with a 6 px gap, like the mockups.
 */
export function buildHealthGrid(parent: Node, health: HealthGrid | number, maxW: number, maxH: number, x: number, y: number): HealthGridParts {
    const kit = UiKit.get();
    const count = typeof health === 'number' ? health : health.cells.length;
    const cols = typeof health === 'number' ? healthCols(count) : health.cols;
    const rows = Math.ceil(count / cols);
    const gapRatio = 0.2;
    const pitch = Math.min(36, Math.floor(maxW / (cols - gapRatio)), Math.floor(maxH / (rows - gapRatio)));
    const size = Math.max(4, Math.round(pitch * (1 - gapRatio)));
    const width = cols * pitch - (pitch - size);
    const height = rows * pitch - (pitch - size);
    const node = makeNode(parent, 'HealthGrid', width, height, { x, y, anchorX: 0, anchorY: 1 });
    const cells: Sprite[] = [];
    for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols), c = i % cols;
        cells.push(makeSprite(node, `Cell${i}`, kit.cellAlive, size, size, { x: c * pitch + size / 2, y: -(r * pitch + size / 2) }));
    }
    return { node, cells, width, height };
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
