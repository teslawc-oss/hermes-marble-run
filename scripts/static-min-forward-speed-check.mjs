import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const requiredSnippets = [
  'const MIN_FORWARD_SPEED_ASSIST = {',
  'enabled: true',
  'minForwardSpeedRatio: 0.31',
  'correctionBlend: 0.14',
  'maxVelocityDeltaPerFrame: 0.26',
  'lateralDamping: 0.985',
  "label: 'feathered tangent-only minimum forward speed floor; gradual velocity blend, no pulse/random/lateral impulse'",
  'this.minForwardSpeedAssist = MIN_FORWARD_SPEED_ASSIST',
  'this.minForwardSpeedAssistCount = 0',
  'applyMinimumForwardSpeed(data, frame, forwardSpeed, maxSpeed, progress, velocity)',
  'this.applyMinimumForwardSpeed(data, frame, forwardSpeed, maxSpeed, progress, velocity)',
  'minForwardSpeedAssist: this.minForwardSpeedAssist',
  'minForwardSpeedAssistCount: this.minForwardSpeedAssistCount',
  'minimumForwardSpeed: this.speedPreset.maxSpeed * (this.minForwardSpeedAssist?.minForwardSpeedRatio || 0)',
  'minForwardSpeedAssistCount: data.minForwardSpeedAssistCount || 0',
];

for (const snippet of requiredSnippets) {
  assert.ok(source.includes(snippet), `Missing expected minimum forward speed snippet: ${snippet}`);
}

assert.match(
  source,
  /applyMinimumForwardSpeed[\s\S]*horizontalTangent = new THREE\.Vector3\(frame\.tangent\.x, 0, frame\.tangent\.z\)[\s\S]*speedGap \* \(assist\.correctionBlend \?\? 0\.14\)[\s\S]*data\.body\.velocity\.x \+= horizontalTangent\.x \* velocityDelta[\s\S]*data\.body\.velocity\.z \+= horizontalTangent\.z \* velocityDelta/,
  'Minimum speed assist should add velocity only along the horizontal track tangent.'
);

assert.match(
  source,
  /const velocityDelta = Math\.min\(speedGap \* \(assist\.correctionBlend \?\? 0\.14\), assist\.maxVelocityDeltaPerFrame\);/,
  'Minimum speed assist should feather correction by blend instead of snapping the full speed gap.'
);

assert.match(
  source,
  /data\.minForwardSpeedCorrectionBlend = assist\.correctionBlend \?\? 0\.14/,
  'Minimum speed assist should expose correction blend in debug/per-marble metadata.'
);

assert.doesNotMatch(
  source.match(/applyMinimumForwardSpeed[\s\S]*?\n  applySlopeForwardAcceleration/)?.[0] || '',
  /applyImpulse\(/,
  'Minimum speed assist must not use impulses.'
);

assert.match(
  source,
  /this\.applyMinimumForwardSpeed\(data, frame, forwardSpeed, maxSpeed, progress, velocity\);[\s\S]*const postAssistHorizontalSpeed = Math\.hypot[\s\S]*if \(postAssistHorizontalSpeed > maxSpeed\)/,
  'Minimum speed assist should be followed by the hard horizontal top-speed cap.'
);

console.log('minimum forward speed assist static checks passed');
