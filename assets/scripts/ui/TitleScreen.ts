// Hands of Fate — ui/TitleScreen.ts
// Mockup 01. Six buttons, the best run panel and the logo plaque.
// Hook each button's Click Events to the matching method below (onNewRun, ...),
// or leave them empty: this script wires them up itself from the slots below.
//
// Stage 5 behaviour (the rest arrives in later stages):
//   New Run      starts and saves a run; Continue then shows "Round 1"
//   Continue     greyed out without a saved run; shows the planning screen in stage 6
//   How to play  stage 9 (tutorial)
//   Options      cycles the speed Slow → Medium → Fast and saves it
//   Achievements stage 9
//   Quit         only shown on Android builds (iOS and web apps don't quit)

import { _decorator, Label, game, sys, Button } from 'cc';
import { GameScreen } from './GameScreen';
import { UiButton } from './UiButton';
import { Game, SPEED_NAME } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
const { ccclass, property } = _decorator;

@ccclass('TitleScreen')
export class TitleScreen extends GameScreen {
    @property(UiButton) newRunButton: UiButton | null = null;
    @property(UiButton) continueButton: UiButton | null = null;
    @property(UiButton) howToPlayButton: UiButton | null = null;
    @property(UiButton) optionsButton: UiButton | null = null;
    @property(UiButton) achievementsButton: UiButton | null = null;
    @property(UiButton) quitButton: UiButton | null = null;

    @property(Label) bestScoreLabel: Label | null = null;
    @property(Label) bestRoundLabel: Label | null = null;

    onShow() {
        Game.load();
        this.wire(this.newRunButton, this.onNewRun);
        this.wire(this.continueButton, this.onContinue);
        this.wire(this.howToPlayButton, this.onHowToPlay);
        this.wire(this.optionsButton, this.onOptions);
        this.wire(this.achievementsButton, this.onAchievements);
        this.wire(this.quitButton, this.onQuit);
        // Quit only makes sense on Android; iOS and the web have no "quit".
        if (this.quitButton) this.quitButton.node.active = sys.isNative && sys.os === sys.OS.ANDROID;
        this.refresh();
    }

    /** Updates every text from the saved state. */
    refresh() {
        const run = Game.canContinue ? Game.run : null;
        if (this.continueButton) {
            this.continueButton.text = run ? `Continue · Round ${run.round}` : 'Continue';
            this.continueButton.interactable = !!run;
        }
        if (this.optionsButton) this.optionsButton.text = `Options · Speed: ${SPEED_NAME[Game.settings.speed]}`;
        const p = Game.profile;
        if (this.bestScoreLabel) this.bestScoreLabel.string = p.bestScore.toLocaleString('en-US');
        if (this.bestRoundLabel) this.bestRoundLabel.string = p.bestRound > 0 ? `Round ${p.bestRound}` : '–';
    }

    onNewRun() {
        const run = Game.newRun();
        console.log(`New run started (seed ${run.data.seed}), round ${run.round} vs ${run.opponent.name}`);
        if (!ScreenManager.show('Planning', { run })) this.refresh(); // Planning arrives in stage 6
    }

    onContinue() {
        if (!Game.run) return;
        if (!ScreenManager.show('Planning', { run: Game.run })) console.log(`Continue: round ${Game.run.round} (planning screen comes in stage 6)`);
    }

    onHowToPlay() {
        if (!ScreenManager.show('Tutorial')) console.log('How to play: the tutorial comes in stage 9');
    }

    onOptions() {
        Game.cycleSpeed();
        this.refresh();
    }

    onAchievements() {
        if (!ScreenManager.show('Achievements')) console.log('Achievements: comes in stage 9');
    }

    onQuit() {
        game.end();
    }

    /** Hooks a button's click to a method, unless it already has a Click Event set in the editor. */
    private wire(b: UiButton | null, fn: () => void) {
        const button = b?.getComponent(Button);
        if (!button || button.clickEvents.length > 0) return;
        b!.node.on(Button.EventType.CLICK, fn, this);
    }
}
