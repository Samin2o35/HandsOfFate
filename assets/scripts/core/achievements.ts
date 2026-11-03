// Hands of Fate — core/achievements.ts
// The four Aces (GDD "Achievements"): long-term feats tracked across runs in the
// player's profile. Each shows a progress bar ("Best: 14 / 50") until earned.
// For now earning one unlocks nothing.

import { Suit } from './cards';

export type AceId = 'endless' | 'untouchable' | 'oneSuit' | 'fortune';

export interface AceDef {
    readonly id: AceId;
    readonly suit: Suit;
    readonly name: string;
    readonly goal: string;
    readonly target: number;
}

export const ACES: readonly AceDef[] = [
    { id: 'endless', suit: 'S', name: 'Endless', goal: 'Reach round 50 in a single run', target: 50 },
    { id: 'untouchable', suit: 'H', name: 'Untouchable', goal: 'Clear 10 rounds in a row without losing a single cell', target: 10 },
    { id: 'oneSuit', suit: 'C', name: 'One Suit', goal: 'Beat round 30 with only one suit on your board', target: 30 },
    { id: 'fortune', suit: 'D', name: 'Fortune', goal: 'Score 1,000,000 in one run', target: 1_000_000 },
];

export interface AceProgress { best: number; earned: boolean; }

/** Saved on the device, separate from the current run. */
export interface Profile {
    version: 1;
    runs: number;
    bestScore: number;
    bestRound: number;
    aces: Record<AceId, AceProgress>;
}

export function newProfile(): Profile {
    return {
        version: 1, runs: 0, bestScore: 0, bestRound: 0,
        aces: {
            endless: { best: 0, earned: false },
            untouchable: { best: 0, earned: false },
            oneSuit: { best: 0, earned: false },
            fortune: { best: 0, earned: false },
        },
    };
}

/** What a run has achieved so far (the run keeps this up to date). */
export interface RunProgress {
    /** Highest round reached (started). */
    round: number;
    score: number;
    /** Longest streak of flawless rounds this run. */
    bestFlawlessStreak: number;
    /** Highest round won with only one suit on the board (0 = none). */
    oneSuitRound: number;
}

/** Folds a run's progress into the profile. Returns Aces earned just now. */
export function updateProfile(p: Profile, run: RunProgress): AceId[] {
    p.bestScore = Math.max(p.bestScore, run.score);
    p.bestRound = Math.max(p.bestRound, run.round);
    const values: Record<AceId, number> = {
        endless: run.round,
        untouchable: run.bestFlawlessStreak,
        oneSuit: run.oneSuitRound,
        fortune: run.score,
    };
    const earned: AceId[] = [];
    for (const ace of ACES) {
        const prog = p.aces[ace.id];
        prog.best = Math.max(prog.best, values[ace.id]);
        if (!prog.earned && prog.best >= ace.target) {
            prog.earned = true;
            earned.push(ace.id);
        }
    }
    return earned;
}

/** The unearned Ace you're closest to (for the run over screen), or null if all are earned. */
export function closestAce(p: Profile): { ace: AceDef; best: number; fraction: number } | null {
    let best: { ace: AceDef; best: number; fraction: number } | null = null;
    for (const ace of ACES) {
        const prog = p.aces[ace.id];
        if (prog.earned) continue;
        const fraction = Math.min(1, prog.best / ace.target);
        if (!best || fraction > best.fraction) best = { ace, best: prog.best, fraction };
    }
    return best;
}
