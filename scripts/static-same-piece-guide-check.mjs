#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  source,
  /const GUIDE_POINT_POLICY\s*=\s*\{[\s\S]*targetMode:\s*'same-piece-lookahead-then-piece-exit-then-next-piece-entrance-or-finish'[\s\S]*samePieceLookAhead:\s*1\.35[\s\S]*cornerSamePieceLookAhead:\s*0\.9[\s\S]*chainedTurnSamePieceLookAhead:\s*0\.72[\s\S]*exitSnapDistance:\s*2\.2/s,
  'guide policy should use short same-piece lookahead before snapping to board exits/entrances'
);

assert.match(
  source,
  /const isChainedTurnPiece = isCornerPiece && \([\s\S]*Math\.abs\(prevPiece\?\.turnDegrees \|\| 0\) > 0 \|\| Math\.abs\(nextPiece\?\.turnDegrees \|\| 0\) > 0[\s\S]*\);[\s\S]*source:\s*isChainedTurnPiece \? 'same-piece-chained-turn-lookahead-guide' : 'same-piece-lookahead-guide'/s,
  'chained corner boards should use a shorter same-piece guide instead of pulling directly to the far exit'
);

assert.match(
  source,
  /if \(exitRemaining > exitSnapDistance && currentPiece\.endD < this\.trackLength\) \{[\s\S]*distance:\s*clamp\(driveDistance \+ Math\.max\(minForwardSeparation, lookAheadDistance\), currentPiece\.startD, currentPiece\.endD\)[\s\S]*pieceBoundaryRole:\s*'inside'/s,
  'inside-board guide should stay within the current board and expose boundary role inside'
);

assert.match(
  source,
  /if \(exitRemaining >= minForwardSeparation \|\| currentPiece\.endD >= this\.trackLength\) \{[\s\S]*source:\s*currentPiece\.endD >= this\.trackLength \? 'finish-line-guide' : 'current-piece-exit-guide'/s,
  'near the board exit, guide should still snap to the current board exit or finish'
);

console.log('same-piece guide static checks passed');
