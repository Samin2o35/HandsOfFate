// Hands of Fate — tools/layout/render.ts
// Runs a screen's real build() code against the cc mock and writes every node's
// box (world position, size, label text) to JSON, for draw.py to turn into a PNG.
// Usage: npm run layout (all screens), or npx tsx --tsconfig tools/layout/tsconfig.json tools/layout/render.ts <screen> <w> <h> <out.json> [args]
import { Node, UITransform, Label, Sprite, Button, SpriteFrame } from 'cc';
import { UiKit } from '../../assets/scripts/ui/UiKit';

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
    // Every art path resolves to a named stand-in frame, so pictures can tell cards apart.
    (kit as any).frame = (path: string) => new SpriteFrame(path);
    await UiKit.ready;
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
    } else {
        const mod = await import(`../../assets/scripts/ui/${screen}Screen`);
        const comp = host.addComponent<any>(mod[`${screen}Screen`]);
        let params: any;
        if (screen === 'BossIntro') params = { run: sampleRun(5, { suit: a1 ?? 'S', tier: Number(a2 ?? 1) }) };
        if (screen === 'RunOver') params = { run: sampleRun(12), preview: true };
        if (screen === 'Planning' || screen === 'Fight') {
            const run = a1 === 'tut' ? Run.newRun({ seed: 51, tutorial: true } as any) : sampleRun(Number(a2 ?? 5), a1 === 'boss' ? { suit: 'H', tier: 2 } : undefined);
            if (a1 && a1 !== 'tut' && a1 !== 'boss') fill(run, Number(a1));
            if (a1 === 'tut' && Number(a2) >= 3) fill(run, 3);
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
    }
    await new Promise((r) => setTimeout(r, 50));

    const boxes: any[] = [];
    const walk = (n: Node, depth: number) => {
        if (!n.active) return;
        const ut = n.getComponent<UITransform>(UITransform);
        if (ut && n !== canvas) {
            const w = n.worldPosition; const sx = n.scale.x, sy = n.scale.y;
            const lab = n.getComponent<Label>(Label);
            const spr = n.getComponent<Sprite>(Sprite) as any;
            const fillHex = spr && !spr.spriteFrame && spr.color && !(spr.color.r === 255 && spr.color.g === 255 && spr.color.b === 255)
                ? '#' + [spr.color.r, spr.color.g, spr.color.b].map((v: number) => v.toString(16).padStart(2, '0')).join('') : undefined;
            const frame = spr?.spriteFrame?.name as string | undefined;
            boxes.push({
                name: n.name, depth,
                x: w.x - ut.width * ut.anchorX * sx, y: w.y - ut.height * ut.anchorY * sy, w: ut.width * sx, h: ut.height * sy,
                kind: lab ? 'label' : n.getComponent(Button) ? 'button' : n.getComponent(Sprite) ? 'sprite' : 'node',
                text: lab?.string, fill: fillHex, frame, size: lab?.fontSize, overflow: lab?.overflow,
                need: lab ? lab.string.length * lab.fontSize * (lab.kind === 'body' ? 0.5 : 0.62) : undefined,
            });
        }
        n.children.forEach((c) => walk(c, depth + 1));
    };
    walk(canvas, 0);
    const fs = await import('fs');
    fs.writeFileSync(out, JSON.stringify({ W, H, screen, boxes }, null, 1));
    console.log(`${screen} ${sw}x${sh} -> design ${W}x${H}, ${boxes.length} boxes`);
}
main().catch((e) => { console.error(e); process.exit(1); });
