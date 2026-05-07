import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /isAssistFrameBehindMarble\(data, frame, tolerance = 0\.08\)\s*{/,
  'should provide a shared guard for assist frames that have already been passed by the marble'
);

assert.match(
  js,
  /const aheadDistance = new THREE\.Vector3\([\s\S]*?frame\.p\.x - data\.body\.position\.x[\s\S]*?\)\.dot\(frame\.tangent\);[\s\S]*?return aheadDistance < -tolerance;/,
  'passed-frame guard should compare frame point against marble along that frame tangent'
);

assert.match(
  js,
  /if \(this\.isAssistFrameBehindMarble\(data, frame\)\) \{[\s\S]*?data\.slopeDriveSkippedReason = 'assist-frame-behind-marble';[\s\S]*?return;[\s\S]*?\}/,
  'slope force must be skipped when its target frame has already passed the marble'
);

assert.match(
  js,
  /if \(this\.isAssistFrameBehindMarble\(data, frame\)\) \{[\s\S]*?data\.minForwardSpeedSkippedReason = 'assist-frame-behind-marble';[\s\S]*?return;[\s\S]*?\}/,
  'minimum forward speed velocity blend must be skipped when its frame has already passed the marble'
);

assert.match(
  js,
  /if \(this\.isAssistFrameBehindMarble\(data, frame\)\) \{[\s\S]*?data\.midTrackSpeedAssistSkippedReason = 'assist-frame-behind-marble';[\s\S]*?return;[\s\S]*?\}/,
  'mid-track assist must be skipped when its frame has already passed the marble'
);

assert.match(
  js,
  /if \(this\.isAssistFrameBehindMarble\(data, finishFrame\)\) \{[\s\S]*?data\.finalApproachAssistSkippedReason = 'assist-frame-behind-marble';[\s\S]*?return;[\s\S]*?\}/,
  'final approach assist must be skipped when its frame has already passed the marble'
);

assert.match(
  js,
  /const airborneAssistPaused = Boolean\(policy\.pauseAssistWhileAirborne && clearance > \(policy\.airborneClearance \?\? 0\.92\)\);/,
  'airborne assists should pause solely on clear airborne clearance, not be unpaused by recent/stale track contact'
);

assert.doesNotMatch(
  js,
  /airborneAssistPaused = Boolean\([^;]*!recentTrackContactWhileClearlyAirborne/s,
  'recent track contact while clearly airborne must not bypass airborne pause'
);

console.log('no backward assist after passed point static checks passed');
