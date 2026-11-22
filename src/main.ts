import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './ui/styles.css';
import { Application } from 'pixi.js';
import { Input } from './core/input';
import { Save } from './core/save';
import { Game } from './core/game';
import testTrack from './levels/test-track.json';
import type { TrackData } from './levels/types';

async function boot(): Promise<void> {
  Save.load();
  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    background: 0x1b1d1f,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: 'webgl',
  });
  document.getElementById('stage')!.appendChild(app.canvas);
  Input.attach(window);
  const game = new Game(app, testTrack as TrackData, document.getElementById('hud')!);
  if (import.meta.env.DEV) Object.assign(window, { game, __app: app });

  // Offline: cache the game after the first visit (production builds only).
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}

boot();
