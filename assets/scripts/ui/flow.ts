// Hands of Fate — ui/flow.ts
// What happens after a fight: the round is scored and logged, then the RoundWon screen
// (won) or the RunOver screen (lost). The old stand-ins for missing screens are gone
// (decision 170): every screen is in ScreenManager now.

import { Run, RoundResult } from '../core/run';
import { Fight } from '../core/fight';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { PlayLog } from '../app/PlayLog';

export interface PlanningMessage { title: string; body: string; }

export function finishRound(run: Run, fight: Fight): RoundResult {
    const snap = PlayLog.snapshot(run);
    const result = run.finishFight(fight);
    PlayLog.add(snap, fight, result);
    Game.recordProgress();
    ScreenManager.show(result.won ? 'RoundWon' : 'RunOver', { run, result });
    return result;
}
