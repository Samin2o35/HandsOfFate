// Hands of Fate — ui/TitleScreen.ts
// Mockup 01. Six buttons, the best run panel and the logo plaque.
// Hook each button's Click Events to the matching method below (onNewRun, ...),
// or leave them empty: this script wires them up itself from the slots below.
//
// Stage 5 behaviour (the rest arrives in later stages):
//   New Run      starts and saves a run; Continue then shows "Round 1"
//   Continue     greyed out without a saved run; shows the planning screen in stage 6
//   How to play  plays the tutorial run (asks before replacing a saved run)
//   Options      the Options screen
//   Achievements the four Aces
//   Quit         only shown on Android builds (iOS and web apps don't quit)

import { _decorator, Label, game, sys, Button } from 'cc';
import { Sound } from '../app/Sound';
import { GameScreen } from './GameScreen';
import { UiButton, ButtonStyle } from './UiButton';
import { Game, SPEED_NAME } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { confirmBox } from './Modal';
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
        Sound.music('menu');
        this.wire(this.newRunButton, this.onNewRun);
        this.wire(this.continueButton, this.onContinue);
        this.wire(this.howToPlayButton, this.onHowToPlay);
        this.wire(this.optionsButton, this.onOptions);
        this.wire(this.achievementsButton, this.onAchievements);
        this.wire(this.quitButton, this.onQuit);
        // Quit only makes sense on Android; iOS and the web have no "quit".
        // Open table: New Run is the one red card; the rest are outlines.
        this.newRunButton && (this.newRunButton.style = ButtonStyle.Red);
        for (const b of [this.continueButton, this.howToPlayButton, this.optionsButton, this.achievementsButton, this.quitButton]) {
            if (b) b.style = ButtonStyle.Dark;
        }
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
        const run = Game.run;
        if (!run) return;
        // Pick up where the run was saved: at the rewards, or at planning.
        if (run.phase === 'reward' && ScreenManager.show('RoundWon', { run })) return;
        ScreenManager.show('Planning', { run });
    }

    /** How to play = the tutorial run (asks first if it would replace a saved run). */
    onHowToPlay() {
        const start = () => ScreenManager.show('Planning', { run: Game.startTutorial() });
        if (Game.canContinue) confirmBox(this.node, 'PLAY THE TUTORIAL?', 'This starts the tutorial run and replaces your saved run.', 'Play it', 'Cancel', start);
        else start();
    }

    onOptions() {
        if (ScreenManager.show('Options', { back: 'Title' })) return;
        Game.cycleSpeed(); // no Options screen yet: the button just cycles the speed
        this.refresh();
    }

    onAchievements() {
        ScreenManager.show('Achievements');
    }

    onQuit() {
        game.end();
    }

    /** Hooks a button's click to a method, unless it already has a Click Event set in the editor. */
    private wire(b: UiButton | null, fn: () => void) {
        const button = b?.getComponent(Button);
        if (!button || button.clickEvents.length > 0) return;
        b!.node.on(Button.EventType.CLICK, () => { Sound.play('click'); fn.call(this); }, this);
    }
}
