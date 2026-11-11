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
import { DEALER_CARD_PATH } from '../core/cards';
import { wrapRich, monoColumns } from './richwrap';
import { STEP_TEXT, DEALER_WORD as C } from './tutorialText';
import { frame } from './kitC';

export const TUTORIAL_STEPS = 6;

// The Dealer's lines and their word colours live in ui/tutorialText.ts (plain TS, tested).
export { STEP_TEXT } from './tutorialText';

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
    /** Where the Dealer sits: top or bottom centre, or over the left or right of the table. */
    at: 'bottom' | 'top' | 'left' | 'right';
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
    const tableW = Math.min(W, 1920);
    const onSide = v.at === 'left' || v.at === 'right';
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

    // Skip tutorial: top right, or just above the Dealer when he sits at the side (placed below).
    const skip = makeButton(overlay, 'Skip', ButtonStyle.Dark, 'Skip tutorial', 240, 70, { x: cw / 2 - 30 - 120, y: H / 2 - 165 }, () => {
        finishTutorial();
        if (overlay.isValid) overlay.destroy();
        v.onSkip?.();
    }, 24);

    // The Dealer: animated Joker, then the line, the button and "n / 6".
    // The panel sizes itself to its text (measured first), plus any extra content.
    const panelW = onSide ? 720 : cw - 60;
    const textW = panelW - 220;
    const textLeft = -panelW / 2 + 190;
    const panel = makeNode(overlay, 'Dealer', panelW, 300);
    panel.addComponent(BlockInputEvents); // the buttons under the Dealer can't be pressed by mistake

    const textNode = makeNode(panel, 'Text', textW, 10, { x: textLeft, anchorX: 0, anchorY: 1 });
    const rt = textNode.addComponent(RichText);
    if (kit.bodyFont) { rt.useSystemFont = false; rt.font = kit.bodyFont; }
    rt.fontSize = FONT.body;
    rt.lineHeight = 38;
    // Wrapped here, not by Cocos: its wrapping drops the space before a coloured word (ui/richwrap.ts).
    rt.maxWidth = 0;
    rt.fontColor = new Color().fromHEX(COLOR.cream);
    rt.string = wrapRich(STEP_TEXT[v.step] ?? '', monoColumns(textW, FONT.body));
    const textH = Math.max(38, textNode.getComponent(UITransform)!.height);

    // Stack from the panel top (y = 0 here), then centre everything at the end.
    const pad = 30;
    let y = -pad;
    textNode.setPosition(textLeft, y);
    y -= textH + 16;
    const body = makeNode(panel, 'Body', 0, 0);
    if (v.extra) y = v.extra(body, textW, textLeft, y) - 16;
    const buttonY = y - 43;
    makeButton(body, 'Next', ButtonStyle.Red, v.button, 260, 86, { x: textLeft + 130, y: buttonY }, () => v.onButton(), 30);
    makeLabel(body, 'Count', `${v.step} / ${TUTORIAL_STEPS}`, { font: 'body', size: FONT.bodySmall, color: COLOR.lilac, align: 'left', x: textLeft + 290, y: buttonY });
    y -= 86 + pad;
    const panelH = Math.max(260, -y);

    // Now place everything around the panel's centre.
    const shift = panelH / 2;
    textNode.setPosition(textLeft, textNode.position.y + shift);
    body.setPosition(0, shift);
    panel.getComponent(UITransform)!.setContentSize(panelW, panelH);
    // The one filled box of the open table: room dark inside a cream rail, so his words read over the dim.
    frame(panel, 'Back', panelW, panelH, {}, { closed: true, fill: 'room0', caption: 'THE DEALER' }).setSiblingIndex(0);
    const joker = makeSprite(panel, 'Joker', kit.frame(DEALER_CARD_PATH), 120, 168, { x: -panelW / 2 + 90, y: panelH / 2 - pad - 84 });
    const anim = joker.node.addComponent(AnimatedCard);
    anim.strip = 'anim/joker_true';

    if (onSide) {
        const px = (v.at === 'right' ? 1 : -1) * (tableW / 2 - 40 - panelW / 2);
        panel.setPosition(px, 0);
        skip.node.setPosition(px + panelW / 2 - 120, panelH / 2 + 20 + 35);
    }
    else panel.setPosition(0, v.at === 'bottom' ? -H / 2 + 40 + panelH / 2 : H / 2 - 150 - panelH / 2);
    return overlay;
}

/** Step 3's legend: the four suits and what they do. Returns the y below it. */
export function suitLegend(parent: Node, width: number, left: number, top: number): number {
    const kit = UiKit.get();
    const box = frame(parent, 'Legend', width, 96, { x: left + width / 2, y: top - 48 }, { closed: true });
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
