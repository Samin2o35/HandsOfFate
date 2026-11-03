// Hands of Fate — core/decks.ts
// The fixed tutorial deck (GDD "Starting deck"). The random starting decks for
// later runs are added in stage 4.

import { Card, parseCard } from './cards';
import { Grid, gridFromText } from './grid';

/**
 * The suggested opening on the 3×3 grid. Makes one hand of every suit:
 *   Row 1  5♥ 5♠ J♠   Pair of 5s  -> Heal  (5♥ first in reading order)
 *   Row 2  3♦ 3♦ 9♥   Pair of 3s  -> Armor
 *   Row 3  8♣ 8♠ 10♣  Pair of 8s  -> Rot   (8♣ first)
 *   Col 3  J♠ 9♥ 10♣  Straight 9-10-J -> Attack (J♠ is highest)
 */
export const TUTORIAL_LAYOUT = '5H 5S JS / 3D 3D 9H / 8C 8S 10C';
export const TUTORIAL_STASH = ['QH'];

/**
 * Tutorial step 2 starts with row 3 unfinished: the 10♣ waits in the stash
 * and the player drags it into the empty slot.
 */
export const TUTORIAL_STEP2_LAYOUT = '5H 5S JS / 3D 3D 9H / 8C 8S -';
export const TUTORIAL_STEP2_STASH = ['10C', 'QH'];

export interface StartingSetup {
    grid: Grid;
    stash: Card[];
}

export function tutorialSetup(step2 = false): StartingSetup {
    return {
        grid: gridFromText(step2 ? TUTORIAL_STEP2_LAYOUT : TUTORIAL_LAYOUT),
        stash: (step2 ? TUTORIAL_STEP2_STASH : TUTORIAL_STASH).map(parseCard),
    };
}
