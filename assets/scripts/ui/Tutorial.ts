// Hands of Fate — ui/Tutorial.ts
// The tutorial (GDD "Title screen and tutorial"): a narrator, a spotlight on one
// thing at a time, and a button, with Skip always available. It runs during the
// first run (the fixed tutorial deck) across the real screens:
//   1 planning  Welcome: your health grid is your life.
//   2 planning  Every full row and column is a hand. Drag the 10♣ in to finish row 3.
//   3 planning  Suits decide the effect (and the highest card breaks ties). → Fight!
//   4 fight     Hearts and diamonds run out (3 uses), spades and clubs don't.
//   5 round won Take one of their cards, then pick a reward.
//   6 planning  Round 2: merge the two 3♦ in the Forge.
// The step is saved in settings, so closing the game mid-tutorial resumes it.

import { Node, UITransform, Color, Rect, Vec3, Mask, Graphics, RichText, BlockInputEvents } from 'cc';
import { Sound } from '../app/Sound';
import { Game } from '../app/Game';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, FONT, COLOR } from './UiKit';
import { ButtonStyle } from './UiButton';
import { AnimatedCard } from './AnimatedCard';

export const TUTORIAL_STEPS = 6;

/** Colours for words in the Dealer's lines (mockups 02–04). */
const C = {
    gold: '#E9C46A', hearts: '#FF8FB0', diamonds: '#8FB8E0', spades: '#C38FD6', clubs: '#6FCF8A', red: '#E86A5F',
};
const w = (text: string, color: string) => `<color=${color}>${text}</color>`;

export const STEP_TEXT: Record<number, string> = {
    1: `Welcome, I'm the Dealer. This grid is your ${w('health', C.gold)}: lose every cell and the run is over.`,
    2: `Every ${w('full', C.gold)} row and column is a poker hand. Row 3 isn't full yet.\nDrag the ${w('10 of Clubs', C.clubs)} in to finish it.`,
    3: `Suits decide what a hand does. Mixed suits? The ${w("highest card's suit", C.gold)} wins, so your ${w('Jack of Spades', C.spades)} makes the straight attack.`,
    4: `${w('Hearts', C.hearts)} and ${w('diamonds', C.diamonds)} run out: 3 uses a fight. Watch the pips.\n${w('Spades', C.spades)} and ${w('clubs', C.clubs)} never stop, and ${w('rotted', C.clubs)} cells can't be healed.`,
    5: `Round won! Always take ${w('one of their cards', C.gold)}, then pick ${w('Health', C.red)}, ${w('Grid', C.gold)} or ${w('Cards', C.diamonds)}.`,
    6: `Round 2. Two ${w('3 of Diamonds', C.diamonds)}? Merge them in the ${w('Forge', C.gold)}: one card, plus an upgrade of your choice.`,
};

// ---- State ---------------------------------------------------------------------

/** The current step, or 0 when no tutorial is running. */
export function tutorialStep(): number {
    const run = Game.run;
    if (!run || !run.data.tutorial || Game.settings.tutorialDone) return 0;
    return Game.settings.tutorialStep || 1;
}

export function setTutorialStep(step: number) {
    if (step > TUTORIAL_STEPS) { finishTutorial(); return; }
    Game.settings.tutorialStep = step;
    Game.saveSettings();
}

export function finishTutorial() {
    Game.settings.tutorialDone = true;
    Game.settings.tutorialStep = 0;
    Game.saveSettings();
}

// ---- Overlay -------------------------------------------------------------------

export interface TutorialView {
    step: number;
    /** What to light up, in world space (null = dim everything a little). */
    spot: Rect | null;
    button: string;
    onButton: () => void;
    /** Called after Skip tutorial. */
    onSkip?: () => void;
    /** Where the Dealer sits. */
    at: 'bottom' | 'top';
    /** Extra content under the text (step 3's suit legend): draws at top y, returns the y below it. */
    extra?: (parent: Node, width: number, left: number, top: number) => number;
}

/** Builds the overlay on `host` (a full-screen screen node). Destroy the returned node to remove it. */
/** The tutorial step whose Dealer panel last played its sound. */
let lastSoundStep = 0;

export function showTutorial(host: Node, v: TutorialView): Node {
    const kit = UiKit.get();
    const hostUt = host.getComponent(UITransform)!;
    const W = hostUt.width, H = hostUt.height;
    const cw = Math.min(W, 1080);
    const overlay = makeNode(host, 'Tutorial', W, H);
    // The panel is rebuilt whenever its screen rebuilds; the sound is for a new step only.
    if (v.step !== lastSoundStep) { lastSoundStep = v.step; Sound.play('dealer'); }
    const dimColor = new Color(10, 8, 16, 165);

    // Dim everything except an ellipse around the spot (an inverted ellipse mask).
    if (v.spot) {
        const centre = hostUt.convertToNodeSpaceAR(new Vec3(v.spot.x + v.spot.width / 2, v.spot.y + v.spot.height / 2, 0));
        const ew = v.spot.width * 1.25 + 40, eh = v.spot.height * 1.3 + 40;
        const maskNode = makeNode(overlay, 'Spotlight', ew, eh, { x: centre.x, y: centre.y });
        const mask = maskNode.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_ELLIPSE;
        mask.segments = 64;
        mask.inverted = true;
        const dim = makeSprite(maskNode, 'Dim', kit.spark, W * 2, H * 2, { x: -centre.x, y: -centre.y });
        dim.color = dimColor;
        // Dashed gold outline.
        const ring = makeNode(overlay, 'Outline', ew, eh, { x: centre.x, y: centre.y });
        const g = ring.addComponent(Graphics);
        g.lineWidth = 4;
        g.strokeColor = new Color().fromHEX(C.gold);
        const steps = 72;
        for (let i = 0; i < steps; i += 2) {
            const a0 = (i / steps) * Math.PI * 2, a1 = ((i + 1) / steps) * Math.PI * 2;
            g.moveTo(Math.cos(a0) * ew / 2, Math.sin(a0) * eh / 2);
            g.lineTo(Math.cos(a1) * ew / 2, Math.sin(a1) * eh / 2);
        }
        g.stroke();
    } else {
        const dim = makeSprite(overlay, 'Dim', kit.spark, W, H);
        dim.color = new Color(10, 8, 16, 110);
    }

    // Skip tutorial, top right.
    makeButton(overlay, 'Skip', ButtonStyle.Dark, 'Skip tutorial', 240, 70, { x: cw / 2 - 30 - 120, y: H / 2 - 165 }, () => {
        finishTutorial();
        if (overlay.isValid) overlay.destroy();
        v.onSkip?.();
    }, 24);

    // The Dealer: animated Joker, then the line, the button and "n / 6".
    // The panel sizes itself to its text (measured first), plus any extra content.
    const panelW = cw - 60;
    const textW = panelW - 220;
    const textLeft = -panelW / 2 + 190;
    const panel = makeNode(overlay, 'Dealer', panelW, 300);
    panel.addComponent(BlockInputEvents); // the buttons under the Dealer can't be pressed by mistake
    const back = makeSprite(panel, 'Back', kit.panelDark, panelW, 306, {}, true);
    back.color = new Color(255, 255, 255, 235);

    const textNode = makeNode(panel, 'Text', textW, 10, { x: textLeft, anchorX: 0, anchorY: 1 });
    const rt = textNode.addComponent(RichText);
    if (kit.bodyFont) { rt.useSystemFont = false; rt.font = kit.bodyFont; }
    rt.fontSize = FONT.body;
    rt.lineHeight = 38;
    rt.maxWidth = textW;
    rt.fontColor = new Color().fromHEX(COLOR.cream);
    rt.string = STEP_TEXT[v.step] ?? '';
    const textH = Math.max(38, textNode.getComponent(UITransform)!.height);

    // Stack from the panel top (y = 0 here), then centre everything at the end.
    const pad = 30;
    let y = -pad;
    textNode.setPosition(textLeft, y);
    y -= textH + 16;
    const body = makeNode(panel, 'Body', 0, 0);
    if (v.extra) y = v.extra(body, textW, textLeft, y) - 16;
    const buttonY = y - 43;
    makeButton(body, 'Next', ButtonStyle.Cream, v.button, 260, 86, { x: textLeft + 130, y: buttonY }, () => v.onButton(), 30);
    makeLabel(body, 'Count', `${v.step} / ${TUTORIAL_STEPS}`, { font: 'body', size: FONT.bodySmall, color: COLOR.lilac, align: 'left', x: textLeft + 290, y: buttonY });
    y -= 86 + pad;
    const panelH = Math.max(260, -y);

    // Now place everything around the panel's centre.
    const shift = panelH / 2;
    textNode.setPosition(textLeft, textNode.position.y + shift);
    body.setPosition(0, shift);
    panel.getComponent(UITransform)!.setContentSize(panelW, panelH);
    back.node.getComponent(UITransform)!.setContentSize(panelW, panelH + 6);
    back.node.setPosition(0, -3);
    const joker = makeSprite(panel, 'Joker', kit.frame('cards/updated/joker_true'), 120, 168, { x: -panelW / 2 + 90, y: panelH / 2 - pad - 84 });
    const anim = joker.node.addComponent(AnimatedCard);
    anim.strip = 'anim/joker_true';
    makeLabel(panel, 'Name', 'The Dealer', { font: 'body', size: 24, color: COLOR.lilac, x: -panelW / 2 + 90, y: panelH / 2 - pad - 186 });

    panel.setPosition(0, v.at === 'bottom' ? -H / 2 + 40 + panelH / 2 : H / 2 - 150 - panelH / 2);
    return overlay;
}

/** Step 3's legend: the four suits and what they do. Returns the y below it. */
export function suitLegend(parent: Node, width: number, left: number, top: number): number {
    const kit = UiKit.get();
    const box = makeSprite(parent, 'Legend', kit.panelDark, width, 96, { x: left + width / 2, y: top - 48 }, true).node;
    const items: [string, 'S' | 'H' | 'C' | 'D'][] = [['Attack · forever', 'S'], ['Rot · forever', 'C'], ['Heal · 3 a fight', 'H'], ['Armor · 3 a fight', 'D']];
    items.forEach(([text, suit], i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = -width / 2 + 30 + col * (width / 2);
        const y = 18 - row * 36;
        makeSprite(box, `Icon${i}`, kit.suitIcon(suit), 22, 22, { x: x + 11, y });
        makeLabel(box, `Text${i}`, text, { font: 'body', size: 26, color: COLOR.cream, align: 'left', x: x + 32, y });
    });
    return top - 96;
}
