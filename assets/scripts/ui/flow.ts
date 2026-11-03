// Hands of Fate — ui/flow.ts
// What happens after a fight, shared by the fight screen (and the planning
// screen's quick play if the fight screen is missing).
//   won  -> RoundWon screen (stage 8); until it exists: take their best card and
//           the Cards reward, then back to planning with a message
//   lost -> RunOver screen (stage 8); until it exists: end the run, back to title

import { Run, RoundResult } from '../core/run';
import { Fight } from '../core/fight';
import { Game } from '../app/Game';
import { ScreenManager } from '../app/ScreenManager';
import { cardWords } from './views';

export interface PlanningMessage { title: string; body: string; }

export function finishRound(run: Run, fight: Fight): RoundResult {
    const result = run.finishFight(fight);
    Game.recordProgress();
    const s = result.score;
    console.log(`Round ${result.round} ${result.won ? 'won' : 'lost'} vs ${result.opponent} in ${fight.time.toFixed(1)} s`, s);

    if (!result.won) {
        if (!ScreenManager.show('RunOver', { run, result })) {
            Game.endRun();
            console.log(`Run over at round ${result.round}, score ${run.score}. (Run over screen comes in stage 8.)`);
            ScreenManager.show('Title');
        }
        return result;
    }
    if (ScreenManager.show('RoundWon', { run, result })) return result;

    // No reward screen yet (stage 8): take their best card and the Cards reward.
    const best = [...run.takeableCards()].sort((a, b) => b.rank - a.rank)[0];
    const took = run.takeCard(best.id);
    const gained = run.chooseReward({ kind: 'cards' });
    Game.saveRun();
    console.log(`Auto reward until stage 8: took the ${cardWords(took)}; new cards: ${gained.map(cardWords).join(', ')}`);
    const message: PlanningMessage = {
        title: `Round ${result.round} won · +${s.total.toLocaleString('en-US')}`,
        body: `Took the ${cardWords(took)} and 3 new cards (see the stash). ${s.cellsLeft}/${s.cellsTotal} cells left.`,
    };
    ScreenManager.show('Planning', { run, message });
    return result;
}
