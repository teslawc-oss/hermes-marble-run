#!/usr/bin/env node
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const checks = [
  ['slope drive backward damping is disabled/no-op', /const SLOPE_DRIVE = \{[\s\S]*backwardDamping:\s*1[\s\S]*dampingDisabledReason:\s*'user requested disabling backward damping and all lateral damping/],
  ['slope drive lateral damping is disabled/no-op', /const SLOPE_DRIVE = \{[\s\S]*lateralDamping:\s*1[\s\S]*不再用 backward\/lateral damping/],
  ['minimum forward speed lateral damping is disabled/no-op', /const MIN_FORWARD_SPEED_ASSIST = \{[\s\S]*lateralDamping:\s*1[\s\S]*minimum speed floor remains tangent-only[\s\S]*no lateral damping/],
  ['rail guide remains disabled with no-op damping', /const DIRECTION_STABILITY_ASSIST = \{[\s\S]*enabled:\s*false[\s\S]*lateralDamping:\s*1[\s\S]*backwardDamping:\s*1[\s\S]*tangentRecoveryForceScale:\s*0/],
  ['finish direction assist remains disabled with no-op damping', /this\.finishDirectionAssist = \{[\s\S]*enabled:\s*false[\s\S]*backwardDamping:\s*1[\s\S]*lateralDamping:\s*1[\s\S]*correctionForceScale:\s*0/],
  ['debug exposes all backward/lateral damping disabled policy', /forwardDrive:\s*\{[\s\S]*backwardDamping:\s*this\.slopeDrive\?\.backwardDamping[\s\S]*lateralDamping:\s*this\.slopeDrive\?\.lateralDamping[\s\S]*allBackwardAndLateralDampingDisabled:\s*true/],
];

for (const [name, pattern] of checks) {
  if (!pattern.test(source)) {
    console.error(`backward/lateral damping disabled check failed: ${name}`);
    process.exit(1);
  }
}

const activeBadDamping = source.split('\n')
  .map((line, index) => ({ line: line.trim(), number: index + 1 }))
  .filter(({ line }) => /^(backwardDamping|lateralDamping):/.test(line))
  .filter(({ line }) => !/^backwardDamping:\s*1\b/.test(line) && !/^lateralDamping:\s*1\b/.test(line))
  .filter(({ line }) => !line.includes('this.slopeDrive?.backwardDamping') && !line.includes('this.slopeDrive?.lateralDamping'));
if (activeBadDamping.length) {
  console.error('backward/lateral damping must stay at no-op value 1:');
  for (const match of activeBadDamping) console.error(`${match.number}: ${match.line}`);
  process.exit(1);
}

console.log('backward/lateral damping disabled static checks passed');
