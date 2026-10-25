# Aven — notes for Claude

Omar's gym, food and wrestling app (React + TypeScript + Vite PWA). He uses it on a Galaxy S26 Ultra (120 Hz) in Chrome
as an installed app and judges everything on the phone. He is not a programmer: explain results in plain, short words.

## Where things are
- To-do list: `docs/polish-plan.md`. When Omar says "do section N", do it and tick it off there.
- Coach 2.0 (15 Oct): `docs/coach-plan.md`, one phase per session; the polish plan is paused meanwhile.
- Living coach (25 Oct): `docs/living-coach-plan.md`: the plan, Omar's decisions, a progress table and the next step. One step per "go"; update its progress table after each step.
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

## Automatic helpers (use them without being asked)
- **Playwright** (`.mcp.json`): whenever you need to see, tap or check the app, open it with Playwright at phone width and look at the screenshot. Use it for any visual or layout change before saying it is done.
- **style-reviewer** (`.claude/agents/style-reviewer.md`): after any UI, CSS or animation change, run it before showing Omar and fix what it finds. It only reads; it says "needs Beta" when only his phone can judge.

## Shipping
- The live app deploys (GitHub Pages) from `ccr-d1172cc7-1e03wh` (also the default branch).
- When work is done and checked: bump the version in `package.json`, run `npm run verify` (typecheck, tests, build),
  open a pull request into `ccr-d1172cc7-1e03wh` and merge it yourself. Tell Omar when the "Deploy web app" action is
  green. If it fails, fix it right away: red means his phone keeps the old version.
- End with exactly what to check on the phone (screen, what to do, what it should look like) and tell him to fully reload.

## Ship to Beta (try it on the phone BEFORE it ships)
Steps, in order: **1. Deploy** to Beta (command below) → **2. Omar tries it** → **3. Promote** to the real app only after his yes.
A second installable app, "Aven Beta" (teal icon with a BETA label), lives at `https://omaralawi1000-netizen.github.io/The-new-Claude-gym-app/beta/`.
It is the same code with its own name, icon and its own storage (every storage key and database name gets `beta:` in front,
`src/lib/beta.ts`), so it can never read or change the real app's workouts, food or keys. Omar installs it once, next to the real app.
- **Beta is only for changes that need his real phone to judge** (Omar, 14 Oct): smoothness and frame drops, flicker or black frames,
  banding, how blur and glass look on his screen, touch and gesture feel, GPU, layer or performance changes. For those, tell him in
  one plain line "I think you should test this on Beta first" and ship to the real app only after his yes in Beta. Everything else
  (pure looks or timing the in-Claude video already shows faithfully) goes straight to the real app after his yes on the video.
  If he says skip Beta, skip it.
- **For such a change, ship it to Beta first.** Merge the default branch
  into your branch, run `npm run verify`, then put the branch on Beta with the GitHub tool `actions_run_trigger`
  (workflow `pages.yml`, ref = the default branch, inputs `{"beta_branch": "<your branch>"}`), or by hand: Actions → Deploy web app →
  Run workflow → branch name. Wait until it is green, tell Omar to open Aven Beta (it offers "Update" / reload), and send him what to check.
  Only after he approves, do the normal PR into the default branch (below). Don't bump the version for a Beta-only trial.
- **Deploy command:** GitHub tool `actions_run_trigger`, method `run_workflow`, workflow `pages.yml`, ref = the default branch,
  inputs `{"beta_branch": "<your branch>"}`. Green run = Beta updated (about 90 s). Beta needs the branch to contain this setup: merge the default branch first.
- **Version in Beta:** Settings → About Aven shows `v<package.json version of your branch> beta` and a "Aven Beta" box. A trial has no bump, so
  it shows the same number as the real app; tell Omar which branch/trial he is looking at in your message, not by version.
- **Promote after his yes:** bump the version (check the default branch right before), `npm run verify`, PR into the default branch, merge, wait for
  "Deploy web app" green, then tell him what to check on the real app and to fully reload. Beta is rebuilt from the same branch on that deploy
  (merge first so it matches). If he says no, change the branch and deploy to Beta again; nothing real was touched.
- Beta shows ONE branch at a time (the branch called `beta` remembers it); a new trial replaces the old one. Leaving the box empty keeps it.
- The real app still deploys only from the default branch. Every real deploy rebuilds Beta from the remembered branch, so a broken
  Beta never blocks the real app (it shows a short note instead).
- Beta Settings → About Aven has "Copy my real Aven data in" (one way: the real app is only read; API keys come along, sign-in tokens don't).
  Use fake or test data in Beta freely; "Delete all data" in Beta only deletes Beta's data.
- Branch must contain Beta support (this PR). The workflow says so if it doesn't: merge the default branch into it.
- Proof that the data is separate: `npm run build && node scripts/build-beta.mjs && node scripts/beta-check.mjs`.
- Links to the site open the Aven Android app (it owns the whole path). Beta is opened by typing the address in Chrome, not by tapping a link.

## Keep his usage low
- Do the one thing asked; mention other problems briefly instead of fixing them unasked.
- Verify proportionately: `npm run verify`, plus only the `scripts/` journeys that touch what you changed (full
  `scripts/run-all.sh` only for big changes). Journeys need `npx vite --port 5173 --host 127.0.0.1` and
  `AVEN_MOCK_UPSTREAM=1 USDA_API_KEY=demo node server/index.mjs`.
- Screenshots/films only for visual or motion changes. Headless Chromium needs `AVEN_GPU=1` to render blur.
