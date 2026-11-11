// Hands of Fate — ui/richwrap.ts
// Wraps RichText ourselves (decision 135). When Cocos wraps a RichText (maxWidth > 0), it
// trims the last piece of every wrapped segment, so the space before a <color> word is
// lost ("yourhealth") and a wrapped line can start with a space (" is over."). JS trim()
// removes no-break spaces too, so those don't help.
// The Dealer speaks in VT323, a monospaced font (every glyph 0.4 em wide), so the
// lines can be broken exactly by counting characters; the RichText then gets
// maxWidth 0 and explicit "\n" breaks, and Cocos never trims anything.
// Plain TS (no 'cc'), so tests/richwrap.test.ts can check it.

/** VT323's advance width, in em. */
export const VT323_ADVANCE = 0.4;

/** How many VT323 characters fit in `width` px at `fontSize` (one spare, for rounding). */
export function monoColumns(width: number, fontSize: number, advance = VT323_ADVANCE): number {
    return Math.max(1, Math.floor(width / (fontSize * advance)) - 1);
}

/**
 * Breaks rich text into lines of at most `cols` visible characters, at spaces, by turning
 * the chosen spaces into "\n". Tags (<color=…>, </color>) take no room. Existing "\n"
 * are kept. A word longer than a line stays whole on its own line.
 */
export function wrapRich(text: string, cols: number): string {
    const out = text.split('');
    let col = 0;
    let lastSpace = -1;          // index in `out` of the last space on this line
    let colAtSpace = 0;          // visible column just after that space
    for (let i = 0; i < out.length; i++) {
        const ch = out[i];
        if (ch === '<') {        // skip a tag
            const end = text.indexOf('>', i);
            if (end > i) { i = end; continue; }
        }
        if (ch === '\n') { col = 0; lastSpace = -1; continue; }
        if (ch === ' ') { lastSpace = i; colAtSpace = col + 1; }
        col++;
        if (col > cols && lastSpace >= 0) {
            out[lastSpace] = '\n';
            col -= colAtSpace;
            lastSpace = -1;
        }
    }
    return out.join('');
}

/** The visible lines of wrapped rich text (tags removed), for measuring and tests. */
export function plainLines(text: string): string[] {
    return text.replace(/<[^>]+>/g, '').split('\n');
}
