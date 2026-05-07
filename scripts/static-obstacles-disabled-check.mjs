import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /const OBSTACLE_PRESETS = \[\s*\{ label: 'None', multiplier: 0 \},\s*\{ label: 'Standard \(disabled\)', multiplier: 0, disabledReason: 'temporarily remove all obstacles by request' \},\s*\{ label: 'Many \(disabled\)', multiplier: 0, disabledReason: 'temporarily remove all obstacles by request' \},\s*\{ label: 'Extreme \(disabled\)', multiplier: 0, disabledReason: 'temporarily remove all obstacles by request' \},\s*\];/,
  'all obstacle presets should generate zero obstacles while keeping UI choices stable'
);

assert.match(
  js,
  /this\.obstacleIndex = 0;/,
  'default obstacle preset should be None'
);

assert.match(
  js,
  /const obstacleCount = 0;/,
  'track generation should force zero obstacles'
);

assert.match(
  js,
  /this\.createObstacles\(obstacleCount\);/,
  'createObstacles should still be called with zero for stable setup path'
);

console.log('temporary obstacle removal static checks passed');
