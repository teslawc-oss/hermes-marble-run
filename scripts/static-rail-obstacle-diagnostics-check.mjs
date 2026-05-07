import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /trackPieces:\s*this\.trackPieces\.map\(\(piece\) => \([\s\S]*startDistance:[\s\S]*endDistance:/,
  'track debug payload should keep per-piece distance ranges for percent-to-piece diagnosis'
);

assert.match(
  js,
  /getObstacleDebugEntries\(\)\s*\{[\s\S]*this\.pinballObstacles\.map\(\(obstacle, index\) => \{/,
  'track debug payload should expose obstacle registry entries, not only obstacle type counts'
);

assert.match(
  js,
  /obstacles:\s*this\.getObstacleDebugEntries\(\)/,
  'track debug payload should include obstacle debug entries'
);

assert.match(
  js,
  /const progress = this\.findClosestProgress\(obstacle\.center\);[\s\S]*distance:\s*Number\(distance\.toFixed\(2\)\)/,
  'each obstacle debug entry should include nearest centerline distance'
);

assert.match(
  js,
  /const laneOffset = new THREE\.Vector3\(obstacle\.center\.x - frame\.p\.x[\s\S]*\.dot\(frame\.right\);[\s\S]*laneOffset:\s*Number\(laneOffset\.toFixed\(2\)\)/,
  'each obstacle debug entry should expose lateral lane offset from centerline'
);

assert.match(
  js,
  /pieceIndex:\s*piece\?\.index \?\? null[\s\S]*pieceType:\s*piece\?\.type \|\| null/s,
  'each obstacle debug entry should map to the nearest track piece'
);

assert.match(
  js,
  /railDiagnostics:\s*this\.marbleData\.map\(\(d\) => \(/,
  'debug payload should expose per-marble rail diagnostics'
);

assert.match(
  js,
  /lastRailContactPieceIndex:\s*d\.lastRailContactPieceIndex \?\? null[\s\S]*lastRailContactPieceType:\s*d\.lastRailContactPieceType \|\| null/s,
  'rail diagnostics should include last rail contact piece index/type'
);

assert.match(
  js,
  /lastObstacleHitType:\s*d\.lastObstacleHitType \|\| null[\s\S]*lastObstacleHitDistance:\s*d\.lastObstacleHitDistance \?\? null/s,
  'rail diagnostics should include last obstacle hit type/distance'
);

console.log('rail/obstacle diagnostics static checks passed');
