import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const required = [
  "cornerSamePieceLookAhead: 0.55,",
  "chainedTurnSamePieceLookAhead: 0.45,",
  "exitSnapDistance: 1.25,",
  "guideReachedAheadDistance: 0.12,",
  "guideUnreachedAheadDistance: 0.95,",
  "guideStallSkipDistance: 1.15,",
  "disableBonusOnTurnPieces: true,",
  "turnPieceMaxSpeedRatio: 0.7,",
  "getCatchupSpeedLimit(data, baseMaxSpeed, leaderDistance, guide = null)",
  "const isTurnGuide = /corner/.test(guide?.guideTargetPieceType || '');",
  "const maxSpeed = this.getCatchupSpeedLimit(data, baseMaxSpeed, leaderDistance, guide);",
];

const missing = required.filter((snippet) => !source.includes(snippet));
if (missing.length) {
  console.error('Missing expected corner guide/speed snippets:');
  for (const snippet of missing) console.error(`- ${snippet}`);
  process.exit(1);
}

const forbidden = [
  "cornerSamePieceLookAhead: 0.9,",
  "chainedTurnSamePieceLookAhead: 0.72,",
  "exitSnapDistance: 2.2,",
  "guideStallSkipDistance: 2.35,",
  "const maxSpeed = this.getCatchupSpeedLimit(data, baseMaxSpeed, leaderDistance);",
];

const present = forbidden.filter((snippet) => source.includes(snippet));
if (present.length) {
  console.error('Found old corner guide/speed snippets:');
  for (const snippet of present) console.error(`- ${snippet}`);
  process.exit(1);
}

console.log('corner guide speed static checks passed');
