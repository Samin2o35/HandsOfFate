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

/** Work counters for `npm run perf` (tools/layout/perf.mjs): what Cocos would have to do. */
export const work = { nodes: 0, labels: 0, frames: 0, textures: 0, uploads: 0, colors: 0, destroyed: 0 };

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
    addChild(n: Node) { n.parent = this; this.children.push(n); work.nodes++; }
    removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
    destroy() { this.isValid = false; this.removeFromParent(); work.destroyed++; return true; }
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
    texture: any = null; rect: any = null; packable = true; insetLeft = 0; insetRight = 0; insetTop = 0; insetBottom = 0;
    constructor(public name = '') {}
    reset(info?: any) { if (info?.texture) this.texture = info.texture; if (info?.rect) this.rect = info.rect; }
}
/** Keeps the pixels a texture was made from, so the layout tool can paint them. */
export class ImageAsset { constructor(public src: any = null) {} }
export class Texture2D {
    width = 0; height = 0;
    private _image: any = null;
    get image() { return this._image; }
    set image(v: any) { this._image = v; work.textures++; }
    reset(_info: any) { work.textures++; }
    uploadData(_d: any) { work.uploads++; }
    setFilters() {} setWrapMode() {}
    static PixelFormat = { RGBA8888: 35 };
    static Filter = { NEAREST: 2, LINEAR: 1 };
    static WrapMode = { CLAMP_TO_EDGE: 1, REPEAT: 0 };
}
export class TTFFont {}
export class Font {}
export class Sprite extends Component {
    private _sf: SpriteFrame | null = null; private _col = new Color();
    get spriteFrame() { return this._sf; }
    set spriteFrame(v: SpriteFrame | null) { if (v !== this._sf) work.frames++; this._sf = v; }
    get color() { return this._col; }
    set color(v: Color) { work.colors++; this._col = v; }
    sizeMode = 0; type = 0;
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
    set string(v: string) { const t = String(v); if (t !== this._string) work.labels++; this._string = t; this.measure(); }
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
        const lines = v.replace(/<[^>]+>/g, '').split('\n');
        const lh = this.lineHeight || this.fontSize;
        if (this.maxWidth) {
            const w = this.maxWidth;
            ut.width = w;
            ut.height = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length * this.fontSize * 0.5 / Math.max(1, w))), 0) * lh;
        } else {
            // No wrapping: explicit lines (VT323 is 0.4 em per glyph).
            ut.width = Math.max(...lines.map((l) => l.length)) * this.fontSize * 0.4;
            ut.height = lines.length * lh;
        }
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

/**
 * Tweens. With setSyncTweens(true) they run instantly at start() ('to'/'by' jump to the end,
 * calling onUpdate; 'call' runs). With setTimedTweens(true) they run over time like Cocos's,
 * advanced by tickTweens(dt), so `npm run perf` sees projectiles, trails and numbers live.
 * Otherwise they never run.
 */
export let syncTweens = false;
export function setSyncTweens(on: boolean) { syncTweens = on; }
let timedTweens = false;
export function setTimedTweens(on: boolean) { timedTweens = on; }
type Step = { kind: 'to' | 'by' | 'delay' | 'call'; d: number; props?: any; opts?: any; fn?: () => void };
interface Running { target: any; steps: Step[]; i: number; t: number; from: Record<string, any> | null; }
const running: Running[] = [];
export function activeTweens() { return running.length; }
const isVec = (v: any) => v && typeof v === 'object' && 'x' in v && 'y' in v;
function begin(r: Running) {
    const st = r.steps[r.i];
    r.from = {};
    if ((st.kind === 'to' || st.kind === 'by') && r.target) {
        for (const key of Object.keys(st.props ?? {})) { const v = r.target[key]; r.from[key] = isVec(v) ? new Vec3(v.x, v.y, v.z ?? 0) : v; }
    }
}
function apply(r: Running, k: number) {
    const st = r.steps[r.i];
    if (!r.target || !st.props) return;
    for (const key of Object.keys(st.props)) {
        const a = r.from![key], b = st.props[key];
        let v: any;
        if (isVec(a)) {
            const end = st.kind === 'by' ? new Vec3(a.x + b.x, a.y + b.y, 0) : b;
            v = new Vec3(a.x + (end.x - a.x) * k, a.y + (end.y - a.y) * k, 0);
        } else if (typeof a === 'number') {
            const end = st.kind === 'by' ? a + b : b;
            v = a + (end - a) * k;
        } else v = b;
        try { r.target[key] = v; } catch { /* readonly */ }
    }
}
/** Advances every timed tween by dt seconds. */
export function tickTweens(dt: number) {
    for (const r of running.slice()) {
        let left = dt;
        while (r.i < r.steps.length) {
            const st = r.steps[r.i];
            if (r.from === null) begin(r);
            if (st.kind === 'call') { st.fn?.(); r.i++; r.from = null; continue; }
            const need = st.d - r.t;
            const used = Math.min(left, need);
            r.t += used; left -= used;
            const k = st.d > 0 ? Math.min(1, r.t / st.d) : 1;
            if (st.kind !== 'delay') { apply(r, k); st.opts?.onUpdate?.(); }
            if (r.t >= st.d) { r.i++; r.t = 0; r.from = null; continue; }
            break;
        }
        if (r.i >= r.steps.length) running.splice(running.indexOf(r), 1);
    }
}
function chain(target: any): any {
    const steps: Step[] = [];
    const sync: (() => void)[] = [];
    const t: any = new Proxy(function () {}, {
        get: (_o, k) => {
            if (k === 'then') return undefined;
            if (k === 'to' || k === 'by') return (d: number, props: any, opts?: any) => {
                steps.push({ kind: k, d, props, opts });
                sync.push(() => {
                    if (target && props) for (const key of Object.keys(props)) { try { target[key] = props[key]; } catch { /* readonly */ } }
                    opts?.onUpdate?.();
                });
                return t;
            };
            if (k === 'delay') return (d: number) => { steps.push({ kind: 'delay', d }); return t; };
            if (k === 'call') return (fn: () => void) => { steps.push({ kind: 'call', d: 0, fn }); sync.push(fn); return t; };
            if (k === 'start') return () => {
                if (syncTweens) for (const s of sync) s();
                else if (timedTweens) running.push({ target, steps, i: 0, t: 0, from: null });
                return t;
            };
            return () => t;
        },
        apply: () => t,
    });
    return t;
}
export function tween(target?: any): any { return chain(target); }
export const Tween = { stopAllByTarget(target: any) { for (let i = running.length - 1; i >= 0; i--) if (running[i].target === target) running.splice(i, 1); } };

const store = new Map<string, string>();
export const sys = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    isNative: false, isMobile: false, os: 'web', OS: { ANDROID: 'Android', IOS: 'iOS' }, platform: 'web',
};
export const game = { end() {}, frameRate: 60 };
export const director = { getScene: () => null, getTotalTime: () => 0, getDeltaTime: () => 1 / 60, once(_e: string, fn: () => void) { fn(); } };
export const Director = { EVENT_BEFORE_DRAW: 'director_before_draw' };
export const screen = { windowSize: new Size(1920, 1080), on() {}, off() {} };
export const view = { setDesignResolutionSize() {}, getVisibleSize: () => new Size(1920, 1080), on() {}, off() {} };
export const ResolutionPolicy = { FIXED_WIDTH: 0, FIXED_HEIGHT: 1, SHOW_ALL: 2 };
export const dynamicAtlasManager = { enabled: false };
/** Paths asked of resources.load that have no file under assets/resources (render.ts fails on any). */
export const missingResources = new Set<string>();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeFs = require('fs') as typeof import('fs');
/** Like Cocos: a path without its extension; "…/spriteFrame" and "…/texture" name the image's sub-assets. */
function resourceExists(p: string): boolean {
    const base = p.replace(/\/(spriteFrame|texture)$/, '');
    const dir = 'assets/resources/' + base.split('/').slice(0, -1).join('/');
    const name = base.split('/').pop()!;
    try { return nodeFs.readdirSync(dir).some((f) => !f.endsWith('.meta') && f.replace(/\.[^.]+$/, '') === name); } catch { return false; }
}
export const resources = {
    load(p: string, _t: any, cb: any) {
        if (!resourceExists(p)) { missingResources.add(p); cb?.(new Error(`no file for ${p}`), null); return; }
        if (_t === Texture2D) {
            // A texture with the PNG's real size (read from its header), for code that cuts frames from it.
            const t = new Texture2D();
            try {
                const b = nodeFs.readFileSync('assets/resources/' + p.replace(/\/texture$/, '') + '.png');
                t.width = b.readUInt32BE(16); t.height = b.readUInt32BE(20);
            } catch { /* not a png */ }
            cb?.(null, t);
            return;
        }
        cb?.(null, new SpriteFrame(p));
    },
    loadDir(_p: string, _t: any, cb: any) { cb?.(null, []); },
};
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
