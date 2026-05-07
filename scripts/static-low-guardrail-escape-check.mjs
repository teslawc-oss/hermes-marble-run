import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const requiredSnippets = [
  'const wallHeight = 0.92',
  'const wallThickness = 0.58',
  'const wallBaseOffset = -0.02',
  'wallHeight / 2 + wallBaseOffset',
  'physicalRailHeight = wallHeight',
  'physicalRailTopAboveTrack = wallHeight + wallBaseOffset',
  "physicalRailEscapeStyle = 'low-side-lip-allows-jumped-marbles-to-leave-track'",
  "railOptimization = 'lower-fewer-overlapped-side-lip-bodies'",
];

for (const snippet of requiredSnippets) {
  assert.ok(source.includes(snippet), `Missing expected low rail escape snippet: ${snippet}`);
}

const railMethod = source.match(/addPhysicalGuardRails\(points, width\) \{[\s\S]*?\n  \}\n\n  addTrackSegment/)?.[0] || '';
assert.ok(railMethod, 'Could not locate addPhysicalGuardRails method');
assert.doesNotMatch(railMethod, /const wallHeight = 1\.75/, 'Old tall invisible guide wall height should not remain in addPhysicalGuardRails');
assert.doesNotMatch(railMethod, /const wallThickness = 0\.82/, 'Old thick invisible guide wall should not remain in addPhysicalGuardRails');
assert.match(
  railMethod,
  /y: a\.y \+ wallHeight \/ 2 \+ wallBaseOffset[\s\S]*y: b\.y \+ wallHeight \/ 2 \+ wallBaseOffset/,
  'Physical rail bodies should sit as low lips relative to the local track surface.'
);

console.log('low guardrail escape static checks passed');
