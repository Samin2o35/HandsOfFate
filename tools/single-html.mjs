// Hands of Fate — tools/single-html.mjs
// Packs a Cocos Creator web-mobile build into ONE self-contained .html file.
//
//   1. Cocos: Project → Build → Web Mobile → Build   (makes build/web-mobile)
//   2. npm run single-html                           (makes build/single/HandsOfFate.html)
//
//   node tools/single-html.mjs [buildDir] [outFile]
//
// How it works: every file of the build is stored inside the page (text files as
// text, the rest as base64). A small loader at the top of the page answers the
// engine's requests from that store instead of the disk: script modules
// (SystemJS), XMLHttpRequest, fetch, <img>/<audio>/<script> src, and FontFace.
// No ad-network code, store links or analytics are added.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const buildDir = path.resolve(root, process.argv[2] ?? 'build/web-mobile');
const outFile = path.resolve(root, process.argv[3] ?? 'build/single/HandsOfFate.html');

const TEXT_EXT = new Set(['.js', '.mjs', '.json', '.css', '.txt', '.html', '.xml', '.svg', '.map', '.effect', '.plist', '.atlas', '.fnt']);
const MIME = {
    '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.txt': 'text/plain', '.html': 'text/html', '.xml': 'text/xml', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.cconb': 'application/octet-stream',
};

function fail(msg) { console.error(`single-html: ${msg}`); process.exit(1); }

if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    fail(`no index.html in ${path.relative(root, buildDir) || buildDir}. Build for Web Mobile in Cocos first (Project → Build).`);
}

// ---- 1. Collect every file of the build -------------------------------------------------

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

const files = walk(buildDir).filter((p) => path.relative(buildDir, p) !== 'index.html');
const store = {};
let rawBytes = 0;
for (const p of files) {
    const key = path.relative(buildDir, p).split(path.sep).join('/');
    const ext = path.extname(p).toLowerCase();
    const buf = fs.readFileSync(p);
    rawBytes += buf.length;
    const m = MIME[ext] ?? 'application/octet-stream';
    store[key] = TEXT_EXT.has(ext) ? { m, t: buf.toString('utf8') } : { m, b: buf.toString('base64') };
}

const dataUrl = (key) => {
    const f = store[key];
    if (!f) return null;
    return `data:${f.m};base64,${f.b ?? Buffer.from(f.t, 'utf8').toString('base64')}`;
};

// ---- 2. Rewrite index.html: inline styles, icons and classic scripts -------------------

let html = fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8');
const keyOf = (href) => href.replace(/^\.\//, '').split(/[?#]/)[0];
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i')) ?? [])[1];
const safeScript = (code) => code.replace(/<\/script/gi, '<\\/script');

// CSS files, with url(...) inside them turned into data URLs.
html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attr(tag, 'href');
    if (!href) return tag;
    const key = keyOf(href);
    if (/rel\s*=\s*["']stylesheet["']/i.test(tag) || /type\s*=\s*["']text\/css["']/i.test(tag)) {
        const css = store[key]?.t;
        if (css === undefined) return tag;
        const dir = path.posix.dirname(key);
        const fixed = css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (all, u) => {
            if (/^(data:|https?:|blob:)/.test(u)) return all;
            const d = dataUrl(path.posix.normalize(path.posix.join(dir, keyOf(u))));
            return d ? `url("${d}")` : all;
        });
        return `<style>\n${fixed}\n</style>`;
    }
    const d = dataUrl(key);
    return d ? tag.replace(href, d) : tag;
});

// <script src=...>: classic scripts inlined; the SystemJS import map inlined as JSON.
let sawSystem = false;
html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, attrs) => {
    const src = attr(tag, 'src');
    if (!src) return tag;
    const key = keyOf(src);
    const f = store[key];
    if (!f || f.t === undefined) return tag;
    const type = attr(tag, 'type');
    if (type === 'systemjs-importmap') return `<script type="systemjs-importmap">\n${safeScript(f.t)}\n</script>`;
    const typeAttr = type ? ` type="${type}"` : '';
    let out = `<script${typeAttr}>\n${safeScript(f.t)}\n</script>`;
    if (/system(\.bundle)?(\.min)?\.js$/i.test(key)) { out += '\n<script>__hofPatchSystem();</script>'; sawSystem = true; }
    return out;
});
if (!sawSystem) console.warn('single-html: no SystemJS script found in index.html; script modules will load through the <script> fallback.');

// ---- 3. The loader that answers requests from the store ---------------------------------

const loader = `
(function () {
  var RES = JSON.parse(document.getElementById('hof-res').textContent);
  var BASE = new URL('.', document.baseURI).href;
  var bytesCache = {};
  function keyOf(u) {
    if (u === null || u === undefined) return null;
    var s = String(u);
    if (/^(data|blob):/i.test(s)) return null;
    var abs;
    try { abs = new URL(s, document.baseURI).href; } catch (e) { return null; }
    abs = abs.split('#')[0].split('?')[0];
    if (abs.indexOf(BASE) !== 0) return null;
    var k;
    try { k = decodeURIComponent(abs.slice(BASE.length)); } catch (e) { k = abs.slice(BASE.length); }
    return Object.prototype.hasOwnProperty.call(RES, k) ? k : null;
  }
  function bytes(k) {
    if (bytesCache[k]) return bytesCache[k];
    var f = RES[k], out;
    if (f.t !== undefined) out = new TextEncoder().encode(f.t);
    else { var bin = atob(f.b); out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); }
    return (bytesCache[k] = out);
  }
  function text(k) { var f = RES[k]; return f.t !== undefined ? f.t : new TextDecoder().decode(bytes(k)); }
  function dataUrl(k) { var f = RES[k]; return 'data:' + f.m + ';base64,' + (f.b !== undefined ? f.b : btoa(unescape(encodeURIComponent(f.t)))); }
  var blobUrls = {};
  function blobUrl(k) { return blobUrls[k] || (blobUrls[k] = URL.createObjectURL(new Blob([bytes(k)], { type: RES[k].m }))); }
  function arrayBuffer(k) { var b = bytes(k); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
  window.__hofStore = { keyOf: keyOf, text: text, dataUrl: dataUrl };

  // fetch
  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    var k = keyOf(url);
    if (!k) return realFetch.apply(window, arguments);
    return Promise.resolve(new Response(bytes(k), { status: 200, headers: { 'Content-Type': RES[k].m } }));
  };

  // XMLHttpRequest
  var RealXHR = window.XMLHttpRequest;
  function define(o, name, v) { Object.defineProperty(o, name, { value: v, configurable: true, writable: true }); }
  var HofXHR = function () { var x = new RealXHR(); var open = x.open, send = x.send, hdr = x.getResponseHeader, all = x.getAllResponseHeaders;
    var hit = null;
    x.open = function (method, url) { hit = keyOf(url); if (!hit) return open.apply(x, arguments); define(x, 'readyState', 1); };
    x.send = function () {
      if (!hit) return send.apply(x, arguments);
      var k = hit;
      setTimeout(function () {
        var type = x.responseType, resp;
        try {
          if (type === 'arraybuffer') resp = arrayBuffer(k);
          else if (type === 'blob') resp = new Blob([bytes(k)], { type: RES[k].m });
          else if (type === 'json') resp = JSON.parse(text(k));
          else resp = text(k);
        } catch (e) { console.error('single-html: could not read ' + k, e); }
        define(x, 'status', 200); define(x, 'statusText', 'OK'); define(x, 'responseURL', new URL(k, BASE).href);
        define(x, 'response', resp);
        if (type === '' || type === 'text') define(x, 'responseText', resp);
        define(x, 'readyState', 4);
        x.dispatchEvent(new Event('readystatechange'));
        x.dispatchEvent(new ProgressEvent('load'));
        x.dispatchEvent(new ProgressEvent('loadend'));
      }, 0);
    };
    x.getResponseHeader = function (n) { return hit ? (/content-type/i.test(n) ? RES[hit].m : null) : hdr.apply(x, arguments); };
    x.getAllResponseHeaders = function () { return hit ? 'content-type: ' + RES[hit].m + '\\r\\n' : all.apply(x, arguments); };
    return x;
  };
  HofXHR.prototype = RealXHR.prototype;
  ['UNSENT', 'OPENED', 'HEADERS_RECEIVED', 'LOADING', 'DONE'].forEach(function (n, i) { HofXHR[n] = i; });
  window.XMLHttpRequest = HofXHR;

  // <img src>, <audio src>, <script src>
  function patchSrc(proto, make) {
    var d = Object.getOwnPropertyDescriptor(proto, 'src');
    if (!d || !d.set) return;
    Object.defineProperty(proto, 'src', { configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) { var k = keyOf(v); d.set.call(this, k ? make(k) : v); } });
  }
  patchSrc(HTMLImageElement.prototype, dataUrl);
  patchSrc(HTMLMediaElement.prototype, dataUrl);
  patchSrc(HTMLScriptElement.prototype, blobUrl);
  var realSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (String(name).toLowerCase() === 'src' && (this instanceof HTMLImageElement || this instanceof HTMLMediaElement || this instanceof HTMLScriptElement)) {
      var k = keyOf(value);
      if (k) value = this instanceof HTMLScriptElement ? blobUrl(k) : dataUrl(k);
    }
    return realSetAttr.call(this, name, value);
  };

  // FontFace('Name', "url('assets/.../font.ttf')")
  if (window.FontFace) {
    var RealFontFace = window.FontFace;
    var HofFontFace = function (family, source, desc) {
      if (typeof source === 'string') {
        source = source.replace(/url\\(\\s*["']?([^"')]+)["']?\\s*\\)/g, function (all, u) { var k = keyOf(u); return k ? 'url("' + dataUrl(k) + '")' : all; });
      }
      return new RealFontFace(family, source, desc);
    };
    HofFontFace.prototype = RealFontFace.prototype;
    window.FontFace = HofFontFace;
  }

  // SystemJS modules: run them from the store (called right after SystemJS loads).
  window.__hofPatchSystem = function () {
    var S = window.System;
    var proto = S && S.constructor && S.constructor.prototype;
    if (!proto || typeof proto.instantiate !== 'function') { console.warn('single-html: SystemJS not patched; using <script> fallback'); return; }
    var orig = proto.instantiate;
    proto.instantiate = function (url, parent) {
      var k = keyOf(url);
      if (!k || !/\\.(m?js)$/.test(k)) return orig.apply(this, arguments);
      var loader = this;
      return new Promise(function (resolve, reject) {
        try { (0, eval)(text(k) + '\\n//# sourceURL=' + url); } catch (e) { reject(e); return; }
        resolve(loader.getRegister(url));
      });
    };
  };
})();
`;

const json = JSON.stringify(store).replace(/<\//g, '<\\/');
const head = `<script type="application/json" id="hof-res">${json}</script>\n<script>${safeScript(loader)}</script>\n`;
if (!/<head[^>]*>/i.test(html)) fail('index.html has no <head>.');
html = html.replace(/<head[^>]*>/i, (h) => `${h}\n${head}`);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);

const mb = (n) => (n / 1024 / 1024).toFixed(1);
const size = fs.statSync(outFile).size;
console.log(`single-html: ${files.length} files (${mb(rawBytes)} MB) → ${path.relative(root, outFile)} (${mb(size)} MB)`);
if (size > 25 * 1024 * 1024) console.warn('single-html: over 25 MB. Check Feature Cropping in Project Settings and the size of audio files.');
