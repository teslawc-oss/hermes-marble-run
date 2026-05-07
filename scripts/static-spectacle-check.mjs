import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const requiredJs = [
  'pushBroadcastEvent',
  'updateBroadcastDirector',
  'createMarbleTrail',
  'updateMarbleTrails',
  'spawnImpactEffect',
  'updateSpectacleEffects',
  'spawnFinishConfetti',
  'showFinalShowcase',
  'createBroadcastStageMarkers',
  'spectacleFeatures',
  'broadcastEvents',
  'marbleTrailCount',
  'winnerShowcase',
  'broadcastStageMarkers',
];

for (const snippet of requiredJs) {
  assert(js.includes(snippet), `Missing spectacle JS snippet: ${snippet}`);
}

const requiredHtml = [
  'broadcast-caption',
  'caption-title',
  'caption-detail',
  'final-showcase',
];
for (const snippet of requiredHtml) {
  assert(html.includes(snippet), `Missing spectacle HTML snippet: ${snippet}`);
}

const requiredCss = [
  '.broadcast-caption',
  '.final-showcase',
  '@keyframes caption-pop',
];
for (const snippet of requiredCss) {
  assert(css.includes(snippet), `Missing spectacle CSS snippet: ${snippet}`);
}

assert(js.includes("'broadcast-event-captions'") && js.includes("'marble-speed-trails'") && js.includes("'finish-confetti'"), 'Debug spectacle feature list incomplete');

console.log('Static spectacle feature check passed');
