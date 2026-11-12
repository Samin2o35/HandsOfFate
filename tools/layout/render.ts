// Hands of Fate — tools/layout/render.ts
// Runs a screen's real build() code against the cc mock and writes every node's
// box (world position, size, label text) to JSON, for draw.py to turn into a PNG.
// Usage: npm run layout (all screens), or npx tsx --tsconfig tools/layout/tsconfig.json tools/layout/render.ts <screen> <w> <h> <out.json> [args]
import { Node, UITransform, Label, Sprite, Button, SpriteFrame, RichText, Mask } from 'cc';
import { UiKit } from '../../assets/scripts/ui/UiKit';
import { Particles, particleStats } from '../../assets/scripts/ui/particles';

const [screen, ws, hs, out, a1, a2] = process.argv.slice(2);
const sw = Number(ws), sh = Number(hs);
// Same rule as ScreenFit: fit height when wider than 16:9, else fit width.
const fitWidth = sw / sh < 1920 / 1080;
const W = fitWidth ? 1920 : Math.round(sh === 0 ? 1920 : 1080 * sw / sh);
const H = fitWidth ? Math.round(1920 * sh / sw) : 1080;

async function main() {
    const { Run } = await import('../../assets/scripts/core/run');
    const { generateOpponent } = await import('../../assets/scripts/core/opponents');
    const { Rng } = await import('../../assets/scripts/core/rng');
    const canvas = new Node('Canvas');
    const cut = canvas.addComponent<UITransform>(UITransform); cut.width = W; cut.height = H;
    const kit = canvas.addComponent<UiKit>(UiKit);
    (kit as any).headingFont = { kind: 'heading' }; (kit as any).bodyFont = { kind: 'body' };
    kit.onLoad();
    await UiKit.ready;
    // Every preloaded art path resolves to a named stand-in frame, so pictures can tell cards apart.
    // A path that isn't preloaded is null in the game too (UiKit.frame), so it fails the run (decision 133).
    const loaded: Map<string, unknown> = (kit as any).frames;
    const notLoaded = new Set<string>();
    (kit as any).frame = (path: string) => {
        if (!loaded.has(path)) { notLoaded.add(path); return null; }
        return new SpriteFrame(path);
    };
    const host = new Node(screen); canvas.addChild(host);
    const hut = host.addComponent<UITransform>(UITransform); hut.width = W; hut.height = H;

    const { Game } = await import('../../assets/scripts/app/Game');
    const grid = await import('../../assets/scripts/core/grid');
    // No tutorial unless asked for ("tut" as the extra argument).
    (Game as any).settings.tutorialStep = a1 === 'tut' ? Number(a2 ?? 1) : 0;
    (Game as any).settings.tutorialDone = a1 !== 'tut';
    /** Grows the grid to side × side and fills it (stash first, then copies). */
    const fill = (run: any, side: number) => {
        const g = run.data.grid;
        while (g.rows < side) grid.addRow(g);
        while (g.cols < side) grid.addColumn(g);
        let next = 5000;
        const pool = [...grid.cardsOnGrid(g)];
        for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
            if (grid.cardAt(g, r, c)) continue;
            const card = run.data.stash.shift() ?? { ...pool[(r * 7 + c) % pool.length], id: next++ };
            grid.setCard(g, r, c, card);
        }
        run.data.stash.push({ ...pool[0], id: next++ }, { ...pool[1], id: next++ }, { ...pool[2], id: next++ });
    };
    const sampleRun = (round: number, boss?: any) => {
        const run = Run.newRun({ seed: 4242 }) as any; const d = run.data;
        d.round = round; d.score = 18450;
        d.opponent = generateOpponent(round, new Rng(round * 7 + 1), boss ? { boss } : {});
        return run;
    };
    if (screen === 'Ace') {
        const { celebrateAce } = await import('../../assets/scripts/ui/Modal');
        const { ACES } = await import('../../assets/scripts/core/achievements');
        celebrateAce(host, (a1 as any) ?? ACES[0].id);
    } else if (screen === 'Title') {
        // The title is a prefab: rebuild its named nodes from the prefab file, then let
        // TitleScreen dress it as the game does at runtime.
        const fs = await import('fs');
        const { Color, Vec2 } = await import('cc') as any;
        const d = JSON.parse(fs.readFileSync('assets/prefabs/screens/Title.prefab', 'utf8'));
        const made = new Map<number, Node>();
        const strips: Record<string, string> = { KSpades: 'anim/S_13', QHearts: 'anim/H_12', Joker: 'anim/joker_true', JClubs: 'anim/C_11', AHearts: 'anim/D_14' };
        const build = (i: number, parent: Node) => {
            const o = d[i];
            const n = new Node(o._name ?? 'Node'); parent.addChild(n); made.set(i, n);
            n.setPosition(o._lpos?.x ?? 0, o._lpos?.y ?? 0);
            for (const c of o._components ?? []) {
                const k = d[c.__id__];
                if (k.__type__ === 'cc.UITransform') { const u = n.addComponent<UITransform>(UITransform); u.setContentSize(k._contentSize.width, k._contentSize.height); u.setAnchorPoint(k._anchorPoint.x, k._anchorPoint.y); }
                if (k.__type__ === 'cc.Sprite') { const sp = n.addComponent<Sprite>(Sprite); sp.spriteFrame = new SpriteFrame(strips[n.name] ?? 'ui/panel'); }
                if (k.__type__ === 'cc.Label') { const l = n.addComponent<Label>(Label); l.string = k._string; l.fontSize = k._fontSize; l.horizontalAlign = k._horizontalAlign; l.color = new Color(k._color.r, k._color.g, k._color.b, k._color.a); }
            }
            if (o._name === 'Buttons') return;
            for (const ch of o._children ?? []) build(ch.__id__, n);
        };
        const root = d[1];
        for (const ch of root._children ?? []) build(ch.__id__, host);
        const { makeButton } = await import('../../assets/scripts/ui/UiKit');
        const { ButtonStyle } = await import('../../assets/scripts/ui/UiButton');
        const content = host.getChildByName('Content')!;
        const names = ['Continue', 'New Run', 'How to play', 'Aces', 'Options', 'Quit'];
        const btns = names.map((t, k) => makeButton(content, `Btn ${t}`, ButtonStyle.Dark, t, 666, 100, { x: 460, y: 370 - 117 * k }, () => undefined, 40));
        const mod = await import('../../assets/scripts/ui/TitleScreen');
        const comp: any = host.addComponent<any>(mod.TitleScreen);
        [comp.continueButton, comp.newRunButton, comp.howToPlayButton, comp.achievementsButton, comp.optionsButton] = btns;
        comp.bestRoundLabel = content.getChildByPath('BestRun/BestRound')?.getComponent(Label);
        comp.bestScoreLabel = content.getChildByPath('BestRun/BestScore')?.getComponent(Label);
        (Game as any).profile.bestRound = 23; (Game as any).profile.bestScore = 84210;
        (Game as any).load = () => undefined;
        comp.onShow();
        void Vec2;
    } else if (screen === 'Confirm') {
        const { confirmBox } = await import('../../assets/scripts/ui/Modal');
        confirmBox(host, 'REPLACE YOUR RUN?', 'You have a saved run. Starting a new one deletes it.', 'New Run', 'Keep it', () => undefined);
    } else {
        const mod = await import(`../../assets/scripts/ui/${screen}Screen`);
        if (process.env.SYNC) (await import('cc') as any).setSyncTweens(true);
        const comp = host.addComponent<any>(mod[`${screen}Screen`]);
        let params: any;
        if (screen === 'BossIntro') params = { run: sampleRun(5, { suit: a1 ?? 'S', tier: Number(a2 ?? 1) }) };
        if (screen === 'RunOver') params = { run: sampleRun(12), preview: true };
        if (screen === 'Planning' || screen === 'Fight') {
            const run = a1 === 'tut' ? Run.newRun({ seed: 51, tutorial: true } as any) : sampleRun(Number(a2 ?? 5), a1 === 'boss' ? { suit: 'H', tier: 2 } : undefined);
            if (a1 && a1 !== 'tut' && a1 !== 'boss') fill(run, Number(a1));
            if (process.env.FILL) fill(run, Number(process.env.FILL)); // e.g. FILL=5 with "boss 10"
            // BOARD="5H 9S JS / 3D KC 9H / 8C 2S 10C" puts exactly that board on your table.
            if (process.env.BOARD) { const g = grid.gridFromText(process.env.BOARD); let id = 7000; for (const c of g.slots) if (c) (c as any).id = id++; run.data.grid = g; }
            if (process.env.SPEED) (Game as any).settings.speed = process.env.SPEED;
            if (a1 === 'tut' && Number(a2) >= 3) fill(run, 3);
            // STASH=n adds n more cards to the stash (copies of board cards); PAIRS=1 adds a second forgeable pair.
            if (process.env.STASH) { const on = grid.cardsOnGrid(run.data.grid); for (let i = 0; i < Number(process.env.STASH); i++) run.data.stash.push({ ...on[i % on.length], id: 7000 + i }); }
            (Game as any).run = run;
            params = { run };
        }
        if (screen === 'RoundWon') {
            // Play round 1 seeds until one is won, so the screen has a result.
            for (let seed = 1; seed < 50; seed++) {
                const run = Run.newRun({ seed }) as any;
                if (a1) fill(run, Number(a1));
                const f = run.startFight(); f.runToEnd();
                const result = run.finishFight(f);
                if (run.phase === 'reward') { params = { run, result }; (Game as any).run = run; break; }
            }
        }
        comp.onShow?.(params);
        if (screen === 'RoundWon' && process.env.TOOK) {
            // Step 1 done (their first card taken) and, with TOOK=cards, a reward picked.
            await new Promise((r) => setTimeout(r, 20));
            comp.takeId = (await import('../../assets/scripts/core/grid')).cardsOnGrid(params.run.opponent.grid)[0]?.id ?? null;
            if (process.env.TOOK !== '1') comp.choice = { kind: process.env.TOOK };
            comp.build();
        }
        // FORGE=1 or DRAWER=forge|stash opens a drawer; VIEW=1 opens their table pop-up.
        if (screen === 'Planning' && (process.env.FORGE || process.env.DRAWER)) { comp.drawer = process.env.DRAWER ?? 'forge'; await new Promise((r) => setTimeout(r, 20)); comp.rebuild(); }
        if ((screen === 'Planning' || screen === 'Fight') && process.env.VIEW) {
            await new Promise((r) => setTimeout(r, 20));
            const run = params.run;
            const { showTheirTable } = await import('../../assets/scripts/ui/TheirTable');
            const { evaluateBoard } = await import('../../assets/scripts/core/evaluate');
            showTheirTable(host, run, run.opponent, evaluateBoard(run.opponent.grid), (h: any) => h.cooldown * run.opponent.cooldownMultiplier);
        }
        if (process.env.FRAMES && screen === 'Fight') {
            // Stop part-way through a fight (tweens finish at once), for mockups.
            const cc: any = await import('cc');
            cc.setSyncTweens(true);
            await new Promise((r) => setTimeout(r, 20));
            for (let i = 0; i < Number(process.env.FRAMES) && !comp.ending; i++) { Particles.tick(1 / 60); comp.update(1 / 60); }
        }
        if (process.env.FRAMES && (screen === 'RunOver' || screen === 'BossIntro')) {
            // Run the screen's own animations (the blood) for a while, for mockups.
            await new Promise((r) => setTimeout(r, 60));
            // The King's drop-in tween doesn't run here: settle him.
            const settle = (n: any) => { if (n.name === 'Fallen') n.setScale(1, 1, 1); n.children.forEach(settle); };
            settle(host);
            const tickAll = (n: any) => { for (const c of n.components) if (c !== comp && typeof c.update === 'function') c.update(1 / 60); n.children.forEach(tickAll); };
            for (let i = 0; i < Number(process.env.FRAMES); i++) { Particles.tick(1 / 60); tickAll(host); }
        }
        if (process.env.SIMULATE && screen === 'Fight') {
            // Play the whole fight frame by frame and report. PERF=1: tweens run over time
            // (like Cocos), so the per-frame work counts include projectiles and trails in flight.
            const cc: any = await import('cc');
            if (process.env.PERF) cc.setTimedTweens(true); else cc.setSyncTweens(true);
            await new Promise((r) => setTimeout(r, 20));
            const { flow } = { flow: await import('../../assets/scripts/ui/flow') };
            (flow as any).finishRound = () => undefined;
            let frames = 0;
            const { work } = cc;
            const keys = Object.keys(work);
            const sum: Record<string, number> = {}, max: Record<string, number> = {};
            keys.forEach((k) => { sum[k] = 0; max[k] = 0; });
            const live = (n: any): number => 1 + n.children.reduce((a: number, c: any) => a + live(c), 0);
            const liveStart = live(host);
            let liveMax = liveStart, tweenMax = 0;
            for (; frames < 60 * 200; frames++) {
                const before = { ...work };
                cc.tickTweens(1 / 60);
                Particles.tick(1 / 60);
                comp.update(1 / 60);
                for (const k of keys) { const d = work[k] - before[k]; sum[k] += d; max[k] = Math.max(max[k], d); }
                if (frames % 30 === 0) { liveMax = Math.max(liveMax, live(host)); tweenMax = Math.max(tweenMax, cc.activeTweens()); }
                if (comp.ending) break;
            }
            if (process.env.PERF) {
                const names = new Map<string, number>();
                const count = (n: any) => { names.set(n.name, (names.get(n.name) ?? 0) + 1); n.children.forEach(count); };
                count(host);
                const top = [...names].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}×${v}`).join(', ');
                console.log(`PERF most common nodes at the end: ${top}`);
                console.log(`PERF particles: made ${particleStats.made}, reused ${particleStats.reused}, skipped (over the caps) ${particleStats.skipped}`);
                // Per frame, what Cocos would do: nodes added, label texts re-rendered, sprite frames and colours set, textures made.
                console.log(`PERF frames=${frames} live nodes start=${liveStart} max=${liveMax} end=${live(host)} tweens max=${tweenMax}`);
                for (const k of keys) console.log(`PERF ${k.padEnd(10)} avg/frame ${(sum[k] / Math.max(1, frames)).toFixed(1).padStart(7)}  max ${String(max[k]).padStart(5)}  total ${sum[k]}`);
            }
            console.log(`SIM frames=${frames} ending=${comp.ending} inFlight=${comp.inFlight} winner=${comp.fight?.winner} events-ok`);
        }
    }
    await new Promise((r) => setTimeout(r, 50));

    // Health cells: what each one shows (fight: the shown grid; elsewhere alive).
    const cellState = new Map<Node, string>();
    const anyComp: any = host.components[host.components.length - 1];
    for (const side of ['player', 'enemy']) {
        const parts = anyComp?.grids?.[side];
        const grid = anyComp?.shown?.[side];
        if (parts && grid) parts.cells.forEach((c: any, i: number) => cellState.set(c.node, grid.cells[i].shield && grid.cells[i].state === 'alive' ? 'shield' : grid.cells[i].state));
    }
    const boxes: any[] = [];
    const frames: Record<string, any> = {};
    const clipOf = (n: Node): any => {
        for (let p: Node | null = n.parent; p; p = p.parent) {
            if (p.getComponent(Mask as any)) {
                const ut = p.getComponent<UITransform>(UITransform)!; const w = p.worldPosition;
                return { x: w.x - ut.width * ut.anchorX, y: w.y - ut.height * ut.anchorY, w: ut.width, h: ut.height };
            }
        }
        return undefined;
    };
    const walk = (n: Node, depth: number) => {
        if (!n.active) return;
        const ut = n.getComponent<UITransform>(UITransform);
        if (ut && n !== canvas) {
            const w = n.worldPosition; const sx = n.scale.x, sy = n.scale.y;
            let lab: any = n.getComponent<Label>(Label);
            const rich = n.getComponent<RichText>(RichText) as any;
            if (!lab && rich?.string) {
                // Rich text (the Dealer's lines): plain words, in the body font.
                lab = { string: rich.string.replace(/<[^>]+>/g, ''), fontSize: rich.fontSize, overflow: 3, kind: 'body',
                    color: rich.fontColor ?? { r: 59, g: 50, b: 74 }, horizontalAlign: 0 };
                if (ut.width < 20) ut.width = rich.maxWidth || 480;
                if (ut.height < 20) { ut.height = Math.ceil(lab.string.length * rich.fontSize * 0.5 / ut.width + 1) * (rich.lineHeight || rich.fontSize); }
            }
            const spr = n.getComponent<Sprite>(Sprite) as any;
            const fillHex = spr && !spr.spriteFrame && spr.color && !(spr.color.r === 255 && spr.color.g === 255 && spr.color.b === 255)
                ? '#' + [spr.color.r, spr.color.g, spr.color.b].map((v: number) => v.toString(16).padStart(2, '0')).join('') : undefined;
            // A sprite running a shader (the boss aura) can't be painted here: leave it out.
            const frame = spr?.customMaterial ? undefined : spr?.spriteFrame?.name as string | undefined;
            if (frame?.startsWith('kitC:') && !frames[frame]) {
                // kitC keeps each piece's own pixels on its frame (_pix), as a page holds many.
                const pix = spr.spriteFrame._pix;
                const src = pix ? { width: pix.w, height: pix.h, _data: pix.data } : spr.spriteFrame.texture?.image?.src;
                if (src) frames[frame] = { w: src.width, h: src.height, slice: spr.spriteFrame.insetLeft, data: Buffer.from(src._data).toString('base64') };
            }
            const tint = spr && spr.spriteFrame && spr.color && !(spr.color.r === 255 && spr.color.g === 255 && spr.color.b === 255)
                ? [spr.color.r, spr.color.g, spr.color.b] : undefined;
            boxes.push({
                name: n.name, depth,
                x: w.x - ut.width * ut.anchorX * sx, y: w.y - ut.height * ut.anchorY * sy, w: ut.width * sx, h: ut.height * sy,
                kind: lab ? 'label' : n.getComponent(Button) ? 'button' : n.getComponent(Sprite) ? 'sprite' : 'node',
                text: lab?.string, fill: fillHex, frame, tint, clip: clipOf(n), alpha: spr && !spr.spriteFrame ? spr.color?.a : undefined,
                color: lab ? '#' + [lab.color.r, lab.color.g, lab.color.b].map((v: number) => v.toString(16).padStart(2, '0')).join('') : undefined,
                align: lab?.horizontalAlign, font: lab ? lab.kind : undefined,
                cell: cellState.get(n), button: n.getComponent(Button) ? true : undefined,
                label: n.getComponent(Button) ? (n.getComponentInChildren<Label>(Label)?.string ?? '') : undefined, size: lab?.fontSize, overflow: lab?.overflow,
                need: lab ? lab.string.length * lab.fontSize * (lab.kind === 'body' ? 0.5 : 0.62) : undefined,
            });
        }
        n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(canvas, 0);
    const fs = await import('fs');
    fs.writeFileSync(out, JSON.stringify({ W, H, screen, boxes, frames }));
    console.log(`${screen} ${sw}x${sh} -> design ${W}x${H}, ${boxes.length} boxes`);
    // Sprite paths that would show nothing in Cocos: no file under assets/resources, or never preloaded.
    const { missingResources } = await import('cc') as any;
    const bad = [...missingResources].map((p: string) => `no file under assets/resources: ${p}`)
        .concat([...notLoaded].map((p) => `not preloaded by UiKit (kit.frame returns null): ${p}`));
    if (bad.length) { console.error(`MISSING ART in ${screen}:\n  ` + bad.join('\n  ')); process.exit(2); }
}
main().catch((e) => { console.error(e); process.exit(1); });
