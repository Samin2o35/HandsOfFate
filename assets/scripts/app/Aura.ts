// Hands of Fate — app/Aura.ts (Stage E, decision 163)
// The boss's aura: a sprite running resources/effects/aura.effect behind a card, so the
// background's pixel smoke gathers round it in his suit colour and climbs like slow flames.
// Replaces the dotted ovals (boss intro, Ace earned). Follows Options → Background motion:
// full moves with full detail, low is slower with one warp, off holds still.
// If the effect can't load the card simply has no aura.

import { _decorator, Component, Node, Sprite, Material, EffectAsset, resources, Vec4, Color, UITransform } from 'cc';
import { makeNode, Place } from '../ui/UiKit';
import { whiteFrame } from '../ui/kitC';
import { Smoke } from './Smoke';
const { ccclass } = _decorator;

/** How far the aura reaches past the card (px): above (flames climb), beside, below. */
export interface AuraReach { above: number; side: number; below: number }
const REACH: AuraReach = { above: 200, side: 110, below: 70 };
const SPEED = { full: 1, low: 0.35, off: 0 };
/** Block size in screen px: the background smoke's grid (1080 / 180). */
const BLOCK = 6;

let effect: Promise<EffectAsset | null> | null = null;
function loadEffect(): Promise<EffectAsset | null> {
    if (!effect) {
        effect = new Promise((resolve) => resources.load('effects/aura', EffectAsset, (err, e) => {
            if (err || !e) { console.warn('[Aura] effects/aura could not load; no aura.', err); resolve(null); return; }
            resolve(e);
        }));
    }
    return effect;
}

@ccclass('Aura')
export class Aura extends Component {
    private sprite: Sprite | null = null;
    private time = Math.random() * 20;
    private tint = new Vec4(1, 1, 1, 1);
    private cardW = 0;
    private cardH = 0;
    /** Card centre above the aura's centre (px, negative: the card sits low so flames have room). */
    private cardY = 0;
    private fade = 0;

    /**
     * An aura round a card `cardW` x `cardH` centred at `at` in `parent`, in `hex`. Add it
     * before the card so it draws behind.
     */
    static attach(parent: Node, name: string, cardW: number, cardH: number, at: Place, hex: string, reach: AuraReach = REACH): Aura {
        const w = cardW + reach.side * 2, h = cardH + reach.above + reach.below;
        const cardY = (reach.below - reach.above) / 2;
        const n = makeNode(parent, name, w, h, { x: at.x ?? 0, y: (at.y ?? 0) - cardY });
        const a = n.addComponent(Aura);
        a.cardW = cardW; a.cardH = cardH; a.cardY = cardY;
        const c = new Color().fromHEX(hex);
        a.tint = new Vec4(c.r / 255, c.g / 255, c.b / 255, 1);
        void loadEffect().then((e) => a.apply(e));
        return a;
    }

    private apply(e: EffectAsset | null) {
        if (!e || !this.node.isValid) return;
        const mat = new Material();
        mat.initialize({ effectAsset: e });
        const sp = this.node.addComponent(Sprite);
        sp.spriteFrame = whiteFrame();
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.customMaterial = mat;
        sp.color = new Color(255, 255, 255, 0);
        this.sprite = sp;
        this.push();
    }

    update(dt: number) {
        if (!this.sprite) return;
        const motion = Smoke.motion();
        this.time += dt * SPEED[motion];
        // Fades in over half a second (the vertex alpha the effect multiplies by).
        if (this.fade < 1) {
            this.fade = Math.min(1, this.fade + dt * 2);
            this.sprite.color = new Color(255, 255, 255, Math.round(255 * this.fade));
        }
        this.push();
    }

    /** Uniforms, in world units (the node may be scaled or moved by its parents). */
    private push() {
        const sp = this.sprite;
        const m = sp?.getMaterialInstance?.(0);
        if (!sp || !m) return;
        const ut = this.node.getComponent(UITransform)!;
        const s = this.node.worldScale, p = this.node.worldPosition;
        m.setProperty('tint', this.tint);
        m.setProperty('area', new Vec4(p.x, p.y, ut.width * s.x / 2, ut.height * s.y / 2));
        m.setProperty('card', new Vec4(this.cardW * s.x / 2, this.cardH * s.y / 2, BLOCK * s.x, this.cardY * s.y));
        m.setProperty('params', new Vec4(this.time, Smoke.motion() === 'full' ? 1 : 0, 0, 0));
    }
}
