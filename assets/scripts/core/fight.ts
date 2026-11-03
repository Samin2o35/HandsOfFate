// Hands of Fate — core/fight.ts
// The auto-battle. Every hand fires on its own cooldown, in game-seconds, until
// one side has no living cells. The UI drives it with fight.advance(realDt * speed)
// and animates the events it returns; tests call fight.runToEnd().
//
// Rules (GDD "Fights and the health grid", "Suits and effects"):
//  - A hand first fires after one full cooldown, then every cooldown after that.
//  - Attack and rot hit the other side; heal and armor land on your own grid.
//  - Heal and armor have 3 charges per hand per fight; attack and rot never run out.
//  - Flush doubles its effect: the pattern is applied twice (one charge).
//  - Heal/armor with nothing to do wait at "ready" and fire the moment they
//    have a target, without wasting a charge.
//  - Same instant: player hands go first, then the opponent's, each in hand
//    order, then boss twists.
//  - The fight ends the instant a side has no living cells.
// Boss twists plug in as FightModifiers (see bosses.ts).

import { Hand } from './evaluate';
import { EFFECT_CHARGES, HAND_INFO, HandCategory, Effect } from './hands';
import { HealthGrid, createHealthGrid, livingCount, isDead } from './health';
import { pickTargets, applyEffect } from './patterns';

export type SideId = 'player' | 'enemy';

export interface FightSideSetup {
    readonly hands: readonly Hand[];
    /** Number of health cells (used if `health` isn't given). */
    readonly healthCells?: number;
    /** A ready-made health grid (e.g. with pre-shielded cells for a boss). Used as is. */
    readonly health?: HealthGrid;
    /** Multiplies every cooldown (0.9 = 10% faster). Late-round opponents use this. */
    readonly cooldownMultiplier?: number;
    /** Extra charges per heal / armor hand (boss twists). */
    readonly extraCharges?: { heal?: number; armor?: number };
}

export interface HandState {
    readonly hand: Hand;
    readonly side: SideId;
    /** Cooldown after the side's multiplier. */
    readonly cooldown: number;
    /** Game time of the next firing (Infinity while waiting or spent). */
    nextFire: number;
    lastFire: number;
    /** Infinity for attack and rot. */
    charges: number;
    /** Heal/armor ready but with nothing to do. */
    waiting: boolean;
    timesFired: number;
}

export interface FightEvent {
    readonly time: number;
    /** Who caused it. */
    readonly side: SideId;
    /** Whose grid it landed on. */
    readonly target: SideId;
    /** A hand firing, or a boss twist. */
    readonly kind: 'hand' | 'twist';
    /** The hand that fired (null for twists). */
    readonly hand: Hand | null;
    /** Hand id, or the twist id ("execution", "secondWind", "blight"). */
    readonly sourceId: string;
    readonly effect: Effect;
    /** "Pair 8s", "Execution", ... */
    readonly label: string;
    /** Every cell the pattern covered (for the hit flash). */
    readonly area: readonly number[];
    /** Cells that actually changed. */
    readonly cells: readonly number[];
    /** Charges left on this hand after firing (Infinity for attack/rot and twists). */
    readonly chargesLeft: number;
}

/** A boss twist or other rule that acts during a fight. */
export interface FightModifier {
    /** Next game time it acts on its own (Infinity = never). */
    nextTime(f: Fight): number;
    /** Acts at nextTime; returns an event if anything changed. */
    act(f: Fight): FightEvent | null;
    /** Runs after every event, for triggers (e.g. Second Wind). */
    afterEvent?(f: Fight, e: FightEvent): FightEvent | null;
}

export interface SideStats {
    handsFired: number;
    /** Sum of hand points of every firing: the "hand points" in the round score. */
    handPointsFired: number;
    /** Strongest hand category that fired, or null. */
    bestHand: HandCategory | null;
    /** Cells this side destroyed or rotted on the other side (shield pops not counted). */
    damageDealt: number;
    healed: number;
    shieldsAdded: number;
}

export class FightSide {
    readonly id: SideId;
    readonly health: HealthGrid;
    readonly hands: HandState[];
    readonly stats: SideStats = {
        handsFired: 0, handPointsFired: 0, bestHand: null, damageDealt: 0, healed: 0, shieldsAdded: 0,
    };
    /** Living cells at the start (for "cells left" and "flawless"). */
    readonly startLiving: number;

    constructor(id: SideId, setup: FightSideSetup) {
        this.id = id;
        this.health = setup.health ?? createHealthGrid(setup.healthCells ?? 1);
        this.startLiving = livingCount(this.health);
        const mult = setup.cooldownMultiplier ?? 1;
        this.hands = setup.hands.map((hand) => {
            const extra = hand.effect === 'heal' ? setup.extraCharges?.heal ?? 0
                : hand.effect === 'armor' ? setup.extraCharges?.armor ?? 0 : 0;
            const cooldown = hand.cooldown * mult;
            return {
                hand, side: id, cooldown,
                nextFire: cooldown, lastFire: 0,
                charges: EFFECT_CHARGES[hand.effect] + extra,
                waiting: false, timesFired: 0,
            };
        });
    }

    get living(): number { return livingCount(this.health); }
}

export interface FightOptions {
    /** Safety stop in game-seconds; reaching it ends the fight as a loss. */
    readonly maxTime?: number;
    /** Boss twists. */
    readonly modifiers?: readonly FightModifier[];
}

export class Fight {
    time = 0;
    over = false;
    winner: SideId | null = null;
    endReason: 'killed' | 'timeout' | null = null;
    readonly player: FightSide;
    readonly enemy: FightSide;
    readonly maxTime: number;
    readonly modifiers: readonly FightModifier[];

    constructor(player: FightSideSetup, enemy: FightSideSetup, options: FightOptions = {}) {
        this.player = new FightSide('player', player);
        this.enemy = new FightSide('enemy', enemy);
        this.maxTime = options.maxTime ?? 3600;
        this.modifiers = options.modifiers ?? [];
    }

    side(id: SideId): FightSide { return id === 'player' ? this.player : this.enemy; }
    other(id: SideId): FightSide { return id === 'player' ? this.enemy : this.player; }

    /** 0..1 fill for a hand's cooldown bar. Waiting hands show full. */
    progress(h: HandState): number {
        if (h.charges <= 0) return 0;
        if (h.waiting) return 1;
        return Math.min(1, Math.max(0, (this.time - h.lastFire) / h.cooldown));
    }

    /** Moves the fight forward by dt game-seconds; returns what happened, in order. */
    advance(dt: number): FightEvent[] {
        const events: FightEvent[] = [];
        if (this.over) return events;
        const until = this.time + dt;
        for (;;) {
            const hand = this.nextHand();
            const mod = this.nextModifier();
            const handTime = hand ? hand.nextFire : Infinity;
            const modTime = mod ? mod.time : Infinity;
            const at = Math.min(handTime, modTime);
            if (at > until) break;
            this.time = Math.max(this.time, at);
            // Hands win ties with twists.
            const event = handTime <= modTime + 1e-9 ? this.fire(hand!) : mod!.mod.act(this);
            if (event && this.afterChange(event, events)) return events;
        }
        this.time = until;
        if (this.time >= this.maxTime) this.end('enemy', 'timeout');
        return events;
    }

    /** Runs the whole fight at once (tests, previews). */
    runToEnd(): FightEvent[] {
        const events: FightEvent[] = [];
        while (!this.over) {
            const hand = this.nextHand();
            const mod = this.nextModifier();
            const at = Math.min(hand ? hand.nextFire : Infinity, mod ? mod.time : Infinity);
            const step = Number.isFinite(at) ? Math.max(0, at - this.time) : this.maxTime;
            events.push(...this.advance(Math.min(step, this.maxTime - this.time) + 1e-9));
        }
        return events;
    }

    /**
     * Applies an effect from outside a hand (boss twists) and records it.
     * Returns the event, or null if no cell changed.
     */
    applyTwist(side: SideId, target: SideId, effect: Effect, cells: readonly number[], id: string, label: string): FightEvent | null {
        const grid = this.side(target).health;
        const stats = this.side(side).stats;
        const changed = cells.filter((i) => {
            const c = grid.cells[i];
            if (effect === 'heal') return c.state === 'lost';
            if (effect === 'armor') return c.state === 'alive' && !c.shield;
            return c.state === 'alive';
        });
        if (changed.length === 0) return null;
        for (const i of changed) {
            const c = grid.cells[i];
            if (effect === 'heal') stats.healed++;
            else if (effect === 'armor') stats.shieldsAdded++;
            else if (!c.shield) stats.damageDealt++;
        }
        applyEffect(grid, effect, changed);
        return {
            time: this.time, side, target, kind: 'twist', hand: null, sourceId: id, effect, label,
            area: [...cells], cells: changed, chargesLeft: Infinity,
        };
    }

    // -----------------------------------------------------------------------

    /** Records an event, runs triggers, wakes waiting hands. True if the fight ended. */
    private afterChange(event: FightEvent, events: FightEvent[]): boolean {
        events.push(event);
        if (this.checkEnd()) return true;
        for (const m of this.modifiers) {
            const extra = m.afterEvent?.(this, event);
            if (extra) {
                events.push(extra);
                if (this.checkEnd()) return true;
            }
        }
        this.wakeWaiting();
        return false;
    }

    /** Earliest hand to fire; ties: player first, then hand order. */
    private nextHand(): HandState | null {
        let best: HandState | null = null;
        for (const h of [...this.player.hands, ...this.enemy.hands]) {
            if (h.charges <= 0 || h.waiting) continue;
            if (!best || h.nextFire < best.nextFire - 1e-9) best = h;
        }
        return best;
    }

    private nextModifier(): { mod: FightModifier; time: number } | null {
        let best: { mod: FightModifier; time: number } | null = null;
        for (const mod of this.modifiers) {
            const t = mod.nextTime(this);
            if (Number.isFinite(t) && (!best || t < best.time - 1e-9)) best = { mod, time: t };
        }
        return best;
    }

    private fire(h: HandState): FightEvent | null {
        const me = this.side(h.side);
        const targetSide = h.hand.effect === 'attack' || h.hand.effect === 'rot' ? this.other(h.side) : me;
        const area: number[] = [];
        const changed: number[] = [];
        for (let i = 0; i < h.hand.multiplier; i++) {
            const pick = pickTargets(targetSide.health, h.hand.pattern, h.hand.effect);
            if (pick.cells.length === 0) break;
            area.push(...pick.area);
            changed.push(...pick.cells);
            this.count(me.stats, h, targetSide.health, pick.cells);
            applyEffect(targetSide.health, h.hand.effect, pick.cells);
        }

        if (changed.length === 0) {
            // Heal/armor with nothing to do: hold at ready, keep the charge.
            if (h.hand.effect === 'heal' || h.hand.effect === 'armor') {
                h.waiting = true;
                h.nextFire = Infinity;
            } else {
                h.lastFire = this.time;
                h.nextFire = this.time + h.cooldown;
            }
            return null;
        }

        h.charges -= Number.isFinite(h.charges) ? 1 : 0;
        h.timesFired++;
        h.lastFire = this.time;
        h.nextFire = h.charges > 0 ? this.time + h.cooldown : Infinity;
        me.stats.handsFired++;
        me.stats.handPointsFired += h.hand.points;
        const best = me.stats.bestHand;
        if (!best || HAND_INFO[h.hand.category].strength > HAND_INFO[best].strength) me.stats.bestHand = h.hand.category;

        return {
            time: this.time, side: h.side, target: targetSide.id, kind: 'hand', hand: h.hand,
            sourceId: h.hand.id, effect: h.hand.effect, label: h.hand.label,
            area: [...new Set(area)], cells: [...new Set(changed)], chargesLeft: h.charges,
        };
    }

    private count(stats: SideStats, h: HandState, g: HealthGrid, cells: number[]) {
        for (const i of cells) {
            const c = g.cells[i];
            if (h.hand.effect === 'heal') stats.healed++;
            else if (h.hand.effect === 'armor') stats.shieldsAdded++;
            else if (!c.shield) stats.damageDealt++;
        }
    }

    /** After anything changes, waiting heal/armor hands check again right away. */
    private wakeWaiting() {
        for (const h of [...this.player.hands, ...this.enemy.hands]) {
            if (h.waiting && h.charges > 0) {
                h.waiting = false;
                h.nextFire = this.time;
            }
        }
    }

    private checkEnd(): boolean {
        if (isDead(this.enemy.health)) return this.end('player', 'killed');
        if (isDead(this.player.health)) return this.end('enemy', 'killed');
        return false;
    }

    private end(winner: SideId, reason: 'killed' | 'timeout'): true {
        this.over = true;
        this.winner = winner;
        this.endReason = reason;
        return true;
    }
}
