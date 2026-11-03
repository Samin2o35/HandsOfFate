// Hands of Fate — app/Game.ts
// The one place that holds the game's lasting state and saves it on the device:
//   profile  (best score, best round, Ace progress)   -> "hof.profile"
//   settings (speed, later sound and tutorial flags)  -> "hof.settings"
//   run      (the run in progress, if any)            -> "hof.run"
// Screens read and change state through `Game`, never through localStorage directly.

import { sys } from 'cc';
import { Profile, newProfile, updateProfile, AceId } from '../core/achievements';
import { Run } from '../core/run';

export type Speed = 'slow' | 'medium' | 'fast';
export const SPEEDS: readonly Speed[] = ['slow', 'medium', 'fast'];
/** GDD: Slow 0.75×, Medium 1×, Fast 1.5×. Scoring uses game-seconds, so speed never changes score. */
export const SPEED_MULTIPLIER: Record<Speed, number> = { slow: 0.75, medium: 1, fast: 1.5 };
export const SPEED_NAME: Record<Speed, string> = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };

export interface Settings {
    speed: Speed;
    /** Set once the tutorial run has been played or skipped (stage 9). */
    tutorialDone: boolean;
}

const KEY_PROFILE = 'hof.profile';
const KEY_SETTINGS = 'hof.settings';
const KEY_RUN = 'hof.run';

function read<T>(key: string): T | null {
    try {
        const text = sys.localStorage.getItem(key);
        return text ? (JSON.parse(text) as T) : null;
    } catch (e) {
        console.warn(`Could not read ${key}`, e);
        return null;
    }
}

function write(key: string, value: string | null) {
    try {
        if (value === null) sys.localStorage.removeItem(key);
        else sys.localStorage.setItem(key, value);
    } catch (e) {
        console.warn(`Could not save ${key}`, e);
    }
}

class GameState {
    profile: Profile = newProfile();
    settings: Settings = { speed: 'medium', tutorialDone: false };
    run: Run | null = null;
    private loaded = false;

    /** Loads everything once. Safe to call from every screen. */
    load() {
        if (this.loaded) return;
        this.loaded = true;
        this.profile = { ...newProfile(), ...(read<Profile>(KEY_PROFILE) ?? {}) };
        this.settings = { ...this.settings, ...(read<Settings>(KEY_SETTINGS) ?? {}) };
        const runText = (() => { try { return sys.localStorage.getItem(KEY_RUN); } catch { return null; } })();
        if (runText) {
            try {
                const run = Run.fromJSON(runText);
                this.run = run.phase === 'over' ? null : run;
            } catch (e) {
                console.warn('Saved run could not be loaded; starting fresh.', e);
                write(KEY_RUN, null);
            }
        }
    }

    /** A run that can be continued from the title screen. */
    get canContinue(): boolean {
        return this.run !== null && this.run.phase !== 'over';
    }

    /** Starts a new run (replacing any saved one) and saves it. */
    newRun(): Run {
        const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        // The first run will be the tutorial once stage 9 adds it.
        this.run = Run.newRun({ seed, tutorial: false });
        this.profile.runs++;
        this.saveRun();
        this.saveProfile();
        return this.run;
    }

    /**
     * Folds the run's progress into the profile (best score, best round, Aces)
     * and saves both. Call after every finished round. Returns Aces earned just now.
     */
    recordProgress(): AceId[] {
        if (!this.run) return [];
        const earned = updateProfile(this.profile, this.run.data.progress);
        this.saveProfile();
        this.saveRun();
        return earned;
    }

    /** The run is over: keep its records, drop the save. */
    endRun(): AceId[] {
        const earned = this.recordProgress();
        this.run = null;
        write(KEY_RUN, null);
        return earned;
    }

    saveRun() {
        write(KEY_RUN, this.run && this.run.phase !== 'over' ? this.run.toJSON() : null);
    }

    saveProfile() { write(KEY_PROFILE, JSON.stringify(this.profile)); }
    saveSettings() { write(KEY_SETTINGS, JSON.stringify(this.settings)); }

    /** Options shortcut on the title screen: Slow → Medium → Fast → Slow. */
    cycleSpeed(): Speed {
        const i = SPEEDS.indexOf(this.settings.speed);
        this.settings.speed = SPEEDS[(i + 1) % SPEEDS.length];
        this.saveSettings();
        return this.settings.speed;
    }

    /** Wipes everything (for testing). Call Game.resetAll() from the browser console. */
    resetAll() {
        write(KEY_PROFILE, null);
        write(KEY_SETTINGS, null);
        write(KEY_RUN, null);
        this.loaded = false;
        this.run = null;
        this.load();
    }
}

export const Game = new GameState();

// Handy while testing in the browser preview: type `hof.resetAll()` in the console.
(globalThis as unknown as { hof: GameState }).hof = Game;
