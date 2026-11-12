// Hands of Fate — tools/layout/runs.ts (npm run perf:runs)
// Plays several late fights one after another in one process, destroying each screen as
// ScreenManager does, to find anything that piles up run after run (decision 165). Per fight:
// real script time per frame, live tweens, pooled effect pieces, kitC frames and pages, and
// nodes left under the canvas after the screen is gone.
//   npx tsx --tsconfig tools/layout/tsconfig.json tools/layout/runs.ts [fights=8] [round=8] [side=4]
import { Node, UITransform } from 'cc';
import * as cc from 'cc';
import { UiKit } from '../../assets/scripts/ui/UiKit';
import { Particles, particleStats } from '../../assets/scripts/ui/particles';

const [fights = '8', round = '8', side = '4'] = process.argv.slice(2);

async function main() {
    const { Run } = await import('../../assets/scripts/core/run');
    const { generateOpponent } = await import('../../assets/scripts/core/opponents');
    const { Rng } = await import('../../assets/scripts/core/rng');
    const grid = await import('../../assets/scripts/core/grid');
    const kitC = await import('../../assets/scripts/ui/kitC');
    const { Game } = await import('../../assets/scripts/app/Game');
    const { FightScreen } = await import('../../assets/scripts/ui/FightScreen');
    const flow = await import('../../assets/scripts/ui/flow');
    (flow as any).finishRound = () => undefined;
    const canvas = new Node('Canvas');
    const cut = canvas.addComponent(UITransform); cut.width = 1920; cut.height = 1080;
    const kit = canvas.addComponent(UiKit);
    (kit as any).headingFont = { kind: 'heading' }; (kit as any).bodyFont = { kind: 'body' };
    kit.onLoad();
    await UiKit.ready;
    canvas.addComponent(Particles).onLoad();
    const loaded: Map<string, unknown> = (kit as any).frames;
    (kit as any).frame = (path: string) => (loaded.has(path) ? new (cc as any).SpriteFrame(path) : null);
    (Game as any).settings.tutorialStep = 0; (Game as any).settings.tutorialDone = true;
    (Game as any).settings.speed = 'fast';
    (cc as any).setTimedTweens(true);
    const count = (n: any): number => 1 + n.children.reduce((a: number, c: any) => a + count(c), 0);
    console.log('fight  frames  ms/frame  tweens-left  pool  frames-cached  pages  canvas-nodes-after');
    for (let k = 0; k < Number(fights); k++) {
        const run = Run.newRun({ seed: 100 + k }) as any;
        run.data.round = Number(round);
        run.data.opponent = generateOpponent(Number(round), new Rng(k * 7 + 1), k % 2 ? { boss: { suit: 'HSCD'[k % 4], tier: 1 + (k >> 2) } } : {});
        const g = run.data.grid; const s = Number(side);
        while (g.rows < s) grid.addRow(g); while (g.cols < s) grid.addColumn(g);
        let id = 9000; const pool = grid.cardsOnGrid(g);
        for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (!grid.cardAt(g, r, c)) grid.setCard(g, r, c, { ...pool[(r * 7 + c + k) % pool.length], id: id++ });
        (Game as any).run = run;
        const host = new Node('Fight'); canvas.addChild(host);
        const hut = host.addComponent(UITransform); hut.width = 1920; hut.height = 1080;
        const comp: any = host.addComponent(FightScreen);
        comp.onShow({ run });
        await new Promise((r) => setTimeout(r, 20));
        let frames = 0; const t0 = performance.now();
        for (; frames < 60 * 200; frames++) {
            (cc as any).tickTweens(1 / 60); Particles.tick(1 / 60); comp.update(1 / 60);
            if (comp.ending) break;
        }
        const ms = (performance.now() - t0) / Math.max(1, frames);
        // Leave the screen like ScreenManager does, and let the effects pool settle a moment.
        Particles.parkAll();
        host.destroy();
        for (let i = 0; i < 120; i++) { (cc as any).tickTweens(1 / 60); Particles.tick(1 / 60); }
        console.log(`${String(k + 1).padStart(5)}  ${String(frames).padStart(6)}  ${ms.toFixed(2).padStart(8)}  ${String((cc as any).activeTweens()).padStart(11)}  ${String(Particles.live).padStart(4)}/${String(Particles.pooled).padStart(3)}  ${String(kitC.cachedFrames()).padStart(13)}  ${String(kitC.atlasPages()).padStart(5)}  ${String(count(canvas)).padStart(18)}`);
    }
    console.log(`particles made ${particleStats.made}, reused ${particleStats.reused}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
