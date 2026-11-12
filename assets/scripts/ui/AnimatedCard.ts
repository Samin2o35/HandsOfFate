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


/** Frames of each loaded strip, cut once (decision 165). */
const STRIP_FRAMES = new Map<string, SpriteFrame[]>();

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
        // every size the game draws. The 4x originals are not in the game since decision 169.
        const small = strip.startsWith('anim/') ? `anim1x/${strip.slice(5)}` : strip;
        const ready = (frames: SpriteFrame[]) => {
            if (this.strip !== strip || !this.isValid) return; // a newer load() replaced this one
            this.frames = frames;
            this.loadedStrip = strip;
            this.time = this.randomStart ? Math.random() * ANIM_FRAMES / this.fps : 0;
            this.showFrame();
        };
        // Cut once per strip and shared by every card showing it, so no frames pile up (decision 165).
        const cut = STRIP_FRAMES.get(small);
        if (cut) { ready(cut); return; }
        resources.load(`${small}/texture`, Texture2D, (err, tex) => {
            if (err || !tex) { console.error(`Missing animation strip: ${small}`, err); return; }
            tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
            const fw = Math.round(tex.width / ANIM_FRAMES), fh = tex.height;
            const frames: SpriteFrame[] = [];
            for (let i = 0; i < ANIM_FRAMES; i++) {
                const frame = new SpriteFrame();
                frame.reset({ texture: tex, rect: new Rect(i * fw, 0, fw, fh), originalSize: new Size(fw, fh), offset: new Vec2(0, 0), isRotate: false });
                frames.push(frame);
            }
            STRIP_FRAMES.set(small, frames);
            ready(frames);
        });
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
