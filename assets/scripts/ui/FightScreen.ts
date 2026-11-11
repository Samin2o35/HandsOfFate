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
// grid is empty and the last projectile has landed: "ROUND WON" or "THE KING HAS
// FALLEN", then the round is scored and the next screen shown (see flow.ts).
//
// Feel (plan phase 3, ui/juice.ts): a hand's cards lift and glow in its last
// 0.4 s; when it fires they pop and each throws a projectile (by suit) at the
// cells it will change. The rules are applied at once (they stay exact); the
// picture of those cells changes when the projectile lands, with a number, a
// hit-stop, a shake of the game layer and, for a full house or better, a small
// zoom. Boss twists dim the lights. Smoke puffs on fires and big hits.

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
import { UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, FONT } from './UiKit';
import { ButtonStyle, UiButton } from './UiButton';
import { BoardView, worldRect, unionRects } from './BoardView';
import { paintHealth, HealthGridParts } from './views';
import { frame, INK_TEXT } from './kitC';
import { healthCols } from '../core/health';
import { flashRing, sparks, FX_COLOR } from './fx';
import { launch, popNumber, tickJuice, Rig, dimLights, starBurst, firePop } from './juice';
import { Smoke } from '../app/Smoke';
import { shake } from './fx';
import { Suit } from '../core/cards';
import { HandCategory } from '../core/hands';
import { finishRound } from './flow';
import { Sound, Sfx } from '../app/Sound';
import { tutorialStep, setTutorialStep, showTutorial } from './Tutorial';
import { jokerLine, jokerSay } from './joker';
import {
    tableRegions, buildStrip, buildHandList, paintEntry, buildOpponentPanel, paintBadge, lightBadge, setCount, buildHealthBlock, buildJoker, HealthBlock,
    BadgeParts, ListEntry, GREY,
} from './table';
const { ccclass } = _decorator;

const END_PAUSE = 1.6; // seconds of "ROUND WON" before moving on
const FLASH = 0.35;    // how long a firing hand stays lit
const CHARGE = 0.4;    // game-seconds before firing when a hand's cards lift and glow
const LIFT = 10;
/** Full house or better gets the zoom. */
const BIG = new Set<HandCategory>(['fullHouse', 'quads', 'straightFlush']);
/** Hands the Joker remarks on. */
const BRAG = new Set<HandCategory>(['flush', 'fullHouse', 'quads', 'straightFlush']);
const STASH_H = 180; // planning's stash height, kept free so the list matches planning

/** What changed on a grid because of one event. */
interface Diff { destroyed: number[]; popped: number[]; healed: number[]; shielded: number[]; }

@ccclass('FightScreen')
export class FightScreen extends GameScreen {
    private run: Run | null = null;
    private fight: Fight | null = null;
    private paused = false;
    private ending = false;
    /** The Joker waits a few seconds between lines; `said` steps through his variants. */
    private quietUntil = 0;
    private said = 0;

    // Copies of both health grids, updated event by event (see show()).
    private view: Record<SideId, HealthGrid> | null = null;
    private grids: Partial<Record<SideId, HealthGridParts>> = {};
    private board: BoardView | null = null;
    private badgeFor = new Map<string, BadgeParts>();
    private entryFor = new Map<string, ListEntry>();
    private theirLine = new Map<string, Node>();
    private mine: HealthBlock | null = null;
    private theirs: HealthBlock | null = null;
    /** Hand ids lit until this game-time-independent clock (seconds of real time). */
    private litUntil = new Map<string, number>();
    private clock = 0;
    /** What the health grids show: changes when projectiles land (view changes at once). */
    private shown: Record<SideId, HealthGrid> | null = null;
    private inFlight = 0;
    private lastLaunch = 0;
    private freezeUntil = 0;
    private rig: Rig | null = null;
    private cardBase = new Map<number, Vec3>();
    private popUntil = new Map<number, number>();
    private avatar: Node | null = null;

    private content: Node | null = null;
    private fx: Node | null = null;
    private overlay: Node | null = null;
    private phaseLabel: Label | null = null;
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
        this.shown = { player: cloneHealthGrid(this.fight.player.health), enemy: cloneHealthGrid(this.fight.enemy.health) };
        this.build();
    }

    update(dt: number) {
        const f = this.fight;
        if (!f || !this.content) return;
        this.clock += dt;
        tickJuice(dt);
        this.rig?.update(dt);
        this.refreshLit();
        if (this.paused || this.ending) return;
        this.refreshCharge();
        if (f.over) {
            // The banner waits for the last projectile (at most 1.2 s, in case one never lands).
            if (this.inFlight === 0 || this.clock - this.lastLaunch > 1.2) this.end();
            return;
        }
        // Hit-stop: the fight holds for a few frames after a heavy hit.
        if (this.clock < this.freezeUntil) return;
        const events = f.advance(dt * SPEED_MULTIPLIER[Game.settings.speed]);
        for (const e of events) this.show(e);
        this.refreshBars();
        this.refreshTexts();
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

        const strip = buildStrip(root, g, run.round, 'Fight · 0:00', run.score, () => this.setPaused(true), 'Fight · 0:00 · this round +00,000');
        this.phaseLabel = strip.phase;

        // Left: your hands, then your health. Same places as in planning (its stash space
        // stays free), so nothing moves when the round starts.
        const side = g.side;
        const cells = this.view!.player.cells.length;
        const healthH = Math.max(168, Math.ceil(cells / healthCols(cells)) * 34 + 66);
        const listTop = side.top + 4;
        const stashTop = side.top - side.height + STASH_H;
        const list = buildHandList(root, run.board().hands, side.left, listTop, side.width, listTop - (stashTop + 4) - 22 - healthH - 22);
        this.entryFor.clear();
        for (const e of list.entries) this.entryFor.set(e.hand.id, e);
        this.mine = buildHealthBlock(root, side.left, list.bottom - 22, side.width, this.view!.player);
        this.grids.player = this.mine.grid;

        // Middle: the board, read-only.
        this.board = new BoardView(root, this.fx!, run, {
            left: g.board.left, top: g.board.top, width: g.board.width, height: g.board.height,
            stashLeft: 0, stashTop: 0, stashWidth: 0, stashHeight: 0,
        }, { changed: () => undefined, selected: () => undefined }, null, false);
        this.badgeFor.clear();
        for (const b of [...this.board.badges.rows, ...this.board.badges.cols]) if (b.hand) this.badgeFor.set(b.hand.id, b);
        this.cardBase.clear();
        for (const h of f.player.hands) for (const pc of h.hand.cards) {
            const v = this.board.viewFor(pc.card.id);
            if (v) this.cardBase.set(pc.card.id, v.node.position.clone());
        }
        this.rig = new Rig(root);
        buildJoker(root, g, this.board.block.left + this.board.block.width / 2, this.board.frameTop);

        // Right: the opponent, their health large; speed buttons under it.
        const cooldown = new Map(f.enemy.hands.map((h) => [h.hand.id, h.cooldown] as [string, number]));
        const panel = buildOpponentPanel(root, g.opponent, run.opponent, f.enemy.hands.map((h) => h.hand), (h) => cooldown.get(h.id) ?? h.cooldown, this.view!.enemy);
        this.theirLine = panel.lines;
        this.avatar = panel.avatar;
        this.theirs = panel.health;
        this.grids.enemy = panel.health.grid;
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

    private textKey = '';

    private refreshTexts() {
        const run = this.run!, f = this.fight!;
        // Every frame calls this; the score and clock only change with whole seconds and fired hands.
        const key = `${Math.floor(f.time)}|${f.player.stats.handsFired}|${f.player.stats.handPointsFired}|${f.player.living}|${f.enemy.stats.damageDealt > 0}`
            + `|${this.shown?.player.cells.filter((c) => c.state === 'alive').length}|${this.shown?.enemy.cells.filter((c) => c.state === 'alive').length}`;
        if (key === this.textKey) return;
        this.textKey = key;
        const s = scoreRound({
            round: run.round, boss: run.isBoss, handsFired: f.player.stats.handsFired, handPoints: f.player.stats.handPointsFired,
            cellsLeft: f.player.living, cellsTotal: f.player.startLiving, flawless: f.enemy.stats.damageDealt === 0, time: f.time,
        });
        if (this.phaseLabel) this.phaseLabel.string = `Fight · ${formatTime(f.time)} · this round +${s.total.toLocaleString('en-US')}`;
        // The big counts follow what the grids show (they change when projectiles land).
        if (this.mine && this.shown) setCount(this.mine, this.shown.player);
        if (this.theirs && this.shown) setCount(this.theirs, this.shown.enemy);
    }

    /** Lights a hand for FLASH seconds: yours (badge, list line, cards) or theirs (their line). */
    private light(side: SideId, id: string) {
        this.litUntil.set(`${side}:${id}`, this.clock + FLASH);
        if (side === 'enemy') { const ring = this.theirLine.get(id); if (ring?.isValid) ring.active = true; return; }
        const entry = this.entryFor.get(id);
        if (entry) paintEntry(entry, 'firing');
        const badge = this.badgeFor.get(id);
        if (badge) lightBadge(badge, true);
    }

    /**
     * Every frame: a hand's cards lift and get the pink ring in its last 0.4 s
     * (and while it's lit after firing); the rest breathe a little.
     */
    private refreshCharge() {
        const f = this.fight!;
        const lift = new Map<number, number>();
        for (const h of f.player.hands) {
            if (h.charges <= 0) continue;
            const left = (1 - f.progress(h)) * h.cooldown;
            const lit = this.litUntil.has(`player:${h.hand.id}`);
            const k = lit ? 1 : left < CHARGE ? 1 - left / CHARGE : 0;
            for (const pc of h.hand.cards) lift.set(pc.card.id, Math.max(lift.get(pc.card.id) ?? 0, k));
        }
        for (const [id, base] of this.cardBase) {
            const v = this.board?.viewFor(id);
            if (!v?.isValid) continue;
            const k = lift.get(id) ?? 0;
            v.setSelected(k > 0); // (active only changes when it differs)
            if ((this.popUntil.get(id) ?? 0) > this.clock) continue;
            const breathe = Math.sin(this.clock * 2.2 + id * 1.7) * 1.5;
            v.node.setPosition(base.x, base.y + k * LIFT + breathe, 0);
        }
    }

    private refreshLit() {
        for (const [key, until] of this.litUntil) {
            if (this.clock < until) continue;
            this.litUntil.delete(key);
            const [side, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
            if (side === 'enemy') { const ring = this.theirLine.get(id); if (ring?.isValid) ring.active = false; continue; }
            const entry = this.entryFor.get(id);
            if (entry) paintEntry(entry, 'normal');
            const badge = this.badgeFor.get(id);
            if (badge) lightBadge(badge, false);
        }
    }

    // ---- One event ---------------------------------------------------------------

    private show(e: FightEvent) {
        const target = this.view![e.target];
        const before = target.cells.map((c) => ({ state: c.state, shield: c.shield }));
        applyEffect(target, e.effect, e.cells);
        const diff = diffOf(before, target);
        const after = target.cells.map((c) => ({ state: c.state, shield: c.shield }));

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

        const touched = Array.from(new Set(diff.destroyed.concat(diff.popped, diff.healed, diff.shielded)));
        const parts = this.grids[e.target];
        if (!parts || touched.length === 0) { playEventSound(e, diff); return; }

        // Projectiles from the hand's cards (yours), their hand's line (theirs) or the King (a twist).
        const suit: Suit = e.hand?.suit ?? this.run!.opponent.boss?.suit ?? 'S';
        const sources = this.sourcesFor(e);
        const targets = touched.map((i) => parts.cells[i].node.worldPosition);
        if (e.kind === 'twist') {
            dimLights(this.node);
            if (this.avatar) shake(this.avatar, 8);
        }
        Smoke.puff(sources[0], 0.3);
        this.inFlight++;
        this.lastLaunch = this.clock;
        let pending = sources.length;
        // The throw sounds as the cards let go; the impact sound plays when it lands.
        if (e.kind === 'hand') Sound.play(`throw_${suit}` as Sfx);
        sources.forEach((src, k) => launch(this.fx!, src, targets[k % targets.length], suit, () => {
            if (--pending === 0) this.land(e, diff, after, touched);
        }, e.kind === 'twist' ? 0.25 : 0));
    }

    /** Where an event's projectiles start (world positions). */
    private sourcesFor(e: FightEvent): Vec3[] {
        if (e.kind === 'hand' && e.side === 'player' && e.hand) {
            const out: Vec3[] = [];
            for (const pc of e.hand.cards) {
                const v = this.board?.viewFor(pc.card.id);
                const base = this.cardBase.get(pc.card.id);
                if (!v) continue;
                out.push(v.node.worldPosition.clone());
                if (base) { this.popUntil.set(pc.card.id, this.clock + 0.24); firePop(v.node, base.y); }
            }
            if (out.length) return out;
        }
        if (e.kind === 'hand' && e.side === 'enemy') {
            const line = this.theirLine.get(e.sourceId);
            if (line?.isValid) return [line.worldPosition.clone()];
        }
        return [(this.avatar ?? this.content!).worldPosition.clone()];
    }

    /** A projectile arrived: now the cells change, with the number, stop, shake and puff. */
    private land(e: FightEvent, diff: Diff, after: { state: string; shield: boolean }[], touched: number[]) {
        this.inFlight = Math.max(0, this.inFlight - 1);
        const shown = this.shown![e.target];
        for (const i of touched) {
            shown.cells[i].state = after[i].state as typeof shown.cells[number]['state'];
            shown.cells[i].shield = after[i].shield;
        }
        const parts = this.grids[e.target];
        if (!parts?.node.isValid) return;
        paintHealth(parts, shown);
        const centre = this.cellEffects(parts, e, diff);
        playEventSound(e, diff);
        this.refreshTexts();
        const hits = diff.destroyed.length;
        if (hits) {
            this.freezeUntil = Math.max(this.freezeUntil, this.clock + Math.min(0.08, 0.04 + hits * 0.008));
            this.rig?.shake(Math.min(1, 0.12 + hits * 0.07));
            Smoke.puff(centre, Math.min(1, 0.3 + hits * 0.1));
        }
        if (e.hand && BIG.has(e.hand.category)) this.rig?.punch(centre);
        this.react(e, diff);
    }

    /** The Joker speaks up now and then: your big hands, and your big losses. */
    private react(e: FightEvent, diff: Diff) {
        if (!this.content || this.clock < this.quietUntil || tutorialStep() > 0) return;
        let line = '';
        if (e.side === 'player' && e.hand && BRAG.has(e.hand.category)) line = jokerLine('bigHand', ++this.said);
        else if (e.target === 'player' && diff.destroyed.length >= 3) line = jokerLine('hurt', ++this.said);
        if (!line) return;
        jokerSay(this.content, line, 2.4);
        this.quietUntil = this.clock + 5;
    }

    private cellEffects(parts: HealthGridParts, e: FightEvent, d: Diff): Vec3 {
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
        const centre = new Vec3();
        if (touched.length === 0) return centre;
        for (const i of touched) centre.add(parts.cells[i].node.worldPosition);
        centre.multiplyScalar(1 / touched.length);
        const suit = e.hand?.suit ?? null;
        if (d.destroyed.length) popNumber(fx, parts.node, centre, `-${d.destroyed.length}`, FX_COLOR.hit, suit);
        else if (d.healed.length) popNumber(fx, parts.node, centre, `+${d.healed.length}`, FX_COLOR.heal, suit);
        else if (d.shielded.length) popNumber(fx, parts.node, centre, `+${d.shielded.length}`, '#94D2D4', suit);
        else if (d.popped.length) popNumber(fx, parts.node, centre, 'blocked', '#94D2D4', null);
        return centre;
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
        const panel = frame(o, 'Panel', 620, 400, {}, { closed: true, fill: 'room0', caption: 'PAUSED' });
        makeLabel(panel, 'Title', 'PAUSED', { size: FONT.heading + 9, spacing: 3, color: GREY.text, y: 120 });
        makeLabel(panel, 'Note', 'Leaving restarts this round from planning.', { font: 'body', size: FONT.bodySmall, color: GREY.soft, y: 70 });
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
        // Make sure the grids show the final state (in case projectiles landed out of order).
        for (const side of ['player', 'enemy'] as SideId[]) {
            const parts = this.grids[side];
            if (parts?.node.isValid) paintHealth(parts, this.view![side]);
        }
        for (const v of this.cardBase.keys()) this.board?.viewFor(v)?.setSelected(false);
        Sound.play(won ? 'win' : 'lose');
        if (won) { starBurst(this.fx!, this.node.worldPosition); Smoke.puff(this.node.worldPosition, 1); }
        else Smoke.mood(true);
        if (!won) Sound.music(null);
        const banner = frame(this.node, 'EndBanner', 1080, 180, {}, { closed: true, fill: 'room0' });
        makeLabel(banner, 'Text', won ? 'ROUND WON' : 'THE KING HAS FALLEN', { size: FONT.title, spacing: 4, color: won ? INK_TEXT.gold : INK_TEXT.red, y: 4 });
        if (tutorialStep() === 0 && this.content) jokerSay(this.content, jokerLine(won ? 'won' : 'lost', this.run!.round));
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
