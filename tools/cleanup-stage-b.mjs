// Hands of Fate — tools/cleanup-stage-b.mjs (Stage B, decision 143)
// Deletes the files Stage B retires: the old generated UI kit images, the old reward icons
// and the felt-era art tools. A zip can only add and replace files, so this does the rest.
// Run it once from the project root with Cocos CLOSED:  node tools/cleanup-stage-b.mjs
// Safe to run again: anything already gone is skipped.
import { rmSync, existsSync } from 'node:fs';

const gone = [
    'assets/art', 'assets/art.meta',
    'assets/resources/ui/icons/reward_health.png', 'assets/resources/ui/icons/reward_health.png.meta',
    'assets/resources/ui/icons/reward_grid.png', 'assets/resources/ui/icons/reward_grid.png.meta',
    'assets/scripts/app/Stage1Check.ts', 'assets/scripts/app/Stage1Check.ts.meta',
    'tools/art/make_style_sample.py', 'tools/art/make_mockups.py', 'tools/art/make_ui.py',
    'tools/art/make_itch_art.py', 'tools/art/make_itch_extras.py', 'tools/art/slices.json',
    'tools/art/__pycache__',
];
let n = 0;
for (const p of gone) {
    if (!existsSync(p)) continue;
    rmSync(p, { recursive: true, force: true });
    console.log(`deleted ${p}`);
    n++;
}
console.log(n ? `${n} removed. Now open Cocos.` : 'Nothing to remove (already clean).');
