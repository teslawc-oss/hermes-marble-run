import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const required = [
  "const stableLastDriveDistance = Math.max(data.lastDriveMovementDistance || 0, data.distance || 0);",
  "if (nearestDistance >= stableLastDriveDistance - nonRegressionSlack || nearestDistance >= this.trackLength - finishSlack) {",
  "driveDistance = clamp(Math.max(stableLastDriveDistance, nearestDistance), 0, this.trackLength);",
  "const movedForward = driveDistance - (data.lastDriveMovementDistance ?? driveDistance);",
  "data.lastDriveMovementDistance = Math.max(data.lastDriveMovementDistance || 0, driveDistance);",
  "guideDistanceJump: (d.guideDistance ?? 0) - (d.driveDistance ?? 0),",
  "const shouldSnapToNextEntrance = Boolean(",
  "source: 'next-piece-entrance-guide',",
  "finishFallbackOnlyAfterProgress: 0.92,",
  "const finishFallbackAllowed = driveDistance >= this.trackLength * (policy.finishFallbackOnlyAfterProgress ?? 0.92);",
];

const missing = required.filter((snippet) => !source.includes(snippet));
if (missing.length) {
  console.error('Missing expected guide anti-regression snippets:');
  for (const snippet of missing) console.error(`- ${snippet}`);
  process.exit(1);
}

const forbidden = [
  "const nonRegressingDistance = Math.max(nearestDistance, data.distance || 0, data.lastDriveMovementDistance || 0);\n    let driveDistance = clamp(nonRegressingDistance, 0, this.trackLength);",
  "const movedForward = closest.distance - (data.lastDriveMovementDistance ?? closest.distance);",
  "data.lastDriveMovementDistance = Math.max(data.lastDriveMovementDistance || 0, closest.distance);",
];

const present = forbidden.filter((snippet) => source.includes(snippet));
if (present.length) {
  console.error('Found old nearest-sample based movement snippets:');
  for (const snippet of present) console.error(`- ${snippet}`);
  process.exit(1);
}

console.log('guide anti-regression static checks passed');
