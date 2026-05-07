import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(source, /this\.world\.allowSleep\s*=\s*false/, 'Cannon world sleep must be disabled');
assert.match(source, /body\.allowSleep\s*=\s*false/, 'Marble bodies must have sleep disabled');
assert.match(source, /body\.sleepState\s*=\s*CANNON\.Body\.AWAKE/, 'Marble bodies should be forced awake when created');
assert.match(source, /Tangent-forward drive/, 'Main race drive should be documented as tangent-forward');
assert.match(source, /frame\.tangent\.clone\(\)\.multiplyScalar\(accelForce\)/, 'Main drive force must be along track tangent');
assert.match(source, /forwardDrive:\s*'continuous tangent-forward top-speed drive plus tangent-only mid-track sustain'/, 'Debug output must expose tangent-forward drive mode');
assert.match(source, /racerSleepDisabled:\s*true/, 'Debug output must expose racer sleep-disabled flag');

console.log('sleep + tangent-forward drive static checks passed');
