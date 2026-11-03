// Hands of Fate — app/ScreenManager.ts
// Shows one screen at a time. Each screen is a prefab whose root has a
// GameScreen component (TitleScreen, PlanningScreen, ...). Put this component on
// the Canvas, drag the screen prefabs into "Screens", and pick the first one.
//
// From any script:  ScreenManager.show('Title')   (the prefab's name)

import { _decorator, Component, Node, Prefab, instantiate, UIOpacity, tween } from 'cc';
import { GameScreen } from '../ui/GameScreen';
import { Game } from './Game';
const { ccclass, property } = _decorator;

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

    private current: Node | null = null;
    private currentName = '';

    onLoad() {
        ScreenManager.instance = this;
        Game.load();
    }

    start() {
        if (this.firstScreen) ScreenManager.show(this.firstScreen);
    }

    onDestroy() {
        if (ScreenManager.instance === this) ScreenManager.instance = null;
    }

    /** Name of the screen on show right now. */
    static get currentScreen(): string {
        return ScreenManager.instance?.currentName ?? '';
    }

    /** Swaps to the named screen. `params` is passed to its onShow(). */
    static show(name: string, params?: unknown): boolean {
        const m = ScreenManager.instance;
        if (!m) { console.error('ScreenManager is not in the scene'); return false; }
        return m.showScreen(name, params);
    }

    private showScreen(name: string, params?: unknown): boolean {
        const prefab = this.screens.find((p) => p && p.data && p.data.name === name);
        if (!prefab) {
            console.warn(`No screen prefab named "${name}" in ScreenManager.screens (coming in a later stage?)`);
            return false;
        }
        const root = this.screenRoot ?? this.node;

        if (this.current) {
            this.current.getComponent(GameScreen)?.onHide();
            this.current.destroy();
            this.current = null;
        }

        const node = instantiate(prefab);
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 0;
        root.addChild(node);
        this.current = node;
        this.currentName = name;
        node.getComponent(GameScreen)?.onShow(params);
        tween(opacity).to(this.fadeTime, { opacity: 255 }).start();
        return true;
    }
}
