// Hands of Fate — tools/layout/render.ts
// Runs a screen's real build() code against the cc mock and writes every node's
// box (world position, size, label text) to JSON, for draw.py to turn into a PNG.
// Usage: npm run layout (all screens), or npx tsx --tsconfig tools/layout/tsconfig.json tools/layout/render.ts <screen> <w> <h> <out.json> [args]
import { Node, UITransform, Label, Sprite, Button, SpriteFrame, RichText, Mask } from 'cc';
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
        if (process.env.SYNC) (await import('cc') as any).setSyncTweens(true);
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
        if (screen === 'Planning' && process.env.FORGE) { comp.forgeOpen = true; await new Promise((r) => setTimeout(r, 20)); comp.rebuild(); }
        if (process.env.FRAMES && screen === 'Fight') {
            // Stop part-way through a fight (tweens finish at once), for mockups.
            const cc: any = await import('cc');
            cc.setSyncTweens(true);
            await new Promise((r) => setTimeout(r, 20));
            for (let i = 0; i < Number(process.env.FRAMES) && !comp.ending; i++) comp.update(1 / 60);
        }
        if (process.env.SIMULATE && screen === 'Fight') {
            // Play the whole fight frame by frame (tweens finish at once) and report.
            const cc: any = await import('cc');
            cc.setSyncTweens(true);
            await new Promise((r) => setTimeout(r, 20));
            const { flow } = { flow: await import('../../assets/scripts/ui/flow') };
            (flow as any).finishRound = () => undefined;
            let frames = 0;
            for (; frames < 60 * 200; frames++) {
                comp.update(1 / 60);
                if (comp.ending) break;
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
            const frame = spr?.spriteFrame?.name as string | undefined;
            if (frame?.startsWith('kitC:') && !frames[frame]) {
                const src = spr.spriteFrame.texture?.image?.src;
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
}
main().catch((e) => { console.error(e); process.exit(1); });
