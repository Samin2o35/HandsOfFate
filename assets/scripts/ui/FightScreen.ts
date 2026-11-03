// Hands of Fate — ui/FightScreen.ts
// Mockup 06. Plays the fight live: every frame it advances the core Fight by
// dt × speed (game-seconds, so speed never changes the score), then shows what
// happened:
//   - cooldown bars fill; a hand that fires flashes its label and its cards
//   - spent heal/armor charges turn their pips grey
//   - cells on the target grid change (lost / rotted / shielded / healed) with a
//     flash ring, sparks and a floating number
//   - your hands pop a banner ("FLUSH ♥ +8 healed"), and every event goes into
//     the round score feed with the live round score
//   - Slow / Medium / Fast at the bottom; Options pauses
// When a side's grid is empty: "ROUND WON" or "THE KING HAS FALLEN", then the
// round is scored and the next screen shown (see flow.ts).

import { _decorator, Node, UITransform, Widget, Color, UIOpacity, Sprite, Label, tween, Vec3 } from 'cc';
import { GameScreen } from './GameScreen';
import { Game, SPEED_MULTIPLIER, SPEEDS, SPEED_NAME, Speed } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { Run } from '../core/run';
import { Fight, FightEvent, HandState, SideId } from '../core/fight';
import { HealthGrid, cloneHealthGrid } from '../core/health';
import { applyEffect } from '../core/patterns';
import { HAND_INFO, EFFECT_CHARGES } from '../core/hands';
import { SUIT_COLOR_HEX, Suit } from '../core/cards';
import { scoreRound, formatTime } from '../core/scoring';
import {
    UiKit, makeNode, makeSprite, makeLabel, makeButton, clearChildren, textWidth, FONT, COLOR,
} from './UiKit';
import { ButtonStyle, UiButton } from './UiButton';
import { BoardView } from './BoardView';
import { buildOpponentStrip } from './OpponentStrip';
import { buildHealthGrid, paintHealth, shortName, HealthGridParts, HandLabelParts } from './views';
import { flashRing, sparks, floatText, shake, blink, FX_COLOR } from './fx';
import { finishRound } from './flow';
const { ccclass } = _decorator;

const MARGIN = 30;
const END_PAUSE = 1.6; // seconds of "ROUND WON" before moving on

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
    private labelFor = new Map<string, HandLabelParts>();
    private glowFor = new Map<string, Node>();

    private content: Node | null = null;
    private fx: Node | null = null;
    private overlay: Node | null = null;
    private timerLabel: Label | null = null;
    private roundScoreLabel: Label | null = null;
    private youLabel: Label | null = null;
    private feed: Node | null = null;
    private feedLines: { text: string; suit: Suit | null }[] = [];
    private banner: Node | null = null;
    private bannerArea = { left: 0, top: 0, w: 0, h: 0 };
    private speedButtons = new Map<Speed, UiButton>();

    onShow(params?: unknown) {
        const p = params as { run?: Run } | undefined;
        this.run = p?.run ?? Game.run;
        if (!this.run) { ScreenManager.show('Title'); return; }
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
        if (!f || this.paused || this.ending || !this.content) return;
        const events = f.advance(dt * SPEED_MULTIPLIER[Game.settings.speed]);
        for (const e of events) this.show(e);
        this.refreshBars();
        this.refreshTexts();
        if (f.over) this.end();
    }

    // ---- Building ------------------------------------------------------------------

    private build() {
        const run = this.run!;
        this.node.getComponent(Widget)?.updateAlignment();
        const ut = this.node.getComponent(UITransform)!;
        const W = Math.min(ut.width, 1080), H = ut.height;
        if (!this.content) {
            this.content = makeNode(this.node, 'Content', W, H);
            this.fx = makeNode(this.node, 'Effects', W, H);
        }
        clearChildren(this.content);
        const root = this.content;
        const L = -W / 2 + MARGIN, R = W / 2 - MARGIN, T = H / 2, B = -H / 2;
        const innerW = R - L;

        this.buildTopBar(root, run, L, R, T);
        const stripTop = T - 150, stripH = 330;
        const strip = buildOpponentStrip(root, run.opponent, L, stripTop, innerW, stripH, this.view!.enemy);
        this.grids.enemy = strip.health;

        // Bottom: speed buttons, then you + round score.
        const speedH = 100;
        const speedY = B + 30 + speedH / 2;
        this.buildSpeedButtons(root, L, innerW, speedY, speedH);
        const rowH = 200;
        const rowTop = speedY + speedH / 2 + 40 + rowH;
        this.buildYou(root, L, rowTop);
        this.buildScorePanel(root, L + 465, rowTop, innerW - 465, rowH);

        // Board (read-only, no stash) between the strip and the bottom row.
        const boardTop = stripTop - stripH - 18;
        this.board = new BoardView(root, this.fx!, run, {
            left: L, top: boardTop, width: innerW, height: boardTop - rowTop - 10,
            stashLeft: 0, stashTop: 0, stashWidth: 0, stashHeight: 0,
        }, { changed: () => undefined, selected: () => undefined }, null, false);

        // Labels by hand id, with a gold ring ready for when the hand fires.
        this.labelFor.clear();
        this.glowFor.clear();
        const result = run.board();
        const kit = UiKit.get();
        const add = (id: string | undefined, parts: HandLabelParts) => {
            if (!id) return;
            this.labelFor.set(id, parts);
            const size = parts.node.getComponent(UITransform)!;
            const glow = makeSprite(parts.node, 'Glow', kit.cardFrameGold, size.width + 12, size.height + 6, { y: 3 }, true).node;
            glow.active = false;
            this.glowFor.set(id, glow);
            if (parts.fill) parts.fill.getComponent(Sprite)!.spriteFrame = kit.barFillGold;
        };
        result.rows.forEach((line, i) => add(line.hand?.id, this.board!.labels.rows[i]));
        result.cols.forEach((line, i) => add(line.hand?.id, this.board!.labels.cols[i]));

        this.bannerArea = { left: this.board.colLabelsRight + 30, top: this.board.colLabelsTop, w: R - (this.board.colLabelsRight + 30), h: this.board.colLabelsHeight };
        this.refreshBars();
        this.refreshTexts();
    }

    private buildTopBar(root: Node, run: Run, L: number, R: number, T: number) {
        const kit = UiKit.get();
        const y = T - 22 - 50;
        const score = makeSprite(root, 'ScorePanel', kit.panelDark, 195, 106, { x: L + 97, y: y - 3 }, true).node;
        makeLabel(score, 'Title', 'SCORE', { size: FONT.labelSmall, spacing: 2, color: COLOR.cream, align: 'left', x: -75, y: 22 });
        makeLabel(score, 'Value', run.score.toLocaleString('en-US'), { size: FONT.heading, color: COLOR.gold, align: 'left', x: -75, y: -14 });
        const plaque = makeSprite(root, 'RoundPlaque', kit.panelCream, 324, 130, { x: 0, y: y - 5 }, true).node;
        makeLabel(plaque, 'Round', `ROUND ${run.round}`, { size: FONT.heading + 9, spacing: 2, color: COLOR.ink, y: 18 });
        this.timerLabel = makeLabel(plaque, 'Phase', 'Fight · 0:00', { font: 'body', size: FONT.bodySmall, color: '#3D3450', y: -22 });
        makeButton(root, 'Options', ButtonStyle.Dark, 'Options', 150, 87, { x: R - 75, y }, () => this.setPaused(true), 27);
    }

    private buildYou(root: Node, L: number, top: number) {
        const kit = UiKit.get();
        makeSprite(root, 'Avatar', kit.frame('concept/king_roughout'), 96, 144, { x: L + 48, y: top - 12 - 72 });
        this.youLabel = makeLabel(root, 'YouLabel', '', { size: FONT.labelSmall, spacing: 2, color: COLOR.lilac, align: 'left', x: L + 126, y: top - 12 });
        this.grids.player = buildHealthGrid(root, this.view!.player, 310, 160, L + 126, top - 36);
    }

    private buildScorePanel(root: Node, left: number, top: number, w: number, h: number) {
        const kit = UiKit.get();
        const panel = makeSprite(root, 'RoundScore', kit.panelDark, w, h + 6, { x: left + w / 2, y: top - (h + 6) / 2 }, true).node;
        makeLabel(panel, 'Title', 'ROUND SCORE', { size: FONT.labelSmall, spacing: 2, color: COLOR.cream, align: 'left', x: -w / 2 + 27, y: h / 2 - 30 });
        this.roundScoreLabel = makeLabel(panel, 'Total', '0', { size: FONT.heading + 3, color: COLOR.gold, align: 'right', x: w / 2 - 27, y: h / 2 - 30 });
        this.feed = makeNode(panel, 'Feed', w - 54, h - 70, { x: -w / 2 + 27, y: h / 2 - 62, anchorX: 0, anchorY: 1 });
        this.feedLines = [];
    }

    private buildSpeedButtons(root: Node, L: number, innerW: number, y: number, h: number) {
        this.speedButtons.clear();
        const gap = 18;
        const bw = (innerW - gap * 2) / 3;
        SPEEDS.forEach((speed, i) => {
            const b = makeButton(root, `Speed ${speed}`, ButtonStyle.Dark, SPEED_NAME[speed], bw, h, { x: L + bw / 2 + i * (bw + gap), y }, () => this.setSpeed(speed));
            this.speedButtons.set(speed, b);
        });
        this.paintSpeed();
    }

    // ---- Live updates ---------------------------------------------------------------

    private refreshBars() {
        const f = this.fight!;
        for (const h of f.player.hands) {
            const parts = this.labelFor.get(h.hand.id);
            if (!parts) continue;
            if (parts.fill) {
                parts.fill.getComponent(UITransform)!.width = Math.max(0.01, parts.fillWidth * f.progress(h));
            }
            this.paintPips(parts, h);
            if (h.charges <= 0) {
                const op = parts.node.getComponent(UIOpacity) ?? parts.node.addComponent(UIOpacity);
                op.opacity = 120;
            }
        }
    }

    private paintPips(parts: HandLabelParts, h: HandState) {
        if (parts.pips.length === 0) return;
        const kit = UiKit.get();
        const total = EFFECT_CHARGES[h.hand.effect];
        const spent = total - Math.max(0, h.charges);
        parts.pips.forEach((pip, i) => {
            pip.getComponent(Sprite)!.spriteFrame = i < spent ? kit.spentIcon(h.hand.suit) : kit.suitIcon(h.hand.suit);
        });
    }

    private refreshTexts() {
        const run = this.run!, f = this.fight!;
        if (this.timerLabel) this.timerLabel.string = `Fight · ${formatTime(f.time)}`;
        if (this.youLabel) this.youLabel.string = `YOU · ${livingOf(this.view!.player)} / ${f.player.startLiving}`;
        if (this.roundScoreLabel) {
            const s = scoreRound({
                round: run.round, boss: run.isBoss, handsFired: f.player.stats.handsFired, handPoints: f.player.stats.handPointsFired,
                cellsLeft: f.player.living, cellsTotal: f.player.startLiving, flawless: f.enemy.stats.damageDealt === 0, time: f.time,
            });
            this.roundScoreLabel.string = s.total.toLocaleString('en-US');
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

        if (e.kind === 'hand' && e.side === 'player') {
            const glow = this.glowFor.get(e.sourceId);
            if (glow) blink(glow);
            const parts2 = this.labelFor.get(e.sourceId);
            if (parts2?.fill) {
                const fill = parts2.fill.getComponent(Sprite)!;
                fill.spriteFrame = UiKit.get().barFill;
                this.scheduleOnce(() => { if (fill.isValid) fill.spriteFrame = UiKit.get().barFillGold; }, 0.25);
            }
            for (const pc of e.hand!.cards) {
                const v = this.board?.viewFor(pc.card.id);
                if (!v) continue;
                v.setSelected(true);
                this.scheduleOnce(() => { if (v.isValid) v.setSelected(false); }, 0.35);
            }
            this.popBanner(e, diff);
        } else if (e.kind === 'twist') {
            this.popBanner(e, diff);
        }
        this.addFeed(e, diff);
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

        const touched = [...d.destroyed, ...d.popped, ...d.healed, ...d.shielded];
        if (touched.length === 0) return;
        const centre = new Vec3();
        for (const i of touched) centre.add(parts.cells[i].node.worldPosition);
        centre.multiplyScalar(1 / touched.length);
        if (d.destroyed.length) {
            floatText(fx, centre, `-${d.destroyed.length}`, FX_COLOR.hit);
            shake(parts.node, 5);
        } else if (d.healed.length) floatText(fx, centre, `+${d.healed.length}`, FX_COLOR.heal);
        else if (d.shielded.length) floatText(fx, centre, `+${d.shielded.length}`, '#8FB8E0');
        else if (d.popped.length) floatText(fx, centre, 'blocked', '#8FB8E0');
    }

    /** "FLUSH ♥ +8 healed ♥♥♥" in the space beside the column labels. */
    private popBanner(e: FightEvent, d: Diff) {
        const a = this.bannerArea;
        if (a.w < 200) return;
        if (this.banner?.isValid) this.banner.destroy();
        const kit = UiKit.get();
        const banner = makeSprite(this.content!, 'Banner', kit.panelCreamSingle, a.w, a.h, { x: a.left + a.w / 2, y: a.top - a.h / 2 }, true).node;
        this.banner = banner;
        const suit: Suit = e.hand ? e.hand.suit : this.run!.opponent.boss?.suit ?? 'S';
        const title = e.hand ? shortName(e.hand) : e.label.toUpperCase();
        const x0 = -a.w / 2 + 24;
        const l1 = makeLabel(banner, 'Title', title, { size: FONT.label + 6, spacing: 2, color: SUIT_COLOR_HEX[suit], align: 'left', x: x0, y: 14 });
        makeSprite(banner, 'Icon', kit.suitIcon(suit), 30, 30, { x: x0 + textWidth(l1) + 24, y: 14 });
        makeLabel(banner, 'What', resultText(e, d), { font: 'body', size: FONT.bodySmall, color: COLOR.ink, align: 'left', x: x0, y: -22 });
        banner.setScale(0.9, 0.9, 1);
        tween(banner).to(0.12, { scale: new Vec3(1, 1, 1) }).delay(1.1).call(() => { if (banner.isValid) banner.destroy(); }).start();
    }

    private addFeed(e: FightEvent, d: Diff) {
        if (!this.feed) return;
        const who = e.side === 'player' ? '' : e.kind === 'twist' ? '' : 'Their ';
        const name = e.hand ? HAND_INFO[e.hand.category].name.toLowerCase() : e.label;
        const text = `${who}${who ? name : capital(name)} ${resultText(e, d)}`;
        const suit: Suit | null = e.hand ? e.hand.suit : this.run!.opponent.boss?.suit ?? null;
        this.feedLines.unshift({ text, suit });
        this.feedLines = this.feedLines.slice(0, 3);
        clearChildren(this.feed);
        const kit = UiKit.get();
        this.feedLines.forEach((line, i) => {
            const y = -14 - i * 38;
            if (line.suit) makeSprite(this.feed!, `Icon${i}`, kit.suitIcon(line.suit), 22, 22, { x: 11, y });
            makeLabel(this.feed!, `Line${i}`, line.text, { font: 'body', size: FONT.bodySmall, color: i === 0 ? COLOR.cream : COLOR.lilac, align: 'left', x: 32, y });
        });
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
        const f = this.fight!;
        const won = f.winner === 'player';
        const kit = UiKit.get();
        const ut = this.node.getComponent(UITransform)!;
        const banner = makeSprite(this.node, 'EndBanner', kit.panelCream, Math.min(ut.width, 1080) - 120, 180, {}, true).node;
        makeLabel(banner, 'Text', won ? 'ROUND WON' : 'THE KING HAS FALLEN', { size: FONT.title, spacing: 4, color: won ? COLOR.ink : '#D2453C', y: 8 });
        banner.setScale(0.6, 0.6, 1);
        tween(banner).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        this.scheduleOnce(() => finishRound(this.run!, f), END_PAUSE);
    }
}

// ---- Helpers ---------------------------------------------------------------------------

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

function plural(n: number, word: string) { return `${n} ${word}${n === 1 ? '' : 's'}`; }
function capital(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** "+8 healed (2 of 3)", "rotted 2 cells", "hit 3 cells, 1 blocked". */
function resultText(e: FightEvent, d: Diff): string {
    const charges = (e.hand && Number.isFinite(e.chargesLeft)) ? ` (${EFFECT_CHARGES[e.hand.effect] - e.chargesLeft} of ${EFFECT_CHARGES[e.hand.effect]})` : '';
    switch (e.effect) {
        case 'heal': return `healed ${d.healed.length}${charges}`;
        case 'armor': return `shielded ${d.shielded.length}${charges}`;
        case 'rot': {
            const blocked = d.popped.length ? `, ${d.popped.length} blocked` : '';
            return `rotted ${plural(d.destroyed.length, 'cell')}${blocked}`;
        }
        case 'attack': {
            const blocked = d.popped.length ? `, ${d.popped.length} blocked` : '';
            return `hit ${plural(d.destroyed.length, 'cell')}${blocked}`;
        }
    }
}
