import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(js, /const DIRECTION_STABILITY_ASSIST\s*=\s*{[\s\S]*enabled:\s*false/, 'direction stability / center guide should be disabled');
assert.match(js, /const DIRECTION_STABILITY_ASSIST\s*=\s*{[\s\S]*centerCorrectionForceScale:\s*0/, 'center correction force should be zero');
assert.match(js, /const DIRECTION_STABILITY_ASSIST\s*=\s*{[\s\S]*lateralDamping:\s*1/, 'rail guide should not damp lateral motion');
assert.match(js, /const DIRECTION_STABILITY_ASSIST\s*=\s*{[\s\S]*tangentRecoveryForceScale:\s*0/, 'rail guide should not add tangent recovery force');
assert.match(js, /railGuidePolicy\s*=\s*{[\s\S]*allRailHitCenterGuidesDisabled:\s*true/, 'debug policy should state all rail-hit center guides are disabled');
assert.match(js, /railGuidePolicy\s*=\s*{[\s\S]*passiveRailCollisionRemains:\s*true/, 'debug policy should state passive rail collision remains');
assert.match(js, /disabledAssists:\s*\[[^\]]*'directionStabilityAssist'[^\]]*'railEscapeAssist'[^\]]*'railMomentumAssist'[^\]]*\]/s, 'debug policy should list disabled rail guide assists');
assert.match(js, /railMomentumAssist\s*=\s*\{ enabled:\s*false[\s\S]*impulse:\s*0[\s\S]*lateralDamping:\s*1/, 'rail momentum assist should remain disabled with no impulse/damping');
assert.match(js, /this\.railEscapeAssist\s*=\s*{[\s\S]*enabled:\s*false[\s\S]*inwardForceScale:\s*0[\s\S]*tangentAssistRatio:\s*0/s, 'rail escape assist should remain disabled with no inward/tangent guide force');
assert.match(js, /railGuidePolicy:\s*this\.railGuidePolicy/, 'track debug payload should expose rail guide policy');
assert.match(js, /railMomentumAssist:\s*this\.railMomentumAssist/, 'track debug payload should expose rail momentum assist state');
assert.match(js, /railEscapeAssist:\s*this\.railEscapeAssist/, 'track debug payload should expose rail escape assist state');

console.log('rail guide disabled static checks passed');
