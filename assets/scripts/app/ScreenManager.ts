// Hands of Fate — app/ScreenManager.ts
// Shows one screen at a time. Each screen is a prefab whose root has a
// GameScreen component (TitleScreen, PlanningScreen, ...). Put this component on
// the Canvas, drag the screen prefabs into "Screens", and pick the first one.
//
// From any script:  ScreenManager.show('Title')   (the prefab's name)
//
// Switching: the current screen fades out at once (so a tap answers right
// away), the next screen is built while the screen is dark, and it fades in a
// few frames later, once its build is done. Building a screen can take a
// noticeable moment on a phone; this way it happens behind the fade instead of
// freezing the old screen. Taps are blocked during the switch.

import { _decorator, Component, Node, Prefab, instantiate, UIOpacity, UITransform, BlockInputEvents, Widget, tween, Tween } from 'cc';
import { GameScreen } from '../ui/GameScreen';
import { Game } from './Game';
import { Sound } from './Sound';
import { Smoke } from './Smoke';
import { UiKit } from '../ui/UiKit';
import { Particles } from '../ui/particles';
import { Run } from '../core/run';
import { Suit } from '../core/cards';
import { registerPreview } from './Preview';
const { ccclass, property } = _decorator;

/** Frames to wait after onShow before fading in: covers UiKit.ready, the screens' scheduleOnce(0) build, and the long frame it makes. */
const BUILD_FRAMES = 3;
/** Longest the first screen waits for the card art and the smoke (seconds). */
const FIRST_WAIT = 4;

@ccclass('ScreenManager')
export class ScreenManager extends Component {
    private static instance: ScreenManager | null = null;

    @property({ type: Node, tooltip: 'Full-screen node the screens are added under (SafeRoot/Screens).' })
    screenRoot: Node | null = null;

    @property({ type: [Prefab], tooltip: 'Every screen prefab. Each is shown by its prefab name.' })
    screens: Prefab[] = [];

    @property({ tooltip: 'Prefab name of the screen shown at start.' })
    firstScreen = 'Title';

    @property({ tooltip: 'Fade-in time in seconds.' })
    fadeTime = 0.15;

    @property({ tooltip: 'Fade-out time in seconds (the old screen, before the next one is built).' })
    fadeOutTime = 0.1;

    private current: Node | null = null;
    private currentName = '';
    private blocker: Node | null = null;
    private switching = false;
    private pending: { name: string; params?: unknown } | null = null;

    onLoad() {
        ScreenManager.instance = this;
        Game.load();
        if (!this.getComponent(Sound)) this.addComponent(Sound);
        if (!this.getComponent(Smoke)) this.addComponent(Smoke);
        if (!this.getComponent(Particles)) this.addComponent(Particles);
        registerPreview((name, params) => ScreenManager.show(name, params));
    }

    start() {
        // The first screen waits (on the room colour) until the card art and the smoke are
        // ready, so it never shows half-dressed and then changes (Stage B, decision 141).
        // At most FIRST_WAIT seconds, in case something never loads.
        if (!this.firstScreen) return;
        let shown = false;
        const go = () => { if (shown || !this.node.isValid) return; shown = true; ScreenManager.show(this.firstScreen); };
        Promise.all([UiKit.ready.catch(() => undefined), Smoke.ready]).then(go, go);
        this.scheduleOnce(go, FIRST_WAIT);
    }

    onDestroy() {
        if (ScreenManager.instance === this) ScreenManager.instance = null;
    }

    /** Name of the screen on show (or being switched to) right now. */
    static get currentScreen(): string {
        return ScreenManager.instance?.currentName ?? '';
    }

    /** Swaps to the named screen. `params` is passed to its onShow(). False if there is no such prefab. */
    static show(name: string, params?: unknown): boolean {
        const m = ScreenManager.instance;
        if (!m) { console.error('ScreenManager is not in the scene'); return false; }
        return m.showScreen(name, params);
    }

    private prefabFor(name: string): Prefab | null {
        return this.screens.find((p) => p && p.data && p.data.name === name) ?? null;
    }

    private showScreen(name: string, params?: unknown): boolean {
        if (!this.prefabFor(name)) {
            console.warn(`No screen prefab named "${name}" in ScreenManager.screens (coming in a later stage?)`);
            return false;
        }
        this.currentName = name;
        // The smoke goes back to the felt colour; the boss intro, a boss round's planning
        // and its fight set their King's colour themselves. Run over keeps a lost run's dark.
        Smoke.tint(bossSuitFor(name, params));
        if (name !== 'RunOver') Smoke.mood(false);
        // Already switching: the latest request wins once the old screen has faded out.
        if (this.switching) { this.pending = { name, params }; return true; }

        const old = this.current;
        // Nothing on show yet, or a screen that hasn't faded in (it redirected from its own onShow): swap at once.
        const oldOpacity = old?.isValid ? old.getComponent(UIOpacity) : null;
        if (!old || !old.isValid || this.fadeOutTime <= 0 || (oldOpacity && oldOpacity.opacity === 0)) {
            this.swapTo(name, params);
            return true;
        }

        this.switching = true;
        this.pending = { name, params };
        this.block(true);
        old.getComponent(GameScreen)?.onHide();
        const opacity = old.getComponent(UIOpacity) ?? old.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        tween(opacity).to(this.fadeOutTime, { opacity: 0 }).call(() => {
            const next = this.pending!;
            this.pending = null;
            this.switching = false;
            this.swapTo(next.name, next.params, true);
        }).start();
        return true;
    }

    /** Destroys the current screen, builds the next one hidden, then fades it in. */
    private swapTo(name: string, params: unknown, alreadyHidden = false) {
        const prefab = this.prefabFor(name)!;
        const root = this.screenRoot ?? this.node;
        if (this.current?.isValid) {
            if (!alreadyHidden) this.current.getComponent(GameScreen)?.onHide();
            this.current.destroy();
        }
        this.current = null;

        const node = instantiate(prefab);
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        root.addChild(node);
        this.current = node;
        this.currentName = name;
        this.block(true);
        node.getComponent(GameScreen)?.onShow(params);

        // Fade in once the build has happened (a few frames later), so a long
        // build frame doesn't swallow the fade.
        this.afterFrames(BUILD_FRAMES, () => {
            if (!node.isValid || this.current !== node || this.switching) return;
            this.block(false);
            tween(opacity).to(this.fadeTime, { opacity: 255 }).start();
        });
    }

    private afterFrames(n: number, fn: () => void) {
        if (n <= 0) { fn(); return; }
        this.scheduleOnce(() => this.afterFrames(n - 1, fn), 0);
    }

    /** A full-screen node that swallows taps while screens switch. */
    private block(on: boolean) {
        const root = this.screenRoot ?? this.node;
        if (!this.blocker || !this.blocker.isValid) {
            const n = new Node('SwitchBlocker');
            n.layer = root.layer;
            n.addComponent(UITransform);
            const w = n.addComponent(Widget);
            w.isAlignTop = w.isAlignBottom = w.isAlignLeft = w.isAlignRight = true;
            w.top = w.bottom = w.left = w.right = 0;
            n.addComponent(BlockInputEvents);
            root.addChild(n);
            this.blocker = n;
        }
        this.blocker.active = on;
        if (on) this.blocker.setSiblingIndex(root.children.length - 1);
    }
}

/** The King's suit when this screen shows a boss table, else null. */
function bossSuitFor(name: string, params: unknown): Suit | null {
    if (name !== 'BossIntro' && name !== 'Planning' && name !== 'Fight') return null;
    const run = (params as { run?: Run } | undefined)?.run ?? Game.run;
    return run?.isBoss ? run.opponent.boss?.suit ?? null : null;
}
