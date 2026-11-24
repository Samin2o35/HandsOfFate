// Hands of Fate — ui/OptionsScreen.ts
// Speed (Slow / Medium / Fast), replay the tutorial, reset all progress, credits.
// Opened from the title and from planning; Back returns to where you came from.
// Sound: Music On/Off and Sound effects On/Off, saved in settings.

import { _decorator, Node, UITransform, Widget, tween } from 'cc';
import { GameScreen } from './GameScreen';
import { Game, SPEEDS, SPEED_NAME } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Sound } from '../app/Sound';
import { Smoke } from '../app/Smoke';
import { UiKit, makeNode, makeLabel, makeButton, clearChildren, FONT } from './UiKit';
import { frame, INK_TEXT } from './kitC';
import { PlayLog } from '../app/PlayLog';
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
        if (!this.node.isValid) return;
        this.node.getComponent(Widget)?.updateAlignment();
        const ut = this.node.getComponent(UITransform)!;
        // Tall screens (4:3 tablets): keep the content in a centred band, not stretched to the edges.
        const W = Math.min(ut.width, 1920), H = Math.min(ut.height, 1200);
        if (!this.content) this.content = makeNode(this.node, 'Content', W, H);
        clearChildren(this.content);
        const root = this.content;
        const T = H / 2, B = -H / 2;
        // Landscape: two columns of settings under the title plaque.
        const colW = 780, colGap = 120;
        const leftX = -(colW + colGap) / 2, rightX = (colW + colGap) / 2;
        const gap = 18;

        const plaque = frame(root, 'Plaque', 420, 120, { y: T - 40 - 60 }, { closed: true });
        makeLabel(plaque, 'Title', 'OPTIONS', { size: FONT.heading + 9, spacing: 3, color: INK_TEXT.main, y: 0 });

        const sectionTitle = (name: string, text: string, cx: number, y: number) =>
            makeLabel(root, name, text, { size: FONT.label, spacing: 2, color: INK_TEXT.second, align: 'left', x: cx - colW / 2, y });

        // Left column: fight speed, then sound.
        let y = T - 240;
        sectionTitle('SpeedTitle', 'FIGHT SPEED', leftX, y);
        y -= 70;
        const bw = (colW - gap * 2) / 3;
        SPEEDS.forEach((speed, i) => {
            const on = Game.settings.speed === speed;
            makeButton(root, `Speed ${speed}`, on ? ButtonStyle.Cream : ButtonStyle.Dark, SPEED_NAME[speed], bw, 100, { x: leftX - colW / 2 + bw / 2 + i * (bw + gap), y }, () => {
                Game.settings.speed = speed;
                Game.saveSettings();
                this.build();
            });
        });
        y -= 70;
        makeLabel(root, 'SpeedNote', 'Speed never changes your score: par time counts game-seconds.', { font: 'body', size: 26, color: INK_TEXT.quiet, align: 'left', x: leftX - colW / 2, y });

        y -= 110;
        sectionTitle('SoundTitle', 'SOUND', leftX, y);
        y -= 70;
        const hw = (colW - gap) / 2;
        const toggle = (key: 'music' | 'sfx', name: string, i: number) => {
            const on = Game.settings[key];
            makeButton(root, `Toggle ${key}`, ButtonStyle.Dark, `${name}: ${on ? 'On' : 'Off'}`, hw, 100, { x: leftX - colW / 2 + hw / 2 + i * (hw + gap), y }, () => {
                Game.settings[key] = !Game.settings[key];
                Game.saveSettings();
                Sound.settingsChanged();
                this.build();
            });
        };
        toggle('music', 'Music', 0);
        toggle('sfx', 'Effects', 1);

        // Playtests: copy this device's log of every round played, to send back.
        y -= 180;
        sectionTitle('PlaytestTitle', 'PLAYTEST', leftX, y);
        y -= 70;
        const rounds = PlayLog.count();
        const copyText = rounds ? `Copy playtest log (${rounds} rounds)` : 'Playtest log: nothing yet';
        const copy = makeButton(root, 'CopyLog', ButtonStyle.Dark, copyText, colW, 100, { x: leftX, y }, () => {
            const text = PlayLog.text();
            const nav = (globalThis as any).navigator;
            // The answer shows on the button itself for a moment.
            const done = (ok: boolean) => {
                copy.text = ok ? 'Copied: paste it in a message' : 'Printed in the console';
                tween(copy.node).delay(2.5).call(() => { if (copy.isValid) copy.text = copyText; }).start();
            };
            try {
                if (nav?.clipboard?.writeText) nav.clipboard.writeText(text).then(() => done(true), () => { console.log(text); done(false); });
                else { console.log(text); done(false); }
            } catch { console.log(text); done(false); }
        }, 30);
        copy.interactable = rounds > 0;

        // Right column: tutorial, motion, then progress.
        y = T - 240;
        sectionTitle('TutTitle', 'TUTORIAL', rightX, y);
        y -= 70;
        makeButton(root, 'Replay', ButtonStyle.Dark, 'Replay the tutorial', colW, 100, { x: rightX, y }, () => this.replayTutorial());

        // Toggles are outlines that name their state; cream is kept for the one chosen speed.
        // Background motion cycles Full → Low → Off; Screen shake (and the fight zoom) on or off.
        y -= 180;
        sectionTitle('MotionTitle', 'MOTION', rightX, y);
        y -= 70;
        const motion = Game.settings.motion ?? 'full';
        const MOTION_NAME = { full: 'Full', low: 'Low', off: 'Off' } as const;
        makeButton(root, 'Motion', ButtonStyle.Dark, `Background: ${MOTION_NAME[motion]}`, hw, 100, { x: rightX - colW / 2 + hw / 2, y }, () => {
            Game.settings.motion = motion === 'full' ? 'low' : motion === 'low' ? 'off' : 'full';
            Game.saveSettings();
            Smoke.applyMotion();
            this.build();
        }, 27);
        const shakeOn = Game.settings.shake !== false;
        makeButton(root, 'Shake', ButtonStyle.Dark, `Screen shake: ${shakeOn ? 'On' : 'Off'}`, hw, 100, { x: rightX - colW / 2 + hw / 2 + hw + gap, y }, () => {
            Game.settings.shake = !shakeOn;
            Game.saveSettings();
            this.build();
        }, 27);

        y -= 180;
        sectionTitle('ResetTitle', 'PROGRESS', rightX, y);
        y -= 70;
        makeButton(root, 'Reset', ButtonStyle.Dark, 'Reset all progress', colW, 100, { x: rightX, y }, () => {
            confirmBox(this.node, 'RESET EVERYTHING?', 'Best run, Ace progress and your saved run will be deleted. This can\'t be undone.', 'Reset', 'Keep', () => {
                Game.resetProgress();
                this.build();
            });
        });

        // Credits and Back along the bottom.
        makeLabel(root, 'Credits', 'Card art: Pixel Plebes by Greebles (Devlyn JD) · Fonts: Pixelify Sans, VT323 (OFL)', { font: 'body', size: 26, color: INK_TEXT.quiet, y: B + 206, width: colW * 2 + colGap, height: 40 });
        makeLabel(root, 'CreditsAudio', 'Music: Pegonthetrack & ElvGames · Sounds: Leohpaz, JDSherbert, beatscribe', { font: 'body', size: 26, color: INK_TEXT.quiet, y: B + 170, width: colW * 2 + colGap, height: 40 });
        makeButton(root, 'Back', ButtonStyle.Dark, 'Back', 600, 100, { y: B + 40 + 50 }, () => this.goBack());
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
