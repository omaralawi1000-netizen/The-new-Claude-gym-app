#!/usr/bin/env bash
# Runs the whole verification suite against a running dev server (:5173) and lookup mock (:8787).
# Start them first:  npx vite --port 5173 &   AVEN_MOCK_UPSTREAM=1 USDA_API_KEY=demo node server/index.mjs &
cd "$(dirname "$0")/.."
pass=0; fail=0
run() { name=$1; shift; if timeout "${T:-240}" "$@" > "/tmp/run-$name.log" 2>&1; then echo "PASS  $name"; pass=$((pass+1)); else echo "FAIL  $name  (see /tmp/run-$name.log)"; fail=$((fail+1)); fi; }
run typecheck npx tsc --noEmit
run unit npx vitest run
run build npm run build
run workout node scripts/journey-workout.mjs
run food node scripts/journey-food.mjs
run food2 node scripts/journey-food2.mjs
run train node scripts/journey-train.mjs
run misc node scripts/journey-misc.mjs
run lookup node scripts/journey-lookup.mjs
run robust node scripts/robust.mjs
run interrupt node scripts/interrupt.mjs
echo "passed=$pass failed=$fail"
