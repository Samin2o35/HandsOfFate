// Hands of Fate — tools/layout/cc-mock.ts
// A stand-in for Cocos's 'cc' module, just enough for the code-built screens to run
// in Node and record where every node ends up. Used by tools/layout/render.ts to
// draw layout previews (boxes and text) at different screen shapes. Nothing here is
// shipped with the game.

/* eslint-disable @typescript-eslint/no-explicit-any */

export class Vec3 {
    constructor(public x: any = 0, public y = 0, public z = 0) { if (typeof x === 'object') { this.x = x.x; this.y = x.y; this.z = x.z; } }
    clone() { return new Vec3(this.x, this.y, this.z); }
    add(o: Vec3) { this.x += o.x; this.y += o.y; this.z += o.z; return this; }
    multiplyScalar(k: number) { this.x *= k; this.y *= k; this.z *= k; return this; }
    static distance(a: Vec3, b: Vec3) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
}
export class Vec2 { constructor(public x = 0, public y = 0) {} }
export class Size { constructor(public width = 0, public height = 0) {} }
export class Rect {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
    contains(p: { x: number; y: number }) { return p.x >= this.x && p.x <= this.x + this.width && p.y >= this.y && p.y <= this.y + this.height; }
    get xMin() { return this.x; } get yMin() { return this.y; } get xMax() { return this.x + this.width; } get yMax() { return this.y + this.height; }
}
export class Color {
    constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
    fromHEX(hex: string) {
        const h = hex.replace('#', '');
        this.r = parseInt(h.slice(0, 2), 16); this.g = parseInt(h.slice(2, 4), 16); this.b = parseInt(h.slice(4, 6), 16);
        this.a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
        return this;
    }
    static WHITE = new Color(); static BLACK = new Color(0, 0, 0);
}

export class Component {
    node!: Node;
    enabled = true;
    get isValid() { return this.node?.isValid ?? true; }
    getComponent<T>(c: new () => T): T | null { return this.node.getComponent(c); }
    addComponent<T>(c: new () => T): T { return this.node.addComponent(c); }
    scheduleOnce(fn: () => void) { fn(); }
    schedule() {} unschedule() {} unscheduleAllCallbacks() {}
}

export class Node {
    children: Node[] = [];
    parent: Node | null = null;
    components: Component[] = [];
    position = new Vec3();
    scale = new Vec3(1, 1, 1);
    layer = 1;
    active = true;
    isValid = true;
    constructor(public name = '') {}
    addChild(n: Node) { n.parent = this; this.children.push(n); }
    removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
    destroy() { this.isValid = false; this.removeFromParent(); return true; }
    setParent(p: Node) { this.removeFromParent(); p.addChild(this); }
    setPosition(x: any, y?: number, z?: number) { if (typeof x === 'object') this.position = new Vec3(x.x, x.y, x.z ?? 0); else this.position = new Vec3(x, y ?? 0, z ?? 0); }
    getPosition() { return this.position.clone(); }
    setScale(x: any, y?: number) { if (typeof x === 'object') this.scale = new Vec3(x.x, x.y, 1); else this.scale = new Vec3(x, y ?? x, 1); }
    get worldPosition(): Vec3 {
        let x = this.position.x, y = this.position.y, p = this.parent;
        while (p) { x += p.position.x; y += p.position.y; p = p.parent; }
        return new Vec3(x, y, 0);
    }
    setWorldPosition(v: Vec3) { const w = this.parent?.worldPosition ?? new Vec3(); this.position = new Vec3(v.x - w.x, v.y - w.y, 0); }
    setSiblingIndex(i: number) { if (!this.parent) return; const s = this.parent.children; s.splice(s.indexOf(this), 1); s.splice(Math.min(i, s.length), 0, this); }
    getSiblingIndex() { return this.parent ? this.parent.children.indexOf(this) : 0; }
    getChildByName(n: string) { return this.children.find((c) => c.name === n) ?? null; }
    getChildByPath(p: string) { let cur: Node | null = this; for (const part of p.split('/')) cur = cur?.getChildByName(part) ?? null; return cur; }
    getComponent<T>(c: any): T | null { return (this.components.find((x) => x instanceof c) as any) ?? null; }
    getComponentInChildren<T>(c: any): T | null { const own = this.getComponent<T>(c); if (own) return own; for (const ch of this.children) { const f = ch.getComponentInChildren<T>(c); if (f) return f; } return null; }
    addComponent<T>(c: any): T { const comp = new c(); comp.node = this; this.components.push(comp); (comp as any).__added?.(); return comp; }
    on() {} off() {} once() {} emit() {}
    static EventType = { TOUCH_START: 'touch-start', TOUCH_MOVE: 'touch-move', TOUCH_END: 'touch-end', TOUCH_CANCEL: 'touch-cancel' };
}

export class UITransform extends Component {
    width = 100; height = 100; anchorX = 0.5; anchorY = 0.5;
    get contentSize() { return new Size(this.width, this.height); }
    setContentSize(w: any, h?: number) { if (typeof w === 'object') { this.width = w.width; this.height = w.height; } else { this.width = w; this.height = h ?? this.height; } }
    setAnchorPoint(x: any, y?: number) { if (typeof x === 'object') { this.anchorX = x.x; this.anchorY = x.y; } else { this.anchorX = x; this.anchorY = y ?? 0.5; } }
    getBoundingBoxToWorld() { const w = this.node.worldPosition; return new Rect(w.x - this.width * this.anchorX, w.y - this.height * this.anchorY, this.width, this.height); }
    convertToWorldSpaceAR(v: Vec3) { const w = this.node.worldPosition; return new Vec3(w.x + v.x, w.y + v.y, 0); }
    convertToNodeSpaceAR(v: Vec3) { const w = this.node.worldPosition; return new Vec3(v.x - w.x, v.y - w.y, 0); }
}

export class SpriteFrame {
    texture: any = null; packable = true; insetLeft = 0; insetRight = 0; insetTop = 0; insetBottom = 0;
    constructor(public name = '') {}
    reset() {}
}
/** Keeps the pixels a texture was made from, so the layout tool can paint them. */
export class ImageAsset { constructor(public src: any = null) {} }
export class Texture2D {
    image: any = null;
    setFilters() {} setWrapMode() {}
    static PixelFormat = { RGBA8888: 35 };
    static Filter = { NEAREST: 2, LINEAR: 1 };
    static WrapMode = { CLAMP_TO_EDGE: 1, REPEAT: 0 };
}
export class TTFFont {}
export class Font {}
export class Sprite extends Component {
    spriteFrame: SpriteFrame | null = null; sizeMode = 0; type = 0; color = new Color();
    static SizeMode = { CUSTOM: 0, TRIMMED: 1, RAW: 2 };
    static Type = { SIMPLE: 0, SLICED: 1, TILED: 2, FILLED: 3 };
}
export enum HorizontalTextAlignment { LEFT = 0, CENTER = 1, RIGHT = 2 }
export enum VerticalTextAlignment { TOP = 0, CENTER = 1, BOTTOM = 2 }

/** Approximate glyph widths as a share of the font size (measured from the TTFs). */
const CHAR_W = { heading: 0.62, body: 0.5 };
export class Label extends Component {
    private _string = '';
    fontSize = 40; lineHeight = 40; color = new Color(); font: any = null; useSystemFont = true;
    horizontalAlign = 1; verticalAlign = 1; spacingX = 0; overflow = 0; enableWrapText = false;
    static Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };
    get string() { return this._string; }
    set string(v: string) { this._string = String(v); this.measure(); }
    /** 'body' when the screen passed the body font; the mock UiKit marks its fonts by name. */
    get kind(): 'heading' | 'body' { return this.font?.kind === 'body' ? 'body' : 'heading'; }
    measure() {
        const ut = this.node?.getComponent<UITransform>(UITransform);
        if (!ut) return;
        const w = this._string.length * (this.fontSize * CHAR_W[this.kind] + this.spacingX);
        if (this.overflow === Label.Overflow.NONE) { ut.width = w; ut.height = this.lineHeight || this.fontSize; }
        else if (this.overflow === Label.Overflow.RESIZE_HEIGHT) { const lines = Math.max(1, Math.ceil(w / Math.max(1, ut.width))); ut.height = lines * (this.lineHeight || this.fontSize); }
    }
    updateRenderData() { this.measure(); }
}
export class RichText extends Component {
    private _s = ''; fontSize = 40; lineHeight = 40; maxWidth = 0; horizontalAlign = 0; font: any = null; useSystemFont = true; fontColor = new Color();
    get string() { return this._s; }
    /** Like Cocos: the node grows to the wrapped text (estimated glyph width 0.5 × size). */
    set string(v: string) {
        this._s = v;
        const ut = this.node?.getComponent<UITransform>(UITransform);
        if (!ut) return;
        const plain = v.replace(/<[^>]+>/g, '');
        const w = this.maxWidth || plain.length * this.fontSize * 0.5;
        ut.width = w;
        ut.height = Math.max(1, Math.ceil(plain.length * this.fontSize * 0.5 / Math.max(1, w))) * (this.lineHeight || this.fontSize);
    }
}
export class Widget extends Component {
    isAlignTop = false; isAlignBottom = false; isAlignLeft = false; isAlignRight = false;
    top = 0; bottom = 0; left = 0; right = 0; alignMode = 0; updateAlignment() {}
}
export class Button extends Component { interactable = true; transition = 0; clickEvents: any[] = []; static EventType = { CLICK: 'click' }; static Transition = { NONE: 0, COLOR: 1, SPRITE: 2, SCALE: 3 }; normalSprite: any; hoverSprite: any; pressedSprite: any; disabledSprite: any; }
export class UIOpacity extends Component { opacity = 255; }
export class BlockInputEvents extends Component {}
export class Mask extends Component { type = 0; inverted = false; segments = 64; static Type = { GRAPHICS_RECT: 0, GRAPHICS_ELLIPSE: 1, GRAPHICS_STENCIL: 2, SPRITE_STENCIL: 3 }; }
export class Graphics extends Component {
    lineWidth = 1; strokeColor = new Color(); fillColor = new Color();
    clear() {} arc() {} moveTo() {} lineTo() {} stroke() {} fill() {} rect() {} ellipse() {} circle() {} close() {} roundRect() {}
}
export class Layout extends Component {}
export class AudioClip { name = ''; }
export class AudioSource extends Component { clip: any = null; loop = false; volume = 1; playOnAwake = false; playing = false; play() {} stop() {} pause() {} playOneShot() {} }
export class Prefab { data: any = { name: '' }; }
export class EventTouch { getUILocation() { return new Vec2(); } }
export class Camera extends Component {}
export function instantiate(p: any) { return new Node(p?.data?.name ?? 'Instance'); }

/** Tweens run instantly at start(): 'to'/'by' jump to the end (calling onUpdate), 'call' runs. */
export let syncTweens = false;
export function setSyncTweens(on: boolean) { syncTweens = on; }
function chain(target: any): any {
    const steps: (() => void)[] = [];
    const t: any = new Proxy(function () {}, {
        get: (_o, k) => {
            if (k === 'then') return undefined;
            if (k === 'to' || k === 'by') return (_d: number, props: any, opts?: any) => {
                steps.push(() => {
                    if (target && props) for (const key of Object.keys(props)) { try { target[key] = props[key]; } catch { /* readonly */ } }
                    opts?.onUpdate?.();
                });
                return t;
            };
            if (k === 'call') return (fn: () => void) => { steps.push(fn); return t; };
            if (k === 'start') return () => { if (syncTweens) for (const s of steps) s(); return t; };
            return () => t;
        },
        apply: () => t,
    });
    return t;
}
export function tween(target?: any): any { return chain(target); }
export const Tween = { stopAllByTarget() {} };

const store = new Map<string, string>();
export const sys = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    isNative: false, isMobile: false, os: 'web', OS: { ANDROID: 'Android', IOS: 'iOS' }, platform: 'web',
};
export const game = { end() {}, frameRate: 60 };
export const director = { getScene: () => null, getTotalTime: () => 0, getDeltaTime: () => 1 / 60 };
export const screen = { windowSize: new Size(1920, 1080), on() {}, off() {} };
export const view = { setDesignResolutionSize() {}, getVisibleSize: () => new Size(1920, 1080), on() {}, off() {} };
export const ResolutionPolicy = { FIXED_WIDTH: 0, FIXED_HEIGHT: 1, SHOW_ALL: 2 };
export const dynamicAtlasManager = { enabled: false };
export const resources = { load(p: string, _t: any, cb: any) { cb?.(null, new SpriteFrame(p)); }, loadDir(_p: string, _t: any, cb: any) { cb?.(null, []); } };
export const input = { on() {}, off() {}, once() {} };
export const Input = { EventType: { TOUCH_START: 'touch-start', TOUCH_END: 'touch-end', MOUSE_DOWN: 'mouse-down' } };

function property(...args: any[]): any {
    // @property          -> (target, key)
    // @property(Type)    -> returns a decorator
    // @property({...})   -> returns a decorator
    if (args.length >= 2 && typeof args[1] === 'string') return undefined;
    return () => undefined;
}
const passClass = (..._a: any[]) => (cls: any) => cls;
export const _decorator = {
    ccclass: (_name?: string) => (cls: any) => cls,
    property,
    executeInEditMode: (cls: any) => cls,
    requireComponent: passClass,
    menu: passClass,
    disallowMultiple: (cls: any) => cls,
};
export function Enum<T>(e: T): T { return e; }
export class Vec4 {
    constructor(public x = 0, public y = 0, public z = 0, public w = 0) {}
    clone() { return new Vec4(this.x, this.y, this.z, this.w); }
    equals(o: Vec4) { return o.x === this.x && o.y === this.y && o.z === this.z && o.w === this.w; }
    static lerp(out: Vec4, a: Vec4, b: Vec4, t: number) { out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t; out.w = a.w + (b.w - a.w) * t; return out; }
}
export class EffectAsset {}
export class Material { initialize() {} setProperty() {} }
