// Hands of Fate — ui/BoardView.ts
// Your card grid with its hand labels, plus the stash, plus drag and drop.
//  - Tap a card to select it (pink ring); tap again to clear.
//  - Drag a card onto any slot: empty slot = move, card = swap.
//  - Drag a grid card onto the stash to take it off the board.
// Every change goes through run.moveCard(), then the screen rebuilds.

import { Node, EventTouch, UITransform, Vec2, Vec3, Rect, tween } from 'cc';
import { Sound } from '../app/Sound';
import { Run } from '../core/run';
import { Card } from '../core/cards';
import { BoardResult } from '../core/evaluate';
import { makeNode, makeLabel, FONT, COLOR } from './UiKit';
import {
    CardView, buildSlot, buildRowLabel, buildColumnLabel, cardScaleFor, CARD_W, CARD_H, HandLabelParts,
} from './views';

const DRAG_START = 12; // px of movement before a touch becomes a drag

export interface BoardCallbacks {
    /** A card was moved (its id): save and rebuild. */
    changed: (movedId?: number) => void;
    /** Selection changed (null = none). */
    selected: (card: Card | null) => void;
}

export interface BoardLayout {
    /** Board area (top-left corner, in the screen root's space). */
    left: number;
    top: number;
    width: number;
    height: number;
    /** Stash area (top-left corner) and size. */
    stashLeft: number;
    stashTop: number;
    stashWidth: number;
    stashHeight: number;
}

/** Labels built for each row and column (the fight screen updates their bars). */
export interface BoardLabels {
    rows: HandLabelParts[];
    cols: HandLabelParts[];
}

export class BoardView {
    readonly root: Node;
    readonly stash: Node;
    /** Right edge and top of the column labels, for placing the info box beside them. */
    colLabelsRight = 0;
    colLabelsTop = 0;
    colLabelsHeight = 0;
    labels: BoardLabels = { rows: [], cols: [] };

    private slots: { node: Node; row: number; col: number }[] = [];
    private views: CardView[] = [];

    /** World rectangle of a slot (tutorial spotlight). */
    slotRect(row: number, col: number): Rect | null {
        const s = this.slots.find((x) => x.row === row && x.col === col);
        return s ? worldRect(s.node) : null;
    }

    /** World rectangle of a whole row: its slots and its label. */
    rowRect(row: number): Rect | null {
        const parts = this.slots.filter((x) => x.row === row).map((x) => worldRect(x.node));
        const label = this.labels.rows[row];
        if (label) parts.push(worldRect(label.node));
        return unionRects(parts);
    }

    /** World rectangle of a whole column: its slots and its label. */
    colRect(col: number): Rect | null {
        const parts = this.slots.filter((x) => x.col === col).map((x) => worldRect(x.node));
        const label = this.labels.cols[col];
        if (label) parts.push(worldRect(label.node));
        return unionRects(parts);
    }

    /** World rectangle of the stash. */
    stashRect(): Rect { return worldRect(this.stash); }

    /** The card view for a card id (fight screen: make a hand's cards glow). */
    viewFor(cardId: number): CardView | null {
        return this.views.find((v) => v.card?.id === cardId) ?? null;
    }

    /** A little bounce on one card (just dropped or just forged). */
    pop(cardId: number) {
        const v = this.viewFor(cardId);
        if (!v) return;
        v.node.setScale(1.18, 1.18, 1);
        tween(v.node).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }

    /** Cards pop onto the board one by one (start of a round's planning). */
    dealIn() {
        Sound.play('deal');
        this.views.forEach((v, i) => {
            v.node.setScale(0, 0, 1);
            tween(v.node).delay(0.03 * i).to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        });
    }
    private drag: { view: CardView; start: Vec2; dragging: boolean; home: Node; homePos: Vec3 } | null = null;

    constructor(
        screen: Node,
        private dragLayer: Node,
        private run: Run,
        private layout: BoardLayout,
        private callbacks: BoardCallbacks,
        private selectedId: number | null,
        /** Planning lets you drag; the fight screen shows the board read-only. */
        private interactive = true,
    ) {
        this.root = makeNode(screen, 'Board', layout.width, layout.height, { x: layout.left, y: layout.top, anchorX: 0, anchorY: 1 });
        this.stash = makeNode(screen, 'Stash', Math.max(0, layout.stashWidth), Math.max(0, layout.stashHeight), { x: layout.stashLeft, y: layout.stashTop, anchorX: 0, anchorY: 1 });
        this.build();
    }

    // ---- Building ----------------------------------------------------------------

    private build() {
        const g = this.run.grid;
        const result: BoardResult = this.run.board();
        const scale = cardScaleFor(g);
        const cw = CARD_W * scale, ch = CARD_H * scale;
        const gap = scale >= 1.5 ? 15 : 12;
        const pitchX = cw + gap, pitchY = ch + gap;
        const gridW = g.cols * pitchX - gap;
        const gridH = g.rows * pitchY - gap;
        const colLabelH = 105;

        // Centre the whole block (grid + column labels) vertically in the area.
        const blockH = gridH + 15 + colLabelH;
        const top = -Math.max(0, (this.layout.height - blockH) / 2);

        const scoring = new Set<number>();
        for (const h of result.hands) if (h.source !== 'leftover') for (const pc of h.cards) scoring.add(pc.card.id);

        for (let r = 0; r < g.rows; r++) {
            for (let c = 0; c < g.cols; c++) {
                const x = 10 + c * pitchX + cw / 2;
                const y = top - (r * pitchY + ch / 2) - 10;
                const slot = buildSlot(this.root, `Slot ${r},${c}`, cw, ch, x, y);
                this.slots.push({ node: slot, row: r, col: c });
                const card = g.slots[r * g.cols + c];
                if (card) {
                    const v = CardView.create(this.root, card, cw, ch, x, y);
                    v.setInHand(scoring.has(card.id));
                    v.setSelected(card.id === this.selectedId);
                    this.hook(v);
                }
            }
        }

        // Row labels on the right.
        const labelLeft = 10 + gridW + 30;
        const labelW = Math.min(390, this.layout.width - labelLeft);
        const labelH = Math.min(120, pitchY - 24);
        this.labels.rows = result.rows.map((line, r) =>
            buildRowLabel(this.root, line.hand, line.full, labelW, labelH, labelLeft + labelW / 2, top - (r * pitchY + ch / 2) - 10));

        // Column labels below.
        const colW = Math.min(cw + gap - 6, 140);
        const colTop = top - gridH - 10 - 15;
        this.labels.cols = result.cols.map((line, c) =>
            buildColumnLabel(this.root, line.hand, line.full, colW, colLabelH - 6, 10 + c * pitchX + cw / 2, colTop - colLabelH / 2));
        this.colLabelsRight = this.layout.left + 10 + gridW;
        this.colLabelsTop = this.layout.top + colTop;
        this.colLabelsHeight = colLabelH;

        if (this.layout.stashWidth > 0) this.buildStash();
    }

    private buildStash() {
        makeLabel(this.stash, 'Title', 'STASH', { size: FONT.label, spacing: 2, color: COLOR.lilac, align: 'left', x: 0, y: -12 });
        const cards = this.run.stash;
        const w = CARD_W, h = CARD_H;
        const room = this.layout.stashWidth - w;
        const step = cards.length > 1 ? Math.min(w + 12, room / (cards.length - 1)) : 0;
        cards.forEach((card, i) => {
            const v = CardView.create(this.stash, card, w, h, w / 2 + i * step, -36 - h / 2);
            v.setSelected(card.id === this.selectedId);
            this.hook(v);
        });
        if (cards.length === 0) {
            makeLabel(this.stash, 'Empty', 'Drop cards here', { font: 'body', size: FONT.bodySmall, color: COLOR.dim, align: 'left', x: 0, y: -36 - h / 2 });
        }
    }

    // ---- Touch -------------------------------------------------------------------

    private hook(v: CardView) {
        this.views.push(v);
        if (!this.interactive) return;
        v.node.on(Node.EventType.TOUCH_START, (e: EventTouch) => this.onStart(v, e));
        v.node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => this.onMove(e));
        v.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => this.onEnd(e));
        v.node.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => this.onEnd(e));
    }

    private onStart(view: CardView, e: EventTouch) {
        this.drag = { view, start: e.getUILocation(), dragging: false, home: view.node.parent!, homePos: view.node.position.clone() };
    }

    private onMove(e: EventTouch) {
        const d = this.drag;
        if (!d) return;
        const loc = e.getUILocation();
        if (!d.dragging) {
            if (Vec2.distance(loc, d.start) < DRAG_START) return;
            d.dragging = true;
            // Lift the card above everything, keeping where it is on screen.
            const world = d.view.node.worldPosition.clone();
            d.view.node.setParent(this.dragLayer);
            d.view.node.setWorldPosition(world);
            d.view.node.setScale(1.08, 1.08, 1);
            Sound.play('card_pick');
        }
        const p = this.dragLayer.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        d.view.node.setPosition(p);
    }

    private onEnd(e: EventTouch) {
        const d = this.drag;
        this.drag = null;
        if (!d) return;
        const card = d.view.card!;
        if (!d.dragging) {
            // A tap: toggle selection.
            Sound.play('select');
            this.callbacks.selected(card.id === this.selectedId ? null : card);
            return;
        }
        const loc = e.getUILocation();
        const target = this.dropTarget(loc);
        if (target) {
            try {
                this.run.moveCard(card.id, target);
                Sound.play('card_place');
                this.callbacks.changed(card.id);
                return;
            } catch (err) {
                console.warn(err);
            }
        }
        // Nowhere useful: slide it back home.
        Sound.play('card_return');
        const node = d.view.node;
        const world = node.worldPosition.clone();
        node.setParent(d.home);
        node.setWorldPosition(world);
        tween(node).to(0.14, { position: d.homePos, scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    }

    private dropTarget(loc: Vec2): { row: number; col: number } | 'stash' | null {
        for (const s of this.slots) {
            if (worldRect(s.node).contains(loc)) return { row: s.row, col: s.col };
        }
        if (worldRect(this.stash).contains(loc)) return 'stash';
        return null;
    }
}

export function worldRect(n: Node): Rect {
    return n.getComponent(UITransform)!.getBoundingBoxToWorld();
}

/** Smallest rectangle around all of them (null for none). */
export function unionRects(rects: (Rect | null)[]): Rect | null {
    const list = rects.filter((r): r is Rect => !!r);
    if (list.length === 0) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of list) {
        x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
        x1 = Math.max(x1, r.x + r.width); y1 = Math.max(y1, r.y + r.height);
    }
    return new Rect(x0, y0, x1 - x0, y1 - y0);
}
