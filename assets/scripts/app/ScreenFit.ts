// Hands of Fate — app/ScreenFit.ts
// Put this on the Canvas node. It picks Fit Width or Fit Height from the screen's
// aspect ratio (GDD "Scaling across phones", step 1) and re-runs on every resize.
// It also turns off the dynamic atlas, which would otherwise copy small sprites
// into a shared, linearly filtered texture and blur the pixel art.

import { _decorator, Component, view, screen, ResolutionPolicy, dynamicAtlasManager } from 'cc';
const { ccclass } = _decorator;

export const DESIGN_W = 1080;
export const DESIGN_H = 1920;

@ccclass('ScreenFit')
export class ScreenFit extends Component {
    /** 'width' on tall phones, 'height' on tablets and wide screens. Handy for debug labels. */
    static currentFit: 'width' | 'height' = 'width';

    onLoad() {
        dynamicAtlasManager.enabled = false;
        this.apply();
        screen.on('window-resize', this.apply, this);
        screen.on('orientation-change', this.apply, this);
    }

    onDestroy() {
        screen.off('window-resize', this.apply, this);
        screen.off('orientation-change', this.apply, this);
    }

    private apply() {
        const size = screen.windowSize;
        const ratio = size.width / size.height;
        // Taller than 9:16 -> keep the full 1080 width, extra height becomes breathing room.
        // Wider than 9:16 -> keep the full 1920 height, extra width becomes side margin.
        const fitWidth = ratio < DESIGN_W / DESIGN_H;
        ScreenFit.currentFit = fitWidth ? 'width' : 'height';
        view.setDesignResolutionSize(
            DESIGN_W,
            DESIGN_H,
            fitWidth ? ResolutionPolicy.FIXED_WIDTH : ResolutionPolicy.FIXED_HEIGHT,
        );
    }
}
