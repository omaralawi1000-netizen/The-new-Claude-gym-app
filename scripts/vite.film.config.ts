// A dev server only for filming the labs (port 5174): no live reload and no file watching, so editing a file while a film
// renders can never reload the page mid-film (it did, 26 Oct). Run: npx vite --config scripts/vite.film.config.ts
import { mergeConfig } from 'vite';
import base from '../vite.config';
export default mergeConfig(base, { server: { port: 5174, host: '127.0.0.1', hmr: false, watch: null } });
