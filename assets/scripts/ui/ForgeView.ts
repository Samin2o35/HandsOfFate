// Hands of Fate — ui/ForgeView.ts
// The Forge's pair and its three upgrades, inside the planning screen's Forge drawer.
//  - It picks a pair for you: the selected card's pair if it has one, otherwise
//    the first identical pair you own.
//  - "Change suit" swaps the three buttons for the three other suits.
//  - Once per round; greyed out with a reason when it can't be used.

import { Node } from 'cc';
import { Run } from '../core/run';
import { Card, Suit, SUITS, cardLabel } from '../core/cards';
import { ForgeUpgrade, forgeUpgrades, mergeablePairs } from '../core/forge';
import { UiKit, makeSprite, makeLabel, makeButton, makeNode, FONT } from './UiKit';
import { ButtonStyle } from './UiButton';
import { GREY } from './table';
import { ringFrame } from './kitC';
import { Sound } from '../app/Sound';

/** "7S": rank and suit, which is what makes two cards a pair. */
function kindOf(c: Card): string { return `${c.rank}${c.suit}`; }

export class ForgeView {
    readonly root: Node;
    private picking = false;

    constructor(
        parent: Node,
        private run: Run,
        private selectedId: number | null,
        x: number,
        y: number,
        private w: number,
        private h: number,
        private forged: (made: Card) => void,
    ) {
        this.root = makeNode(parent, 'Forge', w, h, { x, y });
        this.build();
    }

    /** The selected card changed: show its pair (rebuilds only the Forge). */
    setSelected(cardId: number | null) {
        if (cardId === this.selectedId) return;
        this.selectedId = cardId;
        this.pickedKind = null;
        this.picking = false;
        this.build();
    }

    /** A pair picked from the thumbnails ("7S"), which wins over the selected card's pair. */
    private pickedKind: string | null = null;

    /** One pair per kind of card (three 7♠ still make one choice). */
    private pairs(): [Card, Card][] {
        const seen = new Set<string>();
        return mergeablePairs(this.run.ownedCards()).filter(([a]) => {
            const k = kindOf(a);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }

    private pair(): [Card, Card] | null {
        const pairs = this.pairs();
        return pairs.find(([a]) => kindOf(a) === this.pickedKind)
            ?? pairs.find(([a, b]) => a.id === this.selectedId || b.id === this.selectedId) ?? pairs[0] ?? null;
    }

    private build() {
        for (const c of [...this.root.children]) { c.removeFromParent(); c.destroy(); }
        const kit = UiKit.get();
        const { w, h } = this;
        const left = -w / 2 + 24;

        // Stacked: the pair (1.5×) on top, the buttons in a row underneath.
        const pair = this.pair();
        const mw = 135, mh = 189;
        const cardsY = h / 2 - 24 - mh / 2;
        const usable = this.run.forgeAvailable && pair !== null;
        const reason = !this.run.forgeAvailable ? 'Used this round' : !pair ? 'Needs two identical cards' : '';
        if (reason) {
            // No pair to show (or already used): the reason takes the cards' place.
            makeLabel(this.root, 'Reason', reason, { font: 'body', size: FONT.body, color: GREY.soft, y: cardsY });
        } else if (pair) {
            makeSprite(this.root, 'CardA', kit.cardFrame(pair[0]), mw, mh, { x: -mw / 2 - 30, y: cardsY });
            makeLabel(this.root, 'Plus', '+', { size: 66, color: GREY.text, x: 0, y: cardsY });
            makeSprite(this.root, 'CardB', kit.cardFrame(pair[1]), mw, mh, { x: mw / 2 + 30, y: cardsY });
        }

        // More than one pair: a row of thumbnails to choose from, the chosen one ringed gold (Stage C, decision 151).
        const all = this.pairs();
        if (usable && pair && all.length > 1) {
            const tw = 45, th = 63, step = Math.min(tw + 18, Math.floor((w - 48 + 6) / all.length));
            const rowW = all.length * step - (step - tw);
            const ty = cardsY - mh / 2 - 34 - th / 2;
            makeLabel(this.root, 'PairsTitle', 'YOUR PAIRS', { size: FONT.labelSmall, color: GREY.soft, align: 'left', x: left, y: ty + th / 2 + 16 });
            all.forEach(([a], i) => {
                const x = -rowW / 2 + tw / 2 + i * step;
                const on = kindOf(a) === kindOf(pair[0]);
                const t = makeNode(this.root, `Pair ${kindOf(a)}`, tw + 12, th + 12, { x, y: ty });
                if (on) makeSprite(t, 'Ring', ringFrame(tw + 12, th + 12, 'gold'), tw + 12, th + 12);
                makeSprite(t, 'Card', kit.cardFrame(a), tw, th);
                t.on(Node.EventType.TOUCH_END, () => { Sound.play('select'); this.pickedKind = kindOf(a); this.picking = false; this.build(); });
            });
        }

        const areaLeft = left;
        const areaW = w - 48;
        const bh = 86;
        const buttonsY = -h / 2 + 24 + bh / 2;

        if (this.picking && pair) {
            const suits = SUITS.filter((s) => s !== pair[0].suit);
            const n = suits.length + 1;
            const bw = (areaW - (n - 1) * 12) / n;
            suits.forEach((suit, i) => {
                const b = makeButton(this.root, `Suit ${suit}`, ButtonStyle.Dark, '', bw, bh, { x: areaLeft + bw / 2 + i * (bw + 12), y: buttonsY }, () => this.apply(pair, { kind: 'suit', suit }));
                makeSprite(b.node, 'Icon', kit.suitIcon(suit as Suit), 36, 36, { y: 3 });
            });
            makeButton(this.root, 'Back', ButtonStyle.Dark, 'Back', bw, bh, { x: areaLeft + bw / 2 + suits.length * (bw + 12), y: buttonsY }, () => { this.picking = false; this.build(); }, 27);
            return;
        }

        const ups = pair ? forgeUpgrades(pair[0]) : [];
        const canUp = ups.some((u) => u.kind === 'rank' && u.delta === 1);
        const canDown = ups.some((u) => u.kind === 'rank' && u.delta === -1);
        const bw = (areaW - 24) / 3;
        const specs: [string, boolean, () => void][] = [
            ['Change suit', usable, () => { this.picking = true; this.build(); }],
            ['Rank +1', usable && canUp, () => this.apply(pair!, { kind: 'rank', delta: 1 })],
            ['Rank −1', usable && canDown, () => this.apply(pair!, { kind: 'rank', delta: -1 })],
        ];
        specs.forEach(([text, on, fn], i) => {
            const b = makeButton(this.root, text, ButtonStyle.Dark, text, bw, bh, { x: areaLeft + bw / 2 + i * (bw + 12), y: buttonsY }, fn, 27);
            b.interactable = on;
        });
    }

    private apply(pair: [Card, Card], upgrade: ForgeUpgrade) {
        try {
            const made = this.run.forge(pair[0].id, pair[1].id, upgrade);
            console.log(`Forge: ${cardLabel(pair[0])} + ${cardLabel(pair[1])} → ${cardLabel(made)}`);
            this.picking = false;
            this.forged(made);
        } catch (err) {
            console.warn(err);
        }
    }
}
