// Hands of Fate — ui/AnimatedCard.ts
// Plays one of the animated face-card strips (8 frames side by side, each
// 360×504) on a Sprite. Used for the title fan, the bosses and the Dealer.
//
// Put it on a node with a Sprite (Size Mode: CUSTOM) and set Strip, e.g.
//   anim/H_14        animated A♥
//   anim/joker_true  the Dealer

import { _decorator, Component, Sprite, SpriteFrame, Texture2D, Rect, Size, Vec2, resources } from 'cc';
import { ANIM_FRAMES } from '../core/cards';
const { ccclass, property, requireComponent } = _decorator;


@ccclass('AnimatedCard')
@requireComponent(Sprite)
export class AnimatedCard extends Component {
    @property({ tooltip: 'Path under assets/resources, without extension: anim/H_14' })
    strip = 'anim/H_14';

    @property({ tooltip: 'Frames per second.' })
    fps = 8;

    @property({ tooltip: 'Start on a random frame so a row of cards doesn\'t move in step.' })
    randomStart = true;

    private frames: SpriteFrame[] = [];
    private time = 0;
    private loadedStrip = '';

    start() {
        this.load(this.strip);
    }

    /** Switches to another strip at runtime (e.g. a different boss). */
    load(strip: string) {
        this.strip = strip;
        // The 1x copy of the strip (anim/X → anim1x/X, tools/art/make_atlas_1x.py): the same pixels at
        // every size the game draws, a sixteenth of the memory. Falls back to the 4x file.
        const small = strip.startsWith('anim/') ? `anim1x/${strip.slice(5)}` : '';
        const use = (tex: Texture2D) => {
            if (this.strip !== strip) return; // a newer load() replaced this one
            tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
            const fw = Math.round(tex.width / ANIM_FRAMES), fh = tex.height;
            this.frames = [];
            for (let i = 0; i < ANIM_FRAMES; i++) {
                const frame = new SpriteFrame();
                frame.reset({
                    texture: tex,
                    rect: new Rect(i * fw, 0, fw, fh),
                    originalSize: new Size(fw, fh),
                    offset: new Vec2(0, 0),
                    isRotate: false,
                });
                this.frames.push(frame);
            }
            this.loadedStrip = strip;
            this.time = this.randomStart ? Math.random() * ANIM_FRAMES / this.fps : 0;
            this.showFrame();
        };
        const big = () => resources.load(`${strip}/texture`, Texture2D, (err, tex) => {
            if (err || !tex) { console.error(`Missing animation strip: ${strip}`, err); return; }
            use(tex);
        });
        if (!small) { big(); return; }
        resources.load(`${small}/texture`, Texture2D, (err, tex) => { if (err || !tex) big(); else use(tex); });
    }

    update(dt: number) {
        if (this.frames.length === 0) return;
        this.time += dt;
        this.showFrame();
    }

    private showFrame() {
        const sprite = this.getComponent(Sprite);
        if (!sprite || this.frames.length === 0 || this.loadedStrip !== this.strip) return;
        const i = Math.floor(this.time * this.fps) % this.frames.length;
        if (sprite.spriteFrame !== this.frames[i]) sprite.spriteFrame = this.frames[i];
    }
}
