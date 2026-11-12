// Hands of Fate — tools/cleanup-final.mjs (final pass, decisions 163 and 169)
// Run once with Cocos closed, from the project root:   node tools/cleanup-final.mjs
// Add --dry to only list what it would do. Safe to run twice.
//
// 1. Moves the 4x Pixel Plebes originals out of assets/resources to art-source/ (same
//    folders), dropping their .meta files. The game draws every card from the 1x atlas and the
//    1x strips made from them (decision 144), so the originals only made builds bigger. The
//    art tools (npm run atlas, the mockup and itch tools, the layout painter) read art-source/.
//    The files themselves are untouched.
//      assets/resources/cards/classic, cards/updated  -> art-source/cards/...
//      assets/resources/anim                          -> art-source/anim
//      assets/resources/concept/king_fallen.png, king_roughout.png -> art-source/concept
//        (king_fallen_1x.png stays: the run-over screen uses it)
// 2. Deletes what the final pass replaced:
//      assets/scripts/app/Aura.ts and assets/resources/effects/aura.effect (the boss aura
//        shader; the boss and the Ace now burn with ui/flame.ts, decision 167)
//      tools/cleanup-stage-b.mjs (already run in Stage B)
import fs from 'node:fs';
import path from 'node:path';

const dry = process.argv.includes('--dry');
const root = process.cwd();
if (!fs.existsSync(path.join(root, 'assets', 'resources'))) {
    console.error('Run this from the project root (the folder with assets/).');
    process.exit(1);
}
let moved = 0, removed = 0;

function rm(rel) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) return;
    console.log(`${dry ? '[dry] ' : ''}delete ${rel}`);
    if (!dry) fs.rmSync(p, { recursive: true, force: true });
    removed++;
}

function moveFile(fromRel, toRel) {
    const from = path.join(root, fromRel), to = path.join(root, toRel);
    if (!fs.existsSync(from)) return;
    console.log(`${dry ? '[dry] ' : ''}move   ${fromRel} -> ${toRel}`);
    if (!dry) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        if (fs.existsSync(to)) fs.rmSync(to);
        fs.renameSync(from, to);
    }
    moved++;
    rm(fromRel + '.meta');
}

/** Moves every file of a folder (not its .meta files), then removes the folder and its meta. */
function moveDir(fromRel, toRel) {
    const from = path.join(root, fromRel);
    if (!fs.existsSync(from)) return;
    for (const f of fs.readdirSync(from)) {
        if (f.endsWith('.meta')) continue;
        const st = fs.statSync(path.join(from, f));
        if (st.isDirectory()) moveDir(`${fromRel}/${f}`, `${toRel}/${f}`);
        else moveFile(`${fromRel}/${f}`, `${toRel}/${f}`);
    }
    rm(fromRel);
    rm(fromRel + '.meta');
}

moveDir('assets/resources/cards', 'art-source/cards');
moveDir('assets/resources/anim', 'art-source/anim');
moveFile('assets/resources/concept/king_fallen.png', 'art-source/concept/king_fallen.png');
moveFile('assets/resources/concept/king_roughout.png', 'art-source/concept/king_roughout.png');

rm('assets/scripts/app/Aura.ts');
rm('assets/scripts/app/Aura.ts.meta');
rm('assets/resources/effects/aura.effect');
rm('assets/resources/effects/aura.effect.meta');
rm('tools/cleanup-stage-b.mjs');

if (!dry && moved) {
    fs.writeFileSync(path.join(root, 'art-source', 'README.md'),
        '# art-source\n\nThe 4x Pixel Plebes originals by Greebles (Devlyn JD), unchanged. They sit outside `assets/` so Cocos\n' +
        'does not import them and builds do not carry them. The game uses the 1x atlas and strips made\n' +
        'from them: `npm run atlas` (tools/art/make_atlas_1x.py) rebuilds those from here.\n');
}
console.log(`\n${dry ? 'Would move' : 'Moved'} ${moved} files and ${dry ? 'remove' : 'removed'} ${removed} files or folders.`);
