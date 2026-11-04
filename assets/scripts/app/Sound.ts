// Hands of Fate — app/Sound.ts
// Sound effects and music. ScreenManager adds this component to the Canvas, so
// there is nothing to set up in the editor: drop the files into
//   assets/resources/audio/sfx/<name>.mp3    (names: the Sfx list below)
//   assets/resources/audio/music/<name>.mp3  (menu, fight, boss)
// Missing files are fine: the game runs silently and logs which are missing once.
//
// From any script:  Sound.play('hit')   Sound.music('fight')   Sound.music(null)
// Settings (Options screen): Game.settings.music / Game.settings.sfx.

import { _decorator, Component, AudioSource, AudioClip, resources, input, Input, director } from 'cc';
import { Game } from './Game';
const { ccclass } = _decorator;

export type Sfx =
    | 'click' | 'deny' | 'select'
    | 'card_pick' | 'card_place' | 'card_return' | 'deal' | 'forge'
    | 'hit' | 'hurt' | 'rot' | 'block' | 'heal' | 'shield' | 'twist'
    | 'win' | 'lose' | 'tick' | 'total' | 'boss' | 'ace' | 'dealer';

export type Music = 'menu' | 'fight' | 'boss';

export const SFX_NAMES: readonly Sfx[] = [
    'click', 'deny', 'select', 'card_pick', 'card_place', 'card_return', 'deal', 'forge',
    'hit', 'hurt', 'rot', 'block', 'heal', 'shield', 'twist', 'win', 'lose', 'tick', 'total', 'boss', 'ace', 'dealer',
];
export const MUSIC_NAMES: readonly Music[] = ['menu', 'fight', 'boss'];

/** Per-sound loudness (0..1), to balance packs from different makers. Tune by ear. */
const SFX_VOLUME: Partial<Record<Sfx, number>> = {
    click: 0.6, select: 0.6, tick: 0.35, card_pick: 0.7, card_return: 0.6, hit: 0.7, hurt: 0.8, rot: 0.6, block: 0.6,
};
const MUSIC_VOLUME = 0.45;
const FADE_PER_SECOND = 1.5;   // music fades in or out in about 0.3 s
const MIN_GAP = 0.045;         // the same sound plays at most once per 45 ms (a flush can fire 8 cells at once)

@ccclass('Sound')
export class Sound extends Component {
    private static instance: Sound | null = null;

    private sfxSource: AudioSource | null = null;
    private musicSource: AudioSource | null = null;
    private clips = new Map<string, AudioClip>();
    private musicClips = new Map<string, AudioClip>();
    private lastPlayed = new Map<string, number>();
    private missing = new Set<string>();

    /** The track we want playing (null = silence), and the one actually loaded in the source. */
    private wanted: Music | null = null;
    private playingName: Music | null = null;
    private volume = 0;

    onLoad() {
        Sound.instance = this;
        this.sfxSource = this.node.addComponent(AudioSource);
        this.musicSource = this.node.addComponent(AudioSource);
        this.musicSource.loop = true;
        this.musicSource.playOnAwake = false;
        this.musicSource.volume = 0;

        resources.loadDir('audio/sfx', AudioClip, (err, clips) => {
            if (err || !clips || clips.length === 0) { console.warn('No sound effects yet in assets/resources/audio/sfx (the game runs silently).'); return; }
            for (const c of clips) this.clips.set(c.name, c);
            const absent = SFX_NAMES.filter((n) => !this.clips.has(n));
            if (absent.length) console.warn(`Sound effects not found (silent): ${absent.join(', ')}`);
        });

        // Browsers only allow sound after the first touch: start the music then if it couldn't start before.
        input.once(Input.EventType.TOUCH_START, () => this.kickMusic());
        input.once(Input.EventType.MOUSE_DOWN, () => this.kickMusic());
    }

    onDestroy() {
        if (Sound.instance === this) Sound.instance = null;
    }

    // ---- Static API ---------------------------------------------------------------------

    /** Plays a sound effect once (if sound effects are on and the file exists). */
    static play(name: Sfx, volume = 1) {
        Sound.instance?.playSfx(name, volume);
    }

    /** Switches the music (crossfade); null fades it out. The same track keeps playing. */
    static music(name: Music | null) {
        Sound.instance?.setMusic(name);
    }

    /** Call after changing Game.settings.music or .sfx. */
    static settingsChanged() {
        const s = Sound.instance;
        if (!s) return;
        if (!Game.settings.sfx) s.sfxSource?.stop();
        if (Game.settings.music) s.kickMusic();
    }

    // ---- Effects --------------------------------------------------------------------------

    private playSfx(name: Sfx, volume: number) {
        if (!Game.settings.sfx || !this.sfxSource) return;
        const clip = this.clips.get(name);
        if (!clip) return;
        const now = director.getTotalTime() / 1000;
        if (now - (this.lastPlayed.get(name) ?? -1) < MIN_GAP) return;
        this.lastPlayed.set(name, now);
        this.sfxSource.playOneShot(clip, volume * (SFX_VOLUME[name] ?? 1));
    }

    // ---- Music ----------------------------------------------------------------------------

    private setMusic(name: Music | null) {
        this.wanted = name;
        if (name && !this.musicClips.has(name) && !this.missing.has(name)) {
            resources.load(`audio/music/${name}`, AudioClip, (err, clip) => {
                if (err || !clip) {
                    this.missing.add(name);
                    console.warn(`Music not found (silent): audio/music/${name}`);
                    return;
                }
                this.musicClips.set(name, clip);
            });
        }
    }

    private kickMusic() {
        const src = this.musicSource;
        if (src && src.clip && Game.settings.music && !src.playing) src.play();
    }

    update(dt: number) {
        const src = this.musicSource;
        if (!src) return;
        const switching = this.wanted !== this.playingName;
        const target = !switching && this.wanted && Game.settings.music ? MUSIC_VOLUME : 0;
        const step = FADE_PER_SECOND * dt * MUSIC_VOLUME;
        this.volume = this.volume < target ? Math.min(target, this.volume + step) : Math.max(target, this.volume - step);
        src.volume = this.volume;

        if (switching && this.volume <= 0.001) {
            // Faded out: swap to the wanted track (once it has loaded).
            if (this.wanted === null) {
                src.stop();
                this.playingName = null;
            } else {
                const clip = this.musicClips.get(this.wanted);
                if (clip) {
                    src.stop();
                    src.clip = clip;
                    src.loop = true;
                    this.playingName = this.wanted;
                    if (Game.settings.music) src.play();
                } else if (this.missing.has(this.wanted)) {
                    src.stop();
                    this.playingName = this.wanted; // nothing to play; stop trying
                }
            }
        }
        // Music turned off: pause once silent; turned on again: kickMusic() resumes.
        if (!Game.settings.music && this.volume <= 0.001 && src.playing) src.pause();
    }
}
