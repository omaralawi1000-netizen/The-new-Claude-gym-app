/// <reference types="vite/client" />

declare module 'zxing-wasm/reader/zxing_reader.wasm?url' { const url: string; export default url; }

/** package.json's version, baked in at build time (vite.config.ts) */
declare const __APP_VERSION__: string;
