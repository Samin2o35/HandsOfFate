// Hands of Fate — ui/parts.ts
// Pieces shared by the round won, boss intro and run over screens.

import { Node, Color } from 'cc';
import { UiKit, makeSprite, makeLabel, makeButton, makeNode, textWidth, FONT, COLOR } from './UiKit';
import { ButtonStyle } from './UiButton';

/** Score panel (left), round plaque (centre), Options (right): the mockups' top bar. */
export function buildTopBar(root: Node, score: number, title: string, subtitle: string, L: number, R: number, T: number, onOptions: () => void) {
    const kit = UiKit.get();
    const y = T - 22 - 50;
    const panel = makeSprite(root, 'ScorePanel', kit.panelDark, 195, 106, { x: L + 97, y: y - 3 }, true).node;
    makeLabel(panel, 'Title', 'SCORE', { size: FONT.labelSmall, spacing: 2, color: COLOR.cream, align: 'left', x: -75, y: 22 });
    makeLabel(panel, 'Value', score.toLocaleString('en-US'), { size: FONT.heading, color: COLOR.gold, align: 'left', x: -75, y: -14 });
    const plaqueW = Math.max(324, title.length * 30 + 80);
    const plaque = makeSprite(root, 'RoundPlaque', kit.panelCream, plaqueW, 130, { x: 0, y: y - 5 }, true).node;
    makeLabel(plaque, 'Round', title, { size: FONT.heading + 9, spacing: 2, color: COLOR.ink, y: 18 });
    makeLabel(plaque, 'Phase', subtitle, { font: 'body', size: FONT.bodySmall, color: '#3D3450', y: -22 });
    makeButton(root, 'Options', ButtonStyle.Dark, 'Options', 150, 87, { x: R - 75, y }, onOptions, 27);
}

/** A dashed separator line from x0 to x1 (like the score lines in mockups 07 and 09). */
export function dashedLine(parent: Node, x0: number, x1: number, y: number, color = '#C9C6BD') {
    const kit = UiKit.get();
    const line = makeNode(parent, 'Dashes', x1 - x0, 3, { x: (x0 + x1) / 2, y });
    for (let x = x0; x < x1; x += 14) {
        const s = makeSprite(line, 'Dash', kit.spark, Math.min(8, x1 - x), 3, { x: x - (x0 + x1) / 2 + 4 });
        s.color = new Color().fromHEX(color);
    }
    return line;
}

/** "Hands fired  27 hands ............ +415": bold name, light detail, value on the right. */
export function statRow(parent: Node, name: string, detail: string, value: string, x0: number, x1: number, y: number, valueColor = COLOR.ink) {
    const n = makeLabel(parent, 'Name', name, { size: FONT.label + 6, color: COLOR.ink, align: 'left', x: x0, y });
    if (detail) {
        makeLabel(parent, 'Detail', detail, { font: 'body', size: FONT.bodySmall + 3, color: '#3D3450', align: 'left', x: x0 + textWidth(n) + 14, y });
    }
    return makeLabel(parent, 'Value', value, { size: FONT.heading, color: valueColor, align: 'right', x: x1, y });
}

