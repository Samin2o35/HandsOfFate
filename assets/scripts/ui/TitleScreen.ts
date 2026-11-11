// Hands of Fate — ui/TitleScreen.ts
// Mockup 01 (open table). Six buttons, the best run rail, the fanned hand and the name.
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

import { _decorator, Label, game, sys, Button, Sprite, UITransform, Color, HorizontalTextAlignment } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { Sound } from '../app/Sound';
import { GameScreen } from './GameScreen';
import { UiButton, ButtonStyle } from './UiButton';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { confirmBox } from './Modal';
import { UiKit, makeLabel, FONT } from './UiKit';
import { frame, rule, INK_TEXT } from './kitC';
import { AnimatedCard } from './AnimatedCard';

/** The title fan, left to right: strip and lift (px) of each card (mockup 01). Joker in the middle. */
const FAN: [string, string, number][] = [
    ['KSpades', 'anim/S_13', 28], ['QHearts', 'anim/H_12', 12], ['Joker', 'anim/joker_true', 0],
    ['JClubs', 'anim/C_11', 12], ['AHearts', 'anim/D_14', 28],
];
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
        if (!EDITOR_NOT_IN_PREVIEW) UiKit.ready.then(() => { if (this.node.isValid) this.dress(); });
        this.refresh();
    }

    private dressed = false;

    /**
     * The open table, laid over the prefab at runtime (no editor steps): the hand fanned
     * in an open bracket captioned HANDS OF FATE, the name and lines under it, and the best
     * run in a closed rail. The prefab's old plaque is hidden; its nodes stay for the editor.
     */
    private dress() {
        if (this.dressed) return;
        const content = this.node.getChildByName('Content');
        if (!content) return;
        this.dressed = true;
        // Left: bracket 800 x 740 with its top-left at (80, 110) of the 1920 x 1080 screen.
        const bracket = frame(content, 'TitleFrame', 800, 740, { x: -480, y: 60 }, { caption: 'HANDS OF FATE' });
        bracket.setSiblingIndex(0);
        const fan = content.getChildByName('Fan');
        if (fan) {
            fan.setPosition(-480, 250);
            FAN.forEach(([name, strip, lift], k) => {
                const card = fan.getChildByName(name);
                if (!card) return;
                card.setPosition(-250 + k * 125, -6 - lift);
                card.getComponent(UITransform)?.setContentSize(180, 252);
                card.setSiblingIndex(k);
                const anim = card.getComponent(AnimatedCard);
                if (anim && anim.strip !== strip) anim.load(strip);
            });
        }
        // Buttons in the signed-off order and words (mockup 01): Continue, New Run, How to play, Aces, Options, Quit.
        const order: [UiButton | null, string][] = [
            [this.continueButton, ''], [this.newRunButton, 'New Run'], [this.howToPlayButton, 'How to play'],
            [this.achievementsButton, 'Aces'], [this.optionsButton, 'Options'], [this.quitButton, 'Quit'],
        ];
        order.forEach(([b, text], k) => {
            if (!b) return;
            if (text) b.text = text;
            if (b.node.parent?.name === 'Buttons') b.node.setSiblingIndex(k);
        });
        const plaque = content.getChildByName('Plaque');
        if (plaque) plaque.active = false;
        makeLabel(content, 'Logo', 'HANDS OF FATE', { size: 88, spacing: 4, color: INK_TEXT.main, x: -480, y: -45 });
        makeLabel(content, 'Tagline', 'Build poker hands. They fight for you.', { font: 'body', size: 40, color: INK_TEXT.red, x: -480, y: -120 });
        rule(content, 'TitleRule', 640, -800, -172);
        makeLabel(content, 'Modes', 'Endless  ·  Four Kings  ·  Four Aces', { font: 'body', size: 34, color: INK_TEXT.second, x: -480, y: -210 });

        // Best run: a closed rail, BEST small on the left, the round and score in gold on the right.
        const best = content.getChildByName('BestRun');
        if (best) {
            const back = best.getComponent(Sprite);
            if (back) back.enabled = false;
            frame(best, 'Rail', 666, 92, {}, { closed: true }).setSiblingIndex(0);
            const style = (l: Label | null, size: number, col: string, x: number, right: boolean) => {
                if (!l) return;
                l.fontSize = size;
                l.lineHeight = Math.round(size * 1.15);
                l.color = new Color().fromHEX(col);
                l.horizontalAlign = right ? HorizontalTextAlignment.RIGHT : HorizontalTextAlignment.LEFT;
                l.node.getComponent(UITransform)?.setAnchorPoint(right ? 1 : 0, 0.5);
                l.node.setPosition(x, 0);
            };
            const bestLabel = best.getChildByName('BestLabel')?.getComponent(Label) ?? null;
            style(bestLabel, FONT.labelSmall + 4, INK_TEXT.second, -309, false);
            if (bestLabel) bestLabel.string = 'BEST';
            style(this.bestRoundLabel, 44, INK_TEXT.gold, 309, true);
            if (this.bestScoreLabel) this.bestScoreLabel.node.active = false;
        }
        const credit = this.node.getChildByName('Credit')?.getComponent(Label);
        if (credit) credit.color = new Color().fromHEX(INK_TEXT.quiet);
        this.refresh();
    }

    /** Updates every text from the saved state. */
    refresh() {
        const run = Game.canContinue ? Game.run : null;
        if (this.continueButton) {
            this.continueButton.text = run ? `Continue · Round ${run.round}` : 'Continue';
            this.continueButton.interactable = !!run;
        }
        if (this.optionsButton) this.optionsButton.text = 'Options';
        const p = Game.profile;
        if (this.dressed) {
            // One line in the open table: "ROUND 23 · 84,210".
            if (this.bestRoundLabel) this.bestRoundLabel.string = p.bestRound > 0 ? `ROUND ${p.bestRound}  ·  ${p.bestScore.toLocaleString('en-US')}` : '–';
            return;
        }
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
