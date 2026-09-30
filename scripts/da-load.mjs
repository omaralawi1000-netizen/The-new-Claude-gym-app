import { readFileSync } from 'node:fs';
const src = readFileSync('src/lib/da.ts', 'utf8').replace('export const da: Record<string, string> =', 'globalThis.__da =');
new Function(src)();
export const da = globalThis.__da;
