// Hands of Fate — core/hands.ts
// The hand table and suit effects from the GDD, as data. Every number the rules
// use for a hand comes from here, so tuning means editing this one file.

import { Suit } from './cards';

export type HandCategory =
    | 'high' | 'pair' | 'twoPair' | 'trips' | 'straight'
    | 'flush' | 'fullHouse' | 'quads' | 'straightFlush';

/** Shape of cells a hand's effect lands on in the target health grid (used in stage 3). */
export type HitPattern =
    | 'cell' | 'twoCells' | 'twoDominoes' | 'line3' | 'sweepRow'
    | 'square2x2' | 'rect2x3' | 'plus' | 'cross';

export interface HandInfo {
    /** Display name, e.g. "Three of a kind". UI upper-cases it for labels. */
    readonly name: string;
    /** Seconds between firings, in game-seconds (speed setting never changes this). */
    readonly cooldown: number;
    readonly pattern: HitPattern;
    /** Hand points: used for round score and the opponent budget. */
    readonly points: number;
    /** Effect multiplier (flushes double their effect). */
    readonly multiplier: number;
    /** Strength order, 0 = weakest. Decides which hand a line makes. */
    readonly strength: number;
}

export const HAND_INFO: Record<HandCategory, HandInfo> = {
    high:          { name: 'High card',       cooldown: 5.0, pattern: 'cell',        points: 0,  multiplier: 1, strength: 0 },
    pair:          { name: 'Pair',            cooldown: 4.0, pattern: 'twoCells',    points: 5,  multiplier: 1, strength: 1 },
    twoPair:       { name: 'Two pair',        cooldown: 3.5, pattern: 'twoDominoes', points: 10, multiplier: 1, strength: 2 },
    trips:         { name: 'Three of a kind', cooldown: 3.5, pattern: 'line3',       points: 15, multiplier: 1, strength: 3 },
    straight:      { name: 'Straight',        cooldown: 3.0, pattern: 'sweepRow',    points: 20, multiplier: 1, strength: 4 },
    flush:         { name: 'Flush',           cooldown: 3.0, pattern: 'square2x2',   points: 20, multiplier: 2, strength: 5 },
    fullHouse:     { name: 'Full house',      cooldown: 2.5, pattern: 'rect2x3',     points: 35, multiplier: 1, strength: 6 },
    quads:         { name: 'Four of a kind',  cooldown: 2.5, pattern: 'plus',        points: 50, multiplier: 1, strength: 7 },
    straightFlush: { name: 'Straight flush',  cooldown: 2.0, pattern: 'cross',       points: 80, multiplier: 1, strength: 8 },
};

export type Effect = 'attack' | 'rot' | 'heal' | 'armor';

/** ♠ attack, ♣ rot, ♥ heal, ♦ armor. */
export const EFFECT_OF_SUIT: Record<Suit, Effect> = { S: 'attack', C: 'rot', H: 'heal', D: 'armor' };

export const EFFECT_NAME: Record<Effect, string> = { attack: 'Attack', rot: 'Rot', heal: 'Heal', armor: 'Armor' };

/** Heal and armor have charges per fight (anti-stall rule); attack and rot are unlimited. */
export const EFFECT_CHARGES: Record<Effect, number> = {
    attack: Infinity, rot: Infinity, heal: 3, armor: 3,
};

/** Shortest straight or flush that counts (GDD: "count from 3 cards up"). */
export const MIN_STRAIGHT = 3;
export const MIN_FLUSH = 3;
