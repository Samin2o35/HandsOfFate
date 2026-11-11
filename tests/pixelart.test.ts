// The open-table pixel maps must match the tool that drew the signed-off mockups
// (tools/art/make_mockups_c.py). Reference fingerprints made by that tool.
import { describe, it, expect } from 'vitest';
import { frame, cell, medallion, PAL, button, dottedRect } from '../assets/scripts/ui/pixelart';

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
    it('the empty medallion', () => {
        expect(medallion(0, false).hash()).toBe(REF.medEmpty);
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
});
