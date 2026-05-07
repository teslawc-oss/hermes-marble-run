import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /const MIN_FORWARD_SPEED_ASSIST = \{\s*enabled: false,/,
  'minimum forward speed assist should be disabled by request'
);

assert.match(
  js,
  /const MID_TRACK_SPEED_ASSIST = \{\s*enabled: false,/,
  'mid-track speed assist should be disabled by request'
);

assert.match(
  js,
  /slopeDriveUsesGuideTargetFrame:\s*true,/,
  'slope drive policy should declare that it uses next guide target / finish frame'
);

assert.match(
  js,
  /const slopeFrame = guideFrame;/,
  'resolveDriveGuide should use the resolved guide frame as the slope drive frame'
);

assert.match(
  js,
  /const slopeFrameSource = `guide-target-frame:\$\{guideFrameSource\}`;/,
  'slope frame source should identify which guide source drives slope force'
);

assert.match(
  js,
  /data\.slopeDriveGuideDistance = guide\.guideDistance;/,
  'per-marble diagnostics should expose the guide distance used by slope drive'
);

assert.match(
  js,
  /slopeDriveGuideDistance: d\.slopeDriveGuideDistance \?\? null,/,
  'debug copy payload should include slope-drive guide distance'
);

console.log('slope drive guide target and speed assist disable static checks passed');
