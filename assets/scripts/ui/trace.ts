// Hands of Fate — ui/trace.ts (Stage D, decision 154)
// A charging outline round a box (a hand line, a card): as the hand charges, a 2 px line in
// its colour runs from the bottom centre up both sides and meets at the top, over a dark
// ink track (like the card borders in the reference targetRef.gif). Drawn from thin strips
// of the shared white square (kitC.whiteFrame), so it needs no textures of its own, moves
// smoothly and batches with the other white pieces. The medallions use a pixel ring instead
// (kitC.traceRingFrame).

import { Node, Sprite, UITransform, Color, UIOpacity } from 'cc';
import { whiteFrame, inkOutlineFrame } from './kitC';
import { makeNode, makeSprite } from './UiKit';

const T = 2; // line thickness, screen px

export class Trace {
    readonly node: Node;
    private lit: Sprite[] = [];
    private shown = -1;
    private color = '';

    /** An outline w x h centred in `parent` at (x, y). track = false draws no ink track. */
    constructor(parent: Node, name: string, private w: number, private h: number, x = 0, y = 0, track = true) {
        this.node = makeNode(parent, name, w, h, { x, y });
        if (track) {
            // The ink track: one 9-sliced hollow rectangle.
            const t = makeSprite(this.node, 'Track', inkOutlineFrame(), w, h);
            t.type = Sprite.Type.SLICED;
        }
        // Six lit strips: bottom-left, bottom-right, left, right, top-left, top-right.
        for (let i = 0; i < 6; i++) this.lit.push(makeSprite(this.node, `Lit${i}`, whiteFrame(), 0, 0));
        this.set(0, '#FFFFFF');
    }

    /** progress 0..1 of the way round; the colour of the hand. Only touches sprites when something changed. */
    set(progress: number, hexColor: string) {
        const p = Math.max(0, Math.min(1, progress));
        const q = Math.round(p * 200); // 0.5 % steps are invisible; skip the rest
        if (q === this.shown && hexColor === this.color) return;
        if (hexColor !== this.color) {
            this.color = hexColor;
            const c = new Color().fromHEX(hexColor);
            for (const s of this.lit) s.color = c;
        }
        this.shown = q;
        const w = this.w, h = this.h, half = w / 2 + h + w / 2;
        let L = p * half;
        const bottom = Math.min(L, w / 2); L -= bottom;
        const side = Math.min(L, h); L -= side;
        const top = Math.min(L, w / 2);
        const place = (s: Sprite, sw: number, sh: number, x: number, y: number) => {
            const on = sw > 0.5 && sh > 0.5;
            s.enabled = on;
            if (!on) return;
            s.node.getComponent(UITransform)!.setContentSize(Math.round(sw), Math.round(sh));
            s.node.setPosition(Math.round(x), Math.round(y), 0);
        };
        const yB = -h / 2 + T / 2, yT = h / 2 - T / 2, xL = -w / 2 + T / 2, xR = w / 2 - T / 2;
        place(this.lit[0], bottom, T, -bottom / 2, yB);
        place(this.lit[1], bottom, T, bottom / 2, yB);
        place(this.lit[2], T, side, xL, -h / 2 + side / 2);
        place(this.lit[3], T, side, xR, -h / 2 + side / 2);
        place(this.lit[4], top, T, -w / 2 + top / 2, yT);
        place(this.lit[5], top, T, w / 2 - top / 2, yT);
    }

    set visible(on: boolean) { this.node.active = on; }

    /** Dims the whole outline (a spent hand). */
    dim(on: boolean) {
        const op = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
        op.opacity = on ? 90 : 255;
    }
}
