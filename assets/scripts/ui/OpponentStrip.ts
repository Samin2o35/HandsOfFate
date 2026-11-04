// Hands of Fate — ui/OpponentStrip.ts
// The dark strip at the top of the planning and fight screens (mockup 05):
// avatar, table name, their small board, their hands, their health.

import { Node } from 'cc';
import { Opponent, opponentHealth } from '../core/opponents';
import { evaluateBoard } from '../core/evaluate';
import { HealthGrid } from '../core/health';
import { UiKit, makeNode, makeSprite, makeLabel, textWidth, FONT, COLOR } from './UiKit';
import { buildMiniBoard, buildHealthGrid, shortName, cooldownText, HealthGridParts } from './views';

export interface OpponentStripParts {
    node: Node;
    health: HealthGridParts;
}

/** Builds the strip with its top-left corner at (x, y). */
export function buildOpponentStrip(parent: Node, o: Opponent, x: number, y: number, w: number, h: number, health?: HealthGrid, showAvatar = true): OpponentStripParts {
    const kit = UiKit.get();
    const node = makeNode(parent, 'Opponent', w, h, { x, y, anchorX: 0, anchorY: 1 });
    makeSprite(node, 'Panel', kit.panelDark, w, h + 6, { x: w / 2, y: -(h + 6) / 2 }, true);

    // Avatar: the Classic face card (bosses: their King). The boss intro hides it.
    const aw = 135, ah = 189;
    if (showAvatar) {
        makeSprite(node, 'Avatar', kit.classicFrame(o.avatar), aw, ah, { x: 33 + aw / 2, y: -30 - ah / 2 });
        makeLabel(node, 'AvatarLabel', o.boss ? 'BOSS' : 'OPPONENT', { size: FONT.labelSmall, spacing: 2, color: COLOR.lilac, x: 33 + aw / 2, y: -30 - ah - 24 });
    }

    // Name, then their board and their hands side by side.
    const left = showAvatar ? 33 + aw + 30 : 33;
    makeLabel(node, 'Name', showAvatar ? o.name : (o.boss ? 'HIS TABLE' : 'THEIR TABLE'), showAvatar
        ? { size: FONT.heading, color: COLOR.cream, align: 'left', x: left, y: -42 }
        : { size: FONT.labelSmall, spacing: 2, color: COLOR.lilac, align: 'left', x: left, y: -36 });
    const boardTop = -72;
    const mini = buildMiniBoard(node, o.grid, 230, h - 72 - 24, left, boardTop);

    const hands = evaluateBoard(o.grid).hands.filter((hd) => hd.source !== 'leftover');
    const listLeft = left + mini.width + 24;
    const lineH = 36;
    const maxLines = Math.floor((h - 72 - 20) / lineH);
    hands.slice(0, maxLines).forEach((hand, i) => {
        const ly = boardTop - 16 - i * lineH;
        makeSprite(node, `HandIcon${i}`, kit.suitIcon(hand.suit), 24, 24, { x: listLeft + 12, y: ly });
        const name = makeLabel(node, `Hand${i}`, shortName(hand), { size: FONT.labelSmall, spacing: 1, color: COLOR.cream, align: 'left', x: listLeft + 34, y: ly });
        makeLabel(node, `HandCd${i}`, cooldownText(hand.cooldown * o.cooldownMultiplier), { font: 'body', size: FONT.bodySmall, color: COLOR.lilac, align: 'left', x: listLeft + 34 + textWidth(name) + 12, y: ly });
    });
    if (hands.length > maxLines) {
        makeLabel(node, 'More', `+${hands.length - maxLines} more`, { font: 'body', size: FONT.bodySmall, color: COLOR.dim, align: 'left', x: listLeft, y: boardTop - 16 - maxLines * lineH });
    }
    if (hands.length === 0) {
        makeLabel(node, 'NoHands', 'High cards only', { font: 'body', size: FONT.bodySmall, color: COLOR.dim, align: 'left', x: listLeft, y: boardTop - 16 });
    }

    // Their health, top right.
    const hw = 290;
    const hx = w - 33 - hw;
    makeLabel(node, 'HealthTitle', o.boss ? 'HIS HEALTH' : 'THEIR HEALTH', { size: FONT.labelSmall, spacing: 2, color: COLOR.lilac, align: 'left', x: hx, y: -36 });
    const healthParts = buildHealthGrid(node, health ?? opponentHealth(o), hw, h - 70 - 24, hx, -58);
    return { node, health: healthParts };
}
