import './lib/beta'; // FIRST: in the Aven Beta build it gives the beta its own storage before anything reads it
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/geist/wght.css';
import './styles.css';
import { App } from './App';
import { installDither, installGrain } from './lib/grain';
import { installPress } from './ui/press';
import { installAskHold } from './ui/askHold';
import { noteAndroidApp } from './lib/androidApp';
import { useStore } from './state/store';
import { loadDanish } from './lib/i18n';
import { preloadScreens } from './ui/lazy';
import { loadArchive } from './lib/archive';

performance.mark('aven:main'); // the app's code has loaded and starts (scripts/launch.mjs reads these marks)
installGrain();
installDither();
installPress();
installAskHold();

noteAndroidApp(); // opened from the Android app: remembered at once, before any reload can drop the referrer
const start = () => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>); preloadScreens();
  // the whole conversation (lib/archive.ts) is read once the first screen is up, when the phone is idle
  const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500));
  idle(() => { loadArchive(); });
};
// in Danish the first screen waits for its words (a file of their own, see lib/i18n.ts); in English nothing waits
if (useStore.getState().settings.language === 'da') loadDanish().then(start, start); else start();
