// Builds Aven Beta (the test copy of the app) into ./beta-dist: same code, its own name and icon, and its own storage
// (src/lib/beta.ts). The deploy workflow puts the result at <site>/beta/ next to the real app. Run it by hand to try it:
//   node scripts/build-beta.mjs
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const pub = mkdtempSync(join(tmpdir(), 'aven-beta-public-'));
cpSync('public', pub, { recursive: true });
cpSync('public-beta', pub, { recursive: true }); // the beta's icons replace the real ones
const env = { ...process.env, AVEN_BETA: '1', AVEN_PUBLIC_DIR: pub, AVEN_OUT_DIR: process.env.AVEN_OUT_DIR || 'beta-dist' };
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' }); if (r.status) process.exit(r.status); };
run('npx', ['tsc', '--noEmit']);
run('npx', ['vite', 'build']);
rmSync(pub, { recursive: true, force: true });
console.log(`Aven Beta built into ${env.AVEN_OUT_DIR}`);
