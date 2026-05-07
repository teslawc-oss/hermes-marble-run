import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(source, /finishDirectionAssist\s*=\s*\{[^}]*enabled:\s*true/s, 'Finish-direction assist should be enabled');
assert.match(source, /const driveDistance = Math\.max\(closest\.distance, data\.distance \|\| 0\)/, 'Drive frame should use non-regressing max progress, not only nearest sample');
assert.match(source, /const rawForwardSpeed = velocity\.dot\(frame\.tangent\)/, 'Drive should preserve signed forward speed to detect backwards motion');
assert.match(source, /if \(rawForwardSpeed < 0\)[^]*finishDirectionAssist\.backwardDamping/s, 'Backwards velocity should be damped and corrected toward finish');
assert.match(source, /const lateralSpeed = velocity\.dot\(frame\.right\)/, 'Drive should measure lateral speed');
assert.match(source, /finishDirectionAssist\.lateralDamping/s, 'Lateral drift should be damped so racers face the finish route again');
assert.match(source, /applyFinishDirectedImpulse\(data, rawImpulse, frame/s, 'Obstacle impulses should be guarded through finish-directed impulse helper');
assert.match(source, /finishDirectionAssist:\s*this\.finishDirectionAssist/, 'Debug output should expose finish-direction assist settings');
assert.match(source, /finishDirectionCorrectionCount:/, 'Debug output should expose correction count');

console.log('finish-direction static checks passed');
