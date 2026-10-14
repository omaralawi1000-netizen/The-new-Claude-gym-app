# Aven — notes for Claude

Omar's gym, food and wrestling app (React + TypeScript + Vite PWA). He uses it on a Galaxy S26 Ultra (120 Hz) in Chrome
as an installed app and judges everything on the phone. He is not a programmer: explain results in plain, short words.

## Where things are
- To-do list: `docs/polish-plan.md`. When Omar says "do section N", do it and tick it off there.
- `README.md` is the history of every design decision. Read the relevant section before changing something.

## Rules that must hold
- **Read `docs/style-guide.md` first and follow it** (glass, colour, motion, performance, process, rejected looks). It is Omar's one written style for every session.
- Blur AND 120 fps. Frosted glass stays; make it cheap instead of removing it: blur only small fixed layers, never blur
  on blur, never animate the blur, animate only transform and opacity, pause off-screen animation.
- Motion stays slow, calm and Apple-like. Never faster or snappier unless Omar agrees. The orb never changes shape.
- Floating surfaces (rest bar, sheets, bars, buttons) are see-through frost, never a solid block.
- API keys are typed into Settings and stay on the phone: never in code, commits, logs or backups. No paid services.
- Danish and English: every new UI string needs a Danish entry in `src/lib/da.ts` (`node scripts/i18n-keys.mjs --missing`).
- His workout and food data is precious: no destructive migrations without asking.
- Small steps. Save a backup branch before anything risky. If Omar says "worse", go straight back to the last version he
  approved with no other changes, then fix separately.

## Shipping
- The live app deploys (GitHub Pages) from `ccr-d1172cc7-1e03wh` (also the default branch).
- When work is done and checked: bump the version in `package.json`, run `npm run verify` (typecheck, tests, build),
  open a pull request into `ccr-d1172cc7-1e03wh` and merge it yourself. Tell Omar when the "Deploy web app" action is
  green. If it fails, fix it right away: red means his phone keeps the old version.
- End with exactly what to check on the phone (screen, what to do, what it should look like) and tell him to fully reload.

## Keep his usage low
- Do the one thing asked; mention other problems briefly instead of fixing them unasked.
- Verify proportionately: `npm run verify`, plus only the `scripts/` journeys that touch what you changed (full
  `scripts/run-all.sh` only for big changes). Journeys need `npx vite --port 5173 --host 127.0.0.1` and
  `AVEN_MOCK_UPSTREAM=1 USDA_API_KEY=demo node server/index.mjs`.
- Screenshots/films only for visual or motion changes. Headless Chromium needs `AVEN_GPU=1` to render blur.
