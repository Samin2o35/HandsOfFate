// Hands of Fate — ui/UiKit.ts
// Holds every UI sprite frame and font in one place, and builds UI nodes in code.
// Put ONE UiKit component on the Canvas and fill its slots once in the Inspector.
// Screens whose content depends on the game (card grids, hand labels, health
// grids) are built with these helpers instead of by hand.
//
// It also preloads all card art and suit icons at start; wait for UiKit.ready
// before building anything that shows cards.

import {
    _decorator, Component, Node, Sprite, SpriteFrame, Label, TTFFont, UITransform, Color,
    Button, resources, Vec3, HorizontalTextAlignment, VerticalTextAlignment, Texture2D, Rect, Size, Vec2,
} from 'cc';
import { Sound } from '../app/Sound';
import { Card, SUITS, Suit, updatedArtPath, classicArtPath, CARD_BACK_PATH, DEALER_CARD_PATH } from '../core/cards';
import { UiButton, ButtonStyle } from './UiButton';
import { whiteFrame } from './kitC';
import { CARD_ATLAS, CARD_ATLAS_W, CARD_ATLAS_H, CARD_RECTS } from './cardAtlas';
const { ccclass, property } = _decorator;

/** Font sizes in one place. VT323 renders small in Cocos, so its sizes are bigger. */
export const FONT = {
    title: 66,        // plaque titles
    heading: 33,      // "Jack of Clubs' table", round number
    button: 36,
    label: 24,        // small caps labels: "THREE OF A KIND", "STASH" (was 21; decision 138)
    labelSmall: 22,   // captions, column labels (was 18; decision 138)
    body: 32,         // VT323 body text
    bodySmall: 27,
};

/** Text and fill colours, the open-table palette (style guide). Same values as kitC.INK_TEXT. */
export const COLOR = {
    ink: '#3B324A',
    cream: '#ECECE0',
    lilac: '#CFC6B8',
    dim: '#6E6276',
    gold: '#FDD164',
    dark: '#16121C',
};

@ccclass('UiKit')
export class UiKit extends Component {
    private static instance: UiKit | null = null;
    private static readyPromise: Promise<void> | null = null;

    @property({ type: TTFFont, tooltip: 'Pixelify Sans SemiBold (headings, buttons, small caps)' }) headingFont: TTFFont | null = null;
    @property({ type: TTFFont, tooltip: 'VT323 (body text, numbers)' }) bodyFont: TTFFont | null = null;

    /** A plain white square (dims, covers, sparks; tinted in code). Drawn at runtime by kitC (Stage B). */
    get spark(): SpriteFrame { return whiteFrame(); }

    private frames = new Map<string, SpriteFrame>();

    static get(): UiKit {
        if (!UiKit.instance) throw new Error('UiKit is missing: add it to the Canvas');
        return UiKit.instance;
    }

    /** Resolves when card art and suit icons are loaded. */
    static get ready(): Promise<void> {
        return UiKit.readyPromise ?? Promise.reject(new Error('UiKit is missing: add it to the Canvas'));
    }

    onLoad() {
        UiKit.instance = this;
        UiKit.readyPromise = this.preload();
    }

    onDestroy() {
        if (UiKit.instance === this) UiKit.instance = null;
    }

    /** Every resources path that frame() can return; anything else is null (decision 133). */
    static readonly PRELOAD_EXTRA: readonly string[] = [CARD_BACK_PATH, DEALER_CARD_PATH, 'concept/king_fallen_1x'];

    private preload(): Promise<void> {
        const single: string[] = UiKit.PRELOAD_EXTRA.slice();
        for (const suit of SUITS) {
            single.push(`ui/icons/suit_${suit}`);
            single.push(`ui/icons/suit_${suit}_spent`);
        }
        const one = (p: string) => new Promise<void>((resolve) => {
            resources.load(`${p}/spriteFrame`, SpriteFrame, (err, frame) => {
                if (err || !frame) console.error(`Missing art: ${p}`, err);
                else this.frames.set(p, frame);
                resolve();
            });
        });
        // Every card of both decks comes from one 1x atlas (tools/art/make_atlas_1x.py, decision 144):
        // the same pixels as the 4x files at every size the game draws, in one texture.
        const cards = new Promise<void>((resolve) => {
            resources.load(`${CARD_ATLAS}/texture`, Texture2D, (err, tex) => {
                if (err || !tex) {
                    // The atlas is the only card art in the game since decision 169.
                    console.error('Card atlas missing: run npm run atlas (tools/art/make_atlas_1x.py).', err);
                    resolve();
                    return;
                }
                tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
                for (const path of Object.keys(CARD_RECTS)) {
                    const [x, y] = CARD_RECTS[path];
                    const sf = new SpriteFrame();
                    sf.reset({ texture: tex, rect: new Rect(x, y, CARD_ATLAS_W, CARD_ATLAS_H), originalSize: new Size(CARD_ATLAS_W, CARD_ATLAS_H), offset: new Vec2(0, 0), isRotate: false });
                    sf.packable = false;
                    sf.name = path;
                    this.frames.set(path, sf);
                }
                resolve();
            });
        });
        return Promise.all(single.filter((p) => !(p in CARD_RECTS)).map(one).concat([cards])).then(() => undefined);
    }

    /** A preloaded frame by resources path ("cards/updated/S_13"), or null. */
    frame(path: string): SpriteFrame | null {
        const f = this.frames.get(path) ?? null;
        if (!f && !this.warned.has(path)) { this.warned.add(path); console.warn(`UiKit.frame: "${path}" is not preloaded (add it to UiKit.PRELOAD_EXTRA)`); }
        return f;
    }
    private warned = new Set<string>();
    cardFrame(card: Pick<Card, 'suit' | 'rank'>): SpriteFrame | null { return this.frame(updatedArtPath(card)); }
    classicFrame(card: Pick<Card, 'suit' | 'rank'>): SpriteFrame | null { return this.frame(classicArtPath(card)); }
    suitIcon(suit: Suit): SpriteFrame | null { return this.frame(`ui/icons/suit_${suit}`); }
    /** Grey pip for a spent heal / armor charge. */
    spentIcon(suit: Suit): SpriteFrame | null { return this.frame(`ui/icons/suit_${suit}_spent`); }
}

// ---- Node helpers ------------------------------------------------------------

export interface Place { x?: number; y?: number; anchorX?: number; anchorY?: number; }

/** An empty UI node (same layer as its parent, so the camera sees it). */
export function makeNode(parent: Node, name: string, w = 0, h = 0, at: Place = {}): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    parent.addChild(n);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    ut.setAnchorPoint(at.anchorX ?? 0.5, at.anchorY ?? 0.5);
    n.setPosition(new Vec3(at.x ?? 0, at.y ?? 0, 0));
    return n;
}

/** A sprite with a fixed size. Sliced for 9-slice panels, simple for art. */
export function makeSprite(parent: Node, name: string, frame: SpriteFrame | null, w: number, h: number, at: Place = {}, sliced = false): Sprite {
    const n = makeNode(parent, name, w, h, at);
    const s = n.addComponent(Sprite);
    s.sizeMode = Sprite.SizeMode.CUSTOM;
    s.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    s.spriteFrame = frame;
    n.getComponent(UITransform)!.setContentSize(w, h);
    return s;
}

export interface TextStyle extends Place {
    font?: 'heading' | 'body';
    size: number;
    color?: string;
    spacing?: number;
    align?: 'left' | 'center' | 'right';
    /** Wrap inside this width (leave out for one line). */
    width?: number;
    /** With width: a fixed box; text that doesn't fit shrinks instead of spilling out. */
    height?: number;
}

export function makeLabel(parent: Node, name: string, text: string, style: TextStyle): Label {
    const kit = UiKit.get();
    const align = style.align ?? 'center';
    const anchorX = style.anchorX ?? (align === 'left' ? 0 : align === 'right' ? 1 : 0.5);
    const n = makeNode(parent, name, style.width ?? 10, style.size, { ...style, anchorX });
    const l = n.addComponent(Label);
    const font = style.font === 'body' ? kit.bodyFont : kit.headingFont;
    if (font) { l.useSystemFont = false; l.font = font; }
    l.fontSize = style.size;
    l.lineHeight = Math.round(style.size * 1.15);
    l.color = new Color().fromHEX(style.color ?? COLOR.cream);
    l.horizontalAlign = align === 'left' ? HorizontalTextAlignment.LEFT : align === 'right' ? HorizontalTextAlignment.RIGHT : HorizontalTextAlignment.CENTER;
    l.verticalAlign = VerticalTextAlignment.CENTER;
    if (style.spacing) l.spacingX = style.spacing;
    const ut = n.getComponent(UITransform)!;
    if (style.width && style.height) {
        l.overflow = Label.Overflow.SHRINK;
        l.enableWrapText = true;
        ut.setContentSize(style.width, style.height);
    } else if (style.width) {
        l.overflow = Label.Overflow.RESIZE_HEIGHT;
        l.enableWrapText = true;
        // Set the width after the overflow mode: a new Label starts with its own default size.
        ut.width = style.width;
    } else {
        l.overflow = Label.Overflow.NONE;
    }
    l.string = text;
    return l;
}

/** A UiButton built in code, with its frames taken from the kit. */
export function makeButton(parent: Node, name: string, style: ButtonStyle, text: string, w: number, h: number, at: Place, onClick: () => void, fontSize = FONT.button): UiButton {
    const n = makeNode(parent, name, w, h, at);
    const s = n.addComponent(Sprite);
    s.sizeMode = Sprite.SizeMode.CUSTOM;
    s.type = Sprite.Type.SLICED;
    n.addComponent(Button);
    const label = makeLabel(n, 'Label', text, { size: fontSize });
    const b = n.addComponent(UiButton);
    b.label = label;
    b.text = text;
    b.style = style;
    n.getComponent(UITransform)!.setContentSize(w, h);
    n.on(Button.EventType.CLICK, () => { Sound.play('click'); onClick(); });
    return b;
}

/** Removes and destroys every child of a node (used to rebuild a view). */
export function clearChildren(n: Node) {
    for (const c of [...n.children]) {
        c.removeFromParent();
        c.destroy();
    }
}

/** Width of a label's text right now (forces Cocos to lay the text out first). */
export function textWidth(l: Label): number {
    l.updateRenderData(true);
    return l.node.getComponent(UITransform)!.width;
}

/** "THREE OF A KIND"-style labels: the font's caps with a little letter spacing. */
export function caps(text: string): string { return text.toUpperCase(); }
