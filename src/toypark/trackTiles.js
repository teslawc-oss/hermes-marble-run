import { TOY_PARK_TRACK_TILE_LIBRARY } from './config.js';

const degreesToRadians = (degrees) => degrees * (Math.PI / 180);

const TOY_PARK_WINDMILL_VISUAL_FOOTPRINT = {
  // Conservative minimum host straight length for the fixed purple approach/circle/exit
  // surface. Shorter straights put the visual overhang on top of adjacent 45-degree bends.
  minHostStraightLength: 21.5,
  policy: 'only-place-windmill-on-straights-long-enough-for-purple-approach-circle-exit-footprint',
};

// The Toy Park start board is deeper than the road tiles: d=0 is the start-board
// exit where the first road tile begins, while the user-facing board entrance is
// farther back on the start board. The loop prototype must close to that entrance,
// not to the d=0 exit edge.
export const TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT = 25.125;


const TOY_PARK_START_AREA_AVOIDANCE = {
  enabled: true,
  policy: 'prefer-random-road-tiles-away-from-start-board-keepout-before-bridge-fallback',
  // Approximate Toy Park start board footprint in the generator's local X/Z plane.
  // The live renderer has a second bridge keepout, but rejecting routes here makes
  // the designed board track avoid stacking near START rather than only lifting it.
  halfWidth: 14,
  zMin: -1.25,
  zMax: TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT + 1.25,
  allowedStartExitDistance: 2.4,
  allowedFinishEntranceDistance: 2.8,
  sampleStep: 0.65,
};

const TOY_PARK_RANDOM_LOOP = {
  label: 'random-left-right-45-and-90-degree-closed-loop',
  bendAngles: [45, 90],
  bendCount: 12,
  ninetyDegreeBendCount: 4,
  fortyFiveDegreeBendCount: 8,
  oppositeFortyFiveTurnCount: 4,
  minStraightLength: 4.8,
  maxStraightLength: 42,
  preferredMinStraightLength: 6,
  preferredMaxStraightLength: 24,
  bendMinLength: 3.7,
  bendMaxLength: 5.4,
  ninetyDegreeBendMinLength: 8.2,
  ninetyDegreeBendMaxLength: 9.8,
  ninetyDegreeBendAntiOverlap: 'longer-radius-90-degree-road-board-prevents-inner-ribbon-self-overlap-z-fighting',
  bridgeModuleSet: {
    enabled: false,
    label: 'cancelled-ramp-up-elevated-straight-ramp-down-bridge-board-piece-set',
    rampUpLength: TOY_PARK_TRACK_TILE_LIBRARY.rampUp.length,
    elevatedLength: TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight.length,
    rampDownLength: TOY_PARK_TRACK_TILE_LIBRARY.rampDown.length,
    height: TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight.bridgeHeight,
    minHostStraightLength: 20,
    preservePlanarClosure: true,
    noAutoBridgeFallback: true,
    cancelledByUser: true,
    replacementPolicy: 'generator-level-road-footprint-avoidance-no-ramp-bridge-tiles',
  },
  closureTolerance: 1.25,
  maxAttempts: 2800,
  roadFootprintAvoidance: {
    enabled: true,
    policy: 'reject-random-loop-candidates-with-non-adjacent-road-footprint-overlap-or-near-collision-no-bridge-fallback',
    railOpeningFootprintWidth: 4.25,
    clearanceMargin: 0.75,
    sampleStep: 0.65,
    endpointTolerance: 0.08,
    adjacentPieceGapToIgnore: 1,
    gapTwoRequiresCenterlineCrossing: true,
  },
};

const cloneTilePiece = (tile, overrides = {}) => ({
  type: overrides.type || tile.type || tile.role || 'straight',
  length: overrides.length ?? tile.length,
  turnDegrees: overrides.turnDegrees ?? tile.turnDegrees ?? tile.defaultTurnDegrees ?? 0,
  tileKey: tile.key,
  angleRadians: degreesToRadians(overrides.turnDegrees ?? tile.turnDegrees ?? tile.defaultTurnDegrees ?? 0),
  variableAngleDegrees: overrides.variableAngleDegrees ?? null,
  elevationRole: overrides.elevationRole ?? tile.elevationRole ?? null,
  bridgeHeight: overrides.bridgeHeight ?? tile.bridgeHeight ?? 0,
  bridgeModule: Boolean(overrides.bridgeModule),
  bridgeModuleIndex: overrides.bridgeModuleIndex ?? null,
  bridgeModuleRole: overrides.bridgeModuleRole ?? null,
  bridgeHostStraightIndex: overrides.bridgeHostStraightIndex ?? null,
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
  let totalD = 0;
  const samples = [{ x, z, d: 0, pieceIndex: -1, localD: 0 }];
  pieces.forEach((piece, pieceIndex) => {
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
      totalD += deltaD;
      samples.push({ x, z, d: totalD, pieceIndex, localD: d });
      previousD = d;
    }
    heading = startHeading + degreesToRadians(piece.turnDegrees);
  });
  return { x, z, heading, samples, totalD };
};

const evaluateStartAreaAvoidance = (simulated) => {
  if (!TOY_PARK_START_AREA_AVOIDANCE.enabled) {
    return { enabled: false, ok: true, intrusionCount: 0 };
  }
  const cfg = TOY_PARK_START_AREA_AVOIDANCE;
  const target = { x: 0, z: TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT };
  const intrusions = (simulated.samples || []).filter((sample) => {
    const inside = Math.abs(sample.x) <= cfg.halfWidth
      && sample.z >= cfg.zMin
      && sample.z <= cfg.zMax;
    if (!inside) return false;
    const nearStartExit = sample.d <= cfg.allowedStartExitDistance;
    const nearFinishEntrance = Math.hypot(sample.x - target.x, sample.z - target.z) <= cfg.allowedFinishEntranceDistance
      && (simulated.totalD - sample.d) <= cfg.allowedFinishEntranceDistance + 0.75;
    return !(nearStartExit || nearFinishEntrance);
  });
  const nearestToBoardCenter = (simulated.samples || []).reduce((best, sample) => {
    const clampedX = Math.max(-cfg.halfWidth, Math.min(cfg.halfWidth, sample.x));
    const clampedZ = Math.max(cfg.zMin, Math.min(cfg.zMax, sample.z));
    const distance = Math.hypot(sample.x - clampedX, sample.z - clampedZ);
    return distance < best.distance ? { distance, x: sample.x, z: sample.z, d: sample.d, pieceIndex: sample.pieceIndex } : best;
  }, { distance: Infinity, x: null, z: null, d: null, pieceIndex: null });
  return {
    enabled: true,
    ok: intrusions.length === 0,
    policy: cfg.policy,
    protectedArea: {
      halfWidth: cfg.halfWidth,
      zMin: cfg.zMin,
      zMax: cfg.zMax,
      allowedStartExitDistance: cfg.allowedStartExitDistance,
      allowedFinishEntranceDistance: cfg.allowedFinishEntranceDistance,
    },
    intrusionCount: intrusions.length,
    firstIntrusion: intrusions[0]
      ? {
        x: Number(intrusions[0].x.toFixed(3)),
        z: Number(intrusions[0].z.toFixed(3)),
        d: Number(intrusions[0].d.toFixed(3)),
        pieceIndex: intrusions[0].pieceIndex,
      }
      : null,
    nearestToProtectedArea: Number(nearestToBoardCenter.distance.toFixed(3)),
  };
};

const evaluateRoadFootprintAvoidance = (simulated) => {
  const cfg = TOY_PARK_RANDOM_LOOP.roadFootprintAvoidance;
  if (!cfg?.enabled) return { enabled: false, ok: true, overlapCount: 0 };
  const samples = simulated.samples || [];
  const segments = [];
  for (let index = 1; index < samples.length; index += 1) {
    const prev = samples[index - 1];
    const point = samples[index];
    if (!Number.isFinite(prev.pieceIndex) || !Number.isFinite(point.pieceIndex)) continue;
    if (prev.pieceIndex !== point.pieceIndex) continue;
    segments.push({
      pieceIndex: point.pieceIndex,
      x1: prev.x,
      z1: prev.z,
      d1: prev.d,
      x2: point.x,
      z2: point.z,
      d2: point.d,
    });
  }
  const threshold = Math.max(1.2, (cfg.railOpeningFootprintWidth ?? 4.25) + (cfg.clearanceMargin ?? 0.75));
  const cross2d = (ax, az, bx, bz) => ax * bz - az * bx;
  const clampUnit = (value) => Math.max(0, Math.min(1, value));
  const nearEndpoint = (t) => t <= cfg.endpointTolerance || t >= 1 - cfg.endpointTolerance;
  const closestPointOnSegment = (px, pz, segment) => {
    const vx = segment.x2 - segment.x1;
    const vz = segment.z2 - segment.z1;
    const lenSq = Math.max(0.000001, vx * vx + vz * vz);
    const t = clampUnit(((px - segment.x1) * vx + (pz - segment.z1) * vz) / lenSq);
    return { t, x: segment.x1 + vx * t, z: segment.z1 + vz * t, d: segment.d1 + (segment.d2 - segment.d1) * t };
  };
  const pointOn = (segment, t) => ({
    t,
    x: segment.x1 + (segment.x2 - segment.x1) * t,
    z: segment.z1 + (segment.z2 - segment.z1) * t,
    d: segment.d1 + (segment.d2 - segment.d1) * t,
  });
  const overlaps = [];
  for (let aIndex = 0; aIndex < segments.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < segments.length; bIndex += 1) {
      const a = segments[aIndex];
      const b = segments[bIndex];
      const pieceGap = Math.abs(a.pieceIndex - b.pieceIndex);
      if (pieceGap <= (cfg.adjacentPieceGapToIgnore ?? 1)) continue;
      const rx = a.x2 - a.x1;
      const rz = a.z2 - a.z1;
      const sx = b.x2 - b.x1;
      const sz = b.z2 - b.z1;
      const denominator = cross2d(rx, rz, sx, sz);
      const lengthProduct = Math.hypot(rx, rz) * Math.hypot(sx, sz);
      let crossing = null;
      if (Math.abs(denominator) >= Math.max(0.0001, lengthProduct * 0.0001)) {
        const qpx = b.x1 - a.x1;
        const qpz = b.z1 - a.z1;
        const t = cross2d(qpx, qpz, sx, sz) / denominator;
        const u = cross2d(qpx, qpz, rx, rz) / denominator;
        if (t > cfg.endpointTolerance && t < 1 - cfg.endpointTolerance && u > cfg.endpointTolerance && u < 1 - cfg.endpointTolerance) {
          crossing = { mode: 'centerline-crossing', distance: 0, dA: a.d1 + (a.d2 - a.d1) * t, dB: b.d1 + (b.d2 - b.d1) * u };
        }
      }
      if (crossing) {
        overlaps.push({ pieceGap, pieceA: a.pieceIndex, pieceB: b.pieceIndex, ...crossing });
        continue;
      }
      if (pieceGap <= 2 && cfg.gapTwoRequiresCenterlineCrossing) continue;
      const probes = [0.25, 0.5, 0.75];
      const candidates = [
        ...probes.map((t) => {
          const p = pointOn(a, t);
          return { from: 'a', a: p, b: closestPointOnSegment(p.x, p.z, b) };
        }),
        ...probes.map((t) => {
          const p = pointOn(b, t);
          return { from: 'b', a: closestPointOnSegment(p.x, p.z, a), b: p };
        }),
      ].filter((candidate) => !(nearEndpoint(candidate.a.t) && nearEndpoint(candidate.b.t)))
        .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.a.x - candidate.b.x, candidate.a.z - candidate.b.z) }))
        .sort((left, right) => left.distance - right.distance);
      const nearest = candidates[0];
      if (nearest && nearest.distance <= threshold) {
        overlaps.push({ mode: 'road-footprint-proximity-overlap', pieceGap, pieceA: a.pieceIndex, pieceB: b.pieceIndex, distance: nearest.distance, dA: nearest.a.d, dB: nearest.b.d, nearestSource: nearest.from });
      }
    }
  }
  const first = overlaps[0] || null;
  return {
    enabled: true,
    ok: overlaps.length === 0,
    policy: cfg.policy,
    threshold: Number(threshold.toFixed(3)),
    segmentCount: segments.length,
    overlapCount: overlaps.length,
    firstOverlap: first ? {
      mode: first.mode,
      pieceA: first.pieceA,
      pieceB: first.pieceB,
      pieceGap: first.pieceGap,
      distance: Number((first.distance ?? 0).toFixed(3)),
      dA: Number((first.dA ?? 0).toFixed(3)),
      dB: Number((first.dB ?? 0).toFixed(3)),
      nearestSource: first.nearestSource || null,
    } : null,
  };
};

const applyBridgeModuleSetToPieces = (pieces) => {
  const bridgeCfg = TOY_PARK_RANDOM_LOOP.bridgeModuleSet;
  if (!bridgeCfg?.enabled) return pieces;
  const straightTile = TOY_PARK_TRACK_TILE_LIBRARY.straight;
  const rampUpTile = TOY_PARK_TRACK_TILE_LIBRARY.rampUp;
  const elevatedTile = TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight;
  const rampDownTile = TOY_PARK_TRACK_TILE_LIBRARY.rampDown;
  const bridgeLength = bridgeCfg.rampUpLength + bridgeCfg.elevatedLength + bridgeCfg.rampDownLength;
  const bridgeEdgeStraightMinLength = Math.max(
    TOY_PARK_RANDOM_LOOP.minStraightLength,
    straightTile.prototypeLoopLength ?? straightTile.length * 0.5 ?? TOY_PARK_RANDOM_LOOP.minStraightLength
  );
  const hostCandidates = pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => piece.tileKey === straightTile.key
      && piece.loopSegmentRole !== 'finish-board-square-entry-straight-connector-random-loop-closure'
      && piece.length >= Math.max(bridgeCfg.minHostStraightLength, bridgeEdgeStraightMinLength * 2 + 3));
  if (!hostCandidates.length) {
    pieces.bridgeModuleSummary = {
      enabled: true,
      inserted: false,
      reason: 'no-straight-host-long-enough-without-changing-planar-loop-closure',
      bridgeModuleSet: bridgeCfg,
    };
    return pieces;
  }
  hostCandidates.sort((left, right) => right.piece.length - left.piece.length);
  const { piece: host, index: hostIndex } = hostCandidates[0];
  const beforeLength = Math.min(bridgeEdgeStraightMinLength, Math.max(1.5, (host.length - 3) / 2));
  const afterLength = beforeLength;
  const availableBridgeLength = Math.max(3, host.length - beforeLength - afterLength);
  const bridgeLengthScale = Math.min(1, availableBridgeLength / Math.max(0.001, bridgeLength));
  const rampUpLength = bridgeCfg.rampUpLength * bridgeLengthScale;
  const elevatedLength = bridgeCfg.elevatedLength * bridgeLengthScale;
  const rampDownLength = bridgeCfg.rampDownLength * bridgeLengthScale;
  const activeBridgeHeight = bridgeCfg.height * bridgeLengthScale;
  const shared = {
    loopPrototype: Boolean(host.loopPrototype),
    loopPrototypeIndex: host.loopPrototypeIndex,
    randomLoop: Boolean(host.randomLoop),
    randomLoopGenerator: host.randomLoopGenerator,
    randomLoopAttempt: host.randomLoopAttempt,
    randomLoopStraightIndex: host.randomLoopStraightIndex,
    closureSolved: Boolean(host.closureSolved),
    bridgeHostStraightIndex: host.randomLoopStraightIndex,
  };
  const replacement = [
    cloneTilePiece(straightTile, {
      ...shared,
      type: 'straight',
      length: beforeLength,
      turnDegrees: 0,
      loopSegmentRole: 'bridge-host-straight-before-ramp-up',
    }),
    cloneTilePiece(rampUpTile, {
      ...shared,
      type: 'ramp-up',
      length: rampUpLength,
      bridgeHeight: activeBridgeHeight,
      bridgeModule: true,
      bridgeModuleIndex: 0,
      bridgeModuleRole: 'ramp-up-to-elevated-board',
      loopSegmentRole: 'toy-park-ramp-up-independent-bridge-board',
    }),
    cloneTilePiece(elevatedTile, {
      ...shared,
      type: 'elevated-straight',
      length: elevatedLength,
      bridgeHeight: activeBridgeHeight,
      bridgeModule: true,
      bridgeModuleIndex: 1,
      bridgeModuleRole: 'raised-flat-bridge-board',
      loopSegmentRole: 'toy-park-elevated-straight-independent-bridge-board',
    }),
    cloneTilePiece(rampDownTile, {
      ...shared,
      type: 'ramp-down',
      length: rampDownLength,
      bridgeHeight: activeBridgeHeight,
      bridgeModule: true,
      bridgeModuleIndex: 2,
      bridgeModuleRole: 'ramp-down-from-elevated-board',
      loopSegmentRole: 'toy-park-ramp-down-independent-bridge-board',
    }),
    cloneTilePiece(straightTile, {
      ...shared,
      type: 'straight',
      length: afterLength,
      turnDegrees: 0,
      loopSegmentRole: 'bridge-host-straight-after-ramp-down',
    }),
  ];
  const nextPieces = [
    ...pieces.slice(0, hostIndex),
    ...replacement,
    ...pieces.slice(hostIndex + 1),
  ];
  nextPieces.randomLoopSummary = pieces.randomLoopSummary || null;
  nextPieces.bridgeModuleSummary = {
    enabled: true,
    inserted: true,
    label: bridgeCfg.label,
    mode: 'separate-ramp-up-elevated-straight-ramp-down-road-tiles-preserve-planar-loop-closure',
    hostPieceIndex: hostIndex,
    hostStraightIndex: host.randomLoopStraightIndex,
    hostOriginalLength: Number(host.length.toFixed(3)),
    replacementLengths: replacement.map((piece) => Number(piece.length.toFixed(3))),
    moduleTileKeys: [rampUpTile.key, elevatedTile.key, rampDownTile.key],
    moduleLabels: [rampUpTile.label, elevatedTile.label, rampDownTile.label],
    bridgeHeight: Number(activeBridgeHeight.toFixed(3)),
    requestedBridgeLength: Number(bridgeLength.toFixed(3)),
    activeBridgeLength: Number((rampUpLength + elevatedLength + rampDownLength).toFixed(3)),
    bridgeLengthScale: Number(bridgeLengthScale.toFixed(3)),
    preservePlanarClosure: true,
    noAutoBridgeFallback: true,
    hostStraightMinimumKeptAtBothBridgeEnds: bridgeEdgeStraightMinLength,
    ordinaryTrackProtection: 'keep-full-straight-road-tile-length-before-ramp-up-and-after-ramp-down-so-bridge-does-not-scramble-neighbour-track',
  };
  return nextPieces;
};

const buildPiecesFromLengthsAndTurns = ({ straightLengths, bendLengths, turns, attempt, generator }) => {
  const straightTile = TOY_PARK_TRACK_TILE_LIBRARY.straight;
  const candyPopStraightObstacleTile = TOY_PARK_TRACK_TILE_LIBRARY.candyPopStraightObstacle;
  const windmillSpinnerCircleTile = TOY_PARK_TRACK_TILE_LIBRARY.windmillSpinnerCircle;
  const variableBendTile = TOY_PARK_TRACK_TILE_LIBRARY.variableBend;
  const pieces = [];
  const pickStraightTile = (straightIndex, length) => {
    const enoughRoomForWindmillCircle = length >= TOY_PARK_WINDMILL_VISUAL_FOOTPRINT.minHostStraightLength;
    const enoughRoomForCandyPopPattern = length >= 7.8;
    if (straightIndex > 0 && straightIndex % 4 === 2 && enoughRoomForWindmillCircle && windmillSpinnerCircleTile) {
      return windmillSpinnerCircleTile;
    }
    if (straightIndex > 0 && straightIndex % 3 === 1 && enoughRoomForCandyPopPattern && candyPopStraightObstacleTile) {
      // Keep the start-board connector plain, then sprinkle themed obstacle boards
      // through ordinary straights so the interface width stays identical to the base straight tile.
      return candyPopStraightObstacleTile;
    }
    return straightTile;
  };
  turns.forEach((turnDegrees, index) => {
    const selectedStraightTile = pickStraightTile(index, straightLengths[index]);
    pieces.push(cloneTilePiece(selectedStraightTile, {
      type: ['straight-obstacle', 'circle-obstacle'].includes(selectedStraightTile.role) ? selectedStraightTile.role : 'straight',
      length: straightLengths[index],
      turnDegrees: 0,
      loopPrototype: true,
      loopPrototypeIndex: index,
      loopSegmentRole: index === 0 ? 'random-loop-opening-straight' : (selectedStraightTile.role === 'straight-obstacle' ? 'random-loop-candy-pop-straight-obstacle' : (selectedStraightTile.role === 'circle-obstacle' ? 'random-loop-windmill-spinner-circle-obstacle' : 'random-loop-straight')),
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
  const finishStraightTile = pickStraightTile(straightLengths.length - 1, straightLengths[straightLengths.length - 1]);
  pieces.push(cloneTilePiece(finishStraightTile, {
    type: ['straight-obstacle', 'circle-obstacle'].includes(finishStraightTile.role) ? finishStraightTile.role : 'straight',
    length: straightLengths[straightLengths.length - 1],
    turnDegrees: 0,
    loopPrototype: true,
    loopPrototypeIndex: turns.length,
    loopSegmentRole: finishStraightTile.role === 'straight-obstacle'
      ? 'finish-board-square-entry-candy-pop-straight-obstacle-random-loop-closure'
      : (finishStraightTile.role === 'circle-obstacle'
        ? 'finish-board-square-entry-windmill-spinner-circle-obstacle-random-loop-closure'
        : 'finish-board-square-entry-straight-connector-random-loop-closure'),
    randomLoop: true,
    randomLoopGenerator: generator,
    randomLoopAttempt: attempt,
    randomLoopStraightIndex: straightLengths.length - 1,
    closureSolved: true,
  }));
  return applyBridgeModuleSetToPieces(pieces);
};

const solveRandomClosedLoopPieces = (rng) => {
  const target = { x: 0, z: TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT };
  const clockwiseSign = rng() < 0.5 ? 1 : -1;
  for (let attempt = 1; attempt <= TOY_PARK_RANDOM_LOOP.maxAttempts; attempt += 1) {
    const turns = turnAnglesForAttempt(rng, clockwiseSign);
    const bendLengths = turns.map((turnDegrees) => {
      const isNinetyDegree = Math.abs(turnDegrees) === 90;
      const minLength = isNinetyDegree ? TOY_PARK_RANDOM_LOOP.ninetyDegreeBendMinLength : TOY_PARK_RANDOM_LOOP.bendMinLength;
      const maxLength = isNinetyDegree ? TOY_PARK_RANDOM_LOOP.ninetyDegreeBendMaxLength : TOY_PARK_RANDOM_LOOP.bendMaxLength;
      return randomBetween(rng, minLength, maxLength);
    });
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
    const simulated = simulatePiecesPlanar(pieces, TOY_PARK_RANDOM_LOOP.roadFootprintAvoidance.sampleStep);
    const closureDistance = Math.hypot(simulated.x - target.x, simulated.z - target.z);
    const startAreaAvoidance = evaluateStartAreaAvoidance(simulated);
    const roadFootprintAvoidance = evaluateRoadFootprintAvoidance(simulated);
    if (closureDistance <= TOY_PARK_RANDOM_LOOP.closureTolerance && startAreaAvoidance.ok && roadFootprintAvoidance.ok) {
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
        bendLengthPolicy: {
          fortyFiveDegreeRange: [TOY_PARK_RANDOM_LOOP.bendMinLength, TOY_PARK_RANDOM_LOOP.bendMaxLength],
          ninetyDegreeRange: [TOY_PARK_RANDOM_LOOP.ninetyDegreeBendMinLength, TOY_PARK_RANDOM_LOOP.ninetyDegreeBendMaxLength],
          ninetyDegreeAntiOverlap: TOY_PARK_RANDOM_LOOP.ninetyDegreeBendAntiOverlap,
        },
        turnSequence: turns,
        closureTarget: 'start-board-entrance-not-start-board-exit',
        closureDistance: Number(closureDistance.toFixed(3)),
        closureTolerance: TOY_PARK_RANDOM_LOOP.closureTolerance,
        finalRoadToFinishConnector: 'straight-square-entry-connector-before-finish-board',
        bridgeModuleSet: { ...TOY_PARK_RANDOM_LOOP.bridgeModuleSet, inserted: false, active: false },
        hasIndependentBridgeModules: false,
        rampBridgeCancelled: true,
        rampBridgeReplacementPolicy: TOY_PARK_RANDOM_LOOP.bridgeModuleSet.replacementPolicy,
        activeTileKeys: [...new Set(pieces.map((piece) => piece.tileKey))],
        startAreaAvoidance,
        roadFootprintAvoidance,
        avoidsStartBoardArea: true,
        avoidsRoadFootprintOverlap: true,
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
  const startAreaAvoidance = evaluateStartAreaAvoidance(simulatePiecesPlanar(pieces, TOY_PARK_START_AREA_AVOIDANCE.sampleStep));
  const roadFootprintAvoidance = evaluateRoadFootprintAvoidance(simulatePiecesPlanar(pieces, TOY_PARK_RANDOM_LOOP.roadFootprintAvoidance.sampleStep));
    pieces.randomLoopSummary = {
      generator: 'fallback-fixed-short-loop-prototype',
      randomGenerated: false,
      includesLeftAndRightTurns: false,
      startAreaAvoidance,
      roadFootprintAvoidance,
      avoidsStartBoardArea: startAreaAvoidance.ok,
      avoidsRoadFootprintOverlap: roadFootprintAvoidance.ok,
      bridgeModuleSet: { ...TOY_PARK_RANDOM_LOOP.bridgeModuleSet, inserted: false, active: false },
      hasIndependentBridgeModules: false,
      rampBridgeCancelled: true,
      rampBridgeReplacementPolicy: TOY_PARK_RANDOM_LOOP.bridgeModuleSet.replacementPolicy,
      fallbackReason: 'random-loop-solver-did-not-find-non-overlapping-positive-straight-lengths-with-start-area-avoidance',
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

const getToyParkBoardRole = (piece) => {
  if (piece.bridgeModule) return piece.elevationRole || 'bridge';
  if (piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.variableBend.key) return 'bend';
  if (piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampUp.key) return 'ramp-up';
  if (piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight.key) return 'elevated';
  if (piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampDown.key) return 'ramp-down';
  return 'straight';
};

export const buildToyParkBoardSequence = ({ pieceMetadata = [], loopClosure = null } = {}) => ([
  {
    index: 0,
    boardRole: 'start',
    type: 'start-board',
    tileKey: TOY_PARK_TRACK_TILE_LIBRARY.start.key,
    tileLabel: TOY_PARK_TRACK_TILE_LIBRARY.start.label,
    turnDegrees: 0,
    startDistance: null,
    endDistance: 0,
    connection: 'start-board-exit-connects-to-first-road-tile',
  },
  ...pieceMetadata.map((piece, index) => ({
    index: index + 1,
    boardRole: getToyParkBoardRole(piece),
    type: piece.type,
    tileKey: piece.tileKey || piece.type,
    tileLabel: piece.tileLabel || getToyParkTileLabel(piece.tileKey) || null,
    turnDegrees: piece.turnDegrees || 0,
    bendDegrees: piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.variableBend.key ? Math.abs(piece.turnDegrees || 0) : 0,
    bendDirection: piece.turnDegrees < 0 ? 'left' : (piece.turnDegrees > 0 ? 'right' : null),
    elevationRole: piece.elevationRole ?? null,
    bridgeModule: Boolean(piece.bridgeModule),
    bridgeModuleRole: piece.bridgeModuleRole ?? null,
    bridgeHeight: piece.bridgeHeight ?? 0,
    length: Number((piece.length || 0).toFixed(3)),
    startDistance: Number(((piece.startDistance ?? piece.startD) || 0).toFixed(3)),
    endDistance: Number(((piece.endDistance ?? piece.endD) || 0).toFixed(3)),
    loopSegmentRole: piece.loopSegmentRole ?? null,
    finalRoadToFinishConnector: piece.loopSegmentRole === 'finish-board-square-entry-straight-connector',
  })),
  {
    index: pieceMetadata.length + 1,
    boardRole: 'finish',
    type: 'finish-board',
    tileKey: TOY_PARK_TRACK_TILE_LIBRARY.finish.key,
    tileLabel: TOY_PARK_TRACK_TILE_LIBRARY.finish.label,
    turnDegrees: 0,
    startDistance: Number(((pieceMetadata[pieceMetadata.length - 1]?.endDistance ?? pieceMetadata[pieceMetadata.length - 1]?.endD) || 0).toFixed(3)),
    endDistance: null,
    connection: 'finish-board-flush-to-start-board-entrance',
    finishConnectsToStartEntrance: Boolean(loopClosure?.finishConnectsToStartEntrance),
  },
]);

export const buildToyParkTrackTileSummary = ({ pieceMetadata, rightAngleTurns, fortyFiveTurns, variableBendTurns = [], loopClosure = null, randomLoopSummary = null }) => {
  const tileCounts = {
    start: 1,
    straight: pieceMetadata.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.straight.key).length,
    rampUp: 0,
    elevatedStraight: 0,
    rampDown: 0,
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
  const boardSequence = buildToyParkBoardSequence({ pieceMetadata, loopClosure });

  return {
    status: 'opt-in-toy-park-random-left-right-45-and-90-degree-closed-loop-start-road-tiles-finish-connects-back-to-start-entrance-no-obstacles-default-classic-unchanged',
    tileSystem: 'random-closed-loop-start-plus-straights-left-right-45-and-90-degree-variable-bends-plus-square-entry-finish-board',
    availableTileTypes: [
      TOY_PARK_TRACK_TILE_LIBRARY.start,
      TOY_PARK_TRACK_TILE_LIBRARY.straight,
      TOY_PARK_TRACK_TILE_LIBRARY.variableBend,
      TOY_PARK_TRACK_TILE_LIBRARY.finish,
    ],
    disabledTileTypes: [
      TOY_PARK_TRACK_TILE_LIBRARY.rampUp,
      TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight,
      TOY_PARK_TRACK_TILE_LIBRARY.rampDown,
      TOY_PARK_TRACK_TILE_LIBRARY.disabledCorner45,
      TOY_PARK_TRACK_TILE_LIBRARY.disabledUTurn180,
    ],
    sequence: [
      TOY_PARK_TRACK_TILE_LIBRARY.start.key,
      ...roadSequence,
      TOY_PARK_TRACK_TILE_LIBRARY.finish.key,
    ],
    boardSequence,
    boardSequenceReadable: boardSequence.map((piece) => {
      if (piece.boardRole === 'bend') return `${piece.tileLabel} ${piece.bendDirection || ''} ${piece.bendDegrees}°`.trim();
      if (piece.bridgeModule) return `${piece.tileLabel} ${piece.elevationRole || ''}`.trim();
      return piece.tileLabel;
    }),
    boardSequenceIncludesStartStraightBendFinish: true,
    boardSequencePurpose: 'copyable-debug-roadmap-lists-every-toy-park-board-from-start-through-road-tiles-to-finish',
    requestedSequence: [
      TOY_PARK_TRACK_TILE_LIBRARY.start.key,
      TOY_PARK_TRACK_TILE_LIBRARY.straight.key,
      'random-left-and-right-45-and-90-degree-bends',
      TOY_PARK_TRACK_TILE_LIBRARY.variableBend.key,
      TOY_PARK_TRACK_TILE_LIBRARY.finish.key,
      'finish-connects-back-to-start-entrance',
      'ramp-up-elevated-ramp-down-bridge-tiles-cancelled',
      'generator-rejects-road-footprint-overlap-and-start-board-intrusion',
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
    onlyStraightVariableBendsAndBridgeModulesBetweenStartFinish: false,
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
    bridgeModuleSet: randomLoop?.bridgeModuleSet || { ...TOY_PARK_RANDOM_LOOP.bridgeModuleSet, inserted: false, active: false },
    rampBridgeCancelled: true,
    rampBridgeReplacementPolicy: TOY_PARK_RANDOM_LOOP.bridgeModuleSet.replacementPolicy,
    roadFootprintAvoidance: randomLoop?.roadFootprintAvoidance || null,
    avoidsRoadFootprintOverlap: Boolean(randomLoop?.avoidsRoadFootprintOverlap),
    independentBridgeModules: {
      enabled: false,
      inserted: false,
      rampUp: tileCounts.rampUp,
      elevatedStraight: tileCounts.elevatedStraight,
      rampDown: tileCounts.rampDown,
      tileKeys: [],
      height: 0,
      requestedHeight: TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight.bridgeHeight,
      bridgeLengthScale: 0,
      ordinaryTrackProtection: null,
      pathHeightMode: null,
      cancelledByUser: true,
      replacementPolicy: TOY_PARK_RANDOM_LOOP.bridgeModuleSet.replacementPolicy,
    },
    hasUTurn180: false,
    uTurn180Count: 0,
    uTurn180Cancelled: true,
    cancelledTileTypes: [TOY_PARK_TRACK_TILE_LIBRARY.disabledUTurn180.key],
    noNinetyDegreeBends: rightAngleTurns.length === 0,
    flatBoardToFinish: true,
    shortPrototypeForTesting: false,
  };
};
