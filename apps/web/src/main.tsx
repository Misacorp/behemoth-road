import { render } from 'preact';
import { App } from './App.tsx';
import { setSettings, settingsFromUrl } from './settings.ts';

setSettings(settingsFromUrl(window.location.search));

const root = document.getElementById('app');
if (root) render(<App />, root);
