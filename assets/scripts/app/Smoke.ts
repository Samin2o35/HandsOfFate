// Hands of Fate — app/Smoke.ts (plan phase 3)
// The coloured smoke behind the table: a full-screen sprite with
// resources/effects/smoke.effect, behind every screen. ScreenManager adds it to
// the Canvas (no editor step). Screens tell it what to show:
//   Smoke.tint(suit)      a King's suit colour, or null for the felt colour; fades over ~1.5 s
//   Smoke.puff(world, s)  a push through the smoke (a hand firing, a big hit)
//   Smoke.mood(dark)      darker and slower (the run is lost)
// Background motion (Options): full, low (slower, no puffs) or off (hidden, plain room colour).
// If the effect can't load, the game simply has no smoke.

import { _decorator, Component, UITransform, Sprite, Material, EffectAsset, resources, Vec3, Vec4, Color, view } from 'cc';
import { Suit, SUIT_COLOR_HEX } from '../core/cards';
import { UiKit, makeNode } from '../ui/UiKit';
import { Game } from './Game';

const { ccclass } = _decorator;

export type Motion = 'full' | 'low' | 'off';

/** Normal tables: the ♣ felt green, half strength. Kings: their suit, full strength. */
const FELT = '#309C63';
const FELT_STRENGTH = 0.45;
const TINT_SECONDS = 1.5;
const SPEED: Record<Motion, number> = { full: 1, low: 0.35, off: 0 };

function hexVec(hex: string, a: number): Vec4 {
    const c = new Color().fromHEX(hex);
    return new Vec4(c.r / 255, c.g / 255, c.b / 255, a);
}

@ccclass('Smoke')
export class Smoke extends Component {
    private static instance: Smoke | null = null;

    private sprite: Sprite | null = null;
    private material: Material | null = null;
    private time = 0;
    private tintNow = hexVec(FELT, FELT_STRENGTH);
    private tintFrom = hexVec(FELT, FELT_STRENGTH);
    private tintTo = hexVec(FELT, FELT_STRENGTH);
    private tintT = 1;
    private dark = 0;
    private darkTo = 0;
    private puffAt = new Vec4(0.5, 0.5, 9, 0);
    private failed = false;

    // ---- Screens call these -------------------------------------------------------------

    static tint(suit: Suit | null) {
        const s = Smoke.instance;
        if (!s) return;
        const to = suit ? hexVec(SUIT_COLOR_HEX[suit], 1) : hexVec(FELT, FELT_STRENGTH);
        if (to.equals(s.tintTo)) return;
        s.tintFrom = s.tintNow.clone();
        s.tintTo = to;
        s.tintT = 0;
    }

    /** strength about 0.3 (a hand firing) to 1 (a big hit). */
    static puff(world: Vec3, strength = 0.4) {
        const s = Smoke.instance;
        if (!s || Smoke.motion() !== 'full') return;
        const ut = s.node.getComponent(UITransform);
        if (!ut) return;
        // World → 0..1 of the screen (the Canvas is centred on the screen).
        const vs = view.getVisibleSize();
        const local = ut.convertToNodeSpaceAR(world);
        s.puffAt = new Vec4(0.5 + local.x / vs.width, 0.5 + local.y / vs.height, 0, Math.min(1, strength));
    }

    static mood(dark: boolean) {
        if (Smoke.instance) Smoke.instance.darkTo = dark ? 1 : 0;
    }

    static motion(): Motion {
        return (Game.settings.motion ?? 'full') as Motion;
    }

    /** Options changed the setting: show or hide at once. */
    static applyMotion() {
        const s = Smoke.instance;
        if (s?.sprite) s.sprite.node.active = Smoke.motion() !== 'off' && !s.failed;
    }

    // ---- Lifecycle ---------------------------------------------------------------------------

    onLoad() {
        Smoke.instance = this;
        UiKit.ready.then(() => this.create());
    }

    onDestroy() {
        if (Smoke.instance === this) Smoke.instance = null;
    }

    private create() {
        resources.load('effects/smoke', EffectAsset, (err, effect) => {
            if (err || !effect || !this.node.isValid) {
                this.failed = true;
                console.warn('[Smoke] effects/smoke could not load; no smoke background.', err);
                return;
            }
            const mat = new Material();
            mat.initialize({ effectAsset: effect });
            // Behind everything else on the Canvas.
            const n = makeNode(this.node, 'Smoke', 10, 10);
            n.setSiblingIndex(0);
            const sp = n.addComponent(Sprite);
            sp.spriteFrame = UiKit.get().spark;
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.customMaterial = mat;
            this.sprite = sp;
            this.material = mat;
            Smoke.applyMotion();
            this.fit();
        });
    }

    /** Cover the whole Canvas (it can be wider or taller than 1920×1080). */
    private fit() {
        const n = this.sprite?.node;
        const ut = this.node.getComponent(UITransform);
        if (!n || !ut) return;
        n.getComponent(UITransform)!.setContentSize(ut.width + 4, ut.height + 4);
        n.setPosition(0, 0, 0);
    }

    update(dt: number) {
        if (!this.sprite || !this.sprite.node.active) return;
        this.fit();
        const motion = Smoke.motion();
        const slow = 1 - this.dark * 0.6;
        this.time += dt * SPEED[motion] * slow;

        if (this.tintT < 1) {
            this.tintT = Math.min(1, this.tintT + dt / TINT_SECONDS);
            const k = this.tintT * this.tintT * (3 - 2 * this.tintT);
            Vec4.lerp(this.tintNow, this.tintFrom, this.tintTo, k);
        }
        this.dark += (this.darkTo - this.dark) * Math.min(1, dt * 1.5);
        this.puffAt.z += dt;

        // The smoke's pixel grid: 180 rows, columns to match the screen's shape.
        const vs = view.getVisibleSize();
        const rows = 180;
        const cols = Math.round(rows * vs.width / Math.max(1, vs.height));

        const m = this.sprite.getMaterialInstance(0) ?? this.material;
        if (!m) return;
        m.setProperty('tint', this.tintNow);
        m.setProperty('params', new Vec4(this.time, this.dark, motion === 'full' ? 1 : 0, 0));
        m.setProperty('puff', this.puffAt);
        m.setProperty('grid', new Vec4(cols, rows, 0, 0));
    }
}

