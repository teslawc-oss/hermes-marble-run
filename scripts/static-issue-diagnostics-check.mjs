import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /buildIssueDiagnostics\(payload\s*=\s*window\.__MARBLE_RACE_DEBUG__\)\s*\{/,
  'debug copy should build a dedicated per-marble issue diagnostics summary'
);

assert.match(
  js,
  /issueDiagnostics:\s*this\.buildIssueDiagnostics\(payload\)/,
  'full debug copy payload should include issueDiagnostics'
);

assert.match(
  js,
  /railVsObstacleDistanceGap:\s*Number\(railObstacleGap\.toFixed\(2\)\)/s,
  'issue diagnostics should expose rail-vs-obstacle distance gap per marble'
);

assert.match(
  js,
  /suspectedCause,\n\s*\}/s,
  'issue diagnostics should expose a suspected cause per marble'
);

assert.match(
  js,
  /isGuidePossiblyBehind,\n\s*resetReason:/s,
  'issue diagnostics should explicitly flag whether guide target may be behind'
);

assert.match(
  js,
  /hasBackwardRawSpeed,\n\s*guideFrameSource:/s,
  'issue diagnostics should explicitly flag backward raw speed'
);

assert.match(
  js,
  /issueWindowHit,\n\s*rawForwardSpeed:/s,
  'issue diagnostics should flag whether the latest obstacle hit is inside the issue window'
);

assert.match(
  js,
  /lastObstacleToRailGapMeters:\s*Number\(railObstacleGap\.toFixed\(2\)\)/s,
  'issue diagnostics should compute lastObstacleToRailGapMeters as a rounded meter gap'
);

assert.match(
  js,
  /guideTargetDeltaPieces,\n\s*guidePointAheadDistance:/s,
  'issue diagnostics should expose guide target piece delta from current rail/contact piece'
);

assert.match(
  js,
  /rawForwardSpeed:\s*drive\?\.rawForwardSpeed \?\? null/s,
  'issue diagnostics should correlate rawForwardSpeed from forward drive samples'
);

assert.match(
  js,
  /resetReason:\s*reset\?\.lastReason \|\| null/s,
  'issue diagnostics should correlate stuck reset reason'
);

assert.match(
  js,
  /if \(hasBackwardRawSpeed\) return 'backward-raw-speed-after-obstacle-or-rail-contact';/,
  'issue cause classifier should identify backward raw speed after collisions'
);

console.log('issue diagnostics static checks passed');
