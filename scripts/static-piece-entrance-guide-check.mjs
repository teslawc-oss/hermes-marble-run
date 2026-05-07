#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  source,
  /const GUIDE_POINT_POLICY\s*=\s*\{[\s\S]*targetMode:\s*'same-piece-lookahead-then-piece-exit-then-next-piece-entrance-or-finish'[\s\S]*snapToCurrentPieceExit:\s*true[\s\S]*snapToPieceEntrance:\s*true[\s\S]*clampToTrackCenterline:\s*true/s,
  'guide policy should target same-piece lookahead, current board exit, then next piece entrance or finish, and clamp to the track centerline'
);

assert.match(
  source,
  /getGuideTargetDistance\(driveDistance\)\s*\{[\s\S]*this\.trackPieces\.find\(\(piece\) => piece\.startD > driveDistance[\s\S]*return \{[\s\S]*distance:\s*this\.trackLength[\s\S]*source:\s*'finish-line-guide'/s,
  'guide target distance should snap to the next modular piece start, falling back to finish'
);

assert.match(
  source,
  /resolveDriveGuide\(data, closest\)\s*\{[\s\S]*const guideTarget = this\.getGuideTargetDistance\(driveDistance\);[\s\S]*guideDistance = guideTarget\.distance;[\s\S]*guideFrameSource = guideTarget\.source;[\s\S]*guideFrame = this\.getTrackFrameAt\(guideDistance\)/s,
  'drive guide resolver should use the next-piece/final guide target frame instead of arbitrary scan points'
);

assert.match(
  source,
  /const guideLateralOffset = new THREE\.Vector3\([\s\S]*\.dot\(guideFrame\.right\);[\s\S]*const guideWithinTrackBounds = Math\.abs\(guideLateralOffset\) <= this\.getTrackWidthAt\(guideDistance\) \/ 2/s,
  'guide resolver should prove the chosen guide point is on the track width bounds'
);

assert.match(
  source,
  /guideTargetPieceIndex:\s*guideTarget\.pieceIndex \?\? null[\s\S]*guideTargetPieceType:\s*guideTarget\.pieceType \|\| null[\s\S]*guideTargetBoundaryRole:\s*guideTarget\.pieceBoundaryRole \|\| null[\s\S]*guideWithinTrackBounds/s,
  'per-marble debug should expose guide target piece and track-bound status'
);

assert.match(
  source,
  /guidePointPolicy:\s*this\.guidePointPolicy[\s\S]*guideTargetPolicy:\s*'same-piece-lookahead-then-piece-exit-then-next-piece-entrance-or-finish-centerline'/s,
  'debug payload should expose the guide target policy'
);

assert.doesNotMatch(
  source,
  /findFirstAheadGuideDistance\(position, startDistance[\s\S]*for \(let distance = scanStart; distance <= this\.trackLength; distance \+= scanStep\)/s,
  'old arbitrary forward scan guide should not remain as the primary guide selector'
);

console.log('piece entrance guide static checks passed');
