import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /const recentTrackContact = this\.elapsed - \(data\.lastTrackContactTime \?\? -Infinity\) <= \(this\.landingReboundAbsorber\?\.contactGraceSeconds \?\? 0\.18\);\n\s*const airborneAssistPaused = Boolean\(policy\.pauseAssistWhileAirborne && clearance > \(policy\.airborneClearance \?\? 0\.92\)\);/,
  'airborne guide pause should not be bypassed by stale/recent track contacts when clearance is clearly airborne'
);

assert.match(
  js,
  /guideRecentlyTouchedTrack:\s*recentTrackContact,/,
  'drive guide diagnostics should expose recent track contact state'
);

assert.match(
  js,
  /guideRecentTrackContactWhileClearlyAirborne:\s*Boolean\(recentTrackContact && clearance > \(policy\.airborneClearance \?\? 0\.92\)\),/,
  'drive guide diagnostics should expose stale contact suppression state'
);

assert.match(
  js,
  /guideRecentlyTouchedTrack:\s*d\.guideRecentlyTouchedTrack \?\? null,/,
  'forward drive samples should include recent track contact diagnostic'
);

assert.match(
  js,
  /guideRecentTrackContactWhileClearlyAirborne:\s*d\.guideRecentTrackContactWhileClearlyAirborne \?\? null,/,
  'forward drive samples should include stale contact suppression diagnostic'
);

console.log('airborne guide stale contact static checks passed');
