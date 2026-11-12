// The open-table pixel maps must match the tool that drew the signed-off mockups
// (tools/art/make_mockups_c.py). Reference fingerprints made by that tool.
import { describe, it, expect } from 'vitest';
import { frame, cell, PAL, button, dottedRect, rewardHealth, rewardGrid, bar, flashOutline, fxPiece, FX_VARIANTS, FxKind, bloodPool } from '../assets/scripts/ui/pixelart';

const REF = {"open": "204x120:74a9ee0", "open2": "330x400:9a2160c5", "closed": "210x36:7fb10d85", "cell15": "17x17:9064559f", "cell21rot": "23x23:630b2921", "cell15shield": "17x17:e1140307", "cell15lost": "17x17:ab0fa2c0", "medEmpty": "36x36:86aadd25"};

describe('open-table pixel maps match the mockup tool', () => {
    it('open and closed frames', () => {
        expect(frame(204, 120, { capW: 40 }).hash()).toBe(REF.open);
        expect(frame(330, 400).hash()).toBe(REF.open2);
        expect(frame(210, 36, { closed: true }).hash()).toBe(REF.closed);
    });
    it('health cells in every state', () => {
        expect(cell(15).hash()).toBe(REF.cell15);
        expect(cell(21, 'rotted').hash()).toBe(REF.cell21rot);
        expect(cell(15, 'shield').hash()).toBe(REF.cell15shield);
        expect(cell(15, 'lost').hash()).toBe(REF.cell15lost);
    });
    it('buttons and rings stay inside the palette', () => {
        const allowed = new Set(Object.values(PAL).map((c) => c.join(',')));
        for (const p of [button(40, 20, 'red'), button(40, 20, 'cream', true), button(40, 20, 'outline'), dottedRect(45, 63, PAL.gold)]) {
            for (let i = 0; i < p.data.length; i += 4) {
                if (p.data[i + 3] === 0) continue;
                expect(p.data[i + 3]).toBe(255);
                expect(allowed.has([p.data[i], p.data[i + 1], p.data[i + 2], 255].join(','))).toBe(true);
            }
        }
    });
    it('5b pieces stay inside the palette, with no part-transparent pixels', () => {
        const allowed = new Set(Object.values(PAL).map((c) => c.join(',')));
        const pieces = [rewardHealth(true), rewardHealth(false), rewardGrid(true), rewardGrid(false),
            bar(184, 3, 90, PAL.gold)];
        for (const p of pieces) {
            for (let i = 0; i < p.data.length; i += 4) {
                if (p.data[i + 3] === 0) continue;
                expect(p.data[i + 3]).toBe(255);
                expect(allowed.has([p.data[i], p.data[i + 1], p.data[i + 2], 255].join(','))).toBe(true);
            }
        }
    });
    it('greyed icons use only the soft and room colours', () => {
        const ok = new Set([PAL.soft, PAL.room1].map((c) => c.join(',')));
        for (const p of [rewardHealth(false), rewardGrid(false)]) {
            for (let i = 0; i < p.data.length; i += 4) {
                if (p.data[i + 3]) expect(ok.has([p.data[i], p.data[i + 1], p.data[i + 2], 255].join(','))).toBe(true);
            }
        }
    });
    it('the flash outline has the corner step and an empty middle', () => {
        const p = flashOutline(16);
        expect(p.get(0, 0)[3]).toBe(0);
        expect(p.get(1, 0)[3]).toBe(0);
        expect(p.get(2, 0)[3]).toBe(255);
        expect(p.get(8, 8)[3]).toBe(0);
    });
    it('a bar fills from the left', () => {
        const p = bar(10, 3, 4, PAL.gold);
        expect(p.get(3, 1)[3]).toBe(255);
        expect(p.get(4, 1)[3]).toBe(0);
    });
    it('impact pieces are white, whole pixels, the same every time, and not empty (Stage E)', () => {
        for (const k of Object.keys(FX_VARIANTS) as FxKind[]) {
            for (let v = 0; v < FX_VARIANTS[k]; v++) {
                const p = fxPiece(k, v);
                let lit = 0;
                for (let i = 0; i < p.data.length; i += 4) {
                    if (p.data[i + 3] === 0) continue;
                    lit++;
                    expect([p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]]).toEqual([255, 255, 255, 255]);
                }
                expect(lit).toBeGreaterThan(2);
                expect(fxPiece(k, v).hash()).toBe(p.hash());
            }
        }
        // Splat variants differ from each other.
        expect(new Set([0, 1, 2, 3].map((v) => fxPiece('splat', v).hash())).size).toBe(4);
    });
    it("the King's pool stays in the palette, surrounds the card and is outlined in ink", () => {
        const allowed = new Set(Object.values(PAL).map((c) => c.join(',')));
        const { body, outline, rim, bottom, card } = bloodPool(400, 540, 240, 360, 5);
        for (const pix of [body, outline]) for (let i = 0; i < pix.data.length; i += 4) {
            if (pix.data[i + 3] === 0) continue;
            expect(allowed.has([pix.data[i], pix.data[i + 1], pix.data[i + 2], 255].join(','))).toBe(true);
        }
        const at = (p: typeof body, x: number, y: number) => p.data[(y * p.w + x) * 4 + 3] > 0;
        // Filled past every edge of the card.
        const [cx, cy] = card;
        expect(at(body, cx - 120 - 20, cy)).toBe(true);
        expect(at(body, cx + 120 + 20, cy)).toBe(true);
        expect(at(body, cx, cy - 180 - 20)).toBe(true);
        expect(at(body, cx, cy + 180 + 30)).toBe(true);
        // The outline covers every body pixel, and is wider by a pixel.
        let bodyN = 0, outN = 0;
        for (let i = 3; i < body.data.length; i += 4) { if (body.data[i]) { bodyN++; expect(outline.data[i]).toBeGreaterThan(0); } if (outline.data[i]) outN++; }
        expect(outN).toBeGreaterThan(bodyN);
        // Clear of the image's edges, so nothing is cut off.
        for (let x = 0; x < 400; x++) { expect(at(outline, x, 0)).toBe(false); expect(at(outline, x, 539)).toBe(false); }
        expect(rim.length).toBeGreaterThan(100);
        expect(bottom[200]).toBeGreaterThan(cy + 180);
    });
});
