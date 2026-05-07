import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  html,
  /<input id="show-guide-points-toggle" type="checkbox" \/>/,
  'left controls UI should include a checkbox toggle for showing guide points'
);

assert.match(
  js,
  /showGuidePointsToggle: document\.querySelector\('#show-guide-points-toggle'\),/,
  'constructor UI map should bind the guide points toggle'
);

assert.match(
  js,
  /this\.showGuidePoints = Boolean\(this\.ui\.showGuidePointsToggle\?\.checked\);/,
  'toggle handler should update showGuidePoints state from the checkbox'
);

assert.match(
  js,
  /this\.guidePointGroup = new THREE\.Group\(\);/,
  'guide markers should be contained in a Three.js group'
);

assert.match(
  js,
  /buildGuidePointMarkers\(\)/,
  'simulator should build visible markers for all track guide points'
);

assert.match(
  js,
  /guide-point-marker/,
  'guide marker objects should be named for browser/scene inspection'
);

assert.match(
  js,
  /this\.guidePointGroup\.visible = this\.showGuidePoints;/,
  'toggle should show/hide the marker group without regenerating the track'
);

assert.match(
  js,
  /this\.buildGuidePointMarkers\(\);[\s\S]{0,220}this\.guidePointGroup\.visible = this\.showGuidePoints;/,
  'track generation should rebuild markers and preserve the current visibility state'
);

console.log('guide points UI toggle static checks passed');
