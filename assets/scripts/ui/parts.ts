// Hands of Fate — ui/parts.ts
// Pieces shared by the round won, boss intro and run over screens.

import { Node } from 'cc';
import { makeLabel, makeButton, textWidth, FONT } from './UiKit';
import { ButtonStyle } from './UiButton';
import { frame, rule, INK_TEXT } from './kitC';

/** Score panel (left), round plaque (centre), Options (right): the mockups' top bar. */
export function buildTopBar(root: Node, score: number, title: string, subtitle: string, L: number, R: number, T: number, onOptions: () => void) {
    const y = T - 22 - 50;
    // Closed rails on the smoke: the score box (gold figure) and the round plaque.
    const panel = frame(root, 'ScorePanel', 196, 106, { x: L + 98, y: y - 3 }, { closed: true });
    makeLabel(panel, 'Title', 'SCORE', { size: FONT.labelSmall, spacing: 2, color: INK_TEXT.second, align: 'left', x: -75, y: 22 });
    makeLabel(panel, 'Value', score.toLocaleString('en-US'), { size: FONT.heading, color: INK_TEXT.gold, align: 'left', x: -75, y: -14 });
    const plaqueW = Math.max(324, title.length * 30 + 80);
    const plaque = frame(root, 'RoundPlaque', plaqueW, 130, { x: 0, y: y - 5 }, { closed: true });
    makeLabel(plaque, 'Round', title, { size: FONT.heading + 9, spacing: 2, color: INK_TEXT.main, y: 18 });
    makeLabel(plaque, 'Phase', subtitle, { font: 'body', size: FONT.bodySmall, color: INK_TEXT.second, y: -22 });
    makeButton(root, 'Options', ButtonStyle.Dark, 'Options', 150, 87, { x: R - 75, y }, onOptions, 27);
}

/** A dotted rule from x0 to x1 between stat rows (the deck's dotted line, room colour). */
export function dashedLine(parent: Node, x0: number, x1: number, y: number) {
    return rule(parent, 'Dashes', x1 - x0, x0, y).node;
}

/** "Hands fired  27 hands ............ +415": bold name, light detail, value on the right. */
export function statRow(parent: Node, name: string, detail: string, value: string, x0: number, x1: number, y: number, valueColor = INK_TEXT.main) {
    const n = makeLabel(parent, 'Name', name, { size: FONT.label + 6, color: INK_TEXT.main, align: 'left', x: x0, y });
    if (detail) {
        makeLabel(parent, 'Detail', detail, { font: 'body', size: FONT.bodySmall + 3, color: INK_TEXT.second, align: 'left', x: x0 + textWidth(n) + 14, y });
    }
    return makeLabel(parent, 'Value', value, { size: FONT.heading, color: valueColor, align: 'right', x: x1, y });
}

