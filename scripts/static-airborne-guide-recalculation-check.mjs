#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  source,
  /const AIRBORNE_GUIDE_POLICY\s*=\s*\{[\s\S]*pauseAssistWhileAirborne:\s*true[\s\S]*recalculateGuideAfterLanding:\s*true[\s\S]*guideMustStayBetweenMarbleAndFinish:\s*true/s,
  'airborne guide policy should pause hidden guide assists in air and require post-landing guide recalculation'
);

assert.match(
  source,
  /resolveDriveGuide\(data, closest\)\s*\{[\s\S]*const guideTarget = this\.getGuideTargetDistance\(driveDistance\);[\s\S]*if \(policy\.guideMustStayBetweenMarbleAndFinish[\s\S]*guidePointAheadDistance[\s\S]*return \{[\s\S]*guideDistance[\s\S]*guideFrame,\s*[\s\S]*centerFrame[\s\S]*slopeFrame/s,
  'drive guide resolver should compute a refreshed guide between marble and finish and return refreshed guide frames'
);

assert.match(
  source,
  /getGuideTargetDistance\(driveDistance\)\s*\{[\s\S]*this\.trackPieces\.find\(\(piece\) => piece\.startD > driveDistance[\s\S]*source:\s*'next-piece-entrance-guide'[\s\S]*source:\s*'finish-line-guide'/s,
  'ahead guide selection should target the next modular piece entrance and fall back to finish'
);

assert.match(
  source,
  /const guide = this\.resolveDriveGuide\(data, closest\);[\s\S]*data\.airborneGuideAssistPaused = guide\.airborneAssistPaused;[\s\S]*if \(guide\.airborneAssistPaused\) \{[\s\S]*data\.guideAssistPausedReason = 'airborne-waiting-for-landing-recalculation';[\s\S]*return;[\s\S]*\}/s,
  'marble drive loop should pause slope/min/mid/final guide assists while airborne'
);

assert.match(
  source,
  /data\.wasAirborne[\s\S]*data\.needsGuideRecalculationAfterLanding = true[\s\S]*data\.lastLandingGuideRecalculationAt = this\.elapsed/s,
  'landing path should mark that the next drive loop must recalculate guide after landing'
);

assert.match(
  source,
  /airborneGuidePolicy:\s*this\.airborneGuidePolicy[\s\S]*guideFrameSource:\s*d\.guideFrameSource \|\| null[\s\S]*guidePointAheadDistance:\s*d\.guidePointAheadDistance \?\? null[\s\S]*airborneGuideAssistPaused:\s*Boolean\(d\.airborneGuideAssistPaused\)/s,
  'debug payload should expose airborne guide policy and per-marble guide status'
);

console.log('airborne guide recalculation static checks passed');
