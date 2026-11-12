// Hands of Fate — core/rules.ts
// The rule knobs phase 7 decides with playtests, in one place. The defaults are the
// game's current rules (nothing changes until a decision is made). tools/sim.ts can
// play the same seeds under another set to compare, e.g. `npm run sim -- 60 1 flush4`.

export interface RuleSet {
    /** Fewest cards a flush needs (the whole line must still share one suit). */
    minFlush: number;
    /** Fewest cards in a straight flush's run. */
    minStraightFlush: number;
    /** Extra deck rules: no two separate 3-card runs, and the spare matches no other rank. */
    strictDecks: boolean;
    /** A King's hand-point budget, as a multiple of a normal table's. */
    bossBudgetMult: number;
    /** Health cells a King gets on top of a normal table's. */
    bossExtraHealth: number;
    /** King of Spades: seconds between execution blades. */
    executionPeriod: number;
    /** Blight (King of Clubs): seconds between spreads at tier 1, and the fastest it gets. */
    blightStart: number;
    blightFloor: number;
    /** Seconds between a high card's shots (a lone card in no hand). Stage D, decision 157. */
    highCardCooldown: number;
}

export const DEFAULT_RULES: Readonly<RuleSet> = {
    minFlush: 3,
    minStraightFlush: 3,
    strictDecks: false,
    bossBudgetMult: 1.3,
    bossExtraHealth: 10,
    executionPeriod: 8,
    blightStart: 12,
    blightFloor: 6,
    highCardCooldown: 5.0,
};

/** Rule sets to compare in the sim (and to switch to once one is chosen). */
export const VARIANTS: Record<string, Partial<RuleSet>> = {
    current: {},
    /** The "4-card flush package" from the build log's deferred list. */
    flush4: { minFlush: 4, minStraightFlush: 4, strictDecks: true },
    /** Softer Kings: less budget, fewer extra cells. */
    softKings: { bossBudgetMult: 1.15, bossExtraHealth: 6 },
    /** Softer still. */
    softerKings: { bossBudgetMult: 1.1, bossExtraHealth: 4 },
    /** Only the two Kings who do the killing (♠ and ♣) slowed down. */
    fairKings: { executionPeriod: 10, blightStart: 14, blightFloor: 8 },
    /** The flush package plus fair Kings. */
    flush4FairKings: { minFlush: 4, minStraightFlush: 4, strictDecks: true, executionPeriod: 10, blightStart: 14, blightFloor: 8 },
    /** Both together. */
    flush4SoftKings: { minFlush: 4, minStraightFlush: 4, strictDecks: true, bossBudgetMult: 1.15, bossExtraHealth: 6 },
    /** High cards fire every 4.0 s (like a pair) instead of 5.0 s. */
    highCard4: { highCardCooldown: 4.0 },
    /** High cards fire every 3.5 s. */
    highCard35: { highCardCooldown: 3.5 },
};

/** The rules in force. Read at call time by the rules code. */
export const RULES: RuleSet = { ...DEFAULT_RULES };

/** Switches to a set of rules (missing keys take the defaults). */
export function useRules(r: Partial<RuleSet> | string) {
    const set = typeof r === 'string' ? VARIANTS[r] : r;
    if (!set) throw new Error(`Unknown rule set: ${r}`);
    Object.assign(RULES, DEFAULT_RULES, set);
}
