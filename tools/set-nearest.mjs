// Hands of Fate — tools/set-nearest.mjs
// Sets every imported image under assets/ to pixel-art settings:
//   image:        Type sprite-frame (so it has a spriteFrame to load)
//   texture:      Min/Mag filter Nearest, Mip filter None, wrap Clamp
//   sprite-frame: Packable off (keeps it out of auto/dynamic atlases)
//   UI kit:       9-slice borders from tools/art/slices.json
// Run it from the project root with the Cocos editor CLOSED:
//   node tools/set-nearest.mjs
// Then reopen the project; Cocos re-imports the changed images.
// Safe to run again whenever you add new art.

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = 'assets';
let changed = 0, seen = 0, retyped = 0, sliced = 0;

// 9-slice borders for the UI kit, written by tools/art/make_ui.py: name -> [left, top, right, bottom].
const SLICES_FILE = 'tools/art/slices.json';
const slices = existsSync(SLICES_FILE) ? JSON.parse(readFileSync(SLICES_FILE, 'utf8')) : {};

function walk(dir) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(png|jpg|jpeg|webp)\.meta$/i.test(name)) fix(p);
    }
}

function fix(file) {
    seen++;
    const meta = JSON.parse(readFileSync(file, 'utf8'));
    let dirty = false;
    // Images must import as sprite-frame, or there is no spriteFrame to load or show.
    meta.userData ??= {};
    if (meta.importer === 'image' && meta.userData.type !== 'sprite-frame') {
        meta.userData.type = 'sprite-frame';
        dirty = true;
        retyped++;
    }
    for (const sub of Object.values(meta.subMetas ?? {})) {
        const u = (sub.userData ??= {});
        if (sub.importer === 'texture') {
            for (const [k, v] of [['minfilter', 'nearest'], ['magfilter', 'nearest'], ['mipfilter', 'none'],
                                  ['wrapModeS', 'clamp-to-edge'], ['wrapModeT', 'clamp-to-edge']]) {
                if (u[k] !== v) { u[k] = v; dirty = true; }
            }
        }
        if (sub.importer === 'sprite-frame' && u.packable !== false) {
            u.packable = false; dirty = true;
        }
        const slice = slices[basename(file).replace(/\.png\.meta$/i, '')];
        if (sub.importer === 'sprite-frame' && slice) {
            const [left, top, right, bottom] = slice;
            if (u.borderLeft !== left || u.borderTop !== top || u.borderRight !== right || u.borderBottom !== bottom) {
                Object.assign(u, { borderLeft: left, borderTop: top, borderRight: right, borderBottom: bottom });
                dirty = true;
                sliced++;
            }
        }
    }
    if (dirty) {
        writeFileSync(file, JSON.stringify(meta, null, 2));
        changed++;
    }
}

walk(ROOT);
console.log(`Checked ${seen} image metas, updated ${changed}${sliced ? ` (${sliced} 9-slice borders set)` : ''}.`);
if (retyped > 0) console.log(`${retyped} images were switched to sprite-frame. Open Cocos, wait for the import to finish, close it, and run this script once more.`);
if (seen === 0) console.log('No .meta files found: open the project in Cocos once so it imports the images, close it, then run this again.');
