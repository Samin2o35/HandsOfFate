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
import { box, GREY } from './table';

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
        this.picking = false;
        this.build();
    }

    private pair(): [Card, Card] | null {
        const pairs = mergeablePairs(this.run.ownedCards());
        return pairs.find(([a, b]) => a.id === this.selectedId || b.id === this.selectedId) ?? pairs[0] ?? null;
    }

    private build() {
        for (const c of [...this.root.children]) { c.removeFromParent(); c.destroy(); }
        const kit = UiKit.get();
        const { w, h } = this;
        box(this.root, 'Panel', w, h, {}, GREY.panel);
        const left = -w / 2 + 24;

        // Stacked: the pair (1×) on top, the buttons in a row underneath.
        const pair = this.pair();
        const mw = 90, mh = 126;
        const cardsY = h / 2 - 24 - mh / 2;
        const usable = this.run.forgeAvailable && pair !== null;
        const reason = !this.run.forgeAvailable ? 'Used this round' : !pair ? 'Needs two identical cards' : '';
        if (reason) {
            // No pair to show (or already used): the reason takes the cards' place.
            makeLabel(this.root, 'Reason', reason, { font: 'body', size: FONT.body, color: GREY.soft, y: cardsY });
        } else if (pair) {
            makeSprite(this.root, 'CardA', kit.cardFrame(pair[0]), mw, mh, { x: -mw / 2 - 40, y: cardsY });
            makeLabel(this.root, 'Plus', '+', { size: FONT.heading, color: GREY.text, x: 0, y: cardsY });
            makeSprite(this.root, 'CardB', kit.cardFrame(pair[1]), mw, mh, { x: mw / 2 + 40, y: cardsY });
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
                const b = makeButton(this.root, `Suit ${suit}`, ButtonStyle.Cream, '', bw, bh, { x: areaLeft + bw / 2 + i * (bw + 12), y: buttonsY }, () => this.apply(pair, { kind: 'suit', suit }));
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
            const b = makeButton(this.root, text, ButtonStyle.Cream, text, bw, bh, { x: areaLeft + bw / 2 + i * (bw + 12), y: buttonsY }, fn, 27);
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
