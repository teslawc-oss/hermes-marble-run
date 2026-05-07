import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /const NEGATIVE_FORWARD_SPEED_RECOVERY\s*=\s*\{/,
  'negative raw speed recovery config should exist'
);

assert.match(
  js,
  /model:\s*'force-only-tangent-recovery-when-current-speed-is-backward'/,
  'recovery model should be force-only tangent recovery, not impulse/damping'
);

assert.match(
  js,
  /applyNegativeForwardSpeedRecovery\(data, centerFrame, centerRawForwardSpeed, maxSpeed, progress, velocity\)\s*\{/,
  'negative forward speed recovery method should exist'
);

assert.match(
  js,
  /if \(centerRawForwardSpeed >= -\(recovery\.triggerBackwardSpeed \?\? 0\.25\)\) return;/,
  'recovery should trigger only for true backward raw speed'
);

assert.match(
  js,
  /const recoveryForce = centerFrame\.tangent\.clone\(\)\.multiplyScalar\(forceStrength\);/,
  'recovery should push along the current center frame tangent only'
);

assert.match(
  js,
  /data\.body\.applyForce\(new CANNON\.Vec3\(recoveryForce\.x, recoveryForce\.y, recoveryForce\.z\), data\.body\.position\)/,
  'recovery should be force-only via applyForce'
);

const methodStart = js.indexOf('  applyNegativeForwardSpeedRecovery(');
assert.notEqual(methodStart, -1, 'negative forward speed recovery method should exist');
const methodEnd = js.indexOf('\n  applyMinimumForwardSpeed(', methodStart);
assert.notEqual(methodEnd, -1, 'negative recovery method should appear before minimum speed method');
const recoveryMethod = js.slice(methodStart, methodEnd);
assert.doesNotMatch(
  recoveryMethod,
  /applyImpulse/,
  'negative speed recovery must not use impulses'
);

assert.match(
  js,
  /this\.applyNegativeForwardSpeedRecovery\(data, centerFrame, centerRawForwardSpeed, maxSpeed, progress, velocity\);[\s\S]*this\.applyMinimumForwardSpeed/s,
  'recovery should run before minimum speed floor so it handles backward motion first'
);

assert.match(
  js,
  /negativeForwardSpeedRecovery:\s*this\.negativeForwardSpeedRecovery/,
  'debug payload should expose negative forward speed recovery config'
);

assert.match(
  js,
  /negativeForwardSpeedRecoveryCount:\s*d\.negativeForwardSpeedRecoveryCount \|\| 0/,
  'per-marble forward drive samples should expose recovery counts'
);

assert.match(
  js,
  /backwardRecoveryForce:\s*d\.backwardRecoveryForce \|\| null/,
  'per-marble forward drive samples should expose recovery force'
);

console.log('negative forward speed recovery static checks passed');
