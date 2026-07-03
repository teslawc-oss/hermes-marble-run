import { TOY_PARK_TRACK_TILE_LIBRARY } from './config.js';

const degreesToRadians = (degrees) => degrees * (Math.PI / 180);

// The Toy Park start board is deeper than the road tiles: d=0 is the start-board
// exit where the first road tile begins, while the user-facing board entrance is
// farther back on the start board. The loop prototype must close to that entrance,
// not to the d=0 exit edge.
export const TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT = 25.125;

const TOY_PARK_RANDOM_LOOP = {
  label: 'random-left-right-45-and-90-degree-closed-loop',
  bendAngles: [45, 90],
  bendCount: 12,
  ninetyDegreeBendCount: 4,
  fortyFiveDegreeBendCount: 8,
  oppositeFortyFiveTurnCount: 4,
  minStraightLength: 4.8,
  maxStraightLength: 26,
  preferredMinStraightLength: 6,
  preferredMaxStraightLength: 18,
  bendMinLength: 3.7,
  bendMaxLength: 5.4,
  closureTolerance: 1.25,
  maxAttempts: 160,
};

const cloneTilePiece = (tile, overrides = {}) => ({
  type: overrides.type || tile.type || tile.role || 'straight',
  length: overrides.length ?? tile.length,
  turnDegrees: overrides.turnDegrees ?? tile.turnDegrees ?? tile.defaultTurnDegrees ?? 0,
  tileKey: tile.key,
  angleRadians: degreesToRadians(overrides.turnDegrees ?? tile.turnDegrees ?? tile.defaultTurnDegrees ?? 0),
  variableAngleDegrees: overrides.variableAngleDegrees ?? null,
  loopPrototype: Boolean(overrides.loopPrototype),
  loopPrototypeIndex: overrides.loopPrototypeIndex ?? null,
  loopSegmentRole: overrides.loopSegmentRole ?? null,
  randomLoop: Boolean(overrides.randomLoop),
  randomLoopGenerator: overrides.randomLoopGenerator ?? null,
  randomLoopAttempt: overrides.randomLoopAttempt ?? null,
  randomLoopTurnIndex: overrides.randomLoopTurnIndex ?? null,
  randomLoopStraightIndex: overrides.randomLoopStraightIndex ?? null,
  turnDirection: overrides.turnDirection ?? null,
  closureSolved: Boolean(overrides.closureSolved),
});

const seededFallbackRng = (() => {
  let state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
})();

const randomBetween = (rng, min, max) => min + rng() * (max - min);

const shuffleInPlace = (items, rng) => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
};

const turnAnglesForAttempt = (rng, clockwiseSign) => {
  const sameDirectionNinety = Array.from(
    { length: TOY_PARK_RANDOM_LOOP.ninetyDegreeBendCount },
    () => clockwiseSign * 90
  );
  const sameDirectionFortyFive = Array.from(
    { length: TOY_PARK_RANDOM_LOOP.fortyFiveDegreeBendCount - TOY_PARK_RANDOM_LOOP.oppositeFortyFiveTurnCount },
    () => clockwiseSign * 45
  );
  const oppositeFortyFive = Array.from(
    { length: TOY_PARK_RANDOM_LOOP.oppositeFortyFiveTurnCount },
    () => -clockwiseSign * 45
  );
  return shuffleInPlace([
    ...sameDirectionNinety,
    ...sameDirectionFortyFive,
    ...oppositeFortyFive,
  ], rng);
};

const getStraightDirections = (turns, initialHeading = -Math.PI / 2) => {
  const headings = [];
  let heading = initialHeading;
  turns.forEach((turnDegrees) => {
    headings.push(heading);
    heading += degreesToRadians(turnDegrees);
  });
  headings.push(heading);
  return headings.map((angle) => ({ x: Math.cos(angle), z: Math.sin(angle), angle }));
};

const simulatePiecesPlanar = (pieces, step = 0.8, initialHeading = -Math.PI / 2) => {
  let x = 0;
  let z = 0;
  let heading = initialHeading;
  pieces.forEach((piece) => {
    const startHeading = heading;
    const steps = Math.max(2, Math.ceil(piece.length / step));
    let previousD = 0;
    for (let i = 1; i <= steps; i += 1) {
      const localT = i / steps;
      const d = piece.length * localT;
      const deltaD = d - previousD;
      const turnT = piece.turnDegrees === 0 ? 0 : (localT < 0.5 ? 2 * localT * localT : 1 - ((-2 * localT + 2) ** 2) / 2);
      heading = startHeading + degreesToRadians(piece.turnDegrees) * turnT;
      x += Math.cos(heading) * deltaD;
      z += Math.sin(heading) * deltaD;
      previousD = d;
    }
    heading = startHeading + degreesToRadians(piece.turnDegrees);
  });
  return { x, z, heading };
};

const buildPiecesFromLengthsAndTurns = ({ straightLengths, bendLengths, turns, attempt, generator }) => {
  const straightTile = TOY_PARK_TRACK_TILE_LIBRARY.straight;
  const variableBendTile = TOY_PARK_TRACK_TILE_LIBRARY.variableBend;
  const pieces = [];
  turns.forEach((turnDegrees, index) => {
    pieces.push(cloneTilePiece(straightTile, {
      type: 'straight',
      length: straightLengths[index],
      turnDegrees: 0,
      loopPrototype: true,
      loopPrototypeIndex: index,
      loopSegmentRole: index === 0 ? 'random-loop-opening-straight' : 'random-loop-straight',
      randomLoop: true,
      randomLoopGenerator: generator,
      randomLoopAttempt: attempt,
      randomLoopStraightIndex: index,
      closureSolved: true,
    }));
    pieces.push(cloneTilePiece(variableBendTile, {
      type: 'variable-bend',
      length: bendLengths[index],
      turnDegrees,
      variableAngleDegrees: Math.abs(turnDegrees),
      loopPrototype: true,
      loopPrototypeIndex: index,
      loopSegmentRole: `random-loop-${turnDegrees < 0 ? 'left' : 'right'}-${Math.abs(turnDegrees)}-degree-bend`,
      randomLoop: true,
      randomLoopGenerator: generator,
      randomLoopAttempt: attempt,
      randomLoopTurnIndex: index,
      turnDirection: turnDegrees < 0 ? 'left' : 'right',
      closureSolved: true,
    }));
  });
  pieces.push(cloneTilePiece(straightTile, {
    type: 'straight',
    length: straightLengths[straightLengths.length - 1],
    turnDegrees: 0,
    loopPrototype: true,
    loopPrototypeIndex: turns.length,
    loopSegmentRole: 'finish-board-square-entry-straight-connector-random-loop-closure',
    randomLoop: true,
    randomLoopGenerator: generator,
    randomLoopAttempt: attempt,
    randomLoopStraightIndex: straightLengths.length - 1,
    closureSolved: true,
  }));
  return pieces;
};

const solveRandomClosedLoopPieces = (rng) => {
  const target = { x: 0, z: TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT };
  const clockwiseSign = rng() < 0.5 ? 1 : -1;
  for (let attempt = 1; attempt <= TOY_PARK_RANDOM_LOOP.maxAttempts; attempt += 1) {
    const turns = turnAnglesForAttempt(rng, clockwiseSign);
    const bendLengths = turns.map(() => randomBetween(rng, TOY_PARK_RANDOM_LOOP.bendMinLength, TOY_PARK_RANDOM_LOOP.bendMaxLength));
    const straightDirs = getStraightDirections(turns);
    const straightLengths = straightDirs.map(() => randomBetween(
      rng,
      TOY_PARK_RANDOM_LOOP.preferredMinStraightLength,
      TOY_PARK_RANDOM_LOOP.preferredMaxStraightLength
    ));
    const bendOnlyPieces = turns.map((turnDegrees, index) => ({
      length: bendLengths[index],
      turnDegrees,
    }));
    const bendDisplacement = simulatePiecesPlanar(bendOnlyPieces);

    const solvedCandidates = [];
    for (let a = 0; a < straightDirs.length - 1; a += 1) {
      for (let b = a + 1; b < straightDirs.length; b += 1) {
        const det = straightDirs[a].x * straightDirs[b].z - straightDirs[b].x * straightDirs[a].z;
        if (Math.abs(det) < 0.08) continue;
        let remainingX = target.x - bendDisplacement.x;
        let remainingZ = target.z - bendDisplacement.z;
        straightLengths.forEach((length, index) => {
          if (index === a || index === b) return;
          remainingX -= straightDirs[index].x * length;
          remainingZ -= straightDirs[index].z * length;
        });
        const lengthA = (remainingX * straightDirs[b].z - remainingZ * straightDirs[b].x) / det;
        const lengthB = (straightDirs[a].x * remainingZ - straightDirs[a].z * remainingX) / det;
        if (lengthA < TOY_PARK_RANDOM_LOOP.minStraightLength || lengthA > TOY_PARK_RANDOM_LOOP.maxStraightLength) continue;
        if (lengthB < TOY_PARK_RANDOM_LOOP.minStraightLength || lengthB > TOY_PARK_RANDOM_LOOP.maxStraightLength) continue;
        solvedCandidates.push({ a, b, lengthA, lengthB, score: Math.abs(lengthA - 11) + Math.abs(lengthB - 11) });
      }
    }
    if (!solvedCandidates.length) continue;
    solvedCandidates.sort((left, right) => left.score - right.score);
    const chosen = solvedCandidates[0];
    straightLengths[chosen.a] = chosen.lengthA;
    straightLengths[chosen.b] = chosen.lengthB;

    const pieces = buildPiecesFromLengthsAndTurns({
      straightLengths,
      bendLengths,
      turns,
      attempt,
      generator: TOY_PARK_RANDOM_LOOP.label,
    });
    const simulated = simulatePiecesPlanar(pieces);
    const closureDistance = Math.hypot(simulated.x - target.x, simulated.z - target.z);
    if (closureDistance <= TOY_PARK_RANDOM_LOOP.closureTolerance) {
      pieces.randomLoopSummary = {
        generator: TOY_PARK_RANDOM_LOOP.label,
        randomGenerated: true,
        attempt,
        bendAngles: TOY_PARK_RANDOM_LOOP.bendAngles,
        bendDegrees: TOY_PARK_RANDOM_LOOP.bendAngles,
        ninetyDegreeBendCount: turns.filter((turn) => Math.abs(turn) === 90).length,
        fortyFiveDegreeBendCount: turns.filter((turn) => Math.abs(turn) === 45).length,
        leftTurnCount: turns.filter((turn) => turn < 0).length,
        rightTurnCount: turns.filter((turn) => turn > 0).length,
        netTurnDegrees: turns.reduce((sum, turn) => sum + turn, 0),
        clockwiseSign,
        solvedStraightIndexes: [chosen.a, chosen.b],
        straightLengths: straightLengths.map((length) => Number(length.toFixed(3))),
        bendLengths: bendLengths.map((length) => Number(length.toFixed(3))),
        turnSequence: turns,
        closureTarget: 'start-board-entrance-not-start-board-exit',
        closureDistance: Number(closureDistance.toFixed(3)),
        closureTolerance: TOY_PARK_RANDOM_LOOP.closureTolerance,
        finalRoadToFinishConnector: 'straight-square-entry-connector-before-finish-board',
        includesLeftAndRightTurns: true,
      };
      return pieces;
    }
  }
  return null;
};

const buildFallbackClosedLoopPieces = () => {
  const straightTile = TOY_PARK_TRACK_TILE_LIBRARY.straight;
  const variableBendTile = TOY_PARK_TRACK_TILE_LIBRARY.variableBend;
  const pieces = [];
  const finishApproachStraightLength = straightTile.prototypeLoopLength ?? straightTile.length;
  const variableBendTurns = [30, 60, 60, 60, 60, 60, 30];
  variableBendTurns.forEach((turnDegrees, index) => {
    pieces.push(cloneTilePiece(straightTile, {
      type: 'straight',
      length: (straightTile.prototypeLoopLength ?? straightTile.length)
        + (index === 2 ? TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT + finishApproachStraightLength : 0),
      turnDegrees: 0,
      loopPrototype: true,
      loopPrototypeIndex: index,
      loopSegmentRole: index === 2 ? 'loop-straight-start-entrance-and-finish-approach-compensator' : 'loop-straight',
    }));
    pieces.push(cloneTilePiece(variableBendTile, {
      type: 'variable-bend',
      length: variableBendTile.prototypeLoopLength ?? variableBendTile.length,
      turnDegrees,
      variableAngleDegrees: turnDegrees,
      loopPrototype: true,
      loopPrototypeIndex: index,
      loopSegmentRole: `loop-variable-angle-bend-${turnDegrees}`,
    }));
  });
  pieces.push(cloneTilePiece(straightTile, {
    type: 'straight',
    length: finishApproachStraightLength,
    turnDegrees: 0,
    loopPrototype: true,
    loopPrototypeIndex: variableBendTurns.length,
    loopSegmentRole: 'finish-board-square-entry-straight-connector',
  }));
  pieces.randomLoopSummary = {
    generator: 'fallback-fixed-short-loop-prototype',
    randomGenerated: false,
    includesLeftAndRightTurns: false,
    fallbackReason: 'random-loop-solver-did-not-find-positive-straight-lengths',
  };
  return pieces;
};

export const buildToyParkDefaultTilePieces = ({ rng = seededFallbackRng } = {}) => (
  solveRandomClosedLoopPieces(rng) || buildFallbackClosedLoopPieces()
);

export const getToyParkTrackRoadLength = (pieces = null) => (
  (pieces || buildToyParkDefaultTilePieces()).reduce((sum, piece) => sum + piece.length, 0)
);

export const getToyParkTileLabel = (tileKey) => {
  const tile = Object.values(TOY_PARK_TRACK_TILE_LIBRARY).find((candidate) => candidate.key === tileKey);
  return tile?.label ?? null;
};

export const buildToyParkTrackTileSummary = ({ pieceMetadata, rightAngleTurns, fortyFiveTurns, variableBendTurns = [], loopClosure = null, randomLoopSummary = null }) => {
  const tileCounts = {
    start: 1,
    straight: pieceMetadata.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.straight.key).length,
    variableBend: pieceMetadata.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.variableBend.key).length,
    uTurn180: 0,
    corner45: fortyFiveTurns.length,
    corner90: rightAngleTurns.length,
    finish: 1,
  };
  const roadSequence = pieceMetadata.map((piece) => piece.tileKey || piece.type);
  const totalTurnDegrees = pieceMetadata.reduce((sum, piece) => sum + (piece.turnDegrees || 0), 0);
  const leftBends = variableBendTurns.filter((piece) => piece.turnDegrees < 0);
  const rightBends = variableBendTurns.filter((piece) => piece.turnDegrees > 0);
  const randomLoop = randomLoopSummary || null;

  return {
    status: 'opt-in-toy-park-random-left-right-45-and-90-degree-closed-loop-start-road-tiles-finish-connects-back-to-start-entrance-no-obstacles-default-classic-unchanged',
    tileSystem: 'random-closed-loop-start-plus-straights-left-right-45-and-90-degree-variable-bends-plus-square-entry-finish-board',
    availableTileTypes: [
      TOY_PARK_TRACK_TILE_LIBRARY.start,
      TOY_PARK_TRACK_TILE_LIBRARY.straight,
      TOY_PARK_TRACK_TILE_LIBRARY.variableBend,
      TOY_PARK_TRACK_TILE_LIBRARY.finish,
    ],
    disabledTileTypes: [TOY_PARK_TRACK_TILE_LIBRARY.disabledCorner45, TOY_PARK_TRACK_TILE_LIBRARY.disabledUTurn180],
    sequence: [
      TOY_PARK_TRACK_TILE_LIBRARY.start.key,
      ...roadSequence,
      TOY_PARK_TRACK_TILE_LIBRARY.finish.key,
    ],
    requestedSequence: [
      TOY_PARK_TRACK_TILE_LIBRARY.start.key,
      'random-left-and-right-45-and-90-degree-bends',
      TOY_PARK_TRACK_TILE_LIBRARY.straight.key,
      TOY_PARK_TRACK_TILE_LIBRARY.variableBend.key,
      TOY_PARK_TRACK_TILE_LIBRARY.finish.key,
      'finish-connects-back-to-start-entrance',
    ],
    counts: tileCounts,
    temporaryDefaultSequence: false,
    randomGeneratedSequence: Boolean(randomLoop?.randomGenerated),
    randomLoop,
    loopPrototype: true,
    loopClosedCourse: Boolean(loopClosure?.finishConnectsToStartEntrance),
    loopSegmentCount: pieceMetadata.length,
    totalTurnDegrees,
    expectedTotalTurnDegrees: Math.abs(totalTurnDegrees) === 360 ? totalTurnDegrees : 360,
    finishConnectsToStartEntrance: Boolean(loopClosure?.finishConnectsToStartEntrance),
    loopClosure,
    noObstaclesDefault: true,
    onlyStraightBetweenStartFinish: false,
    onlyStraightAnd45BetweenStartFinish: variableBendTurns.every((piece) => Math.abs(piece.turnDegrees) === 45),
    onlyStraightAnd45Or90BetweenStartFinish: variableBendTurns.every((piece) => [45, 90].includes(Math.abs(piece.turnDegrees))),
    onlyStraightAndVariableBendsBetweenStartFinish: pieceMetadata.every((piece) => (
      piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.straight.key
      || piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.variableBend.key
    )),
    onlyStraightVariableBendsAndUTurnBetweenStartFinish: false,
    noFortyFiveDegreeBends: fortyFiveTurns.length === 0,
    hasFortyFiveDegreeBend: fortyFiveTurns.length > 0,
    hasNinetyDegreeBend: rightAngleTurns.length > 0,
    ninetyDegreeBendCount: rightAngleTurns.length,
    fortyFiveDegreeBendCount: fortyFiveTurns.length,
    variableBendAngles: variableBendTurns.map((piece) => piece.turnDegrees),
    hasVariableAngleBend: variableBendTurns.length > 0,
    hasLeftBends: leftBends.length > 0,
    hasRightBends: rightBends.length > 0,
    leftBendCount: leftBends.length,
    rightBendCount: rightBends.length,
    bendLengthControlledByGenerator: true,
    straightLengthControlledByGenerator: true,
    hasUTurn180: false,
    uTurn180Count: 0,
    uTurn180Cancelled: true,
    cancelledTileTypes: [TOY_PARK_TRACK_TILE_LIBRARY.disabledUTurn180.key],
    noNinetyDegreeBends: rightAngleTurns.length === 0,
    flatBoardToFinish: true,
    shortPrototypeForTesting: false,
  };
};
