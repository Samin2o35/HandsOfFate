// Hands of Fate — ui/table.ts
// The shared landscape layout of planning and fight, in the open-table style
// (plan phase 5; mockups in build/mockups_c). Both screens use the same regions,
// so nothing jumps when a round starts:
//
//   [ROUND 5 Planning]            Joker's card            [SCORE 18,450][Options]
//   ┌ YOUR HANDS ─────   ┌ YOUR TABLE ──────────┐        ┌ ACROSS THE TABLE ──────
//   │ R1 ♠ Pair  Attack  │  cards  · medallions │        │ portrait, their hands,
//   ┌ YOUR HEALTH ────   │                      │        │ their health  20 / 20
//   ┌ STASH ──────────   └──────────────────────┘        [Forge][START ROUND]
//
// No panels: cream frame rails from the cards (ui/kitC.ts) drawn on the smoke.
// Sizes are 1920×1080 design pixels; very wide or tall screens keep a centred
// 1920×1200 band (see tableRegions).

import { Node, UITransform, Sprite, Rect, Label, Mask, Color } from 'cc';
import { Hand } from '../core/evaluate';
import { HAND_INFO, EFFECT_NAME, EFFECT_CHARGES } from '../core/hands';
import { Opponent } from '../core/opponents';
import { SUIT_COLOR_HEX, Suit } from '../core/cards';
import { HealthGrid, healthCols } from '../core/health';
import { BOSSES, twistText, tierNumeral } from '../core/bosses';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, textWidth } from './UiKit';
import { ButtonStyle } from './UiButton';
import { buildAvatar, cooldownText, buildHealthGrid, HealthGridParts } from './views';
import { frame, rule, ringFrame, medallionFrame, INK_TEXT } from './kitC';

/** Text colours of the open table (kept under the old name for the screens that use it). */
export const GREY = {
    text: INK_TEXT.main,
    soft: INK_TEXT.second,
    dim: INK_TEXT.quiet,
    room: '#16121C',
    panel: '#241E2E',
    raised: '#2F2839',
    lit: '#463C55',
    slot: '#1C1724',
};

/** A flat filled rectangle (only the tutorial dim and a few overlays still use one). */
export function box(parent: Node, name: string, w: number, h: number, at: { x?: number; y?: number; anchorX?: number; anchorY?: number }, color: string): Sprite {
    const s = makeSprite(parent, name, UiKit.get().spark, w, h, at);
    s.color = new Color().fromHEX(color);
    return s;
}

export function setBoxColor(s: Sprite | null, color: string) {
    if (s?.isValid) s.color = new Color().fromHEX(color);
}

// ---- Regions --------------------------------------------------------------------------

export interface Region { left: number; top: number; width: number; height: number; }

export interface TableRegions {
    W: number; H: number;
    L: number; R: number; T: number; B: number;
    /** Round, Joker, score, Options. */
    strip: Region;
    /** Your hand list, your health and the stash, stacked. */
    side: Region;
    /** The board and its badges. */
    board: Region;
    /** The opponent (and the Forge drawer, which takes its place). */
    opponent: Region;
    /** Under the opponent: Start round + Forge, or the speed buttons. */
    actions: Region;
}

const PAD = 40;
const STRIP_H = 70;
const SIDE_W = 380;
const OPP_W = 660;
const ACTIONS_H = 110;

/** The regions for a screen node of size ut (1920×1080 design; capped band on odd shapes). */
export function tableRegions(ut: UITransform): TableRegions {
    const W = Math.min(ut.width, 1920), H = Math.min(ut.height, 1200);
    const L = -W / 2 + PAD, R = W / 2 - PAD, T = H / 2, B = -H / 2;
    const stripTop = T - 20;
    const bodyTop = stripTop - STRIP_H - 20;
    const bodyBottom = B + PAD;
    const bodyH = bodyTop - bodyBottom;
    const oppLeft = R - OPP_W;
    const boardLeft = L + SIDE_W + 40;
    return {
        W, H, L, R, T, B,
        strip: { left: L, top: stripTop, width: R - L, height: STRIP_H },
        side: { left: L, top: bodyTop, width: SIDE_W, height: bodyH },
        // The board area stops short of the opponent; the gap is where projectiles fly.
        board: { left: boardLeft, top: bodyTop, width: oppLeft - 80 - boardLeft, height: bodyH },
        opponent: { left: oppLeft, top: bodyTop, width: OPP_W, height: bodyH - ACTIONS_H - 20 },
        actions: { left: oppLeft, top: bodyBottom + ACTIONS_H, width: OPP_W, height: ACTIONS_H },
    };
}

// ---- Top strip ----------------------------------------------------------------------------

export interface StripParts {
    phase: Label;
    score: Label;
}

/**
 * Round and phase in a closed rail on the left; the score in a closed rail with
 * Options beside it on the right. phaseSample = the longest text the phase will
 * show (the fight's clock), so the rail is wide enough from the start.
 */
export function buildStrip(root: Node, g: TableRegions, round: number, phase: string, score: number, onOptions: () => void,
    phaseSample?: string): StripParts {
    const y = g.T - 56;
    const left = g.L - 14;
    makeLabel(root, 'RoundWord', 'ROUND', { size: 22, color: GREY.text, align: 'left', x: g.L + 8, y });
    makeLabel(root, 'Round', String(round), { size: 53, color: GREY.text, align: 'left', x: g.L + 96, y: y + 2 });
    const phaseLabel = makeLabel(root, 'Phase', phaseSample ?? phase, { font: 'body', size: 34, color: GREY.soft, align: 'left', x: g.L + 156, y });
    const pw = textWidth(phaseLabel);
    phaseLabel.string = phase;
    const rw = Math.max(420, 170 + pw + 40);
    frame(root, 'RoundRail', rw, 72, { x: left + rw / 2, y }, { closed: true }).setSiblingIndex(0);

    const sx = g.R - 476;
    frame(root, 'ScoreRail', 320, 72, { x: sx + 160, y }, { closed: true });
    makeLabel(root, 'Extra', 'SCORE', { size: 18, color: GREY.soft, align: 'left', x: sx + 24, y });
    const scoreLabel = makeLabel(root, 'Score', score.toLocaleString('en-US'), { size: 44, color: INK_TEXT.gold, align: 'right', x: sx + 296, y: y + 2 });
    makeButton(root, 'Options', ButtonStyle.Dark, 'Options', 160, 72, { x: g.R - 80, y }, onOptions, 27);
    return { phase: phaseLabel, score: scoreLabel };
}

/**
 * The Joker's card peeking over the top of your table (cut off by the table's top
 * rail), with his line beside him: the last thing that happened ("Round 3 won").
 */
export function buildJoker(root: Node, g: TableRegions, cx: number, tableTop: number, message?: { title: string; body: string } | null): Node {
    const kit = UiKit.get();
    const top = g.T - 6;
    const visible = Math.max(20, top - tableTop);
    const x = Math.round(cx / 2) * 2;
    const holder = makeNode(root, 'Joker', 180, visible, { x, y: top, anchorY: 1 });
    holder.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    makeSprite(holder, 'Card', kit.frame('cards/updated/joker_true'), 180, 252, { y: -126 });
    if (message) {
        const mx = x + 104, mw = Math.min(500, g.R - 476 - 16 - mx);
        makeLabel(root, 'JokerTitle', message.title, { size: 21, color: GREY.text, align: 'left', x: mx, y: g.T - 42, width: mw, height: 28 });
        makeLabel(root, 'JokerLine', message.body, { font: 'body', size: 26, color: GREY.soft, align: 'left', x: mx, y: g.T - 72, width: mw, height: 30 });
    }
    return holder;
}

// ---- Hand badges ------------------------------------------------------------------------------

/** The board's slot for a badge; the medallion drawn in it is 72 across. */
export const BADGE = 64;

export interface BadgeParts {
    node: Node;
    /** The medallion's dots (the timer). */
    back: Sprite;
    pip: Sprite | null;
    hand: Hand | null;
}

/**
 * The same badge at the end of every row and under every column: the face cards'
 * round medallion, the hand's suit in the middle and 12 dots around it as the
 * timer (all lit while planning; the fight fills them). A full line with no hand
 * shows a dash; a line that isn't full shows the dots only.
 */
export function buildBadge(parent: Node, name: string, hand: Hand | null, full: boolean, x: number, y: number): BadgeParts {
    const kit = UiKit.get();
    const node = makeNode(parent, name, BADGE, BADGE, { x, y });
    const back = makeSprite(node, 'Medallion', medallionFrame(hand ? 12 : 0, !!hand || !full), 72, 72);
    const pip = hand ? makeSprite(node, 'Icon', kit.suitIcon(hand.suit), 36, 36) : null;
    return { node, back, pip, hand };
}

/** The timer: `progress` 0..1 of the way to firing; a spent hand goes dark. */
export function paintBadge(b: BadgeParts, progress: number, spent = false) {
    if (!b.hand || !b.back.isValid) return;
    b.back.spriteFrame = medallionFrame(spent ? 0 : progress * 12);
    if (b.pip) b.pip.color = new Color().fromHEX(spent ? GREY.dim : '#FFFFFF');
}

/** A firing hand's medallion lights gold. */
export function lightBadge(b: BadgeParts, on: boolean) {
    if (b.back.isValid) b.back.color = new Color().fromHEX(on ? INK_TEXT.gold : '#FFFFFF');
}

// ---- Your hand list ------------------------------------------------------------------------------

export interface ListEntry {
    hand: Hand;
    node: Node;
    /** The dotted ring round the line: gold while it fires, pink when picked. */
    back: Sprite;
    pips: Node[];
}

/** "R2" / "C3" */
export function lineTag(h: Hand): string {
    return h.source === 'row' ? `R${h.index + 1}` : h.source === 'col' ? `C${h.index + 1}` : '';
}

/**
 * YOUR HANDS: one open bracket, a line per hand (tag, pip, name, effect and timer,
 * charge pips at the right), dotted rules between, and a line for leftover high
 * cards. top = the bracket's top edge; maxH = the most it may take.
 */
export function buildHandList(root: Node, hands: readonly Hand[], left: number, top: number, w: number, maxH: number,
    onTap?: (hand: Hand) => void): { entries: ListEntry[]; bottom: number } {
    const kit = UiKit.get();
    const lines = hands.filter((h) => h.source !== 'leftover');
    const leftovers = hands.length - lines.length;
    const extra = leftovers || lines.length === 0 ? 34 : 0;
    const pitch = Math.max(40, Math.min(58, Math.floor((maxH - 44 - extra) / Math.max(1, lines.length))));
    const rowH = pitch - 6;
    const hh = lines.length * pitch + 44 + extra;
    frame(root, 'HandsFrame', w + 28, hh, { x: left - 14 + (w + 28) / 2, y: top - hh / 2 }, { caption: 'YOUR HANDS' });
    const entries: ListEntry[] = [];
    lines.forEach((hand, i) => {
        const rowTop = top - 34 - i * pitch;
        const y = rowTop - rowH / 2;
        const n = makeNode(root, `Hand ${hand.id}`, w, rowH, { x: left + w / 2, y });
        const x0 = -w / 2;
        const back = makeSprite(n, 'Ring', ringFrame(w + 8, rowH - 2, 'gold'), w + 8, rowH - 2);
        back.node.active = false;
        makeLabel(n, 'Tag', lineTag(hand), { size: 20, color: GREY.soft, align: 'left', x: x0 + 10 });
        makeSprite(n, 'Icon', kit.suitIcon(hand.suit), 27, 27, { x: x0 + 63 });
        makeLabel(n, 'Name', HAND_INFO[hand.category].name, { size: 24, color: GREY.text, align: 'left', x: x0 + 88, width: 116, height: rowH - 8 });
        makeLabel(n, 'Effect', `${EFFECT_NAME[hand.effect]} ${cooldownText(hand.cooldown)}`, { font: 'body', size: 27, color: GREY.soft, align: 'left', x: x0 + 204, width: 116, height: rowH - 8 });
        const pips: Node[] = [];
        const charges = EFFECT_CHARGES[hand.effect];
        if (Number.isFinite(charges)) {
            for (let k = 0; k < charges; k++) pips.push(makeSprite(n, `Pip${k}`, kit.suitIcon(hand.suit), 18, 18, { x: w / 2 - 3 - (charges - 1 - k) * 17 }).node);
        }
        if (i < lines.length - 1 || extra) rule(root, `Rule ${i}`, w - 12, left + 6, rowTop - pitch + 4);
        if (onTap) n.on(Node.EventType.TOUCH_END, () => onTap(hand));
        entries.push({ hand, node: n, back, pips });
    });
    const tailY = top - 34 - lines.length * pitch - 17;
    if (lines.length === 0) {
        makeLabel(root, 'NoHands', 'No hands yet: fill a row or a column.', { font: 'body', size: 26, color: GREY.dim, align: 'left', x: left + 8, y: tailY, width: w - 8, height: 30 });
    } else if (leftovers) {
        makeLabel(root, 'Leftovers', `+ ${leftovers} card${leftovers > 1 ? 's' : ''} fire alone as high cards`, { font: 'body', size: 26, color: GREY.dim, align: 'left', x: left + 8, y: tailY, width: w - 8, height: 30 });
    }
    return { entries, bottom: top - hh };
}

/** normal / picked (the selected card is in it) / firing. */
export function paintEntry(e: ListEntry, state: 'normal' | 'picked' | 'firing') {
    if (!e.back.isValid) return;
    e.back.node.active = state !== 'normal';
    const ut = e.back.node.getComponent(UITransform)!;
    if (state !== 'normal') e.back.spriteFrame = ringFrame(ut.width, ut.height, state === 'firing' ? 'gold' : 'pink');
}

// ---- Health blocks ------------------------------------------------------------------------------

export interface HealthBlock {
    grid: HealthGridParts;
    count: Label;
    total: Label;
    bottom: number;
}

/** "12 / 12" beside a grid: the living count large, the total small. */
function countLabels(root: Node, right: number, y: number, size: number, alive: number, total: number): [Label, Label] {
    const count = makeLabel(root, 'Count', String(alive), { size, color: GREY.text, align: 'right', x: right, y });
    const tot = makeLabel(root, 'Total', `/ ${total}`, { font: 'body', size: 34, color: GREY.soft, align: 'left', x: right + 8, y: y - size * 0.24 });
    return [count, tot];
}

/** YOUR HEALTH: a bracket with your cells and the count beside them. top = the bracket's top. */
export function buildHealthBlock(root: Node, left: number, top: number, w: number, health: HealthGrid | number): HealthBlock {
    const count = typeof health === 'number' ? health : health.cells.length;
    const rows = Math.ceil(count / healthCols(count));
    const h = Math.max(168, rows * 34 + 66);
    frame(root, 'HealthFrame', w + 28, h, { x: left - 14 + (w + 28) / 2, y: top - h / 2 }, { caption: 'YOUR HEALTH' });
    const grid = buildHealthGrid(root, health, 190, h - 70, left + 12, top - 40, 34, 0.12);
    const alive = typeof health === 'number' ? health : health.cells.filter((c) => c.state === 'alive').length;
    const [c, t] = countLabels(root, left + 300, top - 64, 66, alive, count);
    makeLabel(root, 'CellsLeft', 'cells left', { font: 'body', size: 28, color: GREY.soft, align: 'left', x: left + 210, y: top - 124 });
    return { grid, count: c, total: t, bottom: top - h };
}

// ---- Opponent ----------------------------------------------------------------------------------------

export interface OpponentPanelParts {
    node: Node;
    /** Their health: the grid and its count. */
    health: HealthBlock;
    /** Their hand lines by hand id: a gold ring, shown while that hand fires. */
    lines: Map<string, Node>;
    /** The portrait (boss twists fly from it). */
    avatar: Node;
}

/**
 * ACROSS THE TABLE: their portrait and name, their hands in words ("Straight ·
 * Armor · every 3.0s"), and their health with its count. No mini board: their
 * cards are what you take after the round.
 */
export function buildOpponentPanel(root: Node, r: Region, o: Opponent, hands: readonly Hand[], cooldownOf: (h: Hand) => number,
    health: HealthGrid): OpponentPanelParts {
    const kit = UiKit.get();
    const panel = makeNode(root, 'Opponent', r.width, r.height, { x: r.left + r.width / 2, y: r.top - r.height / 2 });
    frame(panel, 'Frame', r.width, r.height, {}, { caption: o.boss ? 'HIS SIDE OF THE TABLE' : 'ACROSS THE TABLE' });
    const x0 = -r.width / 2 + 30, top = r.height / 2;
    const aw = 135, ah = 189;
    const avatar = makeNode(panel, 'AvatarHolder', aw, ah, { x: x0 + aw / 2, y: top - 40 - ah / 2 });
    buildAvatar(avatar, 'Avatar', o.avatar, !!o.boss, aw, ah, {});
    const tx = x0 + aw + 30, tw = r.width / 2 - 30 - tx;
    makeLabel(panel, 'Name', o.name, { size: 34, color: GREY.text, align: 'left', x: tx, y: top - 58, width: tw, height: 44 });
    const total = health.cells.length;
    const sub = o.boss ? `Boss · tier ${tierNumeral(o.boss.tier)}  ·  ${total} cells` : `Their table  ·  ${total} cells`;
    makeLabel(panel, 'Sub', sub, { font: 'body', size: 30, color: o.boss ? SUIT_COLOR_HEX[o.boss.suit] : GREY.soft, align: 'left', x: tx, y: top - 97 });
    if (o.boss) {
        const info = BOSSES[o.boss.suit];
        makeLabel(panel, 'Twist', `${info.twist}: ${twistText(o.boss.suit, o.boss.tier)}`, { font: 'body', size: 24, color: GREY.soft, align: 'left', x: tx, y: top - 122, width: tw, anchorY: 1 });
    }

    // Their hands, as many as fit above their health.
    const lines = new Map<string, Node>();
    const listed = hands.filter((h) => h.source !== 'leftover');
    const gridRows = Math.ceil(total / healthCols(total));
    // Keep room for a few of their hands first (up to 3, plus a "+n more" line), then size the grid to what's left.
    const want = Math.min(listed.length, 3) * 50 + (listed.length > 3 ? 34 : 0);
    const fixed = 311 + 28 + 27 + 24; // list start, health title and gaps, bottom margin
    const pitch = Math.min(52, Math.max(26, Math.floor((r.height - fixed - want) / Math.max(1, gridRows))));
    const gridH = gridRows * pitch;
    const room = r.height - fixed - gridH;
    const maxLines = Math.max(1, Math.floor(room / 50));
    const shown = listed.slice(0, listed.length > maxLines ? maxLines - 1 : maxLines);
    makeLabel(panel, 'TheirHands', 'THEIR HANDS', { size: 18, color: GREY.soft, align: 'left', x: x0, y: top - 266 });
    shown.forEach((h, i) => {
        const y = top - 311 - i * 50;
        const ring = makeSprite(panel, `Their ${h.id}`, ringFrame(r.width - 44, 46, 'gold'), Math.round((r.width - 44) / 2) * 2, 46, { y }).node;
        ring.active = false;
        lines.set(h.id, ring);
        makeSprite(panel, `Icon ${h.id}`, kit.suitIcon(h.suit), 36, 36, { x: x0 + 18, y });
        makeLabel(panel, `Name ${h.id}`, HAND_INFO[h.category].name, { size: 28, color: GREY.text, align: 'left', x: x0 + 50, y, width: 200, height: 40 });
        makeLabel(panel, `Effect ${h.id}`, EFFECT_NAME[h.effect], { font: 'body', size: 32, color: GREY.soft, align: 'left', x: x0 + 260, y });
        makeLabel(panel, `Line ${h.id}`, `every ${cooldownText(cooldownOf(h))}`, { font: 'body', size: 32, color: GREY.soft, align: 'right', x: r.width / 2 - 30, y });
        rule(panel, `Rule ${h.id}`, r.width - 60, x0, y - 24);
    });
    let after = top - 311 - shown.length * 50;
    if (listed.length > shown.length) {
        makeLabel(panel, 'More', `+${listed.length - shown.length} more`, { font: 'body', size: 28, color: GREY.dim, align: 'left', x: x0, y: after + 6 });
        after -= 34;
    } else if (listed.length === 0) {
        makeLabel(panel, 'Highs', 'High cards only', { font: 'body', size: 28, color: GREY.dim, align: 'left', x: x0, y: after + 6 });
        after -= 34;
    }

    // Their health and its count.
    const hTop = after - 28;
    makeLabel(panel, 'HealthTitle', o.boss ? 'HIS HEALTH' : 'THEIR HEALTH', { size: 18, color: GREY.soft, align: 'left', x: x0, y: hTop });
    const grid = buildHealthGrid(panel, health, r.width - 300, gridH, x0, hTop - 27, pitch, 0.19);
    const alive = health.cells.filter((c) => c.state === 'alive').length;
    const [count, tot] = countLabels(panel, r.width / 2 - 90, hTop - 91, 88, alive, total);
    return { node: panel, health: { grid, count, total: tot, bottom: hTop - 27 - grid.height }, lines, avatar };
}

/** Updates a "12 / 12" count from a grid. */
export function setCount(b: HealthBlock, g: HealthGrid) {
    if (b.count.isValid) b.count.string = String(g.cells.filter((c) => c.state === 'alive').length);
}

/** World rectangle of a node (tutorial spotlights). */
export function rectOf(n: Node): Rect { return n.getComponent(UITransform)!.getBoundingBoxToWorld(); }

export type { Suit };
