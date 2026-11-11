// Hands of Fate — ui/BoardView.ts
// Your card grid with a hand badge at the end of every row and under every
// column (same size both ways), plus the stash, plus drag and drop.
//  - Tap a card to select it (pink ring); tap again to clear.
//  - Drag a card onto any slot: empty slot = move, card = swap.
//  - Drag a grid card onto the stash to take it off the board.
// Every change goes through run.moveCard(), then the screen rebuilds.

import { Node, EventTouch, UITransform, Vec2, Vec3, Rect, tween } from 'cc';
import { Sound } from '../app/Sound';
import { Run } from '../core/run';
import { Card } from '../core/cards';
import { BoardResult } from '../core/evaluate';
import { makeNode, makeLabel, makeButton, FONT } from './UiKit';
import { ButtonStyle } from './UiButton';
import { Grid } from '../core/grid';
import { frame, INK_TEXT } from './kitC';
import { CardView, buildSlot, cardScaleFor, CARD_W, CARD_H } from './views';
import { buildBadge, BadgeParts, BADGE, GREY } from './table';

const DRAG_START = 12; // px of movement before a touch becomes a drag

export interface BoardCallbacks {
    /** A card was moved (its id): save and rebuild. */
    changed: (movedId?: number) => void;
    /** Selection changed (null = none). */
    selected: (card: Card | null) => void;
    /** A row or column badge was tapped (its hand id, or null for a line with no hand). */
    badge?: (handId: string | null) => void;
    /** The stash strip's "All N" / "Close" tile was tapped (open or close the stash drawer). */
    stashDrawer?: () => void;
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
    /** The stash drawer, when it's open: every stash card in rows (top-left corner and size). */
    drawer?: { left: number; top: number; width: number; height: number };
    /** Card scale (default: cardScaleFor the grid). */
    scale?: number;
    /** The bracket's caption (default YOUR TABLE). */
    caption?: string;
}

/** What a board shows: yours (from the run) by default, or another table (their table pop-up). */
export interface BoardSource {
    grid: Grid;
    result: BoardResult;
}

/** Stash cards shown in the strip before the "All N" tile takes the last place (Stage C, decision 147). */
export const STASH_STRIP_CARDS = 3;

/** Badges built for each row and column (the fight screen fills their rings). */
export interface BoardBadges {
    rows: BadgeParts[];
    cols: BadgeParts[];
}

export class BoardView {
    readonly root: Node;
    readonly stash: Node;
    badges: BoardBadges = { rows: [], cols: [] };
    /** The grid block (cards + badges) in the screen root's space: left, top, width, height. */
    block = { left: 0, top: 0, width: 0, height: 0 };
    /** The top edge of the YOUR TABLE bracket, in the screen root's space (the Joker peeks over it). */
    frameTop = 0;

    private slots: { node: Node; row: number; col: number }[] = [];
    private views: CardView[] = [];

    /** World rectangle of a slot (tutorial spotlight). */
    slotRect(row: number, col: number): Rect | null {
        const s = this.slots.find((x) => x.row === row && x.col === col);
        return s ? worldRect(s.node) : null;
    }

    /** World rectangle of a whole row: its slots and its badge. */
    rowRect(row: number): Rect | null {
        const parts = this.slots.filter((x) => x.row === row).map((x) => worldRect(x.node));
        const badge = this.badges.rows[row];
        if (badge) parts.push(worldRect(badge.node));
        return unionRects(parts);
    }

    /** World rectangle of a whole column: its slots and its badge. */
    colRect(col: number): Rect | null {
        const parts = this.slots.filter((x) => x.col === col).map((x) => worldRect(x.node));
        const badge = this.badges.cols[col];
        if (badge) parts.push(worldRect(badge.node));
        return unionRects(parts);
    }

    /** World rectangle of the stash. */
    stashRect(): Rect { return worldRect(this.stash); }

    /** The card view for a card id (fight screen: make a hand's cards glow). */
    viewFor(cardId: number): CardView | null {
        return this.views.find((v) => v.card?.id === cardId) ?? null;
    }

    /** Moves the pink selection ring (no rebuild). */
    setSelected(cardId: number | null) {
        this.selectedId = cardId;
        for (const v of this.views) if (v.isValid) v.setSelected(v.card?.id === cardId);
    }

    /** Pink rings on a set of cards (a tapped hand's cards); clears the single selection. */
    highlight(cardIds: readonly number[]) {
        this.selectedId = null;
        const set = new Set(cardIds);
        for (const v of this.views) if (v.isValid) v.setSelected(!!v.card && set.has(v.card.id));
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
        source?: BoardSource,
    ) {
        this.grid = source?.grid ?? run.grid;
        this.result = source?.result ?? run.board();
        this.root = makeNode(screen, 'Board', layout.width, layout.height, { x: layout.left, y: layout.top, anchorX: 0, anchorY: 1 });
        this.stash = makeNode(screen, 'Stash', Math.max(0, layout.stashWidth), Math.max(0, layout.stashHeight), { x: layout.stashLeft, y: layout.stashTop, anchorX: 0, anchorY: 1 });
        const d = layout.drawer;
        this.drawerNode = d ? makeNode(screen, 'StashDrawer', d.width, d.height, { x: d.left, y: d.top, anchorX: 0, anchorY: 1 }) : null;
        this.build();
    }

    private grid: Grid;
    private result: BoardResult;
    private drawerNode: Node | null = null;

    // ---- Building ----------------------------------------------------------------

    private build() {
        const g = this.grid;
        const result: BoardResult = this.result;
        const scale = this.layout.scale ?? cardScaleFor(g);
        const cw = CARD_W * scale, ch = CARD_H * scale;
        const gap = scale >= 1.5 ? 15 : 12;
        const pitchX = cw + gap, pitchY = ch + gap;
        const gridW = g.cols * pitchX - gap;
        const gridH = g.rows * pitchY - gap;
        const badgeGap = 16;

        // Centre the block (grid + badges) in the area.
        const blockW = gridW + badgeGap + BADGE, blockH = gridH + badgeGap + BADGE;
        const left = Math.max(0, (this.layout.width - blockW) / 2);
        const top = -Math.max(0, (this.layout.height - blockH) / 2);
        this.block = { left: this.layout.left + left, top: this.layout.top + top, width: blockW, height: blockH };
        this.frameTop = this.block.top + 34;
        // YOUR TABLE: an open bracket round the cards and their medallions.
        frame(this.root, 'TableFrame', blockW + 68, blockH + 64, { x: left + blockW / 2, y: top + 34 - (blockH + 64) / 2 }, { caption: this.layout.caption ?? 'YOUR TABLE' });

        const scoring = new Set<number>();
        for (const h of result.hands) if (h.source !== 'leftover') for (const pc of h.cards) scoring.add(pc.card.id);

        for (let r = 0; r < g.rows; r++) {
            for (let c = 0; c < g.cols; c++) {
                const x = left + c * pitchX + cw / 2;
                const y = top - (r * pitchY + ch / 2);
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

        // The same badge at the end of each row and under each column.
        const rowX = left + gridW + badgeGap + BADGE / 2;
        this.badges.rows = result.rows.map((line, r) =>
            buildBadge(this.root, `RowBadge ${r}`, line.hand, line.full, rowX, top - (r * pitchY + ch / 2)));
        const colY = top - gridH - badgeGap - BADGE / 2;
        this.badges.cols = result.cols.map((line, c) =>
            buildBadge(this.root, `ColBadge ${c}`, line.hand, line.full, left + c * pitchX + cw / 2, colY));
        const tap = this.callbacks.badge;
        if (tap && this.interactive) {
            for (const b of [...this.badges.rows, ...this.badges.cols]) b.node.on(Node.EventType.TOUCH_END, () => tap(b.hand?.id ?? null));
        }

        if (this.layout.stashWidth > 0) this.buildStash();
    }

    /**
     * STASH: the first few cards at 1× in a strip, then an "All N" tile that opens the
     * drawer (or "Close" while it's open). With the drawer open, its cards are the ones
     * you drag; the strip and the drawer both take drops (decision 147).
     */
    private buildStash() {
        const cards = this.run.stash;
        const w = CARD_W, h = CARD_H;
        const sw = this.layout.stashWidth, sh = this.layout.stashHeight + 14;
        frame(this.stash, 'Frame', sw + 28, sh, { x: sw / 2, y: 4 - sh / 2 }, { caption: cards.length ? `STASH · ${cards.length}` : 'STASH' });
        const cy = -32 - h / 2, step = 97;
        const open = !!this.drawerNode;
        const many = cards.length > STASH_STRIP_CARDS + 1;
        const shown = open ? [] : many ? cards.slice(0, STASH_STRIP_CARDS) : cards;
        shown.forEach((card, i) => {
            const v = CardView.create(this.stash, card, w, h, 8 + w / 2 + i * step, cy);
            v.setSelected(card.id === this.selectedId);
            this.hook(v);
        });
        if ((many || open) && this.callbacks.stashDrawer) {
            const x = 8 + w / 2 + (open ? 0 : STASH_STRIP_CARDS) * step;
            const tile = makeButton(this.stash, 'StashAll', open ? ButtonStyle.Cream : ButtonStyle.Dark, '', w, h, { x, y: cy }, () => this.callbacks.stashDrawer!());
            makeLabel(tile.node, 'Top', open ? 'Close' : 'All', { size: FONT.label, color: open ? INK_TEXT.ink : GREY.text, y: 18 });
            if (!open) makeLabel(tile.node, 'Count', String(cards.length), { size: FONT.heading, color: GREY.text, y: -20 });
            if (open) makeLabel(this.stash, 'Hint', 'Drag from the drawer', { font: 'body', size: 26, color: GREY.dim, align: 'left', x: 8 + w + 16, y: cy, width: sw - w - 32, height: 60 });
        }
        if (cards.length === 0) {
            makeLabel(this.stash, 'Empty', 'Drop cards here', { font: 'body', size: 27, color: GREY.dim, align: 'left', x: 16, y: cy });
        }
        if (this.drawerNode) this.buildDrawer(cards);
    }

    /** YOUR STASH drawer: every stash card in rows, at the largest size that fits (1×, 0.75×, 0.5×). */
    private buildDrawer(cards: readonly Card[]) {
        const d = this.layout.drawer!, node = this.drawerNode!;
        frame(node, 'Frame', d.width, d.height, { x: d.width / 2, y: -d.height / 2 }, { caption: `YOUR STASH · ${cards.length}` });
        const pad = 30, top = 50, bottom = 130;
        const areaW = d.width - pad * 2, areaH = d.height - top - bottom;
        let scale = 0.5, perRow = 1;
        for (const s of [1, 0.75, 0.5]) {
            const gap = 12 * s + 4;
            perRow = Math.max(1, Math.floor((areaW + gap) / (CARD_W * s + gap)));
            if (Math.ceil(cards.length / perRow) * (CARD_H * s + gap) - gap <= areaH) { scale = s; break; }
            scale = s;
        }
        const cw = CARD_W * scale, ch = CARD_H * scale, gap = 12 * scale + 4;
        cards.forEach((card, i) => {
            const r = Math.floor(i / perRow), c = i % perRow;
            const v = CardView.create(node, card, cw, ch, pad + cw / 2 + c * (cw + gap), -top - ch / 2 - r * (ch + gap));
            v.setSelected(card.id === this.selectedId);
            this.hook(v);
        });
        if (cards.length === 0) makeLabel(node, 'Empty', 'The stash is empty.', { font: 'body', size: 30, color: GREY.dim, align: 'left', x: pad, y: -top - 30 });
        makeLabel(node, 'Tip', 'Drag a card onto your table.', { font: 'body', size: 27, color: GREY.soft, align: 'left', x: pad, y: -d.height + 80, width: d.width - pad * 2 - 230, height: 60 });
        if (this.callbacks.stashDrawer) {
            makeButton(node, 'Close', ButtonStyle.Cream, 'Close', 200, 80, { x: d.width - pad - 100, y: -d.height + 70 }, () => this.callbacks.stashDrawer!(), 30);
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
        if (this.drawerNode && worldRect(this.drawerNode).contains(loc)) return 'stash';
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
