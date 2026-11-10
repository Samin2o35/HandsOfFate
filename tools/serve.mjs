// Hands of Fate — tools/serve.mjs
// Serves a build folder so a phone on the same Wi-Fi can play it.
//
//   npm run serve                 (serves build/web-mobile on port 8080)
//   node tools/serve.mjs build/single 8080
//
// It prints the addresses to type into the phone's browser. On Windows, allow
// Node through the firewall when asked (Private networks).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = path.resolve(process.argv[2] ?? 'build/web-mobile');
const port = Number(process.argv[3] ?? 8080);
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
    '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
};

if (!fs.existsSync(dir)) { console.error(`serve: ${dir} not found. Build first.`); process.exit(1); }

http.createServer((req, res) => {
    let rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (rel.endsWith('/')) rel += fs.existsSync(path.join(dir, rel, 'index.html')) ? 'index.html' : 'HandsOfFate.html';
    const file = path.join(dir, path.normalize(rel));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('Not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => {
    console.log(`Serving ${path.relative(process.cwd(), dir) || dir}`);
    console.log(`  this computer:  http://localhost:${port}/`);
    for (const list of Object.values(os.networkInterfaces())) {
        for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) console.log(`  phone (Wi-Fi):  http://${a.address}:${port}/`);
    }
    console.log('Ctrl+C to stop.');
});
