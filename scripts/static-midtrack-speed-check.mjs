import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const requiredSnippets = [
  'const MID_TRACK_SPEED_ASSIST = {',
  'startsAfterProgress: 0.12',
  'endsBeforeProgress: 0.995',
  'minForwardSpeedRatio: 0.52',
  'label: \'tangent-only sustained mid-to-late race speed assist\'',
  'this.world.allowSleep = false',
  'applyMidTrackSpeedAssist(data, frame, forwardSpeed, maxSpeed)',
  'this.applyMidTrackSpeedAssist(data, frame, forwardSpeed, maxSpeed)',
  'midTrackSpeedAssist: this.midTrackSpeedAssist',
  'midTrackSpeedAssistCount: this.midTrackSpeedAssistCount',
  'midTrackSpeedAssistPerMarble',
  "forwardDrive: 'slope-only acceleration assist plus tangent-only mid-track sustain'",
];

for (const snippet of requiredSnippets) {
  assert.ok(source.includes(snippet), `Missing expected mid/late-track speed assist snippet: ${snippet}`);
}

assert.match(
  source,
  /applyMidTrackSpeedAssist[\s\S]*frame\.tangent\.clone\(\)\.multiplyScalar[\s\S]*applyForce[\s\S]*applyImpulse/,
  'Mid/late-track assist should use tangent-only force plus a small cooldown-gated impulse.'
);

assert.match(
  source,
  /const horizontalSpeed = Math\.hypot[\s\S]*if \(horizontalSpeed > maxSpeed\)[\s\S]*this\.applyMidTrackSpeedAssist/,
  'Mid/late-track assist should run after max-speed cap calculation to avoid extra sideways/uncapped behavior.'
);

const lateAssistMatch = source.match(/endsBeforeProgress:\s*([0-9.]+)/);
assert.ok(lateAssistMatch, 'Missing endsBeforeProgress value');
assert.ok(Number(lateAssistMatch[1]) >= 0.99, 'Assist should keep working into the late track before the finish collector.');

console.log('mid/late-track speed assist static checks passed');
