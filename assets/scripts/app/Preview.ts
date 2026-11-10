// Hands of Fate — app/Preview.ts
// Console shortcuts for checking screens without playing to them (browser preview):
//
//   hof.preview('BossIntro', 'S', 2)   King of Spades, tier II
//   hof.preview('RunOver')             a finished sample run (your profile isn't touched)
//   hof.preview('Ace', 'endless')      the Ace earned pop-up over the current screen
//   hof.preview('Confirm')             the yes/no box
//   hof.preview('Title' | 'Options' | 'Achievements')
//
// Sample runs are never saved, and the run over preview skips recording the run.

import { director, UITransform } from 'cc';
import { Run } from '../core/run';
import { generateOpponent } from '../core/opponents';
import { Rng } from '../core/rng';
import { Suit } from '../core/cards';
import { AceId } from '../core/achievements';
import { celebrateAce, confirmBox } from '../ui/Modal';

type Show = (name: string, params?: unknown) => boolean;

function sampleRun(round: number, boss?: { suit: Suit; tier: number }): Run {
    const run = Run.newRun({ seed: 4242 });
    const d = run.data;
    d.round = round;
    d.score = 18_450;
    d.totals = { handsFired: 213, bestHand: 'fullHouse', roundsWon: round - 1 };
    d.opponent = generateOpponent(round, new Rng(round * 7 + 1), { boss });
    return run;
}

export function registerPreview(show: Show) {
    const hof = (globalThis as unknown as { hof: Record<string, unknown> }).hof;
    if (!hof) return;
    hof.preview = (name: string, a?: string, b?: number) => {
        switch (name) {
            case 'BossIntro': {
                const suit = (['S', 'H', 'C', 'D'].includes(a ?? '') ? a : 'S') as Suit;
                return show('BossIntro', { run: sampleRun(5, { suit, tier: Math.max(1, b ?? 1) }) });
            }
            case 'RunOver':
                return show('RunOver', { run: sampleRun(12), preview: true });
            case 'Ace': {
                const host = director.getScene()?.getChildByName('Canvas')?.getChildByPath('SafeRoot/Screens')?.children.find((n) => n.getComponent(UITransform));
                if (!host) return false;
                celebrateAce(host, (a ?? 'endless') as AceId);
                return true;
            }
            case 'Confirm': {
                const host = director.getScene()?.getChildByName('Canvas')?.getChildByPath('SafeRoot/Screens')?.children.find((n) => n.getComponent(UITransform));
                if (!host) return false;
                confirmBox(host, 'REPLACE YOUR RUN?', 'This starts a new run and replaces your saved one.', 'Replace', 'Keep', () => {});
                return true;
            }
            default:
                return show(name);
        }
    };
}
