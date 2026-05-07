import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /cornerExitNextEntranceMaxDistance:\s*4\.2,/,
  'guide point policy should cap how far a corner exit can jump to the next-piece entrance'
);

assert.match(
  js,
  /const cornerExitNextEntranceMaxDistance = this\.guidePointPolicy\?\.cornerExitNextEntranceMaxDistance \?\? 4\.2;/,
  'getGuideTargetDistance should read the corner exit-to-next-entrance cap'
);

assert.match(
  js,
  /if \(currentPiece && Math\.abs\(currentPiece\.turnDegrees \|\| 0\) >= 89 && nextPiece\.startD - driveDistance > cornerExitNextEntranceMaxDistance\) \{[\s\S]*?source: 'corner-exit-clamped-guide',[\s\S]*?pieceBoundaryRole: 'corner-exit-clamped',[\s\S]*?\}/,
  'near a 90-degree corner exit, next-piece entrance guide should be clamped instead of jumping far across the next straight'
);

assert.match(
  js,
  /finalApproachAssistFrameSource: d\.finalApproachAssistFrameSource \?\? null,/,
  'forward drive samples should expose final approach frame source'
);

assert.match(
  js,
  /finalApproachAssistForceCount: d\.finalApproachAssistForceCount \|\| 0,/,
  'forward drive samples should expose final approach force count'
);

assert.match(
  js,
  /data\.finalApproachAssistFrameSource = finishFrame\.directFinishVector \? 'direct-finish-vector' : 'track-frame';/,
  'final approach assist should record which frame/vector supplied the force'
);

console.log('corner guide clamp and final assist diagnostics static checks passed');
