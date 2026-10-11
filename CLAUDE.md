# Aven — notes for Claude

Omar's gym, food and wrestling app (React + TypeScript + Vite PWA). He uses it on a Galaxy S26 Ultra in Chrome and judges
everything on the phone. He is not a programmer: explain results in plain, short language.

## What's next
- The to-do list is `docs/polish-plan.md`. When Omar says "do section N", do that section and tick it off there.

## Getting changes onto his phone
- The live app deploys (GitHub Pages) from branch `ccr-d1172cc7-1e03wh` (also the default branch).
- Omar's standing instruction: when your work is done and checked, open a pull request into `ccr-d1172cc7-1e03wh` and
  merge it yourself, so the app updates. Tell him when it's live (the "Deploy web app" action finished green).
- If the deploy action fails, fix it right away: a red deploy means his phone keeps the old version.

## Keep his usage low
- Do the one thing he asked; mention other problems briefly instead of fixing them unasked.
- Verify proportionately: `npx tsc --noEmit`, `npm run build`, `npx vitest run`, plus only the journeys in `scripts/`
  that touch what you changed. The full `scripts/run-all.sh` only for big changes.
- Screenshots/films only when the change is visual or about motion. Headless Chromium needs `AVEN_GPU=1` to render blur.
- Journeys need: `npx vite --port 5173 --host 127.0.0.1` and `AVEN_MOCK_UPSTREAM=1 USDA_API_KEY=demo node server/index.mjs`.

## Rules that must hold
- API keys are typed into Settings and stay on the phone: never in code, commits, logs or backups.
- No paid services (the OpenAI key is optional and his own).
- The orb never changes shape. Motion stays calm and Apple-like, smooth at 120 Hz on Android Chrome.
- Danish and English: every new UI string needs a Danish entry in `src/lib/da.ts` (`node scripts/i18n-keys.mjs --missing`).
- His workout and food data is precious: no destructive migrations without asking.
- README.md has the history of every design decision; read the relevant section before changing something.
