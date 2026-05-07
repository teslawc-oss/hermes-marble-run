import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(js, /const RIGHT_ANGLE_CORNER_SLOPE\s*=\s*{[\s\S]*extraDropPerMeter:\s*0\.12/, 'right-angle corner slope config should add stronger extra downhill pitch');
assert.match(js, /const RIGHT_ANGLE_CORNER_SLOPE\s*=\s*{[\s\S]*consecutiveExtraDropPerMeter:\s*0\.08/, 'consecutive 90-degree corners should receive stronger extra downhill pitch');
assert.match(js, /const RIGHT_ANGLE_CORNER_SLOPE\s*=\s*{[\s\S]*transitionExtraDropPerMeter:\s*0\.045/, '90-degree corner transition panels should receive stronger extra downhill pitch');
assert.match(js, /Math\.abs\(piece\.turnDegrees\) === 90[\s\S]*rightAngleExtraDrop/, '90-degree pieces should compute extra corner drop');
assert.match(js, /segmentDropPerMeter[\s\S]*rightAngleExtraDrop \+ transitionExtraDrop/, 'segment drop should include right-angle and transition slope boosts');
assert.match(js, /rightAngleCornerSlope:\s*{[\s\S]*affectedPanelCount/, 'track slope/debug should expose right-angle corner slope metadata');
assert.match(js, /visibleCornerStyle:\s*'90-degree right-angle corners with boosted downhill pitch'/, 'browser debug should expose boosted 90-degree corner style');
assert.match(js, /everyPanelDownhill:\s*pathPoints\.every/, 'track slope should still assert every generated panel is downhill');

console.log('right-angle corner slope static checks passed');
