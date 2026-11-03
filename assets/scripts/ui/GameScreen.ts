// Hands of Fate — ui/GameScreen.ts
// Base class for every screen prefab. ScreenManager calls onShow() right after
// the screen is added, and onHide() just before it is removed.

import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('GameScreen')
export class GameScreen extends Component {
    /** Called after the screen is added. `params` comes from ScreenManager.show(name, params). */
    onShow(_params?: unknown): void {}

    /** Called just before the screen is removed. */
    onHide(): void {}
}
