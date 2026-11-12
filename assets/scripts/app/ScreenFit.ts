// Hands of Fate — app/ScreenFit.ts
// Put this on the Canvas node. It picks Fit Width or Fit Height from the screen's
// aspect ratio (GDD "Scaling across phones", step 1) and re-runs on every resize.
// Landscape only: the design is 1920×1080.
// It also turns off the dynamic atlas, which would otherwise copy small sprites
// into a shared, linearly filtered texture and blur the pixel art.

import { _decorator, Component, view, screen, ResolutionPolicy, DynamicAtlasManager } from 'cc';
const { ccclass } = _decorator;

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

@ccclass('ScreenFit')
export class ScreenFit extends Component {
    /** 'height' on wide phones (wider than 16:9), 'width' on tablets. Handy for debug labels. */
    static currentFit: 'width' | 'height' = 'height';

    onLoad() {
        DynamicAtlasManager.instance.enabled = false;
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
        // Wider than 16:9 (most phones) -> keep the full 1080 height, extra width becomes side room.
        // Narrower (tablets, 4:3, 16:10) -> keep the full 1920 width, extra height becomes room above and below.
        const fitWidth = ratio < DESIGN_W / DESIGN_H;
        ScreenFit.currentFit = fitWidth ? 'width' : 'height';
        view.setDesignResolutionSize(
            DESIGN_W,
            DESIGN_H,
            fitWidth ? ResolutionPolicy.FIXED_WIDTH : ResolutionPolicy.FIXED_HEIGHT,
        );
    }
}
