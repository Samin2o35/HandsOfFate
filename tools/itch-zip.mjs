// Hands of Fate — tools/itch-zip.mjs
// Zips a Cocos web-mobile build for itch.io (index.html at the top of the zip) and
// checks itch.io's HTML5 limits: at most 1,000 files, 240 characters per path,
// 200 MB per file, 500 MB in total.
//
//   npm run itch-zip                          (build/web-mobile -> build/itch/HandsOfFate-web.zip)
//   node tools/itch-zip.mjs [buildDir] [outZip]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const buildDir = path.resolve(root, process.argv[2] ?? 'build/web-mobile');
const outZip = path.resolve(root, process.argv[3] ?? 'build/itch/HandsOfFate-web.zip');
const MB = 1024 * 1024;

if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    console.error(`itch-zip: no index.html in ${path.relative(root, buildDir)}. Build for Web Mobile in Cocos first.`);
    process.exit(1);
}

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out); else out.push(p);
    }
    return out;
}

// CRC-32 (works on any Node version)
const TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

const files = walk(buildDir).sort();
const problems = [];
if (files.length > 1000) problems.push(`${files.length} files (itch.io allows 1,000). Upload the single HTML instead (npm run single-html).`);

const STORE_ONLY = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp3', '.ogg', '.m4a', '.woff2', '.zip', '.gz']);
const local = [];
const central = [];
let offset = 0;
let total = 0;
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

for (const p of files) {
    const name = path.relative(buildDir, p).split(path.sep).join('/');
    const data = fs.readFileSync(p);
    total += data.length;
    if (name.length > 240) problems.push(`path longer than 240 characters: ${name}`);
    if (data.length > 200 * MB) problems.push(`file over 200 MB: ${name}`);

    const store = STORE_ONLY.has(path.extname(p).toLowerCase());
    const body = store ? data : zlib.deflateRawSync(data, { level: 9 });
    const method = store ? 0 : 8;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
}
if (total > 500 * MB) problems.push(`${(total / MB).toFixed(0)} MB unzipped (itch.io allows 500 MB).`);

const cdSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);

fs.mkdirSync(path.dirname(outZip), { recursive: true });
fs.writeFileSync(outZip, Buffer.concat([...local, ...central, end]));

console.log(`itch-zip: ${files.length} files, ${(total / MB).toFixed(1)} MB → ${path.relative(root, outZip)} (${(fs.statSync(outZip).size / MB).toFixed(1)} MB)`);
if (problems.length) {
    console.warn('itch-zip: itch.io would reject this:');
    for (const p of problems) console.warn(`  - ${p}`);
    process.exitCode = 1;
} else {
    console.log('itch-zip: within itch.io limits (1,000 files, 240-character paths, 200 MB per file, 500 MB total).');
}
