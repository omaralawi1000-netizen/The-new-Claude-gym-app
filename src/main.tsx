import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/geist/wght.css';
import './styles.css';
import { App } from './App';
import { installGrain } from './lib/grain';

installGrain();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
