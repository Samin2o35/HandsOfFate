// Hands of Fate — core/bosses.ts
// The four recurring Kings (GDD "Bosses"). Every 5th round one of them appears,
// in a shuffled cycle: you meet all four before any repeats. Each twist gets one
// tier stronger per meeting (tier = number of meetings, so the first is tier 1).

import { Suit, SUIT_SYMBOL } from './cards';
import { Fight, FightEvent, FightModifier, FightSideSetup } from './fight';
import { HealthGrid, cellIndexAt, createHealthGrid } from './health';
import { Rng } from './rng';

export interface BossInfo {
    readonly suit: Suit;
    readonly name: string;
    readonly twist: string;
    readonly counter: string;
}

export const BOSSES: Record<Suit, BossInfo> = {
    S: { suit: 'S', name: 'King of Spades', twist: 'Execution', counter: '♦ Shields block blades.' },
    H: { suit: 'H', name: 'King of Hearts', twist: 'Second Wind', counter: '♣ Rotted cells can\'t be healed.' },
    C: { suit: 'C', name: 'King of Clubs', twist: 'Blight', counter: '♦ Shielded cells can\'t rot. Win fast.' },
    D: { suit: 'D', name: 'King of Diamonds', twist: 'Fortress', counter: '♠ Fast, wide hands pop shields.' },
};

// ---- Numbers per tier (GDD "Per tier" column) ------------------------------

export const EXECUTION_PERIOD = 8;
export const executionCells = (tier: number) => 1 + tier;
export const secondWindHeal = (tier: number) => 2 + 2 * tier;
export const blightPeriod = (tier: number) => Math.max(6, 12 - tier);
export const fortressShields = (tier: number) => 2 + 2 * tier;
export const fortressArmorCharges = (tier: number) => tier;

/** One sentence for the boss intro screen, for this tier. */
export function twistText(suit: Suit, tier: number): string {
    switch (suit) {
        case 'S': return `Every ${EXECUTION_PERIOD} s a blade hits your fullest health row, destroying ${executionCells(tier)} cells.`;
        case 'H': return `The first time he drops below half health, he heals ${secondWindHeal(tier)} cells. Once per fight.`;
        case 'C': return `Rotted cells on your grid spread to a neighbour every ${blightPeriod(tier)} s.`;
        case 'D': return `Starts with ${fortressShields(tier)} cells shielded and +${fortressArmorCharges(tier)} armor charges.`;
    }
}

/** "What changed since last time" line, or null on the first meeting. */
export function twistChange(suit: Suit, tier: number): string | null {
    if (tier <= 1) return null;
    const t = tier - 1;
    switch (suit) {
        case 'S': return `Blades destroy ${executionCells(tier)} cells (was ${executionCells(t)}).`;
        case 'H': return `Heals ${secondWindHeal(tier)} cells (was ${secondWindHeal(t)}).`;
        case 'C': return blightPeriod(tier) === blightPeriod(t)
            ? `Spreads every ${blightPeriod(tier)} s (already at its fastest).`
            : `Spreads every ${blightPeriod(tier)} s (was ${blightPeriod(t)} s).`;
        case 'D': return `${fortressShields(tier)} cells shielded (was ${fortressShields(t)}), +${fortressArmorCharges(tier)} armor charges (was +${fortressArmorCharges(t)}).`;
    }
}

export function tierNumeral(tier: number): string {
    return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][tier - 1] ?? String(tier);
}

export function meetingText(tier: number): string {
    const words = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
    return `${words[tier - 1] ?? `${tier}th`} meeting`;
}

export const bossLabel = (suit: Suit) => `${SUIT_SYMBOL[suit]} ${BOSSES[suit].name}`;

// ---- Boss order ------------------------------------------------------------

export interface BossCycle {
    /** Bosses still to meet in the current cycle of four. */
    queue: Suit[];
    /** How many times each King has been met. */
    meetings: Record<Suit, number>;
}

export function newBossCycle(): BossCycle {
    return { queue: [], meetings: { S: 0, H: 0, C: 0, D: 0 } };
}

/** Next boss and his tier. Changes the cycle. */
export function nextBoss(cycle: BossCycle, rng: Rng): { suit: Suit; tier: number } {
    if (cycle.queue.length === 0) cycle.queue = rng.shuffle<Suit>(['S', 'H', 'C', 'D']);
    const suit = cycle.queue.shift()!;
    cycle.meetings[suit]++;
    return { suit, tier: cycle.meetings[suit] };
}

// ---- Twists in a fight -------------------------------------------------------

/** Health grid for a boss (Fortress starts with shields). */
export function bossHealth(suit: Suit, tier: number, cells: number): HealthGrid {
    const g = createHealthGrid(cells);
    if (suit === 'D') {
        for (let i = 0; i < Math.min(fortressShields(tier), g.cells.length); i++) g.cells[i].shield = true;
    }
    return g;
}

/** Extra fight setup for the boss side (Fortress armor charges). */
export function bossSetupExtras(suit: Suit, tier: number): Pick<FightSideSetup, 'extraCharges'> {
    return suit === 'D' ? { extraCharges: { armor: fortressArmorCharges(tier) } } : {};
}

/** Fight modifiers for a boss twist (Fortress has none: it is all setup). */
export function bossModifiers(suit: Suit, tier: number): FightModifier[] {
    switch (suit) {
        case 'S': return [new Execution(tier)];
        case 'H': return [new SecondWind(tier)];
        case 'C': return [new Blight(tier)];
        case 'D': return [];
    }
}

/** ♠ Every 8 s a blade hits your health row with the most living cells. */
export class Execution implements FightModifier {
    private next = EXECUTION_PERIOD;
    constructor(readonly tier: number) {}

    nextTime(): number { return this.next; }

    act(f: Fight): FightEvent | null {
        this.next += EXECUTION_PERIOD;
        const g = f.player.health;
        let bestRow = -1, bestLiving = 0;
        for (let r = 0; r < g.rows; r++) {
            let n = 0;
            for (let c = 0; c < g.cols; c++) { const i = cellIndexAt(g, r, c); if (i >= 0 && g.cells[i].state === 'alive') n++; }
            if (n > bestLiving) { bestLiving = n; bestRow = r; }
        }
        if (bestRow < 0) return null;
        const cells: number[] = [];
        for (let c = 0; c < g.cols && cells.length < executionCells(this.tier); c++) {
            const i = cellIndexAt(g, bestRow, c);
            if (i >= 0 && g.cells[i].state === 'alive') cells.push(i);
        }
        // Blades are attacks: a shield absorbs a blade.
        return f.applyTwist('enemy', 'player', 'attack', cells, 'execution', 'Execution');
    }
}

/** ♥ The first time he drops below half health, he heals (lost cells only). */
export class SecondWind implements FightModifier {
    private used = false;
    constructor(readonly tier: number) {}

    nextTime(): number { return Infinity; }
    act(): FightEvent | null { return null; }

    afterEvent(f: Fight, e: FightEvent): FightEvent | null {
        if (this.used || e.target !== 'enemy') return null;
        const boss = f.enemy;
        if (boss.living === 0 || boss.living * 2 >= boss.startLiving) return null;
        this.used = true;
        const lost = boss.health.cells.map((c, i) => (c.state === 'lost' ? i : -1)).filter((i) => i >= 0);
        return f.applyTwist('enemy', 'enemy', 'heal', lost.slice(0, secondWindHeal(this.tier)), 'secondWind', 'Second Wind');
    }
}

/** ♣ Rotted cells on your grid spread to a neighbour. Shielded cells can't rot. */
export class Blight implements FightModifier {
    private next: number;
    constructor(readonly tier: number) { this.next = blightPeriod(tier); }

    nextTime(): number { return this.next; }

    act(f: Fight): FightEvent | null {
        this.next += blightPeriod(this.tier);
        const g = f.player.health;
        for (let i = 0; i < g.cells.length; i++) {
            const c = g.cells[i];
            if (c.state !== 'alive' || c.shield) continue;
            const touchesRot = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
                const j = cellIndexAt(g, c.row + dr, c.col + dc);
                return j >= 0 && g.cells[j].state === 'rotted';
            });
            if (touchesRot) return f.applyTwist('enemy', 'player', 'rot', [i], 'blight', 'Blight');
        }
        return null;
    }
}
