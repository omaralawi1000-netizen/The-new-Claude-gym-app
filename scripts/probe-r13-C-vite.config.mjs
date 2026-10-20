// r13 jank audit: the real app config, plus source maps and kept function names (so traces and React commits name
// real components and src lines). Same minified production code otherwise. usage:
// AVEN_OUT_DIR=/tmp/claude-0/recC/dist npx vite build --config scripts/probe-r13-C-vite.config.mjs
import base from '../vite.config.ts';
export default { ...base, root: new URL('..', import.meta.url).pathname, esbuild: { ...(base.esbuild || {}), keepNames: true }, build: { ...(base.build || {}), sourcemap: true } };
