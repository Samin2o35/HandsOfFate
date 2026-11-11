// Hands of Fate — ui/tutorialText.ts
// The Dealer's six lines (GDD "Tutorial steps"). Plain TS (no 'cc'), so tests can check
// the words and their wrapping (tests/richwrap.test.ts).

/** Colours for words in the Dealer's lines: the deck's own colours, the lighter tone where the deck has one. */
export const DEALER_WORD = {
    gold: '#FDD164', hearts: '#D47564', diamonds: '#94D2D4', spades: '#8E478C', clubs: '#309C63', red: '#C93038',
};
const w = (text: string, color: string) => `<color=${color}>${text}</color>`;

export const STEP_TEXT: Record<number, string> = {
    1: `Welcome, I'm the Dealer. This grid is your ${w('health', DEALER_WORD.gold)}: lose every cell and the run is over.`,
    2: `Every ${w('full', DEALER_WORD.gold)} row and column is a poker hand. Row 3 isn't full yet.\nDrag the ${w('10 of Clubs', DEALER_WORD.clubs)} in to finish it.`,
    3: `Suits decide what a hand does. Mixed suits? The ${w("highest card's suit", DEALER_WORD.gold)} wins, so your ${w('Jack of Spades', DEALER_WORD.spades)} makes the straight attack.`,
    4: `${w('Hearts', DEALER_WORD.hearts)} and ${w('diamonds', DEALER_WORD.diamonds)} run out: 3 uses a fight. Watch the pips.\n${w('Spades', DEALER_WORD.spades)} and ${w('clubs', DEALER_WORD.clubs)} never stop, and ${w('rotted', DEALER_WORD.clubs)} cells can't be healed.`,
    5: `Round won! Always take ${w('one of their cards', DEALER_WORD.gold)}, then pick ${w('Health', DEALER_WORD.red)}, ${w('Grid', DEALER_WORD.gold)} or ${w('Cards', DEALER_WORD.diamonds)}.`,
    6: `Round 2. Two ${w('3 of Diamonds', DEALER_WORD.diamonds)}? Merge them in the ${w('Forge', DEALER_WORD.gold)}: one card, plus an upgrade of your choice.`,
};
