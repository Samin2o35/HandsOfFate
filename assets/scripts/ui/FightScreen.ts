// Hands of Fate — ui/FightScreen.ts
// The fight on the shared landscape table (ui/table.ts), so nothing moves when
// the round starts. Every frame it advances the core Fight by dt × speed
// (game-seconds, so speed never changes the score), then shows what happened:
//   - each badge's ring fills as its hand charges; spent hands dim
//   - a firing hand lights its badge, its line in your list and its cards
//   - their firing hand lights its line in their panel
//   - cells change on the target grid with a flash ring, sparks and a number
//   - round time and the live round score sit in the top strip
// Slow / Medium / Fast under the opponent panel; Options pauses. When a side's
// grid is empty: "ROUND WON" or "THE KING HAS FALLEN", then the round is scored
// and the next screen shown (see flow.ts). Projectiles, freeze, shake and zoom
// come in plan phase 3.

import { _decorator, Node, UITransform, Widget, Color, UIOpacity, Sprite, Label, tween, Vec3 } from 'cc';
import { GameScreen } from './GameScreen';
import { Game, SPEED_MULTIPLIER, SPEEDS, SPEED_NAME, Speed } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run } from '../core/run';
import { Fight, FightEvent, HandState, SideId } from '../core/fight';
import { HealthGrid, cloneHealthGrid } from '../core/health';
import { applyEffect } from '../core/patterns';
import { EFFECT_CHARGES } from '../core/hands';
import { scoreRound, formatTime } from '../core/scoring';
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, FONT, COLOR } from './UiKit';
import { ButtonStyle, UiButton } from './UiButton';
import { BoardView, worldRect, unionRects } from './BoardView';
import { buildHealthGrid, paintHealth, HealthGridParts, THEIR_PITCH } from './views';
import { flashRing, sparks, floatText, shake, FX_COLOR } from './fx';
import { finishRound } from './flow';
import { Sound } from '../app/Sound';
import { tutorialStep, setTutorialStep, showTutorial } from './Tutorial';
import {
    tableRegions, buildStrip, buildHandList, paintEntry, buildOpponentPanel, paintBadge, setBoxColor,
    BadgeParts, ListEntry, GREY,
} from './table';
const { ccclass } = _decorator;

const END_PAUSE = 1.6; // seconds of "ROUND WON" before moving on
const FLASH = 0.35;    // how long a firing hand stays lit
const HEALTH_H = 150;
const STASH_H = 180; // planning's stash height, kept free so the list matches planning

/** What changed on a grid because of one event. */
interface Diff { destroyed: number[]; popped: number[]; healed: number[]; shielded: number[]; }

@ccclass('FightScreen')
export class FightScreen extends GameScreen {
    private run: Run | null = null;
    private fight: Fight | null = null;
    private paused = false;
    private ending = false;

    // Copies of both health grids, updated event by event (see show()).
    private view: Record<SideId, HealthGrid> | null = null;
    private grids: Partial<Record<SideId, HealthGridParts>> = {};
    private board: BoardView | null = null;
    private badgeFor = new Map<string, BadgeParts>();
    private entryFor = new Map<string, ListEntry>();
    private theirLine = new Map<string, Sprite>();
    /** Hand ids lit until this game-time-independent clock (seconds of real time). */
    private litUntil = new Map<string, number>();
    private clock = 0;

    private content: Node | null = null;
    private fx: Node | null = null;
    private overlay: Node | null = null;
    private phaseLabel: Label | null = null;
    private youLabel: Label | null = null;
    private speedButtons = new Map<Speed, UiButton>();

    onShow(params?: unknown) {
        const p = params as { run?: Run } | undefined;
        this.run = p?.run ?? Game.run;
        if (!this.run) { ScreenManager.show('Title'); return; }
        Sound.music(this.run.isBoss ? 'boss' : 'fight');
        UiKit.ready.then(() => this.scheduleOnce(() => this.begin(), 0));
    }

    private begin() {
        const run = this.run!;
        if (!this.node.isValid) return;
        this.fight = run.startFight();
        this.view = { player: cloneHealthGrid(this.fight.player.health), enemy: cloneHealthGrid(this.fight.enemy.health) };
        this.build();
    }

    update(dt: number) {
        const f = this.fight;
        if (!f || !this.content) return;
        this.clock += dt;
        this.refreshLit();
        if (this.paused || this.ending) return;
        const events = f.advance(dt * SPEED_MULTIPLIER[Game.settings.speed]);
        for (const e of events) this.show(e);
        this.refreshBars();
        this.refreshTexts();
        if (f.over) this.end();
    }

    // ---- Building ------------------------------------------------------------------

    private build() {
        const run = this.run!, f = this.fight!;
        this.node.getComponent(Widget)?.updateAlignment();
        const g = tableRegions(this.node.getComponent(UITransform)!);
        if (!this.content) {
            this.content = makeNode(this.node, 'Content', g.W, g.H);
            this.fx = makeNode(this.node, 'Effects', g.W, g.H);
        }
        clearChildren(this.content);
        const root = this.content;

        const strip = buildStrip(root, g, run.round, 'Fight · 0:00', run.score, () => this.setPaused(true));
        this.phaseLabel = strip.phase;

        // Left: your hands, then your health (bigger than in planning; no stash).
        const side = g.side;
        // Same place and size as in planning, so nothing moves when the round starts.
        const reserved = side.top - side.height + STASH_H + 30 + HEALTH_H + 34;
        const list = buildHandList(root, run.board().hands, side.left, side.top, side.width, side.top - reserved - 20);
        const healthTop = list.bottom - 24;
        this.entryFor.clear();
        for (const e of list.entries) this.entryFor.set(e.hand.id, e);
        this.youLabel = makeLabel(root, 'YouLabel', '', { size: FONT.labelSmall, spacing: 2, color: GREY.soft, align: 'left', x: side.left, y: healthTop - 12 });
        this.grids.player = buildHealthGrid(root, this.view!.player, side.width, HEALTH_H, side.left, healthTop - 34);

        // Middle: the board, read-only.
        this.board = new BoardView(root, this.fx!, run, {
            left: g.board.left, top: g.board.top, width: g.board.width, height: g.board.height,
            stashLeft: 0, stashTop: 0, stashWidth: 0, stashHeight: 0,
        }, { changed: () => undefined, selected: () => undefined }, null, false);
        this.badgeFor.clear();
        for (const b of [...this.board.badges.rows, ...this.board.badges.cols]) if (b.hand) this.badgeFor.set(b.hand.id, b);

        // Right: the opponent, their health large; speed buttons under it.
        const cooldown = new Map(f.enemy.hands.map((h) => [h.hand.id, h.cooldown] as [string, number]));
        const panel = buildOpponentPanel(root, g.opponent, run.opponent, f.enemy.hands.map((h) => h.hand), (h) => cooldown.get(h.id) ?? h.cooldown);
        this.theirLine = panel.lines;
        const a = panel.healthArea;
        const enemy = buildHealthGrid(panel.node, this.view!.enemy, a.width, a.height, a.left, a.top, THEIR_PITCH);
        enemy.node.setPosition(a.left + (a.width - enemy.width) / 2, a.top);
        this.grids.enemy = enemy;
        this.buildSpeedButtons(root, g.actions.left, g.actions.width, g.actions.top - g.actions.height / 2, g.actions.height);

        this.refreshBars();
        this.refreshTexts();
    }

    private buildSpeedButtons(root: Node, left: number, w: number, y: number, h: number) {
        this.speedButtons.clear();
        const gap = 16;
        const bw = (w - gap * 2) / 3;
        SPEEDS.forEach((speed, i) => {
            const b = makeButton(root, `Speed ${speed}`, ButtonStyle.Dark, SPEED_NAME[speed], bw, h, { x: left + bw / 2 + i * (bw + gap), y }, () => this.setSpeed(speed));
            this.speedButtons.set(speed, b);
        });
        this.paintSpeed();
    }

    // ---- Live updates ---------------------------------------------------------------

    private refreshBars() {
        const f = this.fight!;
        for (const h of f.player.hands) {
            const spent = h.charges <= 0;
            const badge = this.badgeFor.get(h.hand.id);
            if (badge) {
                paintBadge(badge, f.progress(h), spent);
                if (spent) setBoxColor(badge.back, GREY.slot);
            }
            const entry = this.entryFor.get(h.hand.id);
            if (entry) {
                this.paintPips(entry, h);
                if (spent) (entry.node.getComponent(UIOpacity) ?? entry.node.addComponent(UIOpacity)).opacity = 110;
            }
        }
    }

    private paintPips(entry: ListEntry, h: HandState) {
        if (entry.pips.length === 0) return;
        const kit = UiKit.get();
        const total = EFFECT_CHARGES[h.hand.effect];
        const spent = total - Math.max(0, h.charges);
        entry.pips.forEach((pip, i) => {
            pip.getComponent(Sprite)!.spriteFrame = i < spent ? kit.spentIcon(h.hand.suit) : kit.suitIcon(h.hand.suit);
        });
    }

    private refreshTexts() {
        const run = this.run!, f = this.fight!;
        const s = scoreRound({
            round: run.round, boss: run.isBoss, handsFired: f.player.stats.handsFired, handPoints: f.player.stats.handPointsFired,
            cellsLeft: f.player.living, cellsTotal: f.player.startLiving, flawless: f.enemy.stats.damageDealt === 0, time: f.time,
        });
        if (this.phaseLabel) this.phaseLabel.string = `Fight · ${formatTime(f.time)} · this round +${s.total.toLocaleString('en-US')}`;
        if (this.youLabel) this.youLabel.string = `YOU · ${livingOf(this.view!.player)} / ${f.player.startLiving}`;
    }

    /** Lights a hand for FLASH seconds: yours (badge, list line, cards) or theirs (their line). */
    private light(side: SideId, id: string) {
        this.litUntil.set(`${side}:${id}`, this.clock + FLASH);
        if (side === 'enemy') { setBoxColor(this.theirLine.get(id) ?? null, '#5C4A2E'); return; }
        const entry = this.entryFor.get(id);
        if (entry) paintEntry(entry, 'firing');
        const badge = this.badgeFor.get(id);
        if (badge) setBoxColor(badge.back, '#5C4A2E');
        const h = this.fight?.player.hands.find((x) => x.hand.id === id);
        if (h) for (const pc of h.hand.cards) this.board?.viewFor(pc.card.id)?.setSelected(true);
    }

    private refreshLit() {
        for (const [key, until] of this.litUntil) {
            if (this.clock < until) continue;
            this.litUntil.delete(key);
            const [side, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
            if (side === 'enemy') { setBoxColor(this.theirLine.get(id) ?? null, GREY.panel); continue; }
            const entry = this.entryFor.get(id);
            if (entry) paintEntry(entry, 'normal');
            const h = this.fight?.player.hands.find((x) => x.hand.id === id);
            const badge = this.badgeFor.get(id);
            if (badge) setBoxColor(badge.back, h && h.charges <= 0 ? GREY.slot : GREY.raised);
            if (h) for (const pc of h.hand.cards) this.board?.viewFor(pc.card.id)?.setSelected(false);
        }
    }

    // ---- One event ---------------------------------------------------------------

    private show(e: FightEvent) {
        const target = this.view![e.target];
        const before = target.cells.map((c) => ({ state: c.state, shield: c.shield }));
        applyEffect(target, e.effect, e.cells);
        const diff = diffOf(before, target);
        const parts = this.grids[e.target];
        if (parts) {
            paintHealth(parts, target);
            this.cellEffects(parts, e, diff);
        }
        playEventSound(e, diff);

        if (e.kind === 'hand') this.light(e.side, e.sourceId);

        // Tutorial step 4: pause on your first heal or armor and explain charges.
        if (tutorialStep() === 4 && e.kind === 'hand' && e.side === 'player' && (e.effect === 'heal' || e.effect === 'armor') && !this.paused) {
            const entry = this.entryFor.get(e.sourceId);
            const badge = this.badgeFor.get(e.sourceId);
            this.paused = true;
            const overlay = showTutorial(this.node, {
                step: 4, at: 'right', button: 'Continue',
                spot: unionRects([entry ? worldRect(entry.node) : null, badge ? worldRect(badge.node) : null]),
                onButton: () => { setTutorialStep(5); if (overlay.isValid) overlay.destroy(); this.paused = false; },
                onSkip: () => { this.paused = false; },
            });
        }
    }

    private cellEffects(parts: HealthGridParts, e: FightEvent, d: Diff) {
        const fx = this.fx!;
        const size = parts.cells[0]?.node.getComponent(UITransform)?.width ?? 24;
        const ring = (i: number, color: string) => {
            const cell = parts.cells[i];
            if (cell) flashRing(fx, cell.node.worldPosition, size, color);
        };
        for (const i of d.destroyed) {
            ring(i, e.effect === 'rot' ? FX_COLOR.rot : FX_COLOR.hit);
            const cell = parts.cells[i];
            if (cell) sparks(fx, cell.node.worldPosition, e.effect === 'rot' ? FX_COLOR.rot : FX_COLOR.red);
        }
        for (const i of d.popped) ring(i, FX_COLOR.shield);
        for (const i of d.healed) ring(i, FX_COLOR.heal);
        for (const i of d.shielded) ring(i, FX_COLOR.shield);

        const touched = d.destroyed.concat(d.popped, d.healed, d.shielded);
        if (touched.length === 0) return;
        const centre = new Vec3();
        for (const i of touched) centre.add(parts.cells[i].node.worldPosition);
        centre.multiplyScalar(1 / touched.length);
        if (d.destroyed.length) {
            floatText(fx, centre, `-${d.destroyed.length}`, FX_COLOR.hit);
            // Bigger hits shake harder (a straight flush cross is a lot of cells).
            shake(parts.node, Math.min(14, 4 + d.destroyed.length));
        } else if (d.healed.length) floatText(fx, centre, `+${d.healed.length}`, FX_COLOR.heal);
        else if (d.shielded.length) floatText(fx, centre, `+${d.shielded.length}`, '#8FB8E0');
        else if (d.popped.length) floatText(fx, centre, 'blocked', '#8FB8E0');
    }

    // ---- Speed, pause, end ------------------------------------------------------------

    private setSpeed(speed: Speed) {
        Game.settings.speed = speed;
        Game.saveSettings();
        this.paintSpeed();
    }

    private paintSpeed() {
        for (const [speed, b] of this.speedButtons) b.style = speed === Game.settings.speed ? ButtonStyle.Cream : ButtonStyle.Dark;
    }

    private setPaused(on: boolean) {
        this.paused = on;
        if (this.overlay?.isValid) { this.overlay.destroy(); this.overlay = null; }
        if (!on) return;
        const kit = UiKit.get();
        const ut = this.node.getComponent(UITransform)!;
        const o = makeNode(this.node, 'Paused', ut.width, ut.height);
        this.overlay = o;
        const dim = makeSprite(o, 'Dim', kit.spark, ut.width, ut.height);
        dim.color = new Color(10, 8, 16, 200);
        const panel = makeSprite(o, 'Panel', kit.panelCream, 620, 400, {}, true).node;
        makeLabel(panel, 'Title', 'PAUSED', { size: FONT.heading + 9, spacing: 3, color: COLOR.ink, y: 120 });
        makeLabel(panel, 'Note', 'Leaving restarts this round from planning.', { font: 'body', size: FONT.bodySmall, color: COLOR.ink, y: 70 });
        makeButton(panel, 'Resume', ButtonStyle.Red, 'Resume', 500, 100, { y: -10 }, () => this.setPaused(false));
        makeButton(panel, 'Leave', ButtonStyle.Dark, 'Back to title', 500, 100, { y: -125 }, () => this.leave());
    }

    private leave() {
        // The fight isn't saved: the run reloads at this round's planning (Build Log 40).
        Game.reloadRun();
        ScreenManager.show('Title');
    }

    private end() {
        this.ending = true;
        if (tutorialStep() === 4) setTutorialStep(5);
        const f = this.fight!;
        const won = f.winner === 'player';
        Sound.play(won ? 'win' : 'lose');
        if (!won) Sound.music(null);
        const kit = UiKit.get();
        const banner = makeSprite(this.node, 'EndBanner', kit.panelCream, 1080, 180, {}, true).node;
        makeLabel(banner, 'Text', won ? 'ROUND WON' : 'THE KING HAS FALLEN', { size: FONT.title, spacing: 4, color: won ? COLOR.ink : '#D2453C', y: 8 });
        banner.setScale(0.6, 0.6, 1);
        tween(banner).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        this.scheduleOnce(() => finishRound(this.run!, f), END_PAUSE);
    }
}

// ---- Helpers ---------------------------------------------------------------------------

/** One sound per event, by what it actually did (a heal with nothing to heal is silent). */
function playEventSound(e: FightEvent, d: Diff) {
    if (e.kind === 'twist') Sound.play('twist');
    if (d.destroyed.length) Sound.play(e.effect === 'rot' ? 'rot' : e.target === 'enemy' ? 'hit' : 'hurt');
    else if (d.popped.length) Sound.play('block');
    else if (d.healed.length) Sound.play('heal');
    else if (d.shielded.length) Sound.play('shield');
}

function livingOf(g: HealthGrid): number {
    return g.cells.reduce((n, c) => n + (c.state === 'alive' ? 1 : 0), 0);
}

function diffOf(before: { state: string; shield: boolean }[], after: HealthGrid): Diff {
    const d: Diff = { destroyed: [], popped: [], healed: [], shielded: [] };
    after.cells.forEach((c, i) => {
        const b = before[i];
        if (b.state === 'alive' && c.state !== 'alive') d.destroyed.push(i);
        else if (b.state === 'alive' && b.shield && !c.shield) d.popped.push(i);
        else if (b.state !== 'alive' && c.state === 'alive') d.healed.push(i);
        else if (c.state === 'alive' && !b.shield && c.shield) d.shielded.push(i);
    });
    return d;
}
