// Hands of Fate — ui/UiButton.ts
// The standard button. Put it on a node that also has a Sprite (Type: SLICED)
// and a Button (Transition: SPRITE), with a Label as a child.
//
//  - Style picks the colour (Red, Cream, Blue, Dark) and sets every sprite and
//    the text colour for you, in the editor too.
//  - While pressed, the face drops into its shadow, so the label drops with it.
//  - Text can be set from code: button.text = 'Continue · Round 6'.
//
// Open-table style (plan phase 5): the frames come from ui/kitC.ts, made at runtime,
// so they override any frames set on a prefab. Red = the main action (a red card);
// Cream = the chosen option (a cream card); Dark and Blue = a cream outline;
// not interactable = a quiet outline. Pressed = the card's darker step, no drop.

import {
    _decorator, Component, Sprite, SpriteFrame, Button, Label, Color, Enum, Node, EventTouch,
} from 'cc';
import { Sound } from '../app/Sound';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { buttonFrame } from './kitC';
import { ButtonLook } from './pixelart';
const { ccclass, property, executeInEditMode, requireComponent } = _decorator;

export enum ButtonStyle { Red, Cream, Blue, Dark }
Enum(ButtonStyle);

/** Text colour per style (open table). */
const TEXT_COLOR: Record<ButtonStyle, string> = {
    [ButtonStyle.Red]: '#ECECE0',
    [ButtonStyle.Cream]: '#3B324A',
    [ButtonStyle.Blue]: '#ECECE0',
    [ButtonStyle.Dark]: '#ECECE0',
};
const DISABLED_TEXT = '#6E6276';
const LOOK: Record<ButtonStyle, ButtonLook> = {
    [ButtonStyle.Red]: 'red', [ButtonStyle.Cream]: 'cream', [ButtonStyle.Blue]: 'outline', [ButtonStyle.Dark]: 'outline',
};

/** The cards have no drop shadow: a press only darkens the card. */
const SHADOW = 0;

@ccclass('UiButton')
@executeInEditMode
@requireComponent(Button)
export class UiButton extends Component {
    @property({ type: [SpriteFrame], tooltip: 'Normal frames in style order: Red, Cream, Blue, Dark.' })
    normalFrames: SpriteFrame[] = [];

    @property({ type: [SpriteFrame], tooltip: 'Pressed frames in style order: Red, Cream, Blue, Dark.' })
    pressedFrames: SpriteFrame[] = [];

    @property({ type: SpriteFrame, tooltip: 'Frame used when the button is not interactable.' })
    disabledFrame: SpriteFrame | null = null;

    @property({ type: Label, tooltip: 'The child label. Found automatically if left empty.' })
    label: Label | null = null;

    // Saved values (names starting with _ are hidden in the Inspector).
    @property
    _style: ButtonStyle = ButtonStyle.Cream;

    @property({ type: ButtonStyle })
    get style(): ButtonStyle { return this._style; }
    set style(v: ButtonStyle) { this._style = v; this.applyStyle(); }

    @property
    _text = 'Button';

    @property
    get text(): string { return this._text; }
    set text(v: string) { this._text = v; if (this.labelComp) this.labelComp.string = v; }

    private pressed = false;

    private get labelComp(): Label | null {
        return this.label ?? this.getComponentInChildren(Label);
    }

    onLoad() {
        this.applyStyle();
        this.node.on(Node.EventType.TOUCH_START, this.onDown, this);
        this.node.on(Node.EventType.TOUCH_END, this.onUp, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onUp, this);
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this.onDown, this);
        this.node.off(Node.EventType.TOUCH_END, this.onUp, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onUp, this);
    }

    /** Turns the button on or off (off = grey, no clicks). */
    set interactable(on: boolean) {
        const b = this.getComponent(Button);
        if (b) b.interactable = on;
        this.applyStyle();
    }
    get interactable(): boolean {
        return this.getComponent(Button)?.interactable ?? true;
    }

    /** Sets frames, Button transition sprites and text colour for the current style. */
    applyStyle() {
        const sprite = this.getComponent(Sprite);
        const button = this.getComponent(Button);
        // In the real editor (not its preview), leave the prefab's own frames alone: runtime frames
        // must never be saved into a prefab. The text is plain prefab data, so it is set there too.
        // EDITOR is also true in the editor's preview, so it can't be used here (decision 132).
        if (EDITOR_NOT_IN_PREVIEW) {
            const l = this.labelComp;
            if (l && l.string !== this._text) l.string = this._text;
            return;
        }
        const look = LOOK[this._style] ?? 'outline';
        const normal = buttonFrame(look);
        const pressed = buttonFrame(look, true);
        const disabled = buttonFrame('muted');
        if (button) {
            button.transition = Button.Transition.SPRITE;
            button.normalSprite = normal;
            button.hoverSprite = normal;
            button.pressedSprite = pressed;
            button.disabledSprite = disabled;
        }
        const enabled = button ? button.interactable : true;
        if (sprite) {
            sprite.type = Sprite.Type.SLICED;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = enabled ? normal : disabled;
        }
        const label = this.labelComp;
        if (label) {
            label.string = this._text;
            label.color = new Color().fromHEX(enabled ? TEXT_COLOR[this._style] : DISABLED_TEXT);
        }
        this.placeLabel();
    }

    private onDown(_e: EventTouch) {
        if (!this.interactable) { Sound.play('deny'); return; }
        this.pressed = true;
        this.placeLabel();
    }

    private onUp() {
        this.pressed = false;
        this.placeLabel();
    }

    /** Centres the label on the face: above the shadow normally, lower when pressed. */
    private placeLabel() {
        const label = this.labelComp;
        if (!label) return;
        const p = label.node.position;
        label.node.setPosition(p.x, this.pressed ? -SHADOW / 2 : SHADOW / 2, p.z);
    }
}
