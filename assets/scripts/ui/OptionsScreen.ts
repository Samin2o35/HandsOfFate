// Hands of Fate — ui/OptionsScreen.ts
// Speed (Slow / Medium / Fast), replay the tutorial, reset all progress, credits.
// Opened from the title and from planning; Back returns to where you came from.
// Sound: Music On/Off and Sound effects On/Off, saved in settings.

import { _decorator, Node, UITransform, Widget } from 'cc';
import { GameScreen } from './GameScreen';
import { Game, SPEEDS, SPEED_NAME } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Sound } from '../app/Sound';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, FONT, COLOR } from './UiKit';
import { ButtonStyle } from './UiButton';
import { confirmBox } from './Modal';
const { ccclass } = _decorator;

interface OptionsParams { back?: string; backParams?: unknown; }

@ccclass('OptionsScreen')
export class OptionsScreen extends GameScreen {
    private content: Node | null = null;
    private back: OptionsParams = {};

    onShow(params?: unknown) {
        Game.load();
        this.back = (params as OptionsParams) ?? {};
        UiKit.ready.then(() => this.scheduleOnce(() => this.build(), 0));
    }

    private build() {
        const kit = UiKit.get();
        if (!this.node.isValid) return;
        this.node.getComponent(Widget)?.updateAlignment();
        const ut = this.node.getComponent(UITransform)!;
        const W = Math.min(ut.width, 1080), H = ut.height;
        if (!this.content) this.content = makeNode(this.node, 'Content', W, H);
        clearChildren(this.content);
        const root = this.content;
        const T = H / 2, B = -H / 2;
        const innerW = W - 60;

        const plaque = makeSprite(root, 'Plaque', kit.panelCream, 420, 120, { y: T - 40 - 60 }, true).node;
        makeLabel(plaque, 'Title', 'OPTIONS', { size: FONT.heading + 9, spacing: 3, color: COLOR.ink, y: 5 });

        // Speed
        let y = T - 260;
        makeLabel(root, 'SpeedTitle', 'FIGHT SPEED', { size: FONT.label, spacing: 2, color: COLOR.lilac, align: 'left', x: -innerW / 2, y });
        y -= 70;
        const gap = 18, bw = (innerW - gap * 2) / 3;
        SPEEDS.forEach((speed, i) => {
            const on = Game.settings.speed === speed;
            makeButton(root, `Speed ${speed}`, on ? ButtonStyle.Cream : ButtonStyle.Dark, SPEED_NAME[speed], bw, 100, { x: -innerW / 2 + bw / 2 + i * (bw + gap), y }, () => {
                Game.settings.speed = speed;
                Game.saveSettings();
                this.build();
            });
        });
        y -= 70;
        makeLabel(root, 'SpeedNote', 'Speed never changes your score: par time counts game-seconds.', { font: 'body', size: 26, color: COLOR.dim, align: 'left', x: -innerW / 2, y });

        // Sound: two toggles side by side (cream = on).
        y -= 110;
        makeLabel(root, 'SoundTitle', 'SOUND', { size: FONT.label, spacing: 2, color: COLOR.lilac, align: 'left', x: -innerW / 2, y });
        y -= 70;
        const hw = (innerW - gap) / 2;
        const toggle = (key: 'music' | 'sfx', name: string, i: number) => {
            const on = Game.settings[key];
            makeButton(root, `Toggle ${key}`, on ? ButtonStyle.Cream : ButtonStyle.Dark, `${name}: ${on ? 'On' : 'Off'}`, hw, 100, { x: -innerW / 2 + hw / 2 + i * (hw + gap), y }, () => {
                Game.settings[key] = !Game.settings[key];
                Game.saveSettings();
                Sound.settingsChanged();
                this.build();
            });
        };
        toggle('music', 'Music', 0);
        toggle('sfx', 'Effects', 1);

        // Tutorial
        y -= 150;
        makeLabel(root, 'TutTitle', 'TUTORIAL', { size: FONT.label, spacing: 2, color: COLOR.lilac, align: 'left', x: -innerW / 2, y });
        y -= 70;
        makeButton(root, 'Replay', ButtonStyle.Cream, 'Replay the tutorial', innerW, 100, { y }, () => this.replayTutorial());

        // Progress
        y -= 150;
        makeLabel(root, 'ResetTitle', 'PROGRESS', { size: FONT.label, spacing: 2, color: COLOR.lilac, align: 'left', x: -innerW / 2, y });
        y -= 70;
        makeButton(root, 'Reset', ButtonStyle.Red, 'Reset all progress', innerW, 100, { y }, () => {
            confirmBox(this.node, 'RESET EVERYTHING?', 'Best run, Ace progress and your saved run will be deleted. This can\'t be undone.', 'Reset', 'Keep', () => {
                Game.resetProgress();
                this.build();
            });
        });

        // Credits
        makeLabel(root, 'Credits', 'Card art: Pixel Plebes by Greebles (Devlyn JD) · Fonts: Pixelify Sans, VT323 (OFL)', { font: 'body', size: 24, color: COLOR.dim, y: B + 190, width: innerW, height: 60 });

        makeButton(root, 'Back', ButtonStyle.Dark, 'Back', innerW, 100, { y: B + 40 + 50 }, () => this.goBack());
    }

    private replayTutorial() {
        const start = () => {
            const run = Game.startTutorial();
            ScreenManager.show('Planning', { run });
        };
        if (Game.canContinue) confirmBox(this.node, 'REPLAY TUTORIAL?', 'This starts the tutorial run and replaces your saved run.', 'Replay', 'Cancel', start);
        else start();
    }

    private goBack() {
        const target = this.back.back ?? 'Title';
        // If the run we came from was reset, there is nothing to go back to.
        if (target !== 'Title' && !Game.run) { ScreenManager.show('Title'); return; }
        ScreenManager.show(target, this.back.backParams);
    }
}
