// Hands of Fate — ui/UiButton.ts
// The standard button. Put it on a node that also has a Sprite (Type: SLICED)
// and a Button (Transition: SPRITE), with a Label as a child.
//
//  - Style picks the colour (Red, Cream, Blue, Dark) and sets every sprite and
//    the text colour for you, in the editor too.
//  - While pressed, the face drops into its shadow, so the label drops with it.
//  - Text can be set from code: button.text = 'Continue · Round 6'.
//
// The prefab holds the sprite frames once (Normal / Pressed / Disabled); every
// instance only needs Style and Text.

import {
    _decorator, Component, Sprite, SpriteFrame, Button, Label, Color, Enum, Node, EventTouch,
} from 'cc';
const { ccclass, property, executeInEditMode, requireComponent } = _decorator;

export enum ButtonStyle { Red, Cream, Blue, Dark }
Enum(ButtonStyle);

/** Text colour per style (sampled from the mockups). */
const TEXT_COLOR: Record<ButtonStyle, string> = {
    [ButtonStyle.Red]: '#EFEEE4',
    [ButtonStyle.Cream]: '#2B2438',
    [ButtonStyle.Blue]: '#EFEEE4',
    [ButtonStyle.Dark]: '#EFEEE4',
};
const DISABLED_TEXT = '#6B6577';

/** Shadow height in the button art: the face moves down this far when pressed. */
const SHADOW = 7;

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
        const normal = this.normalFrames[this._style] ?? null;
        const pressed = this.pressedFrames[this._style] ?? normal;
        if (button) {
            button.transition = Button.Transition.SPRITE;
            button.normalSprite = normal;
            button.hoverSprite = normal;
            button.pressedSprite = pressed;
            button.disabledSprite = this.disabledFrame ?? normal;
        }
        const enabled = button ? button.interactable : true;
        if (sprite) {
            sprite.type = Sprite.Type.SLICED;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = enabled ? normal : (this.disabledFrame ?? normal);
        }
        const label = this.labelComp;
        if (label) {
            label.string = this._text;
            label.color = new Color().fromHEX(enabled ? TEXT_COLOR[this._style] : DISABLED_TEXT);
        }
        this.placeLabel();
    }

    private onDown(_e: EventTouch) {
        if (!this.interactable) return;
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
