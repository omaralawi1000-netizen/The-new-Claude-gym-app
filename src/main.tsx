import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/geist/wght.css';
import './styles.css';
import { App } from './App';
import { installGrain } from './lib/grain';

installGrain();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
