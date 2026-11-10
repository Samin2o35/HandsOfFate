// Hands of Fate — ui/table.ts
// The shared landscape layout of planning and fight (plan phase 2, grey boxes).
// Both screens use the same regions, so nothing jumps when a round starts:
//
//   ┌ top strip: round · phase ········ Joker ········ score · Options ┐
//   │ your hand list │      your board + badges      │ (clear) │ opponent panel │
//   │ your health    │                               │         │                │
//   │ stash (plan)   │                               │         │ actions        │
//   └────────────────┴───────────────────────────────┴─────────┴────────────────┘
//
// Everything here is a flat fill with no outline: layout first, art in phase 5.
// Sizes are 1920×1080 design pixels; very wide or tall screens keep a centred
// 1920×1200 band (see tableRegions).

import { Node, Color, Graphics, UITransform, Sprite, Rect } from 'cc';
import { Hand } from '../core/evaluate';
import { HAND_INFO, EFFECT_NAME, EFFECT_CHARGES } from '../core/hands';
import { Opponent } from '../core/opponents';
import { SUIT_COLOR_HEX, Suit } from '../core/cards';
import { BOSSES, twistText, tierNumeral } from '../core/bosses';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, FONT, COLOR } from './UiKit';
import { ButtonStyle } from './UiButton';
import { buildAvatar, cooldownText } from './views';

/** Grey-box fills. Room darks from the style guide plus two lifts. */
export const GREY = {
    room: '#16121C',
    panel: '#241E2E',
    raised: '#2F2839',
    lit: '#463C55',
    slot: '#1C1724',
    text: COLOR.cream,
    soft: COLOR.lilac,
    dim: '#6E6878',
};

/** A flat filled rectangle (no outline, no border). */
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
    /** The opponent's panel (and the Forge drawer, which covers it). */
    opponent: Region;
    /** Under the opponent panel: Start round + Forge, or the speed buttons. */
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
        // The board area stops short of the opponent panel; the gap is where projectiles fly.
        board: { left: boardLeft, top: bodyTop, width: oppLeft - 80 - boardLeft, height: bodyH },
        opponent: { left: oppLeft, top: bodyTop, width: OPP_W, height: bodyH - ACTIONS_H - 20 },
        actions: { left: oppLeft, top: bodyBottom + ACTIONS_H, width: OPP_W, height: ACTIONS_H },
    };
}

// ---- Top strip ----------------------------------------------------------------------------

export interface StripParts {
    phase: ReturnType<typeof makeLabel>;
    extra: ReturnType<typeof makeLabel>;
    /** Where the Joker will sit (phase 5); a grey box until then. */
    joker: Node;
}

/** Round and phase on the left, the Joker's spot in the middle, score and Options on the right. */
export function buildStrip(root: Node, g: TableRegions, round: number, phase: string, score: number, onOptions: () => void,
    message?: { title: string; body: string } | null): StripParts {
    const s = g.strip;
    const y = s.top - s.height / 2;
    const round_ = makeLabel(root, 'Round', `ROUND ${round}`, { size: FONT.heading + 6, spacing: 2, color: GREY.text, align: 'left', x: s.left, y });
    void round_;
    const phaseLabel = makeLabel(root, 'Phase', phase, { font: 'body', size: FONT.body, color: GREY.soft, align: 'left', x: s.left + 210, y: y - 2 });
    // The Joker's spot. It carries the last thing that happened ("Round 3 won"), his line later.
    const jw = message ? 720 : 220;
    const joker = box(root, 'JokerSpot', jw, s.height, { x: 0, y }, message ? GREY.raised : GREY.panel).node;
    if (message) {
        makeLabel(joker, 'Title', message.title, { size: FONT.label, color: GREY.text, align: 'left', x: -jw / 2 + 16, y: 14, width: jw - 32, height: 28 });
        makeLabel(joker, 'Body', message.body, { font: 'body', size: 24, color: GREY.soft, align: 'left', x: -jw / 2 + 16, y: -14, width: jw - 32, height: 28 });
    } else {
        makeLabel(joker, 'Text', 'JOKER', { size: FONT.labelSmall, spacing: 3, color: GREY.dim });
    }
    makeButton(root, 'Options', ButtonStyle.Dark, 'Options', 160, s.height, { x: s.left + s.width - 80, y }, onOptions, 27);
    const scoreRight = s.left + s.width - 190;
    makeLabel(root, 'Score', score.toLocaleString('en-US'), { size: FONT.heading + 6, color: COLOR.gold, align: 'right', x: scoreRight, y });
    const extra = makeLabel(root, 'Extra', 'SCORE', { size: FONT.labelSmall, spacing: 2, color: GREY.soft, align: 'right', x: scoreRight - 170, y });
    return { phase: phaseLabel, extra, joker };
}

// ---- Hand badges ------------------------------------------------------------------------------

export const BADGE = 64;

export interface BadgeParts {
    node: Node;
    back: Sprite;
    ring: Graphics | null;
    hand: Hand | null;
}

/**
 * The same small badge at the end of every row and under every column: the
 * hand's suit with a timer ring around it (full while planning; the fight
 * fills it). No hand: "–" when the line is full, empty when it isn't.
 */
export function buildBadge(parent: Node, name: string, hand: Hand | null, full: boolean, x: number, y: number): BadgeParts {
    const kit = UiKit.get();
    const back = box(parent, name, BADGE, BADGE, { x, y }, hand ? GREY.raised : GREY.slot);
    const node = back.node;
    if (!hand) {
        if (full) makeLabel(node, 'None', '–', { size: FONT.heading, color: GREY.dim });
        return { node, back, ring: null, hand };
    }
    makeSprite(node, 'Icon', kit.suitIcon(hand.suit), 30, 30);
    const ringNode = makeNode(node, 'Ring', BADGE, BADGE);
    const ring = ringNode.addComponent(Graphics);
    const parts = { node, back, ring, hand };
    paintBadge(parts, 1);
    return parts;
}

/** Draws the timer ring: `progress` 0..1 of the way to firing. */
export function paintBadge(b: BadgeParts, progress: number, dimmed = false) {
    const g = b.ring;
    if (!g || !b.hand || !g.isValid) return;
    g.clear();
    const r = BADGE / 2 - 6;
    g.lineWidth = 5;
    g.strokeColor = new Color().fromHEX(GREY.slot);
    g.circle(0, 0, r);
    g.stroke();
    if (dimmed || progress <= 0) return;
    g.strokeColor = new Color().fromHEX(SUIT_COLOR_HEX[b.hand.suit]);
    const start = Math.PI / 2;
    const end = start - Math.PI * 2 * Math.min(1, progress);
    // Graphics.arc draws clockwise when counterclockwise = false.
    g.arc(0, 0, r, start, end, false);
    g.stroke();
}

// ---- Your hand list ------------------------------------------------------------------------------

export interface ListEntry {
    hand: Hand;
    node: Node;
    back: Sprite;
    pips: Node[];
}

const ENTRY_GAP = 6;

/** "Row 2" / "Col 3" */
export function lineTag(h: Hand): string {
    return h.source === 'row' ? `R${h.index + 1}` : h.source === 'col' ? `C${h.index + 1}` : '';
}

/**
 * Your hands in words, one line each: R2 [♥] Two pair · Heal 4.0s ♥♥♥.
 * Leftover high cards get one summary line. Returns the entries and the y below the list.
 */
export function buildHandList(root: Node, hands: readonly Hand[], left: number, top: number, w: number, maxH: number,
    onTap?: (hand: Hand) => void): { entries: ListEntry[]; bottom: number } {
    const kit = UiKit.get();
    makeLabel(root, 'HandsTitle', 'YOUR HANDS', { size: FONT.labelSmall, spacing: 2, color: GREY.soft, align: 'left', x: left, y: top - 12 });
    const lines = hands.filter((h) => h.source !== 'leftover');
    const leftovers = hands.length - lines.length;
    const rows = lines.length + (leftovers ? 1 : 0);
    const listTop = top - 34;
    const entryH = Math.max(34, Math.min(52, Math.floor((maxH - 34) / Math.max(1, rows)) - ENTRY_GAP));
    const entries: ListEntry[] = [];
    lines.forEach((hand, i) => {
        const y = listTop - i * (entryH + ENTRY_GAP) - entryH / 2;
        const back = box(root, `Hand ${hand.id}`, w, entryH, { x: left + w / 2, y }, GREY.panel);
        const n = back.node;
        const x0 = -w / 2;
        makeLabel(n, 'Tag', lineTag(hand), { size: FONT.labelSmall, color: GREY.soft, align: 'left', x: x0 + 12 });
        makeSprite(n, 'Icon', kit.suitIcon(hand.suit), 24, 24, { x: x0 + 66 });
        makeLabel(n, 'Name', HAND_INFO[hand.category].name, { size: FONT.label, color: GREY.text, align: 'left', x: x0 + 86, width: 122, height: entryH - 8 });
        makeLabel(n, 'Effect', `${EFFECT_NAME[hand.effect]} ${cooldownText(hand.cooldown)}`, { font: 'body', size: FONT.bodySmall, color: GREY.soft, align: 'left', x: x0 + 212, width: 118, height: entryH - 8 });
        const pips: Node[] = [];
        const charges = EFFECT_CHARGES[hand.effect];
        if (Number.isFinite(charges)) {
            for (let k = 0; k < charges; k++) pips.push(makeSprite(n, `Pip${k}`, kit.suitIcon(hand.suit), 14, 14, { x: w / 2 - 12 - (charges - 1 - k) * 16 }).node);
        }
        if (onTap) n.on(Node.EventType.TOUCH_END, () => onTap(hand));
        entries.push({ hand, node: n, back, pips });
    });
    let bottom = listTop - lines.length * (entryH + ENTRY_GAP);
    if (lines.length === 0) {
        makeLabel(root, 'NoHands', 'No hands yet: fill a row or a column.', { font: 'body', size: FONT.bodySmall, color: GREY.dim, align: 'left', x: left, y: listTop - 18, width: w, height: 36 });
        bottom = listTop - 40;
    }
    if (leftovers) {
        makeLabel(root, 'Leftovers', `+ ${leftovers} card${leftovers > 1 ? 's' : ''} fire alone as high cards`, { font: 'body', size: FONT.bodySmall - 3, color: GREY.dim, align: 'left', x: left + 12, y: bottom - entryH / 2, width: w - 12, height: entryH });
        bottom -= entryH + ENTRY_GAP;
    }
    return { entries, bottom };
}

/** normal / picked (the selected card is in it) / firing. */
export function paintEntry(e: ListEntry, state: 'normal' | 'picked' | 'firing') {
    setBoxColor(e.back, state === 'firing' ? '#5C4A2E' : state === 'picked' ? GREY.lit : GREY.panel);
}

// ---- Opponent panel --------------------------------------------------------------------------------

export interface OpponentPanelParts {
    node: Node;
    /** Where their health grid goes (top-left corner and size, panel space). */
    healthArea: Region;
    /** Their hand lines by hand id (the fight lights them when they fire). */
    lines: Map<string, Sprite>;
}

/**
 * Portrait and name, their hands in words ("Flush · Heal · every 3.0s"), and room
 * for their health grid, which the caller builds (planning: full; fight: live).
 * No mini board: their cards are what you take after the round.
 */
export function buildOpponentPanel(root: Node, r: Region, o: Opponent, hands: readonly Hand[], cooldownOf: (h: Hand) => number): OpponentPanelParts {
    const kit = UiKit.get();
    const panel = box(root, 'Opponent', r.width, r.height, { x: r.left + r.width / 2, y: r.top - r.height / 2 }, GREY.panel).node;
    const x0 = -r.width / 2 + 30, y0 = r.height / 2 - 30;
    const aw = 135, ah = 189;
    buildAvatar(panel, 'Avatar', o.avatar, !!o.boss, aw, ah, { x: x0 + aw / 2, y: y0 - ah / 2 });
    const tx = x0 + aw + 30, tw = r.width / 2 - 30 - tx;
    makeLabel(panel, 'Name', o.name, { size: FONT.heading, color: GREY.text, align: 'left', x: tx, y: y0 - 18, width: tw, height: 40 });
    const sub = o.boss ? `Boss · tier ${tierNumeral(o.boss.tier)}` : 'Their table';
    makeLabel(panel, 'Sub', sub, { font: 'body', size: FONT.bodySmall, color: o.boss ? SUIT_COLOR_HEX[o.boss.suit] : GREY.soft, align: 'left', x: tx, y: y0 - 56 });

    // Their hands, beside the portrait and on down if there are many.
    const lines = new Map<string, Sprite>();
    const listed = hands.filter((h) => h.source !== 'leftover');
    const lineH = 38;
    const healthH = Math.min(290, Math.max(180, r.height * 0.36));
    const listTop = y0 - 84;
    const listBottom = -r.height / 2 + 30 + healthH + 40;
    const maxLines = Math.max(1, Math.floor((listTop - listBottom) / lineH));
    const twist = o.boss ? 2 : 0;   // the boss's twist takes two lines
    const shown = listed.slice(0, Math.max(0, maxLines - twist - (listed.length + twist > maxLines ? 1 : 0)));
    let y = listTop - lineH / 2;
    if (o.boss) {
        const info = BOSSES[o.boss.suit];
        makeLabel(panel, 'Twist', `${info.twist}: ${twistText(o.boss.suit, o.boss.tier)}`, { font: 'body', size: FONT.bodySmall - 2, color: SUIT_COLOR_HEX[o.boss.suit], align: 'left', x: tx, y: y - lineH / 2, width: r.width / 2 - 30 - tx, height: lineH * 2 - 4 });
        y -= lineH * 2;
    }
    shown.forEach((h) => {
        const lx = y > y0 - ah - 10 ? tx : x0;   // under the portrait, lines use the full width
        const lw = r.width / 2 - 30 - lx;
        const back = box(panel, `Their ${h.id}`, lw + 12, lineH - 4, { x: lx - 6 + (lw + 12) / 2, y }, GREY.panel);
        lines.set(h.id, back);
        makeSprite(panel, `Icon ${h.id}`, kit.suitIcon(h.suit), 22, 22, { x: lx + 11, y });
        makeLabel(panel, `Line ${h.id}`, `${HAND_INFO[h.category].name} · ${EFFECT_NAME[h.effect]} · every ${cooldownText(cooldownOf(h))}`,
            { font: 'body', size: FONT.bodySmall, color: GREY.text, align: 'left', x: lx + 32, y, width: lw - 32, height: lineH - 6 });
        y -= lineH;
    });
    if (listed.length > shown.length) {
        makeLabel(panel, 'More', `+${listed.length - shown.length} more`, { font: 'body', size: FONT.bodySmall, color: GREY.dim, align: 'left', x: tx, y });
    } else if (listed.length === 0) {
        makeLabel(panel, 'Highs', 'High cards only', { font: 'body', size: FONT.bodySmall, color: GREY.dim, align: 'left', x: tx, y });
    }

    // Their health: the bottom of the panel, centred.
    makeLabel(panel, 'HealthTitle', o.boss ? 'HIS HEALTH' : 'THEIR HEALTH', { size: FONT.labelSmall, spacing: 2, color: GREY.soft, align: 'left', x: x0, y: -r.height / 2 + 30 + healthH + 16 });
    return { node: panel, healthArea: { left: x0, top: -r.height / 2 + 30 + healthH, width: r.width - 60, height: healthH }, lines };
}

/** World rectangle of a node (tutorial spotlights). */
export function rectOf(n: Node): Rect { return n.getComponent(UITransform)!.getBoundingBoxToWorld(); }

export type { Suit };
