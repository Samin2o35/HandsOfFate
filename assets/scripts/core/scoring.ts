// Hands of Fate — core/scoring.ts
// Round score (GDD "Rewards, Forge and scoring"):
//   round = (hand points + 10·cells left + 100 if flawless + 5·seconds under par) × (1 + round/5)
// Par (game-seconds) = 25 + round, capped at 60; boss rounds get +15.
// Example from the mockup, round 7: (415 + 150 + 0 + 35) × 2.4 = 1,440.

export const PAR_BASE = 25;
export const PAR_CAP = 60;
export const PAR_BOSS_BONUS = 15;
export const POINTS_PER_CELL = 10;
export const FLAWLESS_BONUS = 100;
export const POINTS_PER_SECOND_UNDER_PAR = 5;

export function parTime(round: number, boss: boolean): number {
    return Math.min(PAR_CAP, PAR_BASE + round) + (boss ? PAR_BOSS_BONUS : 0);
}

export function roundMultiplier(round: number): number {
    return 1 + round / 5;
}

export interface RoundScoreInput {
    round: number;
    boss: boolean;
    /** Player's hands fired this fight. */
    handsFired: number;
    /** Sum of hand points over every firing. */
    handPoints: number;
    cellsLeft: number;
    cellsTotal: number;
    /** No cell lost all fight (shield pops don't count as lost). */
    flawless: boolean;
    /** Fight length in game-seconds. */
    time: number;
}

/** Every line of the round won screen (mockup 07). */
export interface RoundScore extends RoundScoreInput {
    par: number;
    secondsUnderPar: number;
    handBonus: number;
    healthBonus: number;
    flawlessBonus: number;
    timeBonus: number;
    subtotal: number;
    multiplier: number;
    total: number;
}

export function scoreRound(input: RoundScoreInput): RoundScore {
    const par = parTime(input.round, input.boss);
    // Whole seconds only: a 25.4 s win against a 32 s par is 6 seconds under.
    const secondsUnderPar = Math.max(0, Math.floor(par - input.time + 1e-9));
    const handBonus = input.handPoints;
    const healthBonus = POINTS_PER_CELL * input.cellsLeft;
    const flawlessBonus = input.flawless ? FLAWLESS_BONUS : 0;
    const timeBonus = POINTS_PER_SECOND_UNDER_PAR * secondsUnderPar;
    const subtotal = handBonus + healthBonus + flawlessBonus + timeBonus;
    const multiplier = roundMultiplier(input.round);
    return {
        ...input, par, secondsUnderPar, handBonus, healthBonus, flawlessBonus, timeBonus,
        subtotal, multiplier, total: Math.round(subtotal * multiplier),
    };
}

/** "0:25" */
export function formatTime(seconds: number): string {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
