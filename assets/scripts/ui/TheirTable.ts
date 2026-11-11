// Hands of Fate — ui/TheirTable.ts (Stage C, decision 149)
// "View their table": a pop-up with the opponent's whole board and its medallions on
// the left, their hands (with their real cooldowns) on the right. It opens from the
// opponent panel in planning and in fights; the fight screen pauses while it's open.
// Like the other pop-ups it sits over a dimmed screen in a box filled with the room dark.

import { Node, UITransform } from 'cc';
import { Run } from '../core/run';
import { Opponent } from '../core/opponents';
import { BoardResult, Hand } from '../core/evaluate';
import { makeNode, makeLabel, makeButton, FONT } from './UiKit';
import { ButtonStyle } from './UiButton';
import { frame, INK_TEXT } from './kitC';
import { dimLayer } from './Modal';
import { BoardView } from './BoardView';
import { buildHandList, BADGE } from './table';
import { CARD_W, CARD_H } from './views';

const BOX_W = 1680, BOX_H = 940;
const BOARD_W = 980, LIST_W = 560;

/** The largest card scale at which the board and its medallions fit w x h. */
function fitScale(cols: number, rows: number, w: number, h: number): number {
    for (const s of [2, 1.5, 1, 0.75, 0.5]) {
        const gap = s >= 1.5 ? 15 : 12;
        const bw = cols * (CARD_W * s + gap) - gap + 16 + BADGE + 68;
        const bh = rows * (CARD_H * s + gap) - gap + 16 + BADGE + 64;
        if (bw <= w && bh <= h) return s;
    }
    return 0.5;
}

export function showTheirTable(host: Node, run: Run, o: Opponent, result: BoardResult, cooldownOf: (h: Hand) => number, onClose?: () => void): Node {
    const layer = dimLayer(host, 'TheirTable', 215);
    const ut = host.getComponent(UITransform)!;
    const w = Math.min(BOX_W, ut.width - 60), h = Math.min(BOX_H, ut.height - 60);
    const box = frame(layer, 'Box', w, h, {}, { closed: true, fill: 'room0', caption: o.boss ? 'HIS TABLE' : 'THEIR TABLE' });
    const left = -w / 2 + 40, top = h / 2 - 40;
    makeLabel(box, 'Name', o.name, { size: FONT.heading + 3, color: INK_TEXT.main, align: 'left', x: left + 8, y: top - 26 });

    // Their board, read-only, at the largest size that fits.
    const areaTop = top - 70, areaH = h - 70 - 80 - 40;
    const scale = fitScale(o.grid.cols, o.grid.rows, BOARD_W, areaH);
    const drag = makeNode(box, 'Drag', 0, 0);
    new BoardView(box, drag, run, {
        left, top: areaTop, width: BOARD_W, height: areaH,
        stashLeft: 0, stashTop: 0, stashWidth: 0, stashHeight: 0,
        scale, caption: o.boss ? 'HIS CARDS' : 'THEIR CARDS',
    }, { changed: () => undefined, selected: () => undefined }, null, false, { grid: o.grid, result });

    // Their hands, as on your side: tag, pip, name, effect and their own cooldown.
    const listLeft = w / 2 - 40 - LIST_W + 14;
    buildHandList(box, result.hands, listLeft, areaTop - 20, LIST_W - 28, areaH - 20, { caption: o.boss ? 'HIS HANDS' : 'THEIR HANDS', cooldownOf });

    const close = () => { if (layer.isValid) layer.destroy(); onClose?.(); };
    makeButton(box, 'Close', ButtonStyle.Cream, 'Close', 260, 84, { x: w / 2 - 40 - 130, y: -h / 2 + 40 + 42 }, close, 32);
    return layer;
}
