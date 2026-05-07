#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  source,
  /getGuideTargetDistance\(driveDistance\)\s*\{[\s\S]*const currentPiece = this\.trackPieces\.find\(\(piece\) => driveDistance >= piece\.startD && driveDistance <= piece\.endD\);[\s\S]*source:\s*isChainedTurnPiece \? 'same-piece-chained-turn-lookahead-guide' : 'same-piece-lookahead-guide'[\s\S]*source:\s*currentPiece\.endD >= this\.trackLength \? 'finish-line-guide' : 'current-piece-exit-guide'/s,
  'guide target should use same-piece lookahead first, then current board exit, not skip to the next board after crossing the entrance'
);

assert.match(
  source,
  /const exitRemaining = currentPiece\.endD - driveDistance;[\s\S]*exitRemaining >= minForwardSeparation[\s\S]*distance:\s*clamp\(currentPiece\.endD, 0, this\.trackLength\)/s,
  'current piece exit guide should remain active until the marble is near the exit boundary'
);

assert.match(
  source,
  /pieceBoundaryRole:\s*currentPiece\.endD >= this\.trackLength \? 'finish' : 'exit'[\s\S]*pieceBoundaryRole:\s*'entrance'[\s\S]*pieceBoundaryRole:\s*'finish'/s,
  'debug metadata should distinguish current-piece exit, next-piece entrance, and finish guides'
);

assert.match(
  source,
  /guideTargetPieceIndex:\s*guideTarget\.pieceIndex \?\? null[\s\S]*guideTargetPieceType:\s*guideTarget\.pieceType \|\| null[\s\S]*guideTargetBoundaryRole:\s*guideTarget\.pieceBoundaryRole \|\| null/s,
  'per-marble debug should expose guide target boundary role'
);

console.log('piece exit guide static checks passed');
