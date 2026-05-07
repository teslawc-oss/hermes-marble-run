import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(js, /const LANDING_REBOUND_ABSORBER\s*=\s*{[\s\S]*enabled:\s*true/, 'landing rebound absorber should be enabled');
assert.match(js, /const LANDING_REBOUND_ABSORBER\s*=\s*{[\s\S]*upwardVelocityCap:\s*0\.08/, 'landing absorber should cap upward rebound velocity near zero');
assert.match(js, /ContactMaterial\(this\.marbleMaterial, this\.trackMaterial, \{ friction:\s*0\.24, restitution:\s*0\.02 \}\)/, 'track contact should use near-zero restitution for landings');
assert.match(js, /contact.*otherBody\?\.material === this\.trackMaterial[\s\S]*data\.lastTrackContactTime = this\.elapsed/s, 'marbles should record recent track contact for landing detection');
assert.match(js, /clearance > absorber\.airborneClearance[\s\S]*data\.wasAirborne = true/s, 'absorber should only arm after real airborne clearance');
assert.match(js, /data\.body\.velocity\.y > upwardCap[\s\S]*data\.body\.velocity\.y = upwardCap/s, 'absorber should clamp upward rebound velocity on landing');
assert.match(js, /data\.landingAbsorberNoImpulse = true/, 'landing absorber should document that it removes bounce without adding hidden impulse');
assert.match(js, /this\.applyLandingReboundAbsorber\(data, closest\)/, 'marble drive loop should apply landing absorber each frame');
assert.match(js, /landingReboundAbsorber:\s*this\.landingReboundAbsorber/, 'track debug payload should expose landing rebound absorber config');
assert.match(js, /trackMarbleContact:\s*\{ friction:\s*0\.24, restitution:\s*0\.02 \}/, 'track debug payload should expose track contact restitution');

console.log('landing rebound static checks passed');
