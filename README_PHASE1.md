# Hands of Fate — Phase 1: Landscape

The game is now 1920×1080 landscape. Title, Options, Aces, the boss intro, run over and the
Ace earned pop-up are re-laid. **Planning, the fight and round won will look wrong until
phase 2** (they get the new shared layout there). They still work, so a run can be played.

This zip also contains the performance fixes from HandsOfFate_perf.zip (PlanningScreen,
BoardView, ForgeView, Tutorial, ScreenManager), which you hadn't applied. Don't apply that
zip separately.

## 1. Copy the files
1. **Close Cocos Creator** (it rewrites the scene and prefabs if they change while it's open).
2. Back up your project folder (or commit).
3. Unzip this over the project root and say yes to replacing files. It replaces:
   - assets/scripts/app: ScreenFit.ts, ScreenManager.ts, and the new Preview.ts
   - assets/scripts/ui: OptionsScreen, AchievementsScreen, BossIntroScreen, RunOverScreen,
     Modal, PlanningScreen, BoardView, ForgeView, Tutorial
   - assets/scenes/Game.scene and every prefab in assets/prefabs/screens
   - settings/v2/packages/project.json (design resolution)
   - package.json (adds `npm run layout`), tools/layout/ (new), tools/art/make_itch_extras.py
4. Open the project. Cocos makes a .meta file for Preview.ts by itself.

## 2. Check the settings
1. **Project → Project Settings → Project Data**: Design Width 1920, Design Height 1080,
   Fit Height ticked. (ScreenFit sets the fit mode at runtime anyway.)
2. In the editor's preview bar, pick a landscape device size (e.g. 1920×1080) or choose
   "Customize" and enter 2340×1080 for a phone shape.

## 3. Builds
- **Build → Web Mobile**: set **Orientation** to **Landscape**, then rebuild.
- **Android** (when you get there): Orientation **Landscape** (untick Portrait).
- itch.io: on the game's edit page set the embed size to **960×540** (or 1280×720) and
  remove "Mobile friendly → Portrait" (choose Landscape). The itch cover art and page
  background are still portrait-era; they get redone with the new art.

## 4. Try it
Play in the browser preview, open the developer console (F12) and type:
- `hof.preview('BossIntro', 'S', 1)` — boss intro, King of Spades tier I (suits S H C D, tiers 1–4)
- `hof.preview('RunOver')` — run over with a sample run (not saved, no Ace progress)
- `hof.preview('Ace', 'endless')` — the Ace earned pop-up over the current screen
- `hof.preview('Options')`, `hof.preview('Achievements')`, `hof.preview('Title')`

Check that nothing is cut off at 16:9 and at a phone shape (2340×1080).

## 5. Optional: layout pictures without Cocos
`npm run layout` runs the real screen code against a stand-in for Cocos and draws each
screen's boxes at 19.5:9, 16:9 and 4:3 into build/layout. Needs Python 3 with Pillow
(`pip install pillow`). The text widths are estimates, so treat it as a rough check.

## Checks run here
TypeScript check clean; 87 tests pass; layout pictures of every re-laid screen at the three
shapes show no overlaps or cut-offs (the Title button column ran off the bottom; fixed).
