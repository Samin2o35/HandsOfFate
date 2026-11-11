// Hands of Fate — ui/joker.ts
// The Joker's lines (style guide, "The Joker's voice"): sly, brief, a little rude,
// 8 words or fewer, card-room words, no exclamation marks. One line at a time, beside
// his card at the top of the table. Picks are steady (by round), not random, so a
// screen rebuild never changes what he just said.

import { Node, Label, tween, Vec3, Tween } from 'cc';

export type Moment =
    | 'newRun' | 'planning' | 'king' | 'forge'
    | 'bigHand' | 'hurt' | 'won' | 'lost' | 'take' | 'ace';

export const LINES: Record<Moment, readonly string[]> = {
    newRun: ['Sit. The cards already know you.', 'New table. Same old house.'],
    planning: ['Rows and columns. Both count.', 'Deal yourself something mean.', 'Take your time. The house waits.', 'Every line is a bet.'],
    king: ['The house sends its best.', 'A King at my table. Behave.'],
    forge: ['Two of the same? I can fix that.'],
    bigHand: ["Now that's a hand.", 'The table felt that one.', "Somebody's been practising."],
    hurt: ['House always collects.', "That one's going on your tab."],
    won: ['Not bad. Not good, either.', 'They folded. Collect.'],
    lost: ["Fate's paid. Come back when you're richer."],
    take: ["Take one of theirs. They won't miss it."],
    ace: ["An Ace. Don't let it go to your head."],
};

/** The line for a moment; `n` (a round number, a count) picks among the variants. */
export function jokerLine(m: Moment, n = 0): string {
    const pool = LINES[m];
    return pool[Math.abs(Math.floor(n)) % pool.length];
}

/**
 * Says a line in the label buildJoker made ('JokerQuote' under `root`), with a small
 * bob of his card. `hold` seconds later the line clears (0 = it stays).
 */
export function jokerSay(root: Node, text: string, hold = 0) {
    const quote = root.getChildByName('JokerQuote')?.getComponent(Label);
    if (!quote) return;
    Tween.stopAllByTarget(quote.node);
    quote.string = `“${text}”`;
    const card = root.getChildByName('Joker')?.getChildByName('Card');
    if (card) {
        Tween.stopAllByTarget(card);
        card.setPosition(0, -126, 0);
        tween(card).to(0.08, { position: new Vec3(0, -118, 0) }).to(0.16, { position: new Vec3(0, -126, 0) }, { easing: 'bounceOut' }).start();
    }
    if (hold > 0) tween(quote.node).delay(hold).call(() => { if (quote.isValid) quote.string = ''; }).start();
}
