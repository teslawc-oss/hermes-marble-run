import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import obstacleCatalogData from './obstacle-catalog.json';
import {
  TOY_PARK_MARBLE_VISUAL_THEME,
  TOY_PARK_SOLID_BACKGROUND,
  TOY_PARK_SOFT_GUIDE_PHYSICS,
  TOY_PARK_START_GATE_OVERRIDES,
  TOY_PARK_TRACK_TILE_LIBRARY,
  TOY_PARK_TRACK_WIDTH_SCALE,
  TOY_PARK_WORLD_VISUAL_THEME_STYLE,
  buildToyParkPhysicsMechanicProfile,
} from './toypark/config.js';
import {
  buildToyParkDefaultTilePieces,
  buildToyParkBoardSequence,
  buildToyParkTrackTileSummary,
  getToyParkTileLabel,
  getToyParkTrackRoadLength,
  TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT,
} from './toypark/trackTiles.js';
import {
  addToyParkFinishBoard,
  addToyParkMarbleGuardRails,
  addToyParkTrackTileRibbons,
  buildToyParkHalfRoundRailMesh,
  createToyParkRailMaterialSet,
  createToyParkStartRailPastelMaterialSet,
} from './toypark/visuals.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const VIDEO_CANVAS_LAYOUTS = {
  horizontal: {
    key: 'horizontal',
    label: 'Long / Horizontal Video Canvas',
    width: 1280,
    height: 720,
    fit: 'cover',
  },
  vertical: {
    key: 'vertical',
    label: 'Shorts / Vertical Video Canvas',
    width: 720,
    height: 1280,
    fit: 'cover',
  },
};

const CANVAS_VIEWER_OVERLAY = {
  enabled: true,
  channelHandle: '@VibeCodeCreator',
  ctaPrimary: 'LIKE & SUBSCRIBE',
  maxStandingRows: 5,
  toyParkStandingRefreshMs: 1000,
  toyParkStandingSwapAnimationMs: 520,
};
const CANVAS_START_HOOK = {
  enabled: true,
  style: 'canvas-only-start-countdown-horizontal-and-vertical',
  preRaceTagline: '12 MARBLES. 1 CHAMPION.',
  gateLabel: 'RACE STARTS IN',
  goLabel: 'RUSH!',
  postStartHoldSeconds: 1.8,
  goFadeStartSeconds: 1.15,
};
const TRACK_PRESETS = {
  short: { label: 'Short', base: 240, variation: 56, segment: 9, branches: 1 },
  medium: { label: 'Standard', base: 380, variation: 90, segment: 10, branches: 2 },
  long: { label: 'Long', base: 560, variation: 140, segment: 11, branches: 3 },
  epic: { label: 'Epic', base: 820, variation: 220, segment: 13, branches: 4 },
};

const RECORDING_GATE_DELAY_SECONDS = 2;
const RECORDING_AUDIO_QUALITY = {
  codec: 'opus',
  mimeCodecPreference: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=opus'],
  audioBitsPerSecond: 192_000,
  sampleRate: 48_000,
  channelCount: 2,
  sampleSize: 16,
  label: 'high quality WebM audio: Opus, 192kbps, 48kHz, stereo',
};
const RECORDING_CURSOR_SUPPRESSION = {
  cursor: 'never',
  hidePageCursorClass: 'recording-cursor-hidden',
  label: 'recordings request cursor: never and hide the in-page cursor during capture',
};
const MULTIPLE_RECORDING_DEFAULT_RACES = 5;
const MULTIPLE_RECORDING_CEREMONY_HOLD_SECONDS = 10;
const MULTIPLE_RECORDING_NEXT_GATE_SECONDS = 10;
const MULTIPLE_RECORDING_FINAL_STOP_SECONDS = 10;
const SINGLE_RECORDING_FINAL_STOP_SECONDS = MULTIPLE_RECORDING_FINAL_STOP_SECONDS;
const SURVIVOR_LEAGUE = {
  fieldSize: 16,
  cycleSize: 5,
  keepCount: 10,
  spotlightSeconds: 5,
  pointsByRank: [20, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  label: 'hidden score survivor league: every race scores all placements, every five races keeps the top ten average performers, and replaces the rest without exposing points to viewers',
};
const CUP_CEREMONY_POST_NARRATION_DELAY_SECONDS = 2;
const CUP_VIDEO_TIMING = {
  enabled: true,
  targetSeconds: 600,
  targetMinutes: 10,
  introSeconds: 5,
  gateDelaySeconds: 5,
  nextRaceDelaySeconds: 10,
  postRaceHoldSeconds: 5,
  postReplayPodiumHoldSeconds: 8,
  nextGateAfterRaceSeconds: 5,
  replayHighlightSeconds: 35,
  finalPodiumSeconds: 10.8,
  endCardSeconds: 0,
  recordingStopGraceSeconds: 4.2,
  replayHighlightMaxEvents: 3,
  replayClipSeconds: 7,
  replayHighlightOutroSeconds: 0.6,
  replayHistorySampleSeconds: 0.1,
  replayHistoryBeforeSeconds: 2.2,
  replayHistoryAfterSeconds: 3.8,
  replayFocusLeadSeconds: 1.4,
  replayCameraBack: -7.5,
  replayCameraSide: 0.8,
  replayCameraHeight: 10,
  replayMarbleSpacing: 2.2,
  replayHighlightTitles: {
    overtake: 'Replay: Big Overtake',
    leader: 'Replay: Lead Change',
    battle: 'Replay: Close Battle',
    obstacle: 'Replay: Biggest Collision',
    finish: 'Replay: Final Push',
    winner: 'Replay: Winner',
    complete: 'Replay: Round Result',
    general: 'Replay',
  },
  stageTargetSeconds: {
    'quarter-final': 130,
    'semi-final': 130,
    final: 176,
  },
  stageTrackLengths: {
    'quarter-final': 600,
    'semi-final': 700,
    final: 800,
  },
  stageLengthPreset: 'custom',
  label: '10-minute cup video pacing: intro + three races + replay/highlight gaps + final podium/end card',
};

const estimateCupVideoSeconds = (timing = CUP_VIDEO_TIMING) => {
  const raceSeconds = Object.values(timing.stageTargetSeconds || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const interRaceCount = Math.max(0, Object.keys(timing.stageTargetSeconds || {}).length - 1);
  return (Number(timing.introSeconds) || 0)
    + raceSeconds
    + interRaceCount * ((Number(timing.postRaceHoldSeconds) || 0) + getReplayHighlightHoldSeconds(timing) + (Number(timing.postReplayPodiumHoldSeconds) || 0) + (Number(timing.nextRaceDelaySeconds) || 0) + (Number(timing.nextGateAfterRaceSeconds) || 0))
    + (Number(timing.finalPodiumSeconds) || 0)
    + (Number(timing.endCardSeconds) || 0)
    + (Number(timing.recordingStopGraceSeconds) || 0);
};

const getReplayHighlightHoldSeconds = (timing = CUP_VIDEO_TIMING) => (
  (Number(timing.replayClipSeconds) || 0) * Math.max(1, Number(timing.replayHighlightMaxEvents) || 1)
  + (Number(timing.replayHighlightOutroSeconds) || 0)
);

const START_RAMP = {
  enabled: true,
  length: 36,
  stagingBackLength: 8.2,
  extraDropPerMeter: 0.18,
  stagingDropPerMeter: 0.34,
  prepTrayBackOffset: 11.8,
  prepTrayFrontOffset: 0.65,
  prepTrayDropPerMeter: 0.46,
  label: 'redesigned sloped starting chute so marbles roll through the open gate under gravity',
};

const START_GATE_DESIGN = {
  ...TOY_PARK_START_GATE_OVERRIDES,
  chuteWidthPadding: 6.4,
  chuteDepth: 12.6,
  laneRailHeight: 0.7,
  laneRailThickness: 0.12,
  sideWallHeight: 1.65,
  sideWallThickness: 0.52,
  backWallHeight: 1.35,
  surroundingWallsEnabled: false,
  gateBackDistance: 0.72,
  gateHeight: 1.72,
  gateThickness: 0.34,
  gatePostHeight: 2.65,
  apronForwardLength: 7.2,
  gateClearanceFromFloor: 0.08,
  launchImpulse: 0,
  maxGateCount: 12,
  gateWidthRatio: 0.72,
  minStallWidth: 1.28,
  freezeMarblesUntilGateOpen: true,
  allowPreGateSlideToGate: false,
  slotFillMode: TOY_PARK_START_GATE_OVERRIDES.slotFillMode,
  highCountStaging: {
    enabled: true,
    maxRowsBeforeHoldingPattern: 3,
    rowSpacing: 1.18,
    lateralSpacing: 1.12,
    holdingPatternDepthGap: 1.18,
    holdingPatternSideGap: 1.12,
    label: 'for 50-100 marbles, keep only the first few rows inside gate lanes and place extra marbles in a non-overlapping waiting grid behind the chute',
  },
  transparentVisuals: true,
  startFloorOpacity: 0.34,
  startRailOpacity: 0.34,
  startGateOpacity: 0.38,
  startMarkingOpacity: 0.48,
  label: 'track-aligned open-front start: marbles stay dynamic and may slide down the staging chute until they rest against the closed gate; no hidden drive force before gate opens',
};

const RIGHT_ANGLE_CORNER_SLOPE = {
  enabled: true,
  extraDropPerMeter: 0.12,
  consecutiveExtraDropPerMeter: 0.08,
  transitionExtraDropPerMeter: 0.045,
  label: 'stronger extra downhill pitch through chained 90-degree corners so marbles keep natural speed without hidden assists',
};

const SLOPE_DRIVE = {
  enabled: true,
  model: 'non-regressing-tangent-acceleration-with-top-speed',
  slopeDriveUsesGuideTargetFrame: true,
  dropPerMeter: 0.118,
  minSegmentDropPerMeter: 0.086,
  undulationAmplitude: 0.035,
  forwardGravityScale: 1.9,
  assistForceRatio: 1.0,
  guidePointBias: 0.68,
  guidePointBiasMin: 0,
  guidePointBiasMax: 1,
  guidePointBiasLabel: 'Guide mix: blend forward drive direction more toward the active guide point',
  preserveSpeedAssists: true,
  lookAhead: 1.1,
  maxSpeedRatio: 0.92,
  forecastBehindTolerance: 0.05,
  forceGapMin: 0.18,
  forceGapMax: 1.0,
  backwardDamping: 1,
  lateralDamping: 1,
  dampingDisabledReason: 'user requested disabling backward damping and all lateral damping; tangent forward force and passive collisions remain',
  capHorizontalSpeed: true,
  lookAheadReducedReason: 'continuous 90-degree corners felt like checkpoint pull; use short lookAhead so slope force does not pre-turn across corners',
  label: '每粒波直接沿下一個 guide point（無下一個就終點）嘅 tangent 慢慢加速，到 top speed 即停止；不再用 backward/lateral damping 或過長前望拉住波子',
};

const MIN_FORWARD_SPEED_ASSIST = {
  enabled: false,
  disabledReason: 'user requested cancelling Min speed assist; slope drive remains guide-target tangent only',
  startsAfterProgress: 0.08,
  endsBeforeProgress: 1.01,
  minForwardSpeedRatio: 0.42,
  correctionBlend: 0.16,
  maxVelocityDeltaPerFrame: 0.34,
  lateralDamping: 1,
  dampingDisabledReason: 'user requested disabling all lateral damping; minimum speed floor remains tangent-only',
  label: 'feathered tangent-only minimum forward speed floor through finish; gradual velocity blend, no pulse/random/lateral impulse/no lateral damping',
};

const SPEED_SCALE = 1;
const SPEED_PRESETS = [
  // 賽道係高位落低位；slider 控制「慢慢加速到 top speed」嘅坡向輔助，而唔用回中力。
  // 速度整體減半：所有 speed preset 經 SPEED_SCALE 統一縮放，避免逐項手改造成不一致。
  { label: 'Slow', startImpulse: 0.48 * SPEED_SCALE, maxSpeed: 12.4 * SPEED_SCALE, accel: 1.7 * SPEED_SCALE, unstuck: 0.08 * SPEED_SCALE },
  { label: 'Standard', startImpulse: 0.72 * SPEED_SCALE, maxSpeed: 17.2 * SPEED_SCALE, accel: 2.4 * SPEED_SCALE, unstuck: 0.11 * SPEED_SCALE },
  { label: 'Fast', startImpulse: 1.04 * SPEED_SCALE, maxSpeed: 22.0 * SPEED_SCALE, accel: 3.3 * SPEED_SCALE, unstuck: 0.15 * SPEED_SCALE },
  { label: 'Crazy', startImpulse: 1.44 * SPEED_SCALE, maxSpeed: 28.0 * SPEED_SCALE, accel: 4.5 * SPEED_SCALE, unstuck: 0.2 * SPEED_SCALE },
];

const CATCHUP_ASSIST = {
  enabledByDefault: true,
  maxBonus: 0.22,
  fullEffectGap: 30,
  minGapForBonus: 6,
  lateRaceStartProgress: 0.52,
  lateRaceMaxBonus: 0.07,
  lateRaceFullEffectGap: 22,
  trailingPackOnly: true,
  protectedLeaderCount: 2,
  disableBonusOnTurnPieces: true,
  turnPieceMaxSpeedRatio: 0.7,
  maxEffectiveBonus: 0.28,
  label: 'stronger but bounded comeback pacing: racers outside the top two get up to +22% top speed on straights by 30m gap, plus a late-race +7% closing bonus after 52% progress; leaders and corner pieces stay protected',
};

const MID_TRACK_SPEED_ASSIST = {
  enabled: false,
  disabledReason: 'user requested cancelling Mid speed assist; slope drive remains guide-target tangent only',
  startsAfterProgress: 0.10,
  endsBeforeProgress: 1.01,
  minForwardSpeedRatio: 0.72,
  forceScale: 2.6,
  impulseScale: 0,
  cooldown: 0.14,
  label: 'tangent-only sustained mid-to-final race speed assist; force-only, no impulse kick',
};

const FINAL_APPROACH_ASSIST = {
  enabled: false,
  disabledReason: 'user requested cancelling finish pull / final approach assist; passive track physics and non-finish assists remain',
  startsAfterProgress: 0.84,
  finishDistance: 22,
  finishThreshold: 8,
  minForwardSpeedRatio: 0.82,
  forceScale: 3.2,
  impulseScale: 0,
  cooldown: 0.10,
  maxSpeedRatio: 1.08,
  useDirectFinishVector: true,
  directFinishBlendDistance: 26,
  label: 'force-only direct finish-vector approach pull that prevents final-sector stalls/oscillation without launch impulses',
};

const FALL_TIME_PENALTY_SECONDS = 2;

const FALL_RESPAWN_POLICY = {
  finishGuardDistanceMeters: 1.25,
  trackEdgeMarginMeters: 0.85,
  maxVerticalClearanceMeters: 2.4,
  label: 'Out-of-bounds respawn uses last confirmed on-track progress only; falling/off-track marbles cannot snap to finish or respawn ahead by closest-path percentage.',
};

const FINISH_LINE_RULE = {
  mode: 'single-line-crossing',
  threshold: 0.08,
  label: '終點判定用一條線：波子距離跨過 trackLength 即完成，只保留 8cm 容差，唔再用太闊 finish zone',
};

const RAIL_REBOUND = {
  friction: 0,
  restitution: 1,
  contactEquationStiffness: 8.5e6,
  contactEquationRelaxation: 4,
  label: '撞欄不減速：rail contact 無摩擦、完全彈性反彈，唔用 rail damping / return-to-center assist',
};

const NO_ROLLING_SLOWDOWN = {
  enabled: true,
  marbleLinearDamping: 0,
  marbleAngularDamping: 0,
  idleAngularDampingScale: 1,
  maxAngularSpeed: 24,
  trackContact: { friction: 0, restitution: 0.02 },
  marbleContact: { friction: 0, restitution: 0.42 },
  obstacleContact: { friction: 0, restitution: 0.48 },
  label: '滾動不減速：波子 linear/angular damping = 0，賽道/波子/障礙接觸摩擦設為 0，只保留重力、碰撞同 top-speed cap',
};

const DEFAULT_PHYSICS_MECHANIC_KEY = 'classic';
const PHYSICS_MECHANIC_PROFILES = {
  classic: {
    key: 'classic',
    label: 'Classic Marble Rush',
    renderSafeDefault: true,
    isolatedPreviewOnly: false,
    worldGravityY: -16,
    speedScale: 1,
    accelScale: 1,
    startImpulseScale: 1,
    maxSpeedScale: 1,
    unstuckScale: 1,
    marbleMassScale: 1,
    marbleRadiusScale: 1,
    linearDamping: NO_ROLLING_SLOWDOWN.marbleLinearDamping,
    angularDamping: NO_ROLLING_SLOWDOWN.marbleAngularDamping,
    maxAngularSpeed: NO_ROLLING_SLOWDOWN.maxAngularSpeed,
    trackContact: NO_ROLLING_SLOWDOWN.trackContact,
    marbleContact: NO_ROLLING_SLOWDOWN.marbleContact,
    obstacleContact: NO_ROLLING_SLOWDOWN.obstacleContact,
    slopeDriveOverrides: {},
    contactLabel: 'classic render-safe physics profile; existing render defaults remain unchanged',
  },
  toyPark: buildToyParkPhysicsMechanicProfile(NO_ROLLING_SLOWDOWN),
};

const DROP_TARGET_FINAL_BOOST = {
  enabled: true,
  durationSeconds: 5,
  speedMultiplier: 2,
  allowExceedMaxSpeed: true,
  auraColor: 0xffd166,
  auraOpacity: 0.36,
  auraEmissiveIntensity: 1.65,
  commentaryLines: [
    '{name} unlocks the golden boost',
    '{name} claims the drop-target buff',
    '{name} lights the bank and powers up',
    '{name} takes the prize boost',
    '{name} gets five seconds of speed',
    '{name} turns targets into turbo',
  ],
  label: 'final drop-target clearer gets a 5s golden aura and x2 top-speed override; after expiry aura vanishes and normal max-speed cap resumes',
};

const ORBIT_RING_SPEED_BOOST = {
  enabled: true,
  durationSeconds: 3,
  speedMultiplier: 1.3,
  allowExceedMaxSpeed: true,
  auraColor: 0x50ffe7,
  auraOpacity: 0.24,
  auraRadiusMultiplier: 1.45,
  auraPulseScale: 0.07,
  label: 'orbit ring grants a 3s x1.3 maximum-speed override, then normal max-speed cap resumes',
};

const LANDING_REBOUND_ABSORBER = {
  enabled: true,
  label: 'no-bounce landing absorber: after airborne marble lands on track, remove upward rebound velocity without hidden impulse',
  airborneClearance: 0.92,
  landingClearance: 0.42,
  minFallingSpeed: 1.05,
  upwardVelocityCap: 0.08,
  verticalDamping: 0.18,
  angularDamping: 0.72,
  contactGraceSeconds: 0.18,
};

const AIRBORNE_GUIDE_POLICY = {
  pauseAssistWhileAirborne: true,
  recalculateGuideAfterLanding: true,
  guideMustStayBetweenMarbleAndFinish: true,
  finishFallbackOnlyAfterProgress: 0.92,
  airborneClearance: LANDING_REBOUND_ABSORBER.airborneClearance,
  landingClearance: LANDING_REBOUND_ABSORBER.landingClearance,
  behindTolerance: 0.08,
  label: 'pause slope/min/mid/final guide assists while airborne; after landing snap guide to a short same-piece centerline lookahead, then piece exit/next entrance/finish; if a guide point is behind the marble, advance to the next ahead guide instead of pulling backward',
};

const STUCK_RESET = {
  delaySeconds: 10.0,
  penaltyDistance: 5.5,
  label: '卡死 / no-forward-progress elimination: if a marble has no forward progress for 10 seconds, it is defeated and removed from the race',
};

const STALL_ELIMINATION = {
  enabled: true,
  baseDelaySeconds: 16.0,
  longTrackDelaySeconds: 38.0,
  longTrackReferenceMeters: 760,
  finalStageDelayMultiplier: 1.65,
  minForwardProgressMeters: 0.18,
  minForwardProgressPercentPerWindow: 0.0012,
  requireObservedMotionBeforeElimination: true,
  finishPlacement: 'defeated-after-active-finishers',
  label: 'DNF waits longer for recording stability: timeout scales from 16s toward 38s by track length, final stage gets extra grace, and a marble must first make real forward progress before no-forward-progress elimination can fire',
};

const POST_FIRST_FINISH_DNF_CUTOFF = {
  enabled: true,
  delaySeconds: 28,
  reason: 'post-first-finish-cutoff',
  label: 'After the first marble finishes, wait 28 seconds, then mark every unfinished marble as DNF in the current race order to avoid long tail waiting without cutting normal racers too aggressively.',
};

const GUIDE_POINT_POLICY = {
  targetMode: 'same-piece-lookahead-then-piece-exit-then-next-piece-entrance-or-finish',
  snapToCurrentPieceExit: true,
  snapToPieceEntrance: true,
  clampToTrackCenterline: true,
  minForwardSeparation: 0.35,
  samePieceLookAhead: 1.35,
  cornerSamePieceLookAhead: 0.55,
  chainedTurnSamePieceLookAhead: 0.45,
  exitSnapDistance: 1.25,
  guideStallSeconds: 1.15,
  guideReachedAheadDistance: 0.12,
  guideUnreachedAheadDistance: 0.95,
  guideStallSkipDistance: 1.15,
  nonRegressionSlack: 1.15,
  finishNearestSampleSlack: 3.5,
  overlapProjectionWindowBehind: 2.4,
  overlapProjectionWindowAhead: 7.5,
  maxNearestProgressJump: 8,
  guideBlockedByObstacleRadiusPadding: 0.55,
  cornerExitNextEntranceMaxDistance: 4.2,
  label: 'guide point advances only a short distance within the current board first; if a near guide point cannot be reached, advance to the next small point, including obstacle-overlap stalls; corner exits cannot jump far into the next straight; Toy Park overlap/bridge projection stays near current progress so stacked roads do not steal guides',
};

const DIRECTION_STABILITY_ASSIST = {
  enabled: false,
  disabledReason: 'user requested cancelling all rail-hit center guide / return-to-center assists; passive rail collision remains',
  startsAfterProgress: 0.08,
  endsBeforeProgress: 0.92,
  centerCorrectionForceScale: 0,
  lateralDamping: 1,
  backwardDamping: 1,
  maxCenterCorrectionRatio: 0,
  minLateralOffsetRatio: 1,
  railRiskOffsetRatio: 1,
  outwardRailRiskOffsetRatio: 1,
  recentRailContactSeconds: 0,
  correctionAheadTolerance: 0.2,
  tangentRecoveryForceScale: 0,
  label: 'disabled: no rail-hit return-to-center guide, no inward correction force, no lateral damping; rails are passive collision only',
};

const WIDTH_PRESETS = {
  ultra: { label: 'Ultra Narrow', min: 7.2, max: 9.2, minFactor: 0.62, absoluteMin: 4.8 },
  narrow: { label: 'Narrow', min: 10.0, max: 12.5, minFactor: 0.56, absoluteMin: 5.2 },
  normal: { label: 'Normal', min: 14.0, max: 20.0, minFactor: 0.42, absoluteMin: 5.2 },
  wide: { label: 'Wide', min: 21.0, max: 27.0, minFactor: 0.48, absoluteMin: 8.5 },
};
const OBSTACLE_PRESETS = [
  { label: 'None', multiplier: 0 },
  { label: 'Standard', multiplier: 1 },
  { label: 'Many', multiplier: 1.65 },
  { label: 'Extreme', multiplier: 2.35 },
];
const OBSTACLE_DISTRIBUTION_MODES = {
  random: {
    label: '完全隨機',
    description: 'Each obstacle independently picks a random enabled type and random distance.',
  },
  zoned: {
    label: '障礙物分區',
    description: 'Track length is split into zones; each zone uses one obstacle type only.',
    minZoneMeters: 70,
  },
};
const OBSTACLE_PLACEMENT = {
  minSpacingMeters: 10,
  minSpacingFloorMeters: 6,
  pairClearanceMeters: 2,
  startPaddingMeters: 12,
  finishPaddingMeters: 16,
  label: 'obstacle placements are sorted and relaxed with pair-aware spacing so large obstacles do not overlap or visually block each other',
};
const OBSTACLE_CATEGORY_TARGET_WEIGHTS = {
  normal: 5,
  buff: 1,
  debuff: 1,
};
const OBSTACLE_TYPE_PLACEMENT = {
  popBumper: { footprintMeters: 3.8, spawnWeight: 1.15 },
  pinBumper: { footprintMeters: 4.8, spawnWeight: 1.05 },
  gongBumper: { footprintMeters: 5.8, spawnWeight: 0.85 },
  slingshot: { footprintMeters: 5.2, spawnWeight: 1.0 },
  spinnerGate: { footprintMeters: 7.0, spawnWeight: 0.8 },
  movingGate: { footprintMeters: 7.4, spawnWeight: 0.7 },
  splitterFork: { footprintMeters: 6.8, spawnWeight: 0.86 },
  pendulumHammer: { footprintMeters: 7.6, spawnWeight: 0.68 },
  tiltBridge: { footprintMeters: 7.8, spawnWeight: 0.65 },
  orbitRing: { footprintMeters: 8.2, spawnWeight: 0.72 },
  dropTarget: { footprintMeters: 7.0, spawnWeight: 0.72 },
};
const OBSTACLE_CATEGORIES = obstacleCatalogData.categories;
const PINBALL_OBSTACLE_TYPE_ENTRIES = obstacleCatalogData.types;
const PINBALL_OBSTACLE_TYPES = PINBALL_OBSTACLE_TYPE_ENTRIES.map((type) => type.value);
const PINBALL_OBSTACLE_TYPE_METADATA = Object.fromEntries(
  PINBALL_OBSTACLE_TYPE_ENTRIES.map(({ value, ...metadata }) => [value, metadata]),
);
const PINBALL_OBSTACLE_CATALOG = Object.fromEntries(
  Object.entries(OBSTACLE_CATEGORIES).map(([category, config]) => [
    category,
    {
      ...config,
      key: category,
      types: PINBALL_OBSTACLE_TYPES.filter((type) => PINBALL_OBSTACLE_TYPE_METADATA[type]?.category === category),
    },
  ]),
);

const BROADCAST_CAMERA = {
  defaultMode: 'default',
  angleStyle: 'broadcast-auto-director-mid-race-leader-chase-watchability-trial',
  highAngleBattleEnabled: false,
  birdEyeCameraAngle: true,
  toyParkBroadcast: {
    enabled: true,
    label: 'Toy Park broadcast camera: mostly high-angle look-across coverage, intermittent cinematic-forward sweeps, first-corner top-three chase, mid-race traffic/overtake cuts, final leader-plus-nearest-challenger, and short zoom punches on collisions/overtakes',
    momentZoomSeconds: 1.45,
    firstCornerProgressEnd: 0.24,
    finalLeaderProgressStart: 0.74,
    cinematicForwardCycleSeconds: 14,
    cinematicForwardHoldSeconds: 3.2,
    startClose: { back: -5.0, side: 1.25, height: 16.5, lookAhead: 6.2, targetLift: 0.9, fov: 42, positionSmoothing: 0.16, targetSmoothing: 0.2, label: 'start: higher broadcast angle across the staged front pack' },
    firstCorner: { back: -7.6, side: 3.0, height: 24.0, lookAhead: 10.5, targetLift: 1.15, fov: 40, positionSmoothing: 0.07, targetSmoothing: 0.11, label: 'first corner: high-angle chase of the top three' },
    actionSpot: { back: -6.8, side: -3.2, height: 22.5, lookAhead: 9.0, targetLift: 1.05, fov: 39, positionSmoothing: 0.1, targetSmoothing: 0.14, label: 'mid race: high-angle cut to the tightest traffic / overtake pocket' },
    cinematicForward: { back: -10.8, side: 0.4, height: 26.5, lookAhead: 13.5, targetLift: 1.15, fov: 36, positionSmoothing: 0.09, targetSmoothing: 0.13, label: 'intermittent cinematic-forward sweep looking ahead along the route' },
    leaderDuel: { back: -8.8, side: 2.4, height: 24.5, lookAhead: 11.5, targetLift: 1.15, fov: 37, positionSmoothing: 0.065, targetSmoothing: 0.11, label: 'final: high-angle follow on leader plus nearest challenger' },
    momentZoom: { back: -4.6, side: 1.4, height: 15.5, lookAhead: 6.2, targetLift: 0.95, fov: 34, positionSmoothing: 0.28, targetSmoothing: 0.3, label: 'collision / overtake / lead-change short zoom punch from a higher angle' },
  },
  initialVerticalAxisRotationDegrees: 150,
  defaultCameraPitchUpDegrees: 58,
  defaultPitchModes: ['leadPack', 'leadBattle', 'unfinishedOrder'],
  outOfBoundsIgnoreAfterSeconds: 1.0,
  outOfBoundsIgnoreLabel: 'auto camera: if a marble is outside the track for more than 1 second, stop targeting it until it respawns/returns',
  cinematicLeaderFromProgress: 0.8,
  finishSlowMotionCameraHoldSeconds: 3.4,
  finishSlowMotionCameraLabel: 'when finish slow motion triggers near/crossing the line, Default Auto holds the finish-line shot through the slow-mo window so the slow finish camera remains visible before returning to race/podium coverage',
  postFirstFinish: {
    finishHoldSeconds: 4,
    followModeAfterHold: 'cinematicLeader',
    snapOnLeadPackSwitch: true,
    label: 'after the first marble finishes, hold the finisher for 4 seconds, then snap to a close-up of the leading unfinished marble until every racer completes',
  },
  lineOfSight: {
    enabled: true,
    minClearance: 3.2,
    sampleCount: 2,
    maxHeightBoost: 7.5,
    boostStep: 3.5,
    maxElevationDegrees: 58,
    protectedModes: ['leadBattle', 'selected', 'unfinishedOrder', 'replayHighlight'],
    raceFollowProtectedModes: ['leadPack', 'cinematicLeader'],
    raceFollowMaxHeightBoost: 5,
    raceFollowBoostStep: 2.5,
    raceFollowAvoidance: {
      enabled: true,
      modes: ['leadPack'],
      strategy: 'rotate-around-target-then-small-lift',
      angleDegrees: [18, -18, 32, -32, 48, -48, 64, -64],
      maxAcceptedHits: 0,
      label: 'lead-pack camera first rotates around the current target when passed track blocks line of sight; only falls back to a small lift if every sampled angle is still blocked',
    },
    passedTrackBehindDistance: 7,
    passedTrackLabel: 'Default Auto race-follow modes only lift when an already-passed track/rail section sits between the camera and the current target, avoiding full overhead line-of-sight boosting',
    label: 'auto camera applies a bounded lift on real line-of-sight blockers; lead-pack and 60%+ cinematic leader only use the smaller passed-track guard so the shot stays readable without being blocked by old track sections',
  },
  leader: {
    back: -9.9,
    side: 0.92,
    height: 27,
    lookAhead: 12.4,
    targetLookAheadScale: 0.24,
    targetGuideBlend: 0.36,
    targetLift: 1.2,
    dynamicLookAheadBySpeed: 6.5,
    maxSideWave: 0.12,
    sideWaveSpeed: 0.24,
    positionSmoothing: 0.065,
    targetSmoothing: 0.13,
    fov: 30.2,
    obstacleAwareDistance: 30.2,
    obstaclePullback: 1.2,
    obstacleHeightBoost: 2.7,
    obstacleLookAheadBoost: 3.2,
    label: 'mid/late-race leader chase shot: zoomed out about 8% so P1 and more upcoming track stay visible without feeling too distant',
  },
  leadPack: {
    back: -8.2,
    side: 0.89,
    height: 31.3,
    packHeightStep: 0.49,
    lookAhead: 13,
    targetLookAheadScale: 0.38,
    targetGuideBlend: 0.4,
    targetLift: 1.55,
    useTrackNormalHeight: true,
    flatTrackHeightBoost: 5.4,
    flatSlopeYThreshold: 0.18,
    dynamicLookAheadBySpeed: 4.9,
    maxSideWave: 0.22,
    sideWaveSpeed: 0.26,
    positionSmoothing: 0.04,
    targetSmoothing: 0.085,
    fov: 32.4,
    obstacleAwareDistance: 36.7,
    obstaclePullback: 2.9,
    obstacleHeightBoost: 2.7,
    obstacleLookAheadBoost: 4.3,
    label: 'zoomed-out early-race cinematic lead-pack shot: about 8% wider/farther so the pack and more upcoming track remain readable without feeling too distant',
  },
  leadBattle: {
    enabled: true,
    label: 'auto close-up when top two marbles are neck-and-neck',
    maxGap: 3.2,
    minProgress: 0.04,
    back: -2.4,
    side: 0.55,
    height: 22.0,
    targetLift: 0.9,
  },
  selected: { back: -2.6, side: -0.7, height: 26.0 },
  unfinished: { back: -2.6, side: 0.8, height: 27.0 },
  finish: { forward: 3.3, height: 27.5 },
  podium360: {
    enabled: true,
    label: 'race-complete-360-degree-podium-orbit',
    radius: 10.5,
    height: 10.8,
    heightBob: 1.6,
    angularSpeed: 0.46,
    championLabel: 'final-cup-ceremony-slow-vertical-axis-orbit',
    championRadius: 11.8,
    championHeight: 11.4,
    championHeightBob: 0.65,
    championAngularSpeed: 0.16,
  },
  sequence: ['highAngleLeader', 'highAngleLeadPack', 'finishLineHighShot', 'unfinishedOrderHighTrack', 'raceCompletePodium360Orbit'],
};

function makeStartTransparentMaterial(baseMaterial, opacity = 0.35) {
  const material = baseMaterial?.clone ? baseMaterial.clone() : new THREE.MeshStandardMaterial({ color: 0x7cf7d4, roughness: 0.32 });
  material.transparent = true;
  material.opacity = clamp(opacity, 0.05, 1);
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  return material;
}

const FINISH_SLOW_MOTION = {
  enabled: true,
  trigger: 'leader-enters-final-pre-line-window',
  preFinishDistance: 5,
  duration: 3,
  minTimeScale: 0.24,
  easeInSeconds: 0.25,
  holdSeconds: 1.75,
  easeOutSeconds: 1.0,
  label: 'leader triggers replay-style slow motion shortly before crossing the line; confetti cannons still fire on actual finish',
};

const PODIUM_CEREMONY = {
  enabled: true,
  confettiEverySeconds: 1.15,
  championConfettiEverySeconds: 0.45,
  confettiDurationSeconds: 4.8,
  championConfettiDurationSeconds: 7.5,
  maxConfettiBursts: 5,
  championMaxConfettiBursts: 14,
  duration: 9,
  championDuration: Infinity,
  label: 'race-complete podium ceremony with medal overlay, spotlight pulses, bounded confetti bursts, and a continuing podium orbit',
};

const MARBLE_LABEL_POLICY = {
  showOnlyAfterRaceStart: true,
  visibleTopRankCount: 5,
  hidePendingFallAfterSeconds: 1.1,
  label: 'name labels are hidden before the race starts; once racing/finished, only the current top 5 ranked marbles show labels',
};

const PERFORMANCE_TUNING = {
  label: 'fps-balanced',
  maxPixelRatio: 2,
  antialias: true,
  preserveDrawingBuffer: false,
  shadows: false,
  shadowMapSize: 1024,
  physicsSolverIterations: 8,
  runningMaxSubSteps: 2,
  readyMaxSubSteps: 1,
  railTubeSampleStep: 1.05,
  railTubeSegmentMultiplier: 1.35,
  railTubeRadialSegments: 8,
  lowerRailTubeRadialSegments: 6,
  physicalRailBodyBudget: 460,
  guardRailInterval: 1.65,
  guardRailOverlap: 4.6,
  uiUpdateMs: 500,
  debugUpdateMs: 1200,
  leaderboardUpdateMs: 800,
  rankingCacheMs: 220,
  trailSampleEvery: 0.085,
  trailStartTrackDistance: 0.75,
  trailPoints: 7,
  marbleSegments: 20,
  marbleRings: 14,
  obstacleCylinderSegments: 18,
  obstacleSphereSegments: 12,
  maxSpectacleEffects: 7,
  maxSpectacleEffectMeshes: 34,
  maxConfettiPieces: 170,
  spectacleSpawnCooldownMs: 65,
  decorationStepMeters: 26,
  disableDecorativePointLights: true,
  renderNameLabelUpdateMs: 0,
  nameLabelRankUpdateMs: 220,
  nameLabelScaleTargetUpdateMs: 120,
  nameLabelPositionWriteThresholdSq: 0.0004,
  nameLabelScaleWriteThreshold: 0.005,
  renderSkipOrbitControlsUpdate: false,
  renderSkipSpectacleEffects: false,
  nameLabelScaleSmoothing: 0.18,
};

const UI_THROTTLE_PROFILES = {
  live: {
    key: 'live',
    label: 'Live browser UI',
    uiUpdateMs: PERFORMANCE_TUNING.uiUpdateMs,
    debugUpdateMs: PERFORMANCE_TUNING.debugUpdateMs,
    leaderboardUpdateMs: PERFORMANCE_TUNING.leaderboardUpdateMs,
    rankingCacheMs: PERFORMANCE_TUNING.rankingCacheMs,
    nameLabelRankUpdateMs: PERFORMANCE_TUNING.nameLabelRankUpdateMs,
    nameLabelScaleTargetUpdateMs: PERFORMANCE_TUNING.nameLabelScaleTargetUpdateMs,
  },
  smooth1080p: {
    key: 'smooth1080p',
    label: 'Smooth 1080p render UI',
    uiUpdateMs: 1000,
    debugUpdateMs: 2600,
    leaderboardUpdateMs: 1800,
    rankingCacheMs: 700,
    nameLabelRankUpdateMs: 450,
    nameLabelScaleTargetUpdateMs: 180,
  },
  turbo60: {
    key: 'turbo60',
    label: 'Turbo 60fps render',
    // Geometry detail cuts
    antialias: false,
    physicsSolverIterations: 6,
    runningMaxSubSteps: 1,
    physicalRailBodyBudget: 330,
    marbleSegments: 16,
    marbleRings: 10,
    obstacleCylinderSegments: 12,
    obstacleSphereSegments: 8,
    trailPoints: 5,
    trailSampleEvery: 0.13,
    trailStartTrackDistance: 0.8,
    railTubeSegmentMultiplier: 1.2,
    railTubeRadialSegments: 6,
    lowerRailTubeRadialSegments: 4,
    decorationStepMeters: 40,
    disableDecorativePointLights: true,
    // Spectacle budget
    maxSpectacleEffects: 4,
    maxSpectacleEffectMeshes: 20,
    maxConfettiPieces: 95,
    spectacleSpawnCooldownMs: 100,
    // UI throttle
    uiUpdateMs: 1500,
    debugUpdateMs: 6000,
    leaderboardUpdateMs: 3000,
    rankingCacheMs: 1500,
    nameLabelRankUpdateMs: 1200,
    nameLabelScaleTargetUpdateMs: 1000,
    renderNameLabelUpdateMs: 250,
    nameLabelPositionWriteThresholdSq: 0.01,
    nameLabelScaleWriteThreshold: 0.08,
    nameLabelScaleSmoothing: 0,
    renderSkipOrbitControlsUpdate: true,
    renderSkipSpectacleEffects: true,
  },
};

const OBSTACLE_ANIMATION_CULLING = {
  enabled: true,
  lookAheadProgress: 0.05,
  minLookAheadMeters: 25,
  maxLookAheadMeters: 80,
  passedBufferMeters: 8,
  animatedTypes: new Set(['spinnerGate', 'movingGate', 'tiltBridge', 'pendulumHammer', 'dropTarget', 'gongBumper']),
};

const PINBALL_PHYSICS = {
  popBumperRadius: 1.55,
  popBumperImpulse: 7.2,
  pinBumperRadius: 1.12,
  pinBumperImpulse: 5.6,
  pinBumperCount: 5,
  gongBumperRadius: 2.45,
  gongBumperImpulse: 7.8,
  gongBumperPackImpulse: 2.15,
  gongBumperPackRadius: 6.2,
  slingshotRadius: 1.75,
  slingshotImpulse: 6.6,
  spinnerRadius: 1.25,
  spinnerImpulse: 5.2,
  spinnerSpeed: 5.2,
  dropTargetRadius: 1.18,
  dropTargetImpulse: 5.8,
  dropTargetUpImpulse: 0.35,
  dropTargetSingleUse: false,
  dropTargetBounceMode: 'per-target-bank-clear-forward-boost',
  dropTargetResetSeconds: 6,
  dropTargetDropSpeed: 4.2,
  dropTargetResetSpeed: 3.2,
  dropTargetBankBonusImpulse: 4.5,
  movingGateRadius: 2.45,
  movingGateImpulse: 4.9,
  movingGateSweepSpeed: 1.8,
  movingGateSwingAmplitude: 0.78,
  splitterForkRadius: 3.45,
  splitterForkImpulse: 5.4,
  splitterForkForwardBias: 1.04,
  splitterForkSideBias: 0.58,
  splitterForkMinSideSpeed: 2.75,
  pendulumHammerRadius: 3.65,
  pendulumHammerImpulse: 5.6,
  pendulumHammerSweepSpeed: 1.18,
  pendulumHammerSwingAmplitude: 0.72,
  tiltBridgeRadius: 3.8,
  tiltBridgeImpulse: 3.8,
  tiltBridgeSweepSpeed: 1.35,
  tiltBridgeTiltAmplitude: 0.28,
  orbitRingRadius: 1.95,
  orbitRingImpulse: 2.35,
  orbitRingGuideStrength: 0.18,
  orbitRingForwardBias: 1.18,
};

const CURVE_PRESETS = {
  mixed: { label: 'Mixed: hairpins + S-curves', sStrength: 1.25, uStrength: 1.55, hairpinStrength: 1.0, randomStrength: 0.62 },
  sCurve: { label: 'S-curves', sStrength: 1.8, uStrength: 0.45, hairpinStrength: 0.45, randomStrength: 0.42 },
  uTurn: { label: 'U-turn hairpins', sStrength: 0.5, uStrength: 2.15, hairpinStrength: 1.45, randomStrength: 0.32 },
  gentle: { label: 'Gentle random', sStrength: 0.75, uStrength: 0.55, hairpinStrength: 0.35, randomStrength: 0.5 },
};

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function mulberry32(a) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function encodeTrackDebugCode(payload) {
  const json = JSON.stringify(payload);
  return `MR1:${btoa(unescape(encodeURIComponent(json)))}`;
}

function decodeTrackDebugCode(value) {
  if (typeof value !== 'string' || !value.trim().startsWith('MR1:')) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(value.trim().slice(4)))));
  } catch (error) {
    return null;
  }
}

function normalizeSeedInput(rawSeed) {
  const value = String(rawSeed || '').trim();
  const decoded = decodeTrackDebugCode(value);
  if (decoded?.app === 'marble-race') {
    return {
      seed: String(decoded.seed || decoded.rngMaterial || value),
      importedTrackDebug: decoded,
      wasTrackDebugCode: true,
    };
  }
  return { seed: value, importedTrackDebug: null, wasTrackDebugCode: false };
}

const nameAdjectives = [
  'Thunder', 'Phantom', 'Crystal', 'Blaze', 'Silver', 'Rapid', 'Violet', 'Stellar',
  'Aurora', 'Rose', 'Frost', 'Comet', 'Night', 'Golden', 'Emerald', 'Scarlet',
  'Solar', 'Lunar', 'Cosmic', 'Turbo', 'Radiant', 'Shadow', 'Arctic', 'Jade',
  'Copper', 'Velvet', 'Neon', 'Ivory', 'Obsidian', 'Sapphire', 'Ruby', 'Amber',
  'Cobalt', 'Prism', 'Meteor', 'Mirage', 'Nimbus', 'Vector', 'Glacier', 'Wild',
  'Electric', 'Royal', 'Mighty', 'Swift', 'Daring', 'Brave', 'Silent', 'Lucky',
  'Apex', 'Lava', 'Ember', 'Inferno', 'Tidal', 'Polar', 'Mist', 'Aero',
  'Sonic', 'Eclipse', 'Void', 'Ghost', 'Noble', 'Titan', 'Chrome', 'Opal',
  'Candy', 'Orbit', 'Galaxy', 'Lightning', 'Granite', 'Iron', 'Steel', 'Prime',
];
const nameNouns = [
  'Bolt', 'Racer', 'Spinner', 'Flash', 'Rocket', 'Marble', 'Surge', 'Pearl',
  'Bandit', 'Drifter', 'Chaser', 'Nova', 'Dash', 'Whisker', 'Falcon',
  'Comet', 'Vortex', 'Voyager', 'Meteor', 'Orbit', 'Pulse', 'Spark', 'Jet',
  'Arrow', 'Storm', 'River', 'Flare', 'Phoenix', 'Dragon', 'Panther', 'Tiger',
  'Cyclone', 'Ranger', 'Runner', 'Glider', 'Striker', 'Pioneer', 'Ace', 'Maverick',
  'Cruiser', 'Breaker', 'Blazer', 'Seeker', 'Raider', 'Knight', 'Pilot',
  'Lynx', 'Fox', 'Hawk', 'Wave', 'Ripple', 'Tide', 'Wisp', 'Drift',
  'Ember', 'Core', 'Shard', 'Gleam', 'Quill', 'Crown', 'Anchor', 'Guard',
  'Trail', 'Streak', 'Prism', 'Lance', 'Blade', 'Stone', 'Beacon', 'Rune',
];
const nameTitles = [
  'Turbo', 'Omega', 'Zero', 'Neo', 'Pro', 'Prime', 'Infinity', 'Velocity',
  'Apex', 'Blitz', 'Fusion', 'Nitro', 'Quantum', 'Orbit', 'Zenith',
  'Eclipse', 'Vertex', 'Momentum', 'Radiance', 'Catalyst', 'Overdrive', 'Vanguard',
];

const MARBLE_COLOR_STYLES = [
  { label: 'Crimson Pulse', hex: '#ff3864', color: 0xff3864, palette: ['#ff3864', '#ffd166'], material: 'glass' },
  { label: 'Aqua Neon', hex: '#35e0ff', color: 0x35e0ff, palette: ['#35e0ff', '#7cf7d4', '#0f172a'], material: 'neon' },
  { label: 'Sunlit Gold', hex: '#ffd166', color: 0xffd166, palette: ['#ffd166', '#ff8f3d', '#ffffff'], material: 'metallic' },
  { label: 'Lime Comet', hex: '#75ff8a', color: 0x75ff8a, palette: ['#75ff8a', '#c8ff00'], material: 'gloss' },
  { label: 'Violet Haze', hex: '#ae7cff', color: 0xae7cff, palette: ['#ae7cff', '#ff70a6', '#4d96ff'], material: 'pearl' },
  { label: 'Orange Flare', hex: '#ff8f3d', color: 0xff8f3d, palette: ['#ff8f3d', '#ff3864', '#ffd166'], material: 'gloss' },
  { label: 'Pearl White', hex: '#f7f7ff', color: 0xf7f7ff, palette: ['#f7f7ff', '#c7d2fe', '#35e0ff'], material: 'pearl' },
  { label: 'Blue Nova', hex: '#4d96ff', color: 0x4d96ff, palette: ['#4d96ff', '#35e0ff', '#0f172a'], material: 'glass' },
  { label: 'Rose Candy', hex: '#ff70a6', color: 0xff70a6, palette: ['#ff70a6', '#ffd1dc', '#ae7cff'], material: 'candy' },
  { label: 'Mint Circuit', hex: '#00f5d4', color: 0x00f5d4, palette: ['#00f5d4', '#75ff8a', '#081020'], material: 'neon' },
  { label: 'Acid Glow', hex: '#c8ff00', color: 0xc8ff00, palette: ['#c8ff00', '#00f5d4', '#050a18'], material: 'neon' },
  { label: 'Amber Spark', hex: '#ffbe0b', color: 0xffbe0b, palette: ['#ffbe0b', '#ff3864', '#2b1300'], material: 'metallic' },
  { label: 'Ruby Sapphire Duo', hex: '#e11d48', color: 0xe11d48, palette: ['#e11d48', '#2563eb'], material: 'glass' },
  { label: 'Emerald Amethyst Duo', hex: '#10b981', color: 0x10b981, palette: ['#10b981', '#8b5cf6'], material: 'pearl' },
  { label: 'Fire Ice Trio', hex: '#f97316', color: 0xf97316, palette: ['#f97316', '#38bdf8', '#f8fafc'], material: 'glass' },
  { label: 'Galaxy Opal Trio', hex: '#111827', color: 0x111827, palette: ['#111827', '#7c3aed', '#22d3ee', '#f8fafc'], material: 'opal' },
  { label: 'Oil Slick Chrome', hex: '#334155', color: 0x334155, palette: ['#334155', '#ec4899', '#22c55e', '#eab308'], material: 'chrome' },
  { label: 'Tiger Jade', hex: '#f59e0b', color: 0xf59e0b, palette: ['#f59e0b', '#064e3b', '#fef3c7'], material: 'stone' },
  { label: 'Cotton Candy Split', hex: '#f9a8d4', color: 0xf9a8d4, palette: ['#f9a8d4', '#93c5fd', '#ffffff'], material: 'candy' },
  { label: 'Lava Obsidian', hex: '#7f1d1d', color: 0x7f1d1d, palette: ['#111111', '#7f1d1d', '#fb923c'], material: 'stone' },
];

const MARBLE_VISUAL_THEMES = {
  mixed: {
    key: 'mixed',
    label: 'Mixed Showcase',
    description: 'Balanced mix of glass, neon, chrome, candy, stone, and opal marbles.',
  },
  neon: {
    key: 'neon',
    label: 'Neon Arcade',
    description: 'High-contrast cyber colors with circuit, starfield, ripple, and chevron textures.',
    colorLabels: ['Aqua Neon', 'Mint Circuit', 'Acid Glow', 'Galaxy Opal Trio', 'Oil Slick Chrome', 'Violet Haze', 'Blue Nova'],
    patternKeys: ['circuit', 'starfield', 'ripple', 'chevron', 'comet'],
    materialOverride: 'neon',
  },
  luxe: {
    key: 'luxe',
    label: 'Luxury Glass',
    description: 'Premium pearl/chrome/glass marbles with rings, split panels, and opal-style highlights.',
    colorLabels: ['Pearl White', 'Ruby Sapphire Duo', 'Emerald Amethyst Duo', 'Fire Ice Trio', 'Oil Slick Chrome', 'Galaxy Opal Trio', 'Sunlit Gold'],
    patternKeys: ['rings', 'split', 'triad', 'spiral', 'starfield'],
  },
  candy: {
    key: 'candy',
    label: 'Candy Pop',
    description: 'Bright confectionery palettes with checker, ripple, split, and speckle textures.',
    colorLabels: ['Rose Candy', 'Cotton Candy Split', 'Crimson Pulse', 'Orange Flare', 'Lime Comet', 'Pearl White'],
    patternKeys: ['checker', 'speckle', 'split', 'ripple', 'rings'],
    materialOverride: 'candy',
  },
  natural: {
    key: 'natural',
    label: 'Natural Stone',
    description: 'Grounded marble/stone palettes with veins, storm lines, flame, and layered rings.',
    colorLabels: ['Tiger Jade', 'Lava Obsidian', 'Emerald Amethyst Duo', 'Amber Spark', 'Pearl White', 'Sunlit Gold'],
    patternKeys: ['marble-vein', 'storm', 'rings', 'flame', 'speckle'],
  },
  toyPark: TOY_PARK_MARBLE_VISUAL_THEME,
};

const DEFAULT_MARBLE_VISUAL_THEME_KEY = 'mixed';

function hexColorToNumber(hex, fallback = 0xffffff) {
  if (typeof hex !== 'string') return fallback;
  const cleaned = hex.replace('#', '').trim();
  const value = Number.parseInt(cleaned, 16);
  return Number.isFinite(value) ? value : fallback;
}

const WORLD_VISUAL_THEME_STYLES = {
  mixed: {
    track: { base: '#10172a', mid: '#252b55', accent: '#ff4fa3', secondary: '#7cf7d4', line: '#ffd166', pattern: 'pinball-playfield', roughness: 0.38, metalness: 0.12, clearcoat: 0.75 },
    ground: { base: '#8a552f', mid: '#a96c3d', accent: '#5b2b12', secondary: '#d19a62', pattern: 'wood-arena', roughness: 0.82, metalness: 0.02 },
    rail: { base: '#151827', mid: '#202a37', accent: '#7cf7d4', secondary: '#ff4fa3', pattern: 'neon-rubber', roughness: 0.30, metalness: 0.18, clearcoat: 0.8 },
    gate: { base: '#0f172a', panel: '#7cf7d4', warning: '#ffd166', emissive: '#00483d', signEmissive: '#3d2500' },
  },
  neon: {
    track: { base: '#050816', mid: '#111a3a', accent: '#00f5d4', secondary: '#ff4fa3', line: '#c8ff00', pattern: 'cyber-circuit', roughness: 0.26, metalness: 0.24, clearcoat: 0.9 },
    ground: { base: '#060914', mid: '#151827', accent: '#00f5d4', secondary: '#9b8cff', pattern: 'dark-grid', roughness: 0.58, metalness: 0.12 },
    rail: { base: '#07111f', mid: '#12213a', accent: '#00f5d4', secondary: '#ff3864', pattern: 'neon-rubber', roughness: 0.24, metalness: 0.22, clearcoat: 0.85 },
    gate: { base: '#050a18', panel: '#00f5d4', warning: '#c8ff00', emissive: '#00f5d4', signEmissive: '#6d7a00' },
  },
  luxe: {
    track: { base: '#111827', mid: '#334155', accent: '#f8fafc', secondary: '#d4af37', line: '#93c5fd', pattern: 'glass-lanes', roughness: 0.18, metalness: 0.32, clearcoat: 1.0 },
    ground: { base: '#3b2f2f', mid: '#6b4f3a', accent: '#d4af37', secondary: '#f8fafc', pattern: 'polished-wood', roughness: 0.54, metalness: 0.08 },
    rail: { base: '#1f2937', mid: '#475569', accent: '#f8fafc', secondary: '#d4af37', pattern: 'chrome-rail', roughness: 0.18, metalness: 0.58, clearcoat: 0.95 },
    gate: { base: '#111827', panel: '#f8fafc', warning: '#d4af37', emissive: '#334155', signEmissive: '#5c4200' },
  },
  candy: {
    track: { base: '#ffd1dc', mid: '#93c5fd', accent: '#ff70a6', secondary: '#75ff8a', line: '#ffffff', pattern: 'candy-checker', roughness: 0.22, metalness: 0.05, clearcoat: 0.9 },
    ground: { base: '#ffe4ef', mid: '#c7d2fe', accent: '#ff70a6', secondary: '#ffd166', pattern: 'soft-sprinkles', roughness: 0.64, metalness: 0.02 },
    rail: { base: '#ff70a6', mid: '#ae7cff', accent: '#ffffff', secondary: '#ffd166', pattern: 'candy-stripes', roughness: 0.18, metalness: 0.04, clearcoat: 0.85 },
    gate: { base: '#ae7cff', panel: '#ff70a6', warning: '#ffd166', emissive: '#5c1d44', signEmissive: '#5c3600' },
  },
  natural: {
    track: { base: '#334155', mid: '#64748b', accent: '#fef3c7', secondary: '#064e3b', line: '#f59e0b', pattern: 'stone-veins', roughness: 0.48, metalness: 0.08, clearcoat: 0.35 },
    ground: { base: '#2f2418', mid: '#5a3f2b', accent: '#a16207', secondary: '#064e3b', pattern: 'earth-grain', roughness: 0.88, metalness: 0.01 },
    rail: { base: '#1f2937', mid: '#374151', accent: '#10b981', secondary: '#f59e0b', pattern: 'weathered-rail', roughness: 0.42, metalness: 0.18, clearcoat: 0.25 },
    gate: { base: '#1f2937', panel: '#10b981', warning: '#f59e0b', emissive: '#053b2a', signEmissive: '#3a2100' },
  },
  toyPark: TOY_PARK_WORLD_VISUAL_THEME_STYLE,
};

const MARBLE_MATERIAL_STYLES = {
  glass: { label: 'Glass', roughness: 0.12, metalness: 0.02, emissiveIntensity: 0.05 },
  neon: { label: 'Neon Glow', roughness: 0.18, metalness: 0.02, emissiveIntensity: 0.28 },
  metallic: { label: 'Metallic', roughness: 0.2, metalness: 0.42, emissiveIntensity: 0.06 },
  pearl: { label: 'Pearlescent', roughness: 0.16, metalness: 0.12, emissiveIntensity: 0.1 },
  candy: { label: 'Candy Gloss', roughness: 0.1, metalness: 0.03, emissiveIntensity: 0.08 },
  opal: { label: 'Opal', roughness: 0.22, metalness: 0.18, emissiveIntensity: 0.16 },
  chrome: { label: 'Chrome', roughness: 0.14, metalness: 0.68, emissiveIntensity: 0.08 },
  stone: { label: 'Polished Stone', roughness: 0.36, metalness: 0.06, emissiveIntensity: 0.03 },
};

const MARBLE_PATTERN_STYLES = [
  { key: 'rings', label: 'Orbit Rings' },
  { key: 'spiral', label: 'Galaxy Swirl' },
  { key: 'ripple', label: 'Tidal Waves' },
  { key: 'speckle', label: 'Pearl Speckles' },
  { key: 'comet', label: 'Comet Streaks' },
  { key: 'storm', label: 'Lightning Veins' },
  { key: 'split', label: 'Duel Split' },
  { key: 'triad', label: 'Triad Panels' },
  { key: 'chevron', label: 'Racing Arrows' },
  { key: 'circuit', label: 'Neon Circuit' },
  { key: 'flame', label: 'Fire Licks' },
  { key: 'marble-vein', label: 'Stone Veins' },
  { key: 'checker', label: 'Race Checker' },
  { key: 'starfield', label: 'Star Glitter' },
];

const MARBLE_SIZE_STYLES = [
  { key: 'XS', label: 'Tiny', radius: 0.41 },
  { key: 'S', label: 'Small', radius: 0.435 },
  { key: 'M', label: 'Medium', radius: 0.46 },
  { key: 'L', label: 'Large', radius: 0.485 },
  { key: 'XL', label: 'Heavy', radius: 0.51 },
];

class MarbleRace {
  constructor() {
    this.container = document.querySelector('#canvas-container');
    this.clock = new THREE.Clock();
    this.marbleData = [];
    this.trackBodies = [];
    this.obstacleMeshes = [];
    this.obstacleBodies = [];
    this.finishers = [];
    this.state = 'idle';
    this.cameraMode = 'default';
    this.selectedIndex = 0;
    this.cameraTargetSmoothed = new THREE.Vector3();
    this.leadPackDistanceSmoothed = 0;
    this.leadPackInitialized = false;
    this.initialCameraRotationApplied = false;
    this.leadBattleInitialized = false;
    this.leadBattleState = null;
    this.toyParkBroadcastCameraState = null;
    this.toyParkBroadcastMoment = null;
    this.defaultCameraPhaseUntil = 0;
    this.defaultCameraFocusId = null;
    this.firstFinishTime = 0;
    this.firstFinishRealTimeMs = 0;
    this.elapsed = 0;
    this.countdownDuration = 3;
    this.countdownRemaining = 0;
    this.countdownActive = false;
    this.countdownLastAnnouncedSecond = null;
    this.startHookVisible = false;
    this.startHookValue = '';
    this.startHookIsGo = false;
    this.startHookShownAt = 0;
    this.startHookLastSummary = null;
    this.audioContext = null;
    this.audioMasterGain = null;
    this.audioMasterGainConnected = false;
    this.audioUnlocked = false;
    this.bgmGain = null;
    this.bgmNodes = [];
    this.bgmTimer = null;
    this.bgmMode = 'idle';
    this.bgmStepIndex = 0;
    this.bgmGainConnected = false;
    this.bgmEnabled = true;
    this.commentaryEnabled = true;
    this.commentaryVoiceEnabled = true;
    this.commentaryHistory = [];
    this.activeCommentary = null;
    this.lastCommentaryAt = -Infinity;
    this.lastObstacleCommentaryAt = -Infinity;
    this.lastFinishCommentaryAt = -Infinity;
    this.lastCommentaryVoiceLine = null;
    this.commentaryVoiceQueue = [];
    this.commentaryVoiceSpeaking = false;
    this.commentaryVoicePreparing = false;
    this.commentaryVoiceCurrentLine = null;
    this.commentaryVoiceStartedAt = 0;
    this.commentaryVoiceLastError = null;
    this.ttsPitch = 1;
    this.lastObstacleSfxAt = -Infinity;
    this.trackLength = 190;
    this.trackWidth = 16;
    this.trackWidthProfile = null;
    this.seed = '';
    this.trackPresetKey = 'medium';
    this.widthPresetKey = 'normal';
    this.widthPreset = WIDTH_PRESETS[this.widthPresetKey];
    this.speedIndex = 1;
    this.speedPreset = SPEED_PRESETS[this.speedIndex];
    this.physicsMechanicKey = DEFAULT_PHYSICS_MECHANIC_KEY;
    this.physicsMechanic = PHYSICS_MECHANIC_PROFILES[this.physicsMechanicKey];
    this.physicsMechanicSource = 'default-render-safe';
    this.physicsMechanicAppliedAt = null;
    this.obstacleIndex = 0;
    this.obstaclePreset = OBSTACLE_PRESETS[this.obstacleIndex];
    this.obstacleDistributionMode = 'random';
    this.obstacleDistributionSummary = null;
    this.curveStyleKey = 'mixed';
    this.curveStyle = CURVE_PRESETS[this.curveStyleKey];
    this.visualThemeKey = DEFAULT_MARBLE_VISUAL_THEME_KEY;
    this.visualTheme = MARBLE_VISUAL_THEMES[this.visualThemeKey];
    this.rng = Math.random;
    this.physicsSteps = 0;
    this.lastLeaderboardUpdate = 0;
    this.lastUIUpdate = 0;
    this.lastDebugUpdate = 0;
    this.lastRecordingStatusUpdate = 0;
    this.lastUIState = '';
    this.uiWriteCache = new Map();
    this.lastLeaderboardSignature = '';
    this.uiThrottleCounters = {
      textWrites: 0,
      skippedTextWrites: 0,
      leaderboardRenders: 0,
      leaderboardSkippedBySignature: 0,
      leaderboardSignature: '',
      debugPayloads: 0,
      debugConsoleWrites: 0,
      labelRankingRefreshes: 0,
      labelTransformPasses: 0,
      labelPositionWrites: 0,
      labelScaleTargetRefreshes: 0,
      labelScaleWrites: 0,
      labelHiddenSkips: 0,
      labelVisibilityWrites: 0,
      profileKey: 'live',
    };
    this.cachedRanking = null;
    this.cachedRankingAt = 0;
    this.cachedLeaderId = null;
    this.performanceProfile = {
      ...PERFORMANCE_TUNING,
      mode: PERFORMANCE_TUNING.label,
      guardRailInterval: PERFORMANCE_TUNING.guardRailInterval,
      guardRailOverlap: PERFORMANCE_TUNING.guardRailOverlap,
      maxPhysicalRailBodies: PERFORMANCE_TUNING.physicalRailBodyBudget,
      uiUpdateMs: PERFORMANCE_TUNING.uiUpdateMs,
      debugUpdateMs: PERFORMANCE_TUNING.debugUpdateMs,
      leaderboardUpdateMs: PERFORMANCE_TUNING.leaderboardUpdateMs,
      rankingCacheMs: PERFORMANCE_TUNING.rankingCacheMs,
      nameLabelRankUpdateMs: PERFORMANCE_TUNING.nameLabelRankUpdateMs,
      nameLabelScaleTargetUpdateMs: PERFORMANCE_TUNING.nameLabelScaleTargetUpdateMs,
      nameLabelPositionWriteThresholdSq: PERFORMANCE_TUNING.nameLabelPositionWriteThresholdSq,
      nameLabelScaleWriteThreshold: PERFORMANCE_TUNING.nameLabelScaleWriteThreshold,
      uiThrottleProfile: 'live',
    };
    this.lastFps = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.frameProfiler = {
      windowStartedAt: performance.now(),
      frames: 0,
      frameMsTotal: 0,
      frameMsMax: 0,
      frameMsSamples: [],
      rafIntervalMsTotal: 0,
      rafIntervalMsMax: 0,
      rafIntervalMsSamples: [],
      lastFrameStartedAt: null,
      secondWindowStartedAt: performance.now(),
      uniqueFramesThisSecond: 0,
      uniqueFrameSecondHistory: [],
      lastUniqueFrameSecondSummary: null,
      obstacleMsTotal: 0,
      driveMsTotal: 0,
      physicsMsTotal: 0,
      syncMsTotal: 0,
      uiMsTotal: 0,
      renderMsTotal: 0,
      overlayMsTotal: 0,
      lastSummary: null,
    };
    this.lastNameLabelUpdate = 0;
    this.lastNameLabelRankingUpdate = 0;
    this.lastNameLabelScaleTargetUpdate = 0;
    this.cachedNameLabelIds = new Set();
    this.cachedNameLabelIdsKey = '';
    this.labelScratchPosition = new THREE.Vector3();
    this.visibleLabelCount = 0;
    this.viewerOverlayCanvas = null;
    this.viewerOverlayContext = null;
    this.lastViewerOverlaySummary = null;
    this.webViewerOverlayCanvas = null;
    this.webViewerOverlayContext = null;
    this.lastWebViewerOverlaySummary = null;
    this.toyParkStandingSnapshot = null;
    this.toyParkStandingLastRefreshAt = 0;
    this.toyParkStandingPreviousRows = [];
    this.videoCanvasLayoutKey = 'horizontal';
    this.videoCanvasLayout = { ...VIDEO_CANVAS_LAYOUTS.horizontal };
    this.videoCompositeCanvas = null;
    this.videoCompositeContext = null;
    this.lastVideoCompositeSummary = null;
    this.pathPoints = [];
    this.trackSamples = [];
    this.branchSegments = [];
    this.startCatcher = null;
    this.finishCatcher = null;
    this.finishRankingContainer = null;
    this.startGate = null;
    this.finishSpinner = null;
    this.obstacleTypeCounts = Object.fromEntries(PINBALL_OBSTACLE_TYPES.map((type) => [type, 0]));
    this.obstacleCategoryCounts = Object.fromEntries(Object.keys(OBSTACLE_CATEGORIES).map((category) => [category, 0]));
    this.pinballObstacleTypes = PINBALL_OBSTACLE_TYPES;
    this.pinballObstacleCategories = OBSTACLE_CATEGORIES;
    this.pinballObstacleTypeMetadata = PINBALL_OBSTACLE_TYPE_METADATA;
    this.pinballObstacleCatalog = PINBALL_OBSTACLE_CATALOG;
    this.enabledObstacleTypes = new Set();
    this.pinballObstacles = [];
    this.showGuidePoints = false;
    this.guidePointGroup = new THREE.Group();
    this.guidePointGroup.name = 'guide-point-marker-group';
    this.guidePointGroup.visible = false;
    this.showPhysicsHitboxes = false;
    this.physicsHitboxGroup = new THREE.Group();
    this.physicsHitboxGroup.name = 'physics-hitbox-debug-group';
    this.physicsHitboxGroup.visible = false;
    this.scene?.add?.(this.guidePointGroup);
    this.scene?.add?.(this.physicsHitboxGroup);
    this.pinballInteractions = Object.fromEntries(PINBALL_OBSTACLE_TYPES.map((type) => [type, 0]));
    this.toyParkSoftGuidePhysics = this.physicsMechanicKey === 'toyPark' ? (this.physicsMechanic?.softGuidePhysics || TOY_PARK_SOFT_GUIDE_PHYSICS) : null;
    this.toyParkSoftGuideForceCount = 0;
    this.trackStats = { ribbonMeshes: 0, visibleDecks: 0, physicsDecks: 0, railTubes: 0, branchJoinDecks: 0, physicalRailBodies: 0, smoothRailJoinBodies: 0, optimizedRailBodies: 0, broadcastStageMarkers: 0 };
    if (this.physicsMechanicKey === 'toyPark') {
      this.trackStats.toyParkPhysicsMode = this.toyParkSoftGuidePhysics?.mode || null;
      this.trackStats.toyParkHardSplineLock = Boolean(this.toyParkSoftGuidePhysics?.hardSplineLock);
      this.trackStats.toyParkCollisionPreserved = Boolean(this.toyParkSoftGuidePhysics?.collisionPreserved);
      this.trackStats.toyParkGuideAssist = this.toyParkSoftGuidePhysics || null;
    }
    this.stuckResetPenalty = STUCK_RESET.penaltyDistance;
    this.stuckResetDelay = this.getStallEliminationDelaySeconds();
    this.stallElimination = { ...STALL_ELIMINATION, delaySeconds: this.stuckResetDelay };
    this.fallRespawnDelay = 2;
    this.stuckResetCount = 0;
    this.stallEliminationCount = 0;
    this.defeatedMarbles = [];
    this.midTrackSpeedAssist = MID_TRACK_SPEED_ASSIST;
    this.finalApproachAssist = FINAL_APPROACH_ASSIST;
    this.minForwardSpeedAssist = MIN_FORWARD_SPEED_ASSIST;
    this.midTrackSpeedAssistCount = 0;
    this.finalApproachAssistCount = 0;
    this.minForwardSpeedAssistCount = 0;
    this.fallPenaltySeconds = FALL_TIME_PENALTY_SECONDS;
    this.fallPenaltyCount = 0;
    this.totalFallPenaltySeconds = 0;
    this.hairpinTurnCount = 0;
    this.hairpinTurns = [];
    this.rightAngleTurnCount = 0;
    this.rightAngleTurns = [];
    this.trackPieceSystem = 'modular-pieces';
    this.trackPieces = [];
    this.slopeDrive = { ...SLOPE_DRIVE, ...((this.physicsMechanic || PHYSICS_MECHANIC_PROFILES[DEFAULT_PHYSICS_MECHANIC_KEY]).slopeDriveOverrides || {}) };
    this.toyParkSoftGuidePhysics = this.physicsMechanicKey === 'toyPark' ? (this.physicsMechanic?.softGuidePhysics || TOY_PARK_SOFT_GUIDE_PHYSICS) : null;
    this.directionStabilityAssist = DIRECTION_STABILITY_ASSIST;
    this.landingReboundAbsorber = LANDING_REBOUND_ABSORBER;
    this.airborneGuidePolicy = AIRBORNE_GUIDE_POLICY;
    this.guidePointPolicy = GUIDE_POINT_POLICY;
    this.directionStabilityAssistCount = 0;
    this.landingReboundAbsorberCount = 0;
    this.slopeDriveForceCount = 0;
    this.forwardAccelerationForceCount = 0;
    this.forwardAccelerationDirectionCorrections = 0;
    this.groundY = -3;
    this.minTrackY = 0;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordingStartedAt = 0;
    this.recordingSource = null;
    this.recordingCategory = null;
    this.recordingSettings = null;
    this.lastRecordingRequest = null;
    this.recordingAudioDestination = null;
    this.recordingAudioDestinationConnected = false;
    this.recordingMixSourceNodes = [];
    this.recordingVoiceBridgeStream = null;
    this.recordingVoiceBridgeLastError = null;
    this.localTtsBridge = {
      enabled: true,
      available: null,
      status: 'unknown',
      engine: null,
      voice: 'Alex',
      pitch: 1,
      lastUrl: null,
      lastLine: null,
      lastError: null,
      audioElement: null,
      sourceNode: null,
      cachedAudio: new Map(),
    };
    this.commentaryBrowserVoiceName = '';
    this.countdownStarterLines = [
      'The field is set',
      'Ready for the rush',
      'All eyes on the gate',
      'The lanes are loaded',
      'Brace for the break',
      'Here comes the launch',
    ];
    this.countdownVoiceLine = this.countdownStarterLines[0];
    this.countdownVoiceWarmupPromise = null;
    this.countdownVoiceWarmupUrl = null;
    this.countdownVoicePlayStartedAt = 0;
    this.autoCupRecording = {
      active: false,
      mode: 'cup',
      label: 'Cup Mode',
      phase: 'idle',
      startedAt: 0,
      currentStage: null,
      racesCompleted: 0,
      nextActionAt: null,
      pendingTimer: null,
      nextGateAfterRaceSeconds: CUP_VIDEO_TIMING.nextGateAfterRaceSeconds,
      ceremonyNarrationDelaySeconds: CUP_CEREMONY_POST_NARRATION_DELAY_SECONDS,
      waitingForNarrationLine: null,
      waitingForNarrationStartedAt: null,
      narrationCompletedAt: null,
      stopAfterFinalSeconds: CUP_VIDEO_TIMING.finalPodiumSeconds + CUP_VIDEO_TIMING.endCardSeconds + CUP_VIDEO_TIMING.recordingStopGraceSeconds,
      nextRaceDelaySeconds: CUP_VIDEO_TIMING.nextRaceDelaySeconds,
      gateDelaySeconds: CUP_VIDEO_TIMING.introSeconds,
      lastError: null,
    };
    this.continuousRecording = {
      active: false,
      mode: 'continuous',
      label: 'Multiple',
      phase: 'idle',
      startedAt: 0,
      racesCompleted: 0,
      pendingTimer: null,
      nextActionAt: null,
      nextRaceDelaySeconds: MULTIPLE_RECORDING_CEREMONY_HOLD_SECONDS,
      gateDelaySeconds: MULTIPLE_RECORDING_NEXT_GATE_SECONDS,
      finalStopDelaySeconds: MULTIPLE_RECORDING_FINAL_STOP_SECONDS,
      totalRaces: MULTIPLE_RECORDING_DEFAULT_RACES,
      lastGeneratedTrackAfterRace: 0,
      lastError: null,
    };
    this.singleRecording = {
      active: false,
      mode: 'single',
      label: 'Single',
      phase: 'idle',
      startedAt: 0,
      pendingTimer: null,
      nextActionAt: null,
      gateDelaySeconds: RECORDING_GATE_DELAY_SECONDS,
      startedCountdownAt: null,
      finalStopDelaySeconds: SINGLE_RECORDING_FINAL_STOP_SECONDS,
      lastError: null,
    };
    this.leftUICollapsed = false;
    this.rightUICollapsed = false;
    this.recordingUIPresentation = {
      active: false,
      category: null,
      restoreLeftCollapsed: null,
      preserveRightUI: true,
      restoreToggleVisibility: true,
      instantHideLeft: false,
    };
    this.enableAllCameraMouseOrbit = true;
    this.cameraAutoDistance = 24;
    this.trackMaterials = ['dark illustrated pinball playfield texture', 'neon rubber rail texture', 'MeshPhysicalMaterial clearcoat obstacle plastics', 'chrome bumper rings'];
    this.railSpring = RAIL_REBOUND;
    this.railGuidePolicy = {
      allRailHitCenterGuidesDisabled: true,
      passiveRailCollisionRemains: true,
      disabledAssists: ['directionStabilityAssist', 'railEscapeAssist', 'railMomentumAssist'],
      label: 'rail impacts use Cannon contact only; no automatic return-to-center guide, inward correction, lateral damping, or tangent rescue after hitting rails',
    };
    this.railMomentumAssist = { enabled: false, minForwardSpeed: 2.8, impulse: 0, lateralDamping: 1, railZone: 1.35, disabledReason: 'all rail-hit center guides disabled; passive rail collision only' };
    this.railEscapeAssist = {
      enabled: false,
      railZone: 1.85,
      inwardForceScale: 0,
      lateralDamping: 1,
      maxOutwardSpeed: Infinity,
      tangentAssistRatio: 0,
      label: 'disabled: non-obstacle artificial force removed',
    };
    this.finishDirectionAssist = {
      enabled: false,
      lookAhead: 4.5,
      backwardDamping: 1,
      lateralDamping: 1,
      correctionForceScale: 0,
      impulseForwardBias: 0,
      maxImpulse: Infinity,
      disabledReason: 'all rail-hit center guides disabled; passive rail collision only',
    };
    this.finishDirectionCorrectionCount = 0;
    this.railEscapeAssistCount = 0;
    this.catchupAssistEnabled = CATCHUP_ASSIST.enabledByDefault;
    this.catchupMaxSpeed = this.speedPreset.maxSpeed;
    this.broadcastEvents = [];
    this.lastBroadcastAt = -Infinity;
    this.lastBroadcastLeaderId = null;
    this.lastCloseBattleAt = -Infinity;
    this.lastNeckAndNeckAt = -Infinity;
    this.lastOvertakeAt = -Infinity;
    this.lastProgressCommentaryAt = -Infinity;
    this.lastSpeedCommentaryAt = -Infinity;
    this.lastProgressMilestone = 0;
    this.lastPaceBand = null;
    this.previousTopFiveIds = [];
    this.topFiveSnapshot = [];
    this.toyParkBroadcastMoment = null;
    this.toyParkBroadcastCameraState = null;
    this.lastFinalStretchAt = -Infinity;
    this.activeCaption = null;
    this.replayHighlight = { active: false, stage: null, events: [], startedAt: 0, startedAtMs: 0, duration: 0, playback: null };
    this.raceHistoryBuffer = [];
    this.lastRaceHistorySampleAt = -Infinity;
    this.replayOriginalSnapshots = null;
    this.spectacleEffects = [];
    this.confettiPieces = [];
    this.effectBudget = this.createEffectBudget();
    this.effectBudgetCounters = {
      admitted: 0,
      denied: 0,
      deniedByReason: {},
      admittedByKind: {},
      confettiAdmitted: 0,
      confettiDenied: 0,
      removedOldest: 0,
      peakEffects: 0,
      peakMeshes: 0,
      peakConfetti: 0,
      lastDeniedReason: null,
    };
    this.finishSlowMotion = {
      active: false,
      triggered: false,
      startElapsed: 0,
      timeScale: 1,
      triggerWinner: null,
      triggerRank: null,
      triggeredAt: null,
      triggerReason: null,
      preFinishDistance: null,
      startedAtMs: 0,
      endedAt: null,
    };
    this.showcaseStats = null;
    this.podiumCeremony = { active: false, startedAt: 0, elapsedSeconds: 0, lastConfettiAt: -Infinity, confettiBurstCount: 0, confettiComplete: false, medalists: [], spotlightPhase: 0 };
    this.cupMode = {
      active: false,
      status: 'idle',
      size: 16,
      stageIndex: 0,
      stages: ['quarter-final', 'semi-final', 'final'],
      entrants: [],
      currentEntrants: [],
      results: [],
      lastQualified: [],
      champion: null,
      podium: [],
    };
    this.survivorLeague = {
      active: false,
      status: 'idle',
      fieldSize: SURVIVOR_LEAGUE.fieldSize,
      cycleSize: SURVIVOR_LEAGUE.cycleSize,
      keepCount: SURVIVOR_LEAGUE.keepCount,
      raceNumber: 0,
      cycleRaceNumber: 0,
      generation: 1,
      roster: [],
      history: [],
      standings: {},
      lastSurvivors: [],
      lastReplaced: [],
      spotlight: null,
      spotlightTimer: null,
      spotlightStartedAt: 0,
      lastCanvasSurvivorSpotlightSummary: null,
    };
    this.ui = {
      leftHud: document.querySelector('#left-hud'),
      rightHud: document.querySelector('#right-hud'),
      uiToggle: document.querySelector('#ui-toggle-btn'),
      rightUiToggle: document.querySelector('#right-ui-toggle-btn'),
      record: document.querySelector('#record-btn'),
      continuousRecord: document.querySelector('#continuous-record-btn'),
      multipleRaceCount: document.querySelector('#multiple-race-count-input'),
      autoCupRecord: document.querySelector('#auto-cup-record-btn'),
      recordStatus: document.querySelector('#record-status'),
      bgmToggle: document.querySelector('#bgm-toggle'),
      commentaryToggle: document.querySelector('#commentary-toggle'),
      commentaryVoiceToggle: document.querySelector('#commentary-voice-toggle'),
      ttsVoiceSelect: document.querySelector('#tts-voice-select'),
      ttsPitchSlider: document.querySelector('#tts-pitch-slider'),
      ttsPitchLabel: document.querySelector('#tts-pitch-label'),
      testTts: document.querySelector('#test-tts-btn'),
      ttsTestStatus: document.querySelector('#tts-test-status'),
      controlsPanel: document.querySelector('#controls-panel'),
      controlsToggle: document.querySelector('#controls-toggle-btn'),
      cameraPanel: document.querySelector('#camera-panel'),
      cameraToggle: document.querySelector('#camera-toggle-btn'),
      obstacleTypesPanel: document.querySelector('#obstacle-types-panel'),
      obstacleTypesToggle: document.querySelector('#obstacle-types-toggle-btn'),
      obstacleTypeToggles: Array.from(document.querySelectorAll('[data-obstacle-type]')),
      debugPanel: document.querySelector('#debug-panel'),
      debugToggle: document.querySelector('#debug-toggle-btn'),
      debugConsole: document.querySelector('#debug-console'),
      debugConsoleCopy: document.querySelector('#debug-copy-btn'),
      debugCopyStatus: document.querySelector('#debug-copy-status'),
      trackCodeOutput: document.querySelector('#track-code-output'),
      copyTrackCode: document.querySelector('#copy-track-code-btn'),
      trackCodeStatus: document.querySelector('#track-code-status'),
      trackCodeImport: document.querySelector('#track-code-import'),
      importTrackCode: document.querySelector('#import-track-code-btn'),
      trackCodeImportStatus: document.querySelector('#track-code-import-status'),
      count: document.querySelector('#marble-count'),
      raceMode: document.querySelector('#race-mode-select'),
      cupSize: document.querySelector('#cup-size-select'),
      cupName: document.querySelector('#cup-name-input'),
      seed: document.querySelector('#seed-input'),
      lengthSelect: document.querySelector('#length-select'),
      customLength: document.querySelector('#custom-length-input'),
      width: document.querySelector('#width-slider'),
      widthLabel: document.querySelector('#width-label'),
      obstacle: document.querySelector('#obstacle-slider'),
      obstacleLabel: document.querySelector('#obstacle-label'),
      obstacleDistribution: document.querySelector('#obstacle-distribution-select'),
      showGuidePointsToggle: document.querySelector('#show-guide-points-toggle'),
      catchupToggle: document.querySelector('#catchup-toggle'),
      catchupLabel: document.querySelector('#catchup-label'),
      curveSelect: document.querySelector('#curve-select'),
      visualTheme: document.querySelector('#visual-theme-select'),
      raceThemeOverlay: document.querySelector('#race-theme-overlay'),
      raceThemeOverlayOptions: document.querySelector('#race-theme-overlay-options'),
      raceThemeOverlayLabel: document.querySelector('#race-theme-overlay-label'),
      raceThemeOverlayNote: document.querySelector('#race-theme-overlay-note'),
      speed: document.querySelector('#speed-slider'),
      speedLabel: document.querySelector('#speed-label'),
      guideBias: document.querySelector('#guide-bias-slider'),
      guideBiasLabel: document.querySelector('#guide-bias-label'),
      start: document.querySelector('#start-btn'),
      regen: document.querySelector('#regen-btn'),
      pause: document.querySelector('#pause-btn'),
      select: document.querySelector('#marble-select'),
      leaderboard: document.querySelector('#leaderboard'),
      state: document.querySelector('#race-state'),
      elapsed: document.querySelector('#elapsed'),
      length: document.querySelector('#track-length'),
      fpsStat: document.querySelector('#fps-stat'),
      fps: document.querySelector('#fps'),
      winner: document.querySelector('#winner-banner'),
      caption: document.querySelector('#broadcast-caption'),
      captionTitle: document.querySelector('#caption-title'),
      captionDetail: document.querySelector('#caption-detail'),
      commentaryCaption: document.querySelector('#commentary-caption'),
      commentaryLine: document.querySelector('#commentary-line'),
      countdown: document.querySelector('#countdown-overlay'),
      matchCard: document.querySelector('#match-card'),
      survivorSpotlight: document.querySelector('#survivor-spotlight'),
      replayHighlight: document.querySelector('#replay-highlight-overlay'),
      finalShowcase: document.querySelector('#final-showcase'),
    };

    this.leftUICollapsed = false;
    this.applyLeftUIState();
    this.applyRightUIState();
    this.setTtsPitch(this.ui.ttsPitchSlider?.value || this.ttsPitch || 1, { resetQueue: false, updateStatus: false });
    this.initTtsVoiceSelector();
    this.buildObstacleTypeToggles();
    this.applyInitialPreviewParams();
    if (this.toyParkPreviewEndpoint) {
      this.leftUICollapsed = true;
      this.applyLeftUIState();
    }
    this.buildRaceThemeOverlay();
    this.initThree();
    this.initPhysics();
    this.applyPhysicsMechanic(this.physicsMechanicKey, { source: this.physicsMechanicSource || 'default-render-safe' });
    this.bindEvents();
    this.newRace({ regenerateTrack: true });
    this.animate();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x081020);
    this.scene.fog = new THREE.Fog(0x081020, 90, 380);
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1400);
    this.camera.position.set(0, 30, 48);
    this.renderer = new THREE.WebGLRenderer({
      antialias: PERFORMANCE_TUNING.antialias,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: PERFORMANCE_TUNING.preserveDrawingBuffer,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PERFORMANCE_TUNING.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = PERFORMANCE_TUNING.shadows;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.initViewerCanvasOverlay();
    this.initWebViewerCanvasOverlay();
    this.scene.add(this.guidePointGroup);
    this.scene.add(this.physicsHitboxGroup);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = true;
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 340;
    this.controls.target.set(0, 0, -35);
    this.scene.add(new THREE.HemisphereLight(0xcee8ff, 0x17200d, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-40, 88, 54);
    sun.castShadow = PERFORMANCE_TUNING.shadows;
    sun.shadow.mapSize.set(PERFORMANCE_TUNING.shadowMapSize, PERFORMANCE_TUNING.shadowMapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 320;
    sun.shadow.camera.left = -130;
    sun.shadow.camera.right = 130;
    sun.shadow.camera.top = 130;
    sun.shadow.camera.bottom = -130;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x88ccff, 1.1);
    rim.position.set(58, 46, -120);
    this.scene.add(rim);
  }

  initVideoCompositeCanvas(layoutKey = 'horizontal') {
    const layout = VIDEO_CANVAS_LAYOUTS[layoutKey] || VIDEO_CANVAS_LAYOUTS.horizontal;
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    canvas.dataset.videoCanvasLayout = layout.key;
    const ctx = canvas.getContext('2d', { alpha: false });
    this.videoCanvasLayoutKey = layout.key;
    this.videoCanvasLayout = { ...layout };
    this.videoCompositeCanvas = canvas;
    this.videoCompositeContext = ctx;
    this.lastVideoCompositeSummary = null;
    this.syncViewerOverlayCanvasToVideoLayout();
    return canvas;
  }

  syncViewerOverlayCanvasToVideoLayout() {
    if (!this.viewerOverlayCanvas) return null;
    const layout = this.videoCanvasLayout || VIDEO_CANVAS_LAYOUTS.horizontal;
    const width = Math.max(1, Number(layout.width) || VIDEO_CANVAS_LAYOUTS.horizontal.width);
    const height = Math.max(1, Number(layout.height) || VIDEO_CANVAS_LAYOUTS.horizontal.height);
    if (this.viewerOverlayCanvas.width !== width) this.viewerOverlayCanvas.width = width;
    if (this.viewerOverlayCanvas.height !== height) this.viewerOverlayCanvas.height = height;
    this.viewerOverlayCanvas.dataset.videoCanvasLayout = layout.key || 'horizontal';
    return { width, height, layout: layout.key || 'horizontal' };
  }

  setVideoCanvasLayout(layoutKey = 'horizontal') {
    const requested = String(layoutKey || 'horizontal').toLowerCase();
    const key = VIDEO_CANVAS_LAYOUTS[requested] ? requested : 'horizontal';
    if (!this.videoCompositeCanvas || this.videoCanvasLayoutKey !== key) {
      this.initVideoCompositeCanvas(key);
    }
    return this.getVideoCompositeCanvasInfo();
  }

  getVideoCompositeCanvasInfo() {
    return {
      enabled: Boolean(this.videoCompositeCanvas),
      layout: this.videoCanvasLayoutKey || 'horizontal',
      label: this.videoCanvasLayout?.label || VIDEO_CANVAS_LAYOUTS.horizontal.label,
      width: this.videoCompositeCanvas?.width || this.videoCanvasLayout?.width || 1920,
      height: this.videoCompositeCanvas?.height || this.videoCanvasLayout?.height || 1080,
      fit: this.videoCanvasLayout?.fit || 'cover',
      overlay: this.lastViewerOverlaySummary || null,
      lastComposite: this.lastVideoCompositeSummary || null,
    };
  }

  initViewerCanvasOverlay() {
    const canvas = document.createElement('canvas');
    const layout = this.videoCanvasLayout || VIDEO_CANVAS_LAYOUTS.horizontal;
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    this.viewerOverlayCanvas = canvas;
    this.viewerOverlayContext = ctx;
    this.initVideoCompositeCanvas(this.videoCanvasLayoutKey || 'horizontal');
  }

  initWebViewerCanvasOverlay() {
    const canvas = document.createElement('canvas');
    canvas.className = 'web-viewer-overlay-canvas';
    canvas.dataset.webViewerOverlay = 'true';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    this.webViewerOverlayCanvas = canvas;
    this.webViewerOverlayContext = ctx;
    this.container?.appendChild(canvas);
    this.resizeWebViewerCanvasOverlay();
  }

  resizeWebViewerCanvasOverlay() {
    if (!this.webViewerOverlayCanvas) return null;
    const width = Math.max(1, Math.round(window.innerWidth || this.container?.clientWidth || 1920));
    const height = Math.max(1, Math.round(window.innerHeight || this.container?.clientHeight || 1080));
    if (this.webViewerOverlayCanvas.width !== width) this.webViewerOverlayCanvas.width = width;
    if (this.webViewerOverlayCanvas.height !== height) this.webViewerOverlayCanvas.height = height;
    return { width, height };
  }

  getWebViewerOverlayInfo() {
    return {
      enabled: Boolean(this.webViewerOverlayCanvas),
      separateFromRecordingOverlay: this.webViewerOverlayCanvas !== this.viewerOverlayCanvas,
      separateFromVideoComposite: this.webViewerOverlayCanvas !== this.videoCompositeCanvas,
      canvasSize: this.webViewerOverlayCanvas ? `${this.webViewerOverlayCanvas.width}x${this.webViewerOverlayCanvas.height}` : null,
      cssClass: this.webViewerOverlayCanvas?.className || null,
      lastOverlay: this.lastWebViewerOverlaySummary || null,
    };
  }

  getToyParkStandingRankingSnapshot(rankingSource = [], maxRows = rankingSource.length) {
    const now = performance.now();
    const refreshMs = CANVAS_VIEWER_OVERLAY.toyParkStandingRefreshMs || 1000;
    const rows = rankingSource.slice(0, maxRows).map((data) => ({ ...data }));
    const rowKey = rows.map((data) => data.id).join('|');
    const rosterKey = rows.map((data) => data.id).sort((a, b) => a - b).join('|');
    const oldRows = this.toyParkStandingSnapshot?.rows || [];
    const oldRosterKey = oldRows.map((data) => data.id).sort((a, b) => a - b).join('|');
    const needsRefresh = !this.toyParkStandingSnapshot
      || rosterKey !== oldRosterKey
      || now - (this.toyParkStandingLastRefreshAt || 0) >= refreshMs;
    if (needsRefresh) {
      this.toyParkStandingPreviousRows = oldRows.map((data) => ({ ...data }));
      this.toyParkStandingSnapshot = {
        rows,
        refreshedAt: now,
        refreshMs,
        rowKey,
      };
      this.toyParkStandingLastRefreshAt = now;
    }
    const snapshotRows = this.toyParkStandingSnapshot?.rows || rows;
    const previousIndexById = new Map((this.toyParkStandingPreviousRows || []).map((data, index) => [data.id, index]));
    const animationMs = CANVAS_VIEWER_OVERLAY.toyParkStandingSwapAnimationMs || 520;
    const elapsedMs = Math.max(0, now - (this.toyParkStandingSnapshot?.refreshedAt || now));
    const rawT = animationMs > 0 ? clamp(elapsedMs / animationMs, 0, 1) : 1;
    const easedT = 1 - Math.pow(1 - rawT, 3);
    const moves = snapshotRows.map((data, index) => {
      const fromIndex = previousIndexById.has(data.id) ? previousIndexById.get(data.id) : index;
      return {
        id: data.id,
        fromIndex,
        toIndex: index,
        delta: fromIndex - index,
        changed: fromIndex !== index,
        progress: easedT,
      };
    });
    return {
      rows: snapshotRows,
      refreshMs,
      animationMs,
      elapsedMs,
      progress: easedT,
      active: moves.some((move) => move.changed) && rawT < 1,
      moves,
      lastRefreshAt: this.toyParkStandingSnapshot?.refreshedAt || now,
    };
  }

  drawViewerRoundedRect(ctx, x, y, w, h, r = 18) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  drawViewerText(ctx, text, x, y, {
    font = '700 34px Arial Black, Impact, system-ui, sans-serif',
    fill = '#ffffff',
    stroke = 'rgba(0,0,0,0.8)',
    strokeWidth = 6,
    align = 'left',
    maxWidth = null,
  } = {}) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = stroke;
      ctx.strokeText(String(text || ''), x, y, maxWidth || undefined);
    }
    ctx.fillStyle = fill;
    ctx.fillText(String(text || ''), x, y, maxWidth || undefined);
    ctx.restore();
  }

  isToyParkViewerOverlayActive() {
    return this.physicsMechanicKey === 'toyPark'
      || this.visualThemeKey === 'toyPark'
      || this.trackStats?.theme === 'toy-park'
      || this.trackStats?.toyParkStartBoard?.enabled === true;
  }

  getToyParkOverlayTotalLaps() {
    // The current Toy Park course is one closed loop from start to finish. Keep this helper
    // separate so a future multi-lap mode can wire its configured lap count here.
    const candidates = [
      this.toyParkRaceLaps,
      this.trackStats?.toyParkTotalLaps,
      this.trackStats?.toyParkLapCount,
      this.trackStats?.raceLaps,
    ];
    const configured = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
    return Math.max(1, Math.round(Number(configured || 1)));
  }

  drawToyParkArcadeCta({ ctx, x = 0, y = 0, width = 420, height = 64, vertical = false } = {}) {
    const textStroke = '#17131f';
    const skew = Math.max(10, height * 0.18);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.beginPath();
    ctx.moveTo(x + skew, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width - skew, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, '#ff365f');
    gradient.addColorStop(0.62, '#ff7a2f');
    gradient.addColorStop(1, '#ffd43d');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = textStroke;
    ctx.lineWidth = vertical ? 4 : 5;
    ctx.stroke();

    const checkerW = vertical ? 36 : 48;
    const checkerH = vertical ? 22 : 28;
    const checkerX = x + width - checkerW - (vertical ? 10 : 14);
    const checkerY = y + (height - checkerH) / 2;
    ctx.save();
    this.drawViewerRoundedRect(ctx, checkerX, checkerY, checkerW, checkerH, 6);
    ctx.clip();
    const cell = Math.max(6, checkerH / 3);
    for (let yy = checkerY - cell; yy < checkerY + checkerH + cell; yy += cell) {
      for (let xx = checkerX - cell; xx < checkerX + checkerW + cell; xx += cell) {
        const odd = (Math.floor((xx - checkerX) / cell) + Math.floor((yy - checkerY) / cell)) % 2;
        ctx.fillStyle = odd ? textStroke : '#ffffff';
        ctx.fillRect(xx, yy, cell, cell);
      }
    }
    ctx.restore();

    this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.ctaPrimary, x + (vertical ? 18 : 24), y + height * 0.43, {
      font: vertical ? '900 19px Arial Black, Impact, sans-serif' : '900 28px Arial Black, Impact, sans-serif',
      fill: '#ffffff',
      stroke: textStroke,
      strokeWidth: vertical ? 4 : 6,
      maxWidth: width - checkerW - (vertical ? 38 : 56),
    });
    this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.channelHandle, x + (vertical ? 20 : 26), y + height * 0.76, {
      font: vertical ? '800 12px Arial Black, Impact, sans-serif' : '800 18px Arial Black, Impact, sans-serif',
      fill: '#fff6b0',
      stroke: textStroke,
      strokeWidth: vertical ? 3 : 4,
      maxWidth: width - checkerW - (vertical ? 42 : 62),
    });
    ctx.restore();
    return {
      style: 'toy-park-arcade-cta',
      x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), width: Number(width.toFixed(1)), height: Number(height.toFixed(1)),
      layout: vertical ? 'vertical' : 'horizontal',
    };
  }

  drawViewerLiveStandingPanel({ ctx, ranking = [], x = 0, y = 0, width = 390, rowHeight = 62, vertical = false, toyPark = false, standingAnimation = null } = {}) {
    const rows = ranking.length;
    if (toyPark) {
      // Toy Park currently runs as a single closed-course lap; keep the arcade standing
      // lap labels tied to the actual race format rather than the old 3-lap placeholder.
      const totalLaps = this.getToyParkOverlayTotalLaps?.() || 1;
      const leader = ranking[0] || this.getRanking({ force: false })[0] || null;
      const leaderProgress = clamp(leader?.progress || 0, 0, 1);
      const currentLap = Math.max(1, Math.min(totalLaps, Math.floor(leaderProgress * totalLaps) + 1));
      const raceNumber = this.cupMode?.active ? (this.cupMode.stageIndex || 0) + 1 : 1;
      const compactVertical = vertical && width <= 260;
      const headerH = compactVertical ? 60 : (vertical ? 108 : 114);
      const rankW = compactVertical ? 30 : (vertical ? 48 : 56);
      const rowH = compactVertical ? Math.max(30, rowHeight || 30) : (vertical ? 46 : 54);
      const gap = compactVertical ? 4 : (vertical ? 8 : 9);
      const avatar = compactVertical ? Math.min(24, Math.max(20, rowH - 8)) : (vertical ? 40 : 48);
      const rowX = x + rankW;
      const rowW = width - rankW;
      const boardHeight = headerH + rows * rowH + Math.max(0, rows - 1) * gap + 16;
      const colors = ['#45c95d', '#38c9ff', '#8ca5c8', '#f9a72e', '#7bb9ff', '#eef4ff', '#b8c8ee', '#ff982f', '#ffe04b', '#e7f5ff'];
      const textStroke = '#17131f';
      const drawChecker = (cx, cy, cw, ch) => {
        const cell = Math.max(7, ch / 4);
        ctx.save();
        this.drawViewerRoundedRect(ctx, cx, cy, cw, ch, 7);
        ctx.clip();
        for (let yy = cy - cell; yy < cy + ch + cell; yy += cell) {
          for (let xx = cx - cell; xx < cx + cw + cell; xx += cell) {
            const odd = (Math.floor((xx - cx) / cell) + Math.floor((yy - cy) / cell)) % 2;
            ctx.fillStyle = odd ? '#17131f' : '#ffffff';
            ctx.fillRect(xx, yy, cell, cell);
          }
        }
        ctx.restore();
      };
      const drawAvatar = (data, ax, ay, size, index) => {
        const color = `#${(data.color || 0xffffff).toString(16).padStart(6, '0')}`;
        ctx.save();
        this.drawViewerRoundedRect(ctx, ax, ay, size, size, 9);
        const gradient = ctx.createLinearGradient(ax, ay, ax + size, ay + size);
        gradient.addColorStop(0, '#ffd34f');
        gradient.addColorStop(0.45, color);
        gradient.addColorStop(1, index % 2 ? '#72e8ff' : '#ff79a1');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = textStroke;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax + size * 0.55, ay);
        ctx.lineTo(ax + size, ay);
        ctx.lineTo(ax + size, ay + size * 0.65);
        ctx.lineTo(ax + size * 0.72, ay + size);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.34)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ax + size * 0.5, ay + size * 0.48, size * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = textStroke;
        ctx.stroke();
        ctx.fillStyle = textStroke;
        ctx.beginPath();
        ctx.arc(ax + size * 0.41, ay + size * 0.43, size * 0.04, 0, Math.PI * 2);
        ctx.arc(ax + size * 0.59, ay + size * 0.43, size * 0.04, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax + size * 0.5, ay + size * 0.54, size * 0.10, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        const initial = String(data.name || 'M').slice(0, 1).toUpperCase();
        this.drawViewerText(ctx, initial, ax + size * 0.5, ay + size * 0.84, {
          font: `900 ${Math.round(size * 0.22)}px Arial Black, Impact, sans-serif`,
          fill: '#ffffff', stroke: textStroke, strokeWidth: compactVertical ? 1.5 : 2.5, align: 'center',
        });
        ctx.restore();
      };

      const noDropShadow = toyPark;
      ctx.save();
      ctx.shadowColor = noDropShadow ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.38)';
      ctx.shadowBlur = noDropShadow ? 0 : 12;
      ctx.shadowOffsetY = noDropShadow ? 0 : 6;
      const iconR = compactVertical ? 13 : (vertical ? 27 : 31);
      const iconX = x + rankW + 4;
      const iconY = y + 10;
      ctx.beginPath();
      ctx.arc(iconX + iconR, iconY + iconR, iconR, 0, Math.PI * 2);
      ctx.fillStyle = textStroke;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(iconX + iconR, iconY + iconR, iconR * 0.68, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd43d';
      ctx.fill();
      ctx.fillStyle = textStroke;
      ctx.beginPath();
      ctx.arc(iconX + iconR * 0.78, iconY + iconR * 0.87, iconR * 0.11, 0, Math.PI * 2);
      ctx.arc(iconX + iconR * 1.22, iconY + iconR * 0.87, iconR * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = textStroke;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(iconX + iconR, iconY + iconR * 1.08, iconR * 0.22, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();
      this.drawViewerText(ctx, `RACE ${raceNumber}`, iconX + iconR * 2 + (compactVertical ? 9 : 15), y + (compactVertical ? 22 : (vertical ? 36 : 39)), {
        font: compactVertical ? '900 14px Arial Black, Impact, sans-serif' : (vertical ? '900 27px Arial Black, Impact, sans-serif' : '900 32px Arial Black, Impact, sans-serif'),
        fill: '#ffd43d', stroke: textStroke, strokeWidth: compactVertical ? 2 : 7, maxWidth: width - rankW - (compactVertical ? 36 : 90),
      });
      this.drawViewerText(ctx, `LAP ${currentLap}/${totalLaps}`, iconX + iconR * 2 + (compactVertical ? 9 : 15), y + (compactVertical ? 49 : (vertical ? 74 : 84)), {
        font: compactVertical ? '900 19px Arial Black, Impact, sans-serif' : (vertical ? '900 38px Arial Black, Impact, sans-serif' : '900 47px Arial Black, Impact, sans-serif'),
        fill: '#ffffff', stroke: textStroke, strokeWidth: compactVertical ? 2.5 : 9, maxWidth: width - rankW - (compactVertical ? 36 : 90),
      });
      drawChecker(x + width - (compactVertical ? 34 : (vertical ? 62 : 72)), y + (compactVertical ? 32 : (vertical ? 40 : 44)), compactVertical ? 26 : (vertical ? 50 : 58), compactVertical ? 18 : (vertical ? 34 : 40));

      const summaryRows = [];
      const moveById = new Map((standingAnimation?.moves || []).map((move) => [move.id, move]));
      const animationActive = standingAnimation?.active === true;
      ranking.forEach((data, index) => {
        const move = moveById.get(data.id) || null;
        const visualIndex = animationActive && move
          ? move.fromIndex + (move.toIndex - move.fromIndex) * (standingAnimation.progress ?? 1)
          : index;
        const rowY = y + headerH + visualIndex * (rowH + gap);
        const progress = clamp(data.progress || 0, 0, 1);
        const lap = data.finished ? totalLaps : Math.max(1, Math.min(totalLaps, Math.floor(progress * totalLaps) + 1));
        summaryRows.push({ rank: index + 1, name: data.name || `Marble ${data.id + 1}`, lap, totalLaps, progress: Math.round(progress * 100), animationFromRank: move ? move.fromIndex + 1 : index + 1, animationToRank: index + 1, animationChanged: move?.changed === true });
        const skew = compactVertical ? 6 : (vertical ? 9 : 13);
        ctx.save();
        ctx.shadowColor = noDropShadow ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.36)';
        ctx.shadowBlur = noDropShadow ? 0 : 8;
        ctx.shadowOffsetX = noDropShadow ? 0 : 4;
        ctx.shadowOffsetY = noDropShadow ? 0 : 5;
        ctx.beginPath();
        ctx.moveTo(rowX + skew, rowY);
        ctx.lineTo(rowX + rowW, rowY);
        ctx.lineTo(rowX + rowW - skew, rowY + rowH);
        ctx.lineTo(rowX, rowY + rowH);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(rowX, rowY, rowX + rowW, rowY + rowH);
        gradient.addColorStop(0, colors[index % colors.length]);
        gradient.addColorStop(0.68, colors[index % colors.length]);
        gradient.addColorStop(1, index === 0 ? '#ffe34d' : 'rgba(255,255,255,0.55)');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = textStroke;
        ctx.lineWidth = vertical ? 4 : 5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rowX + rowW - (compactVertical ? 36 : (vertical ? 58 : 68)), rowY + 2);
        ctx.lineTo(rowX + rowW - 2, rowY + 2);
        ctx.lineTo(rowX + rowW - skew - 2, rowY + rowH - 2);
        ctx.lineTo(rowX + rowW - (compactVertical ? 44 : (vertical ? 72 : 84)), rowY + rowH - 2);
        ctx.closePath();
        ctx.fillStyle = index % 2 ? 'rgba(36,43,94,0.30)' : 'rgba(255,116,86,0.28)';
        ctx.fill();
        if (index === 0) drawChecker(rowX + rowW - (compactVertical ? 30 : (vertical ? 52 : 60)), rowY + (compactVertical ? 6 : 8), compactVertical ? 22 : (vertical ? 38 : 45), rowH - (compactVertical ? 12 : 16));
        ctx.restore();
        this.drawViewerText(ctx, `${index + 1}`, x + rankW * 0.48, rowY + rowH * 0.62, {
          font: compactVertical ? '900 18px Arial Black, Impact, sans-serif' : (vertical ? '900 32px Arial Black, Impact, sans-serif' : '900 40px Arial Black, Impact, sans-serif'),
          fill: '#ffd43d', stroke: textStroke, strokeWidth: compactVertical ? 2.5 : (vertical ? 7 : 8), align: 'center',
        });
        drawAvatar(data, rowX + (compactVertical ? 6 : (vertical ? 8 : 10)), rowY + (rowH - avatar) / 2, avatar, index);
        this.drawViewerText(ctx, data.name || `Marble ${data.id + 1}`, rowX + avatar + (compactVertical ? 13 : (vertical ? 18 : 22)), rowY + rowH * 0.57, {
          font: compactVertical ? '900 12px Arial Black, Impact, sans-serif' : (vertical ? '900 23px Arial Black, Impact, sans-serif' : '900 28px Arial Black, Impact, sans-serif'),
          fill: '#ffffff', stroke: textStroke, strokeWidth: compactVertical ? 1.75 : (vertical ? 6 : 7),
          maxWidth: rowW - avatar - (compactVertical ? 42 : (vertical ? 74 : 92)),
        });
        const statusLabel = data.defeated ? 'DNF' : data.finished ? 'FIN' : '';
        if (statusLabel) {
          this.drawViewerText(ctx, statusLabel, rowX + rowW - (compactVertical ? 10 : (vertical ? 14 : 18)), rowY + rowH * 0.57, {
            font: compactVertical ? '900 11px Arial Black, Impact, sans-serif' : (vertical ? '900 15px Arial Black, Impact, sans-serif' : '900 18px Arial Black, Impact, sans-serif'),
            fill: data.defeated ? '#ff5b6e' : '#ffffff', stroke: textStroke, strokeWidth: compactVertical ? 1.5 : (vertical ? 5 : 6), align: 'right',
            maxWidth: compactVertical ? 44 : (vertical ? 54 : 64),
          });
        }
      });
      ctx.restore();
      return {
        style: 'toy-park-arcade-avatar-lap-standing',
        title: 'TOY PARK RACE STANDING',
        rowCount: rows,
        rows: summaryRows,
        raceNumber,
        currentLap,
        totalLaps,
        layout: vertical ? 'vertical' : 'horizontal',
        x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), width: Number(width.toFixed(1)), height: Number(boardHeight.toFixed(1)),
        hasAvatars: true,
        hasLapLabels: false,
        rowLapLabelsHidden: true,
        compact: compactVertical,
        standingRefreshMs: standingAnimation?.refreshMs || null,
        standingAnimationMs: standingAnimation?.animationMs || null,
        standingAnimationActive: standingAnimation?.active === true,
        standingAnimationProgress: standingAnimation ? Number((standingAnimation.progress || 0).toFixed(3)) : null,
        standingAnimationMoves: (standingAnimation?.moves || []).filter((move) => move.changed),
        dropShadow: !noDropShadow,
      };
    }
    const headerHeight = toyPark ? (vertical ? 94 : 126) : (vertical ? 66 : 94);
    const rowStartOffset = toyPark ? (vertical ? 82 : 112) : (vertical ? 54 : 74);
    const boardHeight = headerHeight + rowHeight * Math.max(1, rows || (vertical ? 3 : CANVAS_VIEWER_OVERLAY.maxStandingRows));
    const radius = toyPark ? (vertical ? 28 : 30) : (vertical ? 24 : 28);
    this.drawViewerRoundedRect(ctx, x, y, width, boardHeight, radius);
    if (toyPark) {
      const bg = ctx.createLinearGradient(x, y, x + width, y + boardHeight);
      bg.addColorStop(0, 'rgba(255, 246, 214, 0.90)');
      bg.addColorStop(0.52, 'rgba(255, 221, 166, 0.80)');
      bg.addColorStop(1, 'rgba(255, 183, 208, 0.78)');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 126, 68, 0.86)';
      ctx.lineWidth = vertical ? 5 : 4;
      ctx.stroke();
      const tabW = vertical ? 176 : 208;
      const tabH = vertical ? 34 : 42;
      this.drawViewerRoundedRect(ctx, x + 18, y + 14, tabW, tabH, tabH / 2);
      ctx.fillStyle = 'rgba(255, 126, 68, 0.96)';
      ctx.fill();
      this.drawViewerText(ctx, 'TOY PARK', x + 18 + tabW / 2, y + 14 + tabH / 2 + 1, {
        font: vertical ? '900 19px Arial Black, Impact, sans-serif' : '900 24px Arial Black, Impact, sans-serif',
        fill: '#fff8dc',
        stroke: 'rgba(128,54,18,0.74)',
        strokeWidth: vertical ? 3 : 4,
        align: 'center',
      });
      this.drawViewerText(ctx, 'LIVE STANDING', x + 24, y + (vertical ? 76 : 96), {
        font: vertical ? '900 25px Arial Black, Impact, sans-serif' : '900 31px Arial Black, Impact, sans-serif',
        fill: '#5c3a1a',
        stroke: 'rgba(255,255,255,0.78)',
        strokeWidth: vertical ? 4 : 5,
        maxWidth: width - 48,
      });
    } else {
      ctx.fillStyle = vertical ? 'rgba(3, 8, 18, 0.70)' : 'rgba(3, 8, 18, 0.74)';
      ctx.fill();
      ctx.strokeStyle = vertical ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.32)';
      ctx.lineWidth = vertical ? 4 : 3;
      ctx.stroke();
      this.drawViewerText(ctx, 'LIVE STANDING', x + (vertical ? 22 : 24), y + (vertical ? 31 : 36), {
        font: vertical ? '900 26px Arial Black, Impact, sans-serif' : '900 31px Arial Black, Impact, sans-serif',
        fill: '#8df7ff',
        strokeWidth: 5,
      });
    }

    ranking.forEach((data, index) => {
      const rowY = y + rowStartOffset + index * rowHeight;
      const rowX = x + (vertical ? 20 : 18);
      const rowW = width - (vertical ? 40 : 36);
      const rowH = vertical ? 38 : 50;
      const color = `#${(data.color || 0xffffff).toString(16).padStart(6, '0')}`;
      this.drawViewerRoundedRect(ctx, rowX, rowY, rowW, rowH, toyPark ? (vertical ? 18 : 20) : (vertical ? 14 : 16));
      if (toyPark) {
        const rowGradient = ctx.createLinearGradient(rowX, rowY, rowX + rowW, rowY + rowH);
        rowGradient.addColorStop(0, index === 0 ? 'rgba(255, 217, 88, 0.74)' : 'rgba(255,255,255,0.54)');
        rowGradient.addColorStop(1, index === 0 ? 'rgba(255, 145, 78, 0.50)' : 'rgba(142, 232, 255, 0.36)');
        ctx.fillStyle = rowGradient;
        ctx.fill();
        ctx.strokeStyle = index === 0 ? 'rgba(255,126,68,0.90)' : 'rgba(255,255,255,0.70)';
        ctx.lineWidth = vertical ? 2.5 : 3;
        ctx.stroke();
      } else {
        ctx.fillStyle = index === 0 ? (vertical ? 'rgba(255, 214, 64, 0.30)' : 'rgba(255, 214, 64, 0.28)') : (vertical ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.10)');
        ctx.fill();
      }
      const rankX = rowX + (vertical ? 17 : 16);
      const midY = rowY + rowH / 2;
      if (toyPark) {
        this.drawViewerRoundedRect(ctx, rankX - 2, midY - (vertical ? 14 : 17), vertical ? 44 : 50, vertical ? 28 : 34, vertical ? 12 : 14);
        ctx.fillStyle = index === 0 ? '#ff7e44' : '#42b9e8';
        ctx.fill();
        this.drawViewerText(ctx, `#${index + 1}`, rankX + (vertical ? 20 : 23), midY + 1, {
          font: vertical ? '900 18px Arial Black, Impact, sans-serif' : '900 22px Arial Black, Impact, sans-serif',
          fill: '#ffffff',
          stroke: 'rgba(67,39,18,0.72)',
          strokeWidth: vertical ? 3 : 4,
          align: 'center',
        });
      } else {
        this.drawViewerText(ctx, `#${index + 1}`, x + (vertical ? 37 : 34), midY + (vertical ? 0 : 1), {
          font: vertical ? '900 19px Arial Black, Impact, sans-serif' : '900 23px Arial Black, Impact, sans-serif',
          fill: index === 0 ? '#ffdf3f' : '#ffffff',
          strokeWidth: 4,
        });
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + (vertical ? 92 : 88), midY, vertical ? 9 : 12, 0, Math.PI * 2);
      ctx.fill();
      if (toyPark) {
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = vertical ? 3 : 4;
        ctx.stroke();
      }
      this.drawViewerText(ctx, data.name || `Marble ${data.id + 1}`, x + (vertical ? 112 : 116), midY, {
        font: vertical ? '800 18px Arial, system-ui, sans-serif' : '800 22px Arial, system-ui, sans-serif',
        fill: toyPark ? '#3d2a14' : '#ffffff',
        stroke: toyPark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.8)',
        strokeWidth: toyPark ? (vertical ? 3 : 4) : 4,
        maxWidth: vertical ? width - 235 : 168,
      });
      const label = data.defeated ? 'DNF' : data.finished ? `${(data.finishTime || this.elapsed || 0).toFixed(1)}s` : `${Math.round((data.progress || 0) * 100)}%`;
      this.drawViewerText(ctx, label, x + width - (vertical ? 34 : 36), midY, {
        font: vertical ? '900 18px Arial Black, Impact, sans-serif' : '900 22px Arial Black, Impact, sans-serif',
        fill: toyPark ? '#0d7fa3' : '#aefcff',
        stroke: toyPark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
        strokeWidth: toyPark ? (vertical ? 3 : 4) : 4,
        align: 'right',
      });
    });
    return {
      style: toyPark ? 'toy-park-pastel-playset-live-standing' : 'classic-live-standing',
      title: toyPark ? 'TOY PARK LIVE STANDING' : 'LIVE STANDING',
      rowCount: rows,
      rows: ranking.map((data, index) => ({ rank: index + 1, name: data.name || `Marble ${data.id + 1}`, progress: Math.round((data.progress || 0) * 100) })),
      layout: vertical ? 'vertical' : 'horizontal',
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      width: Number(width.toFixed(1)),
      height: Number(boardHeight.toFixed(1)),
    };
  }

  getViewerOverlayCaption() {
    const active = this.activeCaption && this.elapsed <= this.activeCaption.expiresAt ? this.activeCaption : null;
    if (active) return { title: active.title || 'LIVE EVENT', detail: active.detail || '' };
    const leader = this.getRanking({ force: false })[0];
    if (this.state === 'running' && leader) return { title: 'LIVE EVENT', detail: `${leader.name} leads the rush` };
    if (this.countdownActive) return { title: 'GET READY', detail: 'The grid is about to launch' };
    if (this.state === 'finished') return { title: 'RACE COMPLETE', detail: this.buildPodiumResultLine?.() || 'Podium locked' };
    return { title: 'MARBLE RUSH', detail: 'Pick your winner' };
  }

  getStartHookState() {
    if (!CANVAS_START_HOOK.enabled || !this.startHookVisible) return null;
    const now = performance.now();
    const ageSeconds = Math.max(0, (now - (this.startHookShownAt || now)) / 1000);
    if (this.startHookIsGo && ageSeconds > CANVAS_START_HOOK.postStartHoldSeconds) return null;
    const countdownTotal = Math.max(0.1, Number(this.countdownDuration) || 3);
    const remaining = this.countdownActive ? clamp(this.countdownRemaining, 0, countdownTotal) : 0;
    const countdownProgress = this.countdownActive ? clamp(1 - remaining / countdownTotal, 0, 1) : 1;
    const value = this.startHookIsGo ? CANVAS_START_HOOK.goLabel : String(this.startHookValue || Math.max(1, Math.ceil(remaining)));
    const beat = this.startHookIsGo ? clamp(ageSeconds / CANVAS_START_HOOK.postStartHoldSeconds, 0, 1) : clamp(ageSeconds / 0.82, 0, 1);
    return {
      active: true,
      value,
      isGo: Boolean(this.startHookIsGo),
      ageSeconds,
      countdownRemaining: Number(remaining.toFixed(2)),
      countdownProgress: Number(countdownProgress.toFixed(3)),
      beat: Number(beat.toFixed(3)),
    };
  }

  drawCanvasStartHook({ ctx, canvas, summaryTarget = 'recording' } = {}) {
    const state = this.getStartHookState();
    if (!state || !ctx || !canvas) {
      if (summaryTarget !== 'web') this.startHookLastSummary = state ? null : { active: false };
      return null;
    }
    const w = canvas.width;
    const h = canvas.height;
    const layoutKey = this.videoCanvasLayoutKey || (w < h ? 'vertical' : 'horizontal');
    const isVertical = layoutKey === 'vertical' || h > w * 1.2;
    const minDim = Math.min(w, h);
    const toyParkStyle = this.isToyParkViewerOverlayActive();
    const goHoldSeconds = Math.max(0.1, CANVAS_START_HOOK.postStartHoldSeconds || 1.8);
    const goFadeStartSeconds = Math.min(goHoldSeconds - 0.05, Math.max(0, CANVAS_START_HOOK.goFadeStartSeconds ?? goHoldSeconds * 0.64));
    const pulse = Math.sin(state.beat * Math.PI);
    const popScale = state.isGo ? 1 + 0.12 * Math.max(0, 1 - state.ageSeconds / 0.45) : 1 + 0.08 * pulse;
    const fade = state.isGo ? clamp(1 - Math.max(0, state.ageSeconds - goFadeStartSeconds) / Math.max(0.1, goHoldSeconds - goFadeStartSeconds), 0, 1) : 1;
    const cx = w / 2;
    const cy = isVertical ? h * 0.47 : h * 0.5;
    const cardW = toyParkStyle ? (isVertical ? w * 0.70 : w * 0.48) : (isVertical ? w * 0.84 : w * 0.56);
    const cardH = toyParkStyle ? (isVertical ? h * 0.20 : h * 0.25) : (isVertical ? h * 0.27 : h * 0.32);
    const cardX = cx - cardW / 2;
    const cardY = cy - cardH / 2;
    const radius = minDim * (isVertical ? 0.04 : 0.03);
    const textStroke = '#17131f';
    const drawChecker = (x, y, cw, ch) => {
      const cell = Math.max(7, ch / 4);
      ctx.save();
      this.drawViewerRoundedRect(ctx, x, y, cw, ch, 7);
      ctx.clip();
      for (let yy = y - cell; yy < y + ch + cell; yy += cell) {
        for (let xx = x - cell; xx < x + cw + cell; xx += cell) {
          const odd = (Math.floor((xx - x) / cell) + Math.floor((yy - y) / cell)) % 2;
          ctx.fillStyle = odd ? textStroke : '#ffffff';
          ctx.fillRect(xx, yy, cell, cell);
        }
      }
      ctx.restore();
    };

    ctx.save();
    ctx.globalAlpha = fade;
    const vignette = ctx.createRadialGradient(cx, cy, minDim * 0.08, cx, cy, minDim * 0.72);
    vignette.addColorStop(0, toyParkStyle ? 'rgba(255, 224, 90, 0.12)' : 'rgba(255, 224, 90, 0.18)');
    vignette.addColorStop(0.42, toyParkStyle ? 'rgba(6, 10, 24, 0.12)' : 'rgba(6, 10, 24, 0.22)');
    vignette.addColorStop(1, toyParkStyle ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.48)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    ctx.translate(cx, cy);
    ctx.scale(popScale, popScale);
    ctx.translate(-cx, -cy);

    let toyParkStartLight = null;
    if (toyParkStyle) {
      const lightSpecs = [
        { key: 'red', fill: '#ff4057', dim: 'rgba(94, 29, 40, 0.78)' },
        { key: 'yellow', fill: '#ffd43d', dim: 'rgba(105, 82, 26, 0.78)' },
        { key: 'green', fill: '#42d96b', dim: 'rgba(26, 86, 47, 0.78)' },
      ];
      const activeLight = state.isGo
        ? 'green'
        : (state.countdownRemaining > 2 ? null : (state.countdownRemaining > 1 ? 'red' : (state.countdownRemaining > 0 ? 'yellow' : 'green')));
      const activeSpec = lightSpecs.find((light) => light.key === activeLight) || { key: 'idle', fill: '#ffffff', dim: 'rgba(42, 42, 48, 0.92)' };
      toyParkStartLight = activeLight;
      const panelW = isVertical ? Math.min(390, w * 0.52) : Math.min(360, w * 0.32);
      const panelH = isVertical ? Math.min(250, h * 0.195) : Math.min(200, h * 0.27);
      const panelX = cx - panelW / 2;
      const panelY = cy - panelH / 2;
      const panelRadius = Math.max(30, minDim * 0.045);
      const flagW = Math.max(62, panelW * 0.20);
      const flagH = Math.max(48, panelH * 0.27);
      const poleH = flagH * 1.75;
      const candyStripe = (x, y, stripeW, stripeH, phase = 0) => {
        ctx.save();
        this.drawViewerRoundedRect(ctx, x, y, stripeW, stripeH, stripeH / 2);
        ctx.clip();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, stripeW, stripeH);
        const stripeStep = Math.max(18, stripeH * 0.82);
        ctx.fillStyle = '#ff70a6';
        for (let sx = x - stripeW; sx < x + stripeW * 2; sx += stripeStep) {
          ctx.beginPath();
          ctx.moveTo(sx + phase, y + stripeH);
          ctx.lineTo(sx + phase + stripeStep * 0.48, y + stripeH);
          ctx.lineTo(sx + phase + stripeStep * 1.18, y);
          ctx.lineTo(sx + phase + stripeStep * 0.70, y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        this.drawViewerRoundedRect(ctx, x, y, stripeW, stripeH, stripeH / 2);
        ctx.strokeStyle = textStroke;
        ctx.lineWidth = Math.max(3, minDim * 0.0045);
        ctx.stroke();
      };
      const drawFlag = (poleX, poleY, dir = 1) => {
        ctx.save();
        ctx.strokeStyle = textStroke;
        ctx.lineWidth = Math.max(4, minDim * 0.006);
        ctx.beginPath();
        ctx.moveTo(poleX, poleY);
        ctx.lineTo(poleX, poleY + poleH);
        ctx.stroke();
        const flagX = dir > 0 ? poleX : poleX - flagW;
        const flagY = poleY + flagH * 0.08;
        drawChecker(flagX, flagY, flagW, flagH);
        ctx.strokeStyle = textStroke;
        ctx.lineWidth = Math.max(3, minDim * 0.004);
        ctx.strokeRect(flagX, flagY, flagW, flagH);
        ctx.restore();
      };

      const glow = ctx.createRadialGradient(cx, cy, panelW * 0.20, cx, cy, panelW * 0.72);
      glow.addColorStop(0, `${activeSpec.fill}45`);
      glow.addColorStop(0.55, `${activeSpec.fill}18`);
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(panelX - panelW * 0.48, panelY - panelH * 0.55, panelW * 1.96, panelH * 2.05);

      drawFlag(panelX - flagW * 0.38, panelY + panelH * 0.08, 1);
      drawFlag(panelX + panelW + flagW * 0.38, panelY + panelH * 0.08, -1);

      this.drawViewerRoundedRect(ctx, panelX, panelY, panelW, panelH, panelRadius);
      const housingGradient = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
      housingGradient.addColorStop(0, 'rgba(55, 203, 255, 0.97)');
      housingGradient.addColorStop(0.48, 'rgba(45, 71, 197, 0.96)');
      housingGradient.addColorStop(1, 'rgba(255, 174, 65, 0.97)');
      ctx.fillStyle = housingGradient;
      ctx.fill();
      ctx.strokeStyle = textStroke;
      ctx.lineWidth = Math.max(7, minDim * 0.011);
      ctx.stroke();

      candyStripe(panelX + panelW * 0.09, panelY + panelH * 0.08, panelW * 0.82, Math.max(18, panelH * 0.075), state.ageSeconds * 10);

      const innerPad = Math.max(12, panelW * 0.04);
      this.drawViewerRoundedRect(ctx, panelX + innerPad, panelY + panelH * 0.23, panelW - innerPad * 2, panelH * 0.54, panelRadius * 0.72);
      ctx.fillStyle = 'rgba(23, 19, 31, 0.90)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.34)';
      ctx.lineWidth = Math.max(2.5, minDim * 0.004);
      ctx.stroke();

      const labelH = Math.max(34, panelH * 0.18);
      const labelW = panelW * 0.70;
      const labelX = cx - labelW / 2;
      const labelY = panelY - labelH * 0.34;
      this.drawViewerRoundedRect(ctx, labelX, labelY, labelW, labelH, labelH / 2);
      ctx.fillStyle = '#ffd43d';
      ctx.fill();
      ctx.strokeStyle = textStroke;
      ctx.lineWidth = Math.max(4, minDim * 0.006);
      ctx.stroke();
      this.drawViewerText(ctx, state.isGo ? 'RUSH!' : 'GET READY', cx, labelY + labelH * 0.54, {
        font: `900 ${Math.round(minDim * (isVertical ? 0.027 : 0.022))}px Arial Black, Impact, sans-serif`,
        fill: '#ffffff', stroke: textStroke, strokeWidth: Math.max(3, minDim * 0.005), align: 'center', maxWidth: labelW - 28,
      });

      const bulbRadius = Math.min(panelH * 0.22, panelW * 0.16);
      const bulbGap = panelW * 0.04;
      const totalBulbW = bulbRadius * 6 + bulbGap * 2;
      const startX = cx - totalBulbW / 2 + bulbRadius;
      const bulbY = panelY + panelH * 0.52;
      lightSpecs.forEach((light, index) => {
        const x = startX + index * (bulbRadius * 2 + bulbGap);
        const active = light.key === activeLight;
        ctx.beginPath();
        ctx.arc(x, bulbY, bulbRadius * 1.18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.48)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, bulbY, bulbRadius, 0, Math.PI * 2);
        const bulbGradient = ctx.createRadialGradient(x - bulbRadius * 0.28, bulbY - bulbRadius * 0.34, bulbRadius * 0.08, x, bulbY, bulbRadius);
        bulbGradient.addColorStop(0, active ? '#ffffff' : 'rgba(255,255,255,0.16)');
        bulbGradient.addColorStop(0.28, active ? light.fill : light.dim);
        bulbGradient.addColorStop(1, active ? light.fill : 'rgba(20,20,24,0.92)');
        ctx.fillStyle = bulbGradient;
        ctx.fill();
        ctx.lineWidth = Math.max(3, minDim * 0.0045);
        ctx.strokeStyle = active ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.68)';
        ctx.stroke();
        if (active) {
          const shine = ctx.createRadialGradient(x, bulbY, bulbRadius * 0.35, x, bulbY, bulbRadius * 1.75);
          shine.addColorStop(0, `${light.fill}76`);
          shine.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = shine;
          ctx.beginPath();
          ctx.arc(x, bulbY, bulbRadius * 1.75, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      const footerW = panelW * 0.78;
      const footerH = Math.max(34, panelH * 0.17);
      const footerX = cx - footerW / 2;
      const footerY = panelY + panelH - footerH * 0.64;
      this.drawViewerRoundedRect(ctx, footerX, footerY, footerW, footerH, footerH / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = textStroke;
      ctx.lineWidth = Math.max(3, minDim * 0.0045);
      ctx.stroke();
      this.drawViewerText(ctx, state.isGo ? 'GO GO GO!' : `${Math.max(1, this.marbleData?.length || 8)} MARBLES READY`, cx, footerY + footerH * 0.52, {
        font: `900 ${Math.round(minDim * (isVertical ? 0.022 : 0.018))}px Arial Black, Impact, sans-serif`,
        fill: activeSpec.fill === '#ffffff' ? '#37cbff' : activeSpec.fill, stroke: textStroke, strokeWidth: Math.max(3, minDim * 0.0045), align: 'center', maxWidth: footerW - 24,
      });
    } else {
      this.drawViewerRoundedRect(ctx, cardX, cardY, cardW, cardH, radius);
      const cardGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
      cardGradient.addColorStop(0, 'rgba(4, 9, 24, 0.78)');
      cardGradient.addColorStop(0.52, 'rgba(12, 18, 40, 0.64)');
      cardGradient.addColorStop(1, state.isGo ? 'rgba(255, 44, 72, 0.76)' : 'rgba(255, 178, 36, 0.58)');
      ctx.fillStyle = cardGradient;
      ctx.fill();
      ctx.strokeStyle = state.isGo ? 'rgba(255,255,255,0.82)' : 'rgba(255, 223, 98, 0.72)';
      ctx.lineWidth = Math.max(4, minDim * 0.006);
      ctx.stroke();
      const topLabel = state.isGo ? 'GO!' : CANVAS_START_HOOK.gateLabel;
      const valueFont = isVertical ? `900 ${Math.round(minDim * (state.isGo ? 0.19 : 0.25))}px Arial Black, Impact, sans-serif` : `900 ${Math.round(minDim * (state.isGo ? 0.16 : 0.22))}px Arial Black, Impact, sans-serif`;
      this.drawViewerText(ctx, topLabel, cx, cardY + cardH * 0.20, { font: `900 ${Math.round(minDim * 0.04)}px Arial Black, Impact, sans-serif`, fill: state.isGo ? '#ffffff' : '#ffec8a', strokeWidth: Math.max(4, minDim * 0.007), align: 'center', maxWidth: cardW - 50 });
      this.drawViewerText(ctx, state.value, cx, cardY + cardH * 0.53, { font: valueFont, fill: state.isGo ? '#ffffff' : '#ffd83e', stroke: state.isGo ? 'rgba(255,36,66,0.88)' : 'rgba(0,0,0,0.86)', strokeWidth: Math.max(8, minDim * 0.018), align: 'center', maxWidth: cardW - 60 });
      this.drawViewerText(ctx, CANVAS_START_HOOK.preRaceTagline, cx, cardY + cardH * 0.83, { font: `900 ${Math.round(minDim * (isVertical ? 0.038 : 0.032))}px Arial Black, Impact, sans-serif`, fill: '#8df7ff', strokeWidth: Math.max(4, minDim * 0.007), align: 'center', maxWidth: cardW - 64 });
      if (!state.isGo) {
        const barW = cardW * 0.72;
        const barH = Math.max(12, minDim * 0.016);
        const barX = cx - barW / 2;
        const barY = cardY + cardH - barH - cardH * 0.08;
        this.drawViewerRoundedRect(ctx, barX, barY, barW, barH, barH / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.23)';
        ctx.fill();
        this.drawViewerRoundedRect(ctx, barX, barY, Math.max(barH, barW * state.countdownProgress), barH, barH / 2);
        ctx.fillStyle = '#ffdb43';
        ctx.fill();
      }
    }
    ctx.restore();

    const summary = {
      active: true,
      target: summaryTarget,
      layout: isVertical ? 'vertical' : 'horizontal',
      canvasSize: `${w}x${h}`,
      value: state.value,
      isGo: state.isGo,
      countdownRemaining: state.countdownRemaining,
      countdownProgress: state.countdownProgress,
      style: toyParkStyle ? 'toy-park-arcade-standing-style-start-hook' : CANVAS_START_HOOK.style,
      toyParkStyle,
      toyParkStartLight,
    };
    if (summaryTarget !== 'web') this.startHookLastSummary = summary;
    return summary;
  }

  drawCanvasSurvivorSpotlight({ ctx, canvas, summaryTarget = 'recording' } = {}) {
    const league = this.survivorLeague;
    const spotlight = league?.spotlight;
    if (!league?.active || league.status !== 'spotlight' || !league.spotlightStartedAt || !spotlight?.marbles?.length || !ctx || !canvas) return null;
    const w = canvas.width;
    const h = canvas.height;
    const layoutKey = this.videoCanvasLayoutKey || (w < h ? 'vertical' : 'horizontal');
    const isVertical = layoutKey === 'vertical' || h > w * 1.2;
    const minDim = Math.min(w, h);
    const startedAt = league.spotlightStartedAt || performance.now();
    const ageSeconds = Math.max(0, (performance.now() - startedAt) / 1000);
    const duration = Math.max(0.1, Number(league.spotlightSeconds) || SURVIVOR_LEAGUE.spotlightSeconds || 5);
    const progress = clamp(ageSeconds / duration, 0, 1);
    const cx = w / 2;
    const cardW = isVertical ? w * 0.86 : w * 0.58;
    const cardH = isVertical ? h * 0.34 : h * 0.42;
    const cardX = cx - cardW / 2;
    const cardY = isVertical ? h * 0.30 : h * 0.25;
    const radius = minDim * (isVertical ? 0.04 : 0.032);

    ctx.save();
    const vignette = ctx.createRadialGradient(cx, cardY + cardH * 0.48, minDim * 0.12, cx, cardY + cardH * 0.48, minDim * 0.82);
    vignette.addColorStop(0, 'rgba(124, 247, 212, 0.16)');
    vignette.addColorStop(0.44, 'rgba(9, 11, 28, 0.30)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    this.drawViewerRoundedRect(ctx, cardX, cardY, cardW, cardH, radius);
    const bg = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    bg.addColorStop(0, 'rgba(6, 10, 24, 0.92)');
    bg.addColorStop(0.56, 'rgba(18, 14, 44, 0.86)');
    bg.addColorStop(1, 'rgba(38, 18, 54, 0.84)');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(124,247,212,0.56)';
    ctx.lineWidth = Math.max(4, minDim * 0.006);
    ctx.stroke();

    const headerY = cardY + cardH * 0.12;
    this.drawViewerText(ctx, 'SURVIVOR LEAGUE', cx, headerY, { font: `900 ${Math.round(minDim * (isVertical ? 0.034 : 0.030))}px Arial Black, Impact, sans-serif`, fill: '#ffd166', strokeWidth: Math.max(3, minDim * 0.005), align: 'center', maxWidth: cardW - 70 });
    this.drawViewerText(ctx, spotlight.title || 'Race Spotlight', cx, cardY + cardH * 0.24, { font: `900 ${Math.round(minDim * (isVertical ? 0.060 : 0.055))}px Arial Black, Impact, sans-serif`, fill: '#ffffff', strokeWidth: Math.max(5, minDim * 0.008), align: 'center', maxWidth: cardW - 70 });
    const marbles = spotlight.marbles.slice(0, 2);
    const cardGap = isVertical ? cardH * 0.030 : cardW * 0.026;
    const miniY = cardY + cardH * (isVertical ? 0.38 : 0.43);
    const miniH = isVertical ? cardH * 0.20 : cardH * 0.31;
    const miniW = isVertical ? cardW - 70 : (cardW - 92 - cardGap) / 2;
    marbles.forEach(({ identity, lines }, index) => {
      const color = /^#[0-9a-f]{6}$/i.test(identity.colorHex || '') ? identity.colorHex : '#7cf7d4';
      const x = isVertical ? cardX + 35 : cardX + 46 + index * (miniW + cardGap);
      const y = isVertical ? miniY + index * (miniH + cardH * 0.035) : miniY;
      this.drawViewerRoundedRect(ctx, x, y, miniW, miniH, Math.max(22, radius * 0.65));
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = Math.max(2, minDim * 0.003);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + miniW * 0.08, y + miniH * 0.26, Math.max(12, minDim * 0.018), 0, Math.PI * 2);
      ctx.fill();
      this.drawViewerText(ctx, identity.name, x + miniW * 0.14, y + miniH * 0.26, { font: `900 ${Math.round(minDim * (isVertical ? 0.034 : 0.032))}px Arial Black, Impact, sans-serif`, fill: '#ffffff', strokeWidth: Math.max(4, minDim * 0.006), maxWidth: miniW * 0.78 });
      (lines || []).slice(0, 2).forEach((line, lineIndex) => {
        this.drawViewerText(ctx, line, x + 24, y + miniH * (0.58 + lineIndex * 0.22), { font: `800 ${Math.round(minDim * (isVertical ? 0.025 : 0.021))}px Arial, system-ui, sans-serif`, fill: '#dffaff', strokeWidth: Math.max(3, minDim * 0.004), maxWidth: miniW - 48 });
      });
    });

    const barW = cardW * 0.56;
    const barH = Math.max(10, minDim * 0.012);
    const barX = cx - barW / 2;
    const barY = cardY + cardH - cardH * 0.10;
    this.drawViewerRoundedRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fill();
    this.drawViewerRoundedRect(ctx, barX, barY, Math.max(barH, barW * progress), barH, barH / 2);
    ctx.fillStyle = '#7cf7d4';
    ctx.fill();
    ctx.restore();

    return {
      active: true,
      target: summaryTarget,
      layout: isVertical ? 'vertical' : 'horizontal',
      canvasSize: `${w}x${h}`,
      title: spotlight.title,
      marbles: marbles.map(({ identity }) => identity.name),
      progress: Number(progress.toFixed(3)),
      layoutMetrics: {
        cardY: Number(cardY.toFixed(1)),
        cardH: Number(cardH.toFixed(1)),
        miniY: Number(miniY.toFixed(1)),
        miniH: Number(miniH.toFixed(1)),
        cardGap: Number(cardGap.toFixed(1)),
        secondMiniBottom: Number((miniY + (isVertical ? 1 : 0) * (miniH + cardGap) + miniH).toFixed(1)),
        barY: Number(barY.toFixed(1)),
        barH: Number(barH.toFixed(1)),
        gapBeforeBar: Number((barY - (miniY + (isVertical ? 1 : 0) * (miniH + cardGap) + miniH)).toFixed(1)),
      },
    };
  }

  drawViewerCanvasOverlay({ canvas = this.viewerOverlayCanvas, ctx = this.viewerOverlayContext, summaryTarget = 'recording' } = {}) {
    if (!CANVAS_VIEWER_OVERLAY.enabled || !ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const layoutKey = this.videoCanvasLayoutKey || (w < h ? 'vertical' : 'horizontal');
    const isVertical = layoutKey === 'vertical' || h > w * 1.2;
    const toyParkOverlay = this.isToyParkViewerOverlayActive();
    const rankingSource = this.getRanking({ force: false });
    const maxRows = toyParkOverlay
      ? rankingSource.length
      : (isVertical ? 3 : CANVAS_VIEWER_OVERLAY.maxStandingRows);
    const standingSnapshot = toyParkOverlay ? this.getToyParkStandingRankingSnapshot(rankingSource, maxRows) : null;
    const ranking = toyParkOverlay ? standingSnapshot.rows : rankingSource.slice(0, maxRows);
    const leader = ranking[0] || null;
    const leaderProgress = clamp(leader?.progress || 0, 0, 1);
    const leaderDistance = Math.max(0, Math.min(this.trackLength || 0, leader?.distance || 0));
    const caption = this.getViewerOverlayCaption();
    if (isVertical) {
      this.drawVerticalViewerCanvasOverlay({ ctx, canvas, ranking, leaderProgress, leaderDistance, caption, summaryTarget, toyParkOverlay, standingAnimation: standingSnapshot });
      return;
    }

    const horizontalDesignWidth = 1920;
    const horizontalDesignHeight = 1080;
    const horizontalContentScale = Math.min(w / horizontalDesignWidth, h / horizontalDesignHeight);
    const logicalW = w / horizontalContentScale;
    const logicalH = h / horizontalContentScale;

    ctx.save();
    ctx.scale(horizontalContentScale, horizontalContentScale);

    // Live Event caption, top-left. Toy Park intentionally omits this component so the track has more breathing room.
    const capX = 46;
    const capY = 38;
    const capW = 760;
    const capH = 132;
    if (!toyParkOverlay) {
      ctx.save();
      const capGradient = ctx.createLinearGradient(capX, capY, capX + capW, capY + capH);
      capGradient.addColorStop(0, 'rgba(255, 128, 0, 0.92)');
      capGradient.addColorStop(1, 'rgba(255, 214, 64, 0.78)');
      this.drawViewerRoundedRect(ctx, capX, capY, capW, capH, 30);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
      ctx.fill();
      this.drawViewerRoundedRect(ctx, capX + 8, capY + 8, 160, 40, 18);
      ctx.fillStyle = capGradient;
      ctx.fill();
      this.drawViewerText(ctx, 'LIVE EVENT', capX + 88, capY + 30, { font: '900 23px Arial Black, Impact, sans-serif', fill: '#131313', strokeWidth: 0, align: 'center' });
      this.drawViewerText(ctx, caption.title, capX + 30, capY + 78, { font: '900 44px Arial Black, Impact, sans-serif', fill: '#fff7b1', maxWidth: capW - 60 });
      this.drawViewerText(ctx, caption.detail, capX + 30, capY + 116, { font: '800 27px Arial, system-ui, sans-serif', fill: '#ffffff', strokeWidth: 4, maxWidth: capW - 60 });
      ctx.restore();
    }

    // Live Standing, top-left for Toy Park; classic stays on the right.
    const boardX = toyParkOverlay ? 54 : logicalW - 438;
    const boardY = 34;
    const boardW = toyParkOverlay ? 600 : 390;
    const rowH = 62;
    const liveStandingSummary = this.drawViewerLiveStandingPanel({
      ctx,
      ranking,
      x: boardX,
      y: boardY,
      width: boardW,
      rowHeight: rowH,
      vertical: false,
      toyPark: toyParkOverlay,
      standingAnimation: standingSnapshot,
    });

    // Bottom CTA and channel handle.
    const ctaW = toyParkOverlay ? 430 : 610;
    const ctaH = toyParkOverlay ? 66 : 86;
    const ctaX = toyParkOverlay ? logicalW - ctaW - 72 : 54;
    const ctaY = toyParkOverlay ? logicalH - ctaH - 54 : logicalH - 132;
    let ctaSummary = null;
    if (toyParkOverlay) {
      ctaSummary = this.drawToyParkArcadeCta({ ctx, x: ctaX, y: ctaY, width: ctaW, height: ctaH, vertical: false });
    } else {
      this.drawViewerRoundedRect(ctx, ctaX, ctaY, ctaW, ctaH, 28);
      ctx.fillStyle = 'rgba(255, 36, 66, 0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 4;
      ctx.stroke();
      this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.ctaPrimary, ctaX + 32, ctaY + 33, { font: '900 37px Arial Black, Impact, sans-serif', fill: '#ffffff', strokeWidth: 5 });
      this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.channelHandle, ctaX + 34, ctaY + 66, { font: '800 25px Arial, system-ui, sans-serif', fill: '#fff3a0', strokeWidth: 4 });
    }

    // Time / progress / distance lower-third. Toy Park omits this bottom time component.
    const infoX = 690;
    const infoY = logicalH - 116;
    const infoW = 700;
    const infoH = 66;
    if (!toyParkOverlay) {
      this.drawViewerRoundedRect(ctx, infoX, infoY, infoW, infoH, 22);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
      ctx.fill();
      const progressX = infoX + 238;
      const progressY = infoY + 38;
      const progressW = 250;
      const progressH = 12;
      this.drawViewerText(ctx, `TIME ${this.elapsed.toFixed(1)}s`, infoX + 28, infoY + 34, { font: '900 26px Arial Black, Impact, sans-serif', fill: '#ffffff', strokeWidth: 4 });
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      this.drawViewerRoundedRect(ctx, progressX, progressY - progressH / 2, progressW, progressH, 7);
      ctx.fill();
      ctx.fillStyle = '#35f2ff';
      this.drawViewerRoundedRect(ctx, progressX, progressY - progressH / 2, Math.max(6, progressW * leaderProgress), progressH, 7);
      ctx.fill();
      this.drawViewerText(ctx, `PROGRESS ${Math.round(leaderProgress * 100)}%`, progressX + progressW + 18, infoY + 25, { font: '900 20px Arial Black, Impact, sans-serif', fill: '#aefcff', strokeWidth: 4, maxWidth: 168 });
      this.drawViewerText(ctx, `DISTANCE ${leaderDistance.toFixed(0)} / ${Math.round(this.trackLength || 0)}m`, progressX + progressW + 18, infoY + 50, { font: '800 17px Arial, system-ui, sans-serif', fill: '#ffffff', strokeWidth: 3, maxWidth: 168 });
    }
    ctx.restore();

    const startHookSummary = this.drawCanvasStartHook({ ctx, canvas, summaryTarget });
    const survivorSpotlightSummary = this.drawCanvasSurvivorSpotlight({ ctx, canvas, summaryTarget });
    if (survivorSpotlightSummary && summaryTarget !== 'web') this.survivorLeague.lastCanvasSurvivorSpotlightSummary = survivorSpotlightSummary;

    const overlaySummary = {
      enabled: true,
      target: summaryTarget,
      canvasSize: `${w}x${h}`,
      liveEventTitle: caption.title,
      liveEventDetail: caption.detail,
      liveEventVisible: !toyParkOverlay,
      timeComponentVisible: !toyParkOverlay,
      liveStandingCount: ranking.length,
      liveStandingStyle: liveStandingSummary.style,
      liveStandingTitle: liveStandingSummary.title,
      liveStandingRows: liveStandingSummary.rows,
      standingRefreshMs: liveStandingSummary.standingRefreshMs || null,
      standingAnimationMs: liveStandingSummary.standingAnimationMs || null,
      standingAnimationActive: liveStandingSummary.standingAnimationActive === true,
      standingAnimationProgress: liveStandingSummary.standingAnimationProgress ?? null,
      standingAnimationMoves: liveStandingSummary.standingAnimationMoves || [],
      toyParkOverlay,
      layout: 'horizontal',
      maxStandingRows: maxRows,
      horizontalContentScale: Number(horizontalContentScale.toFixed(3)),
      horizontalDesignSize: `${horizontalDesignWidth}x${horizontalDesignHeight}`,
      logicalCanvasSize: `${Math.round(logicalW)}x${Math.round(logicalH)}`,
      channelHandle: CANVAS_VIEWER_OVERLAY.channelHandle,
      ctaPrimary: CANVAS_VIEWER_OVERLAY.ctaPrimary,
      ctaStyle: ctaSummary?.style || 'classic-red-cta',
      ctaPosition: ctaSummary || { x: ctaX, y: ctaY, width: ctaW, height: ctaH, layout: 'horizontal' },
      startHook: startHookSummary,
      elapsed: Number(this.elapsed.toFixed(2)),
      leaderProgress: Number(leaderProgress.toFixed(3)),
      leaderDistance: Number(leaderDistance.toFixed(1)),
    };
    if (summaryTarget === 'web') this.lastWebViewerOverlaySummary = overlaySummary;
    else this.lastViewerOverlaySummary = overlaySummary;
  }

  drawVerticalViewerCanvasOverlay({ ctx, canvas, ranking = [], leaderProgress = 0, leaderDistance = 0, caption = {}, summaryTarget = 'recording', toyParkOverlay = false, standingAnimation = null } = {}) {
    let w = canvas.width;
    let h = canvas.height;
    const toyParkWebStageTransform = toyParkOverlay && summaryTarget === 'web' && w < 600
      ? (() => {
        const designW = 720;
        const designH = 1280;
        const scale = Math.min(w / designW, h / designH);
        return {
          designW,
          designH,
          scale,
          offsetX: (w - designW * scale) / 2,
          offsetY: (h - designH * scale) / 2,
          viewportW: w,
          viewportH: h,
        };
      })()
      : null;
    if (toyParkWebStageTransform) {
      ctx.save();
      ctx.translate(toyParkWebStageTransform.offsetX, toyParkWebStageTransform.offsetY);
      ctx.scale(toyParkWebStageTransform.scale, toyParkWebStageTransform.scale);
      w = toyParkWebStageTransform.designW;
      h = toyParkWebStageTransform.designH;
    }
    const verticalContentScale = toyParkWebStageTransform ? toyParkWebStageTransform.scale : 0.74;
    const margin = 58;

    // Compact Shorts event card at the top. Toy Park intentionally omits this component in both web and recording overlays.
    const capX = margin;
    const capY = 42;
    const capW = w - margin * 2;
    const capH = 124;
    if (!toyParkOverlay) {
      ctx.save();
      const capGradient = ctx.createLinearGradient(capX, capY, capX + capW, capY + capH);
      capGradient.addColorStop(0, 'rgba(255, 128, 0, 0.94)');
      capGradient.addColorStop(1, 'rgba(255, 224, 80, 0.80)');
      this.drawViewerRoundedRect(ctx, capX, capY, capW, capH, 24);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.54)';
      ctx.fill();
      this.drawViewerRoundedRect(ctx, capX + 14, capY + 13, 134, 32, 16);
      ctx.fillStyle = capGradient;
      ctx.fill();
      this.drawViewerText(ctx, 'LIVE EVENT', capX + 81, capY + 30, { font: '900 18px Arial Black, Impact, sans-serif', fill: '#141414', strokeWidth: 0, align: 'center' });
      this.drawViewerText(ctx, caption.title || 'MARBLE RUSH', capX + 26, capY + 74, { font: '900 37px Arial Black, Impact, sans-serif', fill: '#fff7b1', maxWidth: capW - 52 });
      this.drawViewerText(ctx, caption.detail || 'Pick your winner', capX + 26, capY + 106, { font: '800 21px Arial, system-ui, sans-serif', fill: '#ffffff', strokeWidth: 4, maxWidth: capW - 52 });
      ctx.restore();
    }

    // Shorts-friendly top-three standings card. Keep it compact so the middle race action stays visible.
    const compactToyParkStanding = toyParkOverlay;
    const toyParkNarrowWebPreview = toyParkOverlay && w < 600;
    const boardW = compactToyParkStanding
      ? (toyParkNarrowWebPreview ? Math.min(Math.round(w * 0.37), 150) : Math.min(Math.round(w * 0.32), 240))
      : w - margin * 2;
    const rowH = compactToyParkStanding ? (toyParkNarrowWebPreview ? 32 : 34) : 48;
    const boardX = compactToyParkStanding ? (toyParkNarrowWebPreview ? 36 : 32) : margin;
    const boardY = compactToyParkStanding ? (toyParkNarrowWebPreview ? 18 : 16) : Math.min(h - 595, 196);
    const liveStandingSummary = this.drawViewerLiveStandingPanel({
      ctx,
      ranking,
      x: boardX,
      y: boardY,
      width: boardW,
      rowHeight: rowH,
      vertical: true,
      toyPark: toyParkOverlay,
      standingAnimation,
    });

    // Toy Park vertical uses a fixed 9:16 overlay-stage composition: leaderboard top-left,
    // CTA bottom-right, matching the clean overlay-only reference frame.
    const ctaW = toyParkOverlay ? 330 : w - margin * 2;
    const ctaH = toyParkOverlay ? 52 : 64;
    const ctaX = toyParkOverlay ? w - margin - ctaW : margin;
    const ctaY = toyParkOverlay ? h - margin - ctaH : h - 216;
    let ctaSummary = null;
    if (toyParkOverlay) {
      ctaSummary = this.drawToyParkArcadeCta({ ctx, x: ctaX, y: ctaY, width: ctaW, height: ctaH, vertical: true });
    } else {
      this.drawViewerRoundedRect(ctx, ctaX, ctaY, ctaW, ctaH, 22);
      ctx.fillStyle = 'rgba(255, 36, 66, 0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 4;
      ctx.stroke();
      this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.ctaPrimary, ctaX + ctaW / 2, ctaY + 27, { font: '900 31px Arial Black, Impact, sans-serif', fill: '#ffffff', strokeWidth: 5, align: 'center', maxWidth: ctaW - 48 });
      this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.channelHandle, ctaX + ctaW / 2, ctaY + 51, { font: '800 19px Arial, system-ui, sans-serif', fill: '#fff3a0', strokeWidth: 4, align: 'center', maxWidth: ctaW - 48 });
    }

    const infoX = margin;
    const infoY = h - 128;
    const infoW = w - margin * 2;
    const infoH = 78;
    if (!toyParkOverlay) {
      this.drawViewerRoundedRect(ctx, infoX, infoY, infoW, infoH, 20);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.64)';
      ctx.fill();
      this.drawViewerText(ctx, `TIME ${this.elapsed.toFixed(1)}s`, infoX + 24, infoY + 27, { font: '900 21px Arial Black, Impact, sans-serif', fill: '#ffffff', strokeWidth: 4 });
      this.drawViewerText(ctx, `PROGRESS ${Math.round(leaderProgress * 100)}%`, infoX + infoW - 24, infoY + 27, { font: '900 20px Arial Black, Impact, sans-serif', fill: '#aefcff', strokeWidth: 4, align: 'right' });
      const progressX = infoX + 24;
      const progressY = infoY + 53;
      const progressW = infoW - 68;
      const progressH = 10;
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      this.drawViewerRoundedRect(ctx, progressX, progressY - progressH / 2, progressW, progressH, 8);
      ctx.fill();
      ctx.fillStyle = '#35f2ff';
      this.drawViewerRoundedRect(ctx, progressX, progressY - progressH / 2, Math.max(8, progressW * leaderProgress), progressH, 8);
      ctx.fill();
      this.drawViewerText(ctx, `DISTANCE ${leaderDistance.toFixed(0)} / ${Math.round(this.trackLength || 0)}m`, infoX + infoW / 2, infoY + 69, { font: '800 16px Arial, system-ui, sans-serif', fill: '#ffffff', strokeWidth: 3, align: 'center', maxWidth: infoW - 68 });
    }

    if (toyParkWebStageTransform) ctx.restore();

    const startHookSummary = this.drawCanvasStartHook({ ctx, canvas, summaryTarget });
    const survivorSpotlightSummary = this.drawCanvasSurvivorSpotlight({ ctx, canvas, summaryTarget });
    if (survivorSpotlightSummary && summaryTarget !== 'web') this.survivorLeague.lastCanvasSurvivorSpotlightSummary = survivorSpotlightSummary;

    const overlaySummary = {
      enabled: true,
      target: summaryTarget,
      layout: 'vertical',
      canvasSize: toyParkWebStageTransform ? `${toyParkWebStageTransform.viewportW}x${toyParkWebStageTransform.viewportH}` : `${w}x${h}`,
      designCanvasSize: toyParkWebStageTransform ? `${w}x${h}` : null,
      verticalContentScale,
      toyParkWebStageTransform: toyParkWebStageTransform ? {
        designSize: `${toyParkWebStageTransform.designW}x${toyParkWebStageTransform.designH}`,
        viewportSize: `${toyParkWebStageTransform.viewportW}x${toyParkWebStageTransform.viewportH}`,
        scale: Number(toyParkWebStageTransform.scale.toFixed(3)),
        offsetX: Number(toyParkWebStageTransform.offsetX.toFixed(1)),
        offsetY: Number(toyParkWebStageTransform.offsetY.toFixed(1)),
      } : null,
      verticalLayoutMetrics: {
        margin,
        eventCard: { x: capX, y: capY, width: capW, height: capH },
        standingCard: { x: boardX, y: boardY, width: boardW, height: liveStandingSummary.height, rowHeight: rowH },
        ctaCard: { x: ctaX, y: ctaY, width: ctaW, height: ctaH },
        infoCard: { x: infoX, y: infoY, width: infoW, height: infoH },
      },
      liveEventTitle: caption.title,
      liveEventDetail: caption.detail,
      liveEventVisible: !toyParkOverlay,
      timeComponentVisible: !toyParkOverlay,
      liveStandingCount: ranking.length,
      liveStandingStyle: liveStandingSummary.style,
      liveStandingTitle: liveStandingSummary.title,
      liveStandingRows: liveStandingSummary.rows,
      standingRefreshMs: liveStandingSummary.standingRefreshMs || null,
      standingAnimationMs: liveStandingSummary.standingAnimationMs || null,
      standingAnimationActive: liveStandingSummary.standingAnimationActive === true,
      standingAnimationProgress: liveStandingSummary.standingAnimationProgress ?? null,
      standingAnimationMoves: liveStandingSummary.standingAnimationMoves || [],
      toyParkOverlay,
      liveStandingCompact: liveStandingSummary.compact === true,
      maxStandingRows: ranking.length,
      channelHandle: CANVAS_VIEWER_OVERLAY.channelHandle,
      ctaPrimary: CANVAS_VIEWER_OVERLAY.ctaPrimary,
      ctaStyle: ctaSummary?.style || 'classic-red-cta',
      ctaPosition: ctaSummary || { x: ctaX, y: ctaY, width: ctaW, height: ctaH, layout: 'vertical' },
      startHook: startHookSummary,
      elapsed: Number(this.elapsed.toFixed(2)),
      leaderProgress: Number(leaderProgress.toFixed(3)),
      leaderDistance: Number(leaderDistance.toFixed(1)),
    };
    if (summaryTarget === 'web') this.lastWebViewerOverlaySummary = overlaySummary;
    else this.lastViewerOverlaySummary = overlaySummary;
  }

  getVideoCompositeCameraCropFactor(sourceWidth, sourceHeight, targetWidth, targetHeight, fit = 'cover') {
    const srcW = Math.max(1, Number(sourceWidth) || 1);
    const srcH = Math.max(1, Number(sourceHeight) || 1);
    const dstW = Math.max(1, Number(targetWidth) || 1);
    const dstH = Math.max(1, Number(targetHeight) || 1);
    if (fit === 'contain') return 1;
    const sourceRatio = srcW / srcH;
    const targetRatio = dstW / dstH;
    if (sourceRatio > targetRatio) return sourceRatio / targetRatio;
    if (sourceRatio < targetRatio) return targetRatio / sourceRatio;
    return 1;
  }

  getVideoCompositeSourceRect(sourceWidth, sourceHeight, targetWidth, targetHeight, fit = 'cover') {
    const srcW = Math.max(1, Number(sourceWidth) || 1);
    const srcH = Math.max(1, Number(sourceHeight) || 1);
    const dstW = Math.max(1, Number(targetWidth) || 1);
    const dstH = Math.max(1, Number(targetHeight) || 1);
    const sourceRatio = srcW / srcH;
    const targetRatio = dstW / dstH;
    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;
    if (fit === 'contain') {
      return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH, letterbox: true };
    }
    if (sourceRatio > targetRatio) {
      sw = srcH * targetRatio;
      sx = (srcW - sw) / 2;
    } else if (sourceRatio < targetRatio) {
      sh = srcW / targetRatio;
      sy = (srcH - sh) / 2;
    }
    return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH, letterbox: false };
  }

  drawVideoCompositeFrame() {
    const composite = this.videoCompositeCanvas;
    const ctx = this.videoCompositeContext;
    const source = this.renderer?.domElement;
    if (!composite || !ctx || !source) return null;
    const layout = this.videoCanvasLayout || VIDEO_CANVAS_LAYOUTS.horizontal;
    const w = composite.width;
    const h = composite.height;
    ctx.save();
    ctx.fillStyle = '#020611';
    ctx.fillRect(0, 0, w, h);
    const rect = this.getVideoCompositeSourceRect(source.width || source.clientWidth || w, source.height || source.clientHeight || h, w, h, layout.fit || 'cover');
    const cameraCropFactor = this.getVideoCompositeCameraCropFactor(source.width || source.clientWidth || w, source.height || source.clientHeight || h, w, h, layout.fit || 'cover');
    try {
      ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
    } catch (error) {
      this.lastVideoCompositeSummary = {
        ok: false,
        reason: error?.message || 'drawImage-failed',
        layout: layout.key,
        canvasSize: `${w}x${h}`,
      };
      ctx.restore();
      return this.lastVideoCompositeSummary;
    }
    if (this.viewerOverlayCanvas) {
      ctx.drawImage(this.viewerOverlayCanvas, 0, 0, w, h);
    }
    ctx.restore();
    this.lastVideoCompositeSummary = {
      ok: true,
      layout: layout.key,
      label: layout.label,
      canvasSize: `${w}x${h}`,
      sourceSize: `${source.width || source.clientWidth || 0}x${source.height || source.clientHeight || 0}`,
      sourceRect: {
        sx: Number(rect.sx.toFixed(1)),
        sy: Number(rect.sy.toFixed(1)),
        sw: Number(rect.sw.toFixed(1)),
        sh: Number(rect.sh.toFixed(1)),
      },
      cameraCropFactor: Number(cameraCropFactor.toFixed(3)),
      cameraCropCompensation: cameraCropFactor > 1.01 ? 'shorts/vertical cover crop detected; render camera FOV is widened while capturing so the 9:16 video keeps the same usable race view' : 'none',
      cameraFov: Number((this.camera?.fov || 0).toFixed(2)),
      overlay: this.lastViewerOverlaySummary || null,
    };
    return this.lastVideoCompositeSummary;
  }

  getVideoCaptureCanvas() {
    if (!this.videoCompositeCanvas) this.initVideoCompositeCanvas(this.videoCanvasLayoutKey || 'horizontal');
    this.drawVideoCompositeFrame();
    return this.videoCompositeCanvas || this.renderer?.domElement || document.querySelector('canvas');
  }

  renderViewerCanvasOverlay() {
    this.drawViewerCanvasOverlay({ canvas: this.viewerOverlayCanvas, ctx: this.viewerOverlayContext, summaryTarget: 'recording' });
    if (this.webViewerOverlayCanvas && this.webViewerOverlayContext) {
      this.drawViewerCanvasOverlay({ canvas: this.webViewerOverlayCanvas, ctx: this.webViewerOverlayContext, summaryTarget: 'web' });
    }
    this.drawVideoCompositeFrame();
  }

  initPhysics() {
    const profile = this.physicsMechanic || PHYSICS_MECHANIC_PROFILES[DEFAULT_PHYSICS_MECHANIC_KEY];
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, profile.worldGravityY ?? -16, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    // Disable sleeping for racers: small sustained drive forces can be ignored by sleeping Cannon bodies,
    // which makes marbles look like they lose speed or die out around the middle of long tracks.
    this.world.allowSleep = false;
    this.world.solver.iterations = PERFORMANCE_TUNING.physicsSolverIterations;
    this.marbleMaterial = new CANNON.Material('marble');
    this.trackMaterial = new CANNON.Material('track');
    this.railMaterial = new CANNON.Material('rail');
    this.obstacleMaterial = new CANNON.Material('obstacle');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.marbleMaterial, this.trackMaterial, profile.trackContact || NO_ROLLING_SLOWDOWN.trackContact));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.marbleMaterial, this.railMaterial, RAIL_REBOUND));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.marbleMaterial, this.obstacleMaterial, profile.obstacleContact || NO_ROLLING_SLOWDOWN.obstacleContact));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.marbleMaterial, this.marbleMaterial, profile.marbleContact || NO_ROLLING_SLOWDOWN.marbleContact));
    this.world.addEventListener('postStep', () => { this.physicsSteps += 1; });
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    const unlockAudio = () => this.unlockAudio();
    window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    this.ui.start.addEventListener('click', () => {
      if ((this.state === 'ready' || this.state === 'idle') && this.survivorLeague?.active) this.startSurvivorLeagueRaceWithSpotlight();
      else if (this.state === 'ready' || this.state === 'idle') this.startCountdownAndGateOpen();
      else if (this.cupMode?.active && this.cupMode.status === 'awaiting-next') this.advanceCupMatch();
      else if (this.cupMode?.active && this.cupMode.status === 'complete') this.startCupMode(this.cupMode.size);
      else this.newRace({ regenerateTrack: false });
    });
    this.ui.regen.addEventListener('click', () => this.newRace({ regenerateTrack: true }));
    this.ui.pause.addEventListener('click', () => this.togglePause());
    this.ui.uiToggle.addEventListener('click', () => this.toggleLeftUI());
    this.ui.rightUiToggle.addEventListener('click', () => this.toggleRightUI());
    this.ui.controlsToggle.addEventListener('click', () => this.togglePanel(this.ui.controlsPanel, this.ui.controlsToggle));
    this.ui.cameraToggle.addEventListener('click', () => this.togglePanel(this.ui.cameraPanel, this.ui.cameraToggle));
    this.ui.obstacleTypesToggle?.addEventListener('click', () => this.togglePanel(this.ui.obstacleTypesPanel, this.ui.obstacleTypesToggle));
    this.ui.obstacleTypeToggles?.forEach((toggle) => {
      toggle.addEventListener('change', () => this.updateObstacleTypeToggles({ regenerateTrack: true }));
    });
    this.ui.debugToggle?.addEventListener('click', () => this.togglePanel(this.ui.debugPanel, this.ui.debugToggle));
    this.ui.debugPanel?.classList.add('hidden');
    this.ui.debugPanel?.setAttribute('aria-hidden', 'true');
    this.ui.debugToggle?.setAttribute('aria-expanded', 'false');
    this.ui.debugConsoleCopy?.addEventListener('click', () => this.copyDebugConsole());
    this.ui.record.addEventListener('click', () => this.toggleSingleRecording());
    this.ui.continuousRecord?.addEventListener('click', () => this.toggleContinuousRecording());
    this.ui.multipleRaceCount?.addEventListener('change', () => {
      this.ui.multipleRaceCount.value = String(this.getMultipleRecordingTotalRaces());
      this.updateUI();
    });
    this.ui.multipleRaceCount?.addEventListener('input', () => this.updateUI());
    this.ui.autoCupRecord?.addEventListener('click', () => this.toggleAutoCupRecording());
    this.ui.bgmToggle?.addEventListener('change', () => this.setBgmEnabled(this.ui.bgmToggle.checked));
    this.ui.commentaryToggle?.addEventListener('change', () => this.setCommentaryEnabled(this.ui.commentaryToggle.checked));
    this.ui.commentaryVoiceToggle?.addEventListener('change', () => this.setCommentaryVoiceEnabled(this.ui.commentaryVoiceToggle.checked));
    this.ui.ttsVoiceSelect?.addEventListener('change', () => this.setTtsVoice(this.ui.ttsVoiceSelect.value));
    this.ui.ttsPitchSlider?.addEventListener('input', () => this.setTtsPitch(this.ui.ttsPitchSlider.value, { resetQueue: false, updateStatus: false }));
    this.ui.ttsPitchSlider?.addEventListener('change', () => this.setTtsPitch(this.ui.ttsPitchSlider.value, { resetQueue: true, updateStatus: true }));
    this.ui.testTts?.addEventListener('click', () => this.testCommentaryTts());
    this.ui.copyTrackCode?.addEventListener('click', () => this.copyTrackDebugCode());
    this.ui.importTrackCode?.addEventListener('click', () => this.importTrackDebugCode());
    this.ui.raceMode?.addEventListener('change', () => this.updateRaceMode());
    this.ui.cupSize?.addEventListener('change', () => {
      if (this.ui.raceMode?.value === 'cup') this.startCupMode(Number(this.ui.cupSize.value) || 12);
    });
    this.ui.cupName?.addEventListener('input', () => {
      if (this.cupMode?.active) this.showMatchCard();
      this.updateUI();
    });
    this.ui.lengthSelect.addEventListener('change', () => this.newRace({ regenerateTrack: true }));
    this.ui.customLength?.addEventListener('change', () => {
      this.ui.lengthSelect.value = 'custom';
      this.newRace({ regenerateTrack: true });
    });
    this.ui.width.addEventListener('input', () => this.updateWidthPreset({ regenerateTrack: false }));
    this.ui.width.addEventListener('change', () => this.updateWidthPreset({ regenerateTrack: true }));
    this.ui.obstacle.addEventListener('input', () => this.updateObstaclePreset({ regenerateTrack: false }));
    this.ui.obstacle.addEventListener('change', () => this.updateObstaclePreset({ regenerateTrack: true }));
    this.ui.obstacleDistribution?.addEventListener('change', () => this.updateObstacleDistribution({ regenerateTrack: true }));
    this.ui.catchupToggle.addEventListener('change', () => this.updateCatchupAssist());
    this.ui.showGuidePointsToggle?.addEventListener('change', () => this.updateGuidePointsVisibility());
    this.ui.curveSelect.addEventListener('change', () => this.newRace({ regenerateTrack: true }));
    this.ui.visualTheme?.addEventListener('change', () => this.updateVisualTheme({ regenerateMarbles: true, source: 'panel' }));
    this.ui.speed.addEventListener('input', () => this.updateSpeedPreset());
    this.ui.guideBias?.addEventListener('input', () => this.updateGuideBias());
    this.ui.select.addEventListener('change', () => {
      this.selectedIndex = Number(this.ui.select.value || 0);
      this.cameraMode = 'selected';
    });
    document.querySelectorAll('[data-camera]').forEach((button) => {
      button.addEventListener('click', () => { this.cameraMode = button.dataset.camera; });
    });
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') return;
      if (event.key.toLowerCase() === 'r') this.newRace({ regenerateTrack: false });
      const target = event.target;
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (!isTyping && event.key.toLowerCase() === 'h') this.toggleLeftUI();
      if (!isTyping && event.key.toLowerCase() === 'j') this.toggleRightUI();
      if (!isTyping && event.key.toLowerCase() === 'p') this.togglePhysicsHitboxes();
      if (!isTyping && event.key.toLowerCase() === 'v') this.toggleSingleRecording();
      const map = { '1': 'default', '2': 'leadPack', '3': 'selected', '4': 'cinematicLeader', '5': 'orbit' };
      if (map[event.key]) this.cameraMode = map[event.key];
    });
  }

  applyPhysicsMechanic(key = DEFAULT_PHYSICS_MECHANIC_KEY, { source = 'runtime' } = {}) {
    const normalizedKey = PHYSICS_MECHANIC_PROFILES[key] ? key : DEFAULT_PHYSICS_MECHANIC_KEY;
    const profile = PHYSICS_MECHANIC_PROFILES[normalizedKey];
    this.physicsMechanicKey = normalizedKey;
    this.physicsMechanic = profile;
    this.physicsMechanicSource = source;
    this.physicsMechanicAppliedAt = new Date().toISOString();
    this.speedPreset = this.getMechanicAdjustedSpeedPreset(SPEED_PRESETS[this.speedIndex] || SPEED_PRESETS[1], profile);
    this.slopeDrive = { ...SLOPE_DRIVE, ...(profile.slopeDriveOverrides || {}) };
    this.toyParkSoftGuidePhysics = profile.key === 'toyPark' ? (profile.softGuidePhysics || TOY_PARK_SOFT_GUIDE_PHYSICS) : null;
    if (this.world?.gravity) this.world.gravity.set(0, profile.worldGravityY ?? -16, 0);
    if (this.world?.contactmaterials?.length) {
      const contactByPair = [
        [this.marbleMaterial, this.trackMaterial, profile.trackContact || NO_ROLLING_SLOWDOWN.trackContact],
        [this.marbleMaterial, this.railMaterial, RAIL_REBOUND],
        [this.marbleMaterial, this.obstacleMaterial, profile.obstacleContact || NO_ROLLING_SLOWDOWN.obstacleContact],
        [this.marbleMaterial, this.marbleMaterial, profile.marbleContact || NO_ROLLING_SLOWDOWN.marbleContact],
      ];
      this.world.contactmaterials.length = 0;
      contactByPair.forEach(([a, b, options]) => this.world.addContactMaterial(new CANNON.ContactMaterial(a, b, options)));
    }
    (this.marbleData || []).forEach((data) => {
      if (data.body) {
        data.body.linearDamping = profile.linearDamping ?? NO_ROLLING_SLOWDOWN.marbleLinearDamping;
        data.body.angularDamping = profile.angularDamping ?? NO_ROLLING_SLOWDOWN.marbleAngularDamping;
        if (data.baseMass != null) {
          data.body.mass = data.baseMass * (profile.marbleMassScale ?? 1);
          data.body.updateMassProperties();
        }
      }
    });
    if (this.ui?.speedLabel && this.speedPreset) this.ui.speedLabel.textContent = this.speedPreset.label;
    window.__MARBLE_RACE_PHYSICS_MECHANIC__ = this.getPhysicsMechanicDebug();
    return this.physicsMechanic;
  }

  getPhysicsMechanicDebug() {
    const profile = this.physicsMechanic || PHYSICS_MECHANIC_PROFILES[DEFAULT_PHYSICS_MECHANIC_KEY];
    return {
      key: profile.key,
      label: profile.label,
      source: this.physicsMechanicSource,
      appliedAt: this.physicsMechanicAppliedAt,
      renderSafeDefault: Boolean(profile.renderSafeDefault),
      isolatedPreviewOnly: Boolean(profile.isolatedPreviewOnly),
      worldGravityY: this.world?.gravity?.y ?? profile.worldGravityY,
      speedScale: profile.speedScale ?? 1,
      speedPreset: {
        index: this.speedIndex,
        baseLabel: this.speedPreset?.baseLabel || SPEED_PRESETS[this.speedIndex]?.label,
        label: this.speedPreset?.label,
        maxSpeed: Number((this.speedPreset?.maxSpeed || 0).toFixed(3)),
        accel: Number((this.speedPreset?.accel || 0).toFixed(3)),
      },
      marbleMassScale: profile.marbleMassScale ?? 1,
      marbleRadiusScale: profile.marbleRadiusScale ?? 1,
      damping: {
        linear: profile.linearDamping ?? NO_ROLLING_SLOWDOWN.marbleLinearDamping,
        angular: profile.angularDamping ?? NO_ROLLING_SLOWDOWN.marbleAngularDamping,
      },
      contacts: {
        track: profile.trackContact,
        marble: profile.marbleContact,
        obstacle: profile.obstacleContact,
        rail: RAIL_REBOUND,
      },
      slopeDriveModel: this.slopeDrive?.model,
      toyParkPhysicsMode: profile.key === 'toyPark' ? (this.toyParkSoftGuidePhysics?.mode || null) : null,
      toyParkHardSplineLock: profile.key === 'toyPark' ? Boolean(this.toyParkSoftGuidePhysics?.hardSplineLock) : null,
      toyParkCollisionPreserved: profile.key === 'toyPark' ? Boolean(this.toyParkSoftGuidePhysics?.collisionPreserved) : null,
      toyParkGuideAssist: profile.key === 'toyPark' ? {
        forwardAssist: this.toyParkSoftGuidePhysics?.forwardAssist ?? null,
        centerPull: this.toyParkSoftGuidePhysics?.centerPull ?? null,
        curveAssist: this.toyParkSoftGuidePhysics?.curveAssist ?? null,
        bendTangentAssist: this.toyParkSoftGuidePhysics?.bendTangentAssist ?? null,
        maxGuideForce: this.toyParkSoftGuidePhysics?.maxGuideForce ?? null,
        maxCombinedGuideForce: this.toyParkSoftGuidePhysics?.maxCombinedGuideForce ?? null,
        lateralFreedom: this.toyParkSoftGuidePhysics?.lateralFreedom ?? null,
      } : null,
      contactLabel: profile.contactLabel,
      defaultRenderUnaffected: profile.key === DEFAULT_PHYSICS_MECHANIC_KEY,
    };
  }

  applyInitialPreviewParams() {
    const params = new URLSearchParams(window.location.search || '');
    this.showPhysicsHitboxes = params.get('physicsHitboxes') === '1' || params.get('hitboxes') === '1';
    if (this.physicsHitboxGroup) this.physicsHitboxGroup.visible = this.showPhysicsHitboxes;
    window.__MARBLE_RACE_PHYSICS_HITBOXES__ = this.showPhysicsHitboxes;
    const pathKey = String(window.location.pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    const mechanic = String(params.get('physicsMechanic') || '').trim();
    const toyParkPreview = pathKey === 'toypark' || mechanic.toLowerCase() === 'toypark';
    this.toyParkPreviewEndpoint = toyParkPreview;
    document.body?.classList.toggle('toypark-preview-endpoint', toyParkPreview);
    const requestedMechanic = toyParkPreview ? 'toyPark' : (PHYSICS_MECHANIC_PROFILES[mechanic] ? mechanic : DEFAULT_PHYSICS_MECHANIC_KEY);
    this.applyPhysicsMechanic(requestedMechanic, { source: toyParkPreview ? 'toypark-endpoint' : (mechanic ? 'query-param' : 'default-render-safe') });
    const requestedTheme = params.get('visualTheme') || (toyParkPreview ? 'toyPark' : '');
    if (requestedTheme && MARBLE_VISUAL_THEMES[requestedTheme] && this.ui.visualTheme) {
      this.ui.visualTheme.value = requestedTheme;
      this.visualThemeKey = requestedTheme;
      this.visualTheme = MARBLE_VISUAL_THEMES[requestedTheme];
    }

    if (toyParkPreview && this.ui.count) {
      const countParam = params.get('count') || params.get('marbleCount') || params.get('marbles');
      const requestedCount = Math.max(1, Math.floor(Number(countParam) || 8));
      this.ui.count.value = String(requestedCount);
      this.ui.count.dataset.toyParkDefaultCount = countParam ? 'query-param' : '8';
    }

    const obstaclePresetAliases = { none: 0, standard: 1, many: 2, extreme: 3 };
    const requestedObstaclePreset = String(params.get('obstaclePreset') || (toyParkPreview ? 'none' : '')).trim().toLowerCase();
    if (requestedObstaclePreset && this.ui.obstacle) {
      const presetIndex = obstaclePresetAliases[requestedObstaclePreset] ?? Number.parseInt(requestedObstaclePreset, 10);
      if (Number.isFinite(presetIndex)) this.ui.obstacle.value = String(clamp(presetIndex, 0, OBSTACLE_PRESETS.length - 1));
    }

    const requestedTypes = String(params.get('obstacleTypes') || '')
      .split(',')
      .map((type) => type.trim())
      .filter((type) => PINBALL_OBSTACLE_TYPES.includes(type));
    if (requestedTypes.length) {
      const typeSet = new Set(requestedTypes);
      (this.ui.obstacleTypeToggles || []).forEach((toggle) => {
        toggle.checked = typeSet.has(toggle.dataset.obstacleType);
      });
      this.enabledObstacleTypes = typeSet;
    } else if (toyParkPreview) {
      (this.ui.obstacleTypeToggles || []).forEach((toggle) => {
        toggle.checked = false;
      });
      this.enabledObstacleTypes = new Set();
    }

    window.__MARBLE_RACE_INITIAL_PREVIEW__ = {
      path: pathKey || '/',
      physicsMechanic: mechanic || null,
      toyParkPreview,
      toyParkDefaultCount: toyParkPreview && this.ui.count ? this.ui.count.dataset.toyParkDefaultCount || null : null,
      visualThemeKey: this.visualThemeKey,
      obstaclePresetIndex: this.ui.obstacle ? Number(this.ui.obstacle.value) : this.obstacleIndex,
      obstacleTypes: [...(this.enabledObstacleTypes || new Set())],
      activePhysicsMechanic: this.getPhysicsMechanicDebug(),
    };
  }

  buildRaceThemeOverlay() {
    if (this.toyParkPreviewEndpoint && this.ui.raceThemeOverlay) {
      this.ui.raceThemeOverlay.classList.add('hidden');
      this.ui.raceThemeOverlay.setAttribute('aria-hidden', 'true');
      this.ui.raceThemeOverlay.dataset.hiddenForToyPark = 'true';
      window.__MARBLE_RACE_THEME_OVERLAY__ = {
        visible: false,
        hiddenForToyPark: true,
        activeTheme: this.visualThemeKey,
        reason: 'toypark-endpoint-keeps-theme-list-overlay-collapsed',
      };
      return;
    }
    const container = this.ui.raceThemeOverlayOptions;
    if (!container) return;
    container.textContent = '';
    Object.values(MARBLE_VISUAL_THEMES).forEach((theme) => {
      const world = this.getWorldVisualThemeStyle(theme);
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'race-theme-option';
      option.dataset.themeKey = theme.key;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', theme.key === this.visualThemeKey ? 'true' : 'false');
      option.style.setProperty('--theme-accent', world.track?.accent || '#7cf7d4');
      option.style.setProperty('--theme-secondary', world.track?.secondary || '#ff77b7');
      option.innerHTML = `<strong>${theme.label}</strong><small>${world.track?.pattern || theme.description}</small>`;
      option.addEventListener('click', () => this.updateVisualTheme({ themeKey: theme.key, regenerateMarbles: true, source: 'overlay' }));
      container.appendChild(option);
    });
    this.updateRaceThemeOverlay();
  }

  updateRaceThemeOverlay() {
    const activeTheme = this.visualTheme || MARBLE_VISUAL_THEMES[DEFAULT_MARBLE_VISUAL_THEME_KEY];
    const world = this.getWorldVisualThemeStyle(activeTheme);
    if (this.ui.raceThemeOverlayLabel) this.ui.raceThemeOverlayLabel.textContent = activeTheme.label;
    if (this.ui.raceThemeOverlayNote) {
      this.ui.raceThemeOverlayNote.textContent = `${activeTheme.description} Covers: marbles, track floor, rails, ground, start gate.`;
    }
    this.ui.raceThemeOverlayOptions?.querySelectorAll('.race-theme-option').forEach((button) => {
      const active = button.dataset.themeKey === activeTheme.key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (this.ui.raceThemeOverlay) {
      const hiddenForToyPark = this.ui.raceThemeOverlay.dataset.hiddenForToyPark === 'true';
      this.ui.raceThemeOverlay.dataset.activeTheme = activeTheme.key;
      this.ui.raceThemeOverlay.style.setProperty('--theme-accent', world.track?.accent || '#7cf7d4');
      this.ui.raceThemeOverlay.style.setProperty('--theme-secondary', world.track?.secondary || '#ff77b7');
      window.__MARBLE_RACE_THEME_OVERLAY__ = {
        visible: !hiddenForToyPark && !this.ui.raceThemeOverlay.classList.contains('hidden'),
        hiddenForToyPark,
        activeTheme: activeTheme.key,
      };
    }
  }

  updateVisualTheme({ regenerateMarbles = false, themeKey = null, source = 'panel' } = {}) {
    const requested = themeKey || this.ui.visualTheme?.value || this.visualThemeKey || DEFAULT_MARBLE_VISUAL_THEME_KEY;
    this.visualThemeKey = MARBLE_VISUAL_THEMES[requested] ? requested : DEFAULT_MARBLE_VISUAL_THEME_KEY;
    this.visualTheme = MARBLE_VISUAL_THEMES[this.visualThemeKey] || MARBLE_VISUAL_THEMES[DEFAULT_MARBLE_VISUAL_THEME_KEY];
    if (this.ui.visualTheme) this.ui.visualTheme.value = this.visualThemeKey;
    this.updateRaceThemeOverlay();
    window.__MARBLE_RACE_LAST_THEME_CHANGE__ = {
      source,
      themeKey: this.visualThemeKey,
      label: this.visualTheme.label,
      state: this.state,
      changedAt: new Date().toISOString(),
    };
    if (regenerateMarbles) this.newRace({ regenerateTrack: true });
    else this.updateUI();
  }

  getWorldVisualThemeStyle(theme = this.visualTheme) {
    const key = theme?.key || this.visualThemeKey || DEFAULT_MARBLE_VISUAL_THEME_KEY;
    return WORLD_VISUAL_THEME_STYLES[key] || WORLD_VISUAL_THEME_STYLES[DEFAULT_MARBLE_VISUAL_THEME_KEY];
  }

  getVisualThemeStyles(theme = this.visualTheme) {
    if (!theme || theme.key === 'mixed') {
      return {
        colorStyles: MARBLE_COLOR_STYLES,
        patternStyles: MARBLE_PATTERN_STYLES,
        materialOverride: null,
      };
    }
    const colorStyles = (theme.colorLabels || [])
      .map((label) => MARBLE_COLOR_STYLES.find((style) => style.label === label))
      .filter(Boolean);
    const patternStyles = (theme.patternKeys || [])
      .map((key) => MARBLE_PATTERN_STYLES.find((style) => style.key === key))
      .filter(Boolean);
    return {
      colorStyles: colorStyles.length ? colorStyles : MARBLE_COLOR_STYLES,
      patternStyles: patternStyles.length ? patternStyles : MARBLE_PATTERN_STYLES,
      materialOverride: theme.materialOverride || null,
    };
  }

  updateRaceMode() {
    const mode = this.ui.raceMode?.value || 'single';
    if (mode === 'cup') this.startCupMode(Number(this.ui.cupSize?.value) || 12);
    else if (mode === 'survivor') this.startSurvivorLeagueMode();
    else {
      this.cupMode = { ...this.cupMode, active: false, status: 'idle', stageIndex: 0, currentEntrants: [], results: [], lastQualified: [], champion: null, podium: [] };
      this.survivorLeague = { ...this.survivorLeague, active: false, status: 'idle', roster: [], spotlight: null };
      this.hideMatchCard();
      this.hideSurvivorSpotlight();
      this.ui.count.disabled = false;
      this.newRace({ regenerateTrack: true });
    }
  }

  applyCupVideoStageTrackSettings(stage = this.getCupStage()) {
    if (!this.cupMode?.active || !CUP_VIDEO_TIMING.enabled) return;
    const targetLength = CUP_VIDEO_TIMING.stageTrackLengths?.[stage];
    if (!targetLength || !this.ui.lengthSelect || !this.ui.customLength) return;
    this.ui.lengthSelect.value = CUP_VIDEO_TIMING.stageLengthPreset || 'custom';
    this.ui.customLength.value = String(targetLength);
  }

  getCupVideoTimingEstimate() {
    const estimatedSeconds = estimateCupVideoSeconds(CUP_VIDEO_TIMING);
    return {
      ...CUP_VIDEO_TIMING,
      estimatedSeconds,
      estimatedMinutes: Number((estimatedSeconds / 60).toFixed(2)),
      targetDeltaSeconds: Number((estimatedSeconds - CUP_VIDEO_TIMING.targetSeconds).toFixed(1)),
    };
  }

  startCupMode(size = 12, { preserveCurrentSettings = true } = {}) {
    const rawSize = Math.round(Number(size) || 12);
    const cupSize = Math.max(2, Math.min(99, rawSize));
    this.survivorLeague = { ...this.survivorLeague, active: false, status: 'idle', roster: [], spotlight: null };
    this.hideSurvivorSpotlight();
    if (this.ui.raceMode) this.ui.raceMode.value = 'cup';
    if (this.ui.cupSize) this.ui.cupSize.value = String(cupSize);
    if (this.ui.count) {
      this.ui.count.value = String(cupSize);
      this.ui.count.disabled = true;
    }
    const entrants = Array.from({ length: cupSize }, (_, index) => this.createMarbleIdentity(index, cupSize));
    this.cupMode = {
      active: true,
      status: 'ready',
      size: cupSize,
      stageIndex: 0,
      stages: ['quarter-final', 'semi-final', 'final'],
      entrants,
      currentEntrants: entrants,
      results: [],
      lastQualified: [],
      champion: null,
      podium: [],
    };
    this.applyCupVideoStageTrackSettings('quarter-final');
    this.newRace({ regenerateTrack: true });
  }

  resetDefaultAutoCameraForRace({ preservePhase = false } = {}) {
    this.cameraMode = 'default';
    this.leadPackInitialized = false;
    this.leadBattleInitialized = false;
    this.leadBattleState = null;
    this.defaultCameraFocusId = null;
    if (!preservePhase) this.defaultCameraPhaseUntil = 0;
    if (this.state === 'finished' && !this.replayHighlight?.active) this.activeCameraMode = this.getDefaultCameraMode();
  }

  getCupDisplayName() {
    const rawName = this.ui.cupName?.value?.trim() || 'Speed X Cup';
    return rawName.slice(0, 36);
  }

  getCupStage() {
    return this.cupMode?.stages?.[this.cupMode.stageIndex] || 'single';
  }

  getCupStageTitle(stage = this.getCupStage()) {
    return {
      'quarter-final': 'Quarter Final',
      'semi-final': 'Semi Final',
      final: 'Final',
    }[stage] || 'Single Race';
  }

  getCupQualifierCount(stage = this.getCupStage()) {
    if (!this.cupMode?.active) return 0;
    if (stage === 'quarter-final') return Math.max(1, Math.floor(this.cupMode.size / 2));
    if (stage === 'semi-final') return Math.max(1, Math.floor(this.cupMode.size / 4));
    return 3;
  }

  showMatchCard() {
    if (!this.ui.matchCard) return;
    if (!this.cupMode?.active) {
      this.ui.matchCard.classList.add('hidden');
      return;
    }
    const stage = this.getCupStage();
    const title = this.getCupStageTitle(stage);
    const cupName = this.getCupDisplayName();
    const entrants = this.cupMode.currentEntrants || [];
    const qualifierCount = this.getCupQualifierCount(stage);
    const rule = stage === 'final'
      ? 'Top 3 enter the Cup Champion Ceremony'
      : `Top ${qualifierCount} qualify for the next round`;
    const entrantsHtml = entrants.slice(0, 8).map((entry) => `<li><span class="swatch" style="background:${entry.colorHex};color:${entry.colorHex}"></span>${entry.name}</li>`).join('');
    const more = entrants.length > 8 ? `<li class="more">+${entrants.length - 8} more contenders</li>` : '';
    this.ui.matchCard.innerHTML = `<span class="match-kicker">${cupName}</span><h2>${title}</h2><p>${entrants.length} marbles racing · ${rule}</p><ol>${entrantsHtml}${more}</ol>`;
    this.ui.matchCard.classList.remove('hidden');
  }

  hideMatchCard() {
    if (this.ui.matchCard) this.ui.matchCard.classList.add('hidden');
  }

  escapeOverlayHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  normalizeSurvivorIdentity(identity, index = 0, count = SURVIVOR_LEAGUE.fieldSize) {
    const fallback = this.createMarbleIdentity(index, count);
    const merged = { ...fallback, ...(identity && typeof identity === 'object' ? identity : {}) };
    const numericColor = Number.isFinite(Number(merged.color))
      ? Number(merged.color)
      : Number.parseInt(String(merged.colorHex || fallback.colorHex || '#ffffff').replace('#', ''), 16);
    const paletteHex = Array.isArray(merged.paletteHex) && merged.paletteHex.length ? merged.paletteHex : fallback.paletteHex;
    const materialName = String(merged.materialName || fallback.materialName || 'Glass');
    const patternName = String(merged.patternName || fallback.patternName || 'Orbit Rings');
    const visualTagline = String(merged.visualTagline || `${materialName} ${patternName}`);
    return {
      ...merged,
      id: Number.isFinite(Number(merged.id)) ? Number(merged.id) : index,
      code: String(merged.code || fallback.code),
      name: String(merged.name || fallback.name),
      displayName: String(merged.displayName || `${merged.code || fallback.code} ${merged.name || fallback.name}`),
      color: Number.isFinite(numericColor) ? numericColor : fallback.color,
      colorHex: String(merged.colorHex || fallback.colorHex),
      paletteHex,
      palette: Array.isArray(merged.palette) && merged.palette.length
        ? merged.palette
        : paletteHex.map((hex) => Number.parseInt(String(hex).replace('#', ''), 16)).filter(Number.isFinite),
      materialName,
      patternName,
      visualTagline,
      radius: Number.isFinite(Number(merged.radius)) ? Number(merged.radius) : fallback.radius,
    };
  }

  normalizeSurvivorStats(stats, identity) {
    const base = this.createSurvivorStats(identity);
    const source = stats && typeof stats === 'object' ? stats : {};
    const normalized = { ...base, ...source, code: identity.code, name: source.name || identity.name, colorHex: source.colorHex || identity.colorHex };
    ['races', 'wins', 'podiums', 'top5', 'cyclePoints', 'cycleRaces', 'lifetimePoints', 'currentWinStreak', 'currentPodiumStreak', 'survivedCycles'].forEach((key) => {
      normalized[key] = Number.isFinite(Number(normalized[key])) ? Number(normalized[key]) : base[key];
    });
    normalized.recentResults = Array.isArray(source.recentResults) ? source.recentResults.slice(-5) : [];
    normalized.newcomer = Boolean(source.newcomer ?? base.newcomer);
    return normalized;
  }

  normalizeSurvivorLeagueState(state) {
    if (!state || typeof state !== 'object') return null;
    const fieldSize = Math.max(1, Math.min(99, Math.round(Number(state.fieldSize || SURVIVOR_LEAGUE.fieldSize))));
    const rosterSource = Array.isArray(state.roster) ? state.roster : [];
    const roster = Array.from({ length: fieldSize }, (_, index) => this.normalizeSurvivorIdentity(rosterSource[index], index, fieldSize));
    const standingsSource = state.standings && typeof state.standings === 'object' ? state.standings : {};
    const standings = { ...standingsSource };
    roster.forEach((identity) => {
      standings[identity.code] = this.normalizeSurvivorStats(standingsSource[identity.code], identity);
    });
    return {
      fieldSize,
      cycleSize: Math.max(1, Math.round(Number(state.cycleSize || SURVIVOR_LEAGUE.cycleSize))),
      keepCount: Math.max(1, Math.min(fieldSize, Math.round(Number(state.keepCount || SURVIVOR_LEAGUE.keepCount)))),
      raceNumber: Math.max(0, Math.round(Number(state.raceNumber || 0))),
      cycleRaceNumber: Math.max(0, Math.round(Number(state.cycleRaceNumber || 0))),
      generation: Math.max(1, Math.round(Number(state.generation || 1))),
      roster,
      standings,
      history: Array.isArray(state.history) ? state.history : [],
      lastSurvivors: Array.isArray(state.lastSurvivors) ? state.lastSurvivors.map((identity, index) => this.normalizeSurvivorIdentity(identity, index, fieldSize)) : [],
      lastReplaced: Array.isArray(state.lastReplaced) ? state.lastReplaced.map((identity, index) => this.normalizeSurvivorIdentity(identity, index, fieldSize)) : [],
    };
  }

  exportSurvivorLeagueState() {
    if (!this.survivorLeague?.active) return null;
    const league = this.survivorLeague;
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      fieldSize: league.fieldSize,
      cycleSize: league.cycleSize,
      keepCount: league.keepCount,
      raceNumber: league.raceNumber,
      cycleRaceNumber: league.cycleRaceNumber,
      generation: league.generation,
      roster: league.roster || [],
      standings: league.standings || {},
      history: league.history || [],
      lastSurvivors: league.lastSurvivors || [],
      lastReplaced: league.lastReplaced || [],
    };
  }

  startSurvivorLeagueMode({ initialState = null } = {}) {
    const importedState = this.normalizeSurvivorLeagueState(initialState);
    const fieldSize = importedState?.fieldSize || SURVIVOR_LEAGUE.fieldSize;
    const roster = importedState?.roster?.length
      ? importedState.roster.slice(0, fieldSize)
      : Array.from({ length: fieldSize }, (_, index) => this.createMarbleIdentity(index, fieldSize));
    this.cupMode = { ...this.cupMode, active: false, status: 'idle', stageIndex: 0, currentEntrants: [], results: [], lastQualified: [], champion: null, podium: [] };
    if (this.ui.raceMode) this.ui.raceMode.value = 'survivor';
    if (this.ui.count) {
      this.ui.count.value = String(fieldSize);
      this.ui.count.disabled = true;
    }
    this.survivorLeague = {
      ...this.survivorLeague,
      active: true,
      status: 'ready',
      fieldSize,
      cycleSize: importedState?.cycleSize || SURVIVOR_LEAGUE.cycleSize,
      keepCount: importedState?.keepCount || SURVIVOR_LEAGUE.keepCount,
      raceNumber: Number(importedState?.raceNumber || 0),
      cycleRaceNumber: Number(importedState?.cycleRaceNumber || 0),
      generation: Number(importedState?.generation || 1),
      roster,
      history: Array.isArray(importedState?.history) ? importedState.history : [],
      standings: importedState?.standings || Object.fromEntries(roster.map((identity) => [identity.code, this.createSurvivorStats(identity)])),
      lastSurvivors: Array.isArray(importedState?.lastSurvivors) ? importedState.lastSurvivors : [],
      lastReplaced: Array.isArray(importedState?.lastReplaced) ? importedState.lastReplaced : [],
      spotlight: null,
    };
    this.hideMatchCard();
    this.newRace({ regenerateTrack: true });
  }

  createSurvivorStats(identity) {
    return {
      code: identity.code,
      name: identity.name,
      colorHex: identity.colorHex,
      races: 0,
      wins: 0,
      podiums: 0,
      top5: 0,
      cyclePoints: 0,
      cycleRaces: 0,
      lifetimePoints: 0,
      currentWinStreak: 0,
      currentPodiumStreak: 0,
      survivedCycles: 0,
      recentResults: [],
      newcomer: true,
    };
  }

  getSurvivorStats(identity) {
    if (!identity?.code) return null;
    if (!this.survivorLeague.standings[identity.code]) this.survivorLeague.standings[identity.code] = this.createSurvivorStats(identity);
    return this.survivorLeague.standings[identity.code];
  }

  getSurvivorPointsForRank(rank) {
    const points = SURVIVOR_LEAGUE.pointsByRank[Math.max(0, rank - 1)];
    return Number.isFinite(points) ? points : 0;
  }

  handleSurvivorLeagueRaceComplete(finalRanking) {
    if (!this.survivorLeague?.active) return;
    const league = this.survivorLeague;
    league.raceNumber += 1;
    league.cycleRaceNumber += 1;
    const raceResult = [];
    finalRanking.forEach((data, index) => {
      const identity = data.reusableIdentity || league.roster.find((entry) => entry.code === data.code);
      const stats = this.getSurvivorStats(identity || data);
      if (!stats) return;
      const rank = index + 1;
      const points = this.getSurvivorPointsForRank(rank);
      stats.name = data.name || stats.name;
      stats.colorHex = data.colorHex || stats.colorHex;
      stats.races += 1;
      stats.cycleRaces += 1;
      stats.cyclePoints += points;
      stats.lifetimePoints += points;
      stats.wins += rank === 1 ? 1 : 0;
      stats.podiums += rank <= 3 ? 1 : 0;
      stats.top5 += rank <= 5 ? 1 : 0;
      stats.currentWinStreak = rank === 1 ? stats.currentWinStreak + 1 : 0;
      stats.currentPodiumStreak = rank <= 3 ? stats.currentPodiumStreak + 1 : 0;
      stats.newcomer = false;
      stats.recentResults = [...(stats.recentResults || []), { race: league.raceNumber, rank, points }].slice(-5);
      raceResult.push({ rank, points, code: stats.code, name: stats.name });
    });
    league.history.push({ race: league.raceNumber, generation: league.generation, results: raceResult });
    if (league.cycleRaceNumber >= league.cycleSize) this.settleSurvivorCycle();
    league.spotlight = this.buildSurvivorSpotlight();
  }

  settleSurvivorCycle() {
    const league = this.survivorLeague;
    if (!league?.active) return;
    const scoredRoster = league.roster.map((identity) => {
      const stats = this.getSurvivorStats(identity);
      const average = stats?.cycleRaces ? stats.cyclePoints / stats.cycleRaces : 0;
      return { identity, stats, average };
    }).sort((a, b) => b.average - a.average || (b.stats?.wins || 0) - (a.stats?.wins || 0) || (b.stats?.podiums || 0) - (a.stats?.podiums || 0));
    const survivors = scoredRoster.slice(0, league.keepCount).map((entry) => entry.identity);
    const replaced = scoredRoster.slice(league.keepCount).map((entry) => entry.identity);
    survivors.forEach((identity) => {
      const stats = this.getSurvivorStats(identity);
      if (!stats) return;
      stats.survivedCycles += 1;
      stats.cyclePoints = 0;
      stats.cycleRaces = 0;
    });
    const newcomersNeeded = Math.max(0, league.fieldSize - survivors.length);
    const newcomers = Array.from({ length: newcomersNeeded }, (_, index) => {
      const identity = this.createMarbleIdentity(league.generation * 100 + index + survivors.length, league.fieldSize + league.generation * 100);
      this.survivorLeague.standings[identity.code] = this.createSurvivorStats(identity);
      return identity;
    });
    league.lastSurvivors = survivors;
    league.lastReplaced = replaced;
    league.roster = [...survivors, ...newcomers];
    league.cycleRaceNumber = 0;
    league.generation += 1;
    this.pushBroadcastEvent('Survivor Cut', `${survivors.length} survive · ${replaced.length} replaced`, { kind: 'complete', force: true, lines: [`${survivors.length} survive the cut`, `${replaced.length} new challengers enter`] });
  }

  buildSurvivorSpotlight() {
    const league = this.survivorLeague;
    if (!league?.active || !league.roster?.length) return null;
    const candidates = league.roster.map((identity) => {
      const stats = this.getSurvivorStats(identity) || this.createSurvivorStats(identity);
      const recent = stats.recentResults || [];
      const recentWins = recent.filter((result) => result.rank === 1).length;
      const recentTop5 = recent.filter((result) => result.rank <= 5).length;
      const lines = [];
      let drama = 0;
      const visualTagline = identity.visualTagline || [identity.materialName, identity.patternName].filter(Boolean).join(' ') || identity.colorName || 'signature marble look';
      const earnedTitles = [];
      if (stats.currentWinStreak >= 2) { lines.push(`${identity.name} has ${stats.currentWinStreak} wins in a row`); earnedTitles.push('Win Streak'); drama += 20 + stats.currentWinStreak; }
      if (recentWins >= 2) { lines.push(`${identity.name} has ${recentWins} wins in the recent 5 races`); earnedTitles.push('Hot Streak'); drama += 16 + recentWins; }
      if (stats.currentPodiumStreak >= 3) { lines.push(`${identity.name} is on a ${stats.currentPodiumStreak}-race podium streak`); earnedTitles.push('Podium Machine'); drama += 14; }
      if (recentTop5 >= 4) { lines.push(`${identity.name} finished top 5 in ${recentTop5} of the recent 5`); earnedTitles.push('Front Pack Regular'); drama += 10; }
      if (stats.survivedCycles >= 1) { lines.push(`${identity.name} survived ${stats.survivedCycles} cut${stats.survivedCycles === 1 ? '' : 's'}`); earnedTitles.push('Survivor'); drama += 8 + stats.survivedCycles; }
      if (stats.newcomer || stats.races === 0) { lines.push(`${identity.name} debuts with ${visualTagline}`); drama += 6; }
      if (!lines.length) lines.push(`${identity.name} rolls with ${visualTagline}`);
      if (earnedTitles.length && lines.length < 2) lines.push(`Earned title: ${earnedTitles[0]}`);
      return { identity, stats, drama, earnedTitles, visualTagline, lines: lines.slice(0, 2) };
    }).sort((a, b) => b.drama - a.drama || Math.random() - 0.5);
    return {
      title: 'Race Spotlight',
      subtitle: '',
      marbles: candidates.slice(0, 2),
    };
  }

  showSurvivorSpotlight() {
    if (!this.ui.survivorSpotlight || !this.survivorLeague?.active) return false;
    const spotlight = this.survivorLeague.spotlight || this.buildSurvivorSpotlight();
    if (!spotlight?.marbles?.length) return false;
    this.survivorLeague.spotlight = spotlight;
    this.survivorLeague.spotlightStartedAt = performance.now();
    this.survivorLeague.lastCanvasSurvivorSpotlightSummary = null;
    const cards = spotlight.marbles.map(({ identity, lines }) => {
      const color = this.escapeOverlayHtml(identity.colorHex || '#7cf7d4');
      const lineHtml = lines.map((line) => `<li>${this.escapeOverlayHtml(line)}</li>`).join('');
      return `<article class="survivor-spotlight-card" style="--spotlight-color:${color}"><div class="survivor-spotlight-name"><span class="swatch"></span><span>${this.escapeOverlayHtml(identity.name)}</span></div><ul class="survivor-spotlight-lines">${lineHtml}</ul></article>`;
    }).join('');
    const ruleHtml = spotlight.subtitle ? `<p class="spotlight-rule">${this.escapeOverlayHtml(spotlight.subtitle)}</p>` : '';
    this.ui.survivorSpotlight.innerHTML = `<span class="spotlight-kicker">Survivor League</span><h2>${this.escapeOverlayHtml(spotlight.title)}</h2>${ruleHtml}<div class="survivor-spotlight-grid">${cards}</div>`;
    this.ui.survivorSpotlight.classList.remove('hidden');
    return true;
  }

  hideSurvivorSpotlight() {
    if (this.survivorLeague?.spotlightTimer) {
      clearTimeout(this.survivorLeague.spotlightTimer);
      this.survivorLeague.spotlightTimer = null;
    }
    if (this.ui?.survivorSpotlight) this.ui.survivorSpotlight.classList.add('hidden');
    this.survivorLeague.spotlightStartedAt = 0;
    this.survivorLeague.lastCanvasSurvivorSpotlightSummary = { active: false };
  }

  startSurvivorLeagueRaceWithSpotlight() {
    if (!this.survivorLeague?.active || this.state !== 'ready') return;
    this.hideMatchCard();
    this.showSurvivorSpotlight();
    this.survivorLeague.status = 'spotlight';
    this.ui.start.textContent = 'Spotlight';
    this.survivorLeague.spotlightTimer = setTimeout(() => {
      if (!this.survivorLeague?.active || this.state !== 'ready') return;
      this.hideSurvivorSpotlight();
      this.survivorLeague.status = 'countdown';
      this.startCountdownAndGateOpen();
    }, Math.max(0, Number(this.survivorLeague.spotlightSeconds) || SURVIVOR_LEAGUE.spotlightSeconds) * 1000);
  }

  advanceCupMatch() {
    if (!this.cupMode?.active || this.cupMode.status !== 'awaiting-next') return;
    this.cupMode.stageIndex = Math.min(this.cupMode.stageIndex + 1, this.cupMode.stages.length - 1);
    this.cupMode.currentEntrants = this.cupMode.lastQualified || [];
    this.cupMode.lastQualified = [];
    this.cupMode.status = 'ready';
    this.applyCupVideoStageTrackSettings(this.getCupStage());
    this.newRace({ regenerateTrack: true });
  }

  handleCupRaceComplete(ranking) {
    if (!this.cupMode?.active) return;
    const stage = this.getCupStage();
    const podiumRanking = this.getPodiumRanking({ force: true });
    const result = {
      stage,
      title: this.getCupStageTitle(stage),
      entrants: (this.cupMode.currentEntrants || []).map((entry) => entry.name),
      ranking: podiumRanking.map((data, index) => ({ rank: index + 1, name: data.name, code: data.code, finishTime: data.finishTime, colorHex: data.colorHex })),
      dnf: ranking.filter((data) => data.defeated).map((data) => ({ name: data.name, code: data.code, progress: data.progress, defeatReason: data.defeatReason })),
    };
    this.cupMode.results.push(result);
    if (stage === 'final') {
      this.cupMode.podium = podiumRanking.slice(0, 3).map((data, index) => ({ rank: index + 1, name: data.name, code: data.code, finishTime: data.finishTime, colorHex: data.colorHex }));
      this.cupMode.champion = this.cupMode.podium[0] || null;
      this.cupMode.status = 'complete';
      this.pushBroadcastEvent('Cup Champion Ceremony', this.buildPodiumResultLine(podiumRanking), { kind: 'complete', force: true, lines: [this.buildPodiumResultLine(podiumRanking)] });
    } else {
      const qualifierCount = this.getCupQualifierCount(stage);
      this.cupMode.lastQualified = podiumRanking.slice(0, qualifierCount).map((data) => data.reusableIdentity || this.createMarbleIdentity(data.id, qualifierCount));
      this.cupMode.status = 'awaiting-next';
      this.pushBroadcastEvent('Qualified', `${this.cupMode.lastQualified.length} advance`, { kind: 'complete', force: true });
    }
  }

  getMechanicAdjustedSpeedPreset(basePreset = this.speedPreset, profile = this.physicsMechanic) {
    const mechanic = profile || PHYSICS_MECHANIC_PROFILES[DEFAULT_PHYSICS_MECHANIC_KEY];
    return {
      ...basePreset,
      label: mechanic.key === DEFAULT_PHYSICS_MECHANIC_KEY ? basePreset.label : `${basePreset.label} / ${mechanic.label}`,
      startImpulse: (basePreset.startImpulse || 0) * (mechanic.startImpulseScale ?? mechanic.speedScale ?? 1),
      maxSpeed: (basePreset.maxSpeed || 0) * (mechanic.maxSpeedScale ?? mechanic.speedScale ?? 1),
      accel: (basePreset.accel || 0) * (mechanic.accelScale ?? mechanic.speedScale ?? 1),
      unstuck: (basePreset.unstuck || 0) * (mechanic.unstuckScale ?? mechanic.speedScale ?? 1),
      baseLabel: basePreset.label,
      mechanicKey: mechanic.key,
    };
  }

  updateSpeedPreset() {
    this.speedIndex = clamp(Math.round(Number(this.ui.speed.value) || 0), 0, SPEED_PRESETS.length - 1);
    this.speedPreset = this.getMechanicAdjustedSpeedPreset(SPEED_PRESETS[this.speedIndex]);
    this.ui.speed.value = String(this.speedIndex);
    this.ui.speedLabel.textContent = this.speedPreset.label;
    this.updateUI();
  }

  updateGuideBias() {
    const raw = Number(this.ui.guideBias?.value);
    const fallback = this.slopeDrive?.guidePointBias ?? SLOPE_DRIVE.guidePointBias ?? 0.68;
    const next = clamp(Number.isFinite(raw) ? raw / 100 : fallback, SLOPE_DRIVE.guidePointBiasMin ?? 0, SLOPE_DRIVE.guidePointBiasMax ?? 1);
    this.slopeDrive = { ...this.slopeDrive, guidePointBias: next };
    if (this.ui.guideBias) this.ui.guideBias.value = String(Math.round(next * 100));
    if (this.ui.guideBiasLabel) this.ui.guideBiasLabel.textContent = `${Math.round(next * 100)}%`;
    this.updateUI();
  }

  updateWidthPreset({ regenerateTrack = false } = {}) {
    const keys = Object.keys(WIDTH_PRESETS);
    const index = clamp(Math.round(Number(this.ui.width.value) || 0), 0, keys.length - 1);
    const nextKey = keys[index];
    const changed = nextKey !== this.widthPresetKey;
    this.widthPresetKey = nextKey;
    this.widthPreset = WIDTH_PRESETS[this.widthPresetKey];
    this.ui.width.value = String(index);
    this.ui.widthLabel.textContent = this.widthPreset.label;
    if (regenerateTrack) this.newRace({ regenerateTrack: true });
    else this.updateUI();
  }

  updateObstaclePreset({ regenerateTrack = false } = {}) {
    const index = clamp(Math.round(Number(this.ui.obstacle.value) || 0), 0, OBSTACLE_PRESETS.length - 1);
    this.obstacleIndex = index;
    this.obstaclePreset = OBSTACLE_PRESETS[this.obstacleIndex];
    this.ui.obstacle.value = String(index);
    this.ui.obstacleLabel.textContent = this.obstaclePreset.label;
    if (regenerateTrack) this.newRace({ regenerateTrack: true });
    else this.updateUI();
  }

  updateObstacleDistribution({ regenerateTrack = false } = {}) {
    const mode = this.ui.obstacleDistribution?.value || 'random';
    this.obstacleDistributionMode = OBSTACLE_DISTRIBUTION_MODES[mode] ? mode : 'random';
    if (this.ui.obstacleDistribution) this.ui.obstacleDistribution.value = this.obstacleDistributionMode;
    if (regenerateTrack) this.newRace({ regenerateTrack: true });
    else this.updateUI();
  }

  buildObstacleTypeToggles() {
    const container = document.querySelector('#obstacle-type-toggles');
    if (!container) return;
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    container.innerHTML = Object.entries(PINBALL_OBSTACLE_CATALOG).map(([categoryKey, category]) => {
      const types = category.types || [];
      const body = types.length
        ? types.map((type) => {
          const metadata = PINBALL_OBSTACLE_TYPE_METADATA[type] || { label: type, category: categoryKey };
          return `<label><span>${escapeHtml(metadata.label)}</span><input type="checkbox" data-obstacle-type="${escapeHtml(type)}" data-obstacle-category="${escapeHtml(categoryKey)}" /></label>`;
        }).join('')
        : `<small>暫未有現有障礙物；預留給之後${escapeHtml(category.description || '新效果')}。</small>`;
      return `<fieldset class="obstacle-category" data-obstacle-category="${escapeHtml(categoryKey)}"><legend>${escapeHtml(category.label)}</legend>${body}</fieldset>`;
    }).join('');
    this.ui.obstacleTypeToggles = Array.from(document.querySelectorAll('[data-obstacle-type]'));
    this.ui.obstacleTypeToggles.forEach((toggle) => {
      toggle.addEventListener('change', () => this.updateObstacleTypeToggles({ regenerateTrack: true }));
    });
  }

  updateObstacleTypeToggles({ regenerateTrack = false } = {}) {
    const checkedTypes = (this.ui.obstacleTypeToggles || [])
      .filter((toggle) => toggle.checked)
      .map((toggle) => toggle.dataset.obstacleType)
      .filter((type) => PINBALL_OBSTACLE_TYPES.includes(type));
    const nextTypes = checkedTypes;
    this.enabledObstacleTypes = new Set(nextTypes);
    (this.ui.obstacleTypeToggles || []).forEach((toggle) => {
      toggle.checked = this.enabledObstacleTypes.has(toggle.dataset.obstacleType);
    });
    if (regenerateTrack) this.newRace({ regenerateTrack: true });
    else this.updateUI();
  }

  updateCatchupAssist() {
    this.catchupAssistEnabled = Boolean(this.ui.catchupToggle?.checked);
    if (this.ui.catchupLabel) this.ui.catchupLabel.textContent = this.catchupAssistEnabled ? 'On' : 'Off';
    this.updateUI();
  }

  updateGuidePointsVisibility() {
    this.showGuidePoints = Boolean(this.ui.showGuidePointsToggle?.checked);
    if (this.guidePointGroup) this.guidePointGroup.visible = this.showGuidePoints;
    this.updateUI();
  }

  clearGuidePointMarkers() {
    if (!this.guidePointGroup) return;
    this.guidePointGroup.children.forEach((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    this.guidePointGroup.clear();
  }

  buildGuidePointMarkers() {
    if (!this.guidePointGroup) return;
    this.clearGuidePointMarkers();
    const markerGeometry = new THREE.SphereGeometry(0.32, 12, 8);
    const materialByRole = {
      inside: new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.82, depthWrite: false }),
      exit: new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9, depthWrite: false }),
      entrance: new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.9, depthWrite: false }),
      finish: new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.95, depthWrite: false }),
    };
    const markerDistances = [];
    const pushMarker = (distance, source, role, pieceIndex = null, pieceType = null) => {
      const clampedDistance = Number(clamp(distance, 0, this.trackLength).toFixed(2));
      if (markerDistances.some((entry) => Math.abs(entry.distance - clampedDistance) < 0.08 && entry.role === role)) return;
      markerDistances.push({ distance: clampedDistance, source, role, pieceIndex, pieceType });
    };

    (this.trackPieces || []).forEach((piece) => {
      const lookAhead = Math.abs(piece.turnDegrees || 0) > 0
        ? (this.guidePointPolicy?.cornerSamePieceLookAhead ?? 0.9)
        : (this.guidePointPolicy?.samePieceLookAhead ?? 1.35);
      pushMarker(piece.startD + lookAhead, 'same-piece-lookahead-guide', 'inside', piece.index, piece.type);
      pushMarker(piece.endD, piece.endD >= this.trackLength ? 'finish-line-guide' : 'current-piece-exit-guide', piece.endD >= this.trackLength ? 'finish' : 'exit', piece.index, piece.type);
      if (piece.index > 0) pushMarker(piece.startD, 'next-piece-entrance-guide', 'entrance', piece.index, piece.type);
    });

    markerDistances.forEach((entry) => {
      const frame = this.getTrackFrameAt(entry.distance);
      const material = materialByRole[entry.role] || materialByRole.inside;
      const marker = new THREE.Mesh(markerGeometry.clone(), material.clone());
      marker.name = `guide-point-marker-${entry.role}-${entry.pieceIndex ?? 'track'}-${entry.distance}`;
      marker.position.copy(frame.p).add(new THREE.Vector3(0, 0.72, 0));
      marker.renderOrder = 40;
      marker.userData = entry;
      this.guidePointGroup.add(marker);
    });
    this.guidePointGroup.visible = this.showGuidePoints;
  }

  updateCurveStyle() {
    const key = this.ui.curveSelect.value || 'mixed';
    this.curveStyleKey = CURVE_PRESETS[key] ? key : 'mixed';
    this.curveStyle = CURVE_PRESETS[this.curveStyleKey];
    this.ui.curveSelect.value = this.curveStyleKey;
  }

  newRace({ regenerateTrack }) {
    const voiceWasEnabled = this.commentaryVoiceEnabled || this.ui?.commentaryVoiceToggle?.checked;
    this.state = 'ready';
    this.elapsed = 0;
    this.finishers = [];
    this.firstFinishTime = 0;
    this.firstFinishRealTimeMs = 0;
    this.postFirstFinishDnfCutoff = { ...POST_FIRST_FINISH_DNF_CUTOFF, triggered: false, triggeredAt: null, triggeredAtRealTimeMs: null, dnfCount: 0 };
    this.cachedRanking = null;
    this.cachedRankingAt = 0;
    this.cachedLeaderId = null;
    this.physicsSteps = 0;
    this.stuckResetCount = 0;
    this.stallEliminationCount = 0;
    this.defeatedMarbles = [];
    this.midTrackSpeedAssistCount = 0;
    this.finalApproachAssistCount = 0;
    this.slopeDriveForceCount = 0;
    this.railEscapeAssistCount = 0;
    this.fallPenaltyCount = 0;
    this.totalFallPenaltySeconds = 0;
    this.ui.winner.classList.add('hidden');
    this.countdownActive = false;
    this.countdownRemaining = 0;
    this.countdownLastAnnouncedSecond = null;
    this.startHookVisible = false;
    this.startHookValue = '';
    this.startHookIsGo = false;
    this.startHookShownAt = 0;
    this.startHookLastSummary = null;
    clearTimeout(this.countdownOverlayTimer);
    this.hideCountdownOverlay();
    if (this.ui.matchCard) this.ui.matchCard.classList.add('hidden');
    if (this.ui.finalShowcase) {
      this.ui.finalShowcase.innerHTML = '';
      this.ui.finalShowcase.classList.add('hidden');
    }
    this.clearMarbles();
    this.broadcastEvents = [];
    this.lastBroadcastAt = -Infinity;
    this.lastBroadcastLeaderId = null;
    this.lastCloseBattleAt = -Infinity;
    this.lastNeckAndNeckAt = -Infinity;
    this.lastOvertakeAt = -Infinity;
    this.lastProgressCommentaryAt = -Infinity;
    this.lastSpeedCommentaryAt = -Infinity;
    this.lastProgressMilestone = 0;
    this.lastPaceBand = null;
    this.previousTopFiveIds = [];
    this.topFiveSnapshot = [];
    this.toyParkBroadcastMoment = null;
    this.toyParkBroadcastCameraState = null;
    this.lastFinalStretchAt = -Infinity;
    this.raceHistoryBuffer = [];
    this.lastRaceHistorySampleAt = -Infinity;
    this.activeCaption = null;
    this.hideBroadcastCaption();
    this.activeCommentary = null;
    this.commentaryHistory = [];
    this.resetCommentaryVoiceQueue({ cancelCurrent: true, clearLastLine: true });
    this.hideCommentaryCaption();
    this.setBgmMode('intro');
    this.hideReplayHighlightOverlay();
    this.clearSpectacleEffects({ clearTrails: false });
    this.resetEffectBudgetWindow({ resetCounters: true });
    this.showcaseStats = null;
    this.resetPodiumCeremony();
    this.ui.pause.textContent = 'Pause';
    this.ui.start.textContent = 'Open Gate';
    if (!regenerateTrack) this.rebuildPhysicsHitboxes();
    this.ui.regen.textContent = this.cupMode?.active ? 'Regenerate Cup Track' : 'Generate New Track';
    this.updateSpeedPreset();
    this.updateGuideBias();
    this.updateObstacleDistribution({ regenerateTrack: false });
    this.updateObstacleTypeToggles({ regenerateTrack: false });
    this.updateWidthPreset({ regenerateTrack: false });
    this.updateObstaclePreset({ regenerateTrack: false });
    this.updateCatchupAssist();
    this.updateCurveStyle();
    this.updateVisualTheme({ regenerateMarbles: false });
    this.refreshStallEliminationPolicy();
    this.resetDefaultAutoCameraForRace();
    this.initialCameraRotationApplied = false;
    this.firstFinishTime = 0;
    this.firstFinishRealTimeMs = 0;
    this.postFirstFinishDnfCutoff = { ...POST_FIRST_FINISH_DNF_CUTOFF, triggered: false, triggeredAt: null, triggeredAtRealTimeMs: null, dnfCount: 0 };
    this.resetFinishSlowMotion();

    const rawSeedInput = this.ui.seed.value.trim() || `${Date.now()}-${Math.random()}`;
    const normalizedSeed = normalizeSeedInput(rawSeedInput);
    const rawSeed = normalizedSeed.seed || `${Date.now()}-${Math.random()}`;
    this.importedTrackDebugFromSeed = normalizedSeed.importedTrackDebug;
    this.seedInputWasTrackDebugCode = normalizedSeed.wasTrackDebugCode;
    if (normalizedSeed.wasTrackDebugCode && this.ui.seed) this.ui.seed.value = rawSeed;
    const selectedPreset = this.ui.lengthSelect.value || 'medium';
    const selectedCustomLength = selectedPreset === 'custom' ? this.getCustomTrackLength() : null;
    const selectedWidthPreset = this.widthPresetKey || 'normal';
    const selectedCurveStyle = this.curveStyleKey || 'mixed';
    if (regenerateTrack || rawSeed !== this.seed || selectedPreset !== this.trackPresetKey || selectedCustomLength !== this.customTrackLength || selectedWidthPreset !== this.widthPresetKey || selectedCurveStyle !== this.curveStyleKey) {
      this.seed = rawSeed;
      this.trackPresetKey = selectedPreset;
      this.customTrackLength = selectedCustomLength;
      this.widthPresetKey = selectedWidthPreset;
      this.curveStyleKey = selectedCurveStyle;
      this.widthPreset = WIDTH_PRESETS[this.widthPresetKey] || WIDTH_PRESETS.normal;
      this.curveStyle = CURVE_PRESETS[this.curveStyleKey] || CURVE_PRESETS.mixed;
      this.rng = mulberry32(cyrb128(`${this.seed}-${this.trackPresetKey}-${this.customTrackLength || 'preset'}-${this.widthPresetKey}-${this.curveStyleKey}-${this.obstacleIndex}-${this.obstacleDistributionMode}`)[0]);
      this.clearTrack();
      this.createTrack();
      this.rebuildPhysicsHitboxes();
      this.updateTrackDebugCode();
      this.refreshStallEliminationPolicy();
      this.buildGuidePointMarkers();
      this.guidePointGroup.visible = this.showGuidePoints;
      this.updateTrackDebugCode();
    }

    const requestedCount = this.survivorLeague?.active
      ? Math.max(1, this.survivorLeague.roster?.length || this.survivorLeague.fieldSize || SURVIVOR_LEAGUE.fieldSize)
      : this.cupMode?.active
        ? Math.max(1, this.cupMode.currentEntrants?.length || this.cupMode.size || 12)
        : Math.max(1, Math.floor(Number(this.ui.count.value) || 12));
    if ((this.cupMode?.active || this.survivorLeague?.active) && this.ui.count) this.ui.count.value = String(requestedCount);
    this.createMarbles(requestedCount);
    if (this.survivorLeague?.active) {
      this.survivorLeague.status = 'ready';
      this.survivorLeague.spotlight = this.buildSurvivorSpotlight();
    }
    this.applyInitialCameraVerticalAxisRotation();
    this.showMatchCard();
    this.updateLeaderboard(true);
    this.updateTrackDebugCode();
    if (voiceWasEnabled) this.setCommentaryVoiceEnabled(true);
    this.updateUI();
  }

  getStallEliminationDelaySeconds(stage = this.getCupStage?.()) {
    const cfg = STALL_ELIMINATION;
    const base = cfg.baseDelaySeconds ?? cfg.delaySeconds ?? 10;
    const longDelay = cfg.longTrackDelaySeconds ?? base;
    const reference = Math.max(1, cfg.longTrackReferenceMeters ?? 760);
    const trackRatio = clamp((this.trackLength || 0) / reference, 0, 1);
    const scaled = base + (longDelay - base) * trackRatio;
    const stageMultiplier = stage === 'final' ? (cfg.finalStageDelayMultiplier ?? 1) : 1;
    return Number((scaled * stageMultiplier).toFixed(2));
  }

  getStallEliminationMinForwardProgressMeters() {
    const cfg = STALL_ELIMINATION;
    const percentWindow = (this.trackLength || 0) * (cfg.minForwardProgressPercentPerWindow ?? 0);
    return Math.max(cfg.minForwardProgressMeters ?? 0.18, percentWindow);
  }

  refreshStallEliminationPolicy() {
    const delaySeconds = this.getStallEliminationDelaySeconds();
    const minForwardProgressMeters = this.getStallEliminationMinForwardProgressMeters();
    this.stuckResetDelay = delaySeconds;
    this.stallElimination = {
      ...STALL_ELIMINATION,
      delaySeconds,
      minForwardProgressMeters,
      trackLengthMeters: Number((this.trackLength || 0).toFixed(2)),
      trackScaleRatio: Number(clamp((this.trackLength || 0) / Math.max(1, STALL_ELIMINATION.longTrackReferenceMeters ?? 760), 0, 1).toFixed(3)),
      cupStage: this.cupMode?.active ? this.getCupStage() : null,
    };
    return this.stallElimination;
  }

  getCustomTrackLength() {
    const raw = Number(this.ui.customLength?.value || TRACK_PRESETS.medium.base);
    const meters = Math.round(clamp(Number.isFinite(raw) ? raw : TRACK_PRESETS.medium.base, 30, 3000));
    if (this.ui.customLength) this.ui.customLength.value = String(meters);
    return meters;
  }

  getObstacleAnimationCullingWindow() {
    const activeDistances = this.marbleData
      .filter((data) => !data.finished && !data.defeated)
      .map((data) => {
        const fallbackPosition = data.body?.position || data.mesh?.position || new THREE.Vector3();
        const fallbackDistance = this.findClosestProgress(fallbackPosition).distance || 0;
        return Number(data.driveDistance ?? data.distance ?? fallbackDistance);
      })
      .filter(Number.isFinite);
    const frontDistance = activeDistances.length ? Math.max(...activeDistances) : this.trackLength || 0;
    const backDistance = activeDistances.length ? Math.min(...activeDistances) : this.trackLength || 0;
    const lookAheadMeters = clamp(
      (this.trackLength || 0) * OBSTACLE_ANIMATION_CULLING.lookAheadProgress,
      OBSTACLE_ANIMATION_CULLING.minLookAheadMeters,
      OBSTACLE_ANIMATION_CULLING.maxLookAheadMeters,
    );
    return {
      frontDistance,
      backDistance,
      lookAheadMeters,
      passedBufferMeters: OBSTACLE_ANIMATION_CULLING.passedBufferMeters,
      activeMarbleCount: activeDistances.length,
    };
  }

  getObstacleAnimationState(obstacle, window = this.getObstacleAnimationCullingWindow()) {
    if (!OBSTACLE_ANIMATION_CULLING.enabled || !OBSTACLE_ANIMATION_CULLING.animatedTypes.has(obstacle.type)) {
      return { state: 'always-active', active: true, distanceAhead: null, distanceBehindBack: null };
    }
    const obstacleDistance = Number.isFinite(obstacle.placementDistance)
      ? obstacle.placementDistance
      : this.findClosestProgress(obstacle.center).distance || 0;
    const distanceAhead = obstacleDistance - window.frontDistance;
    const distanceBehindBack = window.backDistance - obstacleDistance;
    let state = 'sleeping';
    if (distanceBehindBack > window.passedBufferMeters) state = 'passed';
    else if (distanceAhead <= window.lookAheadMeters) state = 'active';
    return {
      state,
      active: state === 'active',
      obstacleDistance,
      distanceAhead,
      distanceBehindBack,
    };
  }

  getObstacleAnimationCullingDebug(window = this.getObstacleAnimationCullingWindow()) {
    const counts = { active: 0, sleeping: 0, passed: 0, alwaysActive: 0 };
    this.pinballObstacles.forEach((obstacle) => {
      const state = this.getObstacleAnimationState(obstacle, window).state;
      const key = state === 'always-active' ? 'alwaysActive' : state;
      counts[key] = (counts[key] || 0) + 1;
    });
    return {
      ...OBSTACLE_ANIMATION_CULLING,
      animatedTypes: [...OBSTACLE_ANIMATION_CULLING.animatedTypes],
      frontDistance: Number(window.frontDistance.toFixed(2)),
      backDistance: Number(window.backDistance.toFixed(2)),
      lookAheadMeters: Number(window.lookAheadMeters.toFixed(2)),
      passedBufferMeters: Number(window.passedBufferMeters.toFixed(2)),
      activeMarbleCount: window.activeMarbleCount,
      counts,
    };
  }

  getObstacleDebugEntries() {
    const animationWindow = this.getObstacleAnimationCullingWindow();
    return this.pinballObstacles.map((obstacle, index) => {
      const centerProgress = this.findClosestProgress(obstacle.center);
      const centerDistance = centerProgress.distance || 0;
      const distance = Number.isFinite(obstacle.placementDistance) ? obstacle.placementDistance : centerDistance;
      const frame = this.getTrackFrameAt(distance);
      const laneOffset = new THREE.Vector3(obstacle.center.x - frame.p.x, 0, obstacle.center.z - frame.p.z).dot(frame.right);
      const piece = this.trackPieces.find((trackPiece) => distance >= trackPiece.startD && distance <= trackPiece.endD);
      const animationState = this.getObstacleAnimationState(obstacle, animationWindow);
      return {
        index,
        type: obstacle.type,
        typeLabel: PINBALL_OBSTACLE_TYPE_METADATA[obstacle.type]?.label || obstacle.type,
        category: obstacle.category || PINBALL_OBSTACLE_TYPE_METADATA[obstacle.type]?.category || 'normal',
        categoryLabel: OBSTACLE_CATEGORIES[obstacle.category || PINBALL_OBSTACLE_TYPE_METADATA[obstacle.type]?.category || 'normal']?.label || '普通障礙物',
        visualStyle: obstacle.visualStyle || null,
        textureStyle: obstacle.textureStyle || null,
        trackSlopePitch: obstacle.trackSlopePitch != null ? Number(obstacle.trackSlopePitch.toFixed(4)) : null,
        trackYaw: obstacle.trackYaw != null ? Number(obstacle.trackYaw.toFixed(4)) : null,
        localYaw: obstacle.localYaw != null ? Number(obstacle.localYaw.toFixed(4)) : null,
        rotationPitch: obstacle.group?.rotation?.x != null ? Number(obstacle.group.rotation.x.toFixed(4)) : null,
        slopeAligned: obstacle.trackSlopePitch != null && obstacle.trackYaw != null && obstacle.group?.quaternion
          ? new THREE.Vector3(0, 1, 0)
            .applyQuaternion(obstacle.group.quaternion)
            .angleTo(new THREE.Vector3(0, 1, 0).applyQuaternion(this.getTrackSlopeQuaternion(obstacle.trackYaw, obstacle.trackSlopePitch, 0))) < 0.001
          : null,
        distributionMode: obstacle.distributionMode || this.obstacleDistributionMode || 'random',
        distributionZoneIndex: obstacle.distributionZoneIndex ?? null,
        distributionZoneStart: obstacle.distributionZoneStart != null ? Number(obstacle.distributionZoneStart.toFixed(2)) : null,
        distributionZoneEnd: obstacle.distributionZoneEnd != null ? Number(obstacle.distributionZoneEnd.toFixed(2)) : null,
        distance: Number(distance.toFixed(2)),
        centerDistance: Number(centerDistance.toFixed(2)),
        plannedDistance: obstacle.placementDistance != null ? Number(obstacle.placementDistance.toFixed(2)) : null,
        placementMinSpacing: obstacle.placementMinSpacing != null ? Number(obstacle.placementMinSpacing.toFixed(2)) : null,
        placementFootprint: Number((this.getObstacleTypePlacementConfig(obstacle.type).footprintMeters || 0).toFixed(2)),
        progress: this.trackLength ? Number((distance / this.trackLength).toFixed(4)) : 0,
        laneOffset: Number(laneOffset.toFixed(2)),
        radius: Number((obstacle.radius || obstacle.halfLength || obstacle.halfWidth || 0).toFixed(2)),
        animationState: animationState.state,
        animationActive: animationState.active,
        animationDistanceAhead: animationState.distanceAhead != null ? Number(animationState.distanceAhead.toFixed(2)) : null,
        animationDistanceBehindBack: animationState.distanceBehindBack != null ? Number(animationState.distanceBehindBack.toFixed(2)) : null,
        impulse: Number((obstacle.impulse || obstacle.boostImpulse || 0).toFixed(2)),
        singleUseBounce: Boolean(obstacle.singleUseBounce),
        bouncedMarbleId: obstacle.bouncedMarbleId ?? null,
        bouncedMarbleName: obstacle.bouncedMarbleName ?? null,
        bounceMode: obstacle.bounceMode ?? null,
        dropped: obstacle.dropped ?? null,
        droppedCount: obstacle.droppedCount ?? null,
        bankCleared: obstacle.bankCleared ?? null,
        lastTargetIndex: obstacle.lastTargetIndex ?? null,
        lastTargetLabel: obstacle.lastTargetLabel ?? null,
        lastBankClearBy: obstacle.lastBankClearBy ?? null,
        lastBoostCommentaryLines: obstacle.lastBoostCommentaryLines ?? null,
        lastBoostDurationSeconds: obstacle.lastBoostDurationSeconds ?? null,
        lastBoostMultiplier: obstacle.lastBoostMultiplier ?? null,
        resetInSeconds: obstacle.resetAt != null ? Number(Math.max(0, obstacle.resetAt - this.elapsed).toFixed(2)) : null,
        dropTargetScale: obstacle.dropTargetScale ?? null,
        dropTargetDimensions: obstacle.dropTargetDimensions ?? null,
        pinCount: obstacle.pinCount ?? null,
        pinBumperDimensions: obstacle.pinBumperDimensions ?? null,
        lastHitPinIndex: obstacle.lastHitPinIndex ?? null,
        gongDimensions: obstacle.gongDimensions ?? null,
        movingGateDimensions: obstacle.movingGateDimensions ?? null,
        movingGateOpenAmount: obstacle.type === 'movingGate' && obstacle.openAmount != null ? Number(obstacle.openAmount.toFixed(3)) : null,
        movingGateBladeY: obstacle.type === 'movingGate' && obstacle.bladeY != null ? Number(obstacle.bladeY.toFixed(3)) : null,
        movingGateSweepSpeed: obstacle.type === 'movingGate' && obstacle.sweepSpeed != null ? Number(Math.abs(obstacle.sweepSpeed).toFixed(2)) : null,
        lastMovingGateHitBy: obstacle.type === 'movingGate' ? (obstacle.lastHitBy ?? null) : null,
        tiltBridgeDimensions: obstacle.tiltBridgeDimensions ?? null,
        tiltBridgeAngle: obstacle.type === 'tiltBridge' && obstacle.tiltAngle != null ? Number(obstacle.tiltAngle.toFixed(3)) : null,
        tiltBridgeLeftLift: obstacle.type === 'tiltBridge' && obstacle.leftPanelLift != null ? Number(obstacle.leftPanelLift.toFixed(3)) : null,
        tiltBridgeRightLift: obstacle.type === 'tiltBridge' && obstacle.rightPanelLift != null ? Number(obstacle.rightPanelLift.toFixed(3)) : null,
        tiltBridgeSweepSpeed: obstacle.type === 'tiltBridge' && obstacle.sweepSpeed != null ? Number(Math.abs(obstacle.sweepSpeed).toFixed(2)) : null,
        lastTiltBridgeHitBy: obstacle.type === 'tiltBridge' ? (obstacle.lastHitBy ?? null) : null,
        orbitRingDimensions: obstacle.orbitRingDimensions ?? null,
        orbitRingDirection: obstacle.type === 'orbitRing' ? (obstacle.orbitDirection ?? null) : null,
        orbitRingGuideStrength: obstacle.type === 'orbitRing' ? (obstacle.orbitGuideStrength ?? null) : null,
        lastOrbitRingHitBy: obstacle.type === 'orbitRing' ? (obstacle.lastHitBy ?? null) : null,
        lastOrbitSegmentIndex: obstacle.type === 'orbitRing' ? (obstacle.lastOrbitSegmentIndex ?? null) : null,
        pendulumHammerDimensions: obstacle.pendulumHammerDimensions ?? null,
        pendulumHammerSwingAngle: obstacle.type === 'pendulumHammer' && obstacle.swingAngle != null ? Number(obstacle.swingAngle.toFixed(3)) : null,
        pendulumHammerSweepSpeed: obstacle.type === 'pendulumHammer' && obstacle.sweepSpeed != null ? Number(Math.abs(obstacle.sweepSpeed).toFixed(2)) : null,
        lastPendulumHammerHitBy: obstacle.type === 'pendulumHammer' ? (obstacle.lastHitBy ?? null) : null,
        lastPendulumForwardSpeed: obstacle.type === 'pendulumHammer' ? (obstacle.lastPendulumForwardSpeed ?? null) : null,
        splitterForkDimensions: obstacle.splitterForkDimensions ?? null,
        splitterForkRailCount: obstacle.type === 'splitterFork' ? (obstacle.rails?.length ?? 0) : null,
        splitterForkBodyCount: obstacle.type === 'splitterFork' ? (obstacle.bodies?.length ?? (obstacle.body ? 1 : 0)) : null,
        splitterForkMinSideSpeed: obstacle.type === 'splitterFork' ? (obstacle.splitterMinSideSpeed ?? null) : null,
        lastSplitterForkHitBy: obstacle.type === 'splitterFork' ? (obstacle.lastHitBy ?? null) : null,
        lastSplitterBranch: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterBranch ?? null) : null,
        lastSplitterRailIndex: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterRailIndex ?? null) : null,
        lastSplitterForwardSpeed: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterForwardSpeed ?? null) : null,
        lastSplitterSideSpeed: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterSideSpeed ?? null) : null,
        lastSplitterSideSpeedBoost: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterSideSpeedBoost ?? null) : null,
        lastSplitterRescueApplied: obstacle.type === 'splitterFork' ? Boolean(obstacle.lastSplitterRescueApplied) : null,
        orbitRingBoostConfig: obstacle.type === 'orbitRing' ? ORBIT_RING_SPEED_BOOST : null,
        gongPackRadius: obstacle.packRadius ?? null,
        gongPackImpulse: obstacle.packImpulse ?? null,
        gongShake: obstacle.shake != null ? Number(obstacle.shake.toFixed(2)) : null,
        lastGongHitBy: obstacle.type === 'gongBumper' ? (obstacle.lastHitBy ?? null) : null,
        lastGongPackShakeCount: obstacle.type === 'gongBumper' ? (obstacle.lastPackShakeCount ?? 0) : null,
        lastGongCommentaryLines: obstacle.type === 'gongBumper' ? (obstacle.lastCommentaryLines ?? []) : null,
        bankSignText: obstacle.bankSignText ?? null,
        targets: obstacle.targets?.map((target) => ({
          index: target.index,
          label: target.label,
          dropped: Boolean(target.dropped),
          hitBy: target.hitBy ?? null,
          progress: target.progress != null ? Number(target.progress.toFixed(2)) : 0,
        })) ?? null,
        pieceIndex: piece?.index ?? null,
        pieceType: piece?.type || null,
      };
    });
  }

  getTrackDebugPayload() {
    const animationWindow = this.getObstacleAnimationCullingWindow();
    return {
      version: 1,
      app: 'marble-race',
      seed: this.seed,
      rngMaterial: `${this.seed}-${this.trackPresetKey}-${this.customTrackLength || 'preset'}-${this.widthPresetKey}-${this.curveStyleKey}-${this.obstacleIndex}-${this.obstacleDistributionMode}`,
      trackPresetKey: this.trackPresetKey,
      customTrackLength: this.customTrackLength || null,
      actualTrackLength: this.trackLength,
      widthPresetKey: this.widthPresetKey,
      speedIndex: this.speedIndex,
      speedLabel: this.speedPreset?.label,
      physicsMechanic: this.getPhysicsMechanicDebug(),
      obstacleIndex: this.obstacleIndex,
      obstacleLabel: this.obstaclePreset?.label,
      obstacleMultiplier: this.obstaclePreset?.multiplier ?? 1,
      obstacleDistributionMode: this.obstacleDistributionMode,
      obstacleDistributionLabel: OBSTACLE_DISTRIBUTION_MODES[this.obstacleDistributionMode]?.label || OBSTACLE_DISTRIBUTION_MODES.random.label,
      obstacleDistributionSummary: this.obstacleDistributionSummary,
      obstaclePlacement: OBSTACLE_PLACEMENT,
      obstacleAnimationCulling: this.getObstacleAnimationCullingDebug(animationWindow),
      orbitRingSpeedBoost: ORBIT_RING_SPEED_BOOST,
      obstacleCategories: OBSTACLE_CATEGORIES,
      obstacleTypeMetadata: PINBALL_OBSTACLE_TYPE_METADATA,
      obstacleCatalog: PINBALL_OBSTACLE_CATALOG,
      enabledObstacleTypes: [...(this.enabledObstacleTypes || new Set(PINBALL_OBSTACLE_TYPES))],
      curveStyleKey: this.curveStyleKey,
      catchupAssistEnabled: this.catchupAssistEnabled,
      catchupAssist: CATCHUP_ASSIST,
      trackWidth: Number((this.trackWidth || 0).toFixed(3)),
      trackStats: this.trackStats,
      trackSlope: this.trackSlope,
      trackWidthProfile: this.trackWidthProfile,
      toyParkTrackTiles: this.physicsMechanicKey === 'toyPark' ? (this.toyParkTrackTiles || null) : null,
      toyParkBoardSequence: this.physicsMechanicKey === 'toyPark' ? (this.toyParkBoardSequence || this.toyParkTrackTiles?.boardSequence || null) : null,
      toyParkBoardSequenceReadable: this.physicsMechanicKey === 'toyPark' ? (this.toyParkTrackTiles?.boardSequenceReadable || this.trackStats?.toyParkBoardSequenceReadable || []) : [],
      rightAngleTurnCount: this.rightAngleTurnCount,
      modularTrackPieceCounts: {
        straight: this.trackPieces.filter((piece) => piece.type === 'straight').length,
        variableBend: this.trackPieces.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.variableBend?.key).length,
        rampUp: this.trackPieces.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampUp?.key).length,
        elevatedStraight: this.trackPieces.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight?.key).length,
        rampDown: this.trackPieces.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampDown?.key).length,
        uTurn180: 0,
        corner45: this.trackPieces.filter((piece) => Math.abs(piece.turnDegrees) === 45).length,
        corner90: this.trackPieces.filter((piece) => Math.abs(piece.turnDegrees) === 90).length,
      },
      trackPieces: this.trackPieces.map((piece) => ({
        type: piece.type,
        tileKey: piece.tileKey || null,
        tileLabel: piece.tileLabel || null,
        length: Number((piece.length || 0).toFixed(2)),
        turnDegrees: piece.turnDegrees,
        startDistance: Number(((piece.startDistance ?? piece.startD) || 0).toFixed(2)),
        endDistance: Number(((piece.endDistance ?? piece.endD) || 0).toFixed(2)),
        loopPrototype: Boolean(piece.loopPrototype),
        loopPrototypeIndex: piece.loopPrototypeIndex ?? null,
        loopSegmentRole: piece.loopSegmentRole ?? null,
      })),
      driveAssist: {
        slopeDrive: this.slopeDrive,
        toyParkPhysicsMode: this.physicsMechanicKey === 'toyPark' ? (this.toyParkSoftGuidePhysics?.mode || null) : null,
        toyParkHardSplineLock: this.physicsMechanicKey === 'toyPark' ? Boolean(this.toyParkSoftGuidePhysics?.hardSplineLock) : null,
        toyParkCollisionPreserved: this.physicsMechanicKey === 'toyPark' ? Boolean(this.toyParkSoftGuidePhysics?.collisionPreserved) : null,
        toyParkGuideAssist: this.physicsMechanicKey === 'toyPark' ? this.toyParkSoftGuidePhysics : null,
        toyParkSoftGuideForceCount: this.toyParkSoftGuideForceCount || 0,
        minimumForwardSpeedAssist: this.minForwardSpeedAssist,
        midTrackSpeedAssist: this.midTrackSpeedAssist,
        finalApproachAssist: this.finalApproachAssist,
        directionStabilityAssist: this.directionStabilityAssist,
        railGuidePolicy: this.railGuidePolicy,
        railMomentumAssist: this.railMomentumAssist,
        railEscapeAssist: this.railEscapeAssist,
        landingReboundAbsorber: this.landingReboundAbsorber,
        airborneGuidePolicy: this.airborneGuidePolicy,
        guidePointPolicy: this.guidePointPolicy,
        trackMarbleContact: NO_ROLLING_SLOWDOWN.trackContact,
        railContact: RAIL_REBOUND,
        noRollingSlowdown: NO_ROLLING_SLOWDOWN,
        regressionFix: 'late-track sustained force-only assists remain, all rail-hit return-to-center guide/correction assists are disabled, airborne guide assists pause until landing then recalculate an ahead guide; rail and rolling friction/damping removed by request',
      },
      obstacleTypeCounts: this.obstacleTypeCounts,
      obstacleCategoryCounts: this.obstacleCategoryCounts,
      dropTargetBanks: this.pinballObstacles.filter((obstacle) => obstacle.type === 'dropTarget').map((obstacle, index) => ({
        index,
        droppedCount: obstacle.droppedCount || 0,
        bankCleared: Boolean(obstacle.bankCleared),
        lastTargetIndex: obstacle.lastTargetIndex ?? null,
        lastBankClearBy: obstacle.lastBankClearBy ?? null,
        lastBoostCommentaryLines: obstacle.lastBoostCommentaryLines ?? null,
        lastBoostDurationSeconds: obstacle.lastBoostDurationSeconds ?? null,
        lastBoostMultiplier: obstacle.lastBoostMultiplier ?? null,
        resetInSeconds: obstacle.resetAt != null ? Number(Math.max(0, obstacle.resetAt - this.elapsed).toFixed(2)) : null,
        dropTargetScale: obstacle.dropTargetScale ?? null,
        dropTargetDimensions: obstacle.dropTargetDimensions ?? null,
        pinCount: obstacle.pinCount ?? null,
        pinBumperDimensions: obstacle.pinBumperDimensions ?? null,
        lastHitPinIndex: obstacle.lastHitPinIndex ?? null,
        gongDimensions: obstacle.gongDimensions ?? null,
        movingGateDimensions: obstacle.movingGateDimensions ?? null,
        movingGateOpenAmount: obstacle.type === 'movingGate' && obstacle.openAmount != null ? Number(obstacle.openAmount.toFixed(3)) : null,
        movingGateBladeY: obstacle.type === 'movingGate' && obstacle.bladeY != null ? Number(obstacle.bladeY.toFixed(3)) : null,
        movingGateSweepSpeed: obstacle.type === 'movingGate' && obstacle.sweepSpeed != null ? Number(Math.abs(obstacle.sweepSpeed).toFixed(2)) : null,
        lastMovingGateHitBy: obstacle.type === 'movingGate' ? (obstacle.lastHitBy ?? null) : null,
        tiltBridgeDimensions: obstacle.tiltBridgeDimensions ?? null,
        tiltBridgeAngle: obstacle.type === 'tiltBridge' && obstacle.tiltAngle != null ? Number(obstacle.tiltAngle.toFixed(3)) : null,
        tiltBridgeLeftLift: obstacle.type === 'tiltBridge' && obstacle.leftPanelLift != null ? Number(obstacle.leftPanelLift.toFixed(3)) : null,
        tiltBridgeRightLift: obstacle.type === 'tiltBridge' && obstacle.rightPanelLift != null ? Number(obstacle.rightPanelLift.toFixed(3)) : null,
        tiltBridgeSweepSpeed: obstacle.type === 'tiltBridge' && obstacle.sweepSpeed != null ? Number(Math.abs(obstacle.sweepSpeed).toFixed(2)) : null,
        lastTiltBridgeHitBy: obstacle.type === 'tiltBridge' ? (obstacle.lastHitBy ?? null) : null,
        orbitRingDimensions: obstacle.orbitRingDimensions ?? null,
        orbitRingDirection: obstacle.type === 'orbitRing' ? (obstacle.orbitDirection ?? null) : null,
        orbitRingGuideStrength: obstacle.type === 'orbitRing' ? (obstacle.orbitGuideStrength ?? null) : null,
        lastOrbitRingHitBy: obstacle.type === 'orbitRing' ? (obstacle.lastHitBy ?? null) : null,
        lastOrbitSegmentIndex: obstacle.type === 'orbitRing' ? (obstacle.lastOrbitSegmentIndex ?? null) : null,
        pendulumHammerDimensions: obstacle.pendulumHammerDimensions ?? null,
        pendulumHammerSwingAngle: obstacle.type === 'pendulumHammer' && obstacle.swingAngle != null ? Number(obstacle.swingAngle.toFixed(3)) : null,
        pendulumHammerSweepSpeed: obstacle.type === 'pendulumHammer' && obstacle.sweepSpeed != null ? Number(Math.abs(obstacle.sweepSpeed).toFixed(2)) : null,
        lastPendulumHammerHitBy: obstacle.type === 'pendulumHammer' ? (obstacle.lastHitBy ?? null) : null,
        lastPendulumForwardSpeed: obstacle.type === 'pendulumHammer' ? (obstacle.lastPendulumForwardSpeed ?? null) : null,
        splitterForkDimensions: obstacle.splitterForkDimensions ?? null,
        splitterForkRailCount: obstacle.type === 'splitterFork' ? (obstacle.rails?.length ?? 0) : null,
        splitterForkBodyCount: obstacle.type === 'splitterFork' ? (obstacle.bodies?.length ?? (obstacle.body ? 1 : 0)) : null,
        splitterForkMinSideSpeed: obstacle.type === 'splitterFork' ? (obstacle.splitterMinSideSpeed ?? null) : null,
        lastSplitterForkHitBy: obstacle.type === 'splitterFork' ? (obstacle.lastHitBy ?? null) : null,
        lastSplitterBranch: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterBranch ?? null) : null,
        lastSplitterRailIndex: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterRailIndex ?? null) : null,
        lastSplitterForwardSpeed: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterForwardSpeed ?? null) : null,
        lastSplitterSideSpeed: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterSideSpeed ?? null) : null,
        lastSplitterSideSpeedBoost: obstacle.type === 'splitterFork' ? (obstacle.lastSplitterSideSpeedBoost ?? null) : null,
        lastSplitterRescueApplied: obstacle.type === 'splitterFork' ? Boolean(obstacle.lastSplitterRescueApplied) : null,
        orbitRingBoostConfig: obstacle.type === 'orbitRing' ? ORBIT_RING_SPEED_BOOST : null,
        gongPackRadius: obstacle.packRadius ?? null,
        gongPackImpulse: obstacle.packImpulse ?? null,
        gongShake: obstacle.shake != null ? Number(obstacle.shake.toFixed(2)) : null,
        lastGongHitBy: obstacle.type === 'gongBumper' ? (obstacle.lastHitBy ?? null) : null,
        lastGongPackShakeCount: obstacle.type === 'gongBumper' ? (obstacle.lastPackShakeCount ?? 0) : null,
        lastGongCommentaryLines: obstacle.type === 'gongBumper' ? (obstacle.lastCommentaryLines ?? []) : null,
        bankSignText: obstacle.bankSignText ?? null,
        targets: obstacle.targets?.map((target) => ({
          index: target.index,
          label: target.label,
          dropped: Boolean(target.dropped),
          hitBy: target.hitBy ?? null,
        })) || [],
      })),
      movingGates: this.pinballObstacles.filter((obstacle) => obstacle.type === 'movingGate').map((obstacle, index) => ({
        index,
        movingGateDimensions: obstacle.movingGateDimensions ?? null,
        openAmount: obstacle.openAmount != null ? Number(obstacle.openAmount.toFixed(3)) : null,
        bladeY: obstacle.bladeY != null ? Number(obstacle.bladeY.toFixed(3)) : null,
        sweepSpeed: obstacle.sweepSpeed != null ? Number(Math.abs(obstacle.sweepSpeed).toFixed(2)) : null,
        swingDirection: obstacle.swingDirection ?? null,
        lastHitBy: obstacle.lastHitBy ?? null,
        visualStyle: obstacle.visualStyle || null,
        textureStyle: obstacle.textureStyle || null,
      })),
      enabledObstacleTypes: [...(this.enabledObstacleTypes || new Set(PINBALL_OBSTACLE_TYPES))],
      obstacles: this.getObstacleDebugEntries(),
      generatedAt: new Date().toISOString(),
      seedInputSanitization: {
        enabled: true,
        seedInputWasTrackDebugCode: Boolean(this.seedInputWasTrackDebugCode),
        importedTrackDebugActualLength: this.importedTrackDebugFromSeed?.actualTrackLength || null,
        label: 'MR1 debug codes pasted into Seed are decoded and reduced to their original seed so debug codes do not recursively become seed material',
      },
    };
  }

  getTrackDebugCode() {
    return encodeTrackDebugCode(this.getTrackDebugPayload());
  }

  updateTrackDebugCode() {
    this.currentTrackDebugPayload = this.getTrackDebugPayload();
    this.currentTrackDebugCode = encodeTrackDebugCode(this.currentTrackDebugPayload);
    if (this.ui.trackCodeOutput) this.ui.trackCodeOutput.value = this.currentTrackDebugCode;
    if (this.ui.trackCodeStatus) this.ui.trackCodeStatus.textContent = 'Ready';
  }

  async copyTrackDebugCode() {
    const code = this.currentTrackDebugCode || this.getTrackDebugCode();
    if (this.ui.trackCodeOutput) {
      this.ui.trackCodeOutput.value = code;
      this.ui.trackCodeOutput.select();
    }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      else throw new Error('Clipboard API unavailable');
      if (this.ui.trackCodeStatus) this.ui.trackCodeStatus.textContent = 'Copied';
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      if (this.ui.trackCodeStatus) this.ui.trackCodeStatus.textContent = ok ? 'Copied' : 'Select + copy';
    }
    clearTimeout(this.trackCodeStatusTimer);
    this.trackCodeStatusTimer = setTimeout(() => {
      if (this.ui.trackCodeStatus) this.ui.trackCodeStatus.textContent = 'Ready';
    }, 1400);
  }

  applyImportedTrackDebugSettings(payload) {
    if (!payload || payload.app !== 'marble-race') return false;
    if (this.ui.seed) this.ui.seed.value = String(payload.seed || payload.rngMaterial || '');
    if (this.ui.lengthSelect && payload.trackPresetKey) this.ui.lengthSelect.value = payload.trackPresetKey;
    if (this.ui.customLength && payload.customTrackLength) this.ui.customLength.value = String(payload.customTrackLength);
    const widthIndex = Object.keys(WIDTH_PRESETS).indexOf(payload.widthPresetKey || 'normal');
    if (this.ui.width && widthIndex >= 0) this.ui.width.value = String(widthIndex);
    if (this.ui.speed && Number.isFinite(Number(payload.speedIndex))) this.ui.speed.value = String(payload.speedIndex);
    if (this.ui.obstacle && Number.isFinite(Number(payload.obstacleIndex))) this.ui.obstacle.value = String(payload.obstacleIndex);
    if (this.ui.obstacleDistribution && payload.obstacleDistributionMode && OBSTACLE_DISTRIBUTION_MODES[payload.obstacleDistributionMode]) this.ui.obstacleDistribution.value = payload.obstacleDistributionMode;
    if (this.ui.curveSelect && payload.curveStyleKey) this.ui.curveSelect.value = payload.curveStyleKey;
    if (this.ui.catchupToggle && typeof payload.catchupAssistEnabled === 'boolean') this.ui.catchupToggle.checked = payload.catchupAssistEnabled;
    this.importedTrackDebugFromSeed = payload;
    this.seedInputWasTrackDebugCode = false;
    return true;
  }

  importTrackDebugCode() {
    const payload = decodeTrackDebugCode(this.ui.trackCodeImport.value);
    if (!payload || payload.app !== 'marble-race') {
      this.lastTrackDebugImportStatus = 'Invalid MR1 code';
      if (this.ui.trackCodeImportStatus) this.ui.trackCodeImportStatus.textContent = this.lastTrackDebugImportStatus;
      return;
    }
    this.applyImportedTrackDebugSettings(payload);
    this.lastTrackDebugImportStatus = 'Imported';
    if (this.ui.trackCodeImportStatus) this.ui.trackCodeImportStatus.textContent = 'Imported — regenerating';
    this.newRace({ regenerateTrack: true });
    if (this.ui.trackCodeImportStatus) this.ui.trackCodeImportStatus.textContent = `Imported ${Math.round(payload.actualTrackLength || 0)}m track`;
  }

  clearTrack() {
    if (this.trackGroup) this.scene.remove(this.trackGroup);
    this.clearGuidePointMarkers();
    this.clearPhysicsHitboxes();
    this.trackBodies.forEach((body) => this.world.removeBody(body));
    this.obstacleBodies.forEach((body) => this.world.removeBody(body));
    this.trackBodies = [];
    this.obstacleBodies = [];
    this.obstacleMeshes = [];
    this.pinballObstacles = [];
    this.obstacleDistributionSummary = null;
    this.pinballInteractions = Object.fromEntries(PINBALL_OBSTACLE_TYPES.map((type) => [type, 0]));
    this.obstacleTypeCounts = Object.fromEntries(PINBALL_OBSTACLE_TYPES.map((type) => [type, 0]));
    this.obstacleCategoryCounts = Object.fromEntries(Object.keys(OBSTACLE_CATEGORIES).map((category) => [category, 0]));
    this.branchSegments = [];
    this.pathPoints = [];
    this.trackSamples = [];
    this.startCatcher = null;
    this.finishCatcher = null;
    this.finishRankingContainer = null;
    this.finishSpinner = null;
    this.toyParkSoftGuidePhysics = this.physicsMechanicKey === 'toyPark' ? (this.physicsMechanic?.softGuidePhysics || TOY_PARK_SOFT_GUIDE_PHYSICS) : null;
    this.toyParkSoftGuideForceCount = 0;
    this.trackStats = { ribbonMeshes: 0, visibleDecks: 0, physicsDecks: 0, railTubes: 0, branchJoinDecks: 0, physicalRailBodies: 0, smoothRailJoinBodies: 0, optimizedRailBodies: 0, broadcastStageMarkers: 0 };
    if (this.physicsMechanicKey === 'toyPark') {
      this.trackStats.toyParkPhysicsMode = this.toyParkSoftGuidePhysics?.mode || null;
      this.trackStats.toyParkHardSplineLock = Boolean(this.toyParkSoftGuidePhysics?.hardSplineLock);
      this.trackStats.toyParkCollisionPreserved = Boolean(this.toyParkSoftGuidePhysics?.collisionPreserved);
      this.trackStats.toyParkGuideAssist = this.toyParkSoftGuidePhysics || null;
    }
    this.firstFinishTime = 0;
    this.firstFinishRealTimeMs = 0;
    this.postFirstFinishDnfCutoff = { ...POST_FIRST_FINISH_DNF_CUTOFF, triggered: false, triggeredAt: null, triggeredAtRealTimeMs: null, dnfCount: 0 };
    this.stuckResetCount = 0;
    this.stallEliminationCount = 0;
    this.defeatedMarbles = [];
    this.midTrackSpeedAssistCount = 0;
    this.finalApproachAssistCount = 0;
    this.slopeDriveForceCount = 0;
    this.railEscapeAssistCount = 0;
    this.fallPenaltySeconds = FALL_TIME_PENALTY_SECONDS;
    this.fallPenaltyCount = 0;
    this.totalFallPenaltySeconds = 0;
    this.hairpinTurnCount = 0;
    this.hairpinTurns = [];
    this.rightAngleTurnCount = 0;
    this.rightAngleTurns = [];
    this.trackPieceSystem = 'modular-pieces';
    this.trackPieces = [];
    this.slopeDrive = { ...SLOPE_DRIVE, ...((this.physicsMechanic || PHYSICS_MECHANIC_PROFILES[DEFAULT_PHYSICS_MECHANIC_KEY]).slopeDriveOverrides || {}) };
    this.toyParkSoftGuidePhysics = this.physicsMechanicKey === 'toyPark' ? (this.physicsMechanic?.softGuidePhysics || TOY_PARK_SOFT_GUIDE_PHYSICS) : null;
    this.directionStabilityAssist = DIRECTION_STABILITY_ASSIST;
    this.landingReboundAbsorber = LANDING_REBOUND_ABSORBER;
    this.airborneGuidePolicy = AIRBORNE_GUIDE_POLICY;
    this.guidePointPolicy = GUIDE_POINT_POLICY;
    this.directionStabilityAssistCount = 0;
    this.landingReboundAbsorberCount = 0;
    this.slopeDriveForceCount = 0;
    this.forwardAccelerationForceCount = 0;
    this.forwardAccelerationDirectionCorrections = 0;
    this.groundY = -3;
    this.minTrackY = 0;
    this.trackSlope = null;
    this.trackWidthProfile = null;
  }

  clearMarbles() {
    this.marbleData.forEach(({ mesh, body, labelSprite, dropTargetBoostAura, orbitRingBoostAura }) => {
      this.scene.remove(mesh);
      if (labelSprite) this.scene.remove(labelSprite);
      if (dropTargetBoostAura) this.scene.remove(dropTargetBoostAura);
      if (orbitRingBoostAura) this.scene.remove(orbitRingBoostAura);
      this.world.removeBody(body);
    });
    this.clearSpectacleEffects({ clearTrails: false });
    this.marbleData = [];
  }

  createTextureCanvas(size = 512, base = '#777') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    return { canvas, ctx };
  }

  createPinballInsertTexture(label, options = {}) {
    const { canvas, ctx } = this.createTextureCanvas(256, options.base || '#151827');
    const grad = ctx.createRadialGradient(128, 118, 12, 128, 128, 150);
    grad.addColorStop(0, options.glow || '#fff6c9');
    grad.addColorStop(0.46, options.mid || '#ff4fa3');
    grad.addColorStop(1, options.edge || '#341044');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(128, 128, 88, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(angle) * 52, 128 + Math.sin(angle) * 52);
      ctx.lineTo(128 + Math.cos(angle) * 104, 128 + Math.sin(angle) * 104);
      ctx.stroke();
    }

    ctx.font = '900 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,12,24,0.62)';
    ctx.fillText(label, 131, 132);
    ctx.fillStyle = '#fff9dd';
    ctx.fillText(label, 128, 128);
    return this.finishTexture(canvas, 1, 1);
  }

  createDropTargetFaceTexture(label, options = {}) {
    const { canvas, ctx } = this.createTextureCanvas(512, options.base || '#12070a');
    const bg = ctx.createLinearGradient(0, 0, 512, 512);
    bg.addColorStop(0, options.hot || '#fff6b8');
    bg.addColorStop(0.18, options.mid || '#ffb000');
    bg.addColorStop(0.56, options.edge || '#ff3d00');
    bg.addColorStop(1, '#180509');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = 'rgba(255, 226, 89, 0.2)';
    for (let y = -512; y < 512; y += 92) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y + 512);
      ctx.lineTo(512, y + 548);
      ctx.lineTo(0, y + 36);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#050816';
    ctx.fillRect(38, 38, 436, 436);
    ctx.fillStyle = '#ffb000';
    ctx.fillRect(58, 58, 396, 396);
    ctx.fillStyle = '#13070a';
    ctx.fillRect(78, 78, 356, 356);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 18;
    ctx.strokeRect(96, 96, 320, 320);
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 9;
    ctx.strokeRect(124, 124, 264, 264);

    // Keep the physical drop-target panel face decorative only.
    // The readable W/I/N letters live on separate label sprites so they can
    // fade out with their individual panels when hit.
    ctx.fillStyle = '#fff8d7';
    ctx.beginPath();
    ctx.roundRect(148, 146, 216, 220, 36);
    ctx.fill();
    ctx.strokeStyle = '#050816';
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.7)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(184, 200);
    ctx.lineTo(328, 200);
    ctx.moveTo(184, 256);
    ctx.lineTo(328, 256);
    ctx.moveTo(184, 312);
    ctx.lineTo(328, 312);
    ctx.stroke();
    return this.finishTexture(canvas, 1, 1);
  }

  createSpinnerGateTexture() {
    const { canvas, ctx } = this.createTextureCanvas(512, '#08091d');
    const bg = ctx.createRadialGradient(256, 230, 18, 256, 256, 360);
    bg.addColorStop(0, '#f8fbff');
    bg.addColorStop(0.12, '#23ffe3');
    bg.addColorStop(0.34, '#7c3dff');
    bg.addColorStop(0.62, '#ff3dac');
    bg.addColorStop(1, '#09071a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 18; i += 1) {
      const angle = (Math.PI * 2 * i) / 18;
      const inner = i % 3 === 0 ? 54 : 92;
      const outer = i % 3 === 0 ? 260 : 232;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(34, 255, 228, 0.42)' : 'rgba(255, 214, 102, 0.35)';
      ctx.lineWidth = i % 3 === 0 ? 9 : 5;
      ctx.beginPath();
      ctx.moveTo(256 + Math.cos(angle) * inner, 256 + Math.sin(angle) * inner);
      ctx.lineTo(256 + Math.cos(angle) * outer, 256 + Math.sin(angle) * outer);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    for (let r = 220; r >= 74; r -= 38) {
      ctx.strokeStyle = r % 76 === 0 ? 'rgba(255,255,255,0.58)' : 'rgba(18,240,200,0.38)';
      ctx.lineWidth = r === 220 ? 10 : 5;
      ctx.beginPath();
      ctx.arc(256, 256, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(256, 256);
    for (let i = 0; i < 3; i += 1) {
      ctx.rotate((Math.PI * 2) / 3);
      const blade = ctx.createLinearGradient(-24, -46, 210, 46);
      blade.addColorStop(0, 'rgba(255,255,255,0.92)');
      blade.addColorStop(0.35, 'rgba(35,255,227,0.84)');
      blade.addColorStop(0.72, 'rgba(255,61,172,0.78)');
      blade.addColorStop(1, 'rgba(255,209,102,0.9)');
      ctx.fillStyle = blade;
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.lineTo(214, -24);
      ctx.lineTo(244, 0);
      ctx.lineTo(214, 24);
      ctx.lineTo(0, 44);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.72)';
      ctx.lineWidth = 7;
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(4,7,18,0.76)';
    ctx.beginPath();
    ctx.arc(256, 256, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff7ad';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.font = '900 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(2,7,18,0.78)';
    ctx.fillText('SPIN', 260, 260);
    ctx.fillStyle = '#f8ffff';
    ctx.fillText('SPIN', 256, 254);
    return this.finishTexture(canvas, 1, 1);
  }

  createSlingshotPanelTexture() {
    const { canvas, ctx } = this.createTextureCanvas(512, '#06131f');
    const bg = ctx.createLinearGradient(0, 0, 512, 512);
    bg.addColorStop(0, '#02111c');
    bg.addColorStop(0.28, '#083c4d');
    bg.addColorStop(0.52, '#11f5d5');
    bg.addColorStop(0.7, '#6b4cff');
    bg.addColorStop(1, '#160724');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 18; i += 1) {
      const x = -60 + i * 38;
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(34,211,238,0.24)';
      ctx.lineWidth = i % 3 === 0 ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(x, 522);
      ctx.lineTo(x + 220, -20);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(2,7,18,0.52)';
    ctx.fillRect(42, 72, 428, 368);
    ctx.strokeStyle = 'rgba(255,255,255,0.62)';
    ctx.lineWidth = 9;
    ctx.strokeRect(42, 72, 428, 368);
    ctx.strokeStyle = 'rgba(18,240,200,0.88)';
    ctx.lineWidth = 5;
    ctx.strokeRect(64, 94, 384, 324);

    ['rgba(255,255,255,0.78)', 'rgba(18,240,200,0.82)', 'rgba(255,61,172,0.76)'].forEach((color, idx) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = idx === 0 ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(86, 330 - idx * 34);
      ctx.lineTo(198, 198 + idx * 16);
      ctx.lineTo(256, 268 - idx * 18);
      ctx.lineTo(314, 198 + idx * 16);
      ctx.lineTo(426, 330 - idx * 34);
      ctx.stroke();
    });

    ctx.font = '900 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(2,7,18,0.72)';
    ctx.fillText('SLING', 260, 258);
    ctx.fillStyle = '#f8ffff';
    ctx.fillText('SLING', 256, 252);
    return this.finishTexture(canvas, 1, 1);
  }

  createSlingshotChevronTexture() {
    const { canvas, ctx } = this.createTextureCanvas(256, '#0a1020');
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#fff7ad');
    grad.addColorStop(0.36, '#16f5d0');
    grad.addColorStop(0.7, '#ff3dac');
    grad.addColorStop(1, '#4f46e5');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(3,7,18,0.42)';
    for (let y = -80; y < 300; y += 72) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y + 58);
      ctx.lineTo(256, y);
      ctx.lineTo(256, y + 30);
      ctx.lineTo(128, y + 88);
      ctx.lineTo(0, y + 30);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, 220, 220);
    return this.finishTexture(canvas, 1, 1);
  }

  createSlingshotRubberTexture() {
    const { canvas, ctx } = this.createTextureCanvas(256, '#050816');
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#050816');
    grad.addColorStop(0.35, '#111827');
    grad.addColorStop(0.5, '#1fffe1');
    grad.addColorStop(0.65, '#111827');
    grad.addColorStop(1, '#050816');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 10; y < 256; y += 24) {
      ctx.strokeStyle = y % 48 === 10 ? 'rgba(255,255,255,0.28)' : 'rgba(20,184,166,0.26)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + 18);
      ctx.stroke();
    }
    return this.finishTexture(canvas, 1, 1);
  }

  createPinBumperMetalTexture() {
    const { canvas, ctx } = this.createTextureCanvas(256, '#b8c1c9');
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#737c84');
    grad.addColorStop(0.18, '#eef5fa');
    grad.addColorStop(0.42, '#aeb8c1');
    grad.addColorStop(0.64, '#f8fdff');
    grad.addColorStop(1, '#6f7880');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 2) {
      const wave = Math.sin(y * 0.23) * 0.035 + Math.sin(y * 0.07) * 0.025;
      ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.max(0, wave)})`;
      ctx.fillRect(0, y, 256, 1);
      ctx.fillStyle = `rgba(20,24,28,${0.035 + Math.max(0, -wave)})`;
      ctx.fillRect(0, y + 1, 256, 1);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    for (let x = -64; x < 320; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 96, 256);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(30,34,38,0.18)';
    ctx.lineWidth = 2;
    for (let x = -32; x < 288; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 256);
      ctx.lineTo(x + 72, 0);
      ctx.stroke();
    }

    const texture = this.finishTexture(canvas, 1, 3);
    texture.userData = { style: 'brushed-metal-pin-bumper', size: 256 };
    return texture;
  }

  createGongCopperTexture() {
    const { canvas, ctx } = this.createTextureCanvas(512, '#9b4a20');
    const bg = ctx.createRadialGradient(256, 236, 18, 256, 256, 330);
    bg.addColorStop(0, '#fff0ad');
    bg.addColorStop(0.16, '#d68a3a');
    bg.addColorStop(0.42, '#b7652b');
    bg.addColorStop(0.7, '#7b3519');
    bg.addColorStop(1, '#2c130b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalCompositeOperation = 'screen';
    for (let r = 42; r <= 238; r += 24) {
      ctx.strokeStyle = r % 48 === 18 ? 'rgba(255,230,150,0.26)' : 'rgba(255,175,86,0.18)';
      ctx.lineWidth = r % 48 === 18 ? 7 : 4;
      ctx.beginPath();
      ctx.arc(256, 256, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 900; i += 1) {
      const angle = (i * 137.508) * Math.PI / 180;
      const radius = 18 + ((i * 47) % 236);
      const x = 256 + Math.cos(angle) * radius;
      const y = 256 + Math.sin(angle) * radius;
      const size = 1 + (i % 5 === 0 ? 2 : 0);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,220,140,0.12)' : 'rgba(52,20,8,0.11)';
      ctx.fillRect(x, y, size, size);
    }

    for (let y = 0; y < 512; y += 2) {
      const wave = Math.sin(y * 0.055) * 0.035 + Math.sin(y * 0.17) * 0.018;
      ctx.fillStyle = `rgba(255,224,150,${0.028 + Math.max(0, wave)})`;
      ctx.fillRect(0, y, 512, 1);
      ctx.fillStyle = `rgba(30,10,4,${0.02 + Math.max(0, -wave)})`;
      ctx.fillRect(0, y + 1, 512, 1);
    }

    ctx.strokeStyle = 'rgba(255,238,174,0.42)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(256, 256, 226, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(73,25,10,0.38)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(256, 256, 112, 0, Math.PI * 2);
    ctx.stroke();

    const texture = this.finishTexture(canvas, 1, 1);
    texture.userData = { style: 'hammered-copper-radial-rings', size: 512 };
    return texture;
  }

  finishTexture(canvas, repeatX = 1, repeatY = 1) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    return texture;
  }

  createTrackTexture() {
    // Seamless track material：避免高頻重複貼圖造成一格格拼接感，改用大面積低對比縱向細紋。
    const { canvas, ctx } = this.createTextureCanvas(1024, '#8b8378');
    const grad = ctx.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#8d867b');
    grad.addColorStop(0.22, '#aaa08f');
    grad.addColorStop(0.5, '#777f89');
    grad.addColorStop(0.78, '#aaa08f');
    grad.addColorStop(1, '#8d867b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    for (let y = 0; y < 1024; y += 1) {
      const wave = Math.sin(y * 0.021) * 7 + Math.sin(y * 0.006) * 10;
      ctx.fillStyle = `rgba(255,255,255,${0.018 + Math.max(0, wave) * 0.0012})`;
      ctx.fillRect(0, y, 1024, 1);
      ctx.fillStyle = `rgba(20,24,28,${0.012 + Math.max(0, -wave) * 0.001})`;
      ctx.fillRect(0, y + 1, 1024, 1);
    }

    for (let i = 0; i < 700; i += 1) {
      const x = (i * 73) % 1024;
      const y = (i * 211) % 1024;
      const alpha = 0.035 + (i % 4) * 0.008;
      ctx.fillStyle = `rgba(230,226,214,${alpha})`;
      ctx.fillRect(x, y, 1 + (i % 2), 1);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(170, 0);
    ctx.lineTo(170, 1024);
    ctx.moveTo(854, 0);
    ctx.lineTo(854, 1024);
    ctx.stroke();
    return this.finishTexture(canvas, 1, 1);
  }

  createRailTexture() {
    const { canvas, ctx } = this.createTextureCanvas(512, '#202a37');
    for (let y = 0; y < 512; y += 1) {
      const stripe = 28 + Math.sin(y * 0.08) * 18 + (y % 31 < 2 ? 55 : 0);
      ctx.fillStyle = `rgb(${stripe}, ${stripe + 12}, ${stripe + 28})`;
      ctx.fillRect(0, y, 512, 1);
    }
    ctx.strokeStyle = 'rgba(124,247,212,0.35)';
    ctx.lineWidth = 8;
    for (let x = 32; x < 512; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 36, 512);
      ctx.stroke();
    }
    return this.finishTexture(canvas, 6, 2);
  }

  createWoodTexture(style = this.getWorldVisualThemeStyle().ground) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = style.base || '#8a552f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let plank = 0; plank < 8; plank += 1) {
      const y = plank * 64;
      const grad = ctx.createLinearGradient(0, y, 512, y + 64);
      grad.addColorStop(0, plank % 2 ? (style.base || '#7b4827') : (style.mid || '#9a6236'));
      grad.addColorStop(0.5, plank % 2 ? (style.secondary || '#a96c3d') : (style.accent || '#734323'));
      grad.addColorStop(1, plank % 2 ? (style.mid || '#6d3e21') : (style.secondary || '#b87945'));
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, 512, 64);
      ctx.strokeStyle = 'rgba(50, 24, 10, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y + 1);
      ctx.lineTo(512, y + 1);
      ctx.stroke();

      for (let line = 0; line < 9; line += 1) {
        const yy = y + 8 + line * 6 + Math.sin(line + plank) * 2;
        ctx.strokeStyle = `rgba(55, 24, 8, ${0.16 + (line % 3) * 0.05})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let x = 0; x <= 512; x += 24) {
          const wobble = Math.sin(x * 0.028 + line + plank * 1.7) * 3.2;
          if (x === 0) ctx.moveTo(x, yy + wobble);
          else ctx.lineTo(x, yy + wobble);
        }
        ctx.stroke();
      }
    }

    for (let knot = 0; knot < 18; knot += 1) {
      const x = (knot * 83 + 47) % 512;
      const y = (knot * 137 + 31) % 512;
      const rx = 12 + (knot % 5) * 3;
      const ry = 5 + (knot % 4) * 2;
      ctx.strokeStyle = 'rgba(55, 24, 8, 0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, Math.sin(knot) * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 10);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    texture.userData = { style: style.pattern || 'wood-arena', themeKey: this.visualThemeKey, role: 'arena-ground' };
    return texture;
  }

  createThemedTrackTexture(style = this.getWorldVisualThemeStyle().track) {
    const { canvas, ctx } = this.createTextureCanvas(1024, style.base || '#10172a');
    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0, style.base || '#10172a');
    grad.addColorStop(0.46, style.mid || '#252b55');
    grad.addColorStop(1, style.secondary || '#3b1243');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    const pattern = style.pattern || 'pinball-playfield';
    if (pattern === 'cyber-circuit') {
      ctx.strokeStyle = `${style.accent || '#00f5d4'}88`;
      ctx.lineWidth = 5;
      for (let y = 70; y < 1024; y += 118) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 1024; x += 92) ctx.lineTo(x, y + ((x / 92) % 2 ? 30 : -16));
        ctx.stroke();
      }
      ctx.strokeStyle = `${style.secondary || '#ff4fa3'}77`;
      for (let x = 48; x < 1024; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 80, 1024);
        ctx.stroke();
      }
    } else if (pattern === 'candy-checker') {
      const cell = 96;
      for (let y = 0; y < 1024; y += cell) {
        for (let x = 0; x < 1024; x += cell) {
          ctx.fillStyle = ((x + y) / cell) % 2 === 0 ? `${style.accent || '#ff70a6'}55` : `${style.secondary || '#75ff8a'}44`;
          ctx.fillRect(x, y, cell, cell);
        }
      }
    } else if (pattern === 'stone-veins') {
      ctx.strokeStyle = `${style.accent || '#fef3c7'}66`;
      ctx.lineWidth = 6;
      for (let i = 0; i < 26; i += 1) {
        const y = (i * 83 + 41) % 1024;
        ctx.beginPath();
        ctx.moveTo(-40, y);
        for (let x = 0; x <= 1060; x += 70) ctx.lineTo(x, y + Math.sin(i * 1.7 + x * 0.018) * 34);
        ctx.stroke();
      }
    } else if (pattern === 'glass-lanes') {
      ctx.globalCompositeOperation = 'screen';
      for (let x = -120; x < 1120; x += 150) {
        const lane = ctx.createLinearGradient(x, 0, x + 120, 1024);
        lane.addColorStop(0, `${style.accent || '#f8fafc'}00`);
        lane.addColorStop(0.5, `${style.accent || '#f8fafc'}35`);
        lane.addColorStop(1, `${style.secondary || '#d4af37'}00`);
        ctx.fillStyle = lane;
        ctx.fillRect(x, 0, 120, 1024);
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (pattern === 'soft-clay-road-panels') {
      // Stronger clay / molded plastic feel for Toy Park: broad smears, tiny pits, soft panel seams.
      ctx.globalCompositeOperation = 'source-over';
      for (let y = 0; y < 1024; y += 1) {
        const wave = Math.sin(y * 0.018) * 9 + Math.sin(y * 0.047) * 4;
        ctx.fillStyle = `rgba(255,255,255,${0.03 + Math.max(0, wave) * 0.002})`;
        ctx.fillRect(0, y, 1024, 1);
        ctx.fillStyle = `rgba(90,92,88,${0.02 + Math.max(0, -wave) * 0.002})`;
        ctx.fillRect(0, y + 1, 1024, 1);
      }
      for (let i = 0; i < 1300; i += 1) {
        const x = (i * 181 + 47) % 1024;
        const y = (i * 317 + 89) % 1024;
        const r = 0.6 + (i % 5) * 0.38;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(92,94,90,0.13)' : 'rgba(255,252,238,0.10)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(92,88,82,0.18)';
      ctx.lineWidth = 5;
      for (let y = 128; y < 1024; y += 164) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.02 + y * 0.01) * 8);
        ctx.stroke();
      }
      ctx.strokeStyle = `${style.line || '#e99a3f'}66`;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(145, 0);
      ctx.lineTo(145, 1024);
      ctx.moveTo(879, 0);
      ctx.lineTo(879, 1024);
      ctx.stroke();
    } else {
      // Mixed Showcase uses one long stretched playfield texture on the ribbon.
      // Keep artwork low-frequency and mostly longitudinal so track-piece joins do not read as tiled blocks.
      ctx.globalCompositeOperation = 'screen';
      for (let x = -80; x < 1120; x += 128) {
        const lane = ctx.createLinearGradient(x, 0, x + 92, 1024);
        lane.addColorStop(0, `${style.accent || '#ff4fa3'}00`);
        lane.addColorStop(0.42, `${style.secondary || '#7cf7d4'}20`);
        lane.addColorStop(1, `${style.accent || '#ff4fa3'}00`);
        ctx.fillStyle = lane;
        ctx.fillRect(x, 0, 92, 1024);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 42; i += 1) {
        const x = (i * 137 + 61) % 1024;
        const y = (i * 251 + 97) % 1024;
        const r = 30 + (i % 7) * 12;
        const hue = [style.accent, style.secondary, style.line, style.mid].filter(Boolean)[i % 4] || '#ff4fa3';
        ctx.strokeStyle = hue;
        ctx.globalAlpha = 0.045 + (i % 3) * 0.014;
        ctx.lineWidth = 3 + (i % 3);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 8;
    for (let x = -220; x < 1220; x += 170) {
      ctx.beginPath();
      ctx.moveTo(x, 1024);
      ctx.bezierCurveTo(x + 90, 720, x + 10, 310, x + 180, 0);
      ctx.stroke();
    }
    ctx.strokeStyle = `${style.line || style.accent || '#ffd166'}88`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(156, 0);
    ctx.lineTo(156, 1024);
    ctx.moveTo(868, 0);
    ctx.lineTo(868, 1024);
    ctx.stroke();

    const texture = this.finishTexture(canvas, 1, 1);
    const useSeamlessLongitudinalUv = pattern !== 'candy-checker';
    if (useSeamlessLongitudinalUv) {
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.userData = { seamlessLongitudinalUv: true, seamlessLongitudinalUvReason: 'full-route-theme-surface' };
    }
    texture.userData = { ...(texture.userData || {}), style: pattern, themeKey: this.visualThemeKey, role: 'track-surface' };
    return texture;
  }

  createNeonRubberTexture(style = this.getWorldVisualThemeStyle().rail) {
    if ((style.pattern || '').includes('heavy-clay-curb')) {
      const { canvas, ctx } = this.createTextureCanvas(512, style.base || '#cc2f34');
      const grad = ctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, style.base || '#cc2f34');
      grad.addColorStop(0.48, style.mid || '#f0e7d9');
      grad.addColorStop(1, style.secondary || '#8a7f79');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
      for (let y = 0; y < 512; y += 1) {
        const smear = Math.sin(y * 0.06) * 16 + Math.sin(y * 0.19) * 6;
        ctx.fillStyle = `rgba(255,245,224,${0.045 + Math.max(0, smear) * 0.002})`;
        ctx.fillRect(0, y, 512, 1);
        ctx.fillStyle = `rgba(65,45,38,${0.035 + Math.max(0, -smear) * 0.002})`;
        ctx.fillRect(0, y + 1, 512, 1);
      }
      for (let i = 0; i < 700; i += 1) {
        const x = (i * 97 + 23) % 512;
        const y = (i * 193 + 71) % 512;
        const r = 0.5 + (i % 4) * 0.42;
        ctx.fillStyle = i % 2 ? 'rgba(55,38,30,0.18)' : 'rgba(255,250,232,0.14)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,250,232,0.18)';
      ctx.lineWidth = 5;
      for (let y = 32; y < 512; y += 76) {
        ctx.beginPath();
        ctx.moveTo(-20, y);
        for (let x = 0; x <= 540; x += 42) ctx.lineTo(x, y + Math.sin(x * 0.04 + y) * 5);
        ctx.stroke();
      }
      const texture = this.finishTexture(canvas, 2.2, 1);
      texture.userData = { style: style.pattern || 'red-white-heavy-clay-curb', themeKey: this.visualThemeKey, role: 'track-rail', clayGrain: style.clayGrain || 'heavy-pitted-molded-plastic' };
      return texture;
    }
    const { canvas, ctx } = this.createTextureCanvas(512, style.base || '#151827');
    for (let y = 0; y < 512; y += 1) {
      const pulse = Math.sin(y * 0.045) * 20;
      ctx.fillStyle = style.pattern === 'chrome-rail'
        ? `rgb(${70 + pulse}, ${78 + pulse * 0.5}, ${92 + pulse * 0.6})`
        : `rgb(${25 + pulse}, ${31 + pulse * 0.4}, ${47 + pulse * 0.8})`;
      ctx.fillRect(0, y, 512, 1);
    }
    [style.accent, style.secondary, '#ffd166', '#9b8cff'].filter(Boolean).forEach((color, i) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-40, 70 + i * 98);
      ctx.lineTo(552, 10 + i * 112);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    const texture = this.finishTexture(canvas, 3, 1);
    texture.userData = { style: style.pattern || 'neon-rubber', themeKey: this.visualThemeKey, role: 'track-rail' };
    return texture;
  }

  createTrack() {
    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);
    const presetBase = TRACK_PRESETS[this.trackPresetKey] || TRACK_PRESETS.medium;
    const preset = this.trackPresetKey === 'custom'
      ? { ...presetBase, label: 'Custom', base: this.customTrackLength || this.getCustomTrackLength(), variation: 0 }
      : presetBase;
    this.trackLength = preset.base + Math.floor((this.rng() - 0.5) * preset.variation);
    if (this.physicsMechanicKey === 'toyPark') {
      // Toy Park random loop: start board -> random straight + left/right 45° bend road tiles -> finish board,
      // with the finish module connecting back to the start-board entrance. Keep scoped to Toy Park.
      // Generate once here and reuse the same piece list in buildPath so length/topology/debug stay in sync.
      this.toyParkGeneratedTilePieces = buildToyParkDefaultTilePieces({ rng: this.rng });
      this.toyParkRandomLoopSummary = this.toyParkGeneratedTilePieces.randomLoopSummary || null;
      this.trackLength = getToyParkTrackRoadLength(this.toyParkGeneratedTilePieces);
    } else {
      this.toyParkGeneratedTilePieces = null;
      this.toyParkRandomLoopSummary = null;
    }
    const widthPreset = this.widthPreset || WIDTH_PRESETS.normal;
    const generatedTrackWidth = widthPreset.min + this.rng() * (widthPreset.max - widthPreset.min);
    this.trackWidth = this.physicsMechanicKey === 'toyPark'
      ? generatedTrackWidth * TOY_PARK_TRACK_WIDTH_SCALE
      : generatedTrackWidth;
    this.toyParkTrackWidthScale = this.physicsMechanicKey === 'toyPark' ? TOY_PARK_TRACK_WIDTH_SCALE : 1;
    this.toyParkOriginalTrackWidth = this.physicsMechanicKey === 'toyPark' ? generatedTrackWidth : null;
    this.buildPath(preset);
    this.ui.length.textContent = `${preset.label} ${this.trackLength}m`;

    const bounds = this.getTrackBounds();
    const minTrackY = Math.min(...this.pathPoints.map((p) => p.y));
    const groundY = this.physicsMechanicKey === 'toyPark' ? minTrackY - 0.035 : minTrackY - 3.2;
    this.groundY = groundY;
    this.minTrackY = minTrackY;
    const worldTheme = this.getWorldVisualThemeStyle();
    const toyParkSolidBackground = this.physicsMechanicKey === 'toyPark'
      ? TOY_PARK_SOLID_BACKGROUND
      : null;
    if (toyParkSolidBackground) {
      this.scene.background = new THREE.Color(toyParkSolidBackground.color);
      this.scene.fog = new THREE.Fog(toyParkSolidBackground.color, 90, 380);
    } else {
      this.scene.background = new THREE.Color(0x081020);
      this.scene.fog = new THREE.Fog(0x081020, 90, 380);
    }
    const woodTexture = toyParkSolidBackground ? null : this.createWoodTexture(worldTheme.ground);
    this.woodGroundMaterial = new THREE.MeshStandardMaterial({
      color: toyParkSolidBackground ? hexColorToNumber(toyParkSolidBackground.color, 0xf3eadb) : 0xffffff,
      map: woodTexture,
      roughness: worldTheme.ground.roughness ?? 0.82,
      metalness: worldTheme.ground.metalness ?? 0.02,
      side: THREE.DoubleSide,
    });
    this.woodGroundMaterial.userData = {
      themeKey: this.visualThemeKey,
      role: 'arena-ground',
      style: toyParkSolidBackground?.label || worldTheme.ground.pattern,
      solidColor: toyParkSolidBackground?.color || null,
      textureDisabled: Boolean(toyParkSolidBackground),
    };
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.width + 120, bounds.depth + 140),
      this.woodGroundMaterial
    );
    ground.rotation.x = -Math.PI / 2;
    // 賽道一路向下坡，草地如果固定喺 -0.22 會喺標準/長途中段蓋住路面。
    // 跟住最低路面再低 3.2m，確保任何 preset 都唔會「行到中間無地板」。
    // Toy Park 係平路 playset，地台應貼近賽道底部，避免玩具路面同欄好似離地浮起。
    ground.position.set(bounds.cx, groundY, bounds.cz);
    ground.receiveShadow = PERFORMANCE_TUNING.shadows;
    ground.userData = {
      type: toyParkSolidBackground ? 'toy-park-solid-cream-background-ground' : 'arena-ground',
      themeKey: this.visualThemeKey,
      backgroundStyle: toyParkSolidBackground?.label || worldTheme.ground.pattern,
      solidColor: toyParkSolidBackground?.color || null,
      textureDisabled: Boolean(toyParkSolidBackground),
    };
    this.trackStats.toyParkBackground = toyParkSolidBackground ? {
      mode: 'solid-color-warm-cream-no-texture',
      color: toyParkSolidBackground.color,
      groundMaterialColor: toyParkSolidBackground.color,
      sceneBackgroundColor: toyParkSolidBackground.color,
      fogColor: toyParkSolidBackground.color,
      textureDisabled: true,
      scopedToToyPark: true,
    } : null;
    this.trackGroup.add(ground);

    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: this.createThemedTrackTexture(worldTheme.track),
      roughness: worldTheme.track.roughness ?? 0.38,
      metalness: worldTheme.track.metalness ?? 0.12,
      clearcoat: worldTheme.track.clearcoat ?? 0.75,
      clearcoatRoughness: 0.18,
      side: THREE.DoubleSide,
    });
    floorMat.userData = { themeKey: this.visualThemeKey, role: 'track-surface', style: worldTheme.track.pattern, clayGrain: worldTheme.track.clayGrain || null };
    const railMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: this.createNeonRubberTexture(worldTheme.rail),
      roughness: worldTheme.rail.roughness ?? 0.3,
      metalness: worldTheme.rail.metalness ?? 0.18,
      clearcoat: worldTheme.rail.clearcoat ?? 0.8,
      clearcoatRoughness: 0.16,
    });
    railMat.userData = { themeKey: this.visualThemeKey, role: 'track-rail', style: worldTheme.rail.pattern, clayGrain: worldTheme.rail.clayGrain || null };
    const stripeMat = new THREE.MeshStandardMaterial({ color: hexColorToNumber(worldTheme.track.line || worldTheme.track.accent, 0xf7f7ff), roughness: 0.5 });
    const finishMat = new THREE.MeshStandardMaterial({ color: hexColorToNumber(worldTheme.gate.warning, 0xffd166), roughness: 0.3, emissive: hexColorToNumber(worldTheme.gate.signEmissive, 0x443000) });

    if (this.physicsMechanicKey === 'toyPark') {
      addToyParkTrackTileRibbons(this, floorMat);
    } else {
      this.addTrackRibbon(this.pathPoints, this.trackWidth, floorMat);
    }
    this.addTrackPhysicsRibbon(this.pathPoints, this.trackWidth);
    if (this.physicsMechanicKey === 'toyPark') {
      addToyParkMarbleGuardRails(this, this.pathPoints, railMat, this.trackWidth);
    } else {
      this.addContinuousRails(this.pathPoints, railMat, this.trackWidth);
    }

    // 分岔路先取消：保留主賽道，避免支路接駁同護欄未穩定時影響比賽。
    this.addStartFinish(stripeMat, finishMat);
    this.addCatchers(railMat, finishMat);
    const toyParkNoObstaclesDefault = this.physicsMechanicKey === 'toyPark';
    const enabledTypeCount = toyParkNoObstaclesDefault ? 0 : (this.enabledObstacleTypes?.size ?? PINBALL_OBSTACLE_TYPES.length);
    const obstacleCount = enabledTypeCount > 0
      ? Math.round((this.obstaclePreset?.multiplier ?? 0) * Math.max(4, Math.floor(this.trackLength / 55)))
      : 0;
    if (toyParkNoObstaclesDefault) {
      this.trackStats.toyParkNoObstaclesDefault = true;
      this.trackStats.toyParkObstaclePolicy = 'temporary-default-no-obstacles';
    }
    this.createObstacles(obstacleCount);
    this.createDecorations();
  }

  detectToyParkTrackOverlapBridgeZones(pathPoints, pieceMetadata) {
    const bridgePadding = 8.5;
    const minCrossingAngleSin = 0.12;
    const toyParkRailOffset = this.trackStats?.toyParkRailOffset ?? 0.392;
    const roadFloorFootprintWidth = this.trackWidth;
    const roadRailOpeningFootprintWidth = roadFloorFootprintWidth + toyParkRailOffset * 2;
    const roadFootprintOverlapDistance = Math.max(1.2, roadRailOpeningFootprintWidth + 0.35);
    const startFrame = pathPoints[0] || null;
    const startHeading = startFrame?.heading ?? -Math.PI / 2;
    const startForward = { x: Math.cos(startHeading), z: Math.sin(startHeading) };
    const startRight = { x: -Math.sin(startHeading), z: Math.cos(startHeading) };
    const startBoardDepth = START_GATE_DESIGN.chuteDepth * 2;
    const startBoardHalfDepth = startBoardDepth / 2;
    const startBoardHalfWidth = roadRailOpeningFootprintWidth / 2;
    const startBoardCenter = startFrame ? {
      x: (startFrame.x || 0) - startForward.x * ((startBoardDepth - START_GATE_DESIGN.chuteDepth) / 2 + ((START_RAMP.prepTrayBackOffset + START_RAMP.prepTrayFrontOffset) / 2)),
      z: (startFrame.z || 0) - startForward.z * ((startBoardDepth - START_GATE_DESIGN.chuteDepth) / 2 + ((START_RAMP.prepTrayBackOffset + START_RAMP.prepTrayFrontOffset) / 2)),
    } : null;
    const startBoardKeepout = startBoardCenter ? {
      enabled: true,
      reason: 'prevent-road-and-bend-tiles-from-visually-stacking-on-top-of-the-pink-start-board',
      allowedConnectorLocalZMin: startBoardHalfDepth - 1.1,
      centerX: Number(startBoardCenter.x.toFixed(3)),
      centerZ: Number(startBoardCenter.z.toFixed(3)),
      halfWidth: Number(startBoardHalfWidth.toFixed(3)),
      halfDepth: Number(startBoardHalfDepth.toFixed(3)),
      depth: Number(startBoardDepth.toFixed(3)),
      railOpeningFootprintWidth: Number(roadRailOpeningFootprintWidth.toFixed(3)),
    } : { enabled: false };
    const segments = [];
    const cross2d = (ax, az, bx, bz) => ax * bz - az * bx;
    const clampUnit = (value) => clamp(value, 0, 1);
    const closestPointOnSegment = (px, pz, segment) => {
      const vx = segment.x2 - segment.x1;
      const vz = segment.z2 - segment.z1;
      const lenSq = Math.max(0.000001, vx * vx + vz * vz);
      const t = clampUnit(((px - segment.x1) * vx + (pz - segment.z1) * vz) / lenSq);
      return {
        t,
        x: segment.x1 + vx * t,
        z: segment.z1 + vz * t,
        d: segment.d1 + (segment.d2 - segment.d1) * t,
      };
    };
    const pointInStartBoardKeepout = (x, z) => {
      if (!startBoardCenter) return null;
      const dx = x - startBoardCenter.x;
      const dz = z - startBoardCenter.z;
      const localX = dx * startRight.x + dz * startRight.z;
      const localZ = dx * startForward.x + dz * startForward.z;
      const lateralInflate = roadRailOpeningFootprintWidth * 0.5;
      const longitudinalInflate = 0.65;
      const inside = Math.abs(localX) <= startBoardHalfWidth + lateralInflate
        && Math.abs(localZ) <= startBoardHalfDepth + longitudinalInflate;
      const nearConnectorEdge = Math.abs(Math.abs(localZ) - startBoardHalfDepth) <= 1.1;
      return {
        inside,
        nearConnectorEdge,
        localX,
        localZ,
      };
    };
    const startBoardIntrusionForSegment = (segment) => {
      if (!startBoardCenter || segment.pieceIndex == null) return null;
      const piece = pieceMetadata[segment.pieceIndex] || null;
      const samples = [0.2, 0.35, 0.5, 0.65, 0.8].map((t) => ({
        t,
        x: segment.x1 + (segment.x2 - segment.x1) * t,
        z: segment.z1 + (segment.z2 - segment.z1) * t,
        d: segment.d1 + (segment.d2 - segment.d1) * t,
      }));
      const intrusion = samples
        .map((sample) => ({ ...sample, keepout: pointInStartBoardKeepout(sample.x, sample.z) }))
        .find((sample) => sample.keepout?.inside && !sample.keepout?.nearConnectorEdge);
      if (!intrusion) return null;
      return {
        overPieceIndex: segment.pieceIndex,
        underPieceIndex: -1,
        overTileKey: piece?.tileKey || null,
        underTileKey: TOY_PARK_TRACK_TILE_LIBRARY.start.key,
        centerD: intrusion.d,
        startD: Math.max(piece?.startD ?? 0, intrusion.d - bridgePadding),
        endD: Math.min(piece?.endD ?? this.trackLength, intrusion.d + bridgePadding),
        crossingX: intrusion.x,
        crossingZ: intrusion.z,
        crossingAngleSin: null,
        planarDistance: 0,
        footprintThreshold: roadFootprintOverlapDistance,
        detectionMode: 'road-vs-start-board-keepout-intrusion',
        nearestSource: `segment-sample-${intrusion.t}`,
        localX: Number(intrusion.keepout.localX.toFixed(3)),
        localZ: Number(intrusion.keepout.localZ.toFixed(3)),
        reason: 'toy-park-road-tile-footprint-entered-start-board-keepout-raise-later-piece-as-bridge',
      };
    };
    const nearEndpoint = (t) => t <= 0.04 || t >= 0.96;
    const crossingOrNearestApproach = (a, b) => {
      const rx = a.x2 - a.x1;
      const rz = a.z2 - a.z1;
      const sx = b.x2 - b.x1;
      const sz = b.z2 - b.z1;
      const denominator = cross2d(rx, rz, sx, sz);
      const lengthProduct = Math.hypot(rx, rz) * Math.hypot(sx, sz);
      const angleSin = Math.abs(denominator) / Math.max(0.0001, lengthProduct);
      const qpx = b.x1 - a.x1;
      const qpz = b.z1 - a.z1;
      if (angleSin >= minCrossingAngleSin && Math.abs(denominator) >= Math.max(0.0001, lengthProduct * 0.0001)) {
        const t = cross2d(qpx, qpz, sx, sz) / denominator;
        const u = cross2d(qpx, qpz, rx, rz) / denominator;
        if (t > 0.04 && t < 0.96 && u > 0.04 && u < 0.96) {
          return {
            dA: a.d1 + (a.d2 - a.d1) * t,
            dB: b.d1 + (b.d2 - b.d1) * u,
            x: a.x1 + rx * t,
            z: a.z1 + rz * t,
            angleSin,
            planarDistance: 0,
            detectionMode: 'centerline-crossing',
          };
        }
      }

      const pointOn = (segment, t) => ({
        t,
        x: segment.x1 + (segment.x2 - segment.x1) * t,
        z: segment.z1 + (segment.z2 - segment.z1) * t,
        d: segment.d1 + (segment.d2 - segment.d1) * t,
      });
      const aQuarter = pointOn(a, 0.25);
      const aMid = pointOn(a, 0.5);
      const aThreeQuarter = pointOn(a, 0.75);
      const bQuarter = pointOn(b, 0.25);
      const bMid = pointOn(b, 0.5);
      const bThreeQuarter = pointOn(b, 0.75);
      const candidates = [
        { from: 'a1', a: { t: 0, x: a.x1, z: a.z1, d: a.d1 }, b: closestPointOnSegment(a.x1, a.z1, b) },
        { from: 'a-quarter', a: aQuarter, b: closestPointOnSegment(aQuarter.x, aQuarter.z, b) },
        { from: 'a-mid', a: aMid, b: closestPointOnSegment(aMid.x, aMid.z, b) },
        { from: 'a-three-quarter', a: aThreeQuarter, b: closestPointOnSegment(aThreeQuarter.x, aThreeQuarter.z, b) },
        { from: 'a2', a: { t: 1, x: a.x2, z: a.z2, d: a.d2 }, b: closestPointOnSegment(a.x2, a.z2, b) },
        { from: 'b1', a: closestPointOnSegment(b.x1, b.z1, a), b: { t: 0, x: b.x1, z: b.z1, d: b.d1 } },
        { from: 'b-quarter', a: closestPointOnSegment(bQuarter.x, bQuarter.z, a), b: bQuarter },
        { from: 'b-mid', a: closestPointOnSegment(bMid.x, bMid.z, a), b: bMid },
        { from: 'b-three-quarter', a: closestPointOnSegment(bThreeQuarter.x, bThreeQuarter.z, a), b: bThreeQuarter },
        { from: 'b2', a: closestPointOnSegment(b.x2, b.z2, a), b: { t: 1, x: b.x2, z: b.z2, d: b.d2 } },
      ].map((candidate) => ({
        ...candidate,
        distance: Math.hypot(candidate.a.x - candidate.b.x, candidate.a.z - candidate.b.z),
      })).filter((candidate) => !(nearEndpoint(candidate.a.t) && nearEndpoint(candidate.b.t)))
        .sort((left, right) => left.distance - right.distance);
      const nearest = candidates[0];
      if (!nearest) return null;
      const projectedOverlapMargin = 0.45;
      const footprintIntersects = nearest.distance <= roadFootprintOverlapDistance
        && (
          angleSin >= 0.35
          || (nearest.distance <= Math.max(1.2, roadRailOpeningFootprintWidth * 0.72 + projectedOverlapMargin))
        );
      if (!footprintIntersects) return null;
      return {
        dA: nearest.a.d,
        dB: nearest.b.d,
        x: (nearest.a.x + nearest.b.x) / 2,
        z: (nearest.a.z + nearest.b.z) / 2,
        angleSin,
        planarDistance: nearest.distance,
        detectionMode: 'road-footprint-proximity-overlap',
        nearestSource: nearest.from,
        footprintThreshold: roadFootprintOverlapDistance,
      };
    };

    for (let index = 1; index < pathPoints.length; index += 1) {
      const prev = pathPoints[index - 1];
      const point = pathPoints[index];
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

    const zones = [];
    const seen = new Set();
    segments.forEach((segment) => {
      if (segment.pieceIndex <= 0) return;
      const intrusion = startBoardIntrusionForSegment(segment);
      if (!intrusion) return;
      const key = `start-board:${segment.pieceIndex}:${Math.round(intrusion.centerD * 4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      zones.push({
        ...intrusion,
        index: zones.length,
      });
    });
    for (let aIndex = 0; aIndex < segments.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < segments.length; bIndex += 1) {
        const a = segments[aIndex];
        const b = segments[bIndex];
        const pieceGap = Math.abs(a.pieceIndex - b.pieceIndex);
        const aPiece = pieceMetadata[a.pieceIndex] || null;
        const bPiece = pieceMetadata[b.pieceIndex] || null;
        const hasBendPiece = Math.abs(aPiece?.turnDegrees || 0) > 0 || Math.abs(bPiece?.turnDegrees || 0) > 0;
        if (pieceGap <= 1) continue;
        if (pieceGap <= 2 && !hasBendPiece) continue;
        const crossing = crossingOrNearestApproach(a, b);
        if (!crossing) continue;
        if (pieceGap <= 2 && crossing.detectionMode !== 'centerline-crossing') continue;
        const overPieceIndex = Math.max(a.pieceIndex, b.pieceIndex);
        const overDistance = overPieceIndex === a.pieceIndex ? crossing.dA : crossing.dB;
        const underPieceIndex = Math.min(a.pieceIndex, b.pieceIndex);
        const key = `${overPieceIndex}:${Math.round(overDistance * 4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const overPiece = pieceMetadata[overPieceIndex] || null;
        const underPiece = pieceMetadata[underPieceIndex] || null;
        zones.push({
          index: zones.length,
          overPieceIndex,
          underPieceIndex,
          overTileKey: overPiece?.tileKey || null,
          underTileKey: underPiece?.tileKey || null,
          centerD: overDistance,
          startD: Math.max(overPiece?.startD ?? 0, overDistance - bridgePadding),
          endD: Math.min(overPiece?.endD ?? this.trackLength, overDistance + bridgePadding),
          crossingX: crossing.x,
          crossingZ: crossing.z,
          crossingAngleSin: crossing.angleSin,
          planarDistance: crossing.planarDistance,
          footprintThreshold: crossing.footprintThreshold ?? roadFootprintOverlapDistance,
          detectionMode: crossing.detectionMode,
          nearestSource: crossing.nearestSource || null,
          reason: 'toy-park-road-footprint-overlap-raise-later-piece-as-visible-bridge',
        });
      }
    }
    zones.sort((left, right) => left.centerD - right.centerD);
    const mergedZones = [];
    zones.forEach((zone) => {
      const previous = mergedZones[mergedZones.length - 1];
      if (previous
        && previous.overPieceIndex === zone.overPieceIndex
        && previous.underPieceIndex === zone.underPieceIndex
        && zone.startD <= previous.endD + 0.75) {
        previous.centerD = (previous.centerD + zone.centerD) / 2;
        previous.startD = Math.min(previous.startD, zone.startD);
        previous.endD = Math.max(previous.endD, zone.endD);
        previous.crossingX = (previous.crossingX + zone.crossingX) / 2;
        previous.crossingZ = (previous.crossingZ + zone.crossingZ) / 2;
        previous.crossingAngleSin = Math.max(previous.crossingAngleSin, zone.crossingAngleSin);
        previous.planarDistance = Math.min(previous.planarDistance ?? zone.planarDistance, zone.planarDistance ?? previous.planarDistance ?? 0);
        previous.detectionMode = previous.detectionMode === zone.detectionMode ? previous.detectionMode : 'mixed-centerline-and-footprint-overlap';
        previous.mergedZoneCount = (previous.mergedZoneCount || 1) + 1;
        return;
      }
      mergedZones.push({ ...zone, index: mergedZones.length, mergedZoneCount: 1 });
    });
    const mergedResult = mergedZones.map((zone, index) => ({ ...zone, index, centerD: (zone.startD + zone.endD) / 2, startBoardKeepout }));
    mergedResult.startBoardKeepout = startBoardKeepout;
    return mergedResult;
  }

  applyToyParkOverlapBridgeHeights(pathPoints, pieceMetadata) {
    if (this.physicsMechanicKey !== 'toyPark') return { enabled: false, zones: [], flyoverSpans: [], raisedPointCount: 0, maxHeightOffset: 0 };
    const zones = this.detectToyParkTrackOverlapBridgeZones(pathPoints, pieceMetadata);
    if (this.toyParkTrackTiles?.rampBridgeCancelled || this.toyParkGeneratedTilePieces?.randomLoopSummary?.rampBridgeCancelled) {
      return {
        enabled: true,
        mode: 'bridge-height-disabled-generator-level-overlap-avoidance',
        bridgeClearance: 0,
        zoneCount: zones.length,
        startBoardKeepout: zones.startBoardKeepout || zones.find((zone) => zone.startBoardKeepout)?.startBoardKeepout || null,
        startBoardIntrusionCount: zones.filter((zone) => zone.detectionMode === 'road-vs-start-board-keepout-intrusion').length,
        flyoverSpanCount: 0,
        raisedPointCount: 0,
        maxHeightOffset: 0,
        flyoverSpans: [],
        rampBridgeCancelled: true,
        replacementPolicy: 'generator-level-road-footprint-avoidance-no-ramp-bridge-tiles',
        zones: zones.map((zone) => ({
          ...zone,
          centerD: Number(zone.centerD.toFixed(3)),
          startD: Number(zone.startD.toFixed(3)),
          endD: Number(zone.endD.toFixed(3)),
          crossingX: Number(zone.crossingX.toFixed(3)),
          crossingZ: Number(zone.crossingZ.toFixed(3)),
          crossingAngleSin: Number((zone.crossingAngleSin ?? 0).toFixed(3)),
          planarDistance: Number((zone.planarDistance ?? 0).toFixed(3)),
          footprintThreshold: Number((zone.footprintThreshold ?? 0).toFixed(3)),
        })),
      };
    }
    const bridgeClearance = 4.6;
    const flyoverSpans = [];
    const spanByPiece = new Map();
    zones.forEach((zone) => {
      const overPiece = pieceMetadata[zone.overPieceIndex] || null;
      if (!overPiece) return;
      const startD = overPiece.startD ?? zone.startD;
      const endD = overPiece.endD ?? zone.endD;
      const existing = spanByPiece.get(zone.overPieceIndex);
      const next = existing || {
        overPieceIndex: zone.overPieceIndex,
        overTileKey: zone.overTileKey || overPiece.tileKey || null,
        underPieceIndexes: new Set(),
        underTileKeys: new Set(),
        sourceZoneIndexes: [],
        detectionModes: new Set(),
        startD,
        endD,
        rawOverlapStartD: zone.startD,
        rawOverlapEndD: zone.endD,
      };
      next.startD = Math.min(next.startD, startD);
      next.endD = Math.max(next.endD, endD);
      next.rawOverlapStartD = Math.min(next.rawOverlapStartD, zone.startD);
      next.rawOverlapEndD = Math.max(next.rawOverlapEndD, zone.endD);
      next.underPieceIndexes.add(zone.underPieceIndex);
      if (zone.underTileKey) next.underTileKeys.add(zone.underTileKey);
      if (zone.detectionMode) next.detectionModes.add(zone.detectionMode);
      next.sourceZoneIndexes.push(zone.index);
      spanByPiece.set(zone.overPieceIndex, next);
    });
    Array.from(spanByPiece.values())
      .sort((left, right) => left.startD - right.startD)
      .forEach((span) => {
        const previous = flyoverSpans[flyoverSpans.length - 1];
        if (previous && span.startD <= previous.endD + 0.75) {
          previous.endD = Math.max(previous.endD, span.endD);
          previous.rawOverlapStartD = Math.min(previous.rawOverlapStartD, span.rawOverlapStartD);
          previous.rawOverlapEndD = Math.max(previous.rawOverlapEndD, span.rawOverlapEndD);
          previous.overPieceIndexes.push(span.overPieceIndex);
          if (span.overTileKey) previous.overTileKeys.add(span.overTileKey);
          span.underPieceIndexes.forEach((value) => previous.underPieceIndexes.add(value));
          span.underTileKeys.forEach((value) => previous.underTileKeys.add(value));
          span.detectionModes.forEach((value) => previous.detectionModes.add(value));
          previous.sourceZoneIndexes.push(...span.sourceZoneIndexes);
          return;
        }
        flyoverSpans.push({
          ...span,
          index: flyoverSpans.length,
          overPieceIndexes: [span.overPieceIndex],
          overTileKeys: new Set(span.overTileKey ? [span.overTileKey] : []),
        });
      });
    flyoverSpans.forEach((span, index) => {
      span.index = index;
      span.overPieceIndexes = Array.from(new Set(span.overPieceIndexes)).sort((a, b) => a - b);
      const firstOverPieceIndex = span.overPieceIndexes[0];
      const lastOverPieceIndex = span.overPieceIndexes[span.overPieceIndexes.length - 1];
      const rampUpPieceIndex = Math.max(0, firstOverPieceIndex - 1);
      const rampDownPieceIndex = Math.min(pieceMetadata.length - 1, lastOverPieceIndex + 1);
      span.rampUpPieceIndex = rampUpPieceIndex;
      span.rampDownPieceIndex = rampDownPieceIndex;
      span.elevatedPieceIndexes = [];
      for (let pieceIndex = firstOverPieceIndex; pieceIndex <= lastOverPieceIndex; pieceIndex += 1) {
        if (pieceIndex !== rampUpPieceIndex && pieceIndex !== rampDownPieceIndex) span.elevatedPieceIndexes.push(pieceIndex);
      }
      const rampUpPiece = pieceMetadata[rampUpPieceIndex] || null;
      const rampDownPiece = pieceMetadata[rampDownPieceIndex] || null;
      span.startD = rampUpPiece?.startD ?? span.startD;
      span.endD = rampDownPiece?.endD ?? span.endD;
      span.length = Math.max(0.001, span.endD - span.startD);
      span.rampLength = Math.max(0.001, (rampUpPiece?.endD ?? span.startD) - (rampUpPiece?.startD ?? span.startD));
      span.rampDownLength = Math.max(0.001, (rampDownPiece?.endD ?? span.endD) - (rampDownPiece?.startD ?? span.endD));
      span.plateauStartD = rampUpPiece?.endD ?? span.startD;
      span.plateauEndD = rampDownPiece?.startD ?? span.endD;
      span.centerD = (span.startD + span.endD) / 2;
      span.tileAwareRampMode = 'rollback-one-board-ramp-up-ordinary-boards-elevated-until-clear-then-ramp-down';
    });

    let raisedPointCount = 0;
    let maxHeightOffset = 0;
    pathPoints.forEach((point) => {
      const activeSpan = flyoverSpans.find((span) => point.d >= span.startD && point.d <= span.endD);
      if (!activeSpan) {
        point.toyParkBridgeHeightOffset = 0;
        point.toyParkBridgeZoneIndex = null;
        point.toyParkBridgeSpanIndex = null;
        point.toyParkBridgePieceRole = null;
        return;
      }
      const piece = pieceMetadata[point.pieceIndex] || null;
      let normalized = 1;
      let bridgePieceRole = 'elevated-ordinary-board';
      if (point.pieceIndex === activeSpan.rampUpPieceIndex) {
        normalized = clamp((point.d - (piece?.startD ?? activeSpan.startD)) / Math.max(0.001, (piece?.endD ?? activeSpan.plateauStartD) - (piece?.startD ?? activeSpan.startD)), 0, 1);
        bridgePieceRole = 'ramp-up-rollback-board';
      } else if (point.pieceIndex === activeSpan.rampDownPieceIndex) {
        normalized = clamp(((piece?.endD ?? activeSpan.endD) - point.d) / Math.max(0.001, (piece?.endD ?? activeSpan.endD) - (piece?.startD ?? activeSpan.plateauEndD)), 0, 1);
        bridgePieceRole = 'ramp-down-after-overlap-board';
      }
      const smooth = normalized * normalized * (3 - 2 * normalized);
      const offset = bridgeClearance * smooth;
      point.y += offset;
      point.toyParkBridgeHeightOffset = Number(offset.toFixed(4));
      point.toyParkBridgeZoneIndex = activeSpan.sourceZoneIndexes[0] ?? null;
      point.toyParkBridgeSpanIndex = activeSpan.index;
      point.toyParkBridgePieceRole = bridgePieceRole;
      if (offset > 0.001) raisedPointCount += 1;
      maxHeightOffset = Math.max(maxHeightOffset, offset);
    });
    const summarizeSpan = (span) => ({
      index: span.index,
      mode: 'tile-aware-flyover-rollback-one-board-ramp-up-elevated-ordinary-boards-ramp-down',
      tileAwareRampMode: span.tileAwareRampMode,
      rampUpPieceIndex: span.rampUpPieceIndex,
      elevatedPieceIndexes: span.elevatedPieceIndexes,
      rampDownPieceIndex: span.rampDownPieceIndex,
      overPieceIndexes: span.overPieceIndexes,
      overTileKeys: Array.from(span.overTileKeys),
      underPieceIndexes: Array.from(span.underPieceIndexes).sort((a, b) => a - b),
      underTileKeys: Array.from(span.underTileKeys),
      sourceZoneIndexes: span.sourceZoneIndexes,
      detectionModes: Array.from(span.detectionModes),
      startD: Number(span.startD.toFixed(3)),
      endD: Number(span.endD.toFixed(3)),
      centerD: Number(span.centerD.toFixed(3)),
      length: Number(span.length.toFixed(3)),
      rampLength: Number(span.rampLength.toFixed(3)),
      rampDownLength: Number(span.rampDownLength.toFixed(3)),
      plateauStartD: Number(span.plateauStartD.toFixed(3)),
      plateauEndD: Number(span.plateauEndD.toFixed(3)),
      rawOverlapStartD: Number(span.rawOverlapStartD.toFixed(3)),
      rawOverlapEndD: Number(span.rawOverlapEndD.toFixed(3)),
    });
    return {
      enabled: true,
      mode: 'tile-aware-flyover-rollback-one-board-ramp-up-elevated-ordinary-boards-ramp-down',
      bridgeClearance,
      zoneCount: zones.length,
      startBoardKeepout: zones.startBoardKeepout || zones.find((zone) => zone.startBoardKeepout)?.startBoardKeepout || null,
      startBoardIntrusionCount: zones.filter((zone) => zone.detectionMode === 'road-vs-start-board-keepout-intrusion').length,
      flyoverSpanCount: flyoverSpans.length,
      raisedPointCount,
      maxHeightOffset: Number(maxHeightOffset.toFixed(3)),
      flyoverSpans: flyoverSpans.map(summarizeSpan),
      zones: zones.map((zone) => ({
        ...zone,
        centerD: Number(zone.centerD.toFixed(3)),
        startD: Number(zone.startD.toFixed(3)),
        endD: Number(zone.endD.toFixed(3)),
        crossingX: Number(zone.crossingX.toFixed(3)),
        crossingZ: Number(zone.crossingZ.toFixed(3)),
        crossingAngleSin: Number(zone.crossingAngleSin.toFixed(3)),
        planarDistance: Number((zone.planarDistance ?? 0).toFixed(3)),
        footprintThreshold: Number((zone.footprintThreshold ?? 0).toFixed(3)),
      })),
    };
  }

  buildPath(preset) {
    const step = Math.min(1.2, preset.segment);
    const toyParkFlatTrack = this.physicsMechanicKey === 'toyPark';
    const slopeDropPerMeter = toyParkFlatTrack ? 0 : (this.slopeDrive?.dropPerMeter ?? 0.118);
    const startHeight = toyParkFlatTrack ? 1.35 : Math.max(14, Math.min(42, this.trackLength * slopeDropPerMeter + 5.5));
    const widthPreset = this.widthPreset || WIDTH_PRESETS.normal;
    const minWidth = Math.max(widthPreset.absoluteMin, this.trackWidth * widthPreset.minFactor);
    const narrowSections = Array.from({ length: Math.max(2, Math.floor(this.trackLength / 85)) }, () => ({
      center: 28 + this.rng() * Math.max(24, this.trackLength - 56),
      length: 14 + this.rng() * 28,
      strength: 0.18 + this.rng() * 0.32,
    }));
    const widthAt = (d) => {
      if (toyParkFlatTrack) return this.trackWidth;
      const baseWave = 1 - 0.1 * (Math.sin(d * 0.035 + 0.7) + 1) / 2;
      const factor = narrowSections.reduce((value, section) => {
        const t = clamp(1 - Math.abs(d - section.center) / section.length, 0, 1);
        return value - section.strength * (t * t * (3 - 2 * t));
      }, baseWave);
      return clamp(this.trackWidth * factor, minWidth, this.trackWidth);
    };

    const addPiece = (pieces, type, length, turnDegrees = 0, tileKey = null) => {
      pieces.push({ type, length, turnDegrees, tileKey, angleRadians: THREE.MathUtils.degToRad(turnDegrees) });
    };
    const modularPieces = toyParkFlatTrack
      ? (this.toyParkGeneratedTilePieces || buildToyParkDefaultTilePieces({ rng: this.rng }))
      : [];
    if (!toyParkFlatTrack) addPiece(modularPieces, 'straight', 16 + this.rng() * 8, 0);
    const targetLength = this.trackLength;
    let plannedLength = modularPieces.reduce((sum, piece) => sum + piece.length, 0);
    let previousTurn = this.rng() < 0.5 ? -1 : 1;
    let safety = 0;
    while (!toyParkFlatTrack && plannedLength < targetLength - 18 && safety < 40) {
      safety += 1;
      const roll = this.rng();
      if (roll < 0.34) {
        const dir = -previousTurn;
        previousTurn = dir;
        addPiece(modularPieces, 'corner-90', 14 + this.rng() * 4, 90 * dir);
      } else if (roll < 0.62) {
        const dir = this.rng() < 0.5 ? -1 : 1;
        previousTurn = dir;
        addPiece(modularPieces, 'corner-45', 10 + this.rng() * 4, 45 * dir);
      } else {
        addPiece(modularPieces, 'straight', 11 + this.rng() * 11, 0);
      }
      plannedLength = modularPieces.reduce((sum, piece) => sum + piece.length, 0);
    }
    if (!toyParkFlatTrack) addPiece(modularPieces, 'straight', Math.max(12, targetLength - plannedLength), 0);

    let x = 0;
    let y = startHeight;
    let z = 6;
    let d = 0;
    let heading = -Math.PI / 2;
    const pathPoints = [{ x, y, z, d: 0, w: widthAt(0), pieceType: 'start', heading }];
    const pieceMetadata = [];

    modularPieces.forEach((piece, index) => {
      const startD = d;
      const startHeading = heading;
      const steps = Math.max(2, Math.ceil(piece.length / step));
      for (let i = 1; i <= steps; i += 1) {
        const localT = i / steps;
        const prevD = d;
        d = Math.min(targetLength, startD + piece.length * localT);
        const deltaD = d - prevD;
        const turnT = piece.turnDegrees === 0 ? 0 : (localT < 0.5 ? 2 * localT * localT : 1 - ((-2 * localT + 2) ** 2) / 2);
        heading = startHeading + piece.angleRadians * turnT;
        x += Math.cos(heading) * deltaD;
        z += Math.sin(heading) * deltaD;
        const slopeJitter = toyParkFlatTrack ? 0 : ((this.rng() - 0.5) * (this.slopeDrive?.undulationAmplitude ?? 0.035));
        const startRampRatio = !toyParkFlatTrack && START_RAMP.enabled ? clamp(1 - prevD / Math.max(START_RAMP.length, 0.001), 0, 1) : 0;
        const rightAngleRatio = !toyParkFlatTrack && RIGHT_ANGLE_CORNER_SLOPE.enabled && Math.abs(piece.turnDegrees) === 90
          ? (localT < 0.22 ? localT / 0.22 : (localT > 0.78 ? (1 - localT) / 0.22 : 1))
          : 0;
        const nearConsecutiveRightAngle = !toyParkFlatTrack && RIGHT_ANGLE_CORNER_SLOPE.enabled && Math.abs(piece.turnDegrees) === 90 && (
          Math.abs(modularPieces[index - 1]?.turnDegrees || 0) === 90 || Math.abs(modularPieces[index + 1]?.turnDegrees || 0) === 90
        );
        const rightAngleExtraDrop = rightAngleRatio * (
          RIGHT_ANGLE_CORNER_SLOPE.extraDropPerMeter
          + (nearConsecutiveRightAngle ? RIGHT_ANGLE_CORNER_SLOPE.consecutiveExtraDropPerMeter : 0)
        );
        const transitionExtraDrop = !toyParkFlatTrack && RIGHT_ANGLE_CORNER_SLOPE.enabled && Math.abs(piece.turnDegrees) !== 90 && (
          Math.abs(modularPieces[index - 1]?.turnDegrees || 0) === 90 || Math.abs(modularPieces[index + 1]?.turnDegrees || 0) === 90
        ) ? RIGHT_ANGLE_CORNER_SLOPE.transitionExtraDropPerMeter : 0;
        const segmentDropPerMeter = toyParkFlatTrack ? 0 : Math.max(
          this.slopeDrive?.minSegmentDropPerMeter ?? 0.086,
          slopeDropPerMeter + slopeJitter + startRampRatio * START_RAMP.extraDropPerMeter + rightAngleExtraDrop + transitionExtraDrop
        );
        y -= deltaD * segmentDropPerMeter;
        if (toyParkFlatTrack && piece.elevationRole) {
          const bridgeHeight = piece.bridgeHeight ?? TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight?.bridgeHeight ?? 0;
          let elevationOffset = 0;
          if (piece.elevationRole === 'ramp-up') elevationOffset = bridgeHeight * localT;
          else if (piece.elevationRole === 'elevated') elevationOffset = bridgeHeight;
          else if (piece.elevationRole === 'ramp-down') elevationOffset = bridgeHeight * (1 - localT);
          y = startHeight + elevationOffset;
        }
        pathPoints.push({
          x,
          y,
          z,
          d,
          w: widthAt(d),
          pieceType: piece.type,
          pieceIndex: index,
          tileKey: piece.tileKey || null,
          heading,
          segmentDropPerMeter,
          startRampRatio,
          rightAngleRatio,
          rightAngleExtraDrop,
          transitionExtraDrop,
          elevationRole: piece.elevationRole ?? null,
          bridgeModule: Boolean(piece.bridgeModule),
          bridgeModuleRole: piece.bridgeModuleRole ?? null,
          bridgeHeight: piece.bridgeHeight ?? 0,
          toyParkIndependentBridgeHeightOffset: toyParkFlatTrack && piece.elevationRole ? Number((y - startHeight).toFixed(4)) : 0,
        });
        if (d >= targetLength) break;
      }
      heading = startHeading + piece.angleRadians;
      pieceMetadata.push({
        index,
        type: piece.type,
        startD,
        endD: Math.min(targetLength, startD + piece.length),
        length: piece.length,
        turnDegrees: piece.turnDegrees,
        tileKey: piece.tileKey || null,
        tileLabel: getToyParkTileLabel(piece.tileKey),
        loopPrototype: Boolean(piece.loopPrototype),
        loopPrototypeIndex: piece.loopPrototypeIndex ?? null,
        loopSegmentRole: piece.loopSegmentRole ?? null,
        randomLoop: Boolean(piece.randomLoop),
        randomLoopGenerator: piece.randomLoopGenerator ?? null,
        randomLoopAttempt: piece.randomLoopAttempt ?? null,
        randomLoopTurnIndex: piece.randomLoopTurnIndex ?? null,
        randomLoopStraightIndex: piece.randomLoopStraightIndex ?? null,
        turnDirection: piece.turnDirection ?? null,
        closureSolved: Boolean(piece.closureSolved),
        elevationRole: piece.elevationRole ?? null,
        bridgeHeight: piece.bridgeHeight ?? 0,
        bridgeModule: Boolean(piece.bridgeModule),
        bridgeModuleIndex: piece.bridgeModuleIndex ?? null,
        bridgeModuleRole: piece.bridgeModuleRole ?? null,
        bridgeHostStraightIndex: piece.bridgeHostStraightIndex ?? null,
        pathHeightMode: piece.elevationRole
          ? 'independent-ramp-up-elevated-ramp-down-board-height-from-piece-metadata'
          : null,
        startHeading,
        endHeading: heading,
      });
    });

    const toyParkOverlapBridges = toyParkFlatTrack
      ? this.applyToyParkOverlapBridgeHeights(pathPoints, pieceMetadata)
      : { enabled: false, zones: [], flyoverSpans: [], zoneCount: 0, flyoverSpanCount: 0, raisedPointCount: 0, maxHeightOffset: 0 };
    this.toyParkOverlapBridges = toyParkOverlapBridges;
    this.pathPoints = pathPoints;
    this.trackLength = pathPoints[pathPoints.length - 1].d;
    const rightAngleTurns = pieceMetadata.filter((piece) => Math.abs(piece.turnDegrees) === 90);
    const fortyFiveTurns = pieceMetadata.filter((piece) => Math.abs(piece.turnDegrees) === 45);
    const variableBendTurns = pieceMetadata.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.variableBend?.key);
    const straightPieces = pieceMetadata.filter((piece) => piece.type === 'straight');
    const rightAngleSlopePanels = pathPoints.filter((point) => (point.rightAngleExtraDrop || 0) > 0);
    const startPoint = pathPoints[0];
    const finishPoint = pathPoints[pathPoints.length - 1];
    const startHeading = startPoint?.heading ?? -Math.PI / 2;
    const startBoardExitPoint = startPoint;
    const startBoardEntrancePoint = toyParkFlatTrack ? {
      x: (startPoint?.x || 0) - Math.cos(startHeading) * TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT,
      y: startPoint?.y || 0,
      z: (startPoint?.z || 0) - Math.sin(startHeading) * TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT,
      heading: startHeading,
    } : startPoint;
    const loopClosureDistance = Math.hypot((finishPoint?.x || 0) - (startBoardEntrancePoint?.x || 0), (finishPoint?.z || 0) - (startBoardEntrancePoint?.z || 0));
    const loopClosureDistanceToStartExit = Math.hypot((finishPoint?.x || 0) - (startBoardExitPoint?.x || 0), (finishPoint?.z || 0) - (startBoardExitPoint?.z || 0));
    const totalTurnDegrees = pieceMetadata.reduce((sum, piece) => sum + (piece.turnDegrees || 0), 0);
    const headingDeltaDegrees = THREE.MathUtils.radToDeg((finishPoint?.heading ?? heading) - startHeading);
    const loopClosure = toyParkFlatTrack ? {
      mode: 'toy-park-random-left-right-45-and-90-degree-loop-finish-to-start-entrance',
      closureTarget: 'start-board-entrance-not-start-board-exit',
      startBoardExitPosition: {
        x: Number((startBoardExitPoint?.x || 0).toFixed(3)),
        y: Number((startBoardExitPoint?.y || 0).toFixed(3)),
        z: Number((startBoardExitPoint?.z || 0).toFixed(3)),
      },
      startBoardEntrancePosition: {
        x: Number((startBoardEntrancePoint?.x || 0).toFixed(3)),
        y: Number((startBoardEntrancePoint?.y || 0).toFixed(3)),
        z: Number((startBoardEntrancePoint?.z || 0).toFixed(3)),
      },
      startBoardEntranceOffsetFromExit: TOY_PARK_START_BOARD_ENTRANCE_OFFSET_FROM_EXIT,
      finishPosition: {
        x: Number((finishPoint?.x || 0).toFixed(3)),
        y: Number((finishPoint?.y || 0).toFixed(3)),
        z: Number((finishPoint?.z || 0).toFixed(3)),
      },
      closureDistance: Number(loopClosureDistance.toFixed(3)),
      closureDistanceToStartBoardExit: Number(loopClosureDistanceToStartExit.toFixed(3)),
      closureTolerance: 1.25,
      finishConnectsToStartEntrance: loopClosureDistance <= 1.25,
      finishConnectsToStartExit: loopClosureDistanceToStartExit <= 1.25,
      totalTurnDegrees: Number(totalTurnDegrees.toFixed(3)),
      expectedTotalTurnDegrees: 360,
      headingDeltaDegrees: Number(headingDeltaDegrees.toFixed(3)),
      roadTileCount: pieceMetadata.length,
      straightTileCount: straightPieces.length,
      fortyFiveTileCount: fortyFiveTurns.length,
      ninetyDegreeTileCount: rightAngleTurns.length,
      variableBendTileCount: variableBendTurns.length,
      uTurn180TileCount: 0,
      uTurn180Cancelled: true,
      roadLength: Number((finishPoint?.d || 0).toFixed(3)),
      randomGeneratedSequence: Boolean(this.toyParkRandomLoopSummary?.randomGenerated),
      randomLoopSummary: this.toyParkRandomLoopSummary || null,
      leftBendCount: variableBendTurns.filter((piece) => piece.turnDegrees < 0).length,
      rightBendCount: variableBendTurns.filter((piece) => piece.turnDegrees > 0).length,
      hasNinetyDegreeBends: rightAngleTurns.length > 0,
      finishBoardConnectsLoop: true,
      shortPrototypeForTesting: false,
      finalRoadToFinishConnector: 'straight-square-entry-connector-before-finish-board',
    } : null;
    const consecutiveRightAngleSections = rightAngleTurns.filter((piece) => {
      const before = pieceMetadata[piece.index - 1];
      const after = pieceMetadata[piece.index + 1];
      return Math.abs(before?.turnDegrees || 0) === 90 || Math.abs(after?.turnDegrees || 0) === 90;
    });
    this.trackPieceSystem = toyParkFlatTrack ? 'toy-park-road-tile-modules' : 'modular-pieces';
    this.trackPieces = pieceMetadata;
    this.toyParkBoardSequence = toyParkFlatTrack ? buildToyParkBoardSequence({ pieceMetadata, loopClosure }) : null;
    this.toyParkTrackTiles = toyParkFlatTrack ? buildToyParkTrackTileSummary({
      pieceMetadata,
      rightAngleTurns,
      fortyFiveTurns,
      variableBendTurns,
      loopClosure,
      randomLoopSummary: this.toyParkRandomLoopSummary || modularPieces.randomLoopSummary || null,
    }) : null;
    if (toyParkFlatTrack) {
      this.trackStats.toyParkLoopPrototype = loopClosure;
      this.trackStats.toyParkLoopClosedCourse = Boolean(loopClosure?.finishConnectsToStartEntrance);
      this.trackStats.toyParkLoopRoadTileCount = pieceMetadata.length;
      this.trackStats.toyParkLoopTotalTurnDegrees = Number(totalTurnDegrees.toFixed(3));
      this.trackStats.toyParkLoopTileSequence = this.toyParkTrackTiles?.sequence || [];
      this.trackStats.toyParkBoardSequence = this.toyParkBoardSequence;
      this.trackStats.toyParkBoardSequenceReadable = this.toyParkTrackTiles?.boardSequenceReadable || [];
      this.trackStats.toyParkRandomLoopSummary = this.toyParkTrackTiles?.randomLoop || null;
      this.trackStats.toyParkIndependentBridgeModules = this.toyParkTrackTiles?.independentBridgeModules || null;
      this.trackStats.toyParkIndependentBridgeModuleCount = this.toyParkTrackTiles?.independentBridgeModules
        ? this.toyParkTrackTiles.independentBridgeModules.rampUp + this.toyParkTrackTiles.independentBridgeModules.elevatedStraight + this.toyParkTrackTiles.independentBridgeModules.rampDown
        : 0;
      this.trackStats.toyParkIndependentBridgePathHeightMode = this.toyParkTrackTiles?.independentBridgeModules?.pathHeightMode || null;
      this.trackStats.toyParkRandomGeneratedSequence = Boolean(this.toyParkTrackTiles?.randomGeneratedSequence);
      this.trackStats.toyParkLoopLeftBendCount = this.toyParkTrackTiles?.leftBendCount || 0;
      this.trackStats.toyParkLoopRightBendCount = this.toyParkTrackTiles?.rightBendCount || 0;
      this.trackStats.toyParkLoopNinetyDegreeBendCount = this.toyParkTrackTiles?.ninetyDegreeBendCount || 0;
      this.trackStats.toyParkOverlapBridges = toyParkOverlapBridges;
      this.trackStats.toyParkOverlapBridgeZoneCount = toyParkOverlapBridges.zoneCount || 0;
      this.trackStats.toyParkStartBoardKeepout = toyParkOverlapBridges.startBoardKeepout || toyParkOverlapBridges.zones?.find((zone) => zone.startBoardKeepout)?.startBoardKeepout || null;
      this.trackStats.toyParkStartBoardOverlapFixCount = toyParkOverlapBridges.startBoardIntrusionCount || 0;
      this.trackStats.toyParkStartBoardOverlapFixStatus = (toyParkOverlapBridges.startBoardIntrusionCount || 0) > 0
        ? 'road-or-bend-tile-entered-start-board-keepout-detected-but-ramp-bridge-disabled-generator-should-reject-this-route'
        : 'start-board-keepout-active-no-road-tile-intrusion-detected';
      this.trackStats.toyParkOverlapBridgeFlyoverSpanCount = toyParkOverlapBridges.flyoverSpanCount || 0;
      this.trackStats.toyParkOverlapBridgeFlyoverSpans = toyParkOverlapBridges.flyoverSpans || [];
      this.trackStats.toyParkOverlapBridgeMode = toyParkOverlapBridges.mode || null;
      this.trackStats.toyParkOverlapBridgeRaisedPointCount = toyParkOverlapBridges.raisedPointCount || 0;
      this.trackStats.toyParkOverlapBridgeMaxHeightOffset = toyParkOverlapBridges.maxHeightOffset || 0;
    }
    this.rightAngleTurnCount = rightAngleTurns.length;
    this.rightAngleTurns = rightAngleTurns;
    this.hairpinTurnCount = rightAngleTurns.length;
    this.hairpinTurns = rightAngleTurns;
    const bridgeCfg = this.toyParkTrackTiles?.independentBridgeModules;
    this.trackSlope = {
      enabled: !toyParkFlatTrack,
      mode: toyParkFlatTrack ? 'flat-playset-generator-level-road-footprint-avoidance-no-independent-bridge-height-modules' : 'downhill-slope',
      slopeDriveModel: this.slopeDrive?.model,
      startHeight,
      flatTrack: toyParkFlatTrack,
      dropPerMeter: slopeDropPerMeter,
      minSegmentDropPerMeter: this.slopeDrive?.minSegmentDropPerMeter,
      finishHeight: pathPoints[pathPoints.length - 1].y,
      totalDrop: startHeight - pathPoints[pathPoints.length - 1].y,
      independentBridgeModules: bridgeCfg || null,
      toyParkIndependentBridgeModuleCount: bridgeCfg ? (bridgeCfg.rampUp + bridgeCfg.elevatedStraight + bridgeCfg.rampDown) : 0,
      toyParkIndependentBridgeMaxHeightOffset: bridgeCfg?.inserted ? bridgeCfg.height : 0,
      toyParkIndependentBridgePathHeightMode: bridgeCfg?.pathHeightMode || null,
      toyParkOverlapBridges,
      everyPanelDownhill: toyParkFlatTrack
        ? pathPoints.every((point) => !point.toyParkBridgeHeightOffset || point.toyParkBridgeHeightOffset >= 0)
        : pathPoints.every((point, index) => index === 0 || point.y < pathPoints[index - 1].y),
      startRamp: {
        ...START_RAMP,
        baseDropPerMeter: slopeDropPerMeter,
        maxDropPerMeter: slopeDropPerMeter + START_RAMP.extraDropPerMeter,
        firstPanelDropPerMeter: pathPoints[1]?.segmentDropPerMeter ?? null,
      },
      rightAngleCornerSlope: {
        ...RIGHT_ANGLE_CORNER_SLOPE,
        affectedPanelCount: rightAngleSlopePanels.length,
        consecutiveRightAngleCount: consecutiveRightAngleSections.length,
        maxObservedDropPerMeter: Math.max(...pathPoints.map((point) => point.segmentDropPerMeter || 0)),
      },
      generatedBy: toyParkFlatTrack ? 'toy-park-flat-modular-playset-track-no-forward-gravity-drive' : 'monotonic-per-segment-downhill-panels-with-extra-90-degree-corner-pitch',
    };
    this.trackWidthProfile = {
      preset: this.widthPresetKey,
      label: widthPreset.label,
      baseWidth: this.trackWidth,
      originalBaseWidth: this.toyParkOriginalTrackWidth ?? this.trackWidth,
      widthScale: this.toyParkTrackWidthScale ?? 1,
      reducedByPercent: toyParkFlatTrack ? Number(((1 - (this.toyParkTrackWidthScale ?? 1)) * 100).toFixed(1)) : 0,
      minWidth,
      narrowSections,
      generationMode: toyParkFlatTrack ? 'toy-park-road-tile-modules' : 'modular-pieces',
      standardRailOpening: toyParkFlatTrack,
      standardEntranceWidth: toyParkFlatTrack ? this.trackWidth : null,
      standardExitWidth: toyParkFlatTrack ? this.trackWidth : null,
      widthFunction: toyParkFlatTrack ? 'constant-standard-module-width-for-all-toy-park-tile-entrances-and-exits' : 'classic-variable-width-with-narrow-sections',
      toyParkTrackTiles: this.toyParkTrackTiles,
      toyParkBoardSequence: this.toyParkBoardSequence,
      toyParkOverlapBridges,
      toyParkOverlapBridgeMode: toyParkFlatTrack ? toyParkOverlapBridges.mode : null,
      modularTrackPieces: pieceMetadata,
      straightPieceCount: straightPieces.length,
      fortyFiveTurnCount: fortyFiveTurns.length,
      rightAngleTurnCount: rightAngleTurns.length,
      rightAngleTurns,
      rightAngleCornerSlope: {
        ...RIGHT_ANGLE_CORNER_SLOPE,
        affectedPanelCount: rightAngleSlopePanels.length,
        consecutiveRightAngleCount: consecutiveRightAngleSections.length,
      },
      curveStyle: this.curveStyleKey,
      toyParkFlatTrack,
      trackSurfaceMaterial: toyParkFlatTrack ? 'soft-grey-clay-plastic-playset-road' : 'classic-downhill-ribbon',
      guardRailStyle: toyParkFlatTrack ? 'small-marble-bead-guardrails' : 'continuous-rail-tubes',
    };
    this.trackSamples = this.pathPoints.map((p, index) => ({ ...p, index }));
    this.trackWidthProfile.actualMinWidth = Math.min(...this.pathPoints.map((p) => p.w));
  }
  getTrackBounds() {
    const xs = this.pathPoints.map((p) => p.x);
    const zs = this.pathPoints.map((p) => p.z);
    return {
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cz: (Math.min(...zs) + Math.max(...zs)) / 2,
      width: Math.max(120, Math.max(...xs) - Math.min(...xs) + this.trackWidth * 4),
      depth: Math.max(160, Math.max(...zs) - Math.min(...zs) + this.trackWidth * 4),
    };
  }

  addTrackRibbon(points, width, material, options = {}) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const distanceStart = options.distanceStart ?? points[0]?.d ?? 0;
    const distanceEnd = options.distanceEnd ?? points[points.length - 1]?.d ?? this.trackLength;
    points.forEach((point, index) => {
      const frame = this.getTrackFrameAt(point.d);
      const crown = Math.sin((point.d / Math.max(1, this.trackLength)) * Math.PI) * 0.04;
      [-1, 1].forEach((side) => {
        vertices.push(
          point.x + frame.right.x * side * (point.w ?? width) / 2,
          point.y + 0.07 + crown,
          point.z + frame.right.z * side * (point.w ?? width) / 2
        );
        normals.push(0, 1, 0);
        const useFullTrackUv = Boolean(material?.map?.userData?.seamlessLongitudinalUv);
        uvs.push(side < 0 ? 0 : 1, useFullTrackUv ? point.d / Math.max(1, this.trackLength) : point.d / 12);
      });
      if (index < points.length - 1) {
        const base = index * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = PERFORMANCE_TUNING.shadows;
    mesh.name = options.name || mesh.name;
    if (options.renderOrder !== undefined) mesh.renderOrder = options.renderOrder;
    mesh.userData = {
      ...(mesh.userData || {}),
      ...(options.userData || {}),
      cameraOccluder: true,
      cameraOccluderType: 'track-ribbon',
      cameraOccluderDistanceStart: distanceStart,
      cameraOccluderDistanceEnd: distanceEnd,
    };
    this.trackGroup.add(mesh);
    this.trackStats.ribbonMeshes += 1;
    return mesh;
  }

  addVisibleTrackDeck(points, width, material) {
    // 已停用可見 Box deck：之前每段 box 會睇落似階梯。
    // 現在只用連續 ribbon 做視覺地面，避免一級級橫紋。
    this.trackStats.visibleDecks += 0;
  }



  addTrackPhysicsRibbon(points, width) {
    // 用單一連續 Trimesh 做賽道碰撞面，取代密集 box strips，減少物理階梯令波子怪轉。
    const vertices = [];
    const indices = [];
    points.forEach((point, index) => {
      const frame = this.getTrackFrameAt(point.d);
      [-1, 1].forEach((side) => {
        vertices.push(
          point.x + frame.right.x * side * (point.w ?? width) / 2,
          point.y + 0.025,
          point.z + frame.right.z * side * (point.w ?? width) / 2
        );
      });
      if (index < points.length - 1) {
        const base = index * 2;
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    });
    const shape = new CANNON.Trimesh(vertices, indices);
    const body = new CANNON.Body({ mass: 0, material: this.trackMaterial });
    body.addShape(shape);
    this.world.addBody(body);
    this.trackBodies.push(body);
    this.trackStats.physicsRibbon = true;
    this.trackStats.physicsDecks += 1;
    return body;
  }

  addTrackPhysicsStrip(points, width, interval = 0.75) {
    const halfStep = interval * 0.62;
    for (let d = 0; d < this.trackLength; d += interval) {
      const a = this.getTrackPointAt(Math.max(0, d - halfStep));
      const b = this.getTrackPointAt(Math.min(this.trackLength, d + halfStep));
      const segmentWidth = ((a.w ?? this.getTrackWidthAt(a.d ?? d)) + (b.w ?? this.getTrackWidthAt(b.d ?? d))) / 2;
      this.addTrackSegment(a, b, segmentWidth + 0.9, null, true, { visible: false, overlap: 0.9, thickness: 0.24 });
      this.trackStats.physicsDecks += 1;
    }
  }















  addContinuousRails(points, material, width) {
    const railHeight = 1.45;
    const railRadius = 0.18;
    const renderPoints = this.getSmoothedRailPoints(points, width);
    [-1, 1].forEach((side) => {
      const curvePoints = renderPoints.map((point) => new THREE.Vector3(
        point.x + point.right.x * side * ((point.w ?? width) / 2 + 0.5),
        point.y + railHeight,
        point.z + point.right.z * side * ((point.w ?? width) / 2 + 0.5)
      ));
      const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal', 0.12);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(
        curve,
        Math.max(48, Math.floor(renderPoints.length * (this.performanceProfile?.railTubeSegmentMultiplier ?? PERFORMANCE_TUNING.railTubeSegmentMultiplier))),
        railRadius,
        this.performanceProfile?.railTubeRadialSegments ?? PERFORMANCE_TUNING.railTubeRadialSegments,
        false
      ), material);
      tube.castShadow = PERFORMANCE_TUNING.shadows;
      tube.receiveShadow = PERFORMANCE_TUNING.shadows;
      tube.userData = {
        ...(tube.userData || {}),
        cameraOccluder: true,
        cameraOccluderType: 'upper-rail-tube',
        cameraOccluderDistanceStart: 0,
        cameraOccluderDistanceEnd: this.trackLength,
        railSide: side,
      };
      this.trackGroup.add(tube);
      this.trackStats.railTubes += 1;

      const lowerCurve = new THREE.CatmullRomCurve3(curvePoints.map((p) => p.clone().add(new THREE.Vector3(0, -0.78, 0))), false, 'centripetal', 0.12);
      const lowerTube = new THREE.Mesh(new THREE.TubeGeometry(
        lowerCurve,
        Math.max(48, Math.floor(renderPoints.length * (this.performanceProfile?.railTubeSegmentMultiplier ?? PERFORMANCE_TUNING.railTubeSegmentMultiplier))),
        0.1,
        this.performanceProfile?.lowerRailTubeRadialSegments ?? PERFORMANCE_TUNING.lowerRailTubeRadialSegments,
        false
      ), material);
      lowerTube.castShadow = PERFORMANCE_TUNING.shadows;
      lowerTube.receiveShadow = PERFORMANCE_TUNING.shadows;
      lowerTube.userData = {
        ...(lowerTube.userData || {}),
        cameraOccluder: true,
        cameraOccluderType: 'lower-rail-tube',
        cameraOccluderDistanceStart: 0,
        cameraOccluderDistanceEnd: this.trackLength,
        railSide: side,
      };
      this.trackGroup.add(lowerTube);
      this.trackStats.railTubes += 1;
    });
    this.trackStats.visualRailPointCount = renderPoints.length;
    this.trackStats.visualRailSmoothing = 'frame-sampled-rounded-corners';
    this.addPhysicalGuardRails(points, width);
  }

  getSmoothedRailPoints(points, width) {
    const sampleStep = this.performanceProfile?.railTubeSampleStep ?? PERFORMANCE_TUNING.railTubeSampleStep;
    const smoothed = [];
    for (let d = 0; d <= this.trackLength; d += sampleStep) {
      const base = this.getTrackPointAt(d);
      const frame = this.getTrackFrameAt(d);
      smoothed.push({
        x: base.x,
        y: base.y,
        z: base.z,
        d,
        w: base.w ?? this.getTrackWidthAt(d) ?? width,
        right: frame.right.clone(),
      });
    }
    const end = this.getTrackPointAt(this.trackLength);
    const endFrame = this.getTrackFrameAt(this.trackLength);
    smoothed.push({
      x: end.x,
      y: end.y,
      z: end.z,
      d: this.trackLength,
      w: end.w ?? this.getTrackWidthAt(this.trackLength) ?? width,
      right: endFrame.right.clone(),
    });
    return smoothed;
  }

  addPhysicalGuardRails(points, width) {
    // TubeGeometry 只係視覺，Cannon 唔會撞到；要另外沿住護欄加 invisible static boxes。
    // Keep the collision lip thick and close to the visible tube so fast cornering marbles
    // cannot squeeze between short/chorded rail bodies on tight bends.
    // If a marble jumps clearly above the rail, it can still leave the track naturally.
    const wallHeight = this.physicsMechanicKey === 'toyPark' ? 0.72 : 1.12;
    const wallThickness = this.physicsMechanicKey === 'toyPark' ? 0.68 : 0.98;
    const wallBaseOffset = this.physicsMechanicKey === 'toyPark' ? -0.02 : -0.06;
    const railCenterOffset = this.physicsMechanicKey === 'toyPark' ? 0.64 : 0.58;
    const toyParkRailHitboxMode = this.physicsMechanicKey === 'toyPark';
    const targetBodyBudget = this.performanceProfile?.maxPhysicalRailBodies || 520;
    const budgetInterval = this.trackLength > 0 ? (this.trackLength * 2) / targetBodyBudget : 1.65;
    const interval = toyParkRailHitboxMode
      ? clamp(Math.max(0.72, Math.min(budgetInterval, 0.82)), 0.58, 0.86)
      : clamp(
        Math.max(this.performanceProfile?.guardRailInterval || 1.65, budgetInterval),
        1.35,
        2.45
      );
    const overlap = toyParkRailHitboxMode ? 0.42 : (this.performanceProfile?.guardRailOverlap || 3.35);
    let railBodies = 0;
    let smoothJoinBodies = 0;
    for (let d = 0; d < this.trackLength; d += interval) {
      const aD = Math.max(0, d - interval * 0.55);
      const bD = Math.min(this.trackLength, d + interval * 0.55);
      const a = this.getTrackPointAt(aD);
      const b = this.getTrackPointAt(bD);
      [-1, 1].forEach((side) => {
        const frameA = this.getTrackFrameAt(aD);
        const frameB = this.getTrackFrameAt(bD);
        const widthA = this.getTrackWidthAt(aD);
        const widthB = this.getTrackWidthAt(bD);
        const offsetA = widthA / 2 + railCenterOffset;
        const offsetB = widthB / 2 + railCenterOffset;
        const aa = {
          ...a,
          x: a.x + frameA.right.x * offsetA * side,
          z: a.z + frameA.right.z * offsetA * side,
          y: a.y + wallHeight / 2 + wallBaseOffset,
        };
        const bb = {
          ...b,
          x: b.x + frameB.right.x * offsetB * side,
          z: b.z + frameB.right.z * offsetB * side,
          y: b.y + wallHeight / 2 + wallBaseOffset,
        };
        this.addTrackSegment(aa, bb, wallThickness, null, true, {
          visible: false,
          thickness: wallHeight,
          overlap,
          physicsMaterial: this.railMaterial,
          userData: {
            type: 'guard-rail',
            railSide: side,
            railSampleDistance: Number(d.toFixed(2)),
            toyParkInsetReduced: this.physicsMechanicKey === 'toyPark',
            toyParkShortCornerSegments: toyParkRailHitboxMode,
          },
        });
        railBodies += 1;
        smoothJoinBodies += 1;
      });
    }
    this.trackStats.physicalRailBodies = (this.trackStats.physicalRailBodies || 0) + railBodies;
    this.trackStats.smoothRailJoinBodies = (this.trackStats.smoothRailJoinBodies || 0) + smoothJoinBodies;
    this.trackStats.optimizedRailBodies = railBodies;
    this.trackStats.guardRailJoinStyle = 'optimized-rounded-corner-frame-sampled-overlapped';
    this.trackStats.physicalRailInterval = interval;
    this.trackStats.physicalRailOverlap = overlap;
    this.trackStats.physicalRailThickness = wallThickness;
    this.trackStats.physicalRailCenterOffset = railCenterOffset;
    this.trackStats.physicalRailInnerLipFromTrackEdge = Number((railCenterOffset - wallThickness / 2).toFixed(3));
    this.trackStats.physicalRailOuterLipFromTrackEdge = Number((railCenterOffset + wallThickness / 2).toFixed(3));
    this.trackStats.physicalRailHeight = wallHeight;
    this.trackStats.physicalRailTopAboveTrack = wallHeight + wallBaseOffset;
    this.trackStats.physicalRailEscapeStyle = this.physicsMechanicKey === 'toyPark'
      ? 'toy-park-medium-width-short-chord-lips-contact-earlier-without-long-corner-bars'
      : 'thicker-low-side-lip-catches-fast-cornering-marbles-but-allows-clear-jumps';
    this.trackStats.physicalRailBodyBudget = targetBodyBudget;
    this.trackStats.railOptimization = this.physicsMechanicKey === 'toyPark'
      ? 'toy-park-medium-width-short-segment-rail-hitboxes-earlier-contact-smoother-corners'
      : 'denser-thicker-overlapped-side-lip-bodies';
  }

  addTrackSegment(a, b, width, material, addPhysics, options = {}) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const horizontalLength = Math.hypot(dx, dz);
    const length = Math.hypot(horizontalLength, dy);
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(dy, horizontalLength);
    const thickness = options.thickness ?? 0.16;
    const extraLength = options.overlap ?? 0.35;
    const center = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 + (options.yOffset ?? 0), (a.z + b.z) / 2);
    const mesh = options.visible === false ? null : new THREE.Mesh(new THREE.BoxGeometry(width, thickness, length + extraLength), material);
    if (mesh) {
      mesh.position.copy(center);
      mesh.rotation.set(pitch, yaw, 0, 'YXZ');
      mesh.receiveShadow = PERFORMANCE_TUNING.shadows;
      if (options.renderOrder !== undefined) mesh.renderOrder = options.renderOrder;
      this.trackGroup.add(mesh);
    }
    if (!addPhysics) return mesh;
    const body = new CANNON.Body({ mass: 0, material: options.physicsMaterial || this.trackMaterial });
    const halfExtents = new CANNON.Vec3(width / 2, thickness / 2, (length + extraLength) / 2);
    body.addShape(new CANNON.Box(halfExtents));
    body.position.copy(center);
    body.quaternion.setFromEuler(pitch, yaw, 0, 'YXZ');
    body.userData = {
      ...(body.userData || {}),
      ...(options.userData || {}),
      debugShape: 'box',
      debugHalfExtents: { x: halfExtents.x, y: halfExtents.y, z: halfExtents.z },
      debugWidth: width,
      debugThickness: thickness,
      debugLength: length + extraLength,
    };
    this.world.addBody(body);
    this.trackBodies.push(body);
    return mesh ? mesh : body;
  }

  addRails(a, b, material, width) {
    // 分岔路仍用方形護欄；主賽道已用 addContinuousRails 畫連續曲線護欄。
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const horizontalLength = Math.hypot(dx, dz) || 1;
    const segmentLength = Math.hypot(horizontalLength, dy) || 1;
    const right = { x: -dz / horizontalLength, z: dx / horizontalLength };
    const wallHeight = 1.65;
    const offset = width / 2 + 0.45;
    [-1, 1].forEach((side) => {
      const aa = { ...a, x: a.x + right.x * offset * side, z: a.z + right.z * offset * side, y: a.y + wallHeight / 2 };
      const bb = { ...b, x: b.x + right.x * offset * side, z: b.z + right.z * offset * side, y: b.y + wallHeight / 2 };
      this.addTrackSegment(aa, bb, 0.9, material, true, { thickness: wallHeight, overlap: 0.6, physicsMaterial: this.railMaterial });
    });
  }

  addBranchRoad(points, width, material) {
    // 左右延伸嘅分岔路唔再用三角 ribbon；改做穩定實體橋面。
    // 每段有可見橋面 + 同一件物理 body，重疊夠長，避免分岔路中途缺口。
    for (let i = 0; i < points.length - 1; i += 1) {
      this.addTrackSegment(points[i], points[i + 1], width, material, true, {
        thickness: 0.2,
        overlap: 4.2,
        yOffset: 0.015,
      });
      this.trackStats.visibleDecks += 1;
      this.trackStats.physicsDecks += 1;
    }
  }

  addBranchJoinDeck(start, mid, end, material) {
    const joinWidth = this.trackWidth * 0.92;
    const startBridgeEnd = {
      x: lerp(start.x, mid.x, 0.28),
      y: lerp(start.y, mid.y, 0.28),
      z: lerp(start.z, mid.z, 0.28),
      d: start.d + 1,
    };
    const endBridgeStart = {
      x: lerp(mid.x, end.x, 0.72),
      y: lerp(mid.y, end.y, 0.72),
      z: lerp(mid.z, end.z, 0.72),
      d: end.d - 1,
    };
    // 分岔入口/出口要有明顯接駁平台，否則左右延伸路會似斷開。
    this.addTrackSegment(start, startBridgeEnd, joinWidth, material, true, { thickness: 0.16, overlap: 5.8, yOffset: 0.035 });
    this.addTrackSegment(endBridgeStart, end, joinWidth, material, true, { thickness: 0.16, overlap: 5.8, yOffset: 0.035 });
    // 主路上再鋪一塊短接駁板，覆蓋 Y 字口裂縫。
    const startForward = this.getTrackPointAt(Math.min(this.trackLength, start.d + 4.5));
    const endBackward = this.getTrackPointAt(Math.max(0, end.d - 4.5));
    this.addTrackSegment(start, startForward, this.trackWidth + 1.8, material, false, { thickness: 0.045, overlap: 2.8, yOffset: 0.055 });
    this.addTrackSegment(endBackward, end, this.trackWidth + 1.8, material, false, { thickness: 0.045, overlap: 2.8, yOffset: 0.055 });
    this.trackStats.branchJoinDecks += 4;
  }

  createBranches(material, railMat, branchCount) {
    for (let b = 0; b < branchCount; b += 1) {
      const startD = this.trackLength * (0.18 + b * (0.64 / Math.max(branchCount, 1))) + this.rng() * 8;
      const endD = Math.min(startD + 42 + this.rng() * 34, this.trackLength - 14);
      if (endD <= startD + 18) continue;
      const side = this.rng() < 0.5 ? -1 : 1;
      const offset = this.trackWidth * (1.05 + this.rng() * 0.55) * side;
      const points = this.buildCurvedBranchPoints(startD, endD, offset);
      const mid = points[Math.floor(points.length / 2)];
      this.addBranchRoad(points, this.trackWidth * 0.66, material);
      this.addBranchJoinDeck(points[0], mid, points[points.length - 1], material);
      this.addBranchRailTubes(points, railMat, this.trackWidth * 0.66);
      for (let i = 0; i < points.length - 1; i += 1) {
        this.addRails(points[i], points[i + 1], railMat, this.trackWidth * 0.66);
      }
      this.branchSegments.push({ startD, endD, side, curved: true, pointCount: points.length });
    }
  }

  buildCurvedBranchPoints(startD, endD, offset) {
    const startFrame = this.getTrackFrameAt(startD);
    const endFrame = this.getTrackFrameAt(endD);
    const span = Math.max(18, endD - startD);
    const exitRun = Math.min(18, span * 0.32);
    const p0 = new THREE.Vector3(startFrame.p.x, startFrame.p.y + 0.09, startFrame.p.z);
    const p3 = new THREE.Vector3(endFrame.p.x, endFrame.p.y + 0.09, endFrame.p.z);
    // 用三次 Bezier 做分岔：先順住主賽道切線滑出去，再以同方向彎返主路。
    // 舊版三點折線會變成直插 Y 字口，視覺同物理都好突兀。
    const p1 = p0.clone()
      .add(startFrame.tangent.clone().multiplyScalar(exitRun))
      .add(startFrame.right.clone().multiplyScalar(offset * 0.42));
    const p2 = p3.clone()
      .add(endFrame.tangent.clone().multiplyScalar(-exitRun))
      .add(endFrame.right.clone().multiplyScalar(offset * 0.42));
    const samples = 11;
    const points = [];
    for (let i = 0; i < samples; i += 1) {
      const t = i / (samples - 1);
      const inv = 1 - t;
      const curve = p0.clone().multiplyScalar(inv ** 3)
        .add(p1.clone().multiplyScalar(3 * inv * inv * t))
        .add(p2.clone().multiplyScalar(3 * inv * t * t))
        .add(p3.clone().multiplyScalar(t ** 3));
      const d = lerp(startD, endD, t);
      const mainFrame = this.getTrackFrameAt(d);
      const bulge = Math.sin(Math.PI * t) * offset * 0.72;
      curve.x += mainFrame.right.x * bulge;
      curve.z += mainFrame.right.z * bulge;
      curve.y += Math.sin(Math.PI * t) * (0.35 + this.rng() * 0.25);
      points.push({ x: curve.x, y: curve.y, z: curve.z, d });
    }
    points[0] = { ...this.getTrackPointAt(startD), d: startD };
    points[points.length - 1] = { ...this.getTrackPointAt(endD), d: endD };
    return points;
  }

  addBranchRailTubes(points, material, width) {
    const railHeight = 1.35;
    const railRadius = 0.12;
    const sideOffset = width / 2 + 0.42;
    [-1, 1].forEach((side) => {
      const railPoints = points.map((point) => {
        const frame = this.getFrameFromBranchPoints(points, point.d);
        return new THREE.Vector3(
          point.x + frame.right.x * side * ((point.w ?? width) / 2 + 0.5),
          point.y + railHeight,
          point.z + frame.right.z * side * ((point.w ?? width) / 2 + 0.5)
        );
      });
      const curve = new THREE.CatmullRomCurve3(railPoints, false, 'centripetal', 0.25);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(20, points.length * 5), railRadius, 8, false), material);
      tube.castShadow = PERFORMANCE_TUNING.shadows;
      tube.receiveShadow = PERFORMANCE_TUNING.shadows;
      this.trackGroup.add(tube);
      this.trackStats.railTubes += 1;
    });
  }

  getFrameFromBranchPoints(points, distance) {
    let index = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      if (distance >= points[i].d && distance <= points[i + 1].d) { index = i; break; }
    }
    const a = points[Math.max(0, index)];
    const b = points[Math.min(points.length - 1, index + 1)];
    const tangent = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    return { tangent, right };
  }

  addStartFinish(stripeMat, finishMat) {
    const start = this.getTrackPointAt(0);
    const finish = this.getTrackPointAt(this.trackLength);
    const startNext = this.getTrackPointAt(5);
    const finishPrev = this.getTrackPointAt(this.trackLength - 5);
    this.addLinePlate(start, startNext, stripeMat, this.trackWidth + 1.4, 1.0, {
      name: this.physicsMechanicKey === 'toyPark' ? 'TOY_PARK_START_LINE_ON_EXISTING_START_BOARD_MODULE' : 'START_LINE_PLATE',
      userData: this.physicsMechanicKey === 'toyPark' ? {
        type: 'toy-park-start-board-line-marker',
        tileKey: TOY_PARK_TRACK_TILE_LIBRARY.start.key,
        tileLabel: TOY_PARK_TRACK_TILE_LIBRARY.start.label,
        moduleRole: 'start-board-existing-module',
      } : { type: 'start-line-plate' },
    });
    // 終點線改幼身，唔再似一大塊厚板蓋住尾段賽道。
    if (this.physicsMechanicKey === 'toyPark') {
      addToyParkFinishBoard(this, finish, finishPrev, finishMat, {
        connectorYaw: Math.atan2(startNext.x - start.x, startNext.z - start.z),
        connectorAlignment: 'start-board-entrance-yaw',
      });
    } else {
      this.addLinePlate(finish, finishPrev, finishMat, this.trackWidth + 1.0, 0.7, {
        name: 'FINISH_LINE_PLATE',
        userData: { type: 'finish-line-plate' },
      });
    }
  }

  addLinePlate(p, forwardPoint, mat, width, length, options = {}) {
    const dx = forwardPoint.x - p.x;
    const dz = forwardPoint.z - p.z;
    const yaw = Math.atan2(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.045, length), mat);
    mesh.position.set(p.x, p.y + 0.1, p.z);
    mesh.rotation.y = yaw;
    mesh.name = options.name || 'TRACK_LINE_PLATE';
    mesh.userData = { ...(mesh.userData || {}), ...(options.userData || {}) };
    mesh.receiveShadow = PERFORMANCE_TUNING.shadows;
    this.trackGroup.add(mesh);
    return mesh;
  }



  addCatchers(railMat, finishMat) {
    const startFrame = this.getTrackFrameAt(0);
    const finishFrame = this.getTrackFrameAt(this.trackLength);
    this.startCatcher = this.addStartingChute({
      frame: startFrame,
      railMat,
      accentMat: new THREE.MeshStandardMaterial({ color: hexColorToNumber(this.getWorldVisualThemeStyle().gate.panel, 0x7cf7d4), roughness: 0.32, emissive: hexColorToNumber(this.getWorldVisualThemeStyle().gate.emissive, 0x00382f), emissiveIntensity: 0.45 }),
      labelColor: hexColorToNumber(this.getWorldVisualThemeStyle().gate.panel, 0x7cf7d4),
    });
    // No start apron/bridge here: even an invisible physics bridge can block the marbles after the gate opens.
    // START_CHUTE now connects directly to the track entrance. The optional gate can be disabled for a racing-grid start.
    const isToyParkStartMode = this.physicsMechanicKey === 'toyPark' || this.visualThemeKey === 'toyPark';
    const startGateEnabled = START_GATE_DESIGN.gateEnabled !== false && (!isToyParkStartMode || START_GATE_DESIGN.toyParkGateEnabled !== false);
    this.startGate = startGateEnabled ? this.addStartingGate(startFrame, railMat) : null;
    const isToyParkFinishMode = this.physicsMechanicKey === 'toyPark' || this.visualThemeKey === 'toyPark';
    this.finishCatcher = isToyParkFinishMode
      ? null
      : this.addRankingCollector({
        frame: finishFrame,
        width: this.trackWidth + 12,
        racerCount: Math.max(1, Math.floor(Number(this.ui.count.value) || 12)),
        mat: railMat,
        accentMat: finishMat,
        noPodium: false,
      });
    this.finishRankingContainer = this.finishCatcher;
    this.finishSpinner = null;
  }

  getStartGateLayout(requestedCount = null) {
    const maxGateCount = Math.max(1, Math.floor(START_GATE_DESIGN.maxGateCount ?? 12));
    const effectiveRequestedCount = requestedCount == null
      ? maxGateCount
      : Math.max(1, Math.floor(Number(requestedCount) || maxGateCount));
    const maxVisualWidth = Math.max(1, this.trackWidth * clamp(START_GATE_DESIGN.gateWidthRatio ?? 0.72, 0.35, 0.95));
    const minStallWidth = Math.max(0.8, START_GATE_DESIGN.minStallWidth ?? 1.28);
    const widthLimitedGateCount = Math.max(1, Math.floor(maxVisualWidth / minStallWidth));
    const stallCount = Math.max(1, Math.min(maxGateCount, effectiveRequestedCount, widthLimitedGateCount));
    return {
      stallCount,
      gateWidth: Math.min(maxVisualWidth, stallCount * minStallWidth),
      maxVisualWidth,
      stallWidth: Math.min(maxVisualWidth, stallCount * minStallWidth) / stallCount,
    };
  }

  addStartingChute({ frame, railMat, accentMat, labelColor }) {
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const isToyParkStartTile = this.physicsMechanicKey === 'toyPark' || this.visualThemeKey === 'toyPark';
    const toyParkStartSideRailRadius = 0.784;
    const toyParkStartSideRailOffset = 0.392;
    const toyParkStartTrackWidth = frame.p?.w ?? this.getTrackWidthAt?.(0) ?? this.trackWidth;
    const baseChuteDepth = START_GATE_DESIGN.chuteDepth;
    const width = isToyParkStartTile
      ? toyParkStartTrackWidth + toyParkStartSideRailOffset * 2
      : this.trackWidth + START_GATE_DESIGN.chuteWidthPadding;
    const depth = isToyParkStartTile ? baseChuteDepth * 2 : baseChuteDepth;
    const center = this.getStartPrepTrayCenter(frame, { flatBoard: isToyParkStartTile })
      .add(isToyParkStartTile ? frame.tangent.clone().multiplyScalar(-(depth - baseChuteDepth) / 2) : new THREE.Vector3());
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = yaw;
    this.trackGroup.add(group);

    const isNoGateRacingGridStart = isToyParkStartTile && START_GATE_DESIGN.toyParkGateEnabled === false && START_GATE_DESIGN.racingGridStartEnabled !== false;
    const transparentStartVisuals = isToyParkStartTile ? false : Boolean(START_GATE_DESIGN.transparentVisuals);
    const makeToyParkStartBoardTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#d86aa4';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, 'rgba(255,255,255,0.18)');
      grad.addColorStop(0.45, 'rgba(255,208,231,0.10)');
      grad.addColorStop(1, 'rgba(92,39,95,0.16)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Keep the board deliberately plain; slot markers are separate meshes so they can
      // line up with live marble staging positions instead of being baked into texture UVs.
      const sheen = ctx.createRadialGradient(170, 145, 20, 230, 210, 420);
      sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
      sheen.addColorStop(0.62, 'rgba(255,194,224,0.06)');
      sheen.addColorStop(1, 'rgba(95,36,93,0.08)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 1);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.userData = { type: 'toy-park-start-board-texture', pattern: 'plain-pink-clean-board-no-dots-no-straight-lines' };
      return texture;
    };
    const makeToyParkBannerTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const roundedRectPath = (x, y, w, h, r) => {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
      };
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      roundedRectPath(12, 12, canvas.width - 24, canvas.height - 24, 54);
      ctx.clip();
      const clayBase = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      clayBase.addColorStop(0, '#161d36');
      clayBase.addColorStop(0.36, '#263159');
      clayBase.addColorStop(0.72, '#171d35');
      clayBase.addColorStop(1, '#10172b');
      ctx.fillStyle = clayBase;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff5aa9';
      roundedRectPath(24, 22, canvas.width - 48, 30, 15);
      ctx.fill();
      ctx.fillStyle = '#45e3c6';
      roundedRectPath(24, canvas.height - 52, canvas.width - 48, 30, 15);
      ctx.fill();
      const grainCount = 620;
      for (let i = 0; i < grainCount; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = 0.7 + Math.random() * 2.4;
        const alpha = 0.035 + Math.random() * 0.085;
        ctx.fillStyle = i % 3 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(3,7,18,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      const highlight = ctx.createRadialGradient(245, 80, 10, 350, 88, 530);
      highlight.addColorStop(0, 'rgba(255,255,255,0.18)');
      highlight.addColorStop(0.48, 'rgba(255,255,255,0.055)');
      highlight.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = highlight;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffe16a';
      ctx.lineWidth = 16;
      roundedRectPath(34, 38, canvas.width - 68, canvas.height - 76, 42);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 5;
      roundedRectPath(54, 58, canvas.width - 108, canvas.height - 116, 30);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 132px Arial Black, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.30)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 7;
      ctx.fillText('START', canvas.width / 2, canvas.height / 2 + 4);
      ctx.shadowColor = 'transparent';
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.userData = { type: 'toy-park-start-banner-texture', label: 'START', shape: 'rounded-corners', materialStyle: 'heavier-molded-clay-plastic-grain' };
      return texture;
    };
    const floorMat = isToyParkStartTile
      ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: makeToyParkStartBoardTexture(),
        roughness: 0.68,
        metalness: 0,
        clearcoat: 0.32,
        clearcoatRoughness: 0.46,
      })
      : (transparentStartVisuals ? makeStartTransparentMaterial(accentMat, START_GATE_DESIGN.startFloorOpacity) : accentMat);
    floorMat.userData = { ...(floorMat.userData || {}), type: isToyParkStartTile ? 'toy-park-start-board-floor-material' : 'start-floor-material' };
    const railVisualMat = isToyParkStartTile
      ? createToyParkRailMaterialSet(this, railMat).red
      : (transparentStartVisuals ? makeStartTransparentMaterial(railMat, START_GATE_DESIGN.startRailOpacity) : railMat);
    railVisualMat.userData = { ...(railVisualMat.userData || {}), type: isToyParkStartTile ? 'toy-park-start-board-red-white-side-rails' : 'start-rail-material' };
    const toyParkStartSideRailMaterials = isToyParkStartTile
      ? createToyParkStartRailPastelMaterialSet(this, railMat)
      : null;
    if (toyParkStartSideRailMaterials) {
      toyParkStartSideRailMaterials.materials.forEach((material) => {
        material.userData = {
          ...(material.userData || {}),
          type: 'toy-park-start-board-side-rail-pastel-material',
          matchesTrackRailStyle: false,
          startRailPastelPalette: true,
          startRailPinkPalette: false,
          noAdjacentRepeatPalette: true,
        };
      });
    }
    const toyParkBannerTexture = isToyParkStartTile ? makeToyParkBannerTexture() : null;
    const markingMat = (color, emissive, opacity = START_GATE_DESIGN.startMarkingOpacity) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.24, emissive, emissiveIntensity: 0.28 });
      return transparentStartVisuals ? makeStartTransparentMaterial(material, opacity) : material;
    };

    const drop = isToyParkStartTile ? 0 : (START_RAMP.prepTrayBackOffset - START_RAMP.prepTrayFrontOffset) * START_RAMP.prepTrayDropPerMeter;
    const pitch = isToyParkStartTile ? 0 : Math.atan2(drop, depth);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.20, depth), floorMat);
    floor.name = isToyParkStartTile ? 'TOY_PARK_START_BOARD_TILE_PLAIN_PINK_WITH_SLOT_BRACKETS' : 'START_CHUTE_FLOOR';
    floor.userData = {
      ...(floor.userData || {}),
      type: isToyParkStartTile ? 'toy-park-start-board-tile' : 'start-chute-floor',
      startBoardTile: isToyParkStartTile,
      plainPinkPanel: isToyParkStartTile,
      dottedPinkPanel: false,
      straightTextureLines: false,
      stickerLabel: null,
      referenceStyle: isToyParkStartTile ? 'plain-pink-rectangular-board-no-dots-no-lines-with-separate-left-bracket-slot-markers' : null,
    };
    floor.position.set(0, -0.12, 0);
    floor.rotation.x = pitch;
    floor.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(floor);
    const floorBody = new CANNON.Body({ mass: 0, material: this.trackMaterial });
    floorBody.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, 0.10, depth / 2)));
    floorBody.position.copy(center.clone().add(this.localToWorldOffset(0, -0.12, 0, yaw)));
    floorBody.quaternion.setFromEuler(pitch, yaw, 0, 'YXZ');
    this.world.addBody(floorBody);
    this.trackBodies.push(floorBody);

    if (START_GATE_DESIGN.surroundingWallsEnabled && !isToyParkStartTile) {
      const sideSpecs = [
        { x: -width / 2 - START_GATE_DESIGN.sideWallThickness / 2, z: 0, sx: START_GATE_DESIGN.sideWallThickness, sz: depth + 0.8 },
        { x: width / 2 + START_GATE_DESIGN.sideWallThickness / 2, z: 0, sx: START_GATE_DESIGN.sideWallThickness, sz: depth + 0.8 },
      ];
      sideSpecs.forEach((spec) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(spec.sx, START_GATE_DESIGN.sideWallHeight, spec.sz), railVisualMat);
        wall.name = 'START_SURROUNDING_SIDE_WALL';
        wall.position.set(spec.x, START_GATE_DESIGN.sideWallHeight / 2 - 0.02, spec.z);
        wall.castShadow = PERFORMANCE_TUNING.shadows;
        wall.receiveShadow = PERFORMANCE_TUNING.shadows;
        group.add(wall);
        const pos = center.clone().add(this.localToWorldOffset(spec.x, START_GATE_DESIGN.sideWallHeight / 2 - 0.02, spec.z, yaw));
        const body = this.addStaticBox(pos, new THREE.Vector3(spec.sx / 2, START_GATE_DESIGN.sideWallHeight / 2, spec.sz / 2), yaw, this.railMaterial || this.obstacleMaterial);
        if (body) body.userData = { ...(body.userData || {}), name: wall.name, startSurroundingWall: true };
      });

      const backWall = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, START_GATE_DESIGN.backWallHeight, START_GATE_DESIGN.sideWallThickness), railVisualMat);
      backWall.name = 'START_SURROUNDING_BACK_WALL';
      backWall.position.set(0, START_GATE_DESIGN.backWallHeight / 2, -depth / 2 - START_GATE_DESIGN.sideWallThickness / 2);
      backWall.castShadow = PERFORMANCE_TUNING.shadows;
      backWall.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(backWall);
      const backBody = this.addStaticBox(
        center.clone().add(this.localToWorldOffset(0, START_GATE_DESIGN.backWallHeight / 2, -depth / 2 - START_GATE_DESIGN.sideWallThickness / 2, yaw)),
        new THREE.Vector3((width + 0.8) / 2, START_GATE_DESIGN.backWallHeight / 2, START_GATE_DESIGN.sideWallThickness / 2),
        yaw,
        this.obstacleMaterial
      );
      if (backBody) backBody.userData = { ...(backBody.userData || {}), name: backWall.name, startSurroundingWall: true };
    }

    const requestedCount = Math.max(1, Math.floor(Number(this.ui.count.value) || 12));
    const gateLayout = this.getStartGateLayout(requestedCount);
    const stallCount = gateLayout.stallCount;
    const laneGap = gateLayout.stallWidth;
    const gateWidth = gateLayout.gateWidth;
    let toyParkStartSlotMarkerCount = 0;
    let toyParkStartSlotMarkerPartCount = 0;
    let toyParkStartSlotMarkerRows = null;
    let toyParkStartSlotMarkerConfiguredRows = null;
    let toyParkStartSlotMarkerRowSpacing = null;
    let toyParkStartSlotMarkerConfiguredRowSpacing = null;
    let toyParkStartSlotMarkerFitRowSpacing = null;
    let toyParkStartSlotMarkerRowSpacingCompressed = false;
    if (isToyParkStartTile && isNoGateRacingGridStart) {
      const markerMat = new THREE.MeshPhysicalMaterial({
        color: 0xfff1b8,
        roughness: 0.44,
        metalness: 0,
        clearcoat: 0.36,
        clearcoatRoughness: 0.32,
        emissive: 0xff78b6,
        emissiveIntensity: 0.05,
      });
      markerMat.userData = {
        type: 'toy-park-start-board-slot-marker-material',
        shape: 'left-bracket-rotated-90deg-long-edge-facing-start-banner',
        boardDecoration: 'slot-marker-only-no-texture-dots-no-board-grid-lines',
      };
      const racingGridColumns = Math.max(1, Math.floor(START_GATE_DESIGN.racingGridColumns ?? 4));
      const configuredRacingGridRows = Math.max(1, Math.floor(START_GATE_DESIGN.racingGridRows ?? 4));
      const occupiedPerRow = Math.max(1, Math.min(racingGridColumns, Math.floor(START_GATE_DESIGN.racingGridOccupiedPerRow ?? Math.ceil(racingGridColumns / 2))));
      const racingGridRows = Math.max(configuredRacingGridRows, Math.ceil(requestedCount / occupiedPerRow));
      toyParkStartSlotMarkerConfiguredRows = configuredRacingGridRows;
      toyParkStartSlotMarkerRows = racingGridRows;
      const racingGridWidth = START_GATE_DESIGN.racingGridColumnSpacing ?? 1.45;
      const racingLaneGap = racingGridColumns > 1 ? racingGridWidth / (racingGridColumns - 1) : 0;
      const configuredRacingRowSpacing = Math.max(0.95, START_GATE_DESIGN.racingGridRowSpacing ?? 1.28);
      const gateLocalZ = this.getStartPrepLocalZForBack(START_GATE_DESIGN.gateBackDistance);
      const safeBackLocalZ = -depth / 2 + 0.7;
      const gridFrontLocalZ = clamp(gateLocalZ - 0.38, safeBackLocalZ, depth / 2 - 0.95);
      const gridBackLimit = -depth / 2 + 0.72;
      const usableDepth = Math.max(0.001, gridFrontLocalZ - gridBackLimit);
      const fitRowSpacing = racingGridRows > 1 ? usableDepth / (racingGridRows - 1) : configuredRacingRowSpacing;
      const racingRowSpacing = Math.max(0.28, Math.min(configuredRacingRowSpacing, fitRowSpacing));
      toyParkStartSlotMarkerConfiguredRowSpacing = configuredRacingRowSpacing;
      toyParkStartSlotMarkerFitRowSpacing = fitRowSpacing;
      toyParkStartSlotMarkerRowSpacing = racingRowSpacing;
      toyParkStartSlotMarkerRowSpacingCompressed = racingRowSpacing < configuredRacingRowSpacing - 0.001;
      const uniqueSlotCount = requestedCount;
      const markerY = -0.001;
      const markerThickness = 0.055;
      const markerHeight = 0.035;
      const markerLengthX = 0.86;
      const markerArmDepth = 0.42;
      const markerForwardOffsetZ = 0.25;
      const makeMarkerBar = (slotIndex, row, col, kind, x, z, sx, sz) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, markerHeight, sz), markerMat);
        bar.name = `TOY_PARK_START_SLOT_LEFT_BRACKET_${slotIndex}_${kind}`;
        bar.position.set(x, markerY, z);
        bar.rotation.x = pitch;
        bar.castShadow = false;
        bar.receiveShadow = PERFORMANCE_TUNING.shadows;
        bar.userData = {
          type: 'toy-park-start-board-slot-left-bracket-marker',
          startSlotMarker: true,
          markerShape: '[ rotated 90deg',
          markerOrientation: 'long-edge-toward-start-banner-front-positive-local-z',
          markerPart: kind,
          slotIndex,
          row,
          column: col,
          noPhysics: true,
          boardDecoration: 'separate-slot-marker-not-texture-pattern',
        };
        group.add(bar);
        toyParkStartSlotMarkerPartCount += 1;
      };
      for (let slotIndex = 0; slotIndex < uniqueSlotCount; slotIndex += 1) {
        const row = Math.floor(slotIndex / occupiedPerRow);
        const slotInRow = slotIndex % occupiedPerRow;
        const rowStartsWithEmptySlot = row % 2 === 0;
        const col = Math.min(racingGridColumns - 1, rowStartsWithEmptySlot ? slotInRow * 2 + 1 : slotInRow * 2);
        const slotX = (col - (racingGridColumns - 1) / 2) * racingLaneGap;
        const slotZ = clamp(gridFrontLocalZ - row * racingRowSpacing, safeBackLocalZ, depth / 2 - 0.6);
        const frontZ = slotZ + markerForwardOffsetZ;
        makeMarkerBar(slotIndex, row, col, 'front-long-edge-facing-start-banner', slotX, frontZ, markerLengthX, markerThickness);
        makeMarkerBar(slotIndex, row, col, 'left-return-arm', slotX - markerLengthX / 2 + markerThickness / 2, frontZ - markerArmDepth / 2, markerThickness, markerArmDepth);
        makeMarkerBar(slotIndex, row, col, 'right-return-arm', slotX + markerLengthX / 2 - markerThickness / 2, frontZ - markerArmDepth / 2, markerThickness, markerArmDepth);
        toyParkStartSlotMarkerCount += 1;
      }
    }
    let toyParkStartSideRailChunkCount = 0;
    for (let i = 0; i <= stallCount; i += 1) {
      const isOuterLaneBoard = i === 0 || i === stallCount;
      if (isToyParkStartTile && !isOuterLaneBoard) continue;
      const toyParkStartWorldRailSide = i === 0 ? -1 : 1;
      const x = isToyParkStartTile
        ? -toyParkStartWorldRailSide * (toyParkStartTrackWidth / 2 + toyParkStartSideRailOffset)
        : -gateWidth / 2 + i * laneGap;
      const railHeight = isToyParkStartTile
        ? toyParkStartSideRailRadius
        : (isOuterLaneBoard ? Math.max(START_GATE_DESIGN.laneRailHeight, 1.05) : START_GATE_DESIGN.laneRailHeight);
      const railThickness = isToyParkStartTile
        ? toyParkStartSideRailRadius * 2
        : (isOuterLaneBoard ? Math.max(START_GATE_DESIGN.laneRailThickness, 0.18) : START_GATE_DESIGN.laneRailThickness);
      const railDepth = isToyParkStartTile ? depth : depth - 1.2;
      const railCenterLocalZ = isToyParkStartTile ? 0 : -0.25;
      if (isToyParkStartTile) {
        const sideLabel = i === 0 ? 'LEFT' : 'RIGHT';
        const chunkLength = 1.45;
        const chunkGap = 0.035;
        const chunkCount = Math.max(1, Math.ceil(railDepth / chunkLength));
        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
          const zStart = -railDepth / 2 + chunkIndex * (railDepth / chunkCount);
          const zEnd = -railDepth / 2 + (chunkIndex + 1) * (railDepth / chunkCount);
          const chunkDepth = Math.max(0.12, (zEnd - zStart) - chunkGap);
          const frontChunkIndex = (chunkCount - 1) - chunkIndex;
          const pastelPalette = toyParkStartSideRailMaterials.materials;
          const railMaterial = pastelPalette[(frontChunkIndex + (toyParkStartWorldRailSide < 0 ? 0 : 2)) % pastelPalette.length];
          const railCenterZ = railCenterLocalZ + (zStart + zEnd) / 2;
          const railSamples = [
            { center: new THREE.Vector3(x, 0.006, railCenterZ - chunkDepth / 2), right: new THREE.Vector3(1, 0, 0), y: 0.006 },
            { center: new THREE.Vector3(x, 0.006, railCenterZ), right: new THREE.Vector3(1, 0, 0), y: 0.006 },
            { center: new THREE.Vector3(x, 0.006, railCenterZ + chunkDepth / 2), right: new THREE.Vector3(1, 0, 0), y: 0.006 },
          ];
          const rail = buildToyParkHalfRoundRailMesh(this,
            railSamples,
            toyParkStartSideRailRadius,
            railMaterial,
            `TOY_PARK_START_BOARD_SIDE_RAIL_${sideLabel}_${chunkIndex}`,
            {
              type: 'toy-park-start-board-side-rail',
              startBoardSideRail: true,
              matchesTrackSideRailStyle: true,
              matchesTrackRailSize: true,
              redWhiteSideRail: false,
              pinkSideRail: false,
              pastelSideRail: true,
              startRailMatchesMainCurveRoleAtTrackJoin: false,
              noAdjacentRepeatPalette: true,
              paletteKey: railMaterial.userData?.paletteKey || null,
              paletteFamily: railMaterial.userData?.paletteFamily || null,
              paletteIndex: railMaterial.userData?.paletteIndex ?? null,
              noGreenLaneDivider: true,
              side: sideLabel.toLowerCase(),
              railSide: toyParkStartWorldRailSide,
              curveRole: 'pastel-start-side-rail',
              outerLaneBoard: true,
              chunkIndex,
              railRadius: toyParkStartSideRailRadius,
              railHeight,
              railThickness,
              railOffset: toyParkStartSideRailOffset,
              railChunkLength: chunkLength,
              railDepth: Number(railDepth.toFixed(3)),
              railCenterLocalZ,
              railFrontLocalZ: Number((railCenterLocalZ + railDepth / 2).toFixed(3)),
              railBackLocalZ: Number((railCenterLocalZ - railDepth / 2).toFixed(3)),
              railFrontFlushWithBoard: true,
              railProfile: 'same-size-as-main-toy-park-half-round-rail-flat-bottom-upward',
            }
          );
          rail.rotation.x = pitch;
          group.add(rail);
          toyParkStartSideRailChunkCount += 1;
        }
        const body = new CANNON.Body({
          mass: 0,
          material: isToyParkStartTile ? this.trackMaterial : (this.railMaterial || this.obstacleMaterial),
        });
        const railPhysicsHalfWidth = isToyParkStartTile ? 0.34 : railThickness / 2;
        const railPhysicsHalfHeight = isToyParkStartTile ? Math.min(0.34, railHeight / 2) : railHeight / 2;
        body.addShape(new CANNON.Box(new CANNON.Vec3(railPhysicsHalfWidth, railPhysicsHalfHeight, railDepth / 2)));
        body.position.copy(center.clone().add(this.localToWorldOffset(x, railPhysicsHalfHeight + 0.006, railCenterLocalZ, yaw)));
        body.quaternion.setFromEuler(pitch, yaw, 0, 'YXZ');
        body.userData = { name: `TOY_PARK_START_BOARD_SIDE_RAIL_BODY_${sideLabel}`, startSideRailBody: true, startLaneBoard: true, outerLaneBoard: true, noInternalLaneDivider: true, matchesTrackRailSize: true, railFrontFlushWithBoard: true, railDepth, railCenterLocalZ, reducedProtrudingHitbox: true, startSideRailSoftContact: true, contactMaterialRole: 'track-soft-start-side-rail', visualRailHalfWidth: railThickness / 2, physicsRailHalfWidth: railPhysicsHalfWidth, physicsRailInnerLipFromTrackEdge: Number(((toyParkStartSideRailOffset || 0) - railPhysicsHalfWidth).toFixed(3)), debugShape: 'box', debugHalfExtents: { x: railPhysicsHalfWidth, y: railPhysicsHalfHeight, z: railDepth / 2 } };
        this.world.addBody(body);
        this.trackBodies.push(body);
        continue;
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(railThickness, railHeight, railDepth), railVisualMat);
      rail.name = isOuterLaneBoard ? `START_OUTER_LANE_BOARD_${i === 0 ? 'LEFT' : 'RIGHT'}` : `START_LANE_DIVIDER_${i}`;
      rail.userData = {
        ...(rail.userData || {}),
        type: 'start-lane-rail',
        outerLaneBoard: isOuterLaneBoard,
      };
      rail.position.set(x, railHeight / 2 + 0.08, -0.25);
      rail.rotation.x = pitch;
      rail.castShadow = PERFORMANCE_TUNING.shadows;
      rail.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(rail);
      const body = new CANNON.Body({ mass: 0, material: this.railMaterial || this.obstacleMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(railThickness / 2, railHeight / 2, railDepth / 2)));
      body.position.copy(center.clone().add(this.localToWorldOffset(x, railHeight / 2 + 0.08, -0.25, yaw)));
      body.quaternion.setFromEuler(pitch, yaw, 0, 'YXZ');
      body.userData = { name: rail.name, startLaneBoard: true, outerLaneBoard: isOuterLaneBoard };
      this.world.addBody(body);
      this.trackBodies.push(body);
    }

    let toyParkStartBeadCount = 0;
    let toyParkStartBanner = false;
    if (isToyParkStartTile) {
      const bannerMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: toyParkBannerTexture,
        roughness: 0.72,
        metalness: 0,
        clearcoat: 0.22,
        clearcoatRoughness: 0.58,
        side: THREE.DoubleSide,
      });
      bannerMat.userData = {
        type: 'toy-park-start-banner-material',
        label: 'START',
        opaqueClay: true,
        transparentTexture: false,
        role: 'toy-park-rounded-molded-clay-plastic-start-banner',
      };
      const bannerWidth = Math.min(width * 0.92, gateWidth + 2.4);
      const bannerHeight = 1.65;
      const bannerCornerRadius = 0.28;
      const bannerShape = new THREE.Shape();
      const left = -bannerWidth / 2;
      const right = bannerWidth / 2;
      const top = bannerHeight / 2;
      const bottom = -bannerHeight / 2;
      bannerShape.moveTo(left + bannerCornerRadius, top);
      bannerShape.lineTo(right - bannerCornerRadius, top);
      bannerShape.quadraticCurveTo(right, top, right, top - bannerCornerRadius);
      bannerShape.lineTo(right, bottom + bannerCornerRadius);
      bannerShape.quadraticCurveTo(right, bottom, right - bannerCornerRadius, bottom);
      bannerShape.lineTo(left + bannerCornerRadius, bottom);
      bannerShape.quadraticCurveTo(left, bottom, left, bottom + bannerCornerRadius);
      bannerShape.lineTo(left, top - bannerCornerRadius);
      bannerShape.quadraticCurveTo(left, top, left + bannerCornerRadius, top);
      const bannerGeometry = new THREE.ShapeGeometry(bannerShape, 16);
      const bannerPositions = bannerGeometry.attributes.position;
      const bannerUvs = [];
      for (let vertexIndex = 0; vertexIndex < bannerPositions.count; vertexIndex += 1) {
        const px = bannerPositions.getX(vertexIndex);
        const py = bannerPositions.getY(vertexIndex);
        bannerUvs.push((px - left) / bannerWidth, (py - bottom) / bannerHeight);
      }
      bannerGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(bannerUvs, 2));
      const banner = new THREE.Mesh(bannerGeometry, bannerMat);
      banner.name = 'TOY_PARK_START_BANNER_OVERHEAD_START_ROUNDED_CLAY';
      banner.position.set(0, 3.25, depth / 2 - 1.15);
      banner.rotation.set(-0.18, 0, 0);
      banner.castShadow = PERFORMANCE_TUNING.shadows;
      banner.receiveShadow = PERFORMANCE_TUNING.shadows;
      banner.userData = {
        type: 'toy-park-start-banner-overhead',
        startBoardBanner: true,
        text: 'START',
        referenceStyle: 'rounded-corner-black-sticker-like-molded-clay-plastic-start-sign-above-start-tile',
        roundedCorners: true,
        cornerRadius: bannerCornerRadius,
        geometryStyle: 'rounded-rectangle-shape-geometry',
        materialStyle: 'heavier-molded-clay-plastic-grain',
        textureStyle: toyParkBannerTexture?.userData?.materialStyle || null,
      };
      group.add(banner);
      toyParkStartBanner = true;

      const postMat = new THREE.MeshPhysicalMaterial({ color: 0x41e0c1, roughness: 0.48, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.3 });
      [-1, 1].forEach((side) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 3.05, 12), postMat);
        post.name = `TOY_PARK_START_BANNER_POST_${side < 0 ? 'LEFT' : 'RIGHT'}`;
        post.position.set(side * (Math.min(width * 0.92, gateWidth + 2.4) / 2 + 0.18), 1.72, depth / 2 - 1.15);
        post.castShadow = PERFORMANCE_TUNING.shadows;
        post.receiveShadow = PERFORMANCE_TUNING.shadows;
        post.userData = { type: 'toy-park-start-banner-post', startBoardBannerPost: true, side };
        group.add(post);
      });
    }

    if (!isToyParkStartTile) {
      const gateLine = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.075, 0.34), markingMat(labelColor, labelColor, START_GATE_DESIGN.startMarkingOpacity));
      gateLine.name = 'START_GATE_LINE';
      gateLine.userData = { ...(gateLine.userData || {}), type: 'start-gate-line' };
      gateLine.position.set(0, 0.11, depth / 2 - 0.62);
      gateLine.rotation.x = pitch;
      group.add(gateLine);
    }

    if (!isToyParkStartTile) {
      const startText = new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, 0.08, 0.5), markingMat(0xffffff, 0x153a34, START_GATE_DESIGN.startMarkingOpacity));
      startText.name = 'START_TEXT_MARK';
      startText.userData = { ...(startText.userData || {}), type: 'start-text-mark' };
      startText.position.set(0, 0.16, -depth * 0.16);
      startText.rotation.x = pitch;
      group.add(startText);
    }

    if (isToyParkStartTile) {
      this.trackStats.toyParkStartBoard = {
        enabled: true,
        status: isNoGateRacingGridStart
          ? 'ordinary-flat-start-board-visual-preview-no-gate-racing-grid-start'
          : 'ordinary-flat-start-board-visual-preview-existing-gate-physics-preserved',
        style: 'flat-plain-pink-rectangular-board-no-dots-no-straight-lines-rotated-left-bracket-slot-markers-long-edge-facing-start-banner-pastel-mixed-nonrepeating-side-rails-no-side-beads-overhead-start-banner',
        boardWidth: Number(width.toFixed(2)),
        boardSurfaceWidth: Number(width.toFixed(2)),
        originalTrackWidth: Number((this.toyParkOriginalTrackWidth ?? toyParkStartTrackWidth).toFixed(2)),
        widthScale: Number((this.toyParkTrackWidthScale ?? 1).toFixed(2)),
        reducedByPercent: this.toyParkTrackWidthScale ? Number(((1 - this.toyParkTrackWidthScale) * 100).toFixed(1)) : 0,
        trackWidth: Number(toyParkStartTrackWidth.toFixed(2)),
        boardWidthMatchesTrackAndRailFootprint: Math.abs(width - (toyParkStartTrackWidth + toyParkStartSideRailOffset * 2)) < 0.001,
        boardWidthClosesSideGap: true,
        boardDepth: Number(depth.toFixed(2)),
        baseBoardDepth: Number(baseChuteDepth.toFixed(2)),
        boardLengthScale: isToyParkStartTile ? 2 : 1,
        laneCount: stallCount,
        internalLaneRailsVisible: 0,
        sideRailStyle: 'deeper-matte-pastel-pink-blue-purple-cream-green-side-rails-strong-clay-grain-low-clearcoat-no-adjacent-repeat',
        sideRailPalette: toyParkStartSideRailMaterials?.paletteKeys || [],
        sideRailPaletteFamilies: toyParkStartSideRailMaterials?.paletteFamilies || [],
        sideRailNoAdjacentRepeatPalette: true,
        sideRailOpaqueClay: true,
        sideRailTexture: 'opaque-deeper-pastel-strong-heavy-pitted-molded-plastic-clay-grain-matte',
        sideRailLowClearcoat: true,
        sideRailStrongerClayGrain: true,
        sideRailChunkCount: toyParkStartSideRailChunkCount,
        sideRailMatchesTrackRailSize: true,
        sideRailRadius: toyParkStartSideRailRadius,
        sideRailHeight: toyParkStartSideRailRadius,
        sideRailThickness: Number((toyParkStartSideRailRadius * 2).toFixed(3)),
        sideRailOffset: toyParkStartSideRailOffset,
        standardRailOpening: true,
        standardEntranceWidth: Number(toyParkStartTrackWidth.toFixed(3)),
        standardExitWidth: Number(toyParkStartTrackWidth.toFixed(3)),
        railOpeningWidth: Number((toyParkStartTrackWidth + toyParkStartSideRailOffset * 2).toFixed(3)),
        railOpeningMatchesRoadTiles: Math.abs(toyParkStartSideRailOffset - (this.trackStats.toyParkRailOffset ?? toyParkStartSideRailOffset)) < 0.001,
        sideRailChunkLength: 1.45,
        sideRailDepth: Number(depth.toFixed(2)),
        sideRailFrontFlushWithBoard: true,
        sideRailCenterLocalZ: 0,
        sideRailFrontLocalZ: Number((depth / 2).toFixed(2)),
        sideRailBackLocalZ: Number((-depth / 2).toFixed(2)),
        surroundingWallsVisible: false,
        greenLaneRailsRemoved: true,
        beadCount: toyParkStartBeadCount,
        sideBeadsRemoved: toyParkStartBeadCount === 0,
        slotMarkerShape: '[ rotated 90deg',
        slotMarkerOrientation: 'long-edge-toward-start-banner-front-positive-local-z',
        slotMarkerLongEdgeFacingStartBanner: true,
        slotMarkerCount: toyParkStartSlotMarkerCount,
        slotMarkerPartCount: toyParkStartSlotMarkerPartCount,
        slotMarkersPerMarbleStartPosition: isNoGateRacingGridStart,
        boardDotsRemoved: true,
        boardStraightLinesRemoved: true,
        overheadBanner: toyParkStartBanner,
        boardStartTextRemoved: true,
        centerWhiteMarkRemoved: true,
        floorTexture: floorMat.map?.userData?.pattern || null,
        bannerTexture: toyParkBannerTexture?.userData?.label || null,
        bannerRoundedCorners: true,
        bannerGeometryStyle: 'rounded-rectangle-shape-geometry',
        bannerMaterialStyle: toyParkBannerTexture?.userData?.materialStyle || 'heavier-molded-clay-plastic-grain',
        bannerCornerRadius: 0.28,
        bannerOpaqueClay: true,
        flatBoard: true,
        visualPitchDegrees: 0,
        dropToGate: 0,
        gateEnabled: !isNoGateRacingGridStart,
        noGateRacingGridStart: isNoGateRacingGridStart,
        racingGridColumns: START_GATE_DESIGN.racingGridColumns,
        racingGridOccupiedPerRow: START_GATE_DESIGN.racingGridOccupiedPerRow,
        racingGridRows: toyParkStartSlotMarkerRows ?? START_GATE_DESIGN.racingGridRows,
        configuredRacingGridRows: toyParkStartSlotMarkerConfiguredRows ?? START_GATE_DESIGN.racingGridRows,
        racingGridRequiredRows: toyParkStartSlotMarkerRows,
        racingGridMarkerRows: toyParkStartSlotMarkerRows,
        racingGridMarkerRowSpacing: toyParkStartSlotMarkerRowSpacing != null ? Number(toyParkStartSlotMarkerRowSpacing.toFixed(3)) : null,
        racingGridMarkerConfiguredRowSpacing: toyParkStartSlotMarkerConfiguredRowSpacing != null ? Number(toyParkStartSlotMarkerConfiguredRowSpacing.toFixed(3)) : null,
        racingGridMarkerFitRowSpacing: toyParkStartSlotMarkerFitRowSpacing != null ? Number(toyParkStartSlotMarkerFitRowSpacing.toFixed(3)) : null,
        racingGridMarkerRowSpacingCompressed: toyParkStartSlotMarkerRowSpacingCompressed,
        racingGridMarkersScaleWithMarbleCount: true,
        racingGridStyle: isNoGateRacingGridStart ? 'four-column-checkerboard-alternating-two-marbles-per-row-extends-with-marble-count' : null,
      };
    }

    return {
      center,
      yaw,
      width,
      depth,
      frame,
      name: 'START_CHUTE',
      slopePitch: pitch,
      laneCount: stallCount,
      gateWidth,
      maxGateWidth: gateLayout.maxVisualWidth,
      stallWidth: gateLayout.stallWidth,
      dropToGate: drop,
      frontLocalZ: depth / 2,
      backLocalZ: -depth / 2,
      design: START_GATE_DESIGN.style,
      gateEnabled: !isNoGateRacingGridStart,
      noGateRacingGridStart: isNoGateRacingGridStart,
      racingGridColumns: START_GATE_DESIGN.racingGridColumns,
      surroundingWallsEnabled: Boolean(START_GATE_DESIGN.surroundingWallsEnabled),
      surroundingWallsRemoved: !START_GATE_DESIGN.surroundingWallsEnabled,
      trackConnection: 'frontLocalZ-positive-aligns-with-frame-tangent-and-track-d0',
      startLaneBoards: stallCount + 1,
      outerLaneBoards: 2,
      transparentVisuals: transparentStartVisuals,
      visualOpacity: {
        floor: START_GATE_DESIGN.startFloorOpacity,
        rails: START_GATE_DESIGN.startRailOpacity,
        markings: START_GATE_DESIGN.startMarkingOpacity,
      },
      visualThemeKey: this.visualThemeKey,
      textureStyle: this.getWorldVisualThemeStyle().track.pattern,
      railTextureStyle: this.getWorldVisualThemeStyle().rail.pattern,
      gateStyle: this.getWorldVisualThemeStyle().gate,
    };
  }

  getStartPrepTrayCenter(frame, { flatBoard = false } = {}) {
    const back = START_RAMP.prepTrayBackOffset;
    const front = START_RAMP.prepTrayFrontOffset;
    const offset = -(back + front) / 2;
    const heightAtCenter = flatBoard ? 0 : ((back - front) / 2) * START_RAMP.prepTrayDropPerMeter;
    return new THREE.Vector3(frame.p.x, frame.p.y + 0.18 + heightAtCenter, frame.p.z)
      .add(frame.tangent.clone().multiplyScalar(offset));
  }

  getStartPrepLocalZForBack(backDistance) {
    const back = START_RAMP.prepTrayBackOffset;
    const front = START_RAMP.prepTrayFrontOffset;
    return ((back + front) / 2) - backDistance;
  }

  getStartPrepSurfaceY(frame, backDistance) {
    if (this.physicsMechanicKey === 'toyPark' || this.visualThemeKey === 'toyPark') return frame.p.y;
    return frame.p.y + backDistance * START_RAMP.prepTrayDropPerMeter;
  }

  getStartChuteFloorTopLocalY(localZ, radius = 0, clearance = 0) {
    const pitch = this.startCatcher?.slopePitch ?? 0;
    // START_CHUTE floor is a real tilted box at local Y -0.12 with thickness 0.20.
    // Its top plane in the chute's local coordinates is therefore the tilted centerline
    // plus the half-thickness projected vertically, then the marble radius/clearance.
    const floorCenterY = -0.12;
    const floorHalfThickness = 0.10;
    return floorCenterY - Math.sin(pitch) * localZ + Math.cos(pitch) * floorHalfThickness + radius + clearance;
  }

  getStartChuteBackDistanceForLocalZ(localZ) {
    const back = START_RAMP.prepTrayBackOffset;
    const front = START_RAMP.prepTrayFrontOffset;
    return ((back + front) / 2) - localZ;
  }

  addStartApron(frame, material) {
    // Removed intentionally: both the visible grey board and the later invisible physics bridge
    // could sit across the open gate path. The sloped START_CHUTE should hand marbles directly
    // to the real track surface; do not create any extra start apron mesh or Cannon body here.
    return null;
  }

  addCatcherBowl({ frame, name, forwardOffset, width, depth, wallHeight, mat, accentMat, labelColor }) {
    const center = new THREE.Vector3(frame.p.x, frame.p.y + 0.18, frame.p.z)
      .add(frame.tangent.clone().multiplyScalar(forwardOffset));
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = yaw;
    this.trackGroup.add(group);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, depth), accentMat);
    floor.position.set(0, -0.18, 0);
    floor.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(floor);
    this.addStaticBox(center.clone().add(this.localToWorldOffset(0, -0.18, 0, yaw)), new THREE.Vector3(width / 2, 0.09, depth / 2), yaw, this.trackMaterial);

    const wallSpecs = [
      { x: -width / 2 - 0.32, z: 0, sx: 0.64, sz: depth + 0.9 },
      { x: width / 2 + 0.32, z: 0, sx: 0.64, sz: depth + 0.9 },
      { x: 0, z: depth / 2 + 0.32, sx: width + 1.2, sz: 0.64 },
    ];
    wallSpecs.forEach((spec) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(spec.sx, wallHeight, spec.sz), mat);
      wall.position.set(spec.x, wallHeight / 2 - 0.18, spec.z);
      wall.castShadow = PERFORMANCE_TUNING.shadows;
      wall.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(wall);
      const pos = center.clone().add(this.localToWorldOffset(spec.x, wallHeight / 2 - 0.18, spec.z, yaw));
      this.addStaticBox(pos, new THREE.Vector3(spec.sx / 2, wallHeight / 2, spec.sz / 2), yaw, this.obstacleMaterial);
    });

    const label = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.72, 0.08, 0.55),
      new THREE.MeshStandardMaterial({ color: labelColor, roughness: 0.24, emissive: labelColor, emissiveIntensity: 0.22 })
    );
    label.position.set(0, 0.05, -depth * 0.18);
    group.add(label);
    return { center, yaw, width, depth, frame, name };
  }

  addStartingGate(frame, mat) {
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const gateLocalZ = this.getStartPrepLocalZForBack(START_GATE_DESIGN.gateBackDistance);
    const gateFloorLocalY = this.getStartChuteFloorTopLocalY(gateLocalZ, 0, 0);
    const gateBaseLocalY = gateFloorLocalY + START_GATE_DESIGN.gateClearanceFromFloor;
    const gateCenter = this.startCatcher.center.clone()
      .add(this.localToWorldOffset(0, gateBaseLocalY, gateLocalZ, yaw));
    const group = new THREE.Group();
    group.position.copy(gateCenter);
    group.rotation.y = yaw;
    this.trackGroup.add(group);

    const gateStyle = this.getWorldVisualThemeStyle().gate;
    const gateMat = makeStartTransparentMaterial(
      new THREE.MeshStandardMaterial({ color: hexColorToNumber(gateStyle.base, 0x0f172a), roughness: 0.38, metalness: 0.55 }),
      START_GATE_DESIGN.startGateOpacity
    );
    const barMat = makeStartTransparentMaterial(
      new THREE.MeshStandardMaterial({ color: hexColorToNumber(gateStyle.panel, 0x7cf7d4), roughness: 0.24, metalness: 0.28, emissive: hexColorToNumber(gateStyle.emissive, 0x00483d), emissiveIntensity: 0.42 }),
      START_GATE_DESIGN.startGateOpacity
    );
    const warningMat = makeStartTransparentMaterial(
      new THREE.MeshStandardMaterial({ color: hexColorToNumber(gateStyle.warning, 0xffd166), roughness: 0.3, metalness: 0.15, emissive: hexColorToNumber(gateStyle.signEmissive, 0x3d2500), emissiveIntensity: 0.28 }),
      START_GATE_DESIGN.startMarkingOpacity
    );
    const gateLayout = this.getStartGateLayout(this.ui.count?.value);
    const stallCount = this.startCatcher?.laneCount || gateLayout.stallCount;
    const gateWidth = this.startCatcher?.gateWidth || gateLayout.gateWidth;
    const stallWidth = gateWidth / stallCount;
    const gateMeshes = [];
    const bodies = [];

    const gantryWidth = gateWidth + 1.8;
    const header = new THREE.Mesh(new THREE.BoxGeometry(gantryWidth, 0.46, 0.46), gateMat);
    header.position.set(0, START_GATE_DESIGN.gatePostHeight + 0.28, 0);
    header.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(header);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(gantryWidth - 1.4, 8.5), 0.36, 0.08), warningMat);
    sign.position.set(0, START_GATE_DESIGN.gatePostHeight + 0.74, -0.28);
    group.add(sign);

    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, START_GATE_DESIGN.gatePostHeight, 0.42), gateMat);
      post.position.set(side * (gateWidth / 2 + 0.55), START_GATE_DESIGN.gatePostHeight / 2, -0.04);
      post.castShadow = PERFORMANCE_TUNING.shadows;
      post.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(post);
      this.addStaticBox(
        gateCenter.clone().add(this.localToWorldOffset(post.position.x, START_GATE_DESIGN.gatePostHeight / 2, post.position.z, yaw)),
        new THREE.Vector3(0.14, START_GATE_DESIGN.gatePostHeight / 2, 0.21),
        yaw,
        this.obstacleMaterial
      );
    });

    for (let i = 0; i <= stallCount; i += 1) {
      const x = -gateWidth / 2 + i * stallWidth;
      const divider = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.24), gateMat);
      divider.position.set(x, 0.64, -0.36);
      divider.castShadow = PERFORMANCE_TUNING.shadows;
      group.add(divider);
    }

    for (let i = 0; i < stallCount; i += 1) {
      const x = -gateWidth / 2 + stallWidth * (i + 0.5);
      const door = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.34, stallWidth - 0.10), START_GATE_DESIGN.gateHeight, START_GATE_DESIGN.gateThickness), barMat);
      door.position.set(x, START_GATE_DESIGN.gateHeight / 2, 0);
      door.castShadow = PERFORMANCE_TUNING.shadows;
      door.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(door);
      gateMeshes.push({ mesh: door, baseY: door.position.y, baseZ: door.position.z, side: i < stallCount / 2 ? -1 : 1 });
    }

    const blocker = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    blocker.addShape(new CANNON.Box(new CANNON.Vec3(gateWidth / 2 + 0.18, START_GATE_DESIGN.gateHeight / 2, START_GATE_DESIGN.gateThickness / 2)));
    blocker.position.copy(gateCenter.clone().add(this.localToWorldOffset(0, START_GATE_DESIGN.gateHeight / 2, 0, yaw)));
    blocker.quaternion.setFromEuler(0, yaw, 0);
    this.world.addBody(blocker);
    this.trackBodies.push(blocker);
    bodies.push(blocker);

    return {
      group,
      gateMeshes,
      bodies,
      opened: false,
      openProgress: 0,
      yaw,
      center: gateCenter,
      gateLocalZ,
      gateFloorLocalY,
      gateBaseLocalY,
      blocksAtChuteSurface: true,
      stallCount,
      gateWidth,
      trackWidth: this.trackWidth,
      stallWidth,
      widthRatio: gateWidth / this.trackWidth,
      reducedByWidth: stallCount < Math.min(START_GATE_DESIGN.maxGateCount ?? 12, Math.max(1, Math.floor(Number(this.ui.count?.value) || 12))),
      design: 'track-aligned-vertical-lift-stall-gate-removes-physics-blocker-on-open',
      launchImpulse: START_GATE_DESIGN.launchImpulse,
      visualThemeKey: this.visualThemeKey,
      textureStyle: this.getWorldVisualThemeStyle().track.pattern,
      railTextureStyle: this.getWorldVisualThemeStyle().rail.pattern,
      gateStyle,
    };
  }

  addSpinnerCollector({ frame, width, mat, accentMat }) {
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const radius = Math.max(5.5, width * 0.38);
    const center = new THREE.Vector3(frame.p.x, frame.p.y + 0.16, frame.p.z)
      .add(frame.tangent.clone().multiplyScalar(radius + 2.6));
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = yaw;
    this.trackGroup.add(group);

    const discMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.26, metalness: 0.18, emissive: 0x3c2600, emissiveIntensity: 0.22 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.28, 80), discMat);
    disc.position.y = -0.08;
    disc.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(disc);
    this.addStaticBox(center.clone().add(this.localToWorldOffset(0, -0.14, 0, yaw)), new THREE.Vector3(radius, 0.12, radius), yaw, this.trackMaterial);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.18, 0.18, 12, 96), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.32;
    ring.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(ring);

    const wallCount = 18;
    for (let i = 0; i < wallCount; i += 1) {
      const angle = (i / wallCount) * Math.PI * 2;
      const x = Math.cos(angle) * (radius + 0.35);
      const z = Math.sin(angle) * (radius + 0.35);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.25, 0.38), mat);
      wall.position.set(x, 0.62, z);
      wall.rotation.y = -angle;
      wall.castShadow = PERFORMANCE_TUNING.shadows;
      wall.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(wall);
      const pos = center.clone().add(this.localToWorldOffset(x, 0.62, z, yaw));
      this.addStaticBox(pos, new THREE.Vector3(0.72, 0.62, 0.19), yaw - angle, this.obstacleMaterial);
    }

    const armGroup = new THREE.Group();
    armGroup.position.y = 0.18;
    group.add(armGroup);
    for (let i = 0; i < 4; i += 1) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.62, 0.14, 0.28), accentMat);
      arm.rotation.y = (i * Math.PI) / 4;
      arm.position.y = 0.06;
      arm.castShadow = PERFORMANCE_TUNING.shadows;
      armGroup.add(arm);
    }

    const chute = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth * 0.64, 0.16, 4.2), accentMat);
    chute.position.set(0, 0.05, -radius - 1.8);
    chute.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(chute);

    return { center, yaw, radius, group, disc, armGroup, frame, name: 'SPINNER' };
  }

  addRankingCollector({ frame, width, racerCount, mat, accentMat, noPodium = false }) {
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const slotGap = 1.45;
    const lowerCount = noPodium ? racerCount : Math.max(0, racerCount - 3);
    const lowerCols = lowerCount > 0
      ? Math.max(4, Math.ceil(Math.sqrt(lowerCount * 1.28)))
      : 4;
    const lowerRows = Math.max(1, Math.ceil(Math.max(1, lowerCount) / lowerCols));
    const lowerSlotOriginZ = 2.35;
    const lowerSlotBackZ = lowerSlotOriginZ + Math.max(0, lowerRows - 1) * slotGap;
    const lowerSlotRightX = ((lowerCols - 1) / 2) * slotGap;
    const containerWidth = Math.max(width, lowerSlotRightX * 2 + 4.8, 12);
    const depth = Math.max(11.5, (Math.max(lowerSlotBackZ, 1.8) + 2.25) * 2);
    const center = new THREE.Vector3(frame.p.x, frame.p.y + 0.2, frame.p.z)
      .add(frame.tangent.clone().multiplyScalar(depth / 2 + 3.2));
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = yaw;
    this.trackGroup.add(group);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.54, metalness: 0.12 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(containerWidth, 0.2, depth), floorMat);
    floor.position.set(0, -0.12, 0);
    floor.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(floor);
    this.addStaticBox(center.clone().add(this.localToWorldOffset(0, -0.12, 0, yaw)), new THREE.Vector3(containerWidth / 2, 0.1, depth / 2), yaw, this.trackMaterial);

    const wallHeight = 1.35;
    const wallSpecs = [
      { x: -containerWidth / 2 - 0.28, z: 0, sx: 0.56, sz: depth + 0.9 },
      { x: containerWidth / 2 + 0.28, z: 0, sx: 0.56, sz: depth + 0.9 },
      { x: 0, z: depth / 2 + 0.28, sx: containerWidth + 1.1, sz: 0.56 },
    ];
    wallSpecs.forEach((spec) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(spec.sx, wallHeight, spec.sz), mat);
      wall.position.set(spec.x, wallHeight / 2 - 0.05, spec.z);
      wall.castShadow = PERFORMANCE_TUNING.shadows;
      wall.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(wall);
      const pos = center.clone().add(this.localToWorldOffset(spec.x, wallHeight / 2 - 0.05, spec.z, yaw));
      this.addStaticBox(pos, new THREE.Vector3(spec.sx / 2, wallHeight / 2, spec.sz / 2), yaw, this.obstacleMaterial);
    });

    const chute = new THREE.Mesh(new THREE.BoxGeometry(Math.min(this.trackWidth * 0.72, containerWidth - 2.5), 0.16, 4.2), accentMat);
    chute.position.set(0, 0.02, -depth / 2 - 1.65);
    chute.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(chute);

    const podiumColors = [0xffd700, 0xc0c0c0, 0xcd7f32];
    const podiumSpecs = noPodium ? [] : [
      { rank: 1, x: 0, z: -0.6, height: 1.28, color: podiumColors[0], label: '1' },
      { rank: 2, x: -1.65, z: 0.05, height: 0.88, color: podiumColors[1], label: '2' },
      { rank: 3, x: 1.65, z: 0.35, height: 0.64, color: podiumColors[2], label: '3' },
    ];
    podiumSpecs.forEach((spec) => {
      const blockMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.25, metalness: 0.38, emissive: spec.color, emissiveIntensity: 0.12 });
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.32, spec.height, 1.32), blockMat);
      block.name = `FINISH_PODIUM_BLOCK_${spec.rank}`;
      block.userData = { type: 'finish-podium-block', rank: spec.rank };
      block.position.set(spec.x, spec.height / 2 - 0.02, spec.z);
      block.castShadow = PERFORMANCE_TUNING.shadows;
      block.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(block);
      const label = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.42), accentMat);
      label.name = `FINISH_PODIUM_LABEL_${spec.rank}`;
      label.userData = { type: 'finish-podium-label', rank: spec.rank };
      label.position.set(spec.x, spec.height + 0.05, spec.z - 0.36);
      group.add(label);
    });

    const lowerSlotMat = new THREE.MeshStandardMaterial({ color: noPodium ? 0x273449 : 0x334155, roughness: 0.45, metalness: 0.08 });
    for (let i = noPodium ? 0 : 3; i < racerCount; i += 1) {
      const lowerIndex = noPodium ? i : i - 3;
      const row = Math.floor(lowerIndex / lowerCols);
      const col = lowerIndex % lowerCols;
      const x = (col - (lowerCols - 1) / 2) * slotGap;
      const z = lowerSlotOriginZ + row * slotGap;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 1.0), lowerSlotMat);
      plate.position.set(x, 0.04, z);
      plate.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(plate);
    }

    const title = new THREE.Mesh(new THREE.BoxGeometry(Math.min(containerWidth * 0.72, 10), 0.1, 0.52), accentMat);
    title.position.set(0, 0.18, depth / 2 - 0.8);
    group.add(title);

    return {
      center,
      yaw,
      width: containerWidth,
      depth,
      cols: lowerCols,
      rows: lowerRows,
      slotGap,
      group,
      frame,
      name: noPodium ? 'FLAT_FINISH_COLLECTOR' : 'PODIUM_COLLECTOR',
      podiumStyle: noPodium ? 'flat-no-podium-all-finishers-grid' : 'top-3-on-podium-rest-below',
      noPodium,
      podiumRemoved: noPodium,
      podiumSlots: podiumSpecs,
      lowerSlots: {
        cols: lowerCols,
        rows: lowerRows,
        count: lowerCount,
        originZ: lowerSlotOriginZ,
        maxX: lowerSlotRightX,
        maxZ: lowerSlotBackZ,
      },
    };
  }


  updateStartGateAnimation(delta) {
    if (!this.startGate || !this.startGate.opened) return;
    this.startGate.openProgress = Math.min(1, this.startGate.openProgress + delta * 2.8);
    const t = 1 - Math.pow(1 - this.startGate.openProgress, 3);
    this.startGate.gateMeshes.forEach(({ mesh, baseY, baseZ = 0, side }) => {
      mesh.position.y = baseY + t * 2.55;
      mesh.position.z = baseZ - t * 0.38;
      mesh.rotation.x = -t * 0.18;
      mesh.rotation.z = side * t * 0.18;
    });
  }

  updateFinishSpinner(delta) {
    if (!this.finishSpinner?.disc || !this.finishSpinner?.armGroup) return;
    const speed = this.state === 'running' ? 1.8 : 0.55;
    this.finishSpinner.disc.rotation.y += delta * speed;
    this.finishSpinner.armGroup.rotation.y -= delta * speed * 1.35;
  }

  localToWorldOffset(x, y, z, yaw) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return new THREE.Vector3(x * cos + z * sin, y, -x * sin + z * cos);
  }

  localToWorldOffsetOnSlope(x, y, z, yaw, pitch = 0) {
    return new THREE.Vector3(x, y, z).applyEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
  }

  applyTrackSlopeRotation(object, yaw, pitch = 0) {
    object.rotation.set(-pitch, yaw, 0, 'YXZ');
    object.userData.trackSlopePitch = pitch;
    object.userData.trackYaw = yaw;
  }

  getTrackSlopeQuaternion(yaw, pitch = 0, localYaw = 0) {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
    if (localYaw) {
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), localYaw));
    }
    return quaternion;
  }

  applyTrackSlopeTwistRotation(object, yaw, pitch = 0, localYaw = 0) {
    object.quaternion.copy(this.getTrackSlopeQuaternion(yaw, pitch, localYaw));
    object.userData.trackSlopePitch = pitch;
    object.userData.trackYaw = yaw;
    object.userData.localYaw = localYaw;
  }

  setSlopeBodyTransform(body, center, yaw, pitch = 0, localYaw = 0) {
    body.position.copy(center);
    const quaternion = this.getTrackSlopeQuaternion(yaw, pitch, localYaw);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    body.userData = { ...(body.userData || {}), trackSlopePitch: pitch, trackYaw: yaw, localYaw };
  }

  getTrackSlopeRollQuaternion(yaw, pitch = 0, localRoll = 0) {
    const quaternion = this.getTrackSlopeQuaternion(yaw, pitch, 0);
    if (localRoll) {
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), localRoll));
    }
    return quaternion;
  }

  setSlopeRollBodyTransform(body, center, yaw, pitch = 0, localRoll = 0) {
    body.position.copy(center);
    const quaternion = this.getTrackSlopeRollQuaternion(yaw, pitch, localRoll);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    body.userData = { ...(body.userData || {}), trackSlopePitch: pitch, trackYaw: yaw, localRoll };
  }

  getTrackSlopePitchQuaternion(yaw, pitch = 0, localPitch = 0) {
    const quaternion = this.getTrackSlopeQuaternion(yaw, pitch, 0);
    if (localPitch) {
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), localPitch));
    }
    return quaternion;
  }

  setSlopePitchBodyTransform(body, center, yaw, pitch = 0, localPitch = 0) {
    body.position.copy(center);
    const quaternion = this.getTrackSlopePitchQuaternion(yaw, pitch, localPitch);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    body.userData = { ...(body.userData || {}), trackSlopePitch: pitch, trackYaw: yaw, localPitch };
  }

  addStaticBox(position, halfExtents, yaw, material) {
    const body = new CANNON.Body({ mass: 0, material });
    body.addShape(new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z)));
    body.position.copy(position);
    body.quaternion.setFromEuler(0, yaw, 0);
    body.userData = {
      ...(body.userData || {}),
      debugHalfExtents: { x: halfExtents.x, y: halfExtents.y, z: halfExtents.z },
      debugShape: 'box',
    };
    this.world.addBody(body);
    this.trackBodies.push(body);
    return body;
  }

  clearPhysicsHitboxes() {
    if (!this.physicsHitboxGroup) return;
    this.physicsHitboxGroup.children.slice().forEach((child) => {
      this.physicsHitboxGroup.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    this.physicsHitboxSummary = { total: 0 };
  }

  getPhysicsHitboxMaterial(body, shapeIndex = 0) {
    const data = body?.userData || {};
    const color = data.startSideRailBody || data.startLaneBoard
      ? 0xff4fd8
      : data.trackDeck || data.trackSlopePitch !== undefined
        ? 0x48e5ff
        : data.name?.toLowerCase?.().includes('rail')
          ? 0xffcc33
          : 0x8dff65;
    const key = `${color}-${shapeIndex}`;
    this.physicsHitboxMaterials ||= new Map();
    if (!this.physicsHitboxMaterials.has(key)) {
      this.physicsHitboxMaterials.set(key, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        wireframe: true,
        depthTest: false,
      }));
    }
    return this.physicsHitboxMaterials.get(key);
  }

  createPhysicsHitboxMeshForShape(body, shape, shapeIndex = 0) {
    if (!body || !shape) return null;
    let geometry = null;
    if (shape instanceof CANNON.Box) {
      const he = shape.halfExtents;
      geometry = new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2);
    } else if (shape.radiusTop !== undefined && shape.radiusBottom !== undefined && shape.height !== undefined) {
      geometry = new THREE.CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, 16);
    } else if (shape.radius !== undefined) {
      geometry = new THREE.SphereGeometry(shape.radius, 16, 12);
    }
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, this.getPhysicsHitboxMaterial(body, shapeIndex));
    const offset = body.shapeOffsets?.[shapeIndex] || new CANNON.Vec3(0, 0, 0);
    const orientation = body.shapeOrientations?.[shapeIndex] || new CANNON.Quaternion(0, 0, 0, 1);
    const bodyQuat = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    const localOffset = new THREE.Vector3(offset.x, offset.y, offset.z).applyQuaternion(bodyQuat);
    mesh.position.set(body.position.x + localOffset.x, body.position.y + localOffset.y, body.position.z + localOffset.z);
    const shapeQuat = new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
    mesh.quaternion.copy(bodyQuat).multiply(shapeQuat);
    mesh.renderOrder = 999;
    mesh.userData = {
      type: 'physics-hitbox-debug-mesh',
      bodyName: body.userData?.name || null,
      bodyUserData: body.userData || {},
      shapeIndex,
    };
    return mesh;
  }

  rebuildPhysicsHitboxes() {
    if (!this.physicsHitboxGroup) return;
    this.clearPhysicsHitboxes();
    const bodies = [...(this.trackBodies || []), ...(this.obstacleBodies || [])];
    let added = 0;
    bodies.forEach((body) => {
      (body.shapes || []).forEach((shape, shapeIndex) => {
        const mesh = this.createPhysicsHitboxMeshForShape(body, shape, shapeIndex);
        if (!mesh) return;
        this.physicsHitboxGroup.add(mesh);
        added += 1;
      });
    });
    this.physicsHitboxGroup.visible = Boolean(this.showPhysicsHitboxes);
    this.physicsHitboxSummary = {
      total: added,
      bodies: bodies.length,
      trackBodies: this.trackBodies?.length || 0,
      obstacleBodies: this.obstacleBodies?.length || 0,
      visible: Boolean(this.showPhysicsHitboxes),
    };
    window.__MARBLE_RACE_PHYSICS_HITBOX_SUMMARY__ = this.physicsHitboxSummary;
    return this.physicsHitboxSummary;
  }

  togglePhysicsHitboxes(force = null) {
    this.showPhysicsHitboxes = force === null ? !this.showPhysicsHitboxes : Boolean(force);
    if (!this.physicsHitboxGroup || !this.physicsHitboxGroup.children.length) this.rebuildPhysicsHitboxes();
    if (this.physicsHitboxGroup) this.physicsHitboxGroup.visible = this.showPhysicsHitboxes;
    this.physicsHitboxSummary = { ...(this.physicsHitboxSummary || {}), visible: this.showPhysicsHitboxes };
    window.__MARBLE_RACE_PHYSICS_HITBOXES__ = this.showPhysicsHitboxes;
    window.__MARBLE_RACE_PHYSICS_HITBOX_SUMMARY__ = this.physicsHitboxSummary;
    console.info(`[MarbleRace] Physics hitboxes ${this.showPhysicsHitboxes ? 'shown' : 'hidden'}`, this.physicsHitboxSummary);
    return this.showPhysicsHitboxes;
  }

  getTrackPointAt(distance) {
    const d = clamp(distance, 0, this.trackLength);
    for (let i = 0; i < this.pathPoints.length - 1; i += 1) {
      const a = this.pathPoints[i];
      const b = this.pathPoints[i + 1];
      if (d >= a.d && d <= b.d) {
        const t = (d - a.d) / Math.max(0.0001, b.d - a.d);
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), d, w: lerp(a.w ?? this.trackWidth, b.w ?? this.trackWidth, t) };
      }
    }
    return this.pathPoints[this.pathPoints.length - 1];
  }

  getTrackWidthAt(distance) {
    const d = clamp(distance, 0, this.trackLength);
    for (let i = 0; i < this.pathPoints.length - 1; i += 1) {
      const a = this.pathPoints[i];
      const b = this.pathPoints[i + 1];
      if (d >= a.d && d <= b.d) {
        const t = (d - a.d) / Math.max(0.0001, b.d - a.d);
        return lerp(a.w ?? this.trackWidth, b.w ?? this.trackWidth, t);
      }
    }
    return this.pathPoints[this.pathPoints.length - 1]?.w ?? this.trackWidth;
  }

  getTrackFrameAt(distance) {
    const p = this.getTrackPointAt(distance);
    const sampleRadius = Math.min(3, Math.max(0.35, this.trackLength / 180));
    const aheadDistance = clamp(distance + sampleRadius, 0, this.trackLength);
    const backDistance = clamp(distance - sampleRadius, 0, this.trackLength);
    let ahead = this.getTrackPointAt(aheadDistance);
    let back = this.getTrackPointAt(backDistance);
    if (aheadDistance === backDistance) {
      ahead = this.getTrackPointAt(this.trackLength);
      back = this.getTrackPointAt(Math.max(0, this.trackLength - sampleRadius));
    }
    const tangent = new THREE.Vector3(ahead.x - back.x, ahead.y - back.y, ahead.z - back.z).normalize();
    const horizontalTangent = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    const right = new THREE.Vector3(-horizontalTangent.z, 0, horizontalTangent.x).normalize();
    const downhillAcceleration = Math.max(0, -tangent.y) * Math.abs(this.world?.gravity?.y ?? 16) * (this.slopeDrive?.forwardGravityScale ?? 1);
    return { p, tangent, horizontalTangent, right, downhillAcceleration, slopeY: tangent.y };
  }

  getTrackSlopeFrameAcrossSpan(distance, spanMeters = 0) {
    const halfSpan = Math.max(0.25, Number(spanMeters) / 2 || 0.25);
    const backDistance = clamp(distance - halfSpan, 0, this.trackLength);
    const aheadDistance = clamp(distance + halfSpan, 0, this.trackLength);
    const center = this.getTrackFrameAt(distance);
    if (aheadDistance === backDistance) return center;
    const back = this.getTrackPointAt(backDistance);
    const ahead = this.getTrackPointAt(aheadDistance);
    const tangent = new THREE.Vector3(ahead.x - back.x, ahead.y - back.y, ahead.z - back.z).normalize();
    if (tangent.lengthSq() < 0.0001) return center;
    const horizontalTangent = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    if (horizontalTangent.lengthSq() < 0.0001) return center;
    const right = new THREE.Vector3(-horizontalTangent.z, 0, horizontalTangent.x).normalize();
    return {
      ...center,
      tangent,
      horizontalTangent,
      right,
      slopeY: tangent.y,
      spanStartDistance: backDistance,
      spanEndDistance: aheadDistance,
      spanMeters: aheadDistance - backDistance,
    };
  }

  getFinishApproachFrame(data, fallbackFrame) {
    const finishPoint = this.getTrackPointAt(this.trackLength);
    const fromMarble = new THREE.Vector3(
      finishPoint.x - data.body.position.x,
      finishPoint.y - data.body.position.y,
      finishPoint.z - data.body.position.z
    );
    const horizontal = new THREE.Vector3(fromMarble.x, 0, fromMarble.z);
    if (horizontal.lengthSq() < 0.0001) return fallbackFrame;
    horizontal.normalize();
    const verticalDelta = clamp(fromMarble.y / Math.max(fromMarble.length(), 0.001), -0.32, 0.08);
    const tangent = new THREE.Vector3(horizontal.x, verticalDelta, horizontal.z).normalize();
    const right = new THREE.Vector3(-horizontal.z, 0, horizontal.x).normalize();
    return {
      ...fallbackFrame,
      tangent,
      horizontalTangent: horizontal,
      right,
      p: finishPoint,
      slopeY: tangent.y,
      directFinishVector: true,
    };
  }

  findClosestProgress(position, options = {}) {
    const minDistance = Number.isFinite(options.minDistance) ? Math.max(0, options.minDistance) : -Infinity;
    const maxDistance = Number.isFinite(options.maxDistance) ? Math.min(this.trackLength || Infinity, options.maxDistance) : Infinity;
    const fallbackDistance = Number.isFinite(options.fallbackDistance) ? clamp(options.fallbackDistance, 0, this.trackLength || Infinity) : null;
    let best = null;
    let bestDist = Infinity;
    for (const sample of this.trackSamples) {
      if (sample.d < minDistance || sample.d > maxDistance) continue;
      const dx = position.x - sample.x;
      const dz = position.z - sample.z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) { bestDist = dist; best = sample; }
    }
    if (!best) {
      best = fallbackDistance != null ? this.getTrackFrameAt(fallbackDistance) : this.trackSamples[0];
      const dx = position.x - best.x;
      const dz = position.z - best.z;
      bestDist = dx * dx + dz * dz;
    }
    return { distance: best.d ?? best.distance ?? 0, point: best, lateralSq: bestDist };
  }

  findClosestProgressNearCurrent(position, data = {}, options = {}) {
    const currentDistance = clamp(
      Number.isFinite(data.driveDistance) ? data.driveDistance : (Number.isFinite(data.distance) ? data.distance : 0),
      0,
      this.trackLength || 0
    );
    const behind = options.behind ?? this.guidePointPolicy?.overlapProjectionWindowBehind ?? 2.4;
    const ahead = options.ahead ?? this.guidePointPolicy?.overlapProjectionWindowAhead ?? 7.5;
    const projected = this.findClosestProgress(position, {
      minDistance: currentDistance - behind,
      maxDistance: currentDistance + ahead,
      fallbackDistance: currentDistance,
    });
    const raw = this.findClosestProgress(position);
    const jump = Math.abs((raw.distance ?? 0) - (projected.distance ?? 0));
    const maxJump = options.maxJump ?? this.guidePointPolicy?.maxNearestProgressJump ?? 8;
    const usedWindowedProjection = this.physicsMechanicKey === 'toyPark' && jump > maxJump;
    return {
      ...(usedWindowedProjection ? projected : raw),
      rawDistance: raw.distance,
      windowedDistance: projected.distance,
      projectionWindow: { min: Math.max(0, currentDistance - behind), max: Math.min(this.trackLength || 0, currentDistance + ahead) },
      overlapSafeProjection: usedWindowedProjection,
      projectionJump: jump,
    };
  }

  applyRailMomentumAssist(data, closest, frame, velocity, forwardSpeed) {
    if (!this.railMomentumAssist?.enabled || data.finished) return;
    const localWidth = this.getTrackWidthAt(closest.distance);
    const lateral = velocity.dot(frame.right);
    const lateralOffset = new THREE.Vector3(data.body.position.x - frame.p.x, 0, data.body.position.z - frame.p.z).dot(frame.right);
    const railThreshold = Math.max(0.4, localWidth / 2 - this.railMomentumAssist.railZone);
    const nearRail = Math.abs(lateralOffset) >= railThreshold;
    const lostForwardInertia = forwardSpeed < this.railMomentumAssist.minForwardSpeed && Math.abs(lateral) > forwardSpeed * 1.35;
    if (!nearRail && !lostForwardInertia) return;

    const cooldown = 0.18;
    if (this.elapsed - (data.lastRailMomentumAssistTime ?? -Infinity) < cooldown) return;
    data.lastRailMomentumAssistTime = this.elapsed;
    data.railMomentumAssistCount = (data.railMomentumAssistCount || 0) + 1;

    const impulse = frame.tangent.clone().multiplyScalar(this.railMomentumAssist.impulse);
    data.body.applyImpulse(new CANNON.Vec3(impulse.x, Math.min(0, impulse.y), impulse.z), data.body.position);
    const dampedLateral = lateral * this.railMomentumAssist.lateralDamping;
    const lateralDelta = dampedLateral - lateral;
    data.body.velocity.x += frame.right.x * lateralDelta;
    data.body.velocity.z += frame.right.z * lateralDelta;
  }

  applyRailEscapeAssist(data, closest, frame, velocity, forwardSpeed, maxSpeed) {
    const assist = this.railEscapeAssist;
    if (!assist?.enabled || data.finished) return;
    const localWidth = this.getTrackWidthAt(closest.distance);
    const lateralOffset = new THREE.Vector3(data.body.position.x - frame.p.x, 0, data.body.position.z - frame.p.z).dot(frame.right);
    const railThreshold = Math.max(0.55, localWidth / 2 - assist.railZone);
    const absOffset = Math.abs(lateralOffset);
    if (absOffset < railThreshold) return;

    const outwardSign = Math.sign(lateralOffset) || 1;
    const lateralSpeed = velocity.dot(frame.right);
    const outwardSpeed = lateralSpeed * outwardSign;
    const inward = frame.right.clone().multiplyScalar(-outwardSign);
    const railPressure = clamp((absOffset - railThreshold) / Math.max(assist.railZone, 0.001), 0, 1);

    if (outwardSpeed > assist.maxOutwardSpeed) {
      const dampedOutward = assist.maxOutwardSpeed + (outwardSpeed - assist.maxOutwardSpeed) * assist.lateralDamping;
      const lateralDelta = (dampedOutward - outwardSpeed) * outwardSign;
      data.body.velocity.x += frame.right.x * lateralDelta;
      data.body.velocity.z += frame.right.z * lateralDelta;
    } else if (outwardSpeed > 0) {
      const lateralDelta = outwardSpeed * (assist.lateralDamping - 1) * outwardSign;
      data.body.velocity.x += frame.right.x * lateralDelta;
      data.body.velocity.z += frame.right.z * lateralDelta;
    }

    const forceStrength = this.speedPreset.accel * assist.inwardForceScale * (0.45 + railPressure * 0.75);
    const inwardForce = inward.multiplyScalar(forceStrength);
    const tangentForce = frame.tangent.clone().multiplyScalar(this.speedPreset.accel * assist.tangentAssistRatio * (forwardSpeed < maxSpeed * 0.72 ? 1 : 0.45));
    const combined = inwardForce.add(tangentForce);
    data.body.applyForce(new CANNON.Vec3(combined.x, Math.min(0, combined.y), combined.z), data.body.position);
    data.railEscapeAssistCount = (data.railEscapeAssistCount || 0) + 1;
    this.railEscapeAssistCount = (this.railEscapeAssistCount || 0) + 1;
  }

  applyFinishDirectionCorrection(data, frame, velocity, rawForwardSpeed, maxSpeed) {
    if (!this.finishDirectionAssist?.enabled || data.finished) return;

    let corrected = false;
    if (rawForwardSpeed < 0) {
      const backwardDelta = rawForwardSpeed * (this.finishDirectionAssist.backwardDamping - 1);
      data.body.velocity.x += frame.tangent.x * backwardDelta;
      data.body.velocity.y += frame.tangent.y * backwardDelta;
      data.body.velocity.z += frame.tangent.z * backwardDelta;
      corrected = true;
    }

    const lateralSpeed = velocity.dot(frame.right);
    if (Math.abs(lateralSpeed) > Math.max(1.1, maxSpeed * 0.1)) {
      const lateralDelta = lateralSpeed * (this.finishDirectionAssist.lateralDamping - 1);
      data.body.velocity.x += frame.right.x * lateralDelta;
      data.body.velocity.z += frame.right.z * lateralDelta;
      corrected = true;
    }

    if (corrected) {
      const recoveryForce = this.speedPreset.accel * this.finishDirectionAssist.correctionForceScale;
      const force = frame.tangent.clone().multiplyScalar(recoveryForce);
      data.body.applyForce(new CANNON.Vec3(force.x, Math.min(0, force.y), force.z), data.body.position);
      data.finishDirectionCorrectionCount = (data.finishDirectionCorrectionCount || 0) + 1;
      this.finishDirectionCorrectionCount += 1;
    }
  }

  applyFinishDirectedImpulse(data, rawImpulse, frame, upImpulse = 0) {
    if (!this.finishDirectionAssist?.enabled) {
      data.body.applyImpulse(new CANNON.Vec3(rawImpulse.x, upImpulse, rawImpulse.z), data.body.position);
      return;
    }

    const forward = rawImpulse.dot(frame.tangent);
    const lateral = rawImpulse.dot(frame.right);
    const biasedForward = Math.max(Math.abs(forward) * this.finishDirectionAssist.impulseForwardBias, forward);
    const dampedLateral = lateral * this.finishDirectionAssist.lateralDamping;
    const guarded = frame.tangent.clone().multiplyScalar(biasedForward)
      .add(frame.right.clone().multiplyScalar(dampedLateral));
    const length = guarded.length();
    if (length > this.finishDirectionAssist.maxImpulse) guarded.multiplyScalar(this.finishDirectionAssist.maxImpulse / length);

    data.body.applyImpulse(new CANNON.Vec3(guarded.x, upImpulse, guarded.z), data.body.position);
  }

  createObstacles(count) {
    // 彈珠台換皮膚：高亮壓克力、電鍍金屬、霓虹橡膠，讓障礙物一眼像 pinball table 玩具件。
    const palette = {
      popBumper: new THREE.MeshPhysicalMaterial({ color: 0xff3f9e, roughness: 0.18, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x700035, emissiveIntensity: 0.5 }),
      pinBumper: new THREE.MeshPhysicalMaterial({ color: 0x35f6ff, roughness: 0.16, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.06, emissive: 0x007b8a, emissiveIntensity: 0.58 }),
      pinBumperTip: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.11, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x58f7ff, emissiveIntensity: 0.32 }),
      gongBumper: new THREE.MeshPhysicalMaterial({ color: 0xf8d26a, roughness: 0.18, metalness: 0.88, clearcoat: 0.92, clearcoatRoughness: 0.08, emissive: 0x5f3500, emissiveIntensity: 0.42 }),
      gongBumperFace: new THREE.MeshPhysicalMaterial({ color: 0xffe08a, roughness: 0.2, metalness: 0.92, clearcoat: 0.95, clearcoatRoughness: 0.06, emissive: 0x7a4300, emissiveIntensity: 0.36 }),
      popBumperCap: new THREE.MeshPhysicalMaterial({ color: 0xfff1fa, roughness: 0.12, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0xff5fb7, emissiveIntensity: 0.18 }),
      slingshot: new THREE.MeshPhysicalMaterial({ color: 0x12f0c8, roughness: 0.16, metalness: 0.06, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0x00685d, emissiveIntensity: 0.46 }),
      spinnerGate: new THREE.MeshPhysicalMaterial({ color: 0x8d7dff, roughness: 0.15, metalness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06, emissive: 0x280090, emissiveIntensity: 0.38 }),
      pendulumHammer: new THREE.MeshPhysicalMaterial({ color: 0xffb347, roughness: 0.2, metalness: 0.72, clearcoat: 0.92, clearcoatRoughness: 0.06, emissive: 0x5c2600, emissiveIntensity: 0.34 }),
      movingGate: new THREE.MeshPhysicalMaterial({ color: 0x46f6ff, roughness: 0.13, metalness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x005f75, emissiveIntensity: 0.48 }),
      tiltBridge: new THREE.MeshPhysicalMaterial({ color: 0xff7ad9, roughness: 0.18, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x83115f, emissiveIntensity: 0.46 }),
      orbitRing: new THREE.MeshPhysicalMaterial({ color: 0x5bffdf, roughness: 0.13, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x008d8f, emissiveIntensity: 0.52 }),
      dropTarget: new THREE.MeshPhysicalMaterial({ color: 0xff8f3f, roughness: 0.17, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x5a1900, emissiveIntensity: 0.36 }),
      rubber: new THREE.MeshPhysicalMaterial({ color: 0x101422, roughness: 0.32, metalness: 0.02, clearcoat: 0.45, clearcoatRoughness: 0.18, emissive: 0x061020, emissiveIntensity: 0.26 }),
      chrome: new THREE.MeshPhysicalMaterial({ color: 0xe6f2ff, roughness: 0.12, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.04 }),
      yellowInsert: new THREE.MeshPhysicalMaterial({ color: 0xffd166, roughness: 0.18, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0x7a4a00, emissiveIntensity: 0.42 }),
      redInsert: new THREE.MeshPhysicalMaterial({ color: 0xff3864, roughness: 0.18, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0x79001c, emissiveIntensity: 0.44 }),
    };

    const enabledTypes = [...(this.enabledObstacleTypes || new Set())]
      .filter((type) => PINBALL_OBSTACLE_TYPES.includes(type));
    if (!enabledTypes.length) return;

    const mode = OBSTACLE_DISTRIBUTION_MODES[this.obstacleDistributionMode] ? this.obstacleDistributionMode : 'random';
    const placements = this.buildObstaclePlacements(count, enabledTypes, mode);
    const zones = mode === 'zoned' ? this.buildObstacleDistributionZones(enabledTypes) : [];
    this.obstacleDistributionSummary = {
      mode,
      label: OBSTACLE_DISTRIBUTION_MODES[mode]?.label || OBSTACLE_DISTRIBUTION_MODES.random.label,
      obstacleCount: placements.length,
      enabledTypes,
      placementSpacing: this.getObstaclePlacementSpacingSummary(placements),
      zones: zones.map((zone) => ({
        index: zone.index,
        type: zone.type,
        category: PINBALL_OBSTACLE_TYPE_METADATA[zone.type]?.category || 'normal',
        categoryLabel: OBSTACLE_CATEGORIES[PINBALL_OBSTACLE_TYPE_METADATA[zone.type]?.category || 'normal']?.label || '普通障礙物',
        start: Number(zone.start.toFixed(2)),
        end: Number(zone.end.toFixed(2)),
      })),
    };

    placements.forEach((placement) => {
      const d = placement.distance;
      const frame = this.getTrackFrameAt(d);
      const localWidth = this.getTrackWidthAt(d);
      const lane = (this.rng() - 0.5) * Math.max(2.8, localWidth - 3.8);
      const type = placement.type;
      const obstacle = this.createPinballObstacle(type, frame, lane, localWidth, palette, placement);
      const category = PINBALL_OBSTACLE_TYPE_METADATA[type]?.category || 'normal';
      if (obstacle) {
        obstacle.placementDistance = d;
        obstacle.placementMinSpacing = placement.minSpacing ?? null;
        obstacle.category = category;
        obstacle.categoryLabel = OBSTACLE_CATEGORIES[category]?.label || '普通障礙物';
        obstacle.distributionMode = mode;
        obstacle.distributionZoneIndex = placement.zoneIndex ?? null;
        obstacle.distributionZoneStart = placement.zoneStart ?? null;
        obstacle.distributionZoneEnd = placement.zoneEnd ?? null;
      }
      this.obstacleTypeCounts[type] = (this.obstacleTypeCounts[type] || 0) + 1;
      this.obstacleCategoryCounts[category] = (this.obstacleCategoryCounts[category] || 0) + 1;
    });
  }

  getObstaclePlacementSpacingSummary(placements) {
    const distances = placements
      .map((placement) => Number(placement.distance))
      .filter((distance) => Number.isFinite(distance))
      .sort((a, b) => a - b);
    const sortedPlacements = placements
      .filter((placement) => Number.isFinite(Number(placement.distance)))
      .slice()
      .sort((a, b) => a.distance - b.distance);
    const gaps = distances.slice(1).map((distance, index) => distance - distances[index]);
    const minObservedGap = gaps.length ? Math.min(...gaps) : null;
    const pairGaps = sortedPlacements.slice(1).map((placement, index) => ({
      gap: placement.distance - sortedPlacements[index].distance,
      requiredGap: this.getObstaclePairSpacing(sortedPlacements[index].type, placement.type),
    }));
    const minObservedPairClearance = pairGaps.length
      ? Math.min(...pairGaps.map((pair) => pair.gap - pair.requiredGap))
      : null;
    const zoneGaps = new Map();
    placements.forEach((placement) => {
      if (placement.zoneIndex == null || !Number.isFinite(placement.distance)) return;
      const list = zoneGaps.get(placement.zoneIndex) || [];
      list.push(placement.distance);
      zoneGaps.set(placement.zoneIndex, list);
    });
    const minObservedZoneGap = [...zoneGaps.values()].reduce((best, zoneDistances) => {
      zoneDistances.sort((a, b) => a - b);
      const zoneMin = zoneDistances.slice(1).reduce((gap, distance, index) => Math.min(gap, distance - zoneDistances[index]), Infinity);
      return Number.isFinite(zoneMin) ? Math.min(best, zoneMin) : best;
    }, Infinity);
    return {
      configuredMinSpacing: OBSTACLE_PLACEMENT.minSpacingMeters,
      minSpacingFloor: OBSTACLE_PLACEMENT.minSpacingFloorMeters,
      pairClearance: OBSTACLE_PLACEMENT.pairClearanceMeters,
      startPadding: OBSTACLE_PLACEMENT.startPaddingMeters,
      finishPadding: OBSTACLE_PLACEMENT.finishPaddingMeters,
      minObservedGap: minObservedGap == null ? null : Number(minObservedGap.toFixed(2)),
      minObservedPairClearance: minObservedPairClearance == null || !Number.isFinite(minObservedPairClearance) ? null : Number(minObservedPairClearance.toFixed(2)),
      minObservedZoneGap: Number.isFinite(minObservedZoneGap) ? Number(minObservedZoneGap.toFixed(2)) : null,
      sampleDistances: distances.slice(0, 20).map((distance) => Number(distance.toFixed(2))),
      label: OBSTACLE_PLACEMENT.label,
    };
  }

  getObstacleTypePlacementConfig(type) {
    return OBSTACLE_TYPE_PLACEMENT[type] || { footprintMeters: OBSTACLE_PLACEMENT.minSpacingFloorMeters, spawnWeight: 1 };
  }

  getObstaclePairSpacing(typeA, typeB) {
    const footprintA = Number(this.getObstacleTypePlacementConfig(typeA).footprintMeters) || OBSTACLE_PLACEMENT.minSpacingFloorMeters;
    const footprintB = Number(this.getObstacleTypePlacementConfig(typeB).footprintMeters) || OBSTACLE_PLACEMENT.minSpacingFloorMeters;
    const visualGap = (footprintA + footprintB) / 2 + (Number(OBSTACLE_PLACEMENT.pairClearanceMeters) || 0);
    return Math.max(Number(OBSTACLE_PLACEMENT.minSpacingFloorMeters) || 0, visualGap);
  }

  pickWeightedObstacleType(enabledTypes) {
    const types = enabledTypes.filter((type) => PINBALL_OBSTACLE_TYPES.includes(type));
    if (!types.length) return null;
    const categoryAvailable = new Map();
    types.forEach((type) => {
      const category = PINBALL_OBSTACLE_TYPE_METADATA[type]?.category || 'normal';
      categoryAvailable.set(category, (categoryAvailable.get(category) || 0) + 1);
    });
    const weightedTypes = types.map((type) => {
      const category = PINBALL_OBSTACLE_TYPE_METADATA[type]?.category || 'normal';
      const categoryWeight = Number(OBSTACLE_CATEGORY_TARGET_WEIGHTS[category]) || 1;
      const categoryShare = categoryWeight / Math.max(1, categoryAvailable.get(category) || 1);
      const typeWeight = Number(this.getObstacleTypePlacementConfig(type).spawnWeight) || 1;
      return { type, weight: Math.max(0.01, categoryShare * typeWeight) };
    });
    const total = weightedTypes.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.rng() * total;
    for (const entry of weightedTypes) {
      roll -= entry.weight;
      if (roll <= 0) return entry.type;
    }
    return weightedTypes[weightedTypes.length - 1].type;
  }

  getObstaclePlacementMinSpacing(count, minD = OBSTACLE_PLACEMENT.startPaddingMeters, maxD = Math.max(minD + 0.5, this.trackLength - OBSTACLE_PLACEMENT.finishPaddingMeters)) {
    const usableLength = Math.max(0.5, maxD - minD);
    const requested = Number(OBSTACLE_PLACEMENT.minSpacingMeters) || 10;
    const floor = Number(OBSTACLE_PLACEMENT.minSpacingFloorMeters) || 6;
    const maxEvenSpacing = count > 1 ? usableLength / (count - 1) : requested;
    return clamp(Math.min(requested, maxEvenSpacing * 0.92), Math.min(floor, maxEvenSpacing), requested);
  }

  getObstaclePlacementRequiredSpacing(previous, next, fallbackSpacing) {
    if (!previous || !next) return fallbackSpacing;
    return Math.max(fallbackSpacing, this.getObstaclePairSpacing(previous.type, next.type));
  }

  applyObstaclePlacementSpacing(placements, { minD = OBSTACLE_PLACEMENT.startPaddingMeters, maxD = Math.max(minD + 0.5, this.trackLength - OBSTACLE_PLACEMENT.finishPaddingMeters), minSpacing = null } = {}) {
    if (!placements.length) return placements;
    const fallbackSpacing = minSpacing ?? this.getObstaclePlacementMinSpacing(placements.length, minD, maxD);
    const sorted = placements
      .map((placement, index) => ({ ...placement, originalIndex: index, distance: clamp(placement.distance, minD, maxD) }))
      .sort((a, b) => a.distance - b.distance);
    const span = Math.max(0.5, maxD - minD);
    let cursor = minD;
    sorted.forEach((placement, sortedIndex) => {
      const following = sorted.slice(sortedIndex + 1);
      const requiredAfter = following.reduce((sum, next, index) => {
        const previous = index === 0 ? placement : following[index - 1];
        return sum + this.getObstaclePlacementRequiredSpacing(previous, next, fallbackSpacing);
      }, 0);
      const upper = maxD - requiredAfter;
      const relaxed = clamp(placement.distance, cursor, Math.max(cursor, upper));
      placement.distance = clamp(relaxed, minD, maxD);
      const next = sorted[sortedIndex + 1];
      cursor = Math.min(maxD, placement.distance + this.getObstaclePlacementRequiredSpacing(placement, next, fallbackSpacing));
    });
    if (sorted.length > 1) {
      for (let i = sorted.length - 2; i >= 0; i -= 1) {
        const required = this.getObstaclePlacementRequiredSpacing(sorted[i], sorted[i + 1], fallbackSpacing);
        if (sorted[i + 1].distance - sorted[i].distance < required) {
          sorted[i].distance = Math.max(minD, sorted[i + 1].distance - required);
        }
      }
    }
    const pairGaps = sorted.slice(1).map((placement, index) => {
      const previous = sorted[index];
      const gap = placement.distance - previous.distance;
      const requiredGap = this.getObstaclePlacementRequiredSpacing(previous, placement, fallbackSpacing);
      return { gap, requiredGap };
    });
    const minGap = pairGaps.length ? Math.min(...pairGaps.map((pair) => pair.gap)) : null;
    const minPairClearance = pairGaps.length ? Math.min(...pairGaps.map((pair) => pair.gap - pair.requiredGap)) : null;
    this.obstaclePlacementSpacingState = {
      configuredMinSpacing: OBSTACLE_PLACEMENT.minSpacingMeters,
      minSpacingFloor: OBSTACLE_PLACEMENT.minSpacingFloorMeters,
      pairClearance: OBSTACLE_PLACEMENT.pairClearanceMeters,
      appliedMinSpacing: Number(fallbackSpacing.toFixed(2)),
      minObservedGap: minGap == null || !Number.isFinite(minGap) ? null : Number(minGap.toFixed(2)),
      minObservedPairClearance: minPairClearance == null || !Number.isFinite(minPairClearance) ? null : Number(minPairClearance.toFixed(2)),
      startPadding: OBSTACLE_PLACEMENT.startPaddingMeters,
      finishPadding: OBSTACLE_PLACEMENT.finishPaddingMeters,
      placementCount: sorted.length,
      usableSpan: Number(span.toFixed(2)),
      relaxed: true,
      label: OBSTACLE_PLACEMENT.label,
    };
    return sorted.sort((a, b) => a.originalIndex - b.originalIndex).map(({ originalIndex, ...placement }) => placement);
  }

  buildObstacleDistributionZones(enabledTypes) {
    const usableStart = OBSTACLE_PLACEMENT.startPaddingMeters;
    const usableEnd = Math.max(usableStart + 8, this.trackLength - OBSTACLE_PLACEMENT.finishPaddingMeters);
    const usableLength = Math.max(1, usableEnd - usableStart);
    const maxZonesByLength = Math.max(1, Math.floor(usableLength / (OBSTACLE_DISTRIBUTION_MODES.zoned.minZoneMeters || 70)));
    const zoneCount = Math.max(1, Math.min(enabledTypes.length, maxZonesByLength));
    const zoneTypes = [];
    for (let index = 0; index < zoneCount; index += 1) {
      const previousType = zoneTypes[index - 1] || null;
      const candidates = enabledTypes.filter((type) => type !== previousType);
      zoneTypes.push(this.pickWeightedObstacleType(candidates.length ? candidates : enabledTypes) || enabledTypes[index % enabledTypes.length]);
    }
    return Array.from({ length: zoneCount }, (_, index) => {
      const start = usableStart + (usableLength * index) / zoneCount;
      const end = usableStart + (usableLength * (index + 1)) / zoneCount;
      return { index, start, end, type: zoneTypes[index] };
    });
  }

  buildObstaclePlacements(count, enabledTypes, mode = this.obstacleDistributionMode) {
    if (count <= 0 || !enabledTypes.length) return [];
    if (mode === 'zoned') {
      const zones = this.buildObstacleDistributionZones(enabledTypes);
      const perZoneIndex = new Map();
      const zoneCounts = new Map();
      Array.from({ length: count }, (_, i) => zones[i % zones.length]).forEach((zone) => {
        zoneCounts.set(zone.index, (zoneCounts.get(zone.index) || 0) + 1);
      });
      const zonePlacements = Array.from({ length: count }, (_, i) => {
        const zone = zones[i % zones.length];
        const zonePadding = Math.min(5, Math.max(1.2, (zone.end - zone.start) * 0.12));
        const minD = Math.min(zone.end - 0.5, zone.start + zonePadding);
        const maxD = Math.max(minD + 0.5, zone.end - zonePadding);
        const zoneSlot = perZoneIndex.get(zone.index) || 0;
        perZoneIndex.set(zone.index, zoneSlot + 1);
        const countInZone = zoneCounts.get(zone.index) || 1;
        const spacing = this.getObstaclePlacementMinSpacing(countInZone, minD, maxD);
        const jitterWindow = Math.min(Math.max(0.25, spacing * 0.35), Math.max(0.25, (maxD - minD) / Math.max(1, countInZone * 2)));
        const baseDistance = countInZone > 1
          ? minD + (zoneSlot * (maxD - minD)) / Math.max(1, countInZone - 1)
          : (minD + maxD) / 2;
        return {
          type: zone.type,
          distance: clamp(baseDistance + (this.rng() - 0.5) * jitterWindow, minD, maxD),
          zoneIndex: zone.index,
          zoneStart: zone.start,
          zoneEnd: zone.end,
          minSpacing: spacing,
        };
      });
      return [...zoneCounts.keys()].flatMap((zoneIndex) => {
        const zone = zones.find((entry) => entry.index === zoneIndex);
        const zonePadding = Math.min(5, Math.max(1.2, (zone.end - zone.start) * 0.12));
        const minD = Math.min(zone.end - 0.5, zone.start + zonePadding);
        const maxD = Math.max(minD + 0.5, zone.end - zonePadding);
        return this.applyObstaclePlacementSpacing(
          zonePlacements.filter((placement) => placement.zoneIndex === zoneIndex),
          { minD, maxD, minSpacing: this.getObstaclePlacementMinSpacing(zoneCounts.get(zoneIndex) || 1, minD, maxD) },
        );
      });
    }
    const minD = OBSTACLE_PLACEMENT.startPaddingMeters;
    const maxD = Math.max(minD + 0.5, this.trackLength - OBSTACLE_PLACEMENT.finishPaddingMeters);
    const placements = Array.from({ length: count }, () => ({
      type: this.pickWeightedObstacleType(enabledTypes) || enabledTypes[0],
      distance: minD + this.rng() * Math.max(0.5, maxD - minD),
      zoneIndex: null,
      zoneStart: null,
      zoneEnd: null,
    }));
    return this.applyObstaclePlacementSpacing(placements, { minD, maxD });
  }

  createPinballObstacle(type, frame, lane, localWidth, palette, placement = {}) {
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const pitch = Math.atan2(frame.tangent.y, Math.max(0.0001, Math.hypot(frame.tangent.x, frame.tangent.z)));
    const trackSurface = new THREE.Vector3(frame.p.x + frame.right.x * lane, frame.p.y, frame.p.z + frame.right.z * lane);
    switch (type) {
      case 'popBumper':
        palette.popBumper.userData.capMaterial = palette.popBumperCap;
        palette.popBumper.userData.ringMaterial = palette.chrome;
        return this.createPopBumperObstacle(trackSurface, yaw, pitch, palette.popBumper);
      case 'pinBumper':
        palette.pinBumper.userData.tipMaterial = palette.pinBumperTip;
        palette.pinBumper.userData.ringMaterial = palette.chrome;
        return this.createPinBumperObstacle(trackSurface, yaw, pitch, palette.pinBumper);
      case 'gongBumper':
        palette.gongBumper.userData.faceMaterial = palette.gongBumperFace;
        palette.gongBumper.userData.ringMaterial = palette.chrome;
        return this.createGongBumperObstacle(trackSurface, yaw, pitch, palette.gongBumper);
      case 'slingshot':
        palette.slingshot.userData.insertMaterial = palette.yellowInsert;
        palette.slingshot.userData.chromeMaterial = palette.chrome;
        return this.createSlingshotObstacle(trackSurface, yaw, pitch, (this.rng() < 0.5 ? -1 : 1) * Math.PI * 0.24, palette.slingshot);
      case 'spinnerGate':
        palette.spinnerGate.userData.yellowInsert = palette.yellowInsert;
        palette.spinnerGate.userData.redInsert = palette.redInsert;
        palette.spinnerGate.userData.chromeMaterial = palette.chrome;
        return this.createSpinnerGateObstacle(trackSurface, yaw, pitch, palette.spinnerGate);
      case 'pendulumHammer': {
        palette.pendulumHammer.userData.chromeMaterial = palette.chrome;
        palette.pendulumHammer.userData.insertMaterial = palette.redInsert;
        const hammerWidth = Math.min(5.4, Math.max(4.2, localWidth - 1.15));
        const hammerLength = 4.2;
        const hammerFrame = this.getTrackSlopeFrameAcrossSpan(Number.isFinite(placement.distance) ? placement.distance : (Number.isFinite(frame.p.d) ? frame.p.d : 0), hammerLength);
        const hammerYaw = Math.atan2(hammerFrame.tangent.x, hammerFrame.tangent.z);
        const hammerPitch = Math.atan2(hammerFrame.tangent.y, Math.max(0.0001, Math.hypot(hammerFrame.tangent.x, hammerFrame.tangent.z)));
        const railClearance = 0.48;
        const maxCenterOffset = Math.max(0, localWidth / 2 - hammerWidth / 2 - railClearance);
        const safeLane = clamp(lane, -maxCenterOffset, maxCenterOffset);
        const safeTrackSurface = new THREE.Vector3(hammerFrame.p.x + hammerFrame.right.x * safeLane, hammerFrame.p.y, hammerFrame.p.z + hammerFrame.right.z * safeLane);
        return this.createPendulumHammerObstacle(safeTrackSurface, hammerYaw, hammerPitch, palette.pendulumHammer, {
          hammerWidth,
          hammerLength,
          laneOffset: safeLane,
          requestedLaneOffset: lane,
          localTrackWidth: localWidth,
          railClearance,
          railContainmentHalfWidth: hammerWidth / 2,
          slopeFit: {
            mode: 'hammer-span-track-slope',
            spanMeters: hammerFrame.spanMeters ?? hammerLength,
            centerPitch: pitch,
            hammerPitch,
            spanStartDistance: hammerFrame.spanStartDistance ?? null,
            spanEndDistance: hammerFrame.spanEndDistance ?? null,
          },
        });
      }
      case 'movingGate': {
        palette.movingGate.userData.chromeMaterial = palette.chrome;
        palette.movingGate.userData.insertMaterial = palette.redInsert;
        const movingGateWidth = 5.025;
        const railClearance = 0.55;
        const maxCenterOffset = Math.max(0, localWidth / 2 - movingGateWidth / 2 - railClearance);
        const safeLane = clamp(lane, -maxCenterOffset, maxCenterOffset);
        const safeTrackSurface = new THREE.Vector3(frame.p.x + frame.right.x * safeLane, frame.p.y, frame.p.z + frame.right.z * safeLane);
        return this.createMovingGateObstacle(safeTrackSurface, yaw, pitch, (this.rng() < 0.5 ? -1 : 1), palette.movingGate, {
          laneOffset: safeLane,
          requestedLaneOffset: lane,
          localTrackWidth: localWidth,
          railClearance,
          railContainmentHalfWidth: movingGateWidth / 2,
        });
      }
      case 'splitterFork': {
        palette.slingshot.userData.chromeMaterial = palette.chrome;
        palette.slingshot.userData.yellowInsert = palette.yellowInsert;
        palette.slingshot.userData.redInsert = palette.redInsert;
        const splitterWidth = Math.min(5.4, Math.max(4.1, localWidth - 1.2));
        const railClearance = 0.48;
        const maxCenterOffset = Math.max(0, localWidth / 2 - splitterWidth / 2 - railClearance - 0.02);
        const safeLane = clamp(lane, -maxCenterOffset, maxCenterOffset);
        const safeTrackSurface = new THREE.Vector3(frame.p.x + frame.right.x * safeLane, frame.p.y, frame.p.z + frame.right.z * safeLane);
        return this.createSplitterForkObstacle(safeTrackSurface, yaw, pitch, palette.slingshot, {
          splitterWidth,
          laneOffset: safeLane,
          requestedLaneOffset: lane,
          localTrackWidth: localWidth,
          railClearance,
          railContainmentHalfWidth: splitterWidth / 2,
        });
      }
      case 'tiltBridge': {
        palette.tiltBridge.userData.chromeMaterial = palette.chrome;
        palette.tiltBridge.userData.yellowInsert = palette.yellowInsert;
        palette.tiltBridge.userData.redInsert = palette.redInsert;
        const bridgeLength = 4.8;
        const bridgeFrame = this.getTrackSlopeFrameAcrossSpan(Number.isFinite(placement.distance) ? placement.distance : (Number.isFinite(frame.p.d) ? frame.p.d : 0), bridgeLength);
        const bridgeYaw = Math.atan2(bridgeFrame.tangent.x, bridgeFrame.tangent.z);
        const bridgePitch = Math.atan2(bridgeFrame.tangent.y, Math.max(0.0001, Math.hypot(bridgeFrame.tangent.x, bridgeFrame.tangent.z)));
        const bridgeWidth = Math.min(5.6, Math.max(4.2, localWidth - 1.25));
        const railClearance = 0.45;
        const maxCenterOffset = Math.max(0, localWidth / 2 - bridgeWidth / 2 - railClearance);
        const safeLane = clamp(lane, -maxCenterOffset, maxCenterOffset);
        const safeTrackSurface = new THREE.Vector3(bridgeFrame.p.x + bridgeFrame.right.x * safeLane, bridgeFrame.p.y, bridgeFrame.p.z + bridgeFrame.right.z * safeLane);
        return this.createTiltBridgeObstacle(safeTrackSurface, bridgeYaw, bridgePitch, palette.tiltBridge, {
          bridgeWidth,
          bridgeLength,
          laneOffset: safeLane,
          requestedLaneOffset: lane,
          localTrackWidth: localWidth,
          railClearance,
          slopeFit: {
            mode: 'bridge-span-track-slope',
            spanMeters: bridgeFrame.spanMeters ?? bridgeLength,
            centerPitch: pitch,
            bridgePitch,
            spanStartDistance: bridgeFrame.spanStartDistance ?? null,
            spanEndDistance: bridgeFrame.spanEndDistance ?? null,
          },
        });
      }
      case 'orbitRing': {
        palette.orbitRing.userData.chromeMaterial = palette.chrome;
        palette.orbitRing.userData.insertMaterial = palette.yellowInsert;
        const ringWidth = 5.2;
        const railClearance = 0.42;
        const maxCenterOffset = Math.max(0, localWidth / 2 - ringWidth / 2 - railClearance);
        const safeLane = clamp(lane, -maxCenterOffset, maxCenterOffset);
        const safeTrackSurface = new THREE.Vector3(frame.p.x + frame.right.x * safeLane, frame.p.y, frame.p.z + frame.right.z * safeLane);
        return this.createOrbitRingObstacle(safeTrackSurface, yaw, pitch, palette.orbitRing, {
          laneOffset: safeLane,
          requestedLaneOffset: lane,
          localTrackWidth: localWidth,
          railClearance,
          railContainmentHalfWidth: ringWidth / 2,
        });
      }
      case 'dropTarget':
      default:
        palette.rubber.userData.insertMaterial = palette.yellowInsert;
        return this.createDropTargetObstacle(trackSurface, yaw, pitch, palette.dropTarget, palette.rubber);
    }
  }

  addObstacleBody(body, meshOrGroup) {
    this.world.addBody(body);
    this.obstacleBodies.push(body);
    this.obstacleMeshes.push(meshOrGroup);
  }

  createPopBumperObstacle(trackSurface, yaw, pitch, material) {
    const capMaterial = material.userData?.capMaterial || material;
    const ringMaterial = material.userData?.ringMaterial || material;
    const radius = 0.55 + this.rng() * 0.35;
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    this.trackGroup.add(group);

    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.56, 40), material);
    mesh.position.y = 0.34;
    mesh.castShadow = PERFORMANCE_TUNING.shadows;
    mesh.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(mesh);

    const skirt = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.08, 0.075, 8, 36), ringMaterial);
    skirt.position.y = 0.64;
    skirt.rotation.x = Math.PI / 2;
    skirt.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(skirt);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.78, 24, 12), capMaterial);
    cap.position.y = 0.78;
    cap.scale.y = 0.38;
    cap.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(cap);

    const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    body.addShape(new CANNON.Cylinder(radius, radius, 0.66, 28));
    this.setSlopeBodyTransform(body, trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, 0.34, 0, yaw, pitch)), yaw, pitch);
    this.addObstacleBody(body, group);
    const obstacle = {
      type: 'popBumper',
      trackSurface: trackSurface.clone(),
      center: trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, 0.34, 0, yaw, pitch)),
      radius: Math.max(PINBALL_PHYSICS.popBumperRadius, radius + 0.62),
      impulse: PINBALL_PHYSICS.popBumperImpulse,
      cooldown: new Map(),
      mesh,
      group,
      cap,
      skirt,
      trackSlopePitch: pitch,
      trackYaw: yaw,
      pulse: 0,
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createPinBumperObstacle(trackSurface, yaw, pitch, material) {
    const pinCount = Math.max(2, PINBALL_PHYSICS.pinBumperCount || 5);
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    group.userData.visualStyle = 'clustered-brushed-metal-pin-bumper-bank';
    this.trackGroup.add(group);

    const pins = [];
    const bodies = [];
    const localOffsets = [];
    const spacing = 0.68;
    const metalTexture = this.createPinBumperMetalTexture?.() || null;
    const metalPinMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xdce6ee,
      map: metalTexture,
      metalness: 0.96,
      roughness: 0.2,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.35,
    });
    const darkGrooveMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x30363d,
      metalness: 0.92,
      roughness: 0.26,
      clearcoat: 0.55,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.1,
    });
    const goldAccentMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf5c85b,
      metalness: 0.95,
      roughness: 0.18,
      clearcoat: 0.8,
      clearcoatRoughness: 0.07,
      envMapIntensity: 1.25,
    });
    const rows = [
      { x: 0, z: -0.78 },
      { x: -spacing * 0.62, z: -0.24 },
      { x: spacing * 0.62, z: -0.24 },
      { x: -spacing * 1.18, z: 0.44 },
      { x: spacing * 1.18, z: 0.44 },
    ].slice(0, pinCount);

    rows.forEach((offset, index) => {
      const stemRadius = 0.2;
      const stemHeight = 0.8;
      const pinGroup = new THREE.Group();
      pinGroup.position.set(offset.x, 0, offset.z);
      group.add(pinGroup);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(stemRadius * 1.72, stemRadius * 1.9, 0.14, 36), darkGrooveMaterial);
      base.position.y = 0.07;
      base.castShadow = PERFORMANCE_TUNING.shadows;
      base.receiveShadow = PERFORMANCE_TUNING.shadows;
      pinGroup.add(base);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(stemRadius, stemRadius * 0.82, stemHeight, 36), metalPinMaterial);
      stem.position.y = 0.14 + stemHeight / 2;
      stem.castShadow = PERFORMANCE_TUNING.shadows;
      stem.receiveShadow = PERFORMANCE_TUNING.shadows;
      pinGroup.add(stem);

      const lowerBand = new THREE.Mesh(new THREE.TorusGeometry(stemRadius * 1.03, 0.018, 8, 36), darkGrooveMaterial);
      lowerBand.position.y = 0.26;
      lowerBand.rotation.x = Math.PI / 2;
      pinGroup.add(lowerBand);

      const topBand = new THREE.Mesh(new THREE.TorusGeometry(stemRadius * 0.88, 0.018, 8, 36), goldAccentMaterial);
      topBand.position.y = 0.14 + stemHeight * 0.92;
      topBand.rotation.x = Math.PI / 2;
      pinGroup.add(topBand);

      const tip = new THREE.Mesh(new THREE.SphereGeometry(stemRadius * 1.18, 28, 14), metalPinMaterial);
      tip.position.y = 0.14 + stemHeight + stemRadius * 0.5;
      tip.scale.y = 0.56;
      tip.castShadow = PERFORMANCE_TUNING.shadows;
      pinGroup.add(tip);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(stemRadius * 1.85, 0.018, 8, 36),
        new THREE.MeshBasicMaterial({ color: 0xd8f7ff, transparent: true, opacity: 0.22, depthWrite: false })
      );
      halo.position.y = 0.31;
      halo.rotation.x = Math.PI / 2;
      halo.renderOrder = 34;
      pinGroup.add(halo);

      const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
      body.addShape(new CANNON.Cylinder(stemRadius * 1.16, stemRadius * 1.02, stemHeight + 0.22, 24));
      const bodyCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(offset.x, 0.52, offset.z, yaw, pitch));
      this.setSlopeBodyTransform(body, bodyCenter, yaw, pitch);
      this.addObstacleBody(body, group);
      bodies.push(body);
      pins.push({ group: pinGroup, base, stem, tip, halo, x: offset.x, z: offset.z, body, center: bodyCenter });
      localOffsets.push(offset);
    });

    const obstacleCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, 0.52, 0, yaw, pitch));
    const obstacle = {
      type: 'pinBumper',
      trackSurface: trackSurface.clone(),
      center: obstacleCenter,
      radius: PINBALL_PHYSICS.pinBumperRadius + spacing,
      impulse: PINBALL_PHYSICS.pinBumperImpulse,
      cooldown: new Map(),
      group,
      pins,
      bodies,
      localOffsets,
      pinCount: pins.length,
      pinBumperDimensions: {
        pinCount: pins.length,
        stemRadius: 0.2,
        stemHeight: 0.8,
        spacing,
        rowPattern: 'five-pin-v-formation',
        materialStyle: 'brushed-metal-with-gold-accent-rings',
        textureSize: 256,
        clusterRadius: PINBALL_PHYSICS.pinBumperRadius + spacing,
      },
      trackSlopePitch: pitch,
      trackYaw: yaw,
      visualStyle: 'clustered-brushed-metal-pin-bumper-bank',
      textureStyle: 'brushed-metal-pin-texture-gold-accent-rings',
      pulse: 0,
      lastHitPinIndex: null,
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createGongBumperObstacle(trackSurface, yaw, pitch, material) {
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    group.userData.visualStyle = 'large-event-glowing-gong-bumper';
    this.trackGroup.add(group);

    const gongRadius = 0.92;
    const gongThickness = 0.2;
    const standHeight = 1.55;
    const standWidth = 2.25;
    const gongCopperTexture = this.createGongCopperTexture();
    const gongFaceMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd8893d,
      map: gongCopperTexture,
      roughness: 0.28,
      metalness: 0.96,
      clearcoat: 0.82,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.45,
      emissive: 0x2d1200,
      emissiveIntensity: 0.2,
    });
    const faceMaterial = material.userData?.faceMaterial || gongFaceMaterial;
    if (!faceMaterial.map) faceMaterial.map = gongCopperTexture;
    if (faceMaterial.color?.setHex) faceMaterial.color.setHex(0xd8893d);
    faceMaterial.metalness = Math.max(faceMaterial.metalness ?? 0, 0.94);
    faceMaterial.roughness = Math.max(faceMaterial.roughness ?? 0.18, 0.26);
    faceMaterial.userData = {
      ...(faceMaterial.userData || {}),
      style: 'hammered-copper-gong-face',
      textureStyle: gongCopperTexture.userData?.style || 'hammered-copper-radial-rings',
    };
    const chromeMat = material.userData?.ringMaterial || new THREE.MeshPhysicalMaterial({ color: 0xeaf7ff, roughness: 0.12, metalness: 0.92, clearcoat: 1, clearcoatRoughness: 0.04 });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const standMat = new THREE.MeshPhysicalMaterial({ color: 0x23170b, roughness: 0.26, metalness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.12, emissive: 0x120700, emissiveIntensity: 0.18 });

    const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, standHeight, 14), standMat);
    leftPost.position.set(-standWidth / 2, standHeight / 2, 0);
    leftPost.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(leftPost);
    const rightPost = leftPost.clone();
    rightPost.position.x = standWidth / 2;
    group.add(rightPost);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(standWidth + 0.28, 0.08, 0.1), standMat);
    topBar.position.set(0, standHeight + 0.02, 0);
    topBar.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(topBar);

    const cordMat = new THREE.MeshBasicMaterial({ color: 0x1a1207 });
    [-0.36, 0.36].forEach((x) => {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.58, 8), cordMat);
      cord.position.set(x, 1.35, 0.015);
      group.add(cord);
    });

    const gong = new THREE.Mesh(new THREE.CylinderGeometry(gongRadius, gongRadius * 0.86, gongThickness, 56), faceMaterial);
    gong.position.set(0, 0.92, 0);
    gong.rotation.x = Math.PI / 2;
    gong.castShadow = PERFORMANCE_TUNING.shadows;
    gong.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(gong);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(gongRadius * 1.02, 0.055, 10, 56), chromeMat);
    rim.position.copy(gong.position);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(rim);

    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x5a2d00, transparent: true, opacity: 0.42, depthWrite: false });
    [0.42, 0.68].forEach((radius) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 8, 48), innerRingMat.clone());
      ring.position.set(0, 0.92, 0.125);
      ring.rotation.x = Math.PI / 2;
      ring.renderOrder = 37;
      group.add(ring);
    });

    const boss = new THREE.Mesh(new THREE.SphereGeometry(gongRadius * 0.26, 28, 14), material);
    boss.position.set(0, 0.92, 0.12);
    boss.scale.y = 0.35;
    boss.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(boss);

    const malletGroup = new THREE.Group();
    malletGroup.position.set(1.36, 0.9, -0.42);
    malletGroup.rotation.set(-0.22, 0.08, -0.72);
    malletGroup.userData.restPosition = { x: 1.36, y: 0.9, z: -0.42 };
    malletGroup.userData.restRotation = { x: -0.22, y: 0.08, z: -0.72 };
    malletGroup.userData.swingAxis = 'z';
    group.add(malletGroup);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.92, 10), standMat);
    handle.rotation.z = Math.PI / 2;
    handle.castShadow = PERFORMANCE_TUNING.shadows;
    malletGroup.add(handle);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 16), new THREE.MeshPhysicalMaterial({ color: 0xff3d62, roughness: 0.22, metalness: 0.04, clearcoat: 0.7, emissive: 0x5a0015, emissiveIntensity: 0.22 }));
    head.rotation.x = Math.PI / 2;
    head.position.x = -0.5;
    head.castShadow = PERFORMANCE_TUNING.shadows;
    malletGroup.add(head);

    const glow = new THREE.Mesh(new THREE.RingGeometry(gongRadius * 1.05, gongRadius * 1.36, 64), glowMaterial);
    glow.position.set(0, 0.92, 0.14);
    glow.rotation.x = Math.PI / 2;
    glow.renderOrder = 38;
    group.add(glow);

    const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    body.addShape(new CANNON.Cylinder(gongRadius, gongRadius * 0.9, gongThickness + 0.1, 32));
    const obstacleCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, 0.92, 0, yaw, pitch));
    this.setSlopeBodyTransform(body, obstacleCenter, yaw, pitch);
    this.addObstacleBody(body, group);

    const obstacle = {
      type: 'gongBumper',
      kind: 'gongBumper',
      trackSurface: trackSurface.clone(),
      center: obstacleCenter,
      radius: PINBALL_PHYSICS.gongBumperRadius,
      impulse: PINBALL_PHYSICS.gongBumperImpulse,
      packImpulse: PINBALL_PHYSICS.gongBumperPackImpulse,
      packRadius: PINBALL_PHYSICS.gongBumperPackRadius,
      cooldown: new Map(),
      group,
      mesh: gong,
      gong,
      rim,
      boss,
      glow,
      malletGroup,
      body,
      trackSlopePitch: pitch,
      trackYaw: yaw,
      visualStyle: 'large-event-copper-gong-bumper',
      textureStyle: 'hammered-copper-gong-rim-glow',
      malletRestPosition: { x: 1.36, y: 0.9, z: -0.42 },
      malletRestRotation: { x: -0.22, y: 0.08, z: -0.72 },
      gongDimensions: { gongRadius, gongThickness, standHeight, standWidth, hasHangingCords: true, hasMallet: true, malletSideMounted: true, malletAnimated: true, faceRingCount: 2, packRadius: PINBALL_PHYSICS.gongBumperPackRadius, packImpulse: PINBALL_PHYSICS.gongBumperPackImpulse, faceMaterialStyle: faceMaterial.userData?.style, copperTextureStyle: gongCopperTexture.userData?.style },
      pulse: 0,
      shake: 0,
      malletSwing: 0,
      lastHitBy: null,
      lastPackShakeCount: 0,
      lastCommentaryLines: [],
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createSlingshotObstacle(trackSurface, yaw, pitch, localYaw, material) {
    const w = 2.1 + this.rng() * 0.65;
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeTwistRotation(group, yaw, pitch, localYaw);
    group.userData.visualStyle = 'aligned-modern-chrome-neon-slingshot';
    this.trackGroup.add(group);

    const panelMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: this.createSlingshotPanelTexture(),
      roughness: 0.12,
      metalness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.045,
      emissive: 0x0cd9c0,
      emissiveIntensity: 0.36,
    });
    const chromeMat = material.userData?.chromeMaterial || new THREE.MeshPhysicalMaterial({ color: 0xe6f2ff, roughness: 0.1, metalness: 0.92, clearcoat: 1, clearcoatRoughness: 0.04 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x18ffe1, transparent: true, opacity: 0.3, depthWrite: false });
    const insertMat = material.userData?.insertMaterial || panelMat;

    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.5), chromeMat);
    base.position.set(0, 0.1, 0);
    base.castShadow = PERFORMANCE_TUNING.shadows;
    base.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(base);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.36, 0.16), panelMat);
    panel.position.set(0, 0.33, 0);
    panel.castShadow = PERFORMANCE_TUNING.shadows;
    panel.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(panel);

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.84, 0.28), glowMat);
    glow.position.set(0, 0.425, 0.085);
    glow.rotation.x = -Math.PI / 2;
    glow.renderOrder = 36;
    group.add(glow);

    const bulbs = [];
    [-0.3, 0, 0.3].forEach((offset) => {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 10), insertMat);
      bulb.position.set(offset * w, 0.55, 0);
      bulb.scale.y = 0.44;
      bulb.castShadow = PERFORMANCE_TUNING.shadows;
      group.add(bulb);
      bulbs.push(bulb);
    });

    const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, 0.22, 0.18)));
    const obstacleCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, 0.2, 0, yaw, pitch));
    this.setSlopeBodyTransform(body, obstacleCenter, yaw, pitch, localYaw);
    this.addObstacleBody(body, group);
    const slingshotForward = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion).normalize();
    const slingshotNormal = new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion).normalize();
    const obstacle = {
      type: 'slingshot',
      trackSurface: trackSurface.clone(),
      center: obstacleCenter,
      normal: slingshotNormal,
      direction: slingshotForward,
      radius: PINBALL_PHYSICS.slingshotRadius,
      impulse: PINBALL_PHYSICS.slingshotImpulse,
      cooldown: new Map(),
      mesh: panel,
      group,
      base,
      bulbs,
      glow,
      trackSlopePitch: pitch,
      trackYaw: yaw,
      localYaw,
      visualStyle: 'aligned-modern-chrome-neon-slingshot',
      textureStyle: 'aligned-gradient-panel-neon-bulbs',
      pulse: 0,
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createSpinnerGateObstacle(trackSurface, yaw, pitch, material) {
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    group.userData.visualStyle = 'premium-neon-arcade-spinner-gate';
    this.trackGroup.add(group);

    const spinnerScale = 2;
    const hubRadius = 0.24 * spinnerScale;
    const hubHeight = 0.52 * spinnerScale;
    const hubY = 0.28 * spinnerScale;
    const armLength = 1.95 * spinnerScale;
    const armHeight = 0.22 * spinnerScale;
    const armDepth = 0.2 * spinnerScale;
    const armY = 0.32 * spinnerScale;
    const tipOffset = 0.72 * spinnerScale;
    const tipRadius = 0.13 * spinnerScale;
    const colliderRadius = 0.62 * spinnerScale;
    const colliderHeight = 0.5 * spinnerScale;

    const spinnerTexture = this.createSpinnerGateTexture();
    const spinnerMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: spinnerTexture,
      roughness: 0.1,
      metalness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      emissive: 0x4f21ff,
      emissiveIntensity: 0.48,
    });
    const chromeMat = material.userData?.chromeMaterial || new THREE.MeshPhysicalMaterial({ color: 0xeaf7ff, roughness: 0.09, metalness: 0.92, clearcoat: 1, clearcoatRoughness: 0.035 });
    const cyanMat = new THREE.MeshPhysicalMaterial({ color: 0x22ffe4, roughness: 0.12, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x00d8c2, emissiveIntensity: 0.68 });
    const magentaMat = new THREE.MeshPhysicalMaterial({ color: 0xff3dac, roughness: 0.12, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0xff1f8f, emissiveIntensity: 0.62 });
    const amberMat = material.userData?.yellowInsert || new THREE.MeshPhysicalMaterial({ color: 0xffd166, roughness: 0.14, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x9d6500, emissiveIntensity: 0.52 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x22ffe4, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05 * spinnerScale, 1.2 * spinnerScale, 0.12 * spinnerScale, 48), chromeMat);
    base.position.y = 0.06 * spinnerScale;
    base.castShadow = PERFORMANCE_TUNING.shadows;
    base.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(base);

    const lowerRing = new THREE.Mesh(new THREE.TorusGeometry(0.86 * spinnerScale, 0.045 * spinnerScale, 10, 56), chromeMat);
    lowerRing.position.y = 0.17 * spinnerScale;
    lowerRing.rotation.x = Math.PI / 2;
    lowerRing.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(lowerRing);

    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(1.1 * spinnerScale, 0.035 * spinnerScale, 8, 64), cyanMat);
    haloRing.position.y = 0.24 * spinnerScale;
    haloRing.rotation.x = Math.PI / 2;
    group.add(haloRing);

    const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(1.04 * spinnerScale, 64), glowMat);
    glowDisc.position.y = 0.255 * spinnerScale;
    glowDisc.rotation.x = -Math.PI / 2;
    glowDisc.renderOrder = 35;
    group.add(glowDisc);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(hubRadius, hubRadius, hubHeight, 32), spinnerMat);
    hub.position.y = hubY;
    hub.castShadow = PERFORMANCE_TUNING.shadows;
    hub.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(hub);

    const hubCap = new THREE.Mesh(new THREE.SphereGeometry(hubRadius * 1.12, 28, 12), chromeMat);
    hubCap.position.y = hubY + hubHeight * 0.55;
    hubCap.scale.y = 0.28;
    hubCap.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(hubCap);

    const spinnerArms = [];
    const armGlows = [];
    const tips = [];
    const bladeEdgeMat = [cyanMat, magentaMat, amberMat];
    for (let i = 0; i < 3; i += 1) {
      const armGroup = new THREE.Group();
      armGroup.position.y = armY;
      armGroup.rotation.y = (Math.PI * 2 * i) / 3;
      group.add(armGroup);
      spinnerArms.push(armGroup);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(armLength, armHeight, armDepth), spinnerMat);
      arm.castShadow = PERFORMANCE_TUNING.shadows;
      arm.receiveShadow = PERFORMANCE_TUNING.shadows;
      armGroup.add(arm);

      const edgeMat = bladeEdgeMat[i % bladeEdgeMat.length];
      [-1, 1].forEach((side) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(armLength * 0.92, armHeight * 0.22, armDepth * 0.34), edgeMat);
        rail.position.set(0, side * armHeight * 0.52, armDepth * 0.34);
        rail.castShadow = PERFORMANCE_TUNING.shadows;
        armGroup.add(rail);
      });

      const glow = new THREE.Mesh(new THREE.PlaneGeometry(armLength * 0.9, armHeight * 2.1), glowMat.clone());
      glow.material.opacity = 0.2;
      glow.position.set(0, 0, armDepth * 0.58);
      glow.rotation.x = -Math.PI / 2;
      glow.renderOrder = 36;
      armGroup.add(glow);
      armGlows.push(glow);

      const tipMat = i % 2 === 0 ? (material.userData?.yellowInsert || amberMat) : (material.userData?.redInsert || magentaMat);
      [-tipOffset, tipOffset].forEach((x) => {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(tipRadius, 18, 10), tipMat);
        tip.position.set(x, 0, 0);
        tip.scale.y = 0.55;
        tip.castShadow = PERFORMANCE_TUNING.shadows;
        armGroup.add(tip);
        tips.push(tip);
      });
    }

    const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    body.addShape(new CANNON.Cylinder(colliderRadius, colliderRadius, colliderHeight, 16));
    const obstacleCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, hubY, 0, yaw, pitch));
    this.setSlopeBodyTransform(body, obstacleCenter, yaw, pitch);
    this.addObstacleBody(body, group);
    const obstacle = {
      type: 'spinnerGate',
      trackSurface: trackSurface.clone(),
      center: obstacleCenter,
      radius: PINBALL_PHYSICS.spinnerRadius * spinnerScale,
      impulse: PINBALL_PHYSICS.spinnerImpulse,
      cooldown: new Map(),
      group,
      base,
      lowerRing,
      haloRing,
      glowDisc,
      hub,
      hubCap,
      body,
      spinnerArms,
      armGlows,
      tips,
      spinnerScale,
      spinnerDimensions: {
        hubRadius,
        hubHeight,
        armLength,
        armHeight,
        armDepth,
        tipOffset,
        tipRadius,
        colliderRadius,
        colliderHeight,
      },
      trackSlopePitch: pitch,
      trackYaw: yaw,
      visualStyle: 'premium-neon-arcade-spinner-gate',
      textureStyle: 'radial-spin-circuit-texture-chrome-halo-glow',
      spinnerSpeed: PINBALL_PHYSICS.spinnerSpeed * (this.rng() < 0.5 ? -1 : 1),
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createTiltBridgeObstacle(trackSurface, yaw, pitch, material, placement = {}) {
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    group.userData.visualStyle = 'minimal-two-cuboid-cross-v-tilt-bridge';
    this.trackGroup.add(group);

    const bridgeLength = placement.bridgeLength || 4.8;
    const bridgeWidth = placement.bridgeWidth || 4.8;
    const panelGap = 0.2;
    const panelWidth = Math.max(1.2, (bridgeWidth - panelGap) / 2);
    const panelLength = bridgeLength;
    const panelHeight = 0.7;
    const loweredTopClearance = -0.25;
    const deckY = loweredTopClearance - panelHeight / 2;
    const liftAmplitude = 1.0;
    const baseRoll = 0.16;
    const copperTextureCanvas = document.createElement('canvas');
    copperTextureCanvas.width = 256;
    copperTextureCanvas.height = 256;
    const copperCtx = copperTextureCanvas.getContext('2d');
    const copperGradient = copperCtx.createLinearGradient(0, 0, 256, 256);
    copperGradient.addColorStop(0, '#6e2e12');
    copperGradient.addColorStop(0.28, '#c06d32');
    copperGradient.addColorStop(0.5, '#f1a15a');
    copperGradient.addColorStop(0.74, '#9a431c');
    copperGradient.addColorStop(1, '#4e1f0d');
    copperCtx.fillStyle = copperGradient;
    copperCtx.fillRect(0, 0, 256, 256);
    for (let stripe = 0; stripe < 46; stripe += 1) {
      const y = stripe * 6 + (stripe % 3) * 1.5;
      copperCtx.fillStyle = stripe % 2 ? 'rgba(255, 202, 130, 0.16)' : 'rgba(65, 22, 8, 0.18)';
      copperCtx.fillRect(0, y, 256, 2);
    }
    const copperTexture = new THREE.CanvasTexture(copperTextureCanvas);
    copperTexture.wrapS = THREE.RepeatWrapping;
    copperTexture.wrapT = THREE.RepeatWrapping;
    copperTexture.repeat.set(1.6, 3.2);
    copperTexture.userData = { style: 'brushed-copper-board-texture' };
    const copperMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xff8a2a,
      map: copperTexture,
      roughness: 0.22,
      metalness: 0.82,
      clearcoat: 0.62,
      clearcoatRoughness: 0.1,
      emissive: 0x8a2d08,
      emissiveIntensity: 0.32,
      envMapIntensity: 0.65,
      transparent: false,
      opacity: 1,
      transmission: 0,
      depthWrite: true,
    });
    copperMaterial.userData = { style: 'brushed-copper-metal-tilt-bridge-cuboid-board' };
    const sweepSpeed = Math.abs(PINBALL_PHYSICS.tiltBridgeSweepSpeed) * (this.rng() < 0.5 ? -1 : 1);

    const createPanel = (side) => {
      const sign = side === 'left' ? -1 : 1;
      const initialWave = side === 'left' ? 1 : 0;
      const initialLift = initialWave * liftAmplitude;
      const initialRoll = sign * (baseRoll + initialWave * baseRoll * 0.8);
      const panelGroup = new THREE.Group();
      panelGroup.position.set(sign * (panelWidth / 2 + panelGap / 2), deckY + initialLift, 0);
      panelGroup.rotation.z = initialRoll;
      group.add(panelGroup);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(panelWidth, panelHeight, panelLength), copperMaterial);
      deck.castShadow = PERFORMANCE_TUNING.shadows;
      deck.receiveShadow = PERFORMANCE_TUNING.shadows;
      panelGroup.add(deck);

      const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(panelWidth / 2, panelHeight / 2, panelLength / 2)));
      this.world.addBody(body);
      this.obstacleBodies.push(body);

      return {
        side,
        sign,
        group: panelGroup,
        deck,
        body,
        localX: sign * (panelWidth / 2 + panelGap / 2),
        localZ: 0,
        currentLift: initialLift,
        currentRoll: initialRoll,
      };
    };

    const bridgePanels = [createPanel('left'), createPanel('right')];
    this.obstacleMeshes.push(group);

    const obstacleCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, deckY, 0, yaw, pitch));
    const obstacle = {
      type: 'tiltBridge',
      kind: 'tiltBridge',
      trackSurface: trackSurface.clone(),
      center: obstacleCenter,
      radius: PINBALL_PHYSICS.tiltBridgeRadius,
      impulse: PINBALL_PHYSICS.tiltBridgeImpulse,
      cooldown: new Map(),
      group,
      bridgePanels,
      bridgePivot: null,
      deck: null,
      centerGlow: null,
      planks: [],
      rails: [],
      pylons: [],
      pivotBar: null,
      body: bridgePanels[0]?.body || null,
      bodies: bridgePanels.map((panel) => panel.body),
      trackSlopePitch: pitch,
      trackYaw: yaw,
      visualStyle: 'minimal-two-cuboid-cross-v-tilt-bridge',
      textureStyle: 'brushed-copper-metal-two-cuboid-panels-no-axis-no-decoration',
      tiltBridgeDimensions: {
        bridgeWidth,
        bridgeLength,
        panelWidth,
        panelLength,
        panelGap,
        panelHeight,
        deckY,
        loweredTopClearance,
        raisedTopClearance: loweredTopClearance + liftAmplitude,
        liftAmplitude,
        baseRoll,
        materialStyle: copperMaterial.userData.style,
        materialColor: 'ff8a2a',
        materialMetalness: copperMaterial.metalness,
        materialRoughness: copperMaterial.roughness,
        panelCount: bridgePanels.length,
        motionMode: 'alternating-cross-track-v-cuboids',
        initialRaisedSide: 'left',
        removedDecorations: true,
        laneOffset: placement.laneOffset ?? null,
        requestedLaneOffset: placement.requestedLaneOffset ?? null,
        localTrackWidth: placement.localTrackWidth ?? null,
        railClearance: placement.railClearance ?? null,
        slopeFit: placement.slopeFit ?? null,
        containedWithinRails: placement.localTrackWidth
          ? Math.abs(placement.laneOffset ?? 0) + bridgeWidth / 2 <= placement.localTrackWidth / 2 - (placement.railClearance ?? 0)
          : null,
      },
      tiltAmplitude: liftAmplitude,
      sweepSpeed,
      tiltAngle: 0,
      bridgeLiftPhase: 0,
      leftPanelLift: 0,
      rightPanelLift: 0,
      pulse: 0,
      lastHitBy: null,
    };
    bridgePanels.forEach((panel) => {
      const center = trackSurface.clone().add(this.localToWorldOffsetOnSlope(panel.localX, deckY + panel.currentLift, panel.localZ, yaw, pitch));
      this.setSlopeRollBodyTransform(panel.body, center, yaw, pitch, panel.currentRoll);
      panel.body.aabbNeedsUpdate = true;
    });
    obstacle.leftPanelLift = bridgePanels.find((panel) => panel.side === 'left')?.currentLift ?? 0;
    obstacle.rightPanelLift = bridgePanels.find((panel) => panel.side === 'right')?.currentLift ?? 0;
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createSplitterForkObstacle(trackSurface, yaw, pitch, material, placement = {}) {
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    group.userData.visualStyle = 'y-shaped-neon-splitter-fork-two-exit-guide-rails';
    this.trackGroup.add(group);

    const chromeMat = material.userData?.chromeMaterial || new THREE.MeshPhysicalMaterial({ color: 0xe6f2ff, roughness: 0.1, metalness: 0.92, clearcoat: 1, clearcoatRoughness: 0.04 });
    const cyanMat = new THREE.MeshPhysicalMaterial({ color: 0x23f7ff, roughness: 0.12, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x00a5c8, emissiveIntensity: 0.62 });
    const magentaMat = new THREE.MeshPhysicalMaterial({ color: 0xff4ecb, roughness: 0.13, metalness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x8f145f, emissiveIntensity: 0.58 });
    const yellowMat = material.userData?.yellowInsert || new THREE.MeshPhysicalMaterial({ color: 0xffd166, roughness: 0.16, metalness: 0.06, clearcoat: 1, emissive: 0x7a4a00, emissiveIntensity: 0.46 });
    const redMat = material.userData?.redInsert || new THREE.MeshPhysicalMaterial({ color: 0xff3864, roughness: 0.16, metalness: 0.06, clearcoat: 1, emissive: 0x79001c, emissiveIntensity: 0.46 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x5bfff2, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

    const splitterWidth = placement.splitterWidth || 4.8;
    const stemLength = 2.35;
    const branchLength = 2.55;
    const railHeight = 0.5;
    const railDepth = 0.2;
    const railY = 0.34;
    const branchAngle = 0.5;
    const branchForwardZ = 1.0;
    const branchSideX = 1.08;
    const noseRadius = 0.34;
    const exitMarkerZ = 2.26;
    const bodies = [];
    const rails = [];

    const centerGuide = new THREE.Mesh(new THREE.ConeGeometry(noseRadius, 0.82, 3), yellowMat);
    centerGuide.position.set(0, 0.39, -0.42);
    centerGuide.rotation.set(Math.PI / 2, 0, Math.PI / 6);
    centerGuide.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(centerGuide);

    const makeRail = (spec) => {
      const railGroup = new THREE.Group();
      railGroup.position.set(spec.x, railY, spec.z);
      railGroup.rotation.y = spec.localYaw;
      group.add(railGroup);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(spec.length, railHeight, railDepth), spec.material);
      rail.castShadow = PERFORMANCE_TUNING.shadows;
      rail.receiveShadow = PERFORMANCE_TUNING.shadows;
      railGroup.add(rail);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(spec.length * 0.94, 0.08, railDepth * 1.28), chromeMat);
      cap.position.y = railHeight / 2 + 0.06;
      cap.castShadow = PERFORMANCE_TUNING.shadows;
      railGroup.add(cap);

      const glow = new THREE.Mesh(new THREE.PlaneGeometry(spec.length * 0.92, railHeight * 1.25), glowMat.clone());
      glow.position.set(0, 0.02, -railDepth / 2 - 0.012);
      glow.rotation.x = -Math.PI / 2;
      glow.renderOrder = 36;
      railGroup.add(glow);

      const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
      const shape = new CANNON.Box(new CANNON.Vec3(spec.length / 2, railHeight / 2, railDepth / 2));
      shape.collisionResponse = false;
      body.addShape(shape);
      body.collisionResponse = false;
      const bodyCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(spec.x, railY, spec.z, yaw, pitch));
      this.setSlopeBodyTransform(body, bodyCenter, yaw, pitch, spec.localYaw);
      this.addObstacleBody(body, group);
      bodies.push(body);
      const record = { ...spec, group: railGroup, mesh: rail, cap, glow, body, center: bodyCenter };
      rails.push(record);
      return record;
    };

    makeRail({ index: 0, role: 'left-entry', x: -0.88, z: -0.76, length: stemLength, localYaw: 0, branchSide: -1, material: cyanMat });
    makeRail({ index: 1, role: 'right-entry', x: 0.88, z: -0.76, length: stemLength, localYaw: 0, branchSide: 1, material: cyanMat });
    makeRail({ index: 2, role: 'left-exit', x: -branchSideX, z: branchForwardZ, length: branchLength, localYaw: -branchAngle, branchSide: -1, material: magentaMat });
    makeRail({ index: 3, role: 'right-exit', x: branchSideX, z: branchForwardZ, length: branchLength, localYaw: branchAngle, branchSide: 1, material: magentaMat });

    [-1, 1].forEach((side) => {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.58, 24), side < 0 ? yellowMat : redMat);
      marker.position.set(side * Math.min(splitterWidth * 0.34, 1.85), 0.55, exitMarkerZ);
      marker.rotation.set(Math.PI / 2, 0, 0);
      marker.castShadow = PERFORMANCE_TUNING.shadows;
      group.add(marker);
    });

    const center = trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, railY, 0.34, yaw, pitch));
    this.obstacleMeshes.push(group);
    const splitterForkDimensions = {
      splitterWidth,
      stemLength,
      branchLength,
      railHeight,
      railDepth,
      railY,
      branchAngle,
      branchAngleDegrees: Number(THREE.MathUtils.radToDeg(branchAngle).toFixed(1)),
      exitCount: 2,
      railCount: rails.length,
      colliderCount: bodies.length,
      colliderSensor: true,
      collisionResponse: false,
      branchRoles: rails.map((rail) => rail.role),
      laneOffset: placement.laneOffset ?? null,
      requestedLaneOffset: placement.requestedLaneOffset ?? null,
      localTrackWidth: placement.localTrackWidth ?? null,
      railClearance: placement.railClearance ?? null,
      railContainmentHalfWidth: placement.railContainmentHalfWidth ?? splitterWidth / 2,
      containedWithinRails: placement.localTrackWidth
        ? Math.abs(placement.laneOffset ?? 0) + splitterWidth / 2 <= placement.localTrackWidth / 2 - (placement.railClearance ?? 0)
        : null,
    };
    const obstacle = {
      type: 'splitterFork',
      kind: 'splitterFork',
      trackSurface: trackSurface.clone(),
      center,
      radius: PINBALL_PHYSICS.splitterForkRadius,
      impulse: PINBALL_PHYSICS.splitterForkImpulse,
      cooldown: new Map(),
      group,
      centerGuide,
      rails,
      body: bodies[0] || null,
      bodies,
      trackSlopePitch: pitch,
      trackYaw: yaw,
      splitterForkDimensions,
      splitterForwardBias: PINBALL_PHYSICS.splitterForkForwardBias,
      splitterSideBias: PINBALL_PHYSICS.splitterForkSideBias,
      splitterMinSideSpeed: PINBALL_PHYSICS.splitterForkMinSideSpeed,
      cooldownSeconds: 0.16,
      rescueForwardSpeed: 3.2,
      visualStyle: 'y-shaped-neon-splitter-fork-two-exit-guide-rails',
      textureStyle: 'cyan-entry-magenta-y-fork-chrome-caps-yellow-red-exit-markers',
      pulse: 0,
      lastHitBy: null,
      lastSplitterBranch: null,
      lastSplitterRailIndex: null,
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createOrbitRingObstacle(trackSurface, yaw, pitch, material, placement = {}) {
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    group.userData.visualStyle = 'open-half-orbit-guide-ring';
    this.trackGroup.add(group);

    const chromeMaterial = material.userData?.chromeMaterial || material;
    const insertMaterial = material.userData?.insertMaterial || material;
    const orbitRadius = 1.8;
    const arcDegrees = 170;
    const arcRadians = THREE.MathUtils.degToRad(arcDegrees);
    const segmentCount = 7;
    const railTubeRadius = 0.08;
    const railY = 0.78;
    const guideY = 0.22;
    const colliderWidth = 0.24;
    const colliderHeight = 0.18;
    const colliderDepth = 0.42;
    const entranceGapRadians = THREE.MathUtils.degToRad(34);
    const direction = this.rng() < 0.5 ? -1 : 1;
    const bodies = [];
    const guideSegments = [];
    const orbitPoints = [];

    for (let index = 0; index < segmentCount; index += 1) {
      const t = segmentCount === 1 ? 0.5 : index / (segmentCount - 1);
      const angle = -arcRadians / 2 + t * arcRadians;
      const x = Math.sin(angle) * orbitRadius;
      const z = (Math.cos(angle) - 0.15) * orbitRadius;
      orbitPoints.push(new THREE.Vector3(x, railY, z));
      const segment = new THREE.Mesh(new THREE.BoxGeometry(colliderWidth, colliderHeight, colliderDepth), material);
      segment.position.set(x, guideY, z);
      segment.rotation.y = angle * direction;
      segment.castShadow = PERFORMANCE_TUNING.shadows;
      segment.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(segment);

      const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
      const shape = new CANNON.Box(new CANNON.Vec3(colliderWidth / 2, colliderHeight / 2, colliderDepth / 2));
      shape.collisionResponse = false;
      body.addShape(shape);
      body.collisionResponse = false;
      const bodyCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(x, guideY, z, yaw, pitch));
      this.setSlopeBodyTransform(body, bodyCenter, yaw, pitch, segment.rotation.y);
      this.world.addBody(body);
      this.obstacleBodies.push(body);
      guideSegments.push({ index, mesh: segment, body, localX: x, localY: guideY, localZ: z, localYaw: segment.rotation.y, center: bodyCenter });
      bodies.push(body);
    }

    const curve = new THREE.CatmullRomCurve3(orbitPoints);
    const railGeometry = new THREE.TubeGeometry(curve, 48, railTubeRadius, 10, false);
    const rail = new THREE.Mesh(railGeometry, chromeMaterial);
    rail.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(rail);

    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x50ffe7, transparent: true, opacity: 0.58, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, railTubeRadius * 2.8, 12, false), glowMaterial);
    glow.renderOrder = 5;
    group.add(glow);

    [-1, 1].forEach((side) => {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 20), insertMaterial);
      const angle = side * (arcRadians / 2 + entranceGapRadians * 0.18);
      marker.position.set(Math.sin(angle) * orbitRadius, railY + 0.08, (Math.cos(angle) - 0.15) * orbitRadius);
      marker.rotation.set(Math.PI / 2, angle, 0, 'YXZ');
      marker.castShadow = PERFORMANCE_TUNING.shadows;
      group.add(marker);
    });

    this.obstacleMeshes.push(group);
    const obstacleCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, guideY, orbitRadius * 0.34, yaw, pitch));
    const orbitRingDimensions = {
      orbitRadius,
      arcDegrees,
      segmentCount,
      colliderWidth,
      colliderHeight,
      colliderDepth,
      railTubeRadius,
      guideY,
      railY,
      colliderSensor: true,
      collisionResponse: false,
      entranceGapDegrees: Number(THREE.MathUtils.radToDeg(entranceGapRadians).toFixed(1)),
      direction,
      laneOffset: placement.laneOffset ?? null,
      requestedLaneOffset: placement.requestedLaneOffset ?? null,
      localTrackWidth: placement.localTrackWidth ?? null,
      railClearance: placement.railClearance ?? null,
      railContainmentHalfWidth: placement.railContainmentHalfWidth ?? orbitRadius + colliderWidth / 2,
      containedWithinRails: placement.localTrackWidth
        ? Math.abs(placement.laneOffset ?? 0) + (placement.railContainmentHalfWidth ?? orbitRadius + colliderWidth / 2) <= placement.localTrackWidth / 2 - (placement.railClearance ?? 0)
        : null,
    };
    const obstacle = {
      type: 'orbitRing',
      kind: 'orbitRing',
      trackSurface: trackSurface.clone(),
      center: obstacleCenter,
      radius: PINBALL_PHYSICS.orbitRingRadius,
      impulse: PINBALL_PHYSICS.orbitRingImpulse,
      cooldown: new Map(),
      group,
      rail,
      glow,
      guideSegments,
      body: bodies[0] || null,
      bodies,
      trackSlopePitch: pitch,
      trackYaw: yaw,
      orbitRingDimensions,
      orbitDirection: direction,
      orbitGuideStrength: PINBALL_PHYSICS.orbitRingGuideStrength,
      orbitForwardBias: PINBALL_PHYSICS.orbitRingForwardBias,
      cooldownSeconds: 1.2,
      visualStyle: 'open-half-orbit-guide-ring-with-neon-rail',
      textureStyle: 'bright-cyan-chrome-half-ring-sensor-guide-boost-category-open-exits-low-nonblocking-colliders',
      glowBaseOpacity: 0.42,
      glowPulseOpacity: 0.56,
      glowPulseScale: 0.18,
      pulse: 0,
      lastHitBy: null,
      lastOrbitSegmentIndex: null,
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createPendulumHammerObstacle(trackSurface, yaw, pitch, material, placement = {}) {
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    this.trackGroup.add(group);

    const chromeMaterial = material.userData?.chromeMaterial || material;
    const insertMaterial = material.userData?.insertMaterial || material;
    const dimensions = {
      hammerWidth: placement.hammerWidth ?? 5.0,
      hammerLength: placement.hammerLength ?? 4.2,
      pivotHeight: 2.35,
      armLength: 2.15,
      armRadius: 0.09,
      headWidth: Math.min(1.55, (placement.hammerWidth ?? 5.0) * 0.28),
      headHeight: 0.72,
      headDepth: 0.86,
      sweepSpeed: PINBALL_PHYSICS.pendulumHammerSweepSpeed,
      swingAmplitude: PINBALL_PHYSICS.pendulumHammerSwingAmplitude,
      headRestY: 1.08,
      headForwardZ: 0.1,
      colliderRadius: 0.92,
    };
    dimensions.railClearance = placement.railClearance ?? 0.48;
    dimensions.localTrackWidth = placement.localTrackWidth ?? null;
    dimensions.railContainmentHalfWidth = placement.railContainmentHalfWidth ?? dimensions.hammerWidth / 2;
    dimensions.containedWithinRails = dimensions.localTrackWidth == null
      ? true
      : Math.abs(placement.laneOffset ?? 0) + dimensions.hammerWidth / 2 <= dimensions.localTrackWidth / 2 - dimensions.railClearance + 1e-6;

    const frameBeam = new THREE.Mesh(new THREE.BoxGeometry(dimensions.hammerWidth, 0.18, 0.28), chromeMaterial);
    frameBeam.position.set(0, dimensions.pivotHeight, -0.08);
    frameBeam.castShadow = PERFORMANCE_TUNING.shadows;
    frameBeam.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(frameBeam);

    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, dimensions.pivotHeight, 0.22), chromeMaterial);
      post.position.set(side * dimensions.hammerWidth / 2, dimensions.pivotHeight / 2, -0.08);
      post.castShadow = PERFORMANCE_TUNING.shadows;
      post.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(post);
    });

    const pivotGroup = new THREE.Group();
    pivotGroup.position.set(0, dimensions.pivotHeight, 0);
    group.add(pivotGroup);

    const pivotAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, dimensions.hammerWidth * 0.55, 18), chromeMaterial);
    pivotAxle.rotation.z = Math.PI / 2;
    pivotAxle.castShadow = PERFORMANCE_TUNING.shadows;
    pivotGroup.add(pivotAxle);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(dimensions.armRadius, dimensions.armRadius, dimensions.armLength, 14), chromeMaterial);
    arm.position.y = -dimensions.armLength / 2;
    arm.rotation.x = Math.PI / 2;
    arm.castShadow = PERFORMANCE_TUNING.shadows;
    pivotGroup.add(arm);

    const head = new THREE.Mesh(new THREE.BoxGeometry(dimensions.headWidth, dimensions.headHeight, dimensions.headDepth), material);
    head.position.set(0, -dimensions.armLength, dimensions.headForwardZ);
    head.castShadow = PERFORMANCE_TUNING.shadows;
    head.receiveShadow = PERFORMANCE_TUNING.shadows;
    pivotGroup.add(head);

    const faceGlow = new THREE.Mesh(new THREE.BoxGeometry(dimensions.headWidth * 0.92, dimensions.headHeight * 0.72, 0.035), insertMaterial);
    faceGlow.position.set(0, -dimensions.armLength, dimensions.headForwardZ - dimensions.headDepth / 2 - 0.025);
    faceGlow.castShadow = false;
    pivotGroup.add(faceGlow);

    const sweepArc = new THREE.Mesh(
      new THREE.TorusGeometry(dimensions.armLength * 0.72, 0.025, 6, 48, Math.PI * 1.18),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    sweepArc.position.set(0, dimensions.pivotHeight - dimensions.armLength * 0.48, -0.02);
    sweepArc.rotation.z = Math.PI * 0.41;
    sweepArc.renderOrder = 36;
    group.add(sweepArc);

    const headLocalCenter = new THREE.Vector3(0, dimensions.pivotHeight - dimensions.armLength, dimensions.headForwardZ);
    const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(dimensions.headWidth / 2, dimensions.headHeight / 2, dimensions.headDepth / 2)));
    const obstacleCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(headLocalCenter.x, headLocalCenter.y, headLocalCenter.z, yaw, pitch));
    this.setSlopeRollBodyTransform(body, obstacleCenter, yaw, pitch, 0);
    this.addObstacleBody(body, group);

    const obstacle = {
      type: 'pendulumHammer',
      trackSurface: trackSurface.clone(),
      center: obstacleCenter.clone(),
      radius: PINBALL_PHYSICS.pendulumHammerRadius,
      impulse: PINBALL_PHYSICS.pendulumHammerImpulse,
      group,
      pivotGroup,
      arm,
      head,
      faceGlow,
      sweepArc,
      body,
      cooldown: new Map(),
      cooldownSeconds: 0.38,
      trackYaw: yaw,
      trackSlopePitch: pitch,
      localYaw: 0,
      pendulumHammerDimensions: dimensions,
      sweepSpeed: dimensions.sweepSpeed,
      swingAmplitude: dimensions.swingAmplitude,
      swingAngle: 0,
      lastSwingAngle: 0,
      lastHitBy: null,
      laneOffset: placement.laneOffset ?? 0,
      requestedLaneOffset: placement.requestedLaneOffset ?? placement.laneOffset ?? 0,
      containedWithinRails: dimensions.containedWithinRails,
      slopeFit: placement.slopeFit ?? null,
      visualStyle: 'overhead-swinging-arcade-pendulum-hammer',
      textureStyle: 'brass-chrome-hazard-hammer-with-neon-sweep-arc',
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createMovingGateObstacle(trackSurface, yaw, pitch, swingDirection = 1, material, placement = {}) {
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    group.userData.visualStyle = 'frameless-wide-guillotine-gate';
    this.trackGroup.add(group);

    const insertMat = material.userData?.insertMaterial || new THREE.MeshPhysicalMaterial({ color: 0xff3864, roughness: 0.18, metalness: 0.04, clearcoat: 1, emissive: 0x79001c, emissiveIntensity: 0.42 });
    const bladeMat = new THREE.MeshPhysicalMaterial({ color: 0xf7f4ea, roughness: 0.24, metalness: 0.02, clearcoat: 0.72, emissive: 0xffffff, emissiveIntensity: 0.08 });
    const gateWidth = 5.025;
    const bladeWidth = gateWidth;
    const bladeHeight = 2;
    const bladeDepth = 0.32;
    const closedY = -1.08;
    const openY = 0.56;
    const liftAmplitude = openY - closedY;
    const cycleSpeed = Math.abs(PINBALL_PHYSICS.movingGateSweepSpeed) * 0.82;
    const colliderHalfExtents = new CANNON.Vec3(bladeWidth / 2, bladeHeight / 2, bladeDepth / 2);

    const bladeGroup = new THREE.Group();
    bladeGroup.position.set(0, closedY, 0.02);
    group.add(bladeGroup);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(bladeWidth, bladeHeight, bladeDepth), bladeMat);
    blade.castShadow = PERFORMANCE_TUNING.shadows;
    blade.receiveShadow = PERFORMANCE_TUNING.shadows;
    bladeGroup.add(blade);

    const dangerGlowMat = new THREE.MeshBasicMaterial({ color: 0xff174f, transparent: true, opacity: 0.48, depthWrite: false, blending: THREE.AdditiveBlending });
    const dangerGlow = new THREE.Mesh(new THREE.BoxGeometry(bladeWidth + 0.44, bladeHeight + 0.28, 0.05), dangerGlowMat);
    dangerGlow.position.set(0, 0, -bladeDepth / 2 - 0.035);
    dangerGlow.renderOrder = 6;
    bladeGroup.add(dangerGlow);

    const lowerLip = new THREE.Mesh(new THREE.BoxGeometry(bladeWidth + 0.12, 0.08, bladeDepth * 1.12), insertMat);
    lowerLip.position.set(0, -bladeHeight / 2 - 0.045, 0.01);
    lowerLip.castShadow = PERFORMANCE_TUNING.shadows;
    bladeGroup.add(lowerLip);

    const warningStripes = [];
    [-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42].forEach((xFactor, index) => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.13, bladeHeight * 0.92, 0.045), insertMat);
      stripe.position.set(bladeWidth * xFactor, 0.01, -bladeDepth / 2 - 0.055);
      stripe.rotation.z = 0.48;
      stripe.castShadow = PERFORMANCE_TUNING.shadows;
      bladeGroup.add(stripe);
      warningStripes.push(stripe);
    });

    const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    body.addShape(new CANNON.Box(colliderHalfExtents));
    const obstacleCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, closedY, 0.02, yaw, pitch));
    this.setSlopeBodyTransform(body, obstacleCenter, yaw, pitch);
    this.addObstacleBody(body, group);

    const obstacle = {
      type: 'movingGate',
      kind: 'movingGate',
      trackSurface: trackSurface.clone(),
      center: obstacleCenter,
      radius: Math.max(PINBALL_PHYSICS.movingGateRadius, bladeWidth / 2 + 0.55),
      impulse: PINBALL_PHYSICS.movingGateImpulse,
      cooldown: new Map(),
      group,
      bladeGroup,
      blade,
      dangerGlow,
      lowerLip,
      warningStripes,
      body,
      trackSlopePitch: pitch,
      trackYaw: yaw,
      visualStyle: 'floor-rising-wide-guillotine-gate',
      textureStyle: 'white-warning-blade-rises-from-track-floor-dense-danger-glow-no-frame-no-hit-ring',
      movingGateMode: 'floor-rising-guillotine',
      movingGateDimensions: {
        gateWidth,
        bladeWidth,
        bladeHeight,
        bladeDepth,
        closedY,
        openY,
        liftAmplitude,
        cycleSpeed,
        timingWindow: 'blade-rises-from-track-floor-then-retracts-below-surface',
        dangerGlowFacing: 'approach-negative-local-z',
        laneOffset: placement.laneOffset ?? null,
        requestedLaneOffset: placement.requestedLaneOffset ?? null,
        localTrackWidth: placement.localTrackWidth ?? null,
        railClearance: placement.railClearance ?? null,
        railContainmentHalfWidth: placement.railContainmentHalfWidth ?? bladeWidth / 2,
        containedWithinRails: placement.localTrackWidth
          ? Math.abs(placement.laneOffset ?? 0) + bladeWidth / 2 <= placement.localTrackWidth / 2 - (placement.railClearance ?? 0)
          : null,
      },
      swingDirection,
      swingAmplitude: liftAmplitude,
      sweepSpeed: cycleSpeed,
      swingAngle: 0,
      openAmount: 0,
      bladeY: closedY,
      pulse: 0,
      lastHitBy: null,
      lastSwingAngle: 0,
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  createDropTargetObstacle(trackSurface, yaw, pitch, material, rubberMaterial) {
    const group = new THREE.Group();
    group.position.copy(trackSurface);
    this.applyTrackSlopeRotation(group, yaw, pitch);
    this.trackGroup.add(group);
    const targets = [];
    const bodies = [];
    const dropTargetScale = 2;
    const targetWidth = 0.64 * dropTargetScale;
    const targetBaseHeight = 1.38 * dropTargetScale;
    const targetHeightStep = 0.04 * dropTargetScale;
    const targetDepth = 0.34 * dropTargetScale;
    const targetBaseY = 0.78 * dropTargetScale;
    const targetTrackClearance = 0.08 * dropTargetScale;
    const targetSpacing = 0.62 * dropTargetScale;
    const targetDropDistance = 0.42 * dropTargetScale;
    const targetDropStep = 0.03 * dropTargetScale;
    const rubberWidth = 1.7 * dropTargetScale;
    const rubberHeight = 0.18 * dropTargetScale;
    const rubberDepth = 0.22 * dropTargetScale;
    const rubberY = 0.18 * dropTargetScale;
    const rubberZ = -0.42 * dropTargetScale;
    const signY = 1.92 * dropTargetScale;
    const signZ = -0.62 * dropTargetScale;
    const signScaleX = 2.35 * dropTargetScale;
    const signScaleY = 0.88 * dropTargetScale;
    // Local +X renders on the viewer's right from the default/broadcast approach,
    // so store labels in local-space reverse order to make the visible bank read W I N.
    const labels = ['N', 'I', 'W'];
    const targetXs = [-targetSpacing, 0, targetSpacing];
    targetXs.forEach((x, index) => {
      const targetMaterial = material.clone();
      const faceTexture = this.createDropTargetFaceTexture(labels[index]);
      targetMaterial.map = faceTexture;
      targetMaterial.emissiveIntensity = 0.5;
      targetMaterial.needsUpdate = true;
      const targetHeight = targetBaseHeight - index * targetHeightStep;
      const target = new THREE.Mesh(new THREE.BoxGeometry(targetWidth, targetHeight, targetDepth), targetMaterial);
      target.position.set(x, targetBaseY, 0);
      target.rotation.x = -0.08;
      target.castShadow = PERFORMANCE_TUNING.shadows;
      target.receiveShadow = PERFORMANCE_TUNING.shadows;
      target.userData = {
        dropTargetIndex: index,
        dropTargetLabel: labels[index],
        baseY: target.position.y,
        baseRotationX: target.rotation.x,
        baseScale: target.scale.clone(),
      };
      group.add(target);
      const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(targetWidth / 2, targetHeight / 2 - 0.03 * dropTargetScale, targetDepth / 2)));
      const bodyCenter = trackSurface.clone().add(this.localToWorldOffsetOnSlope(x, targetBaseY, 0, yaw, pitch));
      this.setSlopeBodyTransform(body, bodyCenter, yaw, pitch - 0.08);
      this.addObstacleBody(body, target);
      targets.push({
        index,
        label: labels[index],
        x,
        mesh: target,
        body,
        bodyCenter,
        dropped: false,
        progress: 0,
        hitBy: null,
        hitAt: null,
        bodyActive: true,
      });
      bodies.push(body);
    });
    const rubber = new THREE.Mesh(new THREE.BoxGeometry(rubberWidth, rubberHeight, rubberDepth), rubberMaterial);
    rubber.position.set(0, rubberY, rubberZ);
    rubber.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(rubber);

    const obstacle = {
      type: 'dropTarget',
      trackSurface: trackSurface.clone(),
      center: trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, targetBaseY, 0, yaw, pitch)),
      direction: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize(),
      radius: PINBALL_PHYSICS.dropTargetRadius * dropTargetScale,
      impulse: PINBALL_PHYSICS.dropTargetImpulse,
      upImpulse: PINBALL_PHYSICS.dropTargetUpImpulse,
      singleUseBounce: PINBALL_PHYSICS.dropTargetSingleUse,
      bounceMode: PINBALL_PHYSICS.dropTargetBounceMode,
      resetSeconds: PINBALL_PHYSICS.dropTargetResetSeconds,
      dropSpeed: PINBALL_PHYSICS.dropTargetDropSpeed,
      resetSpeed: PINBALL_PHYSICS.dropTargetResetSpeed,
      bankBonusImpulse: PINBALL_PHYSICS.dropTargetBankBonusImpulse,
      cooldown: new Map(),
      group,
      targets,
      bodies,
      rubber,
      dropTargetScale,
      dropTargetDimensions: {
        targetWidth,
        targetBaseHeight,
        targetDepth,
        targetBaseY,
        targetTrackClearance,
        targetSpacing,
        targetDropDistance,
        targetDropStep,
        rubberWidth,
      },
      trackSlopePitch: pitch,
      dropped: false,
      droppedCount: 0,
      bankCleared: false,
      resetAt: null,
      lastTargetIndex: null,
      lastTargetLabel: null,
      lastBankClearBy: null,
      lastBankClearAt: null,
      visualStyle: 'three-bank-resetting-drop-target-with-clear-bonus',
      textureStyle: 'decorative-drop-target-faces-dynamic-bank-sign-removes-hit-letters',
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  updatePinballObstacles(delta) {
    if (!this.pinballObstacles.length) return;
    const animationWindow = this.getObstacleAnimationCullingWindow();
    this.lastObstacleAnimationCullingDebug = this.getObstacleAnimationCullingDebug(animationWindow);
    this.pinballObstacles.forEach((obstacle) => {
      const animationState = this.getObstacleAnimationState(obstacle, animationWindow);
      const animationActive = animationState.active;
      obstacle.animationState = animationState.state;
      obstacle.animationActive = animationActive;
      obstacle.animationDistanceAhead = animationState.distanceAhead;
      obstacle.animationDistanceBehindBack = animationState.distanceBehindBack;
      if (animationActive && obstacle.type === 'spinnerGate') {
        obstacle.spinAngle = (obstacle.spinAngle || 0) + delta * obstacle.spinnerSpeed;
        obstacle.spinnerArms?.forEach((arm, index) => {
          arm.rotation.y = obstacle.spinAngle + (Math.PI * 2 * index) / 3;
        });
      }
      if (animationActive && obstacle.type === 'pendulumHammer') {
        const dimensions = obstacle.pendulumHammerDimensions || {};
        const phase = this.elapsed * Math.abs(obstacle.sweepSpeed || PINBALL_PHYSICS.pendulumHammerSweepSpeed) + (obstacle.distributionZoneIndex || 0) * 0.67;
        const swingAngle = Math.sin(phase) * (obstacle.swingAmplitude || PINBALL_PHYSICS.pendulumHammerSwingAmplitude);
        obstacle.swingAngle = swingAngle;
        obstacle.lastSwingAngle = swingAngle;
        if (obstacle.pivotGroup) obstacle.pivotGroup.rotation.z = swingAngle;
        const pivotY = dimensions.pivotHeight ?? 2.35;
        const armLength = dimensions.armLength ?? 2.15;
        const headZ = dimensions.headForwardZ ?? 0.1;
        const localX = Math.sin(swingAngle) * armLength;
        const localY = pivotY - Math.cos(swingAngle) * armLength;
        const localZ = headZ;
        const center = obstacle.trackSurface.clone().add(this.localToWorldOffsetOnSlope(localX, localY, localZ, obstacle.trackYaw || 0, obstacle.trackSlopePitch || 0));
        obstacle.center.copy(center);
        if (obstacle.body) {
          this.setSlopeRollBodyTransform(obstacle.body, center, obstacle.trackYaw || 0, obstacle.trackSlopePitch || 0, swingAngle);
          obstacle.body.aabbNeedsUpdate = true;
        }
        if (obstacle.faceGlow?.material) obstacle.faceGlow.material.opacity = 0.55 + Math.abs(Math.sin(phase)) * 0.35;
      }
      if (animationActive && obstacle.type === 'movingGate') {
        const dimensions = obstacle.movingGateDimensions || {};
        const cycleSpeed = Math.abs(obstacle.sweepSpeed || dimensions.cycleSpeed || PINBALL_PHYSICS.movingGateSweepSpeed);
        const phase = this.elapsed * cycleSpeed + (obstacle.distributionZoneIndex || 0) * 0.73;
        const wave = (Math.sin(phase) + 1) / 2;
        const openAmount = THREE.MathUtils.smoothstep(wave, 0.18, 0.86);
        const closedY = dimensions.closedY ?? 0.48;
        const openY = dimensions.openY ?? 1.42;
        const bladeY = THREE.MathUtils.lerp(closedY, openY, openAmount);
        obstacle.openAmount = openAmount;
        obstacle.bladeY = bladeY;
        obstacle.swingAngle = openAmount;
        obstacle.lastSwingAngle = openAmount;
        if (obstacle.bladeGroup) obstacle.bladeGroup.position.y = bladeY;
        if (obstacle.body) {
          obstacle.center.copy(obstacle.trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, bladeY, 0.02, obstacle.trackYaw || 0, obstacle.trackSlopePitch || 0)));
          this.setSlopeBodyTransform(obstacle.body, obstacle.center, obstacle.trackYaw || 0, obstacle.trackSlopePitch || 0);
          obstacle.body.aabbNeedsUpdate = true;
        }
        if (obstacle.dangerGlow?.material) {
          obstacle.dangerGlow.material.opacity = 0.28 + (1 - openAmount) * 0.46;
        }
        obstacle.warningStripes?.forEach((stripe, index) => {
          stripe.rotation.z = 0.48 + Math.sin(phase * 2.4 + index) * 0.04;
        });
      }
      if (animationActive && obstacle.type === 'dropTarget') {
        this.updateDropTargetBank(obstacle, delta);
      }
      if (animationActive && obstacle.type === 'tiltBridge') {
        const phase = this.elapsed * Math.abs(obstacle.sweepSpeed || PINBALL_PHYSICS.tiltBridgeSweepSpeed) + (obstacle.distributionZoneIndex || 0) * 0.61;
        const direction = Math.sign(obstacle.sweepSpeed || 1) || 1;
        const motionPhase = phase * direction;
        const liftAmplitude = obstacle.tiltBridgeDimensions?.liftAmplitude ?? obstacle.tiltAmplitude ?? 1.0;
        const baseRoll = obstacle.tiltBridgeDimensions?.baseRoll ?? 0.16;
        const deckY = obstacle.tiltBridgeDimensions?.deckY ?? -0.6;
        const wave = (Math.cos(motionPhase) + 1) / 2;
        obstacle.bridgeLiftPhase = wave;
        obstacle.tiltAngle = (wave - 0.5) * 2 * baseRoll;
        if (obstacle.bridgePanels?.length) {
          obstacle.bridgePanels.forEach((panel) => {
            const panelWave = panel.side === 'left' ? wave : 1 - wave;
            const lift = panelWave * liftAmplitude;
            const rollSign = panel.sign || (panel.side === 'left' ? -1 : 1);
            const localRoll = rollSign * (baseRoll + panelWave * baseRoll * 0.8);
            panel.currentLift = lift;
            panel.currentRoll = localRoll;
            panel.group.position.set(panel.localX || 0, deckY + lift, panel.localZ || 0);
            panel.group.rotation.set(0, 0, localRoll);
            if (panel.body) {
              const center = obstacle.trackSurface.clone().add(this.localToWorldOffsetOnSlope(panel.localX || 0, deckY + lift, panel.localZ || 0, obstacle.trackYaw || 0, obstacle.trackSlopePitch || 0));
              this.setSlopeRollBodyTransform(panel.body, center, obstacle.trackYaw || 0, obstacle.trackSlopePitch || 0, localRoll);
              panel.body.aabbNeedsUpdate = true;
            }
          });
          obstacle.leftPanelLift = obstacle.bridgePanels.find((panel) => panel.side === 'left')?.currentLift ?? 0;
          obstacle.rightPanelLift = obstacle.bridgePanels.find((panel) => panel.side === 'right')?.currentLift ?? 0;
          obstacle.center.copy(obstacle.trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, deckY + Math.max(obstacle.leftPanelLift, obstacle.rightPanelLift) * 0.5, 0, obstacle.trackYaw || 0, obstacle.trackSlopePitch || 0)));
        } else {
          const tiltAngle = Math.sin(phase) * (obstacle.tiltAmplitude || PINBALL_PHYSICS.tiltBridgeTiltAmplitude) * direction;
          obstacle.tiltAngle = tiltAngle;
          if (obstacle.bridgePivot) obstacle.bridgePivot.rotation.z = tiltAngle;
          if (obstacle.body) {
            obstacle.center.copy(obstacle.trackSurface.clone().add(this.localToWorldOffsetOnSlope(0, 0.18, 0, obstacle.trackYaw || 0, obstacle.trackSlopePitch || 0)));
            this.setSlopeRollBodyTransform(obstacle.body, obstacle.center, obstacle.trackYaw || 0, obstacle.trackSlopePitch || 0, tiltAngle);
            obstacle.body.aabbNeedsUpdate = true;
          }
        }
      }
      if (animationActive && obstacle.type === 'gongBumper') {
        if (obstacle.shake) {
          obstacle.shake = Math.max(0, obstacle.shake - delta * 4.8);
          obstacle.malletSwing = Math.max(0, (obstacle.malletSwing || 0) - delta * 3.6);
          const shakeWave = Math.sin((obstacle.shakeStartAt || 0) * 17 + this.elapsed * 42) * obstacle.shake;
          obstacle.gong?.rotation.set(Math.PI / 2 + shakeWave * 0.16, shakeWave * 0.1, shakeWave * 0.05);
          obstacle.rim?.rotation.set(Math.PI / 2 + shakeWave * 0.12, 0, 0);
          if (obstacle.malletGroup) {
            const rest = obstacle.malletRestRotation || obstacle.malletGroup.userData?.restRotation || { x: -0.22, y: 0.08, z: -0.72 };
            const swing = obstacle.malletSwing || 0;
            const swingStrike = Math.sin(Math.max(0, swing) * Math.PI) * 0.58;
            const vibration = Math.sin((obstacle.shakeStartAt || 0) * 19 + this.elapsed * 54) * obstacle.shake * 0.16;
            obstacle.malletGroup.rotation.set(rest.x, rest.y, rest.z - swingStrike - vibration);
          }
          obstacle.boss?.position.set(shakeWave * 0.035, 0.92, 0.12 + obstacle.shake * 0.04);
          if (obstacle.glow?.material) obstacle.glow.material.opacity = 0.28 + obstacle.shake * 0.52;
        } else {
          obstacle.gong?.rotation.set(Math.PI / 2, 0, 0);
          obstacle.rim?.rotation.set(Math.PI / 2, 0, 0);
          if (obstacle.malletGroup) {
            const rest = obstacle.malletRestRotation || obstacle.malletGroup.userData?.restRotation || { x: -0.22, y: 0.08, z: -0.72 };
            obstacle.malletGroup.rotation.set(rest.x, rest.y, rest.z);
          }
          obstacle.boss?.position.set(0, 0.92, 0.12);
          obstacle.malletSwing = 0;
          if (obstacle.glow?.material) obstacle.glow.material.opacity = 0.28;
        }
      }
      if (animationActive && obstacle.pulse) {
        obstacle.pulse = Math.max(0, obstacle.pulse - delta * 5.5);
        const scale = 1 + obstacle.pulse * 0.18;
        obstacle.mesh?.scale.set(scale, 1 + obstacle.pulse * 0.08, scale);
        obstacle.cap?.scale.set(scale, 0.42 + obstacle.pulse * 0.1, scale);
        obstacle.skirt?.scale.set(scale, scale, scale);
        obstacle.pins?.forEach((pin, index) => {
          const pinPulse = index === obstacle.lastHitPinIndex ? obstacle.pulse : obstacle.pulse * 0.55;
          const pinScale = 1 + pinPulse * 0.22;
          pin.group?.scale.set(pinScale, 1 + pinPulse * 0.12, pinScale);
          if (pin.halo?.material) pin.halo.material.opacity = 0.36 + pinPulse * 0.34;
        });
        if (obstacle.type === 'gongBumper') {
          const gongScale = 1 + obstacle.pulse * 0.12;
          obstacle.gong?.scale.set(gongScale, gongScale, 1 + obstacle.pulse * 0.04);
          obstacle.rim?.scale.setScalar(1 + obstacle.pulse * 0.16);
          obstacle.glow?.scale.setScalar(1 + obstacle.pulse * 0.32);
        }
        if (obstacle.type === 'orbitRing') {
          const ringScale = 1 + obstacle.pulse * 0.12;
          const glowPulseScale = obstacle.glowPulseScale ?? 0.18;
          obstacle.rail?.scale.set(ringScale, 1 + obstacle.pulse * 0.05, ringScale);
          obstacle.glow?.scale.set(ringScale + obstacle.pulse * glowPulseScale, 1 + obstacle.pulse * 0.1, ringScale + obstacle.pulse * glowPulseScale);
          if (obstacle.glow?.material) obstacle.glow.material.opacity = (obstacle.glowBaseOpacity ?? 0.42) + obstacle.pulse * (obstacle.glowPulseOpacity ?? 0.56);
          obstacle.guideSegments?.forEach((segment) => {
            const segmentPulse = segment.index === obstacle.lastOrbitSegmentIndex ? obstacle.pulse : obstacle.pulse * 0.42;
            segment.mesh?.scale.set(1 + segmentPulse * 0.1, 1 + segmentPulse * 0.08, 1 + segmentPulse * 0.1);
          });
        }
        if (obstacle.type === 'pendulumHammer') {
          const hammerPulse = 1 + obstacle.pulse * 0.16;
          obstacle.head?.scale.set(hammerPulse, 1 + obstacle.pulse * 0.08, hammerPulse);
          obstacle.sweepArc?.scale.setScalar(1 + obstacle.pulse * 0.22);
          if (obstacle.faceGlow?.material) obstacle.faceGlow.material.opacity = 0.58 + obstacle.pulse * 0.32;
        }
        if (obstacle.type === 'splitterFork') {
          obstacle.rails?.forEach((rail) => {
            const railPulse = rail.index === obstacle.lastSplitterRailIndex ? obstacle.pulse : obstacle.pulse * 0.38;
            rail.group?.scale.set(1 + railPulse * 0.08, 1 + railPulse * 0.12, 1 + railPulse * 0.08);
            if (rail.glow?.material) rail.glow.material.opacity = 0.24 + railPulse * 0.42;
          });
          const guideScale = 1 + obstacle.pulse * 0.16;
          obstacle.centerGuide?.scale.set(guideScale, guideScale, guideScale);
        }
      }
      this.marbleData.forEach((data) => {
        if (data.finished) return;
        const dx = data.body.position.x - obstacle.center.x;
        const dz = data.body.position.z - obstacle.center.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > obstacle.radius * obstacle.radius) return;
        const lastHit = obstacle.cooldown?.get(data.id) || -Infinity;
        if (this.elapsed - lastHit < (obstacle.cooldownSeconds ?? 0.32)) {
          if (obstacle.type !== 'splitterFork') return;
          const frame = this.getTrackFrameAt(Math.max(this.findClosestProgress(data.body.position).distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
          const forwardSpeed = data.body.velocity.x * frame.tangent.x + data.body.velocity.y * frame.tangent.y + data.body.velocity.z * frame.tangent.z;
          const horizontalSpeed = Math.hypot(data.body.velocity.x, data.body.velocity.z);
          if (forwardSpeed >= (obstacle.rescueForwardSpeed ?? 3.2) || horizontalSpeed >= 1.1) return;
        }
        if (obstacle.type === 'popBumper') this.applyPopBumperImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'pinBumper') this.applyPinBumperImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'gongBumper') this.applyGongBumperImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'slingshot') this.applySlingshotImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'spinnerGate') this.applySpinnerGateImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'movingGate') this.applyMovingGateImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'tiltBridge') this.applyTiltBridgeImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'pendulumHammer') this.applyPendulumHammerImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'orbitRing') this.applyOrbitRingImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'splitterFork') this.applySplitterForkImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'dropTarget') this.applyDropTargetHit(obstacle, data);
      });
    });
  }

  noteObstacleHit(data, obstacle, distance = null) {
    const hitDistance = distance ?? (data.driveDistance ?? data.distance ?? 0);
    const piece = this.trackPieces.find((trackPiece) => hitDistance >= trackPiece.startD && hitDistance <= trackPiece.endD);
    data.lastObstacleHitType = obstacle.type;
    data.lastObstacleHitDistance = Number(hitDistance.toFixed(2));
    data.lastObstacleHitProgress = this.trackLength ? clamp(hitDistance / this.trackLength, 0, 1) : 0;
    data.lastObstacleHitPieceIndex = piece?.index ?? null;
    data.lastObstacleHitPieceType = piece?.type || null;
    data.obstacleHitCount = (data.obstacleHitCount || 0) + 1;
    if (this.elapsed - (this.lastObstacleSfxAt || -Infinity) > 0.09) {
      this.lastObstacleSfxAt = this.elapsed;
      this.playObstacleHitSound(obstacle.kind || 'impact');
    }
  }

  applyPopBumperImpulse(obstacle, data, dx, dz) {
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    const nx = dx / dist;
    const nz = dz / dist;
    const impulse = obstacle.impulse;
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    const rawImpulse = new THREE.Vector3(nx * impulse, 0, nz * impulse);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.55);
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    this.pinballInteractions.popBumper += 1;
    this.spawnImpactEffect(obstacle.center, 0xff77b7, 'ring');
    this.pushBroadcastEvent('Bumper Blast', `${data.name} bumper hit`, { kind: 'obstacle', marbleId: data.id, distance: data.lastObstacleHitDistance, progress: data.lastObstacleHitProgress, lines: [`${data.name} bumper hit`, `${data.name} bounces wide`, `${data.name} rebounds`] });
  }

  applyPinBumperImpulse(obstacle, data, dx, dz) {
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const pins = obstacle.pins || [];
    let nearestPin = null;
    let nearestIndex = -1;
    let nearestDistSq = Infinity;
    pins.forEach((pin, index) => {
      const px = data.body.position.x - pin.center.x;
      const pz = data.body.position.z - pin.center.z;
      const pinDistSq = px * px + pz * pz;
      if (pinDistSq < nearestDistSq) {
        nearestDistSq = pinDistSq;
        nearestPin = pin;
        nearestIndex = index;
      }
    });

    const source = nearestPin?.center || obstacle.center;
    const sx = data.body.position.x - source.x;
    const sz = data.body.position.z - source.z;
    const dist = Math.max(0.001, Math.hypot(sx || dx, sz || dz));
    const radial = new THREE.Vector3((sx || dx) / dist, 0, (sz || dz) / dist);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    const forwardBias = frame.tangent.clone().multiplyScalar(obstacle.impulse * 0.28);
    const rawImpulse = radial.multiplyScalar(obstacle.impulse).add(forwardBias);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.42);
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    obstacle.lastHitPinIndex = nearestIndex;
    this.pinballInteractions.pinBumper += 1;
    this.spawnImpactEffect(source, nearestIndex % 2 ? 0xff4ecb : 0x35f6ff, 'spark');
    this.pushBroadcastEvent('Pin Bumper Pop', `${data.name} hits the pins`, {
      kind: 'obstacle',
      marbleId: data.id,
      distance: data.lastObstacleHitDistance,
      progress: data.lastObstacleHitProgress,
      lines: [`${data.name} hits the pins`, `${data.name} pops through traffic`, `${data.name} ricochets off the pins`],
    });
  }

  applyGongBumperImpulse(obstacle, data, dx, dz) {
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    const radial = new THREE.Vector3(dx / dist, 0, dz / dist);
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    const forwardBias = frame.tangent.clone().multiplyScalar(obstacle.impulse * 0.22);
    const rawImpulse = radial.multiplyScalar(obstacle.impulse).add(forwardBias);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.48);

    const packRadius = obstacle.packRadius || PINBALL_PHYSICS.gongBumperPackRadius;
    const packImpulse = obstacle.packImpulse || PINBALL_PHYSICS.gongBumperPackImpulse;
    let packShakeCount = 0;
    this.marbleData.forEach((other) => {
      if (!other || other.id === data.id || other.finished || !other.body?.position) return;
      const ox = other.body.position.x - obstacle.center.x;
      const oz = other.body.position.z - obstacle.center.z;
      const otherDist = Math.hypot(ox, oz);
      if (otherDist <= 0.001 || otherDist > packRadius) return;
      const falloff = 1 - otherDist / packRadius;
      const sideImpulse = new CANNON.Vec3((ox / otherDist) * packImpulse * falloff, 0.08 * falloff, (oz / otherDist) * packImpulse * falloff);
      other.body.applyImpulse(sideImpulse, other.body.position);
      other.body.wakeUp();
      packShakeCount += 1;
    });

    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    obstacle.shake = 1;
    obstacle.malletSwing = 1;
    obstacle.shakeStartAt = this.elapsed;
    obstacle.lastHitBy = data.name;
    obstacle.lastPackShakeCount = packShakeCount;
    obstacle.lastCommentaryLines = [
      'The gong shakes the pack!',
      `${data.name} rings the gong`,
      `${data.name} sends a shockwave`,
    ];
    this.pinballInteractions.gongBumper += 1;
    this.spawnImpactEffect(obstacle.center, 0xffd166, 'gong');
    this.pushBroadcastEvent('Gong Bumper', 'The gong shakes the pack!', {
      kind: 'obstacle',
      marbleId: data.id,
      distance: data.lastObstacleHitDistance,
      progress: data.lastObstacleHitProgress,
      lines: obstacle.lastCommentaryLines,
    });
  }

  applySlingshotImpulse(obstacle, data, dx, dz) {
    const side = Math.sign(dx * obstacle.normal.x + dz * obstacle.normal.z) || 1;
    const nx = obstacle.normal.x * side;
    const nz = obstacle.normal.z * side;
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    const rawImpulse = new THREE.Vector3(nx * obstacle.impulse, 0, nz * obstacle.impulse);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.35);
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    this.pinballInteractions.slingshot += 1;
    this.spawnImpactEffect(obstacle.center, 0x7cf7d4, 'spark');
    this.pushBroadcastEvent('Slingshot Kick', `${data.name} slingshot`, { kind: 'obstacle', marbleId: data.id, distance: data.lastObstacleHitDistance, progress: data.lastObstacleHitProgress, lines: [`${data.name} slingshot`, `${data.name} shoots across`, `${data.name} kicks out`] });
  }

  applySpinnerGateImpulse(obstacle, data, dx, dz) {
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    const radial = new THREE.Vector3(dx / dist, 0, dz / dist);
    const spinDirection = Math.sign(obstacle.spinnerSpeed) || 1;
    const tangent = new THREE.Vector3(-radial.z * spinDirection, 0, radial.x * spinDirection);
    const rawImpulse = new THREE.Vector3(
      tangent.x * obstacle.impulse + radial.x * 1.1,
      0,
      tangent.z * obstacle.impulse + radial.z * 1.1
    );
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.32);
    obstacle.cooldown.set(data.id, this.elapsed);
    this.pinballInteractions.spinnerGate += 1;
    this.spawnImpactEffect(obstacle.center, 0xffd166, 'ring');
    this.pushBroadcastEvent('Spinner Snap', `${data.name} spinner boost`, { kind: 'obstacle', marbleId: data.id, distance: data.lastObstacleHitDistance, progress: data.lastObstacleHitProgress, lines: [`${data.name} spinner boost`, `${data.name} catches spin`, `${data.name} snaps forward`] });
  }

  applyMovingGateImpulse(obstacle, data, dx, dz) {
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    const openAmount = clamp(obstacle.openAmount ?? obstacle.swingAngle ?? 0, 0, 1);
    const radialDistance = Math.max(0.001, Math.hypot(dx, dz));
    const radial = new THREE.Vector3(dx / radialDistance, 0, dz / radialDistance);
    const laneSide = Math.sign(radial.dot(frame.right)) || 1;
    const sideClip = frame.right.clone().multiplyScalar(laneSide * obstacle.impulse * (0.32 + (1 - openAmount) * 0.58));
    const forwardBias = frame.tangent.clone().multiplyScalar(obstacle.impulse * (0.18 + openAmount * 0.36));
    const softRebound = radial.multiplyScalar(0.45 + (1 - openAmount) * 0.65);
    const rawImpulse = sideClip.add(forwardBias).add(softRebound);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.2);
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    obstacle.lastHitBy = data.name;
    obstacle.lastSwingAngle = openAmount;
    this.pinballInteractions.movingGate += 1;
    this.pushBroadcastEvent('Guillotine Gate', `${data.name} clips the timing gate`, {
      kind: 'obstacle',
      marbleId: data.id,
      distance: data.lastObstacleHitDistance,
      progress: data.lastObstacleHitProgress,
      lines: [`${data.name} clips the timing gate`, `${data.name} sneaks under the gate`, `${data.name} catches the drop gate`],
    });
  }

  applyTiltBridgeImpulse(obstacle, data, dx, dz) {
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    const radialDistance = Math.max(0.001, Math.hypot(dx, dz));
    const radial = new THREE.Vector3(dx / radialDistance, 0, dz / radialDistance);
    const tiltAngle = obstacle.tiltAngle || 0;
    const tiltSide = Math.sign(tiltAngle) || Math.sign(radial.dot(frame.right)) || 1;
    const forwardBias = frame.tangent.clone().multiplyScalar(obstacle.impulse * 0.54);
    const sideDrift = frame.right.clone().multiplyScalar(tiltSide * obstacle.impulse * Math.min(0.32, Math.abs(tiltAngle) * 0.9));
    const softRebound = radial.multiplyScalar(0.42);
    const rawImpulse = forwardBias.add(sideDrift).add(softRebound);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.16);
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    obstacle.lastHitBy = data.name;
    this.pinballInteractions.tiltBridge += 1;
    this.pushBroadcastEvent('Tilt Bridge', `${data.name} rides the tilting bridge`, {
      kind: 'obstacle',
      marbleId: data.id,
      distance: data.lastObstacleHitDistance,
      progress: data.lastObstacleHitProgress,
      lines: [`${data.name} rides the tilt bridge`, `${data.name} balances across`, `${data.name} surfs the neon bridge`],
    });
  }

  applyPendulumHammerImpulse(obstacle, data, dx, dz) {
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    const swingAngle = obstacle.swingAngle || 0;
    const swingSide = Math.sign(swingAngle) || Math.sign(new THREE.Vector3(dx, 0, dz).dot(frame.right)) || 1;
    const angularEnergy = Math.abs(Math.sin(swingAngle)) + 0.35;
    const forwardBias = frame.tangent.clone().multiplyScalar(obstacle.impulse * 0.62);
    const sideKick = frame.right.clone().multiplyScalar(swingSide * obstacle.impulse * Math.min(0.62, 0.26 + angularEnergy * 0.28));
    const radialDistance = Math.max(0.001, Math.hypot(dx, dz));
    const softRebound = new THREE.Vector3(dx / radialDistance, 0, dz / radialDistance).multiplyScalar(obstacle.impulse * 0.12);
    const rawImpulse = forwardBias.add(sideKick).add(softRebound);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.28);
    const forwardSpeed = data.body.velocity.x * frame.tangent.x + data.body.velocity.y * frame.tangent.y + data.body.velocity.z * frame.tangent.z;
    if (forwardSpeed < 2.2) {
      const boost = 2.2 - forwardSpeed;
      data.body.velocity.x += frame.tangent.x * boost;
      data.body.velocity.y += Math.max(0, Math.min(0.1, frame.tangent.y * boost));
      data.body.velocity.z += frame.tangent.z * boost;
      data.lastMovementTime = this.elapsed;
      data.lastDriveMovementTime = this.elapsed;
    }
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    obstacle.lastHitBy = data.name;
    obstacle.lastPendulumForwardSpeed = Number(forwardSpeed.toFixed(3));
    obstacle.lastPendulumSwingSide = swingSide < 0 ? 'left' : 'right';
    this.pinballInteractions.pendulumHammer += 1;
    this.spawnImpactEffect(obstacle.center, 0xffb347, 'ring');
    this.pushBroadcastEvent('Pendulum Hammer', `${data.name} dodges the hammer`, {
      kind: 'obstacle',
      marbleId: data.id,
      distance: data.lastObstacleHitDistance,
      progress: data.lastObstacleHitProgress,
      lines: [`${data.name} dodges the hammer`, `${data.name} takes the swing`, `${data.name} gets hammered forward`],
    });
  }

  applyOrbitRingImpulse(obstacle, data, dx, dz) {
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    let nearestSegment = null;
    let nearestDistanceSq = Infinity;
    (obstacle.guideSegments || []).forEach((segment) => {
      const sx = data.body.position.x - segment.center.x;
      const sz = data.body.position.z - segment.center.z;
      const distSq = sx * sx + sz * sz;
      if (distSq < nearestDistanceSq) {
        nearestDistanceSq = distSq;
        nearestSegment = segment;
      }
    });
    const source = nearestSegment?.center || obstacle.center;
    const sx = data.body.position.x - source.x;
    const sz = data.body.position.z - source.z;
    const radialDistance = Math.max(0.001, Math.hypot(sx || dx, sz || dz));
    const radial = new THREE.Vector3((sx || dx) / radialDistance, 0, (sz || dz) / radialDistance);
    const orbitSide = Math.sign(radial.dot(frame.right)) || obstacle.orbitDirection || 1;
    const guideStrength = obstacle.orbitGuideStrength ?? PINBALL_PHYSICS.orbitRingGuideStrength;
    const forwardStrength = obstacle.orbitForwardBias ?? PINBALL_PHYSICS.orbitRingForwardBias;
    const tangentGuide = frame.right.clone().multiplyScalar(orbitSide * obstacle.impulse * guideStrength);
    const forwardBias = frame.tangent.clone().multiplyScalar(obstacle.impulse * forwardStrength);
    const softRebound = radial.multiplyScalar(obstacle.impulse * 0.08);
    const rawImpulse = tangentGuide.add(forwardBias).add(softRebound);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.08);
    const forwardSpeed = data.body.velocity.x * frame.tangent.x + data.body.velocity.y * frame.tangent.y + data.body.velocity.z * frame.tangent.z;
    if (forwardSpeed < 1.35) {
      const velocityBoost = 1.35 - forwardSpeed;
      data.body.velocity.x += frame.tangent.x * velocityBoost;
      data.body.velocity.y += Math.min(0.18, Math.max(0, frame.tangent.y * velocityBoost));
      data.body.velocity.z += frame.tangent.z * velocityBoost;
      data.lastMovementTime = this.elapsed;
      data.lastDriveMovementTime = this.elapsed;
    }
    const boost = this.activateOrbitRingSpeedBoost(data, obstacle);
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    obstacle.lastHitBy = data.name;
    obstacle.lastBoostBy = data.name;
    obstacle.lastBoostStartedAt = this.elapsed;
    obstacle.lastBoostDurationSeconds = boost?.durationSeconds ?? ORBIT_RING_SPEED_BOOST.durationSeconds;
    obstacle.lastBoostMultiplier = boost?.multiplier ?? ORBIT_RING_SPEED_BOOST.speedMultiplier;
    obstacle.lastOrbitSegmentIndex = nearestSegment?.index ?? null;
    this.pinballInteractions.orbitRing += 1;
    this.spawnImpactEffect(source, 0x50ffe7, 'ring');
    this.pushBroadcastEvent('Orbit Ring', `${data.name} rides the orbit ring`, {
      kind: 'obstacle',
      marbleId: data.id,
      distance: data.lastObstacleHitDistance,
      progress: data.lastObstacleHitProgress,
      lines: [`${data.name} rides the orbit ring`, `${data.name} glides the neon arc`, `${data.name} exits the curve`],
    });
  }

  applySplitterForkImpulse(obstacle, data, dx, dz) {
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    let nearestRail = null;
    let nearestDistanceSq = Infinity;
    (obstacle.rails || []).forEach((rail) => {
      const rx = data.body.position.x - rail.center.x;
      const rz = data.body.position.z - rail.center.z;
      const distSq = rx * rx + rz * rz;
      if (distSq < nearestDistanceSq) {
        nearestDistanceSq = distSq;
        nearestRail = rail;
      }
    });
    const localSide = Math.sign(new THREE.Vector3(dx, 0, dz).dot(frame.right)) || nearestRail?.branchSide || 1;
    const exitSide = nearestRail?.role?.includes('left') ? -1 : (nearestRail?.role?.includes('right') ? 1 : localSide);
    const forwardBias = frame.tangent.clone().multiplyScalar(obstacle.impulse * (obstacle.splitterForwardBias ?? PINBALL_PHYSICS.splitterForkForwardBias));
    const sideBias = frame.right.clone().multiplyScalar(exitSide * obstacle.impulse * (obstacle.splitterSideBias ?? PINBALL_PHYSICS.splitterForkSideBias));
    const softReboundDistance = Math.max(0.001, Math.hypot(dx, dz));
    const softRebound = new THREE.Vector3(dx / softReboundDistance, 0, dz / softReboundDistance).multiplyScalar(0.52);
    const rawImpulse = forwardBias.add(sideBias).add(softRebound);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.18);
    const forwardSpeed = data.body.velocity.x * frame.tangent.x + data.body.velocity.y * frame.tangent.y + data.body.velocity.z * frame.tangent.z;
    const minSideSpeed = obstacle.splitterMinSideSpeed ?? PINBALL_PHYSICS.splitterForkMinSideSpeed ?? 0;
    const sideSpeed = data.body.velocity.x * frame.right.x + data.body.velocity.y * frame.right.y + data.body.velocity.z * frame.right.z;
    const targetSideSpeed = exitSide * minSideSpeed;
    const sideSpeedBoost = targetSideSpeed - sideSpeed;
    if (minSideSpeed > 0 && exitSide * sideSpeed < minSideSpeed) {
      data.body.velocity.x += frame.right.x * sideSpeedBoost;
      data.body.velocity.y += Math.max(-0.08, Math.min(0.08, frame.right.y * sideSpeedBoost));
      data.body.velocity.z += frame.right.z * sideSpeedBoost;
    }
    const rescueForwardSpeed = obstacle.rescueForwardSpeed ?? 3.2;
    if (forwardSpeed < rescueForwardSpeed) {
      const velocityBoost = rescueForwardSpeed - forwardSpeed;
      data.body.velocity.x += frame.tangent.x * velocityBoost;
      data.body.velocity.y += Math.max(0, Math.min(0.12, frame.tangent.y * velocityBoost));
      data.body.velocity.z += frame.tangent.z * velocityBoost;
      data.lastMovementTime = this.elapsed;
      data.lastDriveMovementTime = this.elapsed;
    }
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    obstacle.lastHitBy = data.name;
    obstacle.lastSplitterBranch = exitSide < 0 ? 'left-exit' : 'right-exit';
    obstacle.lastSplitterRailIndex = nearestRail?.index ?? null;
    obstacle.lastSplitterForwardSpeed = Number(forwardSpeed.toFixed(3));
    obstacle.lastSplitterSideSpeed = Number(sideSpeed.toFixed(3));
    obstacle.lastSplitterSideSpeedBoost = Number((minSideSpeed > 0 && exitSide * sideSpeed < minSideSpeed ? sideSpeedBoost : 0).toFixed(3));
    obstacle.lastSplitterRescueApplied = forwardSpeed < rescueForwardSpeed;
    this.pinballInteractions.splitterFork += 1;
    this.spawnImpactEffect(nearestRail?.center || obstacle.center, exitSide < 0 ? 0xffd166 : 0xff4ecb, 'spark');
    this.pushBroadcastEvent('Splitter Fork', `${data.name} chooses the ${exitSide < 0 ? 'left' : 'right'} fork`, {
      kind: 'obstacle',
      marbleId: data.id,
      distance: data.lastObstacleHitDistance,
      progress: data.lastObstacleHitProgress,
      lines: [`${data.name} splits ${exitSide < 0 ? 'left' : 'right'}`, `${data.name} takes the fork`, `${data.name} changes lane`],
    });
  }

  activateOrbitRingSpeedBoost(data, obstacle = null) {
    const config = ORBIT_RING_SPEED_BOOST;
    if (!config.enabled || !data?.body) return null;
    const duration = config.durationSeconds || 3;
    const multiplier = config.speedMultiplier || 1.3;
    data.orbitRingBoostActive = true;
    data.orbitRingBoostUntil = this.elapsed + duration;
    data.orbitRingBoostMultiplier = multiplier;
    data.orbitRingBoostAllowExceedMaxSpeed = Boolean(config.allowExceedMaxSpeed);
    data.orbitRingBoostLastStartedAt = this.elapsed;
    data.orbitRingBoostLastExpiredAt = null;
    data.orbitRingBoostSource = obstacle?.type || 'orbitRing';
    if (!data.orbitRingBoostAura) data.orbitRingBoostAura = this.createOrbitRingBoostAura(data);
    data.orbitRingBoostAura.visible = true;
    data.orbitRingBoostAuraVisible = true;
    return {
      active: true,
      until: data.orbitRingBoostUntil,
      durationSeconds: duration,
      multiplier,
      allowExceedMaxSpeed: data.orbitRingBoostAllowExceedMaxSpeed,
    };
  }

  expireOrbitRingSpeedBoost(data) {
    if (!data?.orbitRingBoostActive) return false;
    data.orbitRingBoostActive = false;
    data.orbitRingBoostUntil = null;
    data.orbitRingBoostMultiplier = 1;
    data.orbitRingBoostAllowExceedMaxSpeed = false;
    data.orbitRingBoostEffectiveMaxSpeed = data.orbitRingBoostNormalMaxSpeed ?? null;
    data.orbitRingBoostSecondsRemaining = 0;
    data.orbitRingBoostAuraVisible = false;
    if (data.orbitRingBoostAura) data.orbitRingBoostAura.visible = false;
    data.orbitRingBoostLastExpiredAt = this.elapsed;
    return true;
  }

  getOrbitRingSpeedLimit(data, normalMaxSpeed) {
    const config = ORBIT_RING_SPEED_BOOST;
    if (!data?.orbitRingBoostActive) return normalMaxSpeed;
    if (this.elapsed >= (data.orbitRingBoostUntil ?? -Infinity)) {
      this.expireOrbitRingSpeedBoost(data);
      return normalMaxSpeed;
    }
    const multiplier = data.orbitRingBoostMultiplier || config.speedMultiplier || 1.3;
    const boostedMaxSpeed = normalMaxSpeed * multiplier;
    data.orbitRingBoostNormalMaxSpeed = normalMaxSpeed;
    data.orbitRingBoostEffectiveMaxSpeed = boostedMaxSpeed;
    data.orbitRingBoostSecondsRemaining = Math.max(0, (data.orbitRingBoostUntil ?? this.elapsed) - this.elapsed);
    return data.orbitRingBoostAllowExceedMaxSpeed ? boostedMaxSpeed : normalMaxSpeed;
  }

  getObstacleBoostSpeedLimit(data, normalMaxSpeed) {
    const orbitMaxSpeed = this.getOrbitRingSpeedLimit(data, normalMaxSpeed);
    return this.getDropTargetSpeedLimit(data, orbitMaxSpeed);
  }

  updateDropTargetBank(obstacle, delta) {
    const targets = obstacle.targets || [];
    targets.forEach((target, index) => {
      const mesh = target.mesh || target;
      if (!mesh) return;
      const dimensions = obstacle.dropTargetDimensions || {};
      const baseY = mesh.userData?.baseY ?? dimensions.targetBaseY ?? 0.58;
      const baseRotationX = mesh.userData?.baseRotationX ?? -0.08;
      const dropDistance = dimensions.targetDropDistance ?? 0.42;
      const dropStep = dimensions.targetDropStep ?? 0.03;
      const targetProgress = target.dropped ? 1 : 0;
      const speed = target.dropped ? (obstacle.dropSpeed || 4.2) : (obstacle.resetSpeed || 3.2);
      target.progress = target.progress == null
        ? targetProgress
        : THREE.MathUtils.damp(target.progress, targetProgress, speed, delta);
      if (Math.abs(target.progress - targetProgress) < 0.015) target.progress = targetProgress;
      mesh.rotation.x = baseRotationX - target.progress * 1.28;
      mesh.position.y = baseY - target.progress * (dropDistance + index * dropStep);
      mesh.scale.setScalar(1 - target.progress * 0.08);
      if (mesh.material) {
        mesh.material.emissiveIntensity = Math.max(0.055, 0.5 * (1 - target.progress) + (target.dropped ? 0.025 : 0));
        mesh.material.opacity = 1 - target.progress * 0.16;
        mesh.material.transparent = target.progress > 0.02;
      }
    });

    if (obstacle.bankCleared && obstacle.resetAt != null && this.elapsed >= obstacle.resetAt) {
      this.resetDropTargetBank(obstacle);
    }
  }

  resetDropTargetBank(obstacle) {
    obstacle.targets?.forEach((target) => {
      target.dropped = false;
      target.hitBy = null;
      target.hitAt = null;
      if (!target.bodyActive && target.body && !this.world.bodies.includes(target.body)) {
        this.world.addBody(target.body);
      }
      target.bodyActive = true;
    });
    obstacle.dropped = false;
    obstacle.droppedCount = 0;
    obstacle.bankCleared = false;
    obstacle.resetAt = null;
    obstacle.lastTargetIndex = null;
    obstacle.lastTargetLabel = null;
    obstacle.cooldown?.clear?.();
  }

  findDropTargetPanelForMarble(obstacle, data) {
    const targets = (obstacle.targets || []).filter((target) => !target.dropped);
    if (!targets.length) return null;
    const frame = this.getTrackFrameAt(data.distance || this.findClosestProgress(data.body.position).distance || 0);
    const dx = data.body.position.x - obstacle.center.x;
    const dz = data.body.position.z - obstacle.center.z;
    const laneOffset = dx * frame.right.x + dz * frame.right.z;
    let best = null;
    let bestDistance = Infinity;
    targets.forEach((target) => {
      const distance = Math.abs(laneOffset - target.x);
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    });
    const targetHitWidth = Math.max(0.58, (obstacle.dropTargetDimensions?.targetSpacing || 0.62) * 0.94);
    return bestDistance <= targetHitWidth ? best : null;
  }

  clearDropTargetPanelBody(obstacle, target) {
    if (target.body && target.bodyActive && this.world.bodies.includes(target.body)) {
      this.world.removeBody(target.body);
    }
    target.bodyActive = false;
  }

  getDropTargetBoostCommentaryLines(data, obstacle = null) {
    const name = data?.name || 'A racer';
    const duration = Math.round(DROP_TARGET_FINAL_BOOST.durationSeconds || 5);
    const multiplier = DROP_TARGET_FINAL_BOOST.speedMultiplier || 2;
    const targetText = 'CLEAR';
    const templates = Array.isArray(DROP_TARGET_FINAL_BOOST.commentaryLines)
      ? DROP_TARGET_FINAL_BOOST.commentaryLines
      : [];
    const lines = templates.map((line) => String(line)
      .replaceAll('{name}', name)
      .replaceAll('{duration}', String(duration))
      .replaceAll('{multiplier}', String(multiplier))
      .replaceAll('{targetText}', targetText)
      .replace(/\s+/g, ' ')
      .trim()
    ).filter(Boolean);
    return lines.length ? lines : [
      `${name} unlocks the golden boost`,
      `${name} claims the drop-target buff`,
      `${name} gets ${duration} seconds of speed`,
    ];
  }

  applyDropTargetBankBonus(obstacle, data, frame) {
    const bonusImpulse = obstacle.bankBonusImpulse || PINBALL_PHYSICS.dropTargetBankBonusImpulse;
    const rawImpulse = frame.tangent.clone().multiplyScalar(bonusImpulse);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.22);
    const boost = this.activateDropTargetFinalBoost(data, obstacle);
    data.dropTargetBankClearCount = (data.dropTargetBankClearCount || 0) + 1;
    obstacle.lastBankClearBy = data.name;
    obstacle.lastBankClearAt = this.elapsed;
    obstacle.lastBoostCommentaryLines = this.getDropTargetBoostCommentaryLines(data, obstacle);
    obstacle.lastBoostDurationSeconds = boost?.durationSeconds ?? DROP_TARGET_FINAL_BOOST.durationSeconds;
    obstacle.lastBoostMultiplier = boost?.multiplier ?? DROP_TARGET_FINAL_BOOST.speedMultiplier;
    obstacle.resetAt = this.elapsed + (obstacle.resetSeconds || PINBALL_PHYSICS.dropTargetResetSeconds);
    this.spawnImpactEffect(obstacle.center, 0xffd166, 'ring');
    this.pushBroadcastEvent('Drop Target Buff', obstacle.lastBoostCommentaryLines[0], { kind: 'obstacle', marbleId: data.id, distance: data.lastObstacleHitDistance, progress: data.lastObstacleHitProgress, lines: obstacle.lastBoostCommentaryLines });
  }

  createDropTargetBoostAura(data) {
    const radius = Math.max(0.3, (data?.radius || 0.36) * 1.95);
    const geometry = new THREE.SphereGeometry(radius, 24, 16);
    const material = new THREE.MeshBasicMaterial({
      color: DROP_TARGET_FINAL_BOOST.auraColor,
      transparent: true,
      opacity: DROP_TARGET_FINAL_BOOST.auraOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Mesh(geometry, material);
    aura.frustumCulled = false;
    aura.visible = false;
    aura.renderOrder = 36;
    this.scene.add(aura);
    return aura;
  }

  createOrbitRingBoostAura(data) {
    const config = ORBIT_RING_SPEED_BOOST;
    const radius = Math.max(0.24, (data?.radius || 0.36) * (config.auraRadiusMultiplier || 1.45));
    const geometry = new THREE.SphereGeometry(radius, 20, 12);
    const material = new THREE.MeshBasicMaterial({
      color: config.auraColor,
      transparent: true,
      opacity: config.auraOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Mesh(geometry, material);
    aura.frustumCulled = false;
    aura.visible = false;
    aura.renderOrder = 35;
    aura.userData.style = 'orbit-ring-speed-boost-aura';
    this.scene.add(aura);
    return aura;
  }

  activateDropTargetFinalBoost(data, obstacle = null) {
    const config = DROP_TARGET_FINAL_BOOST;
    if (!config.enabled || !data?.body) return null;
    const duration = config.durationSeconds || 5;
    const multiplier = config.speedMultiplier || 2;
    data.dropTargetBoostActive = true;
    data.dropTargetBoostUntil = this.elapsed + duration;
    data.dropTargetBoostMultiplier = multiplier;
    data.dropTargetBoostAllowExceedMaxSpeed = Boolean(config.allowExceedMaxSpeed);
    data.dropTargetBoostLastStartedAt = this.elapsed;
    data.dropTargetBoostLastExpiredAt = null;
    data.dropTargetBoostSource = obstacle?.type || 'dropTarget';
    if (!data.dropTargetBoostAura) data.dropTargetBoostAura = this.createDropTargetBoostAura(data);
    data.dropTargetBoostAura.visible = true;
    data.dropTargetBoostAuraVisible = true;
    data.mesh?.material?.emissive?.set?.(config.auraColor);
    if (data.mesh?.material && 'emissiveIntensity' in data.mesh.material) {
      data.originalEmissiveIntensity ??= data.mesh.material.emissiveIntensity;
      data.mesh.material.emissiveIntensity = Math.max(data.originalEmissiveIntensity || 0, config.auraEmissiveIntensity || 1.6);
    }
    this.spawnImpactEffect(data.body.position, config.auraColor, 'burst');
    return {
      active: true,
      until: data.dropTargetBoostUntil,
      durationSeconds: duration,
      multiplier,
      allowExceedMaxSpeed: data.dropTargetBoostAllowExceedMaxSpeed,
    };
  }

  expireDropTargetFinalBoost(data) {
    if (!data?.dropTargetBoostActive) return false;
    data.dropTargetBoostActive = false;
    data.dropTargetBoostUntil = null;
    data.dropTargetBoostMultiplier = 1;
    data.dropTargetBoostAllowExceedMaxSpeed = false;
    data.dropTargetBoostLastExpiredAt = this.elapsed;
    data.dropTargetBoostAuraVisible = false;
    if (data.dropTargetBoostAura) data.dropTargetBoostAura.visible = false;
    if (data.mesh?.material && Number.isFinite(data.originalEmissiveIntensity)) {
      data.mesh.material.emissiveIntensity = data.originalEmissiveIntensity;
    }
    return true;
  }

  updateDropTargetBoostAuras(delta = 0) {
    this.marbleData?.forEach((data) => {
      if (data.dropTargetBoostActive && this.elapsed >= (data.dropTargetBoostUntil ?? -Infinity)) {
        this.expireDropTargetFinalBoost(data);
      }
      if (data.dropTargetBoostAura) {
        const active = Boolean(data.dropTargetBoostActive);
        data.dropTargetBoostAura.visible = active;
        data.dropTargetBoostAuraVisible = active;
        if (active) {
          data.dropTargetBoostAura.position.copy(data.mesh?.position || data.body.position);
          const remaining = Math.max(0, (data.dropTargetBoostUntil ?? this.elapsed) - this.elapsed);
          const pulse = 1 + Math.sin((this.elapsed + data.id * 0.17) * 14) * 0.08;
          data.dropTargetBoostAura.scale.setScalar(pulse);
          if (data.dropTargetBoostAura.material) {
            data.dropTargetBoostAura.material.opacity = Math.max(0.08, (DROP_TARGET_FINAL_BOOST.auraOpacity || 0.36) * Math.min(1, remaining / 0.75));
          }
        }
      }

      if (data.orbitRingBoostActive && this.elapsed >= (data.orbitRingBoostUntil ?? -Infinity)) {
        this.expireOrbitRingSpeedBoost(data);
      }
      if (data.orbitRingBoostAura) {
        const orbitActive = Boolean(data.orbitRingBoostActive);
        data.orbitRingBoostAura.visible = orbitActive;
        data.orbitRingBoostAuraVisible = orbitActive;
        if (orbitActive) {
          data.orbitRingBoostAura.position.copy(data.mesh?.position || data.body.position);
          const orbitRemaining = Math.max(0, (data.orbitRingBoostUntil ?? this.elapsed) - this.elapsed);
          const orbitPulse = 1 + Math.sin((this.elapsed + data.id * 0.23) * 18) * (ORBIT_RING_SPEED_BOOST.auraPulseScale || 0.07);
          data.orbitRingBoostAura.scale.setScalar(orbitPulse);
          if (data.orbitRingBoostAura.material) {
            data.orbitRingBoostAura.material.opacity = Math.max(0.05, (ORBIT_RING_SPEED_BOOST.auraOpacity || 0.24) * Math.min(1, orbitRemaining / 0.45));
          }
        }
      }
    });
  }

  getDropTargetSpeedLimit(data, normalMaxSpeed) {
    const config = DROP_TARGET_FINAL_BOOST;
    if (!data?.dropTargetBoostActive) return normalMaxSpeed;
    if (this.elapsed >= (data.dropTargetBoostUntil ?? -Infinity)) {
      this.expireDropTargetFinalBoost(data);
      return normalMaxSpeed;
    }
    const multiplier = data.dropTargetBoostMultiplier || config.speedMultiplier || 2;
    const boostedMaxSpeed = normalMaxSpeed * multiplier;
    data.dropTargetBoostEffectiveMaxSpeed = boostedMaxSpeed;
    data.dropTargetBoostSecondsRemaining = Math.max(0, (data.dropTargetBoostUntil ?? this.elapsed) - this.elapsed);
    return data.dropTargetBoostAllowExceedMaxSpeed ? boostedMaxSpeed : normalMaxSpeed;
  }

  applyDropTargetHit(obstacle, data) {
    if (obstacle.bankCleared) return;
    const target = this.findDropTargetPanelForMarble(obstacle, data);
    if (!target) return;

    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    target.dropped = true;
    target.hitBy = data.name;
    target.hitAt = this.elapsed;
    obstacle.lastTargetIndex = target.index;
    obstacle.lastTargetLabel = target.label;
    obstacle.droppedCount = (obstacle.targets || []).filter((entry) => entry.dropped).length;
    obstacle.dropped = obstacle.droppedCount > 0;
    obstacle.cooldown.set(data.id, this.elapsed);
    this.clearDropTargetPanelBody(obstacle, target);

    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    const dx = data.body.position.x - obstacle.center.x;
    const dz = data.body.position.z - obstacle.center.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    const radial = new THREE.Vector3(dx / dist, 0, dz / dist);
    const laneNudge = frame.right.clone().multiplyScalar((target.x >= 0 ? 1 : -1) * 0.65);
    const outgoingSpeed = Math.max(0.7, data.body.velocity.x * radial.x + data.body.velocity.z * radial.z);
    const reboundImpulse = obstacle.impulse + outgoingSpeed * 0.18;
    const rawImpulse = radial.multiplyScalar(reboundImpulse).add(laneNudge);
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, obstacle.upImpulse ?? PINBALL_PHYSICS.dropTargetUpImpulse);

    obstacle.lastBouncedAt = this.elapsed;
    obstacle.lastBouncedMarbleId = data.id;
    obstacle.lastBouncedMarbleName = data.name;
    data.lastDropTargetBounceMode = obstacle.bounceMode;
    data.lastDropTargetIndex = target.index;
    data.dropTargetBounceCount = (data.dropTargetBounceCount || 0) + 1;
    this.pinballInteractions.dropTarget += 1;
    this.spawnImpactEffect(target.bodyCenter || obstacle.center, 0xff8844, 'burst');
    this.pushBroadcastEvent('Target Hit', `${data.name} hits target ${target.label}`, { kind: 'obstacle', marbleId: data.id, distance: data.lastObstacleHitDistance, progress: data.lastObstacleHitProgress, lines: [`${data.name} hits target ${target.label}`, `${obstacle.droppedCount}/3 targets down`, `${data.name} changes line`] });

    if (obstacle.droppedCount >= (obstacle.targets?.length || 3)) {
      obstacle.bankCleared = true;
      obstacle.dropped = true;
      this.applyDropTargetBankBonus(obstacle, data, frame);
    }
  }

  createDecorations() {
    // Trackside lamp posts were visually noisy around the course and added extra
    // geometry to render. Keep this hook as a no-op so track rebuilds still have
    // a stable extension point for future non-lamp decorations.
    this.decorationSummary = {
      lampPosts: 0,
      lampGlobes: 0,
      decorativePointLights: 0,
      removed: true,
      reason: 'trackside-lamp-posts-disabled',
    };
  }

  createBroadcastMarkerTexture(label) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#07101f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#7cf7d4';
    ctx.lineWidth = 22;
    ctx.strokeRect(26, 26, canvas.width - 52, canvas.height - 52);
    ctx.fillStyle = 'rgba(124,247,212,0.22)';
    ctx.fillRect(72, 342, canvas.width - 144, 42);
    ctx.font = '900 104px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(124,247,212,0.85)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#eafffb';
    ctx.fillText(label, 512, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
    texture.needsUpdate = true;
    return texture;
  }

  createBroadcastStageMarkers() {
    const textMat = new THREE.MeshBasicMaterial({ color: 0x7cf7d4, transparent: true, opacity: 0.92 });
    const sectors = [
      { d: this.trackLength * 0.18, label: 'START SECTOR' },
      { d: this.trackLength * 0.48, label: 'PINBALL ZONE' },
      { d: this.trackLength * 0.82, label: 'FINAL STRETCH' },
    ];
    sectors.forEach((sector, index) => {
      const frame = this.getTrackFrameAt(sector.d);
      const side = index % 2 === 0 ? 1 : -1;
      const pos = new THREE.Vector3(frame.p.x, frame.p.y, frame.p.z).add(frame.right.clone().multiplyScalar(side * (this.trackWidth / 2 + 4.2)));
      const markerMat = new THREE.MeshStandardMaterial({
        color: 0x07101f,
        emissive: 0x174a66,
        emissiveIntensity: 0.5,
        roughness: 0.42,
        metalness: 0.18,
        map: this.createBroadcastMarkerTexture(sector.label),
      });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(8.8, 2.2, 0.16), markerMat);
      sign.position.set(pos.x, pos.y + 2.5, pos.z);
      sign.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z) + Math.PI / 2;
      sign.castShadow = PERFORMANCE_TUNING.shadows;
      this.trackGroup.add(sign);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.22, 0.18), textMat.clone());
      stripe.position.set(0, -0.68, 0.1);
      sign.add(stripe);
      if (!(this.performanceProfile?.disableDecorativePointLights ?? PERFORMANCE_TUNING.disableDecorativePointLights)) {
        const light = new THREE.PointLight(index === 2 ? 0xffd166 : 0x7cf7d4, 0.65, 18);
        light.position.set(pos.x, pos.y + 2.4, pos.z);
        this.trackGroup.add(light);
      }
    });
    this.trackStats.broadcastStageMarkers = sectors.length;
  }

  createMarbleTrail(color, radius) {
    const points = Array.from({ length: this.performanceProfile?.trailPoints ?? PERFORMANCE_TUNING.trailPoints }, () => new THREE.Vector3(0, -1000, 0));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    this.scene.add(line);
    return {
      line,
      points,
      cursor: 0,
      sampleEvery: this.performanceProfile?.trailSampleEvery ?? PERFORMANCE_TUNING.trailSampleEvery,
      lastSample: -Infinity,
      radius,
      started: false,
      hiddenY: -1000,
    };
  }

  updateMarbleTrails(delta) {
    if (!this.marbleData.length) return;
    const now = this.elapsed;
    this.marbleData.forEach((data) => {
      if (!data.trail) return;
      const trail = data.trail;
      const trailStartDistance = this.performanceProfile?.trailStartTrackDistance ?? PERFORMANCE_TUNING.trailStartTrackDistance ?? 0.75;
      const onTrack = this.state === 'running'
        && !data.pendingFallRespawn
        && !data.defeated
        && !data.removedFromRace
        && ((data.driveDistance ?? data.distance ?? 0) >= trailStartDistance)
        && Number.isFinite(data.lastTrackContactTime)
        && now - data.lastTrackContactTime <= 0.35;

      if (!trail.started && !onTrack) {
        trail.line.visible = false;
        trail.points.forEach((point) => point.set(0, trail.hiddenY ?? -1000, 0));
        trail.line.geometry.setFromPoints(trail.points);
        trail.line.material.opacity = 0;
        data.trailStarted = false;
        return;
      }

      if (!trail.started && onTrack) {
        const startPoint = data.mesh.position.clone().add(new THREE.Vector3(0, data.radius * 0.25, 0));
        trail.points.forEach((point) => point.copy(startPoint));
        trail.cursor = 0;
        trail.lastSample = now;
        trail.started = true;
        trail.line.visible = true;
        data.trailStarted = true;
      }

      if (this.state === 'running' && trail.started && now - trail.lastSample >= trail.sampleEvery) {
        trail.lastSample = now;
        trail.cursor = (trail.cursor + 1) % trail.points.length;
        trail.points[trail.cursor].copy(data.mesh.position).add(new THREE.Vector3(0, data.radius * 0.25, 0));
      }
      const ordered = [];
      for (let i = 0; i < trail.points.length; i += 1) {
        const idx = (trail.cursor + i + 1) % trail.points.length;
        ordered.push(trail.points[idx]);
      }
      trail.line.geometry.setFromPoints(ordered);
      trail.line.material.opacity = data.finished ? Math.max(0.08, trail.line.material.opacity - delta * 0.45) : 0.22 + Math.min(0.2, data.progress * 0.2);
    });
  }

  createMarbleNameLabel(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const label = String(name || '').replace(/\s+/g, ' ').trim();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '700 34px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(35, 24, 0, 0.74)';
    ctx.strokeText(label, canvas.width / 2, canvas.height / 2 + 2);
    ctx.fillStyle = '#ffd84d';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy
      ? Math.min(16, this.renderer.capabilities.getMaxAnisotropy())
      : 8;
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.name = `marble-name-label-${label}`;
    sprite.renderOrder = 80;
    sprite.frustumCulled = false;
    sprite.scale.set(1.8, 0.45, 1);
    sprite.visible = false;
    this.scene.add(sprite);
    return sprite;
  }

  refreshMarbleNameLabelSet(now = performance.now(), force = false) {
    const labelsAllowed = !MARBLE_LABEL_POLICY.showOnlyAfterRaceStart
      || this.state === 'running'
      || this.state === 'finished';
    const rankUpdateMs = Math.max(0, this.performanceProfile?.nameLabelRankUpdateMs ?? PERFORMANCE_TUNING.nameLabelRankUpdateMs ?? 220);
    const topCount = Math.max(0, MARBLE_LABEL_POLICY.visibleTopRankCount ?? 5);
    if (!labelsAllowed) {
      if (this.cachedNameLabelIds?.size) {
        this.cachedNameLabelIds = new Set();
        this.cachedNameLabelIdsKey = '';
      }
      this.lastNameLabelRankingUpdate = now;
      return this.cachedNameLabelIds || new Set();
    }
    if (!force && this.cachedNameLabelIds && now - (this.lastNameLabelRankingUpdate || 0) < rankUpdateMs) {
      return this.cachedNameLabelIds;
    }
    const ids = this.getRanking({ force: true })
      .slice(0, topCount)
      .map((data) => data.id);
    this.cachedNameLabelIds = new Set(ids);
    this.cachedNameLabelIdsKey = ids.join('|');
    this.lastNameLabelRankingUpdate = now;
    this.uiThrottleCounters.labelRankingRefreshes += 1;
    return this.cachedNameLabelIds;
  }

  updateMarbleNameLabels(delta = 0, { forceRanking = false, forceScaleTarget = false } = {}) {
    const now = performance.now();
    const labelsAllowed = !MARBLE_LABEL_POLICY.showOnlyAfterRaceStart
      || this.state === 'running'
      || this.state === 'finished';
    const topLabelIds = labelsAllowed ? this.refreshMarbleNameLabelSet(now, forceRanking) : new Set();
    const scaleTargetUpdateMs = Math.max(0, this.performanceProfile?.nameLabelScaleTargetUpdateMs ?? PERFORMANCE_TUNING.nameLabelScaleTargetUpdateMs ?? 120);
    const refreshScaleTargets = forceScaleTarget || !scaleTargetUpdateMs || now - (this.lastNameLabelScaleTargetUpdate || 0) >= scaleTargetUpdateMs;
    if (refreshScaleTargets) {
      this.lastNameLabelScaleTargetUpdate = now;
      this.uiThrottleCounters.labelScaleTargetRefreshes += 1;
    }
    const smoothing = clamp(this.performanceProfile?.nameLabelScaleSmoothing ?? PERFORMANCE_TUNING.nameLabelScaleSmoothing ?? 0.18, 0, 1);
    const positionThresholdSq = Math.max(0, this.performanceProfile?.nameLabelPositionWriteThresholdSq ?? PERFORMANCE_TUNING.nameLabelPositionWriteThresholdSq ?? 0.0004);
    const scaleWriteThreshold = Math.max(0, this.performanceProfile?.nameLabelScaleWriteThreshold ?? PERFORMANCE_TUNING.nameLabelScaleWriteThreshold ?? 0.005);
    const renderAllLabels = false;
    let visibleCount = 0;
    this.uiThrottleCounters.labelTransformPasses += 1;
    this.marbleData.forEach((data) => {
      const sprite = data.labelSprite;
      if (!sprite) return;
      const fallLabelAllowed = !data.pendingFallRespawn
        || this.elapsed - (data.pendingFallRespawn.detectedAt ?? this.elapsed) < MARBLE_LABEL_POLICY.hidePendingFallAfterSeconds;
      const visible = labelsAllowed && fallLabelAllowed && (renderAllLabels || topLabelIds.has(data.id));
      if (sprite.visible !== visible) {
        sprite.visible = visible;
        this.uiThrottleCounters.labelVisibilityWrites += 1;
      }
      data.labelVisible = visible;
      if (!visible) {
        this.uiThrottleCounters.labelHiddenSkips += 1;
        return;
      }
      visibleCount += 1;

      const targetPosition = this.labelScratchPosition || new THREE.Vector3();
      targetPosition.copy(data.mesh.position);
      targetPosition.y += data.radius + 0.72;
      if (sprite.position.distanceToSquared(targetPosition) > positionThresholdSq) {
        sprite.position.copy(targetPosition);
        this.uiThrottleCounters.labelPositionWrites += 1;
      }

      if (refreshScaleTargets || !Number.isFinite(data.labelTargetScale)) {
        const cameraDistance = sprite.position.distanceTo(this.camera.position);
        data.labelTargetScale = clamp(cameraDistance * 0.035, 0.62, 1.25);
      }
      const targetScale = Number.isFinite(data.labelTargetScale) ? data.labelTargetScale : 0.82;
      const previousBaseScale = Number.isFinite(data.labelBaseScale) ? data.labelBaseScale : targetScale;
      const scale = previousBaseScale + (targetScale - previousBaseScale) * smoothing;
      data.labelBaseScale = scale;
      if (!Number.isFinite(data.labelRenderedBaseScale) || Math.abs(scale - data.labelRenderedBaseScale) > scaleWriteThreshold) {
        sprite.scale.set(scale * 3.8, scale * 0.95, 1);
        data.labelRenderedBaseScale = scale;
        this.uiThrottleCounters.labelScaleWrites += 1;
      }
    });
    this.visibleLabelCount = visibleCount;
  }

  clearSpectacleEffects({ clearTrails = true } = {}) {
    this.spectacleEffects?.forEach((effect) => {
      effect.meshes?.forEach((mesh) => this.scene?.remove(mesh));
      if (effect.mesh) this.scene?.remove(effect.mesh);
    });
    this.spectacleEffects = [];
    this.confettiPieces?.forEach((piece) => this.scene?.remove(piece.mesh));
    this.confettiPieces = [];
    this.resetEffectBudgetWindow({ resetCounters: false });
    if (clearTrails) {
      this.marbleData?.forEach((data) => {
        if (data.trail?.line) this.scene?.remove(data.trail.line);
        data.trail = null;
      });
    }
  }

  createEffectBudget() {
    const perKindWeights = { ring: 4, spark: 6, burst: 9, gong: 12, confetti: 1 };
    const perKindMinCooldownMs = { ring: 45, spark: 60, burst: 85, gong: 160 };
    return {
      frameStartedAt: 0,
      frameCost: 0,
      frameCostLimit: 18,
      lastSpawnAtByKind: {},
      perKindWeights,
      perKindMinCooldownMs,
      maxEffects: this.performanceProfile?.maxSpectacleEffects ?? PERFORMANCE_TUNING.maxSpectacleEffects,
      maxMeshes: this.performanceProfile?.maxSpectacleEffectMeshes ?? PERFORMANCE_TUNING.maxSpectacleEffectMeshes,
      maxConfetti: this.performanceProfile?.maxConfettiPieces ?? PERFORMANCE_TUNING.maxConfettiPieces,
      globalCooldownMs: this.performanceProfile?.spectacleSpawnCooldownMs ?? PERFORMANCE_TUNING.spectacleSpawnCooldownMs,
      lastGlobalSpawnAt: -Infinity,
    };
  }

  resetEffectBudgetWindow({ resetCounters = false } = {}) {
    if (!this.effectBudget) this.effectBudget = this.createEffectBudget();
    this.effectBudget.frameStartedAt = performance.now();
    this.effectBudget.frameCost = 0;
    this.effectBudget.lastSpawnAtByKind = {};
    this.effectBudget.lastGlobalSpawnAt = -Infinity;
    if (resetCounters || !this.effectBudgetCounters) {
      this.effectBudgetCounters = {
        admitted: 0,
        denied: 0,
        deniedByReason: {},
        admittedByKind: {},
        confettiAdmitted: 0,
        confettiDenied: 0,
        removedOldest: 0,
        peakEffects: this.spectacleEffects?.length || 0,
        peakMeshes: this.getSpectacleEffectMeshCount(),
        peakConfetti: this.confettiPieces?.length || 0,
        lastDeniedReason: null,
      };
    }
  }

  getSpectacleEffectMeshCount() {
    return (this.spectacleEffects || []).reduce((sum, effect) => sum + (effect.meshCount || effect.meshes?.length || 0), 0);
  }

  noteEffectBudgetDenial(reason, kind = 'unknown') {
    if (!this.effectBudgetCounters) this.resetEffectBudgetWindow({ resetCounters: true });
    this.effectBudgetCounters.denied += 1;
    this.effectBudgetCounters.lastDeniedReason = `${kind}:${reason}`;
    this.effectBudgetCounters.deniedByReason[reason] = (this.effectBudgetCounters.deniedByReason[reason] || 0) + 1;
  }

  trimSpectacleEffectsToBudget(extraMeshesNeeded = 0) {
    const budget = this.effectBudget || this.createEffectBudget();
    let removed = 0;
    while (
      this.spectacleEffects.length > 0
      && (
        this.spectacleEffects.length >= budget.maxEffects
        || this.getSpectacleEffectMeshCount() + extraMeshesNeeded > budget.maxMeshes
      )
    ) {
      const effect = this.spectacleEffects.shift();
      effect?.meshes?.forEach((mesh) => this.scene?.remove(mesh));
      removed += 1;
    }
    if (removed && this.effectBudgetCounters) this.effectBudgetCounters.removedOldest += removed;
    return removed;
  }

  canAdmitSpectacleEffect(kind = 'ring', meshCount = 1, { force = false } = {}) {
    if (force) return true;
    if (!this.effectBudget) this.effectBudget = this.createEffectBudget();
    if (!this.effectBudgetCounters) this.resetEffectBudgetWindow({ resetCounters: true });
    const budget = this.effectBudget;
    const now = performance.now();
    if (now - budget.frameStartedAt > 80) {
      budget.frameStartedAt = now;
      budget.frameCost = 0;
    }
    const weight = budget.perKindWeights[kind] ?? 5;
    if (budget.frameCost + weight > budget.frameCostLimit) {
      this.noteEffectBudgetDenial('frame-cost', kind);
      return false;
    }
    const kindCooldown = budget.perKindMinCooldownMs[kind] ?? 0;
    const lastKindSpawnAt = budget.lastSpawnAtByKind[kind] ?? -Infinity;
    if (kindCooldown > 0 && now - lastKindSpawnAt < kindCooldown) {
      this.noteEffectBudgetDenial('kind-cooldown', kind);
      return false;
    }
    if (budget.globalCooldownMs > 0 && kind !== 'gong' && now - budget.lastGlobalSpawnAt < budget.globalCooldownMs) {
      this.noteEffectBudgetDenial('global-cooldown', kind);
      return false;
    }
    this.trimSpectacleEffectsToBudget(meshCount);
    if (this.spectacleEffects.length >= budget.maxEffects) {
      this.noteEffectBudgetDenial('effect-count', kind);
      return false;
    }
    if (this.getSpectacleEffectMeshCount() + meshCount > budget.maxMeshes) {
      this.noteEffectBudgetDenial('mesh-count', kind);
      return false;
    }
    budget.frameCost += weight;
    budget.lastSpawnAtByKind[kind] = now;
    budget.lastGlobalSpawnAt = now;
    this.effectBudgetCounters.admitted += 1;
    this.effectBudgetCounters.admittedByKind[kind] = (this.effectBudgetCounters.admittedByKind[kind] || 0) + 1;
    return true;
  }

  updateEffectBudgetPeaks() {
    if (!this.effectBudgetCounters) return;
    this.effectBudgetCounters.peakEffects = Math.max(this.effectBudgetCounters.peakEffects || 0, this.spectacleEffects?.length || 0);
    this.effectBudgetCounters.peakMeshes = Math.max(this.effectBudgetCounters.peakMeshes || 0, this.getSpectacleEffectMeshCount());
    this.effectBudgetCounters.peakConfetti = Math.max(this.effectBudgetCounters.peakConfetti || 0, this.confettiPieces?.length || 0);
  }

  spawnImpactEffect(position, color = 0x7cf7d4, kind = 'ring', options = {}) {
    const meshCount = kind === 'burst' ? 8 : (kind === 'spark' ? 5 : 1);
    if (!this.canAdmitSpectacleEffect(kind, meshCount, options)) return false;
    const meshes = [];
    const base = new THREE.Vector3(position.x, position.y + 0.35, position.z);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'gong') {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.92, 96), material);
      mesh.position.copy(base);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 44;
      mesh.userData.effectStyle = 'single-expanding-ring-shockwave';
      mesh.userData.replaces = 'old-gong-dot-particles';
      this.scene.add(mesh);
      meshes.push(mesh);
    } else if (kind === 'spark' || kind === 'burst') {
      const count = kind === 'burst' ? 8 : 5;
      for (let i = 0; i < count; i += 1) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), material.clone());
        mesh.position.copy(base);
        const angle = (i / count) * Math.PI * 2;
        const speed = 2.4 + i * 0.08;
        mesh.userData.velocity = new THREE.Vector3(Math.cos(angle) * speed, 1.2 + (i % 3) * 0.25, Math.sin(angle) * speed);
        this.scene.add(mesh);
        meshes.push(mesh);
      }
    } else {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.44, 18), material);
      mesh.position.copy(base);
      mesh.rotation.x = -Math.PI / 2;
      this.scene.add(mesh);
      meshes.push(mesh);
    }
    this.spectacleEffects.push({
      kind,
      meshes,
      age: 0,
      life: kind === 'ring' ? 0.75 : (kind === 'gong' ? 1.1 : 0.9),
      style: kind === 'gong' ? 'single-expanding-ring-shockwave' : kind,
      meshCount: meshes.length,
      admittedAt: performance.now(),
    });
    this.updateEffectBudgetPeaks();
    return true;
  }

  updateSpectacleEffects(delta) {
    this.spectacleEffects = this.spectacleEffects.filter((effect) => {
      effect.age += delta;
      const t = clamp(effect.age / effect.life, 0, 1);
      effect.meshes.forEach((mesh) => {
        if (effect.kind === 'ring') mesh.scale.setScalar(1 + t * 5.5);
        if (effect.kind === 'gong') {
          const scale = 1 + t * 8.8;
          mesh.scale.set(scale, scale, 1);
        }
        if (mesh.userData.velocity) mesh.position.addScaledVector(mesh.userData.velocity, delta);
        if (mesh.material) {
          const baseOpacity = effect.kind === 'gong' ? 0.82 : 0.72;
          mesh.material.opacity = Math.max(0, baseOpacity * (1 - t));
        }
      });
      if (t >= 1) {
        effect.meshes.forEach((mesh) => this.scene.remove(mesh));
        return false;
      }
      return true;
    });
    this.updateConfetti(delta);
  }

  clearReplayGhosts() {
    // Legacy no-op: replay now uses original marble meshes/materials from the race history buffer.
  }

  ensureReplayGhosts() {
    // Legacy no-op kept for console compatibility; no glow/oversized ghost markers are created.
    return [];
  }

  recordRaceHistorySample({ force = false } = {}) {
    const interval = Math.max(0.04, CUP_VIDEO_TIMING.replayHistorySampleSeconds || 0.1);
    if (!force && this.elapsed - (this.lastRaceHistorySampleAt || -Infinity) < interval) return;
    if (!this.marbleData?.length) return;
    this.lastRaceHistorySampleAt = this.elapsed;
    const marbles = this.marbleData.map((data) => ({
      id: data.id,
      name: data.name,
      visible: Boolean(data.mesh?.visible !== false && !data.removedFromRace),
      defeated: Boolean(data.defeated),
      finished: Boolean(data.finished),
      distance: data.distance || 0,
      progress: data.progress || 0,
      position: {
        x: Number((data.mesh?.position?.x ?? data.body?.position?.x ?? 0).toFixed(4)),
        y: Number((data.mesh?.position?.y ?? data.body?.position?.y ?? 0).toFixed(4)),
        z: Number((data.mesh?.position?.z ?? data.body?.position?.z ?? 0).toFixed(4)),
      },
      quaternion: {
        x: Number((data.mesh?.quaternion?.x ?? 0).toFixed(5)),
        y: Number((data.mesh?.quaternion?.y ?? 0).toFixed(5)),
        z: Number((data.mesh?.quaternion?.z ?? 0).toFixed(5)),
        w: Number((data.mesh?.quaternion?.w ?? 1).toFixed(5)),
      },
    }));
    this.raceHistoryBuffer.push({ time: Number(this.elapsed.toFixed(3)), marbles });
    const baseKeepSeconds = Math.max(18, (CUP_VIDEO_TIMING.replayClipSeconds || 7) * (CUP_VIDEO_TIMING.replayHighlightMaxEvents || 3) + 8);
    const stageReplayKeepSeconds = this.cupMode?.active
      ? Math.max(
        baseKeepSeconds,
        Number(CUP_VIDEO_TIMING.stageTargetSeconds?.[this.getCupStage?.()] || 0) + (CUP_VIDEO_TIMING.replayHistoryAfterSeconds || 3.8) + 8,
        (this.elapsed || 0) + (CUP_VIDEO_TIMING.replayHistoryAfterSeconds || 3.8) + 2,
      )
      : baseKeepSeconds;
    const keepSeconds = this.replayHighlight?.active ? Math.max(stageReplayKeepSeconds, (this.elapsed || 0) + 2) : stageReplayKeepSeconds;
    const cutoff = this.elapsed - keepSeconds;
    while (this.raceHistoryBuffer.length > 2 && this.raceHistoryBuffer[0].time < cutoff) this.raceHistoryBuffer.shift();
  }

  captureReplayOriginalSnapshots() {
    this.replayOriginalSnapshots = this.marbleData.map((data) => ({
      id: data.id,
      position: data.mesh.position.clone(),
      quaternion: data.mesh.quaternion.clone(),
      scale: data.mesh.scale.clone(),
      visible: data.mesh.visible,
      labelVisible: data.labelSprite?.visible ?? true,
      labelPosition: data.labelSprite?.position?.clone?.() || null,
      bodyPosition: data.body?.position ? data.body.position.clone() : null,
      bodyQuaternion: data.body?.quaternion ? data.body.quaternion.clone() : null,
    }));
  }

  restoreReplayOriginalSnapshots() {
    if (!this.replayOriginalSnapshots) return;
    this.replayOriginalSnapshots.forEach((snapshot) => {
      const data = this.marbleData.find((item) => item.id === snapshot.id);
      if (!data?.mesh) return;
      data.mesh.position.copy(snapshot.position);
      data.mesh.quaternion.copy(snapshot.quaternion);
      data.mesh.scale.copy(snapshot.scale);
      data.mesh.visible = snapshot.visible;
      if (data.labelSprite) {
        data.labelSprite.visible = snapshot.labelVisible;
        if (snapshot.labelPosition) data.labelSprite.position.copy(snapshot.labelPosition);
      }
      if (data.body && snapshot.bodyPosition) data.body.position.copy(snapshot.bodyPosition);
      if (data.body && snapshot.bodyQuaternion) data.body.quaternion.copy(snapshot.bodyQuaternion);
    });
    this.replayOriginalSnapshots = null;
  }

  findRaceHistoryFrameAt(time) {
    const buffer = this.raceHistoryBuffer || [];
    if (!buffer.length) return null;
    if (time <= buffer[0].time) return buffer[0];
    if (time >= buffer[buffer.length - 1].time) return buffer[buffer.length - 1];
    let lo = 0;
    let hi = buffer.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (buffer[mid].time <= time) lo = mid;
      else hi = mid;
    }
    const a = buffer[lo];
    const b = buffer[hi];
    const t = clamp((time - a.time) / Math.max(0.001, b.time - a.time), 0, 1);
    const marbles = a.marbles.map((ma) => {
      const mb = b.marbles.find((entry) => entry.id === ma.id) || ma;
      return {
        id: ma.id,
        name: ma.name,
        visible: ma.visible || mb.visible,
        defeated: ma.defeated || mb.defeated,
        finished: ma.finished || mb.finished,
        distance: lerp(ma.distance || 0, mb.distance || 0, t),
        progress: lerp(ma.progress || 0, mb.progress || 0, t),
        position: {
          x: lerp(ma.position.x, mb.position.x, t),
          y: lerp(ma.position.y, mb.position.y, t),
          z: lerp(ma.position.z, mb.position.z, t),
        },
        quaternion: {
          x: lerp(ma.quaternion.x, mb.quaternion.x, t),
          y: lerp(ma.quaternion.y, mb.quaternion.y, t),
          z: lerp(ma.quaternion.z, mb.quaternion.z, t),
          w: lerp(ma.quaternion.w, mb.quaternion.w, t),
        },
      };
    });
    return { time, marbles, interpolated: true, from: a.time, to: b.time };
  }

  getReplayEventTime(event, index = 0) {
    const buffer = this.raceHistoryBuffer || [];
    if (Number.isFinite(event?.time)) return clamp(event.time, buffer[0]?.time ?? 0, buffer.at(-1)?.time ?? this.elapsed);
    if (Number.isFinite(event?.distance) && this.trackLength) {
      const match = buffer.find((frame) => frame.marbles.some((marble) => Math.abs((marble.distance || 0) - event.distance) <= 2.5));
      if (match) return match.time;
    }
    const fallback = this.elapsed - (CUP_VIDEO_TIMING.replayHistoryBeforeSeconds || 2.2) - index * 1.2;
    return clamp(fallback, buffer[0]?.time ?? 0, buffer.at(-1)?.time ?? this.elapsed);
  }

  buildReplayHighlightPlayback(events, duration = CUP_VIDEO_TIMING.replayHighlightSeconds) {
    const replayClipCount = Math.max(1, Number(CUP_VIDEO_TIMING.replayHighlightMaxEvents) || Math.max(events.length, 1));
    const clipSeconds = Math.max(2.5, CUP_VIDEO_TIMING.replayClipSeconds || (duration / replayClipCount));
    const totalClipTime = clipSeconds * Math.max(events.length, 1);
    const before = CUP_VIDEO_TIMING.replayHistoryBeforeSeconds || 2.2;
    const after = CUP_VIDEO_TIMING.replayHistoryAfterSeconds || 3.8;
    const clips = events.map((event, index) => {
      const eventTime = this.getReplayEventTime(event, index);
      const startTime = Math.max(this.raceHistoryBuffer?.[0]?.time ?? 0, eventTime - before);
      const endTime = Math.min(this.raceHistoryBuffer?.at(-1)?.time ?? this.elapsed, eventTime + after);
      return { index, eventTime, startTime, endTime, duration: Math.max(0.1, endTime - startTime), event };
    });
    return {
      activeIndex: 0,
      clipSeconds,
      totalClipTime,
      focusLeadSeconds: CUP_VIDEO_TIMING.replayFocusLeadSeconds,
      cameraBack: CUP_VIDEO_TIMING.replayCameraBack,
      cameraSide: CUP_VIDEO_TIMING.replayCameraSide,
      cameraHeight: CUP_VIDEO_TIMING.replayCameraHeight,
      clips,
      sampleInterval: CUP_VIDEO_TIMING.replayHistorySampleSeconds || 0.1,
      mode: 'history-buffer-replay',
    };
  }

  getReplayEventDistance(event, index = 0) {
    const candidates = [
      event?.distance,
      event?.leaderDistance,
      event?.progress != null && this.trackLength ? event.progress * this.trackLength : null,
      event?.time != null && this.elapsed > 0 && this.trackLength ? (event.time / Math.max(this.elapsed, 1)) * this.trackLength : null,
      this.getRanking({ force: true })[index]?.distance,
      this.trackLength * (0.28 + index * 0.2),
    ];
    const value = candidates.find((entry) => Number.isFinite(entry));
    return clamp(value || 0, 0, this.trackLength || 1);
  }

  getReplayHighlightState() {
    const replay = this.replayHighlight;
    if (!replay?.active || !replay.events?.length || !replay.playback) return null;
    const elapsedReplay = replay.startedAtMs
      ? Math.max(0, (performance.now() - replay.startedAtMs) / 1000)
      : Math.max(0, this.elapsed - (replay.startedAt || 0));
    const clipSeconds = replay.playback.clipSeconds || 7;
    const totalClipTime = replay.playback.totalClipTime || (clipSeconds * replay.events.length);
    if (elapsedReplay >= totalClipTime) {
      return {
        replay,
        complete: true,
        activeIndex: replay.events.length - 1,
        clipProgress: 1,
        motionProgress: 1,
        distance: this.trackLength || 1,
        primary: null,
        secondary: null,
        clip: replay.playback.clips?.at(-1) || null,
        historyTime: this.raceHistoryBuffer?.at(-1)?.time ?? this.elapsed,
        historyFrame: this.raceHistoryBuffer?.at(-1) || null,
        focusMarble: null,
        primarySnapshot: null,
        secondarySnapshot: null,
      };
    }
    const activeIndex = Math.min(replay.events.length - 1, Math.floor(elapsedReplay / clipSeconds));
    const clipProgress = clamp((elapsedReplay - activeIndex * clipSeconds) / clipSeconds, 0, 1);
    const event = replay.events[activeIndex];
    const clip = replay.playback.clips?.[activeIndex];
    const historyTime = clip
      ? lerp(clip.startTime, clip.endTime, clipProgress)
      : this.getReplayEventTime(event, activeIndex);
    const historyFrame = this.findRaceHistoryFrameAt(historyTime);
    const historyRanking = historyFrame?.marbles?.length
      ? [...historyFrame.marbles].sort((a, b) => (b.distance || 0) - (a.distance || 0))
      : [];
    const liveRanking = this.getRanking({ force: true });
    const primarySnapshot = event.marbleId
      ? historyFrame?.marbles?.find((marble) => marble.id === event.marbleId)
      : historyRanking[activeIndex] || historyRanking[0] || null;
    const secondarySnapshot = event.rivalId
      ? historyFrame?.marbles?.find((marble) => marble.id === event.rivalId)
      : historyRanking.find((marble) => marble.id !== primarySnapshot?.id) || null;
    const primary = primarySnapshot?.id != null
      ? this.marbleData.find((data) => data.id === primarySnapshot.id)
      : (event.marbleId ? this.marbleData.find((data) => data.id === event.marbleId) : liveRanking[activeIndex] || liveRanking[0] || this.marbleData[0]);
    const secondary = secondarySnapshot?.id != null
      ? this.marbleData.find((data) => data.id === secondarySnapshot.id)
      : (event.rivalId ? this.marbleData.find((data) => data.id === event.rivalId) : liveRanking.find((data) => data.id !== primary?.id) || this.marbleData.find((data) => data.id !== primary?.id));
    const focusMarble = primarySnapshot
      || historyRanking[0]
      || historyFrame?.marbles?.find((marble) => marble.id === primary?.id);
    const distance = clamp(focusMarble?.distance ?? this.getReplayEventDistance(event, activeIndex), 0, this.trackLength || 1);
    return { replay, event, activeIndex, clipProgress, motionProgress: clipProgress, distance, primary, secondary, clip, historyTime, historyFrame, focusMarble, primarySnapshot, secondarySnapshot };
  }

  applyReplayHighlightVirtualMarbles(state) {
    const replayState = state || this.getReplayHighlightState();
    if (!replayState?.historyFrame?.marbles?.length) return;
    replayState.historyFrame.marbles.forEach((snapshot) => {
      const data = this.marbleData.find((item) => item.id === snapshot.id);
      if (!data?.mesh) return;
      data.mesh.visible = snapshot.visible !== false;
      data.mesh.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
      data.mesh.quaternion.set(snapshot.quaternion.x, snapshot.quaternion.y, snapshot.quaternion.z, snapshot.quaternion.w).normalize();
      data.mesh.scale.setScalar(1);
      if (data.labelSprite) {
        data.labelSprite.visible = data.mesh.visible;
        data.labelSprite.position.copy(data.mesh.position).add(new THREE.Vector3(0, data.radius + 0.82, 0));
      }
      data.replayHighlightIndex = replayState.activeIndex;
    });
  }

  updateReplayHighlightPlayback(delta = 0) {
    const state = this.getReplayHighlightState();
    if (!state) return;
    this.replayHighlight.playback.activeIndex = state.activeIndex;
    this.replayHighlight.playback.complete = Boolean(state.complete);
    this.replayHighlight.playback.clipProgress = Number(state.clipProgress.toFixed(3));
    this.replayHighlight.playback.motionProgress = Number((state.motionProgress || state.clipProgress).toFixed(3));
    this.replayHighlight.playback.currentTitle = state.event?.title || 'Replay Complete';
    this.replayHighlight.playback.currentReplayTitle = state.event?.replayTitle || null;
    this.replayHighlight.playback.currentDistance = Number(state.distance.toFixed(2));
    this.replayHighlight.playback.currentHistoryTime = Number((state.historyTime || 0).toFixed(2));
    this.replayHighlight.playback.currentPrimary = state.primary?.name || null;
    this.replayHighlight.playback.currentSecondary = state.secondary?.name || null;
    this.replayHighlight.playback.focusSnapshot = state.focusMarble ? {
      id: state.focusMarble.id,
      distance: Number((state.focusMarble.distance || 0).toFixed(2)),
      progress: Number((state.focusMarble.progress || 0).toFixed(3)),
      x: Number(state.focusMarble.position.x.toFixed(2)),
      y: Number(state.focusMarble.position.y.toFixed(2)),
      z: Number(state.focusMarble.position.z.toFixed(2)),
    } : null;
    this.applyReplayHighlightVirtualMarbles(state);
    this.replayHighlight.playback.visibleReplayMarbles = state.historyFrame?.marbles?.filter((marble) => marble.visible !== false).length || 0;
    this.replayHighlight.playback.replayMarblePositions = state.historyFrame?.marbles?.slice(0, 4).map((marble) => ({
      id: marble.id,
      x: Number(marble.position.x.toFixed(2)),
      y: Number(marble.position.y.toFixed(2)),
      z: Number(marble.position.z.toFixed(2)),
    })) || [];
    this.showReplayLiveEventCaption(state);
  }

  updateReplayHighlightOverlayActiveCard(activeIndex = 0) {
    // Dedicated replay overlay is retired; replay status lives in Live Event caption.
  }

  showReplayLiveEventCaption(state = this.getReplayHighlightState()) {
    if (!state || !this.ui?.caption) return;
    if (state.complete) {
      const title = 'Replay Complete';
      const detail = 'Back to podium';
      this.activeCaption = { title, detail, kind: 'replay', expiresAt: this.elapsed + 9999 };
      if (this.ui.captionTitle) this.ui.captionTitle.textContent = title;
      if (this.ui.captionDetail) this.ui.captionDetail.textContent = detail;
      this.ui.caption.classList.add('hidden');
      return;
    }
    const event = state.event || {};
    const prefix = `Replay ${state.activeIndex + 1}/${this.replayHighlight.events.length}`;
    const title = `${prefix}: ${event.title || 'Race Moment'}`;
    const detail = this.buildReplayHighlightDetail(event, state);
    const lines = this.buildReplayHighlightLines(event, state, detail);
    this.activeCaption = { title, detail, kind: 'replay', expiresAt: this.elapsed + 9999 };
    if (this.ui.captionTitle) this.ui.captionTitle.textContent = title;
    if (this.ui.captionDetail) this.ui.captionDetail.textContent = this.activeCaption.detail;
    this.ui.caption.classList.add('hidden');
    if (this.activeCommentary?.replayIndex !== state.activeIndex) {
      this.queueCommentary({ ...event, kind: 'replay', detail, lines }, { force: true });
      if (this.activeCommentary) this.activeCommentary.replayIndex = state.activeIndex;
    }
  }

  getReplayHighlightName(event = {}, state = {}, key = 'primary') {
    const explicitId = key === 'secondary' ? event.rivalId : event.marbleId;
    const live = key === 'secondary' ? state.secondary : state.primary;
    const snapshot = key === 'secondary' ? state.secondarySnapshot : state.primarySnapshot;
    if (explicitId != null) {
      const match = this.marbleData?.find?.((data) => data.id === explicitId)
        || state.historyFrame?.marbles?.find?.((data) => data.id === explicitId);
      if (match?.name) return match.name;
    }
    return live?.name || snapshot?.name || null;
  }

  buildReplayHighlightDetail(event = {}, state = {}) {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const primary = this.getReplayHighlightName(event, state, 'primary');
    const secondary = this.getReplayHighlightName(event, state, 'secondary');
    const existing = clean(event.detail);
    if (existing) return existing;
    const progressValue = state.focusMarble?.progress ?? event.progress;
    const pct = Number.isFinite(progressValue) ? Math.round(clamp(progressValue, 0, 1) * 100) : null;
    const progressSuffix = pct != null && pct > 0 ? ` at ${pct}%` : '';
    switch (event.kind) {
      case 'overtake':
        return primary && secondary ? `${primary} passes ${secondary}${progressSuffix}` : `${primary || 'Racer'} gains position${progressSuffix}`;
      case 'leader':
        return `${primary || 'Leader'} takes P1${progressSuffix}`;
      case 'battle':
        return primary && secondary ? `${primary} battles ${secondary}${progressSuffix}` : `Close battle${progressSuffix}`;
      case 'obstacle':
        return `${primary || 'Racer'} hits trouble${progressSuffix}`;
      case 'finish':
        return `${primary || 'Leader'} in final sector`;
      case 'winner':
        return `${primary || 'Winner'} takes the flag`;
      case 'complete':
        return primary ? `${primary} result locked` : 'Round result locked';
      default:
        return clean(event.replayTitle) || (primary ? `${primary} race moment${progressSuffix}` : 'Race moment');
    }
  }

  buildReplayHighlightLines(event = {}, state = {}, detail = '') {
    const primary = this.getReplayHighlightName(event, state, 'primary') || 'Racer';
    const secondary = this.getReplayHighlightName(event, state, 'secondary') || 'the chase';
    const base = String(detail || event.detail || event.title || 'Race moment').replace(/\s+/g, ' ').trim();
    const progressValue = state.focusMarble?.progress ?? event.progress;
    const pct = Number.isFinite(progressValue) ? Math.round(clamp(progressValue, 0, 1) * 100) : null;
    const at = pct != null && pct > 0 ? ` at ${pct}%` : '';
    const templates = {
      overtake: [base, `${primary} clears ${secondary}`, `${primary} moves up${at}`, `${primary} makes the pass`],
      leader: [base, `${primary} grabs P1`, `${primary} leads${at}`, `${primary} sets the pace`],
      battle: [base, `${primary} versus ${secondary}`, `${secondary} stays close`, `Pressure on ${primary}`],
      obstacle: [base, `${primary} bounces wide`, `${primary} recovers${at}`, `${primary} takes contact`],
      finish: [base, `${primary} closes in`, `${primary} final push`, `${primary} near the line`],
      winner: [base, `${primary} takes the flag`, `${primary} wins it`, `${primary} seals the race`],
      complete: [base, `${primary} locks the result`, `Result confirmed`, `Podium picture set`],
      general: [base, `${primary} race moment`, `Key moment${at}`, `One more look`],
    };
    return [...new Set((templates[event.kind] || templates.general).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 4);
  }

  selectReplayHighlightEvents(stage = this.getCupStage()) {
    const priority = { overtake: 100, leader: 90, battle: 82, obstacle: 74, finish: 68, winner: 62, complete: 55, general: 30 };
    const seen = new Set();
    const maxEvents = Math.max(1, CUP_VIDEO_TIMING.replayHighlightMaxEvents || 3);
    const events = (this.broadcastEvents || [])
      .filter((event) => event?.title && !/record/i.test(`${event.title} ${event.detail || ''}`))
      .map((event, index) => ({
        ...event,
        replayTitle: CUP_VIDEO_TIMING.replayHighlightTitles[event.kind] || CUP_VIDEO_TIMING.replayHighlightTitles.general,
        distance: this.getReplayEventDistance(event, index),
        progress: this.trackLength ? clamp(this.getReplayEventDistance(event, index) / this.trackLength, 0, 1) : 0,
        score: (priority[event.kind] || priority.general) + Math.max(0, 12 - index) + (event.time || 0) * 0.01,
      }))
      .sort((a, b) => b.score - a.score)
      .filter((event) => {
        const key = `${event.kind}:${event.title}:${event.detail}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const selected = [];
    ['overtake', 'obstacle', 'leader', 'battle', 'finish', 'winner', 'complete'].forEach((kind) => {
      if (selected.length >= maxEvents) return;
      const event = events.find((candidate) => candidate.kind === kind && !selected.includes(candidate));
      if (event) selected.push(event);
    });
    events.forEach((event) => {
      if (selected.length < maxEvents && !selected.includes(event)) selected.push(event);
    });
    selected.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    const ranking = this.getRanking({ force: true }).slice(0, maxEvents);
    const fallbackEvents = ranking.map((data, index) => ({
      title: index === 0 ? 'Winner' : `P${index + 1}`,
      detail: index === 0 ? `${data.name} wins` : `${data.name} P${index + 1}`,
      kind: index === 0 ? 'winner' : 'complete',
      time: this.elapsed,
      distance: clamp(data.distance || this.trackLength * (0.72 + index * 0.06), 0, this.trackLength),
      progress: this.trackLength ? clamp((data.distance || this.trackLength * (0.72 + index * 0.06)) / this.trackLength, 0, 1) : 0,
      marbleId: data.id,
      replayTitle: index === 0 ? 'Replay: Winner' : 'Replay: Result',
      fallback: true,
    }));
    const combined = [...selected];
    fallbackEvents.forEach((event) => {
      if (combined.length >= maxEvents) return;
      const duplicate = combined.some((existing) => existing.marbleId && existing.marbleId === event.marbleId);
      if (!duplicate) combined.push(event);
    });
    return (combined.length ? combined : fallbackEvents).slice(0, maxEvents);
  }

  showReplayHighlightOverlay({ stage = this.getCupStage(), duration = CUP_VIDEO_TIMING.replayHighlightSeconds } = {}) {
    this.recordRaceHistorySample({ force: true });
    const events = this.selectReplayHighlightEvents(stage);
    this.captureReplayOriginalSnapshots();
    this.setBgmMode('podium');
    this.replayHighlight = { active: true, stage, events, startedAt: this.elapsed, startedAtMs: performance.now(), duration, playback: this.buildReplayHighlightPlayback(events, duration) };
    if (this.ui?.replayHighlight) this.ui.replayHighlight.classList.add('hidden');
    this.updateReplayHighlightPlayback(0);
    return events;
  }

  restoreFinishPodiumPositions() {
    const collector = this.finishRankingContainer;
    if (!collector || !this.marbleData?.length) return 0;
    const ranking = this.getPodiumRanking({ force: true })
      .filter((data) => data?.finished && !data.defeated && !data.removedFromRace)
      .sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity));
    ranking.forEach((data, index) => {
      if (!data?.mesh || !data?.finished || data.defeated || data.removedFromRace) return;
      const rank = index + 1;
      data.rank = rank;
      const target = this.getRankingSlotPosition(index, collector, data.radius, rank);
      data.mesh.position.copy(target);
      if (data.body) {
        data.body.position.copy(target);
        data.body.velocity.set(0, 0, 0);
        data.body.angularVelocity.set(0, 0, 0);
        data.body.type = CANNON.Body.KINEMATIC;
        data.body.mass = 0;
        data.body.updateMassProperties();
        data.body.sleep();
      }
      data.mesh.visible = true;
      data.mesh.scale.setScalar(1);
      if (data.labelSprite) {
        data.labelSprite.visible = data.mesh.visible;
        data.labelSprite.position.copy(data.mesh.position).add(new THREE.Vector3(0, data.radius + 0.82, 0));
        delete data.labelBaseScale;
      }
    });
    return ranking.length;
  }

  hideReplayHighlightOverlay({ restorePodium = false } = {}) {
    if (this.ui?.replayHighlight) this.ui.replayHighlight.classList.add('hidden');
    this.restoreReplayOriginalSnapshots();
    if (restorePodium) {
      this.restoreFinishPodiumPositions();
      this.cameraMode = 'default';
      this.resetPodiumCeremony();
      this.startPodiumCeremony();
    }
    if (this.activeCaption?.kind === 'replay') this.hideBroadcastCaption();
    if (this.replayHighlight) {
      this.replayHighlight.active = false;
      this.replayHighlight.playback = null;
    }
  }

  getBroadcastRankForMarble(marbleId = null) {
    if (marbleId == null) return null;
    const ranking = this.getRanking({ force: false });
    const index = ranking.findIndex((data) => data.id === marbleId);
    return index >= 0 ? index + 1 : null;
  }

  shouldOmitBroadcastAction({ kind = 'general', marbleId = null } = {}) {
    if (kind === 'dnf') return false;
    const rank = this.getBroadcastRankForMarble(marbleId);
    return Number.isFinite(rank) && rank > 5;
  }

  pickShortActionLine(lines = [], fallback = '', seed = 0) {
    const cleanLines = (Array.isArray(lines) ? lines : [lines])
      .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!cleanLines.length) return String(fallback || '').replace(/\s+/g, ' ').trim();
    const rawSeed = Number.isFinite(seed) ? seed : performance.now();
    return cleanLines[Math.abs(Math.round(rawSeed * 997)) % cleanLines.length];
  }

  buildPodiumResultLine(ranking = this.getPodiumRanking({ force: true })) {
    const podium = (ranking || []).filter((data) => data).slice(0, 3);
    if (!podium.length) return 'Final positions locked in';
    return podium
      .map((data, index) => `${['1st', '2nd', '3rd'][index] || `#${index + 1}`} ${data.name || `Marble ${data.id + 1}`}`)
      .join(', ');
  }

  pushBroadcastEvent(title, detail = '', { kind = 'general', force = false, marbleId = null, rivalId = null, distance = null, progress = null, lines = null, preparedAudio = null } = {}) {
    if (this.shouldOmitBroadcastAction({ kind, marbleId })) return;
    if (!force && this.elapsed - (this.lastBroadcastAt || -Infinity) < 2.2) return;
    this.lastBroadcastAt = this.elapsed;
    if (this.activeCaption && !force) this.hideBroadcastCaption();
    const leader = this.getRanking({ force: false })[0];
    const event = {
      title,
      detail,
      kind,
      time: this.elapsed,
      marbleId: marbleId ?? leader?.id ?? null,
      rivalId,
      distance: distance ?? leader?.distance ?? null,
      progress: progress ?? leader?.progress ?? null,
      lines,
      preparedAudio,
    };
    this.noteToyParkBroadcastMoment(event);
    this.broadcastEvents.unshift(event);
    this.broadcastEvents = this.broadcastEvents.slice(0, 10);
    this.activeCaption = { ...event, expiresAt: this.elapsed + 2.8 };
    if (this.ui.captionTitle) this.ui.captionTitle.textContent = title;
    if (this.ui.captionDetail) this.ui.captionDetail.textContent = detail;
    this.ui.caption?.classList.add('hidden');
    this.queueCommentary(event, { force });
  }

  hideBroadcastCaption() {
    this.ui?.caption?.classList.add('hidden');
  }


  getAvailableTtsVoiceNames() {
    const optionVoices = Array.from(this.ui?.ttsVoiceSelect?.options || []).map((option) => option.value).filter(Boolean);
    const browserVoices = typeof window !== 'undefined' && window.speechSynthesis
      ? window.speechSynthesis.getVoices().map((voice) => voice.name).filter(Boolean)
      : [];
    return [...new Set([...optionVoices, ...browserVoices])];
  }

  initTtsVoiceSelector() {
    const select = this.ui?.ttsVoiceSelect;
    if (!select) return;
    const populate = () => {
      const current = this.localTtsBridge?.voice || select.value || 'Alex';
      const names = this.getAvailableTtsVoiceNames();
      names.forEach((name) => {
        if (!Array.from(select.options).some((option) => option.value === name)) {
          select.add(new Option(name, name));
        }
      });
      select.value = Array.from(select.options).some((option) => option.value === current) ? current : 'Alex';
      this.setTtsVoice(select.value, { resetQueue: false, updateStatus: false });
    };
    populate();
    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener?.('voiceschanged', populate);
      window.speechSynthesis.onvoiceschanged = populate;
    }
  }

  setTtsVoice(voice = 'Alex', { resetQueue = true, updateStatus = true } = {}) {
    const clean = String(voice || 'Alex').replace(/[^\w .'-]/g, '').trim().slice(0, 48) || 'Alex';
    if (this.localTtsBridge) {
      this.localTtsBridge.voice = clean;
      this.localTtsBridge.available = null;
      this.localTtsBridge.status = 'unknown';
      this.localTtsBridge.cachedAudio?.clear?.();
    }
    const select = this.ui?.ttsVoiceSelect;
    if (select) {
      if (!Array.from(select.options).some((option) => option.value === clean)) select.add(new Option(clean, clean));
      select.value = clean;
    }
    this.commentaryBrowserVoiceName = clean;
    if (resetQueue) this.resetCommentaryVoiceQueue({ cancelCurrent: true, clearLastLine: false });
    if (updateStatus && this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = `Voice: ${clean}`;
    return clean;
  }

  setTtsPitch(pitch = 1, { resetQueue = true, updateStatus = true } = {}) {
    const numeric = Number.parseFloat(pitch);
    const clean = clamp(Number.isFinite(numeric) ? numeric : 1, 0.7, 1.3);
    this.ttsPitch = Number(clean.toFixed(2));
    if (this.localTtsBridge) {
      this.localTtsBridge.pitch = this.ttsPitch;
      this.localTtsBridge.cachedAudio?.clear?.();
    }
    if (this.ui?.ttsPitchSlider) this.ui.ttsPitchSlider.value = this.ttsPitch.toFixed(2);
    if (this.ui?.ttsPitchLabel) this.ui.ttsPitchLabel.textContent = `${this.ttsPitch.toFixed(2)}x`;
    if (resetQueue) this.resetCommentaryVoiceQueue({ cancelCurrent: true, clearLastLine: false });
    if (updateStatus && this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = `Pitch: ${this.ttsPitch.toFixed(2)}x`;
    return this.ttsPitch;
  }

  setCommentaryEnabled(enabled = true) {
    this.commentaryEnabled = Boolean(enabled);
    if (this.ui?.commentaryToggle) this.ui.commentaryToggle.checked = this.commentaryEnabled;
    if (!this.commentaryEnabled) this.hideCommentaryCaption();
    return this.commentaryEnabled;
  }

  setCommentaryVoiceEnabled(enabled = true) {
    this.commentaryVoiceEnabled = Boolean(enabled);
    if (this.ui?.commentaryVoiceToggle) this.ui.commentaryVoiceToggle.checked = this.commentaryVoiceEnabled;
    if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = this.commentaryVoiceEnabled ? 'Voice ready' : 'Voice off';
    if (!this.commentaryVoiceEnabled) this.stopCommentaryVoice();
    return this.commentaryVoiceEnabled;
  }

  resetCommentaryVoiceQueue({ cancelCurrent = false, clearLastLine = false } = {}) {
    this.lastCommentaryAt = -Infinity;
    this.lastObstacleCommentaryAt = -Infinity;
    this.lastFinishCommentaryAt = -Infinity;
    if (clearLastLine) this.lastCommentaryVoiceLine = null;
    this.commentaryVoiceQueue = [];
    this.commentaryVoiceSpeaking = false;
    this.commentaryVoicePreparing = false;
    this.commentaryVoiceCurrentLine = null;
    this.commentaryVoiceStartedAt = 0;
    this.commentaryVoiceLastError = null;
    if (cancelCurrent && window.speechSynthesis) window.speechSynthesis.cancel();
    try { this.localTtsBridge?.audioElement?.pause?.(); } catch {}
    if (this.localTtsBridge?.sourceNode) {
      try { this.localTtsBridge.sourceNode.disconnect(); } catch {}
      this.localTtsBridge.sourceNode = null;
    }
    if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = this.commentaryVoiceEnabled ? 'Voice ready' : 'Voice off';
  }

  stopCommentaryVoice() {
    this.resetCommentaryVoiceQueue({ cancelCurrent: true, clearLastLine: false });
  }

  getTtsRecordingPolicy() {
    const ttsSupported = Boolean(window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined');
    const captureStreamAvailable = typeof Audio !== 'undefined' && typeof Audio.prototype?.captureStream === 'function';
    return {
      ttsSupported,
      engine: this.localTtsBridge?.available ? 'mac-local-tts-bridge' : 'browser-speechSynthesis',
      localBridgeEnabled: Boolean(this.localTtsBridge?.enabled),
      localBridgeAvailable: this.localTtsBridge?.available,
      localBridgeStatus: this.localTtsBridge?.status || 'unknown',
      localBridgeVoice: this.localTtsBridge?.voice || null,
      ttsPitch: this.ttsPitch,
      localBridgePitch: this.localTtsBridge?.pitch || this.ttsPitch,
      pageAudioMixed: Boolean(this.recordingAudioDestination),
      captureStreamAvailable,
      directPageMixRecordable: Boolean(this.localTtsBridge?.available),
      tabAudioRequired: !this.localTtsBridge?.available,
      macChromeInstruction: this.localTtsBridge?.available
        ? 'Local macOS say TTS is played through an <audio> element and WebAudio, so it records into WebM without OBS or Share tab audio.'
        : 'For browser speechSynthesis in WebM on macOS, choose This Tab / Current Tab and enable Share tab audio. Browser speechSynthesis does not enter the WebAudio page mix.',
      recommendedFallback: 'Start the Vite dev server so /api/tts can run macOS say + ffmpeg; browser speechSynthesis remains a fallback only.',
      lastBridgeError: this.localTtsBridge?.lastError || this.recordingVoiceBridgeLastError,
    };
  }

  updateTtsRecordingNotice() {
    if (!this.commentaryVoiceEnabled || !this.ui?.ttsTestStatus) return;
    const policy = this.getTtsRecordingPolicy();
    if (this.mediaRecorder?.state === 'recording' && policy.directPageMixRecordable) {
      this.ui.ttsTestStatus.textContent = 'Voice records in page mix';
    } else if (this.mediaRecorder?.state === 'recording' && this.recordingSettings?.audioGranted && !this.recordingSettings?.displayAudioGranted) {
      this.ui.ttsTestStatus.textContent = 'Voice needs Share tab audio';
    } else if (this.mediaRecorder?.state === 'recording' && policy.tabAudioRequired) {
      this.ui.ttsTestStatus.textContent = 'Voice records only with Share tab audio';
    }
  }

  testCommentaryTts() {
    const line = 'TTS test: Marble Rush commentator voice is ready.';
    this.setCommentaryEnabled(true);
    this.setCommentaryVoiceEnabled(true);
    if (this.ui?.commentaryLine) this.ui.commentaryLine.textContent = line;
    const spoken = this.speakCommentary(line, {
      forceNow: true,
      onend: () => {
        if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = 'Voice ready';
      },
      onerror: () => {
        if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = 'TTS blocked';
      },
    });
    if (!spoken && this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = 'TTS blocked';
    this.updateTtsRecordingNotice();
    return spoken;
  }

  getCountdownStarterLine(seed = performance.now()) {
    const fallbackLines = ['The field is set', 'Ready for the rush', 'All eyes on the gate'];
    return this.pickShortActionLine(this.countdownStarterLines || fallbackLines, fallbackLines[0], seed);
  }

  buildCommentaryLine(event = {}) {
    const detail = event.detail || '';
    if (event.countdownLine) return event.countdownLine;
    if (event.lines?.length) return this.pickShortActionLine(event.lines, detail || event.title, event.time || performance.now());
    const templates = {
      start: this.countdownStarterLines || ['The field is set', 'Ready for the rush', 'All eyes on the gate'],
      leader: [detail || event.title || 'New leader', detail || 'Lead changes', detail || 'New P1'],
      overtake: [detail || 'Overtake', detail || 'Move made', detail || 'Position gained'],
      battle: [detail || 'Side by side', detail || 'Close fight', detail || 'Tight gap'],
      obstacle: [detail || event.title || 'Contact', detail || 'Big bounce', detail || 'Track hit'],
      progress: [detail || 'Race progress', detail || 'Progress update', detail || 'Distance check'],
      speed: [detail || 'Speed check', detail || 'Pace shift', detail || 'Momentum change'],
      finish: [detail || 'Final sector', detail || 'Closing in', detail || 'Near the line'],
      winner: [detail || 'Winner', detail || 'Race won', detail || 'Flag taken'],
      complete: [detail || event.title || 'Round settled', detail || 'Result set', detail || 'Podium set'],
      replay: [detail || 'Replay', detail || 'Again', detail || 'One more look'],
      dnf: [detail || 'DNF', detail || 'Out of race', detail || 'No progress'],
      general: [detail || event.title || 'Race update', detail || 'Update', detail || 'Track update'],
    };
    const list = templates[event.kind] || templates.general;
    const index = Math.abs(Math.round((event.time || performance.now()) * 10)) % list.length;
    return list[index].replace(/\s+/g, ' ').trim();
  }

  queueCommentary(event = {}, { force = false } = {}) {
    if (!this.commentaryEnabled) return null;
    if (!force && this.elapsed - (this.lastCommentaryAt || -Infinity) < 2.8) return null;
    if (event.kind === 'obstacle' && !force && this.elapsed - (this.lastObstacleCommentaryAt || -Infinity) < 4.8) return null;
    const line = this.buildCommentaryLine(event);
    this.lastCommentaryAt = this.elapsed;
    if (event.kind === 'obstacle') this.lastObstacleCommentaryAt = this.elapsed;
    const commentary = { line, kind: event.kind || 'general', eventTitle: event.title || '', time: this.elapsed, expiresAt: this.elapsed + 4.2 };
    this.activeCommentary = commentary;
    this.commentaryHistory.unshift(commentary);
    this.commentaryHistory = this.commentaryHistory.slice(0, 12);
    if (this.ui.commentaryLine) this.ui.commentaryLine.textContent = line;
    this.ui.commentaryCaption?.classList.add('hidden');
    this.speakCommentary(line, { preparedAudio: event.preparedAudio || null });
    return commentary;
  }

  speakCommentary(line, options = {}) {
    if (!this.commentaryVoiceEnabled || !line) return false;
    const normalized = String(line).replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    const item = { line: normalized, handlers: options || {}, queuedAt: performance.now(), preparedAudio: options.preparedAudio || null };
    if (options.forceNow) {
      this.commentaryVoiceQueue = [item];
      this.commentaryVoiceSpeaking = false;
      this.commentaryVoicePreparing = false;
      this.commentaryVoiceCurrentLine = null;
      window.speechSynthesis?.cancel?.();
      try { this.localTtsBridge?.audioElement?.pause?.(); } catch {}
    } else {
      const queueLimit = 3;
      const alreadyQueued = this.commentaryVoiceQueue.some((queued) => queued.line === normalized)
        || this.commentaryVoiceCurrentLine === normalized;
      if (alreadyQueued) return true;
      if (this.commentaryVoiceQueue.length >= queueLimit) this.commentaryVoiceQueue.shift();
      this.commentaryVoiceQueue.push(item);
    }
    this.playNextCommentaryVoice();
    return true;
  }

  async checkLocalTtsBridge() {
    if (!this.localTtsBridge?.enabled) return false;
    if (this.localTtsBridge.available !== null) return this.localTtsBridge.available;
    try {
      const response = await fetch('/api/tts/status', { cache: 'no-store' });
      const status = await response.json();
      this.localTtsBridge.available = Boolean(response.ok && status?.ok);
      this.localTtsBridge.status = this.localTtsBridge.available ? 'ready' : 'unavailable';
      this.localTtsBridge.engine = status?.engine || null;
      if (status?.voice && !this.localTtsBridge.voice) this.localTtsBridge.voice = status.voice;
      this.localTtsBridge.lastError = this.localTtsBridge.available ? null : status?.error || 'local-tts-unavailable';
      return this.localTtsBridge.available;
    } catch (error) {
      this.localTtsBridge.available = false;
      this.localTtsBridge.status = 'unavailable';
      this.localTtsBridge.lastError = error?.message || 'local-tts-status-failed';
      return false;
    }
  }

  async prepareLocalTtsAudio(line = this.countdownVoiceLine) {
    if (!this.localTtsBridge?.enabled) return null;
    const bridgeReady = await this.checkLocalTtsBridge();
    if (!bridgeReady) return null;
    const normalized = String(line || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    const voice = this.localTtsBridge.voice || 'Alex';
    const pitch = this.ttsPitch || this.localTtsBridge.pitch || 1;
    const url = `/api/tts?voice=${encodeURIComponent(voice)}&pitch=${encodeURIComponent(pitch.toFixed(2))}&text=${encodeURIComponent(normalized)}`;
    const cached = this.localTtsBridge.cachedAudio?.get(url);
    if (cached?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return { audio: cached, url, line: normalized, cached: true };
    const audio = cached || new Audio(url);
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.volume = 1;
    this.localTtsBridge.cachedAudio?.set(url, audio);
    await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('loadeddata', onReady);
        audio.removeEventListener('error', onError);
      };
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('local-audio-preload-error'));
      };
      audio.addEventListener('canplaythrough', onReady, { once: true });
      audio.addEventListener('canplay', onReady, { once: true });
      audio.addEventListener('loadeddata', onReady, { once: true });
      audio.addEventListener('error', onError, { once: true });
      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onReady();
      else audio.load();
      setTimeout(onReady, 900);
    });
    return { audio, url, line: normalized, cached: false };
  }

  async playLocalTtsLine(next) {
    if (!this.localTtsBridge?.enabled) return false;
    if (!this.ensureAudioReady() || !this.audioContext || !this.audioMasterGain) return false;
    try {
      const prepared = next.preparedAudio || await this.prepareLocalTtsAudio(next.line);
      if (!prepared?.audio) return false;
      const { url } = prepared;
      const audio = prepared.audio.cloneNode ? prepared.audio.cloneNode(true) : prepared.audio;
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audio.volume = 1;
      try { audio.pause(); audio.currentTime = 0; } catch {}
      const sourceNode = this.audioContext.createMediaElementSource(audio);
      sourceNode.connect(this.audioMasterGain);
      if (this.localTtsBridge.sourceNode) {
        try { this.localTtsBridge.sourceNode.disconnect(); } catch {}
      }
      this.localTtsBridge.audioElement = audio;
      this.localTtsBridge.sourceNode = sourceNode;
      this.localTtsBridge.lastUrl = url;
      this.localTtsBridge.lastLine = next.line;
      this.localTtsBridge.status = 'playing';
      this.localTtsBridge.lastError = null;
      this.recordingVoiceBridgeLastError = null;
      this.commentaryVoiceSpeaking = true;
      this.commentaryVoiceCurrentLine = next.line;
      this.commentaryVoiceStartedAt = performance.now();
      if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = next.handlers?.forceNow ? 'Playing local voice…' : `Local voice… ${this.commentaryVoiceQueue.length ? `(+${this.commentaryVoiceQueue.length})` : ''}`;
      audio.onended = () => {
        this.commentaryVoiceSpeaking = false;
        this.lastCommentaryVoiceLine = next.line;
        this.commentaryVoiceCurrentLine = null;
        this.localTtsBridge.status = 'ready';
        try { sourceNode.disconnect(); } catch {}
        if (this.localTtsBridge.sourceNode === sourceNode) this.localTtsBridge.sourceNode = null;
        if (typeof next.handlers?.onend === 'function') next.handlers.onend();
        else if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = this.commentaryVoiceQueue.length ? `Queued ${this.commentaryVoiceQueue.length}` : 'Voice ready';
        this.playNextCommentaryVoice();
      };
      audio.onerror = () => {
        this.commentaryVoiceSpeaking = false;
        this.commentaryVoiceCurrentLine = null;
        this.localTtsBridge.status = 'error';
        this.localTtsBridge.lastError = 'local-audio-playback-error';
        this.recordingVoiceBridgeLastError = this.localTtsBridge.lastError;
        try { sourceNode.disconnect(); } catch {}
        if (this.localTtsBridge.sourceNode === sourceNode) this.localTtsBridge.sourceNode = null;
        if (typeof next.handlers?.onerror === 'function') next.handlers.onerror({ error: this.localTtsBridge.lastError });
        else if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = 'Local voice error';
        this.playBrowserSpeechLine(next);
      };
      await audio.play();
      return true;
    } catch (error) {
      this.localTtsBridge.available = false;
      this.localTtsBridge.status = 'error';
      this.localTtsBridge.lastError = error?.message || 'local-tts-play-failed';
      this.recordingVoiceBridgeLastError = this.localTtsBridge.lastError;
      this.commentaryVoiceSpeaking = false;
      this.commentaryVoiceCurrentLine = null;
      return false;
    }
  }

  playBrowserSpeechLine(next) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return false;
    try {
      const utterance = new SpeechSynthesisUtterance(next.line);
      const desiredVoice = this.commentaryBrowserVoiceName || this.localTtsBridge?.voice || '';
      const browserVoice = window.speechSynthesis.getVoices().find((voice) => voice.name === desiredVoice);
      if (browserVoice) utterance.voice = browserVoice;
      utterance.rate = 1.08;
      utterance.pitch = this.ttsPitch || 1;
      utterance.volume = 0.86;
      this.commentaryVoiceSpeaking = true;
      this.commentaryVoiceCurrentLine = next.line;
      this.commentaryVoiceStartedAt = performance.now();
      this.commentaryVoiceLastError = null;
      if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = next.handlers?.forceNow ? 'Playing browser voice…' : `Browser voice… ${this.commentaryVoiceQueue.length ? `(+${this.commentaryVoiceQueue.length})` : ''}`;
      utterance.onend = () => {
        this.commentaryVoiceSpeaking = false;
        this.lastCommentaryVoiceLine = next.line;
        this.commentaryVoiceCurrentLine = null;
        if (typeof next.handlers?.onend === 'function') next.handlers.onend();
        else if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = this.commentaryVoiceQueue.length ? `Queued ${this.commentaryVoiceQueue.length}` : 'Voice ready';
        this.playNextCommentaryVoice();
      };
      utterance.onerror = (error) => {
        this.commentaryVoiceSpeaking = false;
        this.commentaryVoiceCurrentLine = null;
        this.commentaryVoiceLastError = error?.error || 'speech-error';
        if (typeof next.handlers?.onerror === 'function') next.handlers.onerror(error);
        else if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = 'TTS error';
        this.playNextCommentaryVoice();
      };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      console.warn('Commentary voice unavailable', error);
      this.commentaryVoiceSpeaking = false;
      this.commentaryVoiceCurrentLine = null;
      this.commentaryVoiceLastError = error?.message || 'speech-exception';
      if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = 'TTS error';
      return false;
    }
  }

  async playNextCommentaryVoice() {
    if (!this.commentaryVoiceEnabled || this.commentaryVoiceSpeaking || this.commentaryVoicePreparing || !this.commentaryVoiceQueue.length) return false;
    const next = this.commentaryVoiceQueue.shift();
    this.commentaryVoicePreparing = true;
    let localPlayed = false;
    try {
      localPlayed = await this.playLocalTtsLine(next);
    } finally {
      this.commentaryVoicePreparing = false;
    }
    if (localPlayed) return true;
    const browserPlayed = this.playBrowserSpeechLine(next);
    if (!browserPlayed) {
      this.commentaryVoiceLastError = this.localTtsBridge?.lastError || 'tts-unavailable';
      if (typeof next.handlers?.onerror === 'function') next.handlers.onerror({ error: this.commentaryVoiceLastError });
      else if (this.ui?.ttsTestStatus) this.ui.ttsTestStatus.textContent = 'TTS unavailable';
      if (this.commentaryVoiceQueue.length) queueMicrotask(() => this.playNextCommentaryVoice());
    }
    return browserPlayed;
  }

  hideCommentaryCaption() {
    this.activeCommentary = null;
    this.ui?.commentaryCaption?.classList.add('hidden');
  }

  getMarbleSpeed(data = null) {
    const velocity = data?.body?.velocity;
    if (!velocity) return 0;
    if (typeof velocity.length === 'function') return velocity.length();
    return Math.hypot(velocity.x || 0, velocity.y || 0, velocity.z || 0);
  }

  formatRacePercent(progress = 0) {
    return `${Math.round(clamp(progress || 0, 0, 1) * 100)}%`;
  }

  buildRaceMetricLines({ leader, second = null, progressPercent = 0, speed = 0, speedBand = 'steady', gap = null } = {}) {
    const name = leader?.name || 'Leader';
    const rival = second?.name || 'the pack';
    const percent = `${Math.round(progressPercent)}%`;
    const speedText = `${speed.toFixed(1)} m/s`;
    const gapText = Number.isFinite(gap) ? `${gap.toFixed(1)}m gap` : 'tight gap';
    const progressLines = [
      `${name} is ${percent} through`,
      `${percent} done, ${name} leads`,
      `${name} reaches ${percent} race distance`,
      `${percent} on the board, ${rival} chasing`,
      `${name} controls it at ${percent}`,
      `${percent} complete, ${gapText}`,
    ];
    const speedLines = speedBand === 'fast'
      ? [
          `${name} flying at ${speedText}`,
          `${name} hits top pace, ${speedText}`,
          `Fast sector for ${name}, ${speedText}`,
          `${name} carrying serious speed`,
          `${speedText} from ${name}, big momentum`,
          `${name} opens the throttle`,
        ]
      : speedBand === 'slow'
        ? [
            `${name} slows to ${speedText}`,
            `${name} needs momentum`,
            `Pace drops, ${rival} can attack`,
            `${name} crawling through traffic`,
            `${speedText} now, pressure rising`,
            `${name} looking for a cleaner line`,
          ]
        : [
            `${name} steady at ${speedText}`,
            `${name} keeps the rhythm`,
            `${speedText} and stable up front`,
            `${name} balances speed and control`,
            `${rival} still within range`,
            `${name} keeps it tidy`,
          ];
    return { progressLines, speedLines };
  }

  pushRaceMetricCommentary(ranking = this.getRanking({ force: false })) {
    if (this.state !== 'running' || !ranking.length) return;
    const leader = ranking[0];
    if (!leader || leader.finished || leader.defeated) return;
    const second = ranking.find((data) => !data.finished && !data.defeated && data.id !== leader.id) || null;
    const progress = clamp(leader.progress || (this.trackLength ? (leader.distance || 0) / this.trackLength : 0), 0, 1);
    const progressPercent = progress * 100;
    const speed = this.getMarbleSpeed(leader);
    const maxSpeed = Math.max(1, this.speedPreset?.maxSpeed || 17);
    const gap = second ? Math.max(0, (leader.distance || 0) - (second.distance || 0)) : null;
    const speedBand = speed >= maxSpeed * 0.78 ? 'fast' : speed <= maxSpeed * 0.36 ? 'slow' : 'steady';
    const { progressLines, speedLines } = this.buildRaceMetricLines({ leader, second, progressPercent, speed, speedBand, gap });

    const milestone = Math.floor(progressPercent / 20) * 20;
    if (milestone >= 20 && milestone <= 80 && milestone > (this.lastProgressMilestone || 0) && this.elapsed - (this.lastProgressCommentaryAt || -Infinity) > 5.5) {
      this.lastProgressMilestone = milestone;
      this.lastProgressCommentaryAt = this.elapsed;
      const detail = `${leader.name} ${milestone}% through`;
      this.pushBroadcastEvent('Race Progress', detail, { kind: 'progress', marbleId: leader.id, distance: leader.distance, progress, lines: progressLines });
      return;
    }

    const paceChanged = this.lastPaceBand && speedBand !== this.lastPaceBand;
    if ((paceChanged || speedBand === 'fast') && this.elapsed > 4 && this.elapsed - (this.lastSpeedCommentaryAt || -Infinity) > 7.5) {
      this.lastPaceBand = speedBand;
      this.lastSpeedCommentaryAt = this.elapsed;
      const detail = `${leader.name} ${speed.toFixed(1)} m/s`;
      this.pushBroadcastEvent(speedBand === 'fast' ? 'Speed Burst' : speedBand === 'slow' ? 'Pace Drop' : 'Pace Check', detail, { kind: 'speed', marbleId: leader.id, distance: leader.distance, progress, lines: speedLines });
    } else if (!this.lastPaceBand) {
      this.lastPaceBand = speedBand;
    }
  }

  updateRaceStorylines(ranking) {
    if (this.state !== 'running' || !ranking.length || this.elapsed < 1.2) return;
    const topFive = ranking.slice(0, 5);
    const currentIds = topFive.map((data) => data.id);
    const previousIds = this.previousTopFiveIds || [];

    if (previousIds.length) {
      const overtakes = topFive
        .map((data, index) => {
          const previousIndex = previousIds.indexOf(data.id);
          return { data, index, previousIndex };
        })
        .filter(({ index, previousIndex }) => previousIndex > index);
      const frontOvertake = overtakes.sort((a, b) => (a.index - b.index) || (b.previousIndex - a.previousIndex))[0];
      if (frontOvertake && this.elapsed - (this.lastOvertakeAt || -Infinity) > 3.6) {
        const passed = topFive[frontOvertake.index + 1] || ranking.find((data) => data.id === previousIds[frontOvertake.index]);
        this.lastOvertakeAt = this.elapsed;
        const position = `P${frontOvertake.index + 1}`;
        const racerName = frontOvertake.data.name;
        const rivalName = passed?.name || '';
        const detail = passed && passed.id !== frontOvertake.data.id
          ? `${racerName} slips into ${position}`
          : `${racerName} climbs to ${position}`;
        const lines = passed && passed.id !== frontOvertake.data.id
          ? [
              `${racerName} slips into ${position}`,
              `${racerName} edges past ${rivalName}`,
              `${racerName} steals ${position}`,
              `${racerName} gets the run on ${rivalName}`,
              `${racerName} jumps ahead`,
              `${racerName} wins that duel`,
              `${racerName} noses in front`,
              `${racerName} finds a lane`,
            ]
          : [
              `${racerName} climbs to ${position}`,
              `${racerName} gains ground`,
              `${racerName} moves up`,
              `${racerName} into ${position}`,
              `${racerName} makes progress`,
              `${racerName} advances`,
            ];
        this.pushBroadcastEvent('Overtake!', detail, { kind: 'overtake', force: true, marbleId: frontOvertake.data.id, rivalId: passed?.id ?? null, distance: frontOvertake.data.distance, progress: frontOvertake.data.progress, lines });
      }
    }

    const livePair = topFive.find((data, index) => {
      const next = topFive[index + 1];
      return next && !data.finished && !next.finished && Math.abs((data.distance || 0) - (next.distance || 0)) <= 2.8;
    });
    if (livePair && this.elapsed - (this.lastNeckAndNeckAt || -Infinity) > 6.5) {
      const index = topFive.indexOf(livePair);
      const rival = topFive[index + 1];
      this.lastNeckAndNeckAt = this.elapsed;
      const gap = Math.abs((livePair.distance || 0) - (rival.distance || 0));
      this.pushBroadcastEvent('Neck and Neck', `${livePair.name} vs ${rival.name}`, { kind: 'battle', marbleId: livePair.id, rivalId: rival.id, distance: livePair.distance, progress: livePair.progress, lines: [`${livePair.name} vs ${rival.name}`, `${livePair.name} under pressure`, `${rival.name} right there`] });
    }

    this.previousTopFiveIds = currentIds;
    this.topFiveSnapshot = topFive.map((data, index) => ({
      rank: index + 1,
      id: data.id,
      name: data.name,
      progress: data.progress || 0,
      distance: data.distance || 0,
      finished: Boolean(data.finished),
    }));
  }

  updateBroadcastDirector() {
    if (this.activeCaption && this.elapsed > this.activeCaption.expiresAt) {
      this.activeCaption = null;
      this.hideBroadcastCaption();
    }
    if (this.activeCommentary && this.elapsed > this.activeCommentary.expiresAt) this.hideCommentaryCaption();
    const ranking = this.getRanking({ force: false });
    this.pushRaceMetricCommentary(ranking);
    this.updateRaceStorylines(ranking);
    const leader = ranking[0];
    if (!leader) return;
    if (leader.id !== this.lastBroadcastLeaderId && this.elapsed > 2.0) {
      this.lastBroadcastLeaderId = leader.id;
      this.pushBroadcastEvent('New Leader', `${leader.name} leads`, { kind: 'leader', marbleId: leader.id, distance: leader.distance, progress: leader.progress, lines: [`${leader.name} leads`, `${leader.name} grabs P1`, `${leader.name} out front`, `${leader.name} sets the pace`, `${leader.name} owns the lead`] });
    }
    const second = ranking.find((data) => !data.finished && data.id !== leader.id);
    if (second && !leader.finished && leader.distance - second.distance < 5 && this.elapsed - this.lastCloseBattleAt > 5) {
      this.lastCloseBattleAt = this.elapsed;
      this.pushBroadcastEvent('Close Battle', `${leader.name} vs ${second.name}`, { kind: 'battle', marbleId: leader.id, rivalId: second.id, distance: leader.distance, progress: leader.progress, lines: [`${leader.name} vs ${second.name}`, `${second.name} closes in`, `${leader.name} holds on`] });
    }
    if (!leader.finished && leader.progress > 0.82 && this.elapsed - this.lastFinalStretchAt > 8) {
      this.lastFinalStretchAt = this.elapsed;
      this.pushBroadcastEvent('Final Stretch', `${leader.name} closing`, { kind: 'finish', marbleId: leader.id, distance: leader.distance, progress: leader.progress, lines: [`${leader.name} closing`, `${leader.name} near finish`, `${leader.name} final push`] });
    }
  }

  resetFinishSlowMotion() {
    this.finishSlowMotion = {
      active: false,
      triggered: false,
      startElapsed: 0,
      timeScale: 1,
      triggerWinner: null,
      triggerRank: null,
      triggeredAt: null,
      triggerReason: null,
      preFinishDistance: null,
      startedAtMs: 0,
      endedAt: null,
    };
  }

  getFinishSlowMotionTimeScale() {
    const state = this.finishSlowMotion;
    if (!FINISH_SLOW_MOTION.enabled || !state?.active) return 1;
    const age = Math.max(0, (performance.now() - (state.startedAtMs || performance.now())) / 1000);
    const easeIn = Math.max(0.001, FINISH_SLOW_MOTION.easeInSeconds);
    const hold = Math.max(0, FINISH_SLOW_MOTION.holdSeconds);
    const easeOut = Math.max(0.001, FINISH_SLOW_MOTION.easeOutSeconds);
    const minScale = clamp(FINISH_SLOW_MOTION.minTimeScale, 0.05, 1);
    if (age >= FINISH_SLOW_MOTION.duration) {
      state.active = false;
      state.timeScale = 1;
      state.endedAt = this.elapsed;
      return 1;
    }
    if (age < easeIn) {
      const t = 1 - Math.pow(1 - age / easeIn, 3);
      return lerp(1, minScale, t);
    }
    if (age < easeIn + hold) return minScale;
    const t = clamp((age - easeIn - hold) / easeOut, 0, 1);
    return lerp(minScale, 1, t * t * (3 - 2 * t));
  }

  triggerFinishSlowMotion(winner, { reason = FINISH_SLOW_MOTION.trigger, crossed = false } = {}) {
    if (!FINISH_SLOW_MOTION.enabled || this.finishSlowMotion?.triggered) return;
    this.finishSlowMotion = {
      active: true,
      triggered: true,
      startElapsed: this.elapsed,
      timeScale: FINISH_SLOW_MOTION.minTimeScale,
      triggerWinner: winner?.name || null,
      triggerRank: winner?.rank || 1,
      triggerReason: reason,
      preFinishDistance: crossed ? 0 : Math.max(0, this.trackLength - (winner?.distance || 0)),
      triggeredAt: this.elapsed,
      startedAtMs: performance.now(),
      endedAt: null,
    };
    const detail = crossed
      ? `${winner?.name || 'Leader'} finishes`
      : `${winner?.name || 'Leader'} near finish`;
    this.pushBroadcastEvent(crossed ? 'Slow Motion Finish' : 'Final Slow-Mo', detail, { kind: 'winner', force: true, marbleId: winner?.id ?? null, lines: crossed ? [`${winner?.name || 'Leader'} finishes`, `${winner?.name || 'Leader'} takes flag`, `${winner?.name || 'Leader'} wins`] : [`${winner?.name || 'Leader'} near finish`, `${winner?.name || 'Leader'} closing`, `${winner?.name || 'Leader'} final push`] });
  }

  updatePreFinishSlowMotionTrigger() {
    if (!FINISH_SLOW_MOTION.enabled || this.finishSlowMotion?.triggered || this.state !== 'running') return;
    if (this.finishers.length > 0 || !this.marbleData.length) return;
    const finishThreshold = FINISH_LINE_RULE.threshold ?? 0.08;
    const triggerDistance = Math.max(finishThreshold + 0.4, FINISH_SLOW_MOTION.preFinishDistance ?? 8);
    const leader = this.getRanking({ force: false }).find((data) => !data.finished);
    if (!leader) return;
    const remaining = this.trackLength - (leader.distance || 0);
    if (remaining <= triggerDistance && remaining > finishThreshold) {
      const slowMotionCameraHold = Math.max(
        FINISH_SLOW_MOTION.duration || 0,
        BROADCAST_CAMERA.finishSlowMotionCameraHoldSeconds || 0,
      );
      this.defaultCameraPhaseUntil = Math.max(this.defaultCameraPhaseUntil || 0, this.elapsed + slowMotionCameraHold);
      this.triggerFinishSlowMotion(leader, { reason: 'pre-finish-window', crossed: false });
    }
  }

  spawnFinishConfetti(origin, count = 42, { cannon = false, force = false } = {}) {
    const colors = [0xffd166, 0xff77b7, 0x7cf7d4, 0xffffff, 0x8cff66, 0x66a6ff];
    if (!this.effectBudget) this.effectBudget = this.createEffectBudget();
    if (!this.effectBudgetCounters) this.resetEffectBudgetWindow({ resetCounters: true });
    const maxConfetti = this.effectBudget.maxConfetti ?? this.performanceProfile?.maxConfettiPieces ?? PERFORMANCE_TUNING.maxConfettiPieces;
    const availableSlots = Math.max(0, maxConfetti - (this.confettiPieces?.length || 0));
    const requestedCount = Math.max(0, Math.floor(count || 0));
    const admittedCount = force ? requestedCount : Math.min(requestedCount, availableSlots);
    if (admittedCount <= 0) {
      this.effectBudgetCounters.confettiDenied += requestedCount;
      this.noteEffectBudgetDenial('confetti-count', 'confetti');
      return 0;
    }
    if (admittedCount < requestedCount) this.effectBudgetCounters.confettiDenied += requestedCount - admittedCount;
    this.effectBudgetCounters.confettiAdmitted += admittedCount;
    const finishFrame = this.getTrackFrameAt?.(this.trackLength);
    const cannonOffsets = cannon && finishFrame
      ? [
        finishFrame.right.clone().multiplyScalar(-3.6).add(new THREE.Vector3(0, 0.5, 0)),
        finishFrame.right.clone().multiplyScalar(3.6).add(new THREE.Vector3(0, 0.5, 0)),
        finishFrame.tangent.clone().multiplyScalar(-1.3).add(new THREE.Vector3(0, 1.1, 0)),
      ]
      : [new THREE.Vector3()];
    for (let i = 0; i < admittedCount; i += 1) {
      const color = colors[i % colors.length];
      const shape = i % 5 === 0 ? new THREE.PlaneGeometry(0.16, 0.28) : new THREE.BoxGeometry(0.12, 0.035, 0.24);
      const mesh = new THREE.Mesh(shape, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.94, side: THREE.DoubleSide }));
      const cannonOffset = cannonOffsets[i % cannonOffsets.length];
      mesh.position.copy(origin).add(cannonOffset).add(new THREE.Vector3((this.rng() - 0.5) * 4.8, 1.2 + this.rng() * 2.9, (this.rng() - 0.5) * 4.8));
      const sideBurst = finishFrame ? finishFrame.right.clone().multiplyScalar(((i % 2) ? 1 : -1) * (1.2 + this.rng() * 3.2)) : new THREE.Vector3((this.rng() - 0.5) * 4, 0, 0);
      const forwardBurst = finishFrame ? finishFrame.tangent.clone().multiplyScalar((this.rng() - 0.2) * 2.2) : new THREE.Vector3(0, 0, (this.rng() - 0.5) * 4);
      mesh.userData.velocity = sideBurst.add(forwardBurst).add(new THREE.Vector3(0, 2.6 + this.rng() * 4.8, 0));
      mesh.userData.spin = new THREE.Vector3(this.rng() * 7, this.rng() * 8, this.rng() * 6);
      this.scene.add(mesh);
      this.confettiPieces.push({ mesh, age: 0, life: cannon ? 6.2 : 4.2 });
    }
    this.updateEffectBudgetPeaks();
    return admittedCount;
  }

  updateConfetti(delta) {
    this.confettiPieces = this.confettiPieces.filter((piece) => {
      piece.age += delta;
      piece.mesh.userData.velocity.y -= 5.5 * delta;
      piece.mesh.position.addScaledVector(piece.mesh.userData.velocity, delta);
      piece.mesh.rotation.x += piece.mesh.userData.spin.x * delta;
      piece.mesh.rotation.y += piece.mesh.userData.spin.y * delta;
      piece.mesh.rotation.z += piece.mesh.userData.spin.z * delta;
      piece.mesh.material.opacity = Math.max(0, 0.9 * (1 - piece.age / piece.life));
      if (piece.age >= piece.life) {
        this.scene.remove(piece.mesh);
        return false;
      }
      return true;
    });
  }

  resetPodiumCeremony() {
    this.podiumCeremony = {
      active: false,
      startedAt: 0,
      elapsedSeconds: 0,
      lastConfettiAt: -Infinity,
      confettiBurstCount: 0,
      confettiComplete: false,
      medalists: [],
      spotlightPhase: 0,
    };
  }

  startPodiumCeremony() {
    if (!PODIUM_CEREMONY.enabled || this.podiumCeremony?.active) return;
    this.setBgmMode('podium');
    const ranking = this.getPodiumRanking({ force: true });
    const medalists = ranking.slice(0, 3).map((data, index) => ({ id: data.id, rank: index + 1, name: data.name, colorHex: data.colorHex, finishTime: data.finishTime }));
    const cupStage = this.cupMode?.active ? this.getCupStage() : null;
    const isCupChampionCeremony = cupStage === 'final';
    const duration = isCupChampionCeremony ? PODIUM_CEREMONY.championDuration : PODIUM_CEREMONY.duration;
    this.podiumCeremony = {
      active: true,
      startedAt: this.elapsed,
      elapsedSeconds: 0,
      lastConfettiAt: -Infinity,
      confettiBurstCount: 0,
      confettiComplete: false,
      medalists,
      spotlightPhase: 0,
      duration,
      isCupChampionCeremony,
    };
    const podiumLine = this.buildPodiumResultLine(ranking);
    this.pushBroadcastEvent(
      isCupChampionCeremony ? 'Cup Champion Ceremony' : 'Podium Ceremony',
      podiumLine,
      { kind: 'complete', force: true, lines: [podiumLine] },
    );
  }

  updatePodiumCeremony(delta) {
    if (!this.podiumCeremony?.active || !this.finishRankingContainer) return;
    this.podiumCeremony.elapsedSeconds = (this.podiumCeremony.elapsedSeconds || 0) + Math.max(0, delta || 0);
    const age = this.podiumCeremony.elapsedSeconds;
    this.podiumCeremony.spotlightPhase += delta * 2.2;
    this.podiumCeremony.medalists.forEach((medalist, index) => {
      const data = this.marbleData.find((item) => item.id === medalist.id);
      if (!data?.mesh) return;
      const pulse = 1 + Math.sin(this.podiumCeremony.spotlightPhase + index * 1.7) * 0.08;
      data.mesh.scale.setScalar(pulse);
      if (data.labelSprite) {
        const baseLabelScale = Number.isFinite(data.labelBaseScale) ? data.labelBaseScale : 1;
        const pulseLabelScale = baseLabelScale * (1 + (pulse - 1) * 0.28);
        data.labelSprite.scale.set(pulseLabelScale * 3.8, pulseLabelScale * 0.95, 1);
      }
    });
    const confettiEverySeconds = this.podiumCeremony.isCupChampionCeremony
      ? PODIUM_CEREMONY.championConfettiEverySeconds
      : PODIUM_CEREMONY.confettiEverySeconds;
    const confettiDurationSeconds = this.podiumCeremony.isCupChampionCeremony
      ? PODIUM_CEREMONY.championConfettiDurationSeconds
      : PODIUM_CEREMONY.confettiDurationSeconds;
    const maxConfettiBursts = this.podiumCeremony.isCupChampionCeremony
      ? PODIUM_CEREMONY.championMaxConfettiBursts
      : PODIUM_CEREMONY.maxConfettiBursts;
    const confettiAllowedByAge = !Number.isFinite(confettiDurationSeconds) || age <= confettiDurationSeconds;
    const confettiAllowedByCount = !Number.isFinite(maxConfettiBursts) || (this.podiumCeremony.confettiBurstCount || 0) < maxConfettiBursts;
    if (confettiAllowedByAge && confettiAllowedByCount && age - this.podiumCeremony.lastConfettiAt >= confettiEverySeconds) {
      this.podiumCeremony.lastConfettiAt = age;
      this.podiumCeremony.confettiBurstCount = (this.podiumCeremony.confettiBurstCount || 0) + 1;
      const collector = this.finishRankingContainer;
      const origin = collector.center.clone().add(this.localToWorldOffset(0, 2.1, -0.2, collector.yaw));
      this.spawnFinishConfetti(origin, this.podiumCeremony.isCupChampionCeremony ? 48 : 34, { cannon: true });
    }
    this.podiumCeremony.confettiComplete = !(confettiAllowedByAge && confettiAllowedByCount);
    const ceremonyDuration = this.podiumCeremony.duration ?? PODIUM_CEREMONY.duration;
    if (Number.isFinite(ceremonyDuration) && age >= ceremonyDuration) {
      this.podiumCeremony.active = false;
      this.podiumCeremony.medalists.forEach((medalist) => {
        const data = this.marbleData.find((item) => item.id === medalist.id);
        data?.mesh?.scale.setScalar(1);
        if (data?.labelSprite) {
          const baseLabelScale = Number.isFinite(data.labelBaseScale) ? data.labelBaseScale : 1;
          data.labelSprite.scale.set(baseLabelScale * 3.8, baseLabelScale * 0.95, 1);
        }
      });
    }
  }

  showFinalShowcase() {
    const ranking = this.getRanking({ force: true });
    const winner = ranking[0];
    const comeback = ranking.reduce((best, data) => ((data.stuckResets || 0) + (data.fallPenaltyCount || 0) > ((best?.stuckResets || 0) + (best?.fallPenaltyCount || 0)) ? data : best), ranking[0]);
    const toyParkShowcase = this.isToyParkViewerOverlayActive();
    if (toyParkShowcase && this.ui?.winner) {
      this.ui.winner.textContent = '';
      this.ui.winner.classList.add('hidden');
    }
    const cupStage = this.cupMode?.active ? this.getCupStage() : null;
    const showcaseTitle = this.cupMode?.active
      ? (cupStage === 'final' ? '🏆 Cup Champion Ceremony' : '✅ Qualified')
      : (toyParkShowcase ? 'FINAL RESULT' : '🏁 Group Winner');
    const showcaseHint = this.cupMode?.active
      ? (cupStage === 'final' ? 'Cup Champion' : `${this.getCupStageTitle(cupStage)} qualifiers locked in`)
      : (toyParkShowcase ? 'WINNER LOCKED' : 'Group winner locked in');
    this.showcaseStats = {
      winner: winner ? winner.name : null,
      ceremony: this.podiumCeremony,
      cupMode: this.cupMode?.active ? this.cupMode : null,
      top3: ranking.slice(0, 3).map((data) => ({ name: data.name, code: data.code, finishTime: data.finishTime, colorHex: data.colorHex })),
      comeback: comeback ? comeback.name : null,
      pinballHits: { ...this.pinballInteractions },
      totalPinballHits: Object.values(this.pinballInteractions).reduce((sum, value) => sum + value, 0),
    };
    if (this.ui.finalShowcase) {
      const medals = ['🥇', '🥈', '🥉'];
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
      const finishText = (data) => `${Number.isFinite(data?.finishTime) ? data.finishTime.toFixed(2) : '--'}s`;
      if (toyParkShowcase && !this.cupMode?.active) {
        const safeWinnerId = escapeHtml(winner?.id ?? '');
        const winnerHtml = winner ? `
          <section class="toypark-result-winner" style="--winner-color:${escapeHtml(winner.colorHex || '#ffd43d')}">
            <div class="toypark-result-winner-kicker">🏆 WINNER</div>
            <div class="toypark-result-winner-main">
              <span class="toypark-result-orb" aria-hidden="true"></span>
              <span class="showcase-racer-name toypark-result-name" data-marble-id="${safeWinnerId}" title="Double-click to copy reusable marble identity" style="--medal-color:${escapeHtml(winner.colorHex || '#ffd43d')}">${escapeHtml(winner.name)}</span>
            </div>
            <div class="toypark-result-time">${finishText(winner)}</div>
          </section>` : '';
        const podiumRows = ranking.slice(1, 3).map((data, index) => `<li class="podium-medalist rank-${index + 2}" style="--medal-color:${escapeHtml(data.colorHex || '#ffffff')}"><strong>${medals[index + 1]} #${index + 2}</strong><span class="showcase-racer-name" data-marble-id="${escapeHtml(data.id)}" title="Double-click to copy reusable marble identity" style="--medal-color:${escapeHtml(data.colorHex || '#ffffff')}">${escapeHtml(data.name)}</span><span class="toypark-result-row-time">${finishText(data)}</span></li>`).join('');
        this.ui.finalShowcase.classList.add('toypark-final-result');
        this.ui.finalShowcase.innerHTML = `<div class="toypark-result-flags" aria-hidden="true"><span></span><span></span></div><h2>${escapeHtml(showcaseTitle)}</h2>${winnerHtml}<ol class="podium-list toypark-result-podium">${podiumRows}</ol>`;
      } else {
        this.ui.finalShowcase.classList.remove('toypark-final-result');
        const top3 = ranking.slice(0, 3).map((data, index) => `<li class="podium-medalist rank-${index + 1}"><strong>${medals[index]} #${index + 1}</strong> <span class="showcase-racer-name" data-marble-id="${data.id}" title="Double-click to copy reusable marble identity" style="--medal-color:${data.colorHex}">${data.name}</span> <span>${data.finishTime?.toFixed(2) ?? '--'}s</span></li>`).join('');
        this.ui.finalShowcase.innerHTML = `<h2>${showcaseTitle}</h2><p class="copy-hint">${showcaseHint}</p><ol class="podium-list">${top3}</ol><p>Best comeback: <strong>${this.showcaseStats.comeback || '—'}</strong></p><p>Pinball hits: <strong>${this.showcaseStats.totalPinballHits}</strong></p>`;
      }
      this.ui.finalShowcase.querySelectorAll('.showcase-racer-name').forEach((nameEl) => {
        nameEl.addEventListener('dblclick', (event) => {
          event.stopPropagation();
          const marble = this.marbleData.find((item) => String(item.id) === nameEl.dataset.marbleId);
          if (marble) this.copyReusableMarble(marble, nameEl);
        });
      });
      this.ui.finalShowcase.classList.remove('hidden');
    }
  }
  createMarbles(count) {
    const requestedCols = Math.ceil(Math.sqrt(count));
    const fallbackLayout = this.getStartGateLayout(count);
    const gateEnabled = START_GATE_DESIGN.gateEnabled !== false && (!(this.physicsMechanicKey === 'toyPark' || this.visualThemeKey === 'toyPark') || START_GATE_DESIGN.toyParkGateEnabled !== false);
    const racingGridEnabled = START_GATE_DESIGN.racingGridStartEnabled !== false && !gateEnabled && (this.physicsMechanicKey === 'toyPark' || this.visualThemeKey === 'toyPark');
    const laneCount = racingGridEnabled
      ? Math.max(1, Math.floor(START_GATE_DESIGN.racingGridColumns ?? 4))
      : Math.max(1, this.startCatcher?.laneCount || Math.min(fallbackLayout.stallCount, requestedCols));
    const racingGridBaseRows = racingGridEnabled
      ? Math.max(1, Math.floor(START_GATE_DESIGN.racingGridRows ?? 4))
      : null;
    const racingGridOccupiedPerRow = racingGridEnabled
      ? Math.max(1, Math.min(laneCount, Math.floor(START_GATE_DESIGN.racingGridOccupiedPerRow ?? Math.ceil(laneCount / 2))))
      : null;
    const racingGridRows = racingGridEnabled
      ? Math.max(racingGridBaseRows, Math.ceil(count / Math.max(1, racingGridOccupiedPerRow)))
      : null;
    const gateWidth = this.startCatcher?.gateWidth || fallbackLayout.gateWidth;
    const racingGridWidth = START_GATE_DESIGN.racingGridColumnSpacing ?? 1.45;
    const laneGap = racingGridEnabled
      ? (laneCount > 1 ? racingGridWidth / (laneCount - 1) : 0)
      : Math.max(1.05, gateWidth / Math.max(1, laneCount));
    const cols = laneCount;
    const chuteDepth = this.startCatcher?.depth || START_GATE_DESIGN.chuteDepth;
    const highCountStaging = START_GATE_DESIGN.highCountStaging || {};
    const maxRowsInsideChute = racingGridEnabled
      ? racingGridRows
      : (highCountStaging.enabled === false
        ? Infinity
        : Math.max(1, Math.floor(highCountStaging.maxRowsBeforeHoldingPattern ?? 3)));
    const configuredRacingGridRowSpacing = Math.max(0.95, START_GATE_DESIGN.racingGridRowSpacing ?? 1.28);
    const gateLocalZ = this.getStartPrepLocalZForBack(START_GATE_DESIGN.gateBackDistance);
    const safeChuteBackLocalZ = -chuteDepth / 2 + 0.7;
    const safeChuteFrontLocalZ = gateLocalZ - 0.55;
    const racingGridFrontLocalZ = clamp(gateLocalZ - 0.38, safeChuteBackLocalZ, (this.startCatcher?.frontLocalZ ?? chuteDepth / 2) - 0.95);
    const laneFrontLocalZ = racingGridEnabled
      ? racingGridFrontLocalZ
      : clamp(gateLocalZ - 0.75, safeChuteBackLocalZ, safeChuteFrontLocalZ);
    const racingGridBackLimit = (this.startCatcher?.backLocalZ ?? -chuteDepth / 2) + 0.72;
    const racingGridUsableDepth = Math.max(0.001, laneFrontLocalZ - racingGridBackLimit);
    const racingGridFitRowSpacing = racingGridRows && racingGridRows > 1
      ? racingGridUsableDepth / (racingGridRows - 1)
      : configuredRacingGridRowSpacing;
    const laneRowSpacing = racingGridEnabled
      ? Math.min(configuredRacingGridRowSpacing, racingGridFitRowSpacing)
      : Math.max(1.12, Math.min(laneGap * 0.92, highCountStaging.rowSpacing ?? 1.18));
    const laneBackLocalZ = Math.max(safeChuteBackLocalZ, laneFrontLocalZ - (maxRowsInsideChute - 1) * laneRowSpacing);
    const holdingPatternCols = laneCount;
    const holdingPatternLateralSpacing = laneGap;
    const holdingPatternDepthGap = Math.max(1.05, highCountStaging.holdingPatternDepthGap ?? 1.18);
    const holdingPatternStartLocalZ = Math.max(safeChuteBackLocalZ, laneBackLocalZ - holdingPatternDepthGap);
    this.startStagingLayout = {
      count,
      laneCount,
      gateEnabled,
      racingGridEnabled,
      racingGridStyle: racingGridEnabled ? 'four-column-checkerboard-alternating-two-marbles-per-row' : null,
      racingGridRows,
      racingGridOccupiedPerRow,
      racingGridPattern: racingGridEnabled ? 'row1:0-M-0-M,row2:M-0-M-0,row3:0-M-0-M,row4:M-0-M-0' : null,
      gateWidth,
      laneGap,
      maxRowsInsideChute,
      laneRowSpacing,
      configuredRacingGridRowSpacing,
      racingGridFitRowSpacing,
      racingGridUsableDepth,
      racingGridBackLimit,
      racingGridRowSpacingCompressed: racingGridEnabled ? laneRowSpacing < configuredRacingGridRowSpacing - 0.001 : false,
      holdingPatternCols,
      holdingPatternStartLocalZ,
      holdingPatternLateralSpacing,
      holdingPatternDepthGap,
      mode: racingGridEnabled
        ? 'checkerboard-four-column-four-row-grid-no-gate'
        : (count > cols * maxRowsInsideChute ? 'lane-plus-holding-grid' : 'lane-grid'),
    };
    this.ui.select.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const identity = this.survivorLeague?.active && this.survivorLeague.roster?.[i]
        ? this.survivorLeague.roster[i]
        : this.cupMode?.active && this.cupMode.currentEntrants?.[i]
          ? this.cupMode.currentEntrants[i]
          : this.createMarbleIdentity(i, count);
      const { color } = identity;
      const profile = this.physicsMechanic || PHYSICS_MECHANIC_PROFILES[DEFAULT_PHYSICS_MECHANIC_KEY];
      const radius = identity.radius * (profile.marbleRadiusScale ?? 1);
      const baseMass = 1.1 + (i % 4) * 0.04;
      const mesh = this.makeMarbleMesh(radius, color, i, identity.patternKey, identity.palette, identity.materialKey);
      const labelSprite = this.createMarbleNameLabel(identity.name);
      const gridIndex = racingGridEnabled ? i : i;
      const row = racingGridEnabled
        ? Math.floor(gridIndex / racingGridOccupiedPerRow)
        : Math.floor(i / cols);
      const slotInRow = racingGridEnabled ? gridIndex % racingGridOccupiedPerRow : i % cols;
      const rowStartsWithEmptySlot = racingGridEnabled ? row % 2 === 0 : false;
      const col = racingGridEnabled
        ? Math.min(cols - 1, rowStartsWithEmptySlot ? slotInRow * 2 + 1 : slotInRow * 2)
        : i % cols;
      let lane = (col - (cols - 1) / 2) * laneGap;
      let localZ;
      let localY;
      let stagingMode = racingGridEnabled ? 'racing-grid' : 'lane-grid';
      if (racingGridEnabled) {
        const columnForwardOffset = 0;
        const unclampedLocalZ = laneFrontLocalZ - row * laneRowSpacing + columnForwardOffset;
        const boardBackLimit = racingGridBackLimit;
        const boardFrontLimit = (this.startCatcher?.frontLocalZ ?? chuteDepth / 2) - 0.6;
        localZ = clamp(unclampedLocalZ, boardBackLimit, boardFrontLimit);
        localY = this.getStartChuteFloorTopLocalY(localZ, radius, START_GATE_DESIGN.racingGridSurfaceClearance ?? 0.018);
      } else if (row < maxRowsInsideChute) {
        localZ = clamp(laneFrontLocalZ - row * laneRowSpacing, safeChuteBackLocalZ, safeChuteFrontLocalZ);
        localY = this.getStartChuteFloorTopLocalY(localZ, radius, 0.16);
      } else {
        const holdingIndex = i - cols * maxRowsInsideChute;
        const holdingCol = holdingIndex % holdingPatternCols;
        const holdingRow = Math.floor(holdingIndex / holdingPatternCols);
        lane = (holdingCol - (holdingPatternCols - 1) / 2) * holdingPatternLateralSpacing;
        localZ = clamp(holdingPatternStartLocalZ - holdingRow * holdingPatternDepthGap, safeChuteBackLocalZ, laneBackLocalZ - 0.4);
        localY = this.getStartChuteFloorTopLocalY(localZ, radius, 0.16) + 0.08;
        stagingMode = 'holding-grid-in-chute';
      }
      const backDistance = this.getStartChuteBackDistanceForLocalZ(localZ);
      const start = this.startCatcher.center.clone()
        .add(this.localToWorldOffset(lane, localY, localZ, this.startCatcher.yaw));
      mesh.position.copy(start);
      this.scene.add(mesh);
      const body = new CANNON.Body({
        mass: baseMass * (profile.marbleMassScale ?? 1),
        material: this.marbleMaterial,
        linearDamping: profile.linearDamping ?? NO_ROLLING_SLOWDOWN.marbleLinearDamping,
        angularDamping: profile.angularDamping ?? NO_ROLLING_SLOWDOWN.marbleAngularDamping,
      });
      body.allowSleep = false;
      body.sleepState = CANNON.Body.AWAKE;
      body.addShape(new CANNON.Sphere(radius));
      body.position.copy(mesh.position);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.linearDamping = profile.linearDamping ?? NO_ROLLING_SLOWDOWN.marbleLinearDamping;
      body.angularDamping = profile.angularDamping ?? NO_ROLLING_SLOWDOWN.marbleAngularDamping;
      const data = {
        id: i,
        code: identity.code,
        name: identity.name,
        displayName: identity.displayName,
        reusableIdentity: identity,
        color,
        colorHex: identity.colorHex,
        colorName: identity.colorName,
        palette: identity.palette,
        paletteHex: identity.paletteHex,
        visualThemeKey: identity.visualThemeKey,
        visualThemeName: identity.visualThemeName,
        visualThemeDescription: identity.visualThemeDescription,
        materialKey: identity.materialKey,
        materialName: identity.materialName,
        patternKey: identity.patternKey,
        patternName: identity.patternName,
        sizeKey: identity.sizeKey,
        sizeName: identity.sizeName,
        radius,
        baseRadius: identity.radius,
        baseMass,
        physicsMechanicKey: this.physicsMechanicKey,
        startLocalZ: localZ,
        startLocalY: localY,
        startBackDistance: backDistance,
        startSlotColumn: col,
        startSlotRow: row,
        startSlotLaneCount: laneCount,
        startSlotStagingMode: stagingMode,
        startStagingLayout: this.startStagingLayout,
        startSlotFillMode: START_GATE_DESIGN.slotFillMode,
        startFrozenUntilGateOpen: Boolean(START_GATE_DESIGN.freezeMarblesUntilGateOpen),
        startOnChuteSurface: true,
        mesh,
        labelSprite,
        body,
        finished: false, finishTime: null, defeated: false, defeatTime: null, defeatReason: null, progress: 0, distance: 0,
        lastDistance: 0, lastMovementTime: 0, stuckResets: 0, lastResetTime: -Infinity,
        lastDriveMovementDistance: 0, lastDriveMovementTime: 0,
        lastForwardProgressPercent: 0, lastForwardProgressPercentTime: 0, lastProgressCheckDistance: 0,
        lastSafeDistanceBeforeFall: 0, pendingFallRespawn: null,
        wasAirborne: false,
        airbornePeakClearance: 0,
        lastFallingSpeed: 0,
        lastTrackContactTime: -Infinity,
        landingAbsorberCount: 0,
        lastRailContactTime: -Infinity,
        lastRailContactDistance: null,
        finishDirectionCorrectionCount: 0,
        finalApproachAssistCount: 0,
        slopeDriveForceCount: 0,
        timePenalty: 0, fallPenaltyCount: 0,
        visualQuaternion: mesh.quaternion.clone(), lastVisualPosition: mesh.position.clone(),
        trail: this.createMarbleTrail(color, radius),
        dropTargetBoostAura: null,
        dropTargetBoostActive: false,
        dropTargetBoostUntil: null,
        dropTargetBoostMultiplier: 1,
        dropTargetBoostAllowExceedMaxSpeed: false,
        dropTargetBoostAuraVisible: false,
        dropTargetBoostLastStartedAt: null,
        dropTargetBoostLastExpiredAt: null,
        dropTargetBoostSource: null,
        orbitRingBoostActive: false,
        orbitRingBoostUntil: null,
        orbitRingBoostMultiplier: 1,
        orbitRingBoostAllowExceedMaxSpeed: false,
        orbitRingBoostNormalMaxSpeed: null,
        orbitRingBoostEffectiveMaxSpeed: null,
        orbitRingBoostSecondsRemaining: 0,
        orbitRingBoostAura: null,
        orbitRingBoostAuraVisible: false,
        orbitRingBoostLastStartedAt: null,
        orbitRingBoostLastExpiredAt: null,
        orbitRingBoostSource: null,
      };
      body.addEventListener('collide', (event) => {
        const otherBody = event?.body;
        if (otherBody?.material === this.railMaterial) {
          data.lastRailContactTime = this.elapsed;
          data.lastRailContactDistance = data.driveDistance ?? data.distance ?? 0;
          data.lastRailContactProgress = this.trackLength ? clamp((data.lastRailContactDistance || 0) / this.trackLength, 0, 1) : 0;
          const piece = this.trackPieces.find((trackPiece) => data.lastRailContactDistance >= trackPiece.startD && data.lastRailContactDistance <= trackPiece.endD);
          data.lastRailContactPieceIndex = piece?.index ?? null;
          data.lastRailContactPieceType = piece?.type || null;
          data.railContactCount = (data.railContactCount || 0) + 1;
        }
        if (otherBody?.material === this.trackMaterial) {
          data.lastTrackContactTime = this.elapsed;
        }
      });
      this.world.addBody(body);
      if (START_GATE_DESIGN.freezeMarblesUntilGateOpen) {
        body.type = CANNON.Body.KINEMATIC;
        body.mass = 0;
        body.updateMassProperties();
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        data.startFrozenUntilGateOpen = true;
      }
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = identity.name;
      this.ui.select.appendChild(option);
      this.marbleData.push(data);
    }
  }

  createMarbleIdentity(index, count = this.marbleData.length) {
    const theme = this.visualTheme || MARBLE_VISUAL_THEMES[DEFAULT_MARBLE_VISUAL_THEME_KEY];
    const themeStyles = this.getVisualThemeStyles(theme);
    const colorStyle = themeStyles.colorStyles[index % themeStyles.colorStyles.length];
    const patternStyle = themeStyles.patternStyles[Math.floor(index / themeStyles.colorStyles.length) % themeStyles.patternStyles.length];
    const sizeStyle = MARBLE_SIZE_STYLES[index % MARBLE_SIZE_STYLES.length];
    const materialKey = themeStyles.materialOverride || colorStyle.material || 'glass';
    const materialStyle = MARBLE_MATERIAL_STYLES[materialKey] || MARBLE_MATERIAL_STYLES.glass;
    const paletteHex = colorStyle.palette?.length ? colorStyle.palette : [colorStyle.hex];
    const palette = paletteHex.map((hex) => Number.parseInt(hex.replace('#', ''), 16));
    const visualTagline = `${materialStyle.label} ${patternStyle.label}`;
    const codeNumber = String(index + 1).padStart(Math.max(2, String(count).length), '0');
    const code = `MB-${codeNumber}-${theme.key.slice(0, 3).toUpperCase()}-${colorStyle.hex.slice(1, 4).toUpperCase()}-${patternStyle.key.slice(0, 3).toUpperCase()}-${materialKey.slice(0, 3).toUpperCase()}-${sizeStyle.key}`;
    const name = this.generateName(index);
    return {
      id: index,
      code,
      name,
      displayName: `${code} ${name}`,
      visualThemeKey: theme.key,
      visualThemeName: theme.label,
      visualThemeDescription: theme.description,
      color: colorStyle.color,
      colorHex: colorStyle.hex,
      colorName: colorStyle.label,
      palette,
      paletteHex,
      materialKey,
      materialName: materialStyle.label,
      patternKey: patternStyle.key,
      patternName: patternStyle.label,
      visualTagline,
      sizeKey: sizeStyle.key,
      sizeName: sizeStyle.label,
      radius: sizeStyle.radius,
    };
  }

  makeMarbleMesh(radius, color, index, patternKey = 'rings', palette = null, materialKey = 'glass') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const colorToHex = (value) => `#${Number(value).toString(16).padStart(6, '0')}`;
    const paletteHex = (palette?.length ? palette : [color]).map(colorToHex);
    const base = paletteHex[0];
    const accent = paletteHex[1] || '#ffffff';
    const accent2 = paletteHex[2] || '#050a18';
    const accent3 = paletteHex[3] || '#ffd166';
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    paletteHex.forEach((hex, i) => gradient.addColorStop(paletteHex.length === 1 ? 0 : i / (paletteHex.length - 1), hex));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (patternKey === 'split') {
      ctx.fillStyle = accent;
      ctx.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(canvas.width / 2 - 5, 0, 10, canvas.height);
    } else if (patternKey === 'triad') {
      [base, accent, accent2].forEach((hex, i) => {
        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.moveTo(i * canvas.width / 3, 0);
        ctx.lineTo((i + 1.25) * canvas.width / 3, 0);
        ctx.lineTo((i + 0.75) * canvas.width / 3, canvas.height);
        ctx.lineTo(i * canvas.width / 3 - 20, canvas.height);
        ctx.closePath();
        ctx.fill();
      });
    } else if (patternKey === 'checker') {
      const cell = 24;
      for (let y = 0; y < canvas.height; y += cell) {
        for (let x = 0; x < canvas.width; x += cell) {
          ctx.fillStyle = ((x / cell + y / cell + index) % 2) ? accent : base;
          ctx.fillRect(x, y, cell, cell);
        }
      }
    }

    ctx.globalAlpha = 0.72;
    const drawLoop = patternKey === 'speckle' || patternKey === 'starfield' ? 38 : 12;
    for (let i = 0; i < drawLoop; i += 1) {
      ctx.beginPath();
      ctx.strokeStyle = i % 3 === 0 ? accent : (i % 3 === 1 ? '#ffffff' : accent2);
      ctx.fillStyle = i % 3 === 0 ? accent : (i % 3 === 1 ? 'rgba(255,255,255,0.78)' : accent3);
      ctx.lineWidth = 5 + (index % 3) * 2;
      if (patternKey === 'spiral') {
        const x = 128 + Math.cos(i * 0.95 + index) * (12 + i * 7);
        const y = 64 + Math.sin(i * 0.95 + index) * (8 + i * 3.5);
        ctx.arc(x, y, 12 + i * 4, 0.3 + i * 0.35, Math.PI * 1.45 + i * 0.35);
        ctx.stroke();
      } else if (patternKey === 'ripple') {
        ctx.moveTo(0, 10 + i * 11);
        for (let x = 0; x <= canvas.width; x += 12) {
          ctx.lineTo(x, 10 + i * 11 + Math.sin(x * 0.05 + index + i) * 11);
        }
        ctx.stroke();
      } else if (patternKey === 'speckle' || patternKey === 'starfield') {
        const r = patternKey === 'starfield' ? 1.8 + (i % 4) : 3 + (i % 6);
        ctx.arc((i * 47 + index * 19) % canvas.width, (i * 31 + index * 23) % canvas.height, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (patternKey === 'comet') {
        ctx.moveTo((i * 33) % canvas.width, 16 + (i % 5) * 24);
        ctx.quadraticCurveTo(80 + i * 10, 18 + Math.sin(index + i) * 35, 250 - i * 8, 42 + (i % 4) * 18);
        ctx.stroke();
      } else if (patternKey === 'storm' || patternKey === 'marble-vein') {
        ctx.lineWidth = patternKey === 'marble-vein' ? 3 + (i % 3) : ctx.lineWidth;
        ctx.moveTo((i * 29) % canvas.width, 0);
        ctx.bezierCurveTo(20 + i * 15, 28 + Math.sin(index + i) * 22, 180 - i * 7, 88 + Math.cos(i) * 28, 34 + i * 24 + Math.sin(index + i) * 18, canvas.height);
        ctx.stroke();
      } else if (patternKey === 'chevron') {
        const x = (i * 28) % (canvas.width + 60) - 30;
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 36, canvas.height / 2);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      } else if (patternKey === 'circuit') {
        const y = 12 + (i * 17) % canvas.height;
        ctx.moveTo(0, y);
        ctx.lineTo(52 + (i * 13) % 80, y);
        ctx.lineTo(52 + (i * 13) % 80, (y + 25) % canvas.height);
        ctx.lineTo(canvas.width, (y + 25) % canvas.height);
        ctx.stroke();
        ctx.arc(52 + (i * 13) % 80, (y + 25) % canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (patternKey === 'flame') {
        const x = (i * 31 + index * 7) % canvas.width;
        ctx.moveTo(x, canvas.height);
        ctx.bezierCurveTo(x - 18, 88, x + 12, 64, x - 5, 20 + (i % 4) * 12);
        ctx.bezierCurveTo(x + 28, 58, x + 24, 94, x + 8, canvas.height);
        ctx.fill();
      } else {
        ctx.arc(40 + i * 24, 58 + Math.sin(i + index) * 22, 16 + (i % 4) * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    const highlight = ctx.createRadialGradient(70, 24, 8, 82, 30, 80);
    highlight.addColorStop(0, 'rgba(255,255,255,0.62)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = highlight;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;
    const materialStyle = MARBLE_MATERIAL_STYLES[materialKey] || MARBLE_MATERIAL_STYLES.glass;
    const material = new THREE.MeshStandardMaterial({
      color,
      map: texture,
      roughness: materialStyle.roughness,
      metalness: materialStyle.metalness,
      emissive: color,
      emissiveIntensity: materialStyle.emissiveIntensity,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, this.performanceProfile?.marbleSegments ?? PERFORMANCE_TUNING.marbleSegments, this.performanceProfile?.marbleRings ?? PERFORMANCE_TUNING.marbleRings), material);
    mesh.castShadow = PERFORMANCE_TUNING.shadows;
    mesh.receiveShadow = PERFORMANCE_TUNING.shadows;
    return mesh;
  }

  generateName(i) {
    const adjective = nameAdjectives[Math.floor(this.rng() * nameAdjectives.length)];
    const noun = nameNouns[Math.floor(this.rng() * nameNouns.length)];
    const fallback = `Marble ${i + 1}`;
    return this.limitNameWords(`${adjective} ${noun}`, fallback, 2);
  }

  limitNameWords(name, fallback = 'Marble', maxWords = 2) {
    const cleaned = String(name || fallback)
      .replace(/[^A-Za-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleaned.split(' ').filter(Boolean).slice(0, Math.max(1, maxWords));
    return words.join(' ') || fallback;
  }

  startRace() {
    if (this.state !== 'ready' && this.state !== 'idle') return;
    this.state = 'running';
    this.setBgmMode('race');
    if (this.autoCupRecording?.active && this.autoCupRecording.phase === 'countdown-open-gate') {
      this.autoCupRecording.phase = 'racing';
      this.autoCupRecording.currentStage = this.getCupStage();
    }
    if (this.continuousRecording?.active && this.continuousRecording.phase === 'countdown-open-gate') {
      this.continuousRecording.phase = 'racing';
    }
    if (this.singleRecording?.active && this.singleRecording.phase === 'countdown-open-gate') {
      this.singleRecording.phase = 'racing';
    }
    this.elapsed = 0;
    if (!this.activeCommentary || this.activeCommentary.kind !== 'start') {
      const gateOpenLine = this.getCountdownStarterLine(performance.now());
      const startEventTitle = this.startGate ? 'Gate Open' : 'Race Start';
      this.pushBroadcastEvent(startEventTitle, gateOpenLine, { kind: 'start', force: true, countdownLine: gateOpenLine });
    }
    this.recordRaceHistorySample({ force: true });
    this.ui.start.textContent = 'Re-stage';
    if (this.startGate && !this.startGate.opened) {
      this.startGate.opened = true;
      this.startGate.openProgress = 0;
      this.startGate.bodies.forEach((body) => this.world.removeBody(body));
      this.startGate.bodies = [];
    }
    const startFrame = this.getTrackFrameAt(0);
    this.marbleData.forEach((data, i) => {
      if (data.startFrozenUntilGateOpen) {
        data.body.type = CANNON.Body.DYNAMIC;
        data.body.mass = data.baseMass != null
          ? data.baseMass * (this.physicsMechanic?.marbleMassScale ?? 1)
          : (1.1 + (i % 4) * 0.04);
        data.body.updateMassProperties();
        data.startFrozenUntilGateOpen = false;
      }
      data.body.wakeUp();
      data.body.velocity.set(0, 0, 0);
      data.body.angularVelocity.set(0, 0, 0);
      data.body.linearDamping = this.physicsMechanic?.linearDamping ?? NO_ROLLING_SLOWDOWN.marbleLinearDamping;
      data.body.angularDamping = this.physicsMechanic?.angularDamping ?? NO_ROLLING_SLOWDOWN.marbleAngularDamping;
      if (this.physicsMechanicKey === 'toyPark' && this.toyParkSoftGuidePhysics?.enabled && startFrame?.tangent) {
        const baseLaunchSpeed = Math.max(
          this.toyParkSoftGuidePhysics.launchForwardVelocityMin ?? 0,
          (this.speedPreset.maxSpeed || 0) * (this.toyParkSoftGuidePhysics.launchForwardVelocityRatio ?? 0)
        );
        const competitive = this.toyParkSoftGuidePhysics.competitive || {};
        const launchVarianceRatio = competitive.enabled === false ? 0 : (competitive.launchVarianceRatio ?? 0);
        const deterministicPhase = Math.sin((data.id + 1) * 12.9898 + (data.startSlotColumn || 0) * 78.233 + (data.startSlotRow || 0) * 37.719);
        const launchVariance = deterministicPhase * launchVarianceRatio;
        const rearRows = Math.max(1, (this.startStagingLayout?.racingGridRows || 1) - 1);
        const rearRowRatio = clamp((data.startSlotRow || 0) / rearRows, 0, 1);
        const rearRowBoost = competitive.enabled === false ? 0 : Math.min(
          competitive.rearRowLaunchBoostMax ?? 0,
          rearRowRatio * (competitive.rearRowLaunchBoostRatio ?? 0)
        );
        const launchTangent = startFrame.tangent;
        const maxSpeed = this.speedPreset?.maxSpeed || baseLaunchSpeed;
        const rowWarmupRatio = clamp((data.startSlotRow || 0) / Math.max(1, (this.startStagingLayout?.racingGridRows || 1) - 1), 0, 1);
        const staggeredLaunchSpeed = Math.min(
          maxSpeed * 0.55,
          baseLaunchSpeed * (0.82 + rowWarmupRatio * 0.1 + launchVariance * 0.35 + rearRowBoost * 0.25)
        );
        data.body.velocity.x = launchTangent.x * staggeredLaunchSpeed;
        data.body.velocity.y = Math.max(0, launchTangent.y * staggeredLaunchSpeed);
        data.body.velocity.z = launchTangent.z * staggeredLaunchSpeed;
        data.toyParkLaunchBaseVelocity = Number(baseLaunchSpeed.toFixed(3));
        data.toyParkLaunchForwardVelocity = Number(staggeredLaunchSpeed.toFixed(3));
        data.toyParkLaunchVarianceRatio = Number(launchVariance.toFixed(4));
        data.toyParkLaunchRearRowBoost = Number(rearRowBoost.toFixed(4));
        data.toyParkLaunchForwardVelocityApplied = true;
        data.toyParkLaunchPolicy = 'competitive-toy-park-launch-deterministic-micro-variance-plus-small-rear-row-draft-boost';
      } else {
        data.toyParkLaunchForwardVelocityApplied = false;
      }
      data.startImpulseDisabled = true;
      data.lastDriveMovementDistance = Math.max(data.distance || 0, data.lastDriveMovementDistance || 0);
      data.lastDriveMovementTime = this.elapsed;
      data.lastForwardProgressPercentTime = this.elapsed;
      data.hasObservedForwardProgress = false;
    });
    this.updateUI();
  }

  async startCountdownAndGateOpen() {
    if (this.countdownActive || this.state !== 'ready') return;
    this.setBgmMode('intro');
    const countdownLine = this.getCountdownStarterLine(performance.now());
    let preparedAudio = null;
    this.countdownVoiceWarmupPromise = this.prepareLocalTtsAudio(countdownLine).catch((error) => {
      this.localTtsBridge.lastError = error?.message || 'countdown-voice-warmup-failed';
      return null;
    });
    if (this.commentaryVoiceEnabled && this.localTtsBridge?.enabled) {
      preparedAudio = await this.countdownVoiceWarmupPromise;
      this.countdownVoiceWarmupUrl = preparedAudio?.url || null;
    }
    if (this.state !== 'ready') return;
    this.countdownActive = true;
    this.countdownRemaining = this.countdownDuration;
    this.countdownLastAnnouncedSecond = this.countdownDuration;
    this.ui.start.textContent = 'Counting down';
    this.hideMatchCard();
    this.showCountdownOverlay('3');
    this.pushBroadcastEvent('Race Countdown', countdownLine, { kind: 'start', force: true, countdownLine, preparedAudio });
    this.countdownVoicePlayStartedAt = performance.now();
    this.playCountdownSound(3);
  }

  showCountdownOverlay(value, { isGo = false } = {}) {
    this.startHookVisible = true;
    this.startHookValue = String(value || '');
    this.startHookIsGo = Boolean(isGo);
    this.startHookShownAt = performance.now();
    // Keep the visible countdown in canvas overlays so recorded horizontal/vertical
    // video captures include it. The DOM node is deliberately hidden to avoid the
    // old browser-overlay-only countdown path.
    if (!this.ui.countdown) return;
    this.ui.countdown.textContent = '';
    this.ui.countdown.classList.add('hidden');
    this.ui.countdown.classList.remove('go', 'pulse');
    clearTimeout(this.countdownOverlayTimer);
  }

  hideCountdownOverlay() {
    this.startHookVisible = false;
    this.startHookValue = '';
    this.startHookIsGo = false;
    this.startHookShownAt = 0;
    if (!this.ui.countdown) return;
    this.ui.countdown.classList.add('hidden');
    this.ui.countdown.classList.remove('go', 'pulse');
  }

  updateCountdown(delta) {
    if (!this.countdownActive) return;
    this.countdownRemaining = Math.max(0, this.countdownRemaining - delta);
    const nextSecond = Math.ceil(this.countdownRemaining);
    if (this.countdownRemaining > 0 && nextSecond !== this.countdownLastAnnouncedSecond) {
      this.countdownLastAnnouncedSecond = nextSecond;
      this.showCountdownOverlay(String(nextSecond));
      this.playCountdownSound(nextSecond);
    }
    if (this.countdownRemaining <= 0) {
      this.countdownActive = false;
      this.showCountdownOverlay('Start', { isGo: true });
      this.playCountdownSound('start');
      this.startRace();
      setTimeout(() => this.hideCountdownOverlay(), 500);
    }
  }

  unlockAudio() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    this.audioContext = this.audioContext || new AudioCtor();
    this.audioMasterGain = this.audioMasterGain || this.audioContext.createGain();
    this.audioMasterGain.gain.value = 0.18;
    if (!this.audioMasterGainConnected) {
      this.audioMasterGain.connect(this.audioContext.destination);
      this.audioMasterGainConnected = true;
    }
    this.ensureRecordingAudioDestination();
    this.bgmGain = this.bgmGain || this.audioContext.createGain();
    this.bgmGain.gain.value = this.bgmEnabled ? 0.11 : 0;
    if (!this.bgmGainConnected) {
      this.bgmGain.connect(this.audioMasterGain);
      this.bgmGainConnected = true;
    }
    this.audioContext.resume?.();
    this.audioUnlocked = true;
    if (this.bgmEnabled && !this.bgmTimer) this.startBgm(this.bgmMode || 'idle');
    return true;
  }

  ensureRecordingAudioDestination() {
    if (!this.audioContext?.createMediaStreamDestination || !this.audioMasterGain) return null;
    this.recordingAudioDestination = this.recordingAudioDestination || this.audioContext.createMediaStreamDestination();
    if (!this.recordingAudioDestinationConnected) {
      this.audioMasterGain.connect(this.recordingAudioDestination);
      this.recordingAudioDestinationConnected = true;
    }
    return this.recordingAudioDestination;
  }

  ensureAudioReady() {
    if (!this.audioContext || !this.audioUnlocked) return this.unlockAudio();
    if (this.audioContext.state === 'suspended') this.audioContext.resume?.();
    return true;
  }

  stopBgm() {
    if (this.bgmTimer) clearTimeout(this.bgmTimer);
    this.bgmTimer = null;
    this.bgmNodes.forEach((node) => {
      try { node.stop?.(); } catch {}
      try { node.disconnect?.(); } catch {}
    });
    this.bgmNodes = [];
  }

  scheduleBgmStep(delayMs = 0) {
    if (this.bgmTimer) clearTimeout(this.bgmTimer);
    this.bgmTimer = setTimeout(() => this.playBgmStep(), delayMs);
  }

  startBgm(mode = 'idle') {
    this.bgmMode = mode;
    if (!this.bgmEnabled || !this.audioContext || !this.bgmGain) return false;
    if (this.audioContext.state === 'suspended') this.audioContext.resume?.();
    if (!this.bgmTimer) this.scheduleBgmStep(0);
    return true;
  }

  setBgmMode(mode = 'idle') {
    if (this.bgmMode === mode) return;
    this.bgmMode = mode;
    if (this.bgmEnabled && this.audioUnlocked) {
      this.stopBgm();
      this.startBgm(mode);
    }
  }

  setBgmEnabled(enabled = true) {
    this.bgmEnabled = Boolean(enabled);
    if (this.ui?.bgmToggle) this.ui.bgmToggle.checked = this.bgmEnabled;
    if (!this.bgmEnabled) {
      if (this.bgmGain) this.bgmGain.gain.setTargetAtTime(0, this.audioContext?.currentTime || 0, 0.04);
      this.stopBgm();
      return false;
    }
    if (!this.audioContext || !this.audioUnlocked) this.unlockAudio();
    if (this.audioContext && this.bgmGain) {
      this.bgmGain.gain.setTargetAtTime(0.11, this.audioContext.currentTime, 0.08);
      this.startBgm(this.bgmMode || 'idle');
      return true;
    }
    return false;
  }

  getBgmPattern(mode = this.bgmMode) {
    const patterns = {
      idle: { notes: [196, 246.94, 293.66, 246.94], step: 0.42, gain: 0.028, type: 'sine' },
      intro: { notes: [261.63, 329.63, 392, 523.25], step: 0.24, gain: 0.04, type: 'triangle' },
      race: { notes: [220, 277.18, 329.63, 392, 329.63, 277.18], step: 0.18, gain: 0.045, type: 'sawtooth' },
      podium: { notes: [261.63, 329.63, 392, 523.25, 659.25, 523.25], step: 0.34, gain: 0.052, type: 'triangle' },
    };
    return patterns[mode] || patterns.idle;
  }

  playBgmStep() {
    if (!this.bgmEnabled || !this.audioContext || !this.bgmGain) return;
    const pattern = this.getBgmPattern();
    this.bgmStepIndex = (this.bgmStepIndex || 0) % pattern.notes.length;
    const frequency = pattern.notes[this.bgmStepIndex];
    this.bgmStepIndex += 1;
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = pattern.type;
    osc.frequency.value = frequency;
    amp.gain.value = 0.0001;
    osc.connect(amp);
    amp.connect(this.bgmGain);
    const now = ctx.currentTime;
    amp.gain.exponentialRampToValueAtTime(pattern.gain, now + 0.025);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.08, pattern.step * 0.82));
    osc.start(now);
    osc.stop(now + Math.max(0.1, pattern.step * 0.92));
    this.bgmNodes.push(osc, amp);
    osc.addEventListener('ended', () => {
      this.bgmNodes = this.bgmNodes.filter((node) => node !== osc && node !== amp);
      try { amp.disconnect(); } catch {}
    });
    this.scheduleBgmStep(pattern.step * 1000);
  }

  playTone({ frequency = 440, duration = 0.12, type = 'sine', gain = 0.12, detune = 0 } = {}) {
    if (!this.ensureAudioReady() || !this.audioContext) return;
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    amp.gain.value = 0;
    osc.connect(amp);
    amp.connect(this.audioMasterGain || ctx.destination);
    const now = ctx.currentTime;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  playCountdownSound(step) {
    if (step === 'start') {
      this.playTone({ frequency: 740, duration: 0.2, type: 'triangle', gain: 0.16 });
      setTimeout(() => this.playTone({ frequency: 988, duration: 0.14, type: 'triangle', gain: 0.13 }), 55);
      return;
    }
    const map = { 3: 392, 2: 523.25, 1: 659.25 };
    this.playTone({ frequency: map[step] || 440, duration: 0.12, type: 'square', gain: 0.1 });
  }

  playFinishSound(isFirstFinish = false) {
    this.playTone({ frequency: isFirstFinish ? 880 : 620, duration: 0.16, type: 'triangle', gain: isFirstFinish ? 0.17 : 0.11 });
    if (isFirstFinish) setTimeout(() => this.playTone({ frequency: 1175, duration: 0.12, type: 'triangle', gain: 0.14 }), 60);
  }

  playObstacleHitSound(kind = 'impact') {
    const preset = {
      dropTarget: { frequency: 180, duration: 0.12, type: 'sawtooth', gain: 0.12 },
      slingshot: { frequency: 260, duration: 0.09, type: 'square', gain: 0.09 },
      spinnerGate: { frequency: 320, duration: 0.08, type: 'triangle', gain: 0.08 },
      movingGate: { frequency: 210, duration: 0.1, type: 'square', gain: 0.085 },
      popBumper: { frequency: 520, duration: 0.06, type: 'triangle', gain: 0.08 },
      gongBumper: { frequency: 142, duration: 0.34, type: 'sine', gain: 0.14 },
      impact: { frequency: 240, duration: 0.08, type: 'square', gain: 0.08 },
    }[kind] || { frequency: 240, duration: 0.08, type: 'square', gain: 0.08 };
    this.playTone(preset);
  }

  togglePause() {
    if (this.state === 'ready') return;
    this.state = this.state === 'running' ? 'paused' : 'running';
    this.ui.pause.textContent = this.state === 'paused' ? 'Resume' : 'Pause';
    this.updateUI();
  }

  applyLeftUIState() {
    this.ui.leftHud?.classList.toggle('collapsed', this.leftUICollapsed);
    if (this.ui.uiToggle) {
      this.ui.uiToggle.textContent = 'Like ＆ Subscribe';
      this.ui.uiToggle.title = this.leftUICollapsed ? 'Show left UI' : 'Hide left UI';
      this.ui.uiToggle.setAttribute('aria-expanded', String(!this.leftUICollapsed));
    }
  }

  applyRightUIState() {
    this.ui.rightHud?.classList.toggle('collapsed', this.rightUICollapsed);
    if (this.ui.rightUiToggle) {
      this.ui.rightUiToggle.textContent = '＠VibeGameCreator';
      this.ui.rightUiToggle.title = this.rightUICollapsed ? 'Show right UI' : 'Hide right UI';
      this.ui.rightUiToggle.setAttribute('aria-expanded', String(!this.rightUICollapsed));
    }
  }

  isRecordingPresentationActive() {
    return this.mediaRecorder?.state === 'recording'
      || Boolean(this.singleRecording?.active)
      || Boolean(this.continuousRecording?.active)
      || Boolean(this.autoCupRecording?.active);
  }

  updateRecordingFpsVisibility() {
    const fpsStat = this.ui?.fpsStat || this.ui?.fps?.closest?.('.stats-grid > div');
    if (!fpsStat) return;
    const hideFps = this.isRecordingPresentationActive();
    fpsStat.classList.toggle('hidden', hideFps);
  }

  toggleLeftUI() {
    this.leftUICollapsed = !this.leftUICollapsed;
    this.applyLeftUIState();
    this.updateUI();
  }

  toggleRightUI() {
    this.rightUICollapsed = !this.rightUICollapsed;
    this.applyRightUIState();
    this.updateUI();
  }

  beginRecordingUIPresentation(category, { instantHide = true } = {}) {
    if (!['single', 'continuous'].includes(category)) return;
    if (!this.recordingUIPresentation?.active) {
      this.recordingUIPresentation = {
        active: true,
        category,
        restoreLeftCollapsed: this.leftUICollapsed,
        preserveRightUI: true,
        restoreToggleVisibility: true,
        instantHideLeft: Boolean(instantHide),
      };
    } else {
      this.recordingUIPresentation.category = category;
      this.recordingUIPresentation.instantHideLeft = this.recordingUIPresentation.instantHideLeft || Boolean(instantHide);
    }
    document.body.classList.add('recording-ui-presentation', RECORDING_CURSOR_SUPPRESSION.hidePageCursorClass);
    document.body.classList.toggle('recording-ui-instant-hide', Boolean(this.recordingUIPresentation.instantHideLeft));
    this.leftUICollapsed = true;
    this.applyLeftUIState();
  }

  endRecordingUIPresentation(category = this.recordingUIPresentation?.category) {
    if (!this.recordingUIPresentation?.active) return;
    if (category && this.recordingUIPresentation.category && category !== this.recordingUIPresentation.category) return;
    const restoreLeft = Boolean(this.recordingUIPresentation.restoreLeftCollapsed);
    this.recordingUIPresentation = {
      active: false,
      category: null,
      restoreLeftCollapsed: null,
      preserveRightUI: true,
      restoreToggleVisibility: true,
      instantHideLeft: false,
    };
    document.body.classList.remove('recording-ui-presentation', 'recording-ui-instant-hide', RECORDING_CURSOR_SUPPRESSION.hidePageCursorClass);
    this.leftUICollapsed = restoreLeft;
    this.applyLeftUIState();
    this.ui?.uiToggle?.classList.remove('hidden');
  }

  togglePanel(panel, button) {
    if (!panel || !button) return;
    const collapsed = !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', collapsed);
    button.textContent = collapsed ? 'Show' : 'Hide';
    button.setAttribute('aria-expanded', String(!collapsed));
    this.updateUI();
  }

  getRecordingMimeType() {
    const candidates = [
      ...RECORDING_AUDIO_QUALITY.mimeCodecPreference,
      'video/webm',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  getRecordingEncoderOptions() {
    const mimeType = this.getRecordingMimeType();
    const options = {};
    if (mimeType) options.mimeType = mimeType;
    if (Number.isFinite(RECORDING_AUDIO_QUALITY.audioBitsPerSecond) && RECORDING_AUDIO_QUALITY.audioBitsPerSecond > 0) {
      options.audioBitsPerSecond = RECORDING_AUDIO_QUALITY.audioBitsPerSecond;
    }
    return options;
  }

  getRecordingAudioQualityDebug() {
    return {
      ...RECORDING_AUDIO_QUALITY,
      mimeType: typeof MediaRecorder !== 'undefined' ? this.getRecordingMimeType() : null,
      encoderOptions: typeof MediaRecorder !== 'undefined' ? this.getRecordingEncoderOptions() : null,
      browserNote: 'MediaRecorder requests Opus WebM with 192kbps audio and 48kHz stereo tab/system audio constraints. Browser support and exact encoded values may still be clamped by Chrome.',
    };
  }

  buildDisplayMediaOptions({ tabOnly = false, includeAudio = true } = {}) {
    const videoConstraints = {
      frameRate: { ideal: 60, max: 60 },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      displaySurface: 'browser',
      logicalSurface: true,
      cursor: RECORDING_CURSOR_SUPPRESSION.cursor,
    };
    const audioConstraints = includeAudio
      ? {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
      : false;
    if (audioConstraints) {
      if (Number.isFinite(RECORDING_AUDIO_QUALITY.sampleRate) && RECORDING_AUDIO_QUALITY.sampleRate > 0) {
        audioConstraints.sampleRate = RECORDING_AUDIO_QUALITY.sampleRate;
      }
      if (Number.isFinite(RECORDING_AUDIO_QUALITY.channelCount) && RECORDING_AUDIO_QUALITY.channelCount > 0) {
        audioConstraints.channelCount = RECORDING_AUDIO_QUALITY.channelCount;
      }
      if (Number.isFinite(RECORDING_AUDIO_QUALITY.sampleSize) && RECORDING_AUDIO_QUALITY.sampleSize > 0) {
        audioConstraints.sampleSize = RECORDING_AUDIO_QUALITY.sampleSize;
      }
    }
    const displayOptions = {
      video: videoConstraints,
      audio: audioConstraints,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: tabOnly ? 'exclude' : 'include',
      systemAudio: includeAudio ? 'include' : 'exclude',
    };
    if (includeAudio) {
      displayOptions.suppressLocalAudioPlayback = false;
    }
    return displayOptions;
  }

  getPageAudioTracksForRecording({ includeAudio = true } = {}) {
    if (!includeAudio) return [];
    this.ensureAudioReady();
    const destination = this.ensureRecordingAudioDestination();
    return destination?.stream?.getAudioTracks?.() || [];
  }

  mergeRecordingAudioTracks(stream, { includeAudio = true } = {}) {
    const originalAudioTracks = stream?.getAudioTracks?.() || [];
    const pageAudioTracks = this.getPageAudioTracksForRecording({ includeAudio });
    const mixedAudioTracks = [];
    const mixedInputs = { display: 0, page: 0 };
    const detachedAudioTracks = [];
    this.recordingMixSourceNodes?.forEach((node) => {
      try { node.disconnect?.(); } catch {}
    });
    this.recordingMixSourceNodes = [];

    if (includeAudio && this.audioContext?.createMediaStreamDestination && (originalAudioTracks.length || pageAudioTracks.length)) {
      // Keep the app/WebAudio mix as the persistent final recorder track. Piping that
      // track through a second temporary MediaStreamDestination can go silent in saved
      // WebM after a few dynamic TTS <audio> sources, even though playback is audible.
      // Instead, feed any display/tab audio into the same persistent destination and
      // attach exactly that destination track to MediaRecorder.
      const mixDestination = this.ensureRecordingAudioDestination();
      originalAudioTracks.forEach((track) => {
        try {
          const inputStream = new MediaStream([track]);
          const sourceNode = this.audioContext.createMediaStreamSource(inputStream);
          sourceNode.connect(mixDestination);
          this.recordingMixSourceNodes.push(sourceNode);
          mixedInputs.display += 1;
        } catch (error) {
          console.warn('Unable to mix display/tab audio into recording stream.', error);
        }
      });
      mixedInputs.page = pageAudioTracks.length;
      originalAudioTracks.forEach((track) => {
        try {
          stream.removeTrack?.(track);
          detachedAudioTracks.push(track);
        } catch (error) {
          console.warn('Unable to remove original audio track before mixed recording.', error);
        }
      });
      mixedAudioTracks.push(...(mixDestination?.stream?.getAudioTracks?.() || []));
      mixedAudioTracks.forEach((track) => {
        try {
          if (!stream.getAudioTracks?.().includes(track)) stream.addTrack(track);
        } catch (error) {
          console.warn('Unable to add persistent mixed audio track to recording stream.', error);
        }
      });
    } else {
      pageAudioTracks.forEach((track) => {
        try { stream.addTrack(track); } catch (error) { console.warn('Unable to add page audio to recording stream.', error); }
      });
    }

    const mergedAudioTracks = stream?.getAudioTracks?.() || [];
    return {
      stream,
      originalAudioTracks,
      pageAudioTracks,
      addedPageTracks: pageAudioTracks,
      mixedAudioTracks,
      detachedAudioTracks,
      mergedAudioTracks,
      pageAudioMixed: pageAudioTracks.length > 0,
      displayAudioMixed: originalAudioTracks.length > 0,
      mixedAudioTrackCount: mixedAudioTracks.length,
      mixedAudioInputs: mixedInputs,
      singleMixedAudioTrack: mixedAudioTracks.length === 1,
      persistentPageMixTrack: mixedAudioTracks.length === 1 && mixedAudioTracks[0] === pageAudioTracks[0],
    };
  }

  async createRecordingStream({ preferScreenRecording = true, tabOnly = false, includeAudio = true } = {}) {
    const displayMedia = navigator.mediaDevices?.getDisplayMedia;
    if (preferScreenRecording && displayMedia) {
      try {
        const displayOptions = this.buildDisplayMediaOptions({ tabOnly, includeAudio });
        this.lastRecordingRequest = {
          mode: tabOnly ? 'tab-only-preferred' : 'screen-preferred',
          options: displayOptions,
          cursorSuppression: RECORDING_CURSOR_SUPPRESSION,
          audioQuality: this.getRecordingAudioQualityDebug(),
          audioRequested: includeAudio,
          pageAudioRequested: includeAudio,
          note: includeAudio
            ? 'On macOS Chrome, choose This Tab / Current Tab and enable Share tab audio. The app also mixes WebAudio BGM/SFX into the recorder when available.'
            : 'Browser permission UI must still choose the current tab; constraints prefer a browser tab and exclude audio.',
        };
        const stream = await displayMedia.call(navigator.mediaDevices, displayOptions);
        const [track] = stream.getVideoTracks();
        const audioMerge = this.mergeRecordingAudioTracks(stream, { includeAudio });
        const audioTracks = audioMerge.mergedAudioTracks;
        const settings = track?.getSettings?.() || {};
        const grantedAudioSettings = audioMerge.originalAudioTracks.map((audioTrack) => audioTrack.getSettings?.() || {});
        const pageAudioSettings = audioMerge.pageAudioTracks.map((audioTrack) => audioTrack.getSettings?.() || {});
        const audioSettings = audioTracks.map((audioTrack) => audioTrack.getSettings?.() || {});
        const isBrowserTab = settings.displaySurface === 'browser' || settings.displaySurface === undefined;
        if (tabOnly && settings.displaySurface && settings.displaySurface !== 'browser') {
          stream.getTracks().forEach((item) => item.stop());
          this.lastRecordingRequest = {
            ...this.lastRecordingRequest,
            rejectedSurface: settings.displaySurface,
            rejectedReason: 'auto-cup-tab-only-requires-browser-tab',
          };
          throw new DOMException('Auto Record Cup requires selecting this browser tab.', 'NotAllowedError');
        }
        this.lastRecordingRequest = {
          ...this.lastRecordingRequest,
          grantedSettings: settings,
          grantedAudioSettings,
          pageAudioSettings,
          audioTrackCount: audioTracks.length,
          displayAudioTrackCount: audioMerge.originalAudioTracks.length,
          pageAudioTrackCount: audioMerge.pageAudioTracks.length,
          mixedAudioTrackCount: audioMerge.mixedAudioTrackCount,
          mixedAudioInputs: audioMerge.mixedAudioInputs,
          singleMixedAudioTrack: audioMerge.singleMixedAudioTrack,
          persistentPageMixTrack: audioMerge.persistentPageMixTrack,
          pageAudioMixed: audioMerge.pageAudioMixed,
          displayAudioMixed: audioMerge.displayAudioMixed,
          audioGranted: audioTracks.length > 0,
          displayAudioGranted: audioMerge.originalAudioTracks.length > 0,
          grantedSurface: settings.displaySurface || 'browser-assumed',
          tabOnlySatisfied: isBrowserTab,
        };
        return {
          stream,
          source: 'browser-tab',
          settings: {
            ...settings,
            audioRequested: includeAudio,
            audioTrackCount: audioTracks.length,
            displayAudioTrackCount: audioMerge.originalAudioTracks.length,
            pageAudioTrackCount: audioMerge.pageAudioTracks.length,
            mixedAudioTrackCount: audioMerge.mixedAudioTrackCount,
            mixedAudioInputs: audioMerge.mixedAudioInputs,
            singleMixedAudioTrack: audioMerge.singleMixedAudioTrack,
            persistentPageMixTrack: audioMerge.persistentPageMixTrack,
            audioGranted: audioTracks.length > 0,
            displayAudioGranted: audioMerge.originalAudioTracks.length > 0,
            pageAudioMixed: audioMerge.pageAudioMixed,
            displayAudioMixed: audioMerge.displayAudioMixed,
            audioSettings,
            grantedAudioSettings,
            pageAudioSettings,
          },
        };
      } catch (error) {
        if (tabOnly) throw error;
        if (error?.name !== 'NotAllowedError') console.warn('Screen recording unavailable, falling back to canvas capture.', error);
      }
    }

    if (!this.renderer?.domElement?.captureStream) return null;
    const stream = this.renderer.domElement.captureStream(45);
    const audioMerge = this.mergeRecordingAudioTracks(stream, { includeAudio });
    this.lastRecordingRequest = {
      mode: 'canvas-fallback',
      options: { video: 'renderer.domElement.captureStream(45)', audio: includeAudio ? 'page-audio-mix' : false },
      audioQuality: this.getRecordingAudioQualityDebug(),
      audioRequested: includeAudio,
      pageAudioRequested: includeAudio,
      audioTrackCount: audioMerge.mergedAudioTracks.length,
      displayAudioTrackCount: 0,
      pageAudioTrackCount: audioMerge.pageAudioTracks.length,
      mixedAudioTrackCount: audioMerge.mixedAudioTrackCount,
      mixedAudioInputs: audioMerge.mixedAudioInputs,
      singleMixedAudioTrack: audioMerge.singleMixedAudioTrack,
      persistentPageMixTrack: audioMerge.persistentPageMixTrack,
      pageAudioMixed: audioMerge.pageAudioMixed,
      displayAudioMixed: audioMerge.displayAudioMixed,
      audioGranted: audioMerge.mergedAudioTracks.length > 0,
      displayAudioGranted: false,
      grantedSurface: 'canvas',
      tabOnlySatisfied: false,
    };
    return {
      stream,
      source: 'canvas',
      settings: {
        displaySurface: 'canvas',
        audioRequested: includeAudio,
        audioTrackCount: audioMerge.mergedAudioTracks.length,
        displayAudioTrackCount: 0,
        pageAudioTrackCount: audioMerge.pageAudioTracks.length,
        mixedAudioTrackCount: audioMerge.mixedAudioTrackCount,
        mixedAudioInputs: audioMerge.mixedAudioInputs,
        singleMixedAudioTrack: audioMerge.singleMixedAudioTrack,
        persistentPageMixTrack: audioMerge.persistentPageMixTrack,
        audioGranted: audioMerge.mergedAudioTracks.length > 0,
        displayAudioGranted: false,
        pageAudioMixed: audioMerge.pageAudioMixed,
        displayAudioMixed: audioMerge.displayAudioMixed,
      },
    };
  }

  getRecordingCategoryLabel(category = this.recordingCategory) {
    return {
      single: 'Single',
      continuous: 'Multiple',
      cup: 'Cup Mode',
    }[category] || 'Single';
  }

  async toggleRecording({ preferScreenRecording = true, tabOnly = false, includeAudio = false, recordingCategory = 'single' } = {}) {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
      return false;
    }
    if (typeof MediaRecorder === 'undefined') {
      this.ui.recordStatus.textContent = 'Recording is not supported in this browser';
      return false;
    }

    this.beginRecordingUIPresentation(recordingCategory, { instantHide: true });
    const recording = await this.createRecordingStream({ preferScreenRecording, tabOnly, includeAudio });
    if (!recording) {
      this.endRecordingUIPresentation(recordingCategory);
      this.ui.recordStatus.textContent = 'Recording is not supported in this browser';
      return false;
    }
    const { stream, source, settings } = recording;
    const recorderOptions = this.getRecordingEncoderOptions();
    const mimeType = recorderOptions.mimeType || '';
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(stream, recorderOptions);
    this.recordingStartedAt = performance.now();
    this.recordingSource = source;
    this.recordingCategory = recordingCategory;
    this.recordingSettings = {
      ...(settings || {}),
      audioQuality: this.getRecordingAudioQualityDebug(),
      recorderOptions,
      recorderMimeType: this.mediaRecorder.mimeType || mimeType,
      recorderAudioBitsPerSecond: this.mediaRecorder.audioBitsPerSecond || recorderOptions.audioBitsPerSecond,
      requestedSampleRate: RECORDING_AUDIO_QUALITY.sampleRate,
      requestedChannelCount: RECORDING_AUDIO_QUALITY.channelCount,
    };

    [...stream.getVideoTracks(), ...stream.getAudioTracks()].forEach((track) => {
      track.addEventListener('ended', () => {
        if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
      });
    });
    this.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size > 0) this.recordedChunks.push(event.data);
    });
    this.mediaRecorder.addEventListener('stop', () => this.saveRecording(mimeType, stream));
    this.mediaRecorder.start(1000);
    this.ui.record.classList.add('recording');
    const categoryLabel = this.getRecordingCategoryLabel(recordingCategory);
    if (recordingCategory === 'continuous' && this.ui.continuousRecord) {
      this.ui.continuousRecord.classList.add('recording');
      this.ui.continuousRecord.textContent = 'Stop Multiple';
    } else if (recordingCategory === 'cup' && this.ui.autoCupRecord) {
      this.ui.autoCupRecord.classList.add('recording');
      this.ui.autoCupRecord.textContent = 'Stop Cup Mode';
    } else {
      this.ui.record.textContent = 'Stop Single';
    }
    const autoCupSuffix = this.autoCupRecording?.active ? ' · Cup Mode active' : '';
    const singleSuffix = this.singleRecording?.active ? ' · countdown starts in 2s' : '';
    const continuousSuffix = this.continuousRecording?.active ? ` · Multiple ${this.continuousRecording.racesCompleted || 0}/${this.continuousRecording.totalRaces || MULTIPLE_RECORDING_DEFAULT_RACES} · next gate after 5s` : '';
    const sourceLabel = source === 'browser-tab'
      ? 'browser tab only'
      : source === 'screen'
        ? 'full page UI'
        : '3D only';
    const audioSuffix = settings?.audioGranted
      ? ` + audio${settings?.displayAudioGranted ? '' : ' (page mix)'} · Opus 192kbps 48kHz stereo`
      : includeAudio ? ' · no audio granted' : '';
    const ttsPolicy = this.getTtsRecordingPolicy();
    const ttsSuffix = this.commentaryVoiceEnabled && ttsPolicy.tabAudioRequired && !settings?.displayAudioGranted
      ? ' · TTS needs Share tab audio'
      : this.commentaryVoiceEnabled && ttsPolicy.directPageMixRecordable
        ? ' · TTS page-mixed'
        : '';
    const mixSuffix = settings?.singleMixedAudioTrack ? ' · mixed audio track' : '';
    this.ui.recordStatus.textContent = `Recording: ${categoryLabel} · ${sourceLabel}${audioSuffix}${mixSuffix}${ttsSuffix}${autoCupSuffix}${singleSuffix}${continuousSuffix}`;
    this.updateTtsRecordingNotice();
    this.updateUI();
    return true;
  }

  saveRecording(mimeType, stream) {
    stream?.getTracks().forEach((track) => track.stop());
    this.recordingMixSourceNodes?.forEach((node) => {
      try { node.disconnect?.(); } catch {}
    });
    this.recordingMixSourceNodes = [];
    this.ui.record.classList.remove('recording');
    this.ui.record.textContent = 'Single';
    this.ui.continuousRecord?.classList.remove('recording');
    if (this.ui.continuousRecord) this.ui.continuousRecord.textContent = 'Multiple';
    if (this.ui.multipleRaceCount) this.ui.multipleRaceCount.disabled = false;
    this.ui.autoCupRecord?.classList.remove('recording');
    if (this.ui.autoCupRecord) this.ui.autoCupRecord.textContent = 'Cup Mode';
    this.endRecordingUIPresentation(this.recordingCategory);
    const duration = (performance.now() - this.recordingStartedAt) / 1000;
    if (!this.recordedChunks.length) {
      this.ui.recordStatus.textContent = 'No video was recorded';
      this.mediaRecorder = null;
      this.recordingSource = null;
      this.recordingCategory = null;
      this.recordingSettings = null;
      if (this.continuousRecording?.active) this.stopContinuousRecording({ stopRecorder: false, reason: 'no-video-recorded' });
      if (this.singleRecording?.active) this.stopSingleRecording({ stopRecorder: false, reason: 'no-video-recorded' });
      if (this.autoCupRecording?.active) this.stopAutoCupRecording({ stopRecorder: false, reason: 'no-video-recorded' });
      this.updateUI();
      return;
    }
    const blob = new Blob(this.recordedChunks, { type: mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `marble-race-${stamp}.webm`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    this.ui.recordStatus.textContent = `Downloaded ${duration.toFixed(1)}s video`;
    this.mediaRecorder = null;
    this.recordingSource = null;
    this.recordingCategory = null;
    this.recordingSettings = null;
    if (this.singleRecording?.active) {
      this.singleRecording.active = false;
      this.singleRecording.phase = 'idle';
      this.singleRecording.nextActionAt = null;
      this.clearSingleRecordingTimer();
    }
    if (this.continuousRecording?.active) {
      this.continuousRecording.active = false;
      this.continuousRecording.phase = 'idle';
      this.continuousRecording.nextActionAt = null;
      this.clearContinuousRecordingTimer();
      if (this.ui.multipleRaceCount) this.ui.multipleRaceCount.disabled = false;
      if (this.ui.continuousRecord) {
        this.ui.continuousRecord.classList.remove('recording');
        this.ui.continuousRecord.textContent = 'Multiple';
      }
    }
    if (this.autoCupRecording?.active) {
      this.autoCupRecording.active = false;
      this.autoCupRecording.phase = 'idle';
      this.autoCupRecording.nextActionAt = null;
      if (this.ui.autoCupRecord) {
        this.ui.autoCupRecord.classList.remove('recording');
        this.ui.autoCupRecord.textContent = 'Cup Mode';
      }
    }
    this.updateUI();
  }

  clearAutoCupRecordingTimer() {
    if (this.autoCupRecording?.pendingTimer) clearTimeout(this.autoCupRecording.pendingTimer);
    if (this.autoCupRecording) {
      this.autoCupRecording.pendingTimer = null;
      this.autoCupRecording.nextActionAt = null;
    }
  }

  clearSingleRecordingTimer() {
    if (this.singleRecording?.pendingTimer) clearTimeout(this.singleRecording.pendingTimer);
    if (this.singleRecording) {
      this.singleRecording.pendingTimer = null;
      this.singleRecording.nextActionAt = null;
    }
  }

  scheduleSingleRecordingAction(delaySeconds, phase, action) {
    if (!this.singleRecording?.active) return;
    this.clearSingleRecordingTimer();
    this.singleRecording.phase = phase;
    this.singleRecording.nextActionAt = performance.now() + delaySeconds * 1000;
    this.singleRecording.pendingTimer = setTimeout(() => {
      if (!this.singleRecording?.active) return;
      this.singleRecording.pendingTimer = null;
      this.singleRecording.nextActionAt = null;
      action();
      this.updateUI();
    }, delaySeconds * 1000);
    this.updateUI();
  }

  async toggleSingleRecording() {
    if (this.singleRecording?.active) {
      this.stopSingleRecording({ stopRecorder: true, reason: 'manual-stop' });
      return;
    }
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
      return;
    }
    await this.startSingleRecording({ includeAudio: true });
  }

  async startSingleRecording({ preferScreenRecording = true, tabOnly = false, includeAudio = true } = {}) {
    this.clearSingleRecordingTimer();
    this.singleRecording = {
      ...this.singleRecording,
      active: true,
      mode: 'single',
      label: 'Single',
      phase: 'preparing-recording',
      startedAt: performance.now(),
      pendingTimer: null,
      nextActionAt: null,
      gateDelaySeconds: RECORDING_GATE_DELAY_SECONDS,
      startedCountdownAt: null,
      finalStopDelaySeconds: SINGLE_RECORDING_FINAL_STOP_SECONDS,
      lastError: null,
    };
    if (this.state === 'finished') this.newRace({ regenerateTrack: false });
    const recordingStarted = this.mediaRecorder?.state === 'recording'
      ? true
      : await this.toggleRecording({ preferScreenRecording, tabOnly, includeAudio, recordingCategory: 'single' });
    if (!recordingStarted) {
      this.stopSingleRecording({ stopRecorder: false, reason: 'recording-unavailable' });
      this.singleRecording.lastError = 'recording-unavailable';
      this.ui.recordStatus.textContent = 'Single recording unavailable';
      return false;
    }
    this.scheduleSingleRecordingAction(this.singleRecording.gateDelaySeconds, 'waiting-open-gate', () => this.startSingleRecordingRace());
    return true;
  }

  startSingleRecordingRace() {
    if (!this.singleRecording?.active) return;
    if (this.state === 'finished') this.newRace({ regenerateTrack: false });
    if (this.state !== 'ready') return;
    this.singleRecording.phase = 'countdown-open-gate';
    this.singleRecording.startedCountdownAt = performance.now();
    this.startCountdownAndGateOpen();
  }

  handleSingleRecordingRaceComplete() {
    if (!this.singleRecording?.active) return;
    const finalStopDelaySeconds = Number(this.singleRecording.finalStopDelaySeconds ?? SINGLE_RECORDING_FINAL_STOP_SECONDS) || 0;
    this.scheduleSingleRecordingAction(finalStopDelaySeconds, 'waiting-final-stop', () => {
      if (!this.singleRecording?.active) return;
      this.stopSingleRecording({ stopRecorder: true, reason: 'completed-single-race' });
    });
  }

  stopSingleRecording({ stopRecorder = true, reason = 'stopped' } = {}) {
    this.clearSingleRecordingTimer();
    if (this.singleRecording) {
      this.singleRecording.active = false;
      this.singleRecording.phase = reason;
      this.singleRecording.nextActionAt = null;
    }
    this.ui.record.classList.remove('recording');
    this.ui.record.textContent = 'Single';
    this.endRecordingUIPresentation('single');
    if (stopRecorder && this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
    else this.updateUI();
  }

  clearContinuousRecordingTimer() {
    if (this.continuousRecording?.pendingTimer) clearTimeout(this.continuousRecording.pendingTimer);
    if (this.continuousRecording) {
      this.continuousRecording.pendingTimer = null;
      this.continuousRecording.nextActionAt = null;
    }
  }

  scheduleContinuousRecordingAction(delaySeconds, phase, action) {
    if (!this.continuousRecording?.active) return;
    this.clearContinuousRecordingTimer();
    this.continuousRecording.phase = phase;
    this.continuousRecording.nextActionAt = performance.now() + delaySeconds * 1000;
    this.continuousRecording.pendingTimer = setTimeout(() => {
      if (!this.continuousRecording?.active) return;
      this.continuousRecording.pendingTimer = null;
      this.continuousRecording.nextActionAt = null;
      action();
      this.updateUI();
    }, delaySeconds * 1000);
    this.updateUI();
  }

  getMultipleRecordingTotalRaces() {
    const raw = Number(this.ui.multipleRaceCount?.value);
    const count = Number.isFinite(raw) ? Math.round(raw) : MULTIPLE_RECORDING_DEFAULT_RACES;
    return clamp(count, 1, 99);
  }

  async toggleContinuousRecording() {
    if (this.continuousRecording?.active) {
      this.stopContinuousRecording({ stopRecorder: true, reason: 'manual-stop' });
      return;
    }
    await this.startContinuousRecording({ includeAudio: true });
  }

  async startContinuousRecording({ preferScreenRecording = true, tabOnly = false, includeAudio = true } = {}) {
    this.clearContinuousRecordingTimer();
    const totalRaces = this.getMultipleRecordingTotalRaces();
    if (this.ui.multipleRaceCount) this.ui.multipleRaceCount.value = String(totalRaces);
    this.continuousRecording = {
      ...this.continuousRecording,
      active: true,
      mode: 'continuous',
      label: 'Multiple',
      phase: 'preparing-multiple-recording',
      startedAt: performance.now(),
      racesCompleted: 0,
      pendingTimer: null,
      nextActionAt: null,
      preserveCurrentSettings: false,
      totalRaces,
      nextRaceDelaySeconds: MULTIPLE_RECORDING_CEREMONY_HOLD_SECONDS,
      gateDelaySeconds: MULTIPLE_RECORDING_NEXT_GATE_SECONDS,
      initialGateDelaySeconds: RECORDING_GATE_DELAY_SECONDS,
      finalStopDelaySeconds: MULTIPLE_RECORDING_FINAL_STOP_SECONDS,
      lastGeneratedTrackAfterRace: 0,
      lastError: null,
    };
    if (this.ui.continuousRecord) {
      this.ui.continuousRecord.classList.add('recording');
      this.ui.continuousRecord.textContent = 'Stop Multiple';
    }
    if (this.ui.multipleRaceCount) this.ui.multipleRaceCount.disabled = true;
    if (this.ui.raceMode && this.ui.raceMode.value === 'cup') this.ui.raceMode.value = 'single';
    if (this.cupMode?.active) {
      this.cupMode = { ...this.cupMode, active: false, status: 'idle', stageIndex: 0, currentEntrants: [], results: [], lastQualified: [], champion: null, podium: [] };
      this.ui.count.disabled = false;
      this.hideMatchCard();
      this.newRace({ regenerateTrack: false });
    }
    const recordingStarted = this.mediaRecorder?.state === 'recording'
      ? true
      : await this.toggleRecording({ preferScreenRecording, tabOnly, includeAudio, recordingCategory: 'continuous' });
    if (!recordingStarted) {
      this.stopContinuousRecording({ stopRecorder: false, reason: 'recording-unavailable' });
      this.continuousRecording.lastError = 'recording-unavailable';
      this.ui.recordStatus.textContent = 'Multiple recording unavailable';
      return false;
    }
    this.scheduleContinuousRecordingAction(this.continuousRecording.initialGateDelaySeconds, 'waiting-open-gate', () => this.startContinuousRecordingRace());
    return true;
  }

  startContinuousRecordingRace() {
    if (!this.continuousRecording?.active) return;
    if (this.state === 'finished') this.newRace({ regenerateTrack: false });
    if (this.state !== 'ready') return;
    this.continuousRecording.phase = 'countdown-open-gate';
    this.startCountdownAndGateOpen();
  }

  handleContinuousRecordingRaceComplete() {
    if (!this.continuousRecording?.active) return;
    if (this.continuousRecording.mode === 'survivor') return;
    this.continuousRecording.racesCompleted += 1;
    const completed = Number(this.continuousRecording.racesCompleted) || 0;
    const totalRaces = Math.max(1, Number(this.continuousRecording.totalRaces) || MULTIPLE_RECORDING_DEFAULT_RACES);
    if (completed >= totalRaces) {
      const finalStopDelaySeconds = Number(this.continuousRecording.finalStopDelaySeconds ?? MULTIPLE_RECORDING_FINAL_STOP_SECONDS) || 0;
      this.scheduleContinuousRecordingAction(finalStopDelaySeconds, 'waiting-final-stop', () => {
        if (!this.continuousRecording?.active) return;
        this.stopContinuousRecording({ stopRecorder: true, reason: 'completed-all-races' });
      });
      return;
    }

    const ceremonyHoldSeconds = Number(this.continuousRecording.nextRaceDelaySeconds ?? MULTIPLE_RECORDING_CEREMONY_HOLD_SECONDS) || 0;
    this.scheduleContinuousRecordingAction(ceremonyHoldSeconds, 'ceremony-hold', () => {
      if (!this.continuousRecording?.active) return;
      this.continuousRecording.lastGeneratedTrackAfterRace = completed;
      this.newRace({ regenerateTrack: true });
      this.scheduleContinuousRecordingAction(this.continuousRecording.gateDelaySeconds, 'waiting-open-gate', () => this.startContinuousRecordingRace());
    });
  }

  stopContinuousRecording({ stopRecorder = true, reason = 'stopped' } = {}) {
    this.clearContinuousRecordingTimer();
    if (this.continuousRecording) {
      this.continuousRecording.active = false;
      this.continuousRecording.phase = reason;
      this.continuousRecording.nextActionAt = null;
    }
    if (this.ui.continuousRecord) {
      this.ui.continuousRecord.classList.remove('recording');
      this.ui.continuousRecord.textContent = 'Multiple';
    }
    if (this.ui.multipleRaceCount) this.ui.multipleRaceCount.disabled = false;
    this.endRecordingUIPresentation('continuous');
    if (stopRecorder && this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
    else this.updateUI();
  }

  scheduleAutoCupRecordingAction(delaySeconds, phase, action) {
    if (!this.autoCupRecording?.active) return;
    this.clearAutoCupRecordingTimer();
    this.autoCupRecording.phase = phase;
    this.autoCupRecording.nextActionAt = performance.now() + delaySeconds * 1000;
    this.autoCupRecording.pendingTimer = setTimeout(() => {
      if (!this.autoCupRecording?.active) return;
      this.autoCupRecording.pendingTimer = null;
      this.autoCupRecording.nextActionAt = null;
      action();
      this.updateUI();
    }, delaySeconds * 1000);
    this.updateUI();
  }

  scheduleAutoCupAfterCommentaryEnds(delaySeconds, phase, action) {
    if (!this.autoCupRecording?.active) return;
    const line = this.commentaryVoiceCurrentLine || this.commentaryVoiceQueue?.[0]?.line || this.activeCommentary?.line || null;
    this.clearAutoCupRecordingTimer();
    this.autoCupRecording.phase = phase;
    this.autoCupRecording.ceremonyNarrationDelaySeconds = delaySeconds;
    this.autoCupRecording.waitingForNarrationLine = line;
    this.autoCupRecording.waitingForNarrationStartedAt = performance.now();
    this.autoCupRecording.narrationCompletedAt = null;
    const waitForVoice = () => {
      if (!this.autoCupRecording?.active) return;
      const queueContainsLine = line ? this.commentaryVoiceQueue?.some((item) => item.line === line) : false;
      const lineStillPlaying = line ? this.commentaryVoiceCurrentLine === line || queueContainsLine : false;
      const anyVoiceBusy = this.commentaryVoicePreparing || this.commentaryVoiceSpeaking || queueContainsLine;
      if (this.commentaryVoiceEnabled && (lineStillPlaying || (!line && anyVoiceBusy))) {
        this.autoCupRecording.nextActionAt = null;
        this.autoCupRecording.pendingTimer = setTimeout(waitForVoice, 120);
        return;
      }
      this.autoCupRecording.narrationCompletedAt = performance.now();
      this.autoCupRecording.nextActionAt = performance.now() + delaySeconds * 1000;
      this.autoCupRecording.pendingTimer = setTimeout(() => {
        if (!this.autoCupRecording?.active) return;
        this.autoCupRecording.pendingTimer = null;
        this.autoCupRecording.nextActionAt = null;
        action();
        this.updateUI();
      }, delaySeconds * 1000);
      this.updateUI();
    };
    waitForVoice();
    this.updateUI();
  }

  async toggleAutoCupRecording() {
    if (this.autoCupRecording?.active) {
      this.stopAutoCupRecording({ stopRecorder: true, reason: 'manual-stop' });
      return;
    }
    await this.startAutoCupRecording({ tabOnly: true, includeAudio: true });
  }

  async startAutoCupRecording({ preferScreenRecording = true, tabOnly = true, includeAudio = true } = {}) {
    this.clearAutoCupRecordingTimer();
    const cupSize = Number(this.ui.cupSize?.value) || this.cupMode?.size || 12;
    this.autoCupRecording = {
      ...this.autoCupRecording,
      active: true,
      mode: 'cup',
      label: 'Cup Mode',
      phase: 'preparing-cup-track',
      startedAt: performance.now(),
      currentStage: null,
      racesCompleted: 0,
      stopAfterFinalSeconds: CUP_VIDEO_TIMING.finalPodiumSeconds + CUP_VIDEO_TIMING.endCardSeconds + CUP_VIDEO_TIMING.recordingStopGraceSeconds,
      nextRaceDelaySeconds: CUP_VIDEO_TIMING.nextRaceDelaySeconds,
      ceremonyNarrationDelaySeconds: CUP_CEREMONY_POST_NARRATION_DELAY_SECONDS,
      waitingForNarrationLine: null,
      waitingForNarrationStartedAt: null,
      narrationCompletedAt: null,
      postRaceHoldSeconds: CUP_VIDEO_TIMING.postRaceHoldSeconds,
      postReplayPodiumHoldSeconds: CUP_VIDEO_TIMING.postReplayPodiumHoldSeconds,
      nextGateAfterRaceSeconds: CUP_VIDEO_TIMING.nextGateAfterRaceSeconds,
      gateDelaySeconds: CUP_VIDEO_TIMING.introSeconds,
      nextActionAt: null,
      pendingTimer: null,
      timingPlan: this.getCupVideoTimingEstimate(),
      recordingMode: tabOnly ? 'browser-tab-only' : 'screen-preferred',
      audioRequested: includeAudio,
      lastError: null,
    };
    if (this.ui.autoCupRecord) {
      this.ui.autoCupRecord.classList.add('recording');
      this.ui.autoCupRecord.textContent = 'Stop Cup Mode';
    }
    if (this.ui.raceMode) this.ui.raceMode.value = 'cup';
    this.startCupMode(cupSize, { preserveCurrentSettings: true });
    if (!this.leftUICollapsed) this.toggleLeftUI();
    const recordingStarted = this.mediaRecorder?.state === 'recording'
      ? true
      : await this.toggleRecording({ preferScreenRecording, tabOnly, includeAudio, recordingCategory: 'cup' });
    if (!recordingStarted) {
      this.stopAutoCupRecording({ stopRecorder: false, reason: 'recording-unavailable' });
      this.autoCupRecording.lastError = tabOnly ? 'browser-tab-recording-required' : 'recording-unavailable';
      this.ui.recordStatus.textContent = tabOnly ? 'Cup Mode needs Current Tab / This Tab selected' : 'Recording unavailable';
      return false;
    }
    // Keep recorder automation out of the LIVE EVENT caption; this is background control state, not viewer-facing race commentary.
    this.scheduleAutoCupRecordingAction(this.autoCupRecording.gateDelaySeconds, 'waiting-open-gate', () => this.startAutoCupRace());
    return true;
  }

  startAutoCupRace() {
    if (!this.autoCupRecording?.active) return;
    if (this.state !== 'ready') return;
    this.autoCupRecording.phase = 'countdown-open-gate';
    this.autoCupRecording.currentStage = this.getCupStage();
    this.hideMatchCard();
    this.startCountdownAndGateOpen();
  }

  handleAutoCupRaceComplete() {
    if (!this.autoCupRecording?.active) return;
    this.autoCupRecording.racesCompleted += 1;
    this.autoCupRecording.currentStage = this.getCupStage();
    if (this.cupMode?.status === 'complete') {
      this.scheduleAutoCupRecordingAction(this.autoCupRecording.stopAfterFinalSeconds, 'waiting-final-ceremony-plus-10s-stop', () => {
        this.stopAutoCupRecording({ stopRecorder: true, reason: 'final-complete' });
      });
      return;
    }
    const postRaceHoldSeconds = Number(this.autoCupRecording.postRaceHoldSeconds ?? CUP_VIDEO_TIMING.postRaceHoldSeconds) || 0;
    const replayHoldSeconds = Number(this.autoCupRecording.playwrightReplayHoldSeconds ?? getReplayHighlightHoldSeconds(CUP_VIDEO_TIMING)) || 0;
    const postReplayPodiumHoldSeconds = Number(this.autoCupRecording.postReplayPodiumHoldSeconds ?? CUP_VIDEO_TIMING.postReplayPodiumHoldSeconds) || 0;
    const nextRaceDelaySeconds = Number(this.autoCupRecording.nextRaceDelaySeconds ?? CUP_VIDEO_TIMING.nextRaceDelaySeconds) || 0;
    this.scheduleAutoCupRecordingAction(postRaceHoldSeconds, 'holding-stage-result', () => {
      if (!this.autoCupRecording?.active || this.cupMode?.status !== 'awaiting-next') return;
      this.showReplayHighlightOverlay({ stage: this.getCupStage(), duration: replayHoldSeconds });
      this.scheduleAutoCupRecordingAction(replayHoldSeconds, 'showing-replay-highlights', () => {
        if (!this.autoCupRecording?.active || this.cupMode?.status !== 'awaiting-next') return;
        this.hideReplayHighlightOverlay({ restorePodium: true });
        const ceremonyNarrationDelaySeconds = Number(this.autoCupRecording.ceremonyNarrationDelaySeconds ?? CUP_CEREMONY_POST_NARRATION_DELAY_SECONDS) || 0;
        this.defaultCameraPhaseUntil = Math.max(this.defaultCameraPhaseUntil || 0, this.elapsed + postReplayPodiumHoldSeconds + ceremonyNarrationDelaySeconds + nextRaceDelaySeconds);
        this.scheduleAutoCupRecordingAction(postReplayPodiumHoldSeconds, 'holding-restored-podium', () => {
          if (!this.autoCupRecording?.active || this.cupMode?.status !== 'awaiting-next') return;
          this.scheduleAutoCupAfterCommentaryEnds(ceremonyNarrationDelaySeconds, 'waiting-ceremony-narration-plus-2s', () => {
            if (!this.autoCupRecording?.active || this.cupMode?.status !== 'awaiting-next') return;
            this.advanceCupMatch();
            this.scheduleAutoCupRecordingAction(nextRaceDelaySeconds, 'waiting-next-stage-countdown', () => {
              if (!this.autoCupRecording?.active || this.state !== 'ready') return;
              this.startAutoCupRace();
            });
          });
        });
      });
    });
  }

  stopAutoCupRecording({ stopRecorder = true, reason = 'stopped' } = {}) {
    this.clearAutoCupRecordingTimer();
    if (this.autoCupRecording) {
      this.autoCupRecording.active = false;
      this.autoCupRecording.phase = reason;
      this.autoCupRecording.nextActionAt = null;
    }
    if (this.ui.autoCupRecord) {
      this.ui.autoCupRecord.classList.remove('recording');
      this.ui.autoCupRecord.textContent = 'Cup Mode';
    }
    if (stopRecorder && this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
    else this.updateUI();
  }

  recordFrameProfilerSample(sample = {}) {
    const profiler = this.frameProfiler;
    if (!profiler) return null;
    const now = performance.now();
    const frameMs = Number(sample.frameMs || 0);
    const rafIntervalMs = Number.isFinite(sample.rafIntervalMs) ? Number(sample.rafIntervalMs) : 0;
    profiler.frames += 1;
    profiler.frameMsTotal += frameMs;
    profiler.frameMsMax = Math.max(profiler.frameMsMax || 0, frameMs);
    profiler.frameMsSamples.push(frameMs);
    if (profiler.frameMsSamples.length > 240) profiler.frameMsSamples.shift();
    if (rafIntervalMs > 0) {
      profiler.rafIntervalMsTotal += rafIntervalMs;
      profiler.rafIntervalMsMax = Math.max(profiler.rafIntervalMsMax || 0, rafIntervalMs);
      profiler.rafIntervalMsSamples.push(rafIntervalMs);
      if (profiler.rafIntervalMsSamples.length > 240) profiler.rafIntervalMsSamples.shift();
    }
    profiler.uniqueFramesThisSecond = (profiler.uniqueFramesThisSecond || 0) + 1;
    const secondWindowElapsedMs = Math.max(1, now - (profiler.secondWindowStartedAt || now));
    if (secondWindowElapsedMs >= 1000) {
      const seconds = secondWindowElapsedMs / 1000;
      const uniqueFrames = profiler.uniqueFramesThisSecond || 0;
      const summary = {
        capturedAt: new Date().toISOString(),
        windowSeconds: Number(seconds.toFixed(3)),
        uniqueFrames,
        uniqueFps: Number((uniqueFrames / seconds).toFixed(2)),
      };
      profiler.lastUniqueFrameSecondSummary = summary;
      profiler.uniqueFrameSecondHistory.push(summary);
      if (profiler.uniqueFrameSecondHistory.length > 120) profiler.uniqueFrameSecondHistory.shift();
      profiler.uniqueFramesThisSecond = 0;
      profiler.secondWindowStartedAt = now;
    }
    profiler.obstacleMsTotal += Number(sample.obstacleMs || 0);
    profiler.driveMsTotal += Number(sample.driveMs || 0);
    profiler.physicsMsTotal += Number(sample.physicsMs || 0);
    profiler.syncMsTotal += Number(sample.syncMs || 0);
    profiler.uiMsTotal += Number(sample.uiMs || 0);
    profiler.renderMsTotal += Number(sample.renderMs || 0);
    profiler.overlayMsTotal += Number(sample.overlayMs || 0);
    const elapsedMs = Math.max(1, now - (profiler.windowStartedAt || now));
    if (elapsedMs >= 5000 || profiler.frames >= 300) {
      const sorted = [...profiler.frameMsSamples].sort((a, b) => a - b);
      const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
      const rafSorted = [...(profiler.rafIntervalMsSamples || [])].sort((a, b) => a - b);
      const rafP95 = rafSorted.length ? rafSorted[Math.min(rafSorted.length - 1, Math.floor(rafSorted.length * 0.95))] : 0;
      const rafSamples = Math.max(1, rafSorted.length || 1);
      const frames = Math.max(1, profiler.frames);
      const latestUniqueFrameWindow = profiler.lastUniqueFrameSecondSummary || null;
      profiler.lastSummary = {
        capturedAt: new Date().toISOString(),
        windowSeconds: Number((elapsedMs / 1000).toFixed(2)),
        frames: profiler.frames,
        uniqueFps: Number((profiler.frames / (elapsedMs / 1000)).toFixed(2)),
        latestUniqueFrameWindow,
        uniqueFrameSecondHistory: [...(profiler.uniqueFrameSecondHistory || [])].slice(-10),
        avgFrameMs: Number((profiler.frameMsTotal / frames).toFixed(2)),
        p95FrameMs: Number(p95.toFixed(2)),
        maxFrameMs: Number((profiler.frameMsMax || 0).toFixed(2)),
        avgRafIntervalMs: Number(((profiler.rafIntervalMsTotal || 0) / rafSamples).toFixed(2)),
        p95RafIntervalMs: Number(rafP95.toFixed(2)),
        maxRafIntervalMs: Number((profiler.rafIntervalMsMax || 0).toFixed(2)),
        avgObstacleMs: Number((profiler.obstacleMsTotal / frames).toFixed(2)),
        avgDriveMs: Number((profiler.driveMsTotal / frames).toFixed(2)),
        avgPhysicsMs: Number((profiler.physicsMsTotal / frames).toFixed(2)),
        avgSyncMs: Number((profiler.syncMsTotal / frames).toFixed(2)),
        avgUiMs: Number((profiler.uiMsTotal / frames).toFixed(2)),
        avgRenderMs: Number((profiler.renderMsTotal / frames).toFixed(2)),
        avgOverlayMs: Number((profiler.overlayMsTotal / frames).toFixed(2)),
        marbleCount: this.marbleData?.length || 0,
        worldBodies: this.world?.bodies?.length || 0,
        obstacleCounts: this.obstacleTypeCounts || null,
        trackStats: this.trackStats || null,
        rendererInfo: this.renderer?.info ? {
          calls: this.renderer.info.render?.calls ?? null,
          triangles: this.renderer.info.render?.triangles ?? null,
          points: this.renderer.info.render?.points ?? null,
          lines: this.renderer.info.render?.lines ?? null,
          geometries: this.renderer.info.memory?.geometries ?? null,
          textures: this.renderer.info.memory?.textures ?? null,
        } : null,
        uiThrottleCounters: this.uiThrottleCounters || null,
      };
      profiler.windowStartedAt = now;
      profiler.frames = 0;
      profiler.frameMsTotal = 0;
      profiler.frameMsMax = 0;
      profiler.frameMsSamples = [];
      profiler.rafIntervalMsTotal = 0;
      profiler.rafIntervalMsMax = 0;
      profiler.rafIntervalMsSamples = [];
      profiler.obstacleMsTotal = 0;
      profiler.driveMsTotal = 0;
      profiler.physicsMsTotal = 0;
      profiler.syncMsTotal = 0;
      profiler.uiMsTotal = 0;
      profiler.renderMsTotal = 0;
      profiler.overlayMsTotal = 0;
    }
    return profiler.lastSummary;
  }

  getFrameTimingDiagnostics() {
    const profiler = this.frameProfiler || {};
    const history = [...(profiler.uniqueFrameSecondHistory || [])];
    const chunkHistory = [...(profiler.captureChunkHistory || [])];
    const lastSummary = profiler.lastSummary || null;
    const currentSecondElapsedMs = Math.max(1, performance.now() - (profiler.secondWindowStartedAt || performance.now()));
    const currentUniqueFrames = profiler.uniqueFramesThisSecond || 0;
    return {
      enabled: true,
      source: 'browser-side-frame-timing',
      lastSummary,
      currentSecond: {
        elapsedSeconds: Number((currentSecondElapsedMs / 1000).toFixed(3)),
        uniqueFrames: currentUniqueFrames,
        projectedUniqueFps: Number((currentUniqueFrames / (currentSecondElapsedMs / 1000)).toFixed(2)),
      },
      latestUniqueFrameWindow: profiler.lastUniqueFrameSecondSummary || null,
      uniqueFrameSecondHistory: history.slice(-20),
      captureChunkTiming: {
        last: profiler.lastCaptureChunkTiming || null,
        history: chunkHistory.slice(-20),
      },
      interpretation: {
        uniqueFrames: 'RAF/game frames produced in each browser-side second window',
        rafIntervalMs: 'time between requestAnimationFrame callbacks; spikes indicate browser scheduling/compositor stalls',
        frameMs: 'measured game-loop work inside a RAF callback',
        avgPhysicsMs: 'Cannon/world.step cost per frame',
        avgUiMs: 'labels/leaderboard/UI updates per frame',
        avgRenderMs: 'Three.js renderer.render cost per frame',
        avgOverlayMs: 'viewer/video overlay/composite draw cost per frame',
        captureChunkTiming: 'MediaRecorder dataavailable + blob/arrayBuffer/Playwright binding/write prep timing when canvas capture is active',
      },
    };
  }

  recordCaptureChunkTiming(timing = {}) {
    const profiler = this.frameProfiler;
    if (!profiler || !timing) return null;
    const compact = {
      capturedAt: new Date().toISOString(),
      blobBytes: timing.blobBytes ?? null,
      msSinceLastChunk: timing.msSinceLastChunk ?? null,
      arrayBufferMs: timing.arrayBufferMs ?? null,
      byteArrayMs: timing.byteArrayMs ?? null,
      browserPrepMs: timing.browserPrepMs ?? null,
      bindingRoundTripMs: timing.bindingRoundTripMs ?? null,
      totalWriteMs: timing.totalWriteMs ?? null,
      nodeBindingMs: timing.nodeBindingMs ?? null,
      nodeBufferMs: timing.nodeBufferMs ?? null,
      nodeWriteMs: timing.nodeWriteMs ?? null,
      pendingBefore: timing.pendingBefore ?? null,
      pendingAfter: timing.pendingAfter ?? null,
      browserFps: timing.browserFps ?? null,
      captureElapsedSeconds: timing.captureElapsedSeconds ?? null,
      final: Boolean(timing.final),
      buffered: Boolean(timing.buffered),
    };
    profiler.lastCaptureChunkTiming = compact;
    if (!profiler.captureChunkHistory) profiler.captureChunkHistory = [];
    profiler.captureChunkHistory.push(compact);
    if (profiler.captureChunkHistory.length > 120) profiler.captureChunkHistory.shift();
    return compact;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const frameStartedAt = performance.now();
    const rafIntervalMs = this.frameProfiler?.lastFrameStartedAt != null
      ? frameStartedAt - this.frameProfiler.lastFrameStartedAt
      : null;
    if (this.frameProfiler) this.frameProfiler.lastFrameStartedAt = frameStartedAt;
    const rawDelta = Math.min(this.clock.getDelta(), 0.05);
    const timeScale = this.getFinishSlowMotionTimeScale();
    if (this.finishSlowMotion) this.finishSlowMotion.timeScale = timeScale;
    const delta = rawDelta * timeScale;
    this.updateStartGateAnimation(rawDelta);
    this.updateFinishSpinner(rawDelta);
    const obstacleStartedAt = performance.now();
    this.updatePinballObstacles(delta);
    this.updateDropTargetBoostAuras(delta);
    const obstacleMs = performance.now() - obstacleStartedAt;
    if (!this.performanceProfile?.renderSkipSpectacleEffects) this.updateSpectacleEffects(rawDelta);
    this.updatePodiumCeremony(rawDelta);
    if (this.performanceProfile?.renderSkipSpectacleEffects) this.updateConfetti(rawDelta);
    this.updateMarbleTrails(delta);
    let driveMs = 0;
    let physicsMs = 0;
    let syncMs = 0;
    if (this.state === 'running') {
      this.elapsed += delta;
      const driveStartedAt = performance.now();
      this.applyMarbleDrive();
      driveMs = performance.now() - driveStartedAt;
      const physicsStartedAt = performance.now();
      this.world.step(1 / 60, delta, this.performanceProfile?.runningMaxSubSteps ?? PERFORMANCE_TUNING.runningMaxSubSteps);
      physicsMs = performance.now() - physicsStartedAt;
      const syncStartedAt = performance.now();
      this.syncMarbles();
      syncMs = performance.now() - syncStartedAt;
      this.recordRaceHistorySample();
      this.updatePreFinishSlowMotionTrigger();
      this.checkFinishers();
      this.applyPostFirstFinishDnfCutoff();
      this.updateBroadcastDirector();
    } else if (this.state === 'ready') {
      this.updateCountdown(delta);
      const physicsStartedAt = performance.now();
      this.world.step(1 / 60, delta, PERFORMANCE_TUNING.readyMaxSubSteps);
      physicsMs = performance.now() - physicsStartedAt;
      const syncStartedAt = performance.now();
      this.syncMarbles();
      syncMs = performance.now() - syncStartedAt;
    }
    this.updateCamera(delta);
    const labelStartedAt = performance.now();
    this.updateMarbleNameLabels(delta);
    let uiMs = performance.now() - labelStartedAt;
    this.controls.enabled = true;
    if (!this.performanceProfile?.renderSkipOrbitControlsUpdate) this.controls.update();
    this.fpsFrames += 1;
    this.fpsTime += delta;
    if (this.fpsTime >= 0.5) {
      this.lastFps = Math.round(this.fpsFrames / this.fpsTime);
      this.ui.fps.textContent = String(this.lastFps);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    if (performance.now() - this.lastLeaderboardUpdate > (this.performanceProfile?.leaderboardUpdateMs || 300)) {
      const leaderboardStartedAt = performance.now();
      this.updateLeaderboard(false);
      uiMs += performance.now() - leaderboardStartedAt;
    }
    const now = performance.now();
    if (this.mediaRecorder?.state === 'recording' && now - this.lastRecordingStatusUpdate > 250) {
      this.lastRecordingStatusUpdate = now;
      const seconds = (now - this.recordingStartedAt) / 1000;
      const scope = this.recordingSource === 'browser-tab'
        ? 'browser tab only'
        : this.recordingSource === 'screen'
          ? 'full page UI'
          : '3D only';
      const audioSuffix = this.recordingSettings?.audioGranted
        ? ` + audio${this.recordingSettings?.displayAudioGranted ? '' : ' (page mix)'} · Opus 192kbps 48kHz stereo`
        : this.recordingSettings?.audioRequested ? ' · no audio granted' : '';
      const ttsPolicy = this.getTtsRecordingPolicy();
      const ttsSuffix = this.commentaryVoiceEnabled && ttsPolicy.tabAudioRequired && !this.recordingSettings?.displayAudioGranted
        ? ' · TTS needs Share tab audio'
        : this.commentaryVoiceEnabled && ttsPolicy.directPageMixRecordable
          ? ' · TTS page-mixed'
          : '';
      const mixSuffix = this.recordingSettings?.singleMixedAudioTrack ? ' · mixed audio track' : '';
      this.ui.recordStatus.textContent = `Recording ${seconds.toFixed(1)}s | ${scope}${audioSuffix}${mixSuffix}${ttsSuffix}`;
      this.updateTtsRecordingNotice();
    }
    if (now - this.lastUIUpdate > (this.performanceProfile?.uiUpdateMs || 200)) {
      this.lastUIUpdate = now;
      const uiStartedAt = performance.now();
      this.updateUI();
      uiMs += performance.now() - uiStartedAt;
    }
    this.updateReplayHighlightPlayback(rawDelta);
    const renderStartedAt = performance.now();
    this.renderer.render(this.scene, this.camera);
    const renderMs = performance.now() - renderStartedAt;
    const overlayStartedAt = performance.now();
    this.renderViewerCanvasOverlay();
    const overlayMs = performance.now() - overlayStartedAt;
    this.recordFrameProfilerSample({
      frameMs: performance.now() - frameStartedAt,
      obstacleMs,
      driveMs,
      physicsMs,
      syncMs,
      uiMs,
      renderMs,
      overlayMs,
      rafIntervalMs,
    });
  }

  setCachedText(node, value, cacheKey = null) {
    if (!node) return false;
    const text = String(value ?? '');
    const key = cacheKey || node.id || node.dataset?.uiCacheKey || null;
    if (key && this.uiWriteCache?.get(key) === text) {
      this.uiThrottleCounters.skippedTextWrites += 1;
      return false;
    }
    if (!key && node.textContent === text) {
      this.uiThrottleCounters.skippedTextWrites += 1;
      return false;
    }
    node.textContent = text;
    if (key) this.uiWriteCache?.set(key, text);
    this.uiThrottleCounters.textWrites += 1;
    return true;
  }

  setUIThrottleProfile(profileKey = 'live', overrides = {}) {
    const key = UI_THROTTLE_PROFILES[profileKey] ? profileKey : 'live';
    const profile = UI_THROTTLE_PROFILES[key];
    this.performanceProfile = {
      ...(this.performanceProfile || PERFORMANCE_TUNING),
      ...profile,
      ...overrides,
      mode: overrides.mode || ((key === 'smooth1080p' || key === 'turbo60') ? 'playwright-render-performance' : (this.performanceProfile?.mode || PERFORMANCE_TUNING.label)),
      uiThrottleProfile: key,
    };
    this.uiThrottleCounters.profileKey = key;
    // Apply physics settings that were set at world creation
    if (this.world?.solver) {
      const iterations = this.performanceProfile.physicsSolverIterations ?? PERFORMANCE_TUNING.physicsSolverIterations;
      if (this.world.solver.iterations !== iterations) {
        this.world.solver.iterations = iterations;
      }
    }
    return this.performanceProfile;
  }

  buildLeaderboardSignature(ranking) {
    return ranking.slice(0, 5).map((data, index) => {
      const progressBucket = Math.round((data.progress || 0) * 100);
      const finishBucket = data.finished ? Math.round((data.finishTime || 0) * 10) : '';
      const penalty = data.timePenalty || 0;
      return `${index}:${data.id}:${progressBucket}:${finishBucket}:${penalty}:${data.defeated ? 1 : 0}`;
    }).join('|');
  }

  getLeaderId() {
    if (this.cachedLeaderId !== null && performance.now() - (this.cachedRankingAt || 0) < (this.performanceProfile?.rankingCacheMs || 80)) return this.cachedLeaderId;
    const leader = this.getRanking()[0];
    return leader?.id ?? null;
  }

  getCatchupSpeedLimit(data, baseMaxSpeed, leaderDistance, guide = null) {
    const isTurnGuide = /corner/.test(guide?.guideTargetPieceType || '');
    const turnLimitedMaxSpeed = isTurnGuide
      ? baseMaxSpeed * (CATCHUP_ASSIST.turnPieceMaxSpeedRatio ?? 0.7)
      : baseMaxSpeed;
    const leaderId = this.getLeaderId();
    const gap = Math.max(0, leaderDistance - (data.distance || 0));
    const ranking = this.getRanking({ force: false });
    const rankIndex = ranking.findIndex((entry) => entry.id === data.id);
    const protectedLeaderCount = Math.max(1, CATCHUP_ASSIST.protectedLeaderCount || 1);
    const isProtectedLeader = data.id === leaderId || (CATCHUP_ASSIST.trailingPackOnly && rankIndex >= 0 && rankIndex < protectedLeaderCount);
    const baseBonusRatio = gap <= (CATCHUP_ASSIST.minGapForBonus || 0)
      ? 0
      : clamp((gap - (CATCHUP_ASSIST.minGapForBonus || 0)) / Math.max(1, CATCHUP_ASSIST.fullEffectGap - (CATCHUP_ASSIST.minGapForBonus || 0)), 0, 1) * CATCHUP_ASSIST.maxBonus;
    const progress = this.trackLength ? clamp((data.distance || 0) / this.trackLength, 0, 1) : 0;
    const lateRaceScale = clamp((progress - (CATCHUP_ASSIST.lateRaceStartProgress ?? 1)) / Math.max(0.001, 1 - (CATCHUP_ASSIST.lateRaceStartProgress ?? 1)), 0, 1);
    const lateBonusRatio = lateRaceScale * clamp(gap / Math.max(1, CATCHUP_ASSIST.lateRaceFullEffectGap || CATCHUP_ASSIST.fullEffectGap), 0, 1) * (CATCHUP_ASSIST.lateRaceMaxBonus || 0);
    const rawBonusRatio = baseBonusRatio + lateBonusRatio;
    const bonusRatio = clamp(rawBonusRatio, 0, CATCHUP_ASSIST.maxEffectiveBonus ?? rawBonusRatio);
    data.catchupGap = gap;
    data.catchupRankIndex = rankIndex;
    data.catchupBaseBonusRatio = baseBonusRatio;
    data.catchupLateBonusRatio = lateBonusRatio;
    data.catchupBonusRatio = (!this.catchupAssistEnabled || isProtectedLeader || (CATCHUP_ASSIST.disableBonusOnTurnPieces && isTurnGuide)) ? 0 : bonusRatio;
    data.catchupAssistSkippedReason = !this.catchupAssistEnabled
      ? 'disabled'
      : isProtectedLeader
        ? 'protected-leader-pack'
        : (CATCHUP_ASSIST.disableBonusOnTurnPieces && isTurnGuide)
          ? 'turn-piece-protected'
          : null;
    if (!this.catchupAssistEnabled || isProtectedLeader) return turnLimitedMaxSpeed;
    if (CATCHUP_ASSIST.disableBonusOnTurnPieces && isTurnGuide) return turnLimitedMaxSpeed;
    return turnLimitedMaxSpeed * (1 + bonusRatio);
  }

  isAssistFrameBehindMarble(data, frame, tolerance = 0.08) {
    if (!data || !frame?.p || !frame?.tangent || !data.body?.position) return false;
    const aheadDistance = new THREE.Vector3(
      frame.p.x - data.body.position.x,
      0,
      frame.p.z - data.body.position.z
    ).dot(frame.tangent);
    return aheadDistance < -tolerance;
  }

  applyMidTrackSpeedAssist(data, frame, forwardSpeed, maxSpeed, progress = null, velocity = null) {
    const assist = this.midTrackSpeedAssist;
    if (!assist?.enabled || data.finished || !this.trackLength) return;
    if (this.isAssistFrameBehindMarble(data, frame)) {
      data.midTrackSpeedAssistSkippedReason = 'assist-frame-behind-marble';
      return;
    }
    const raceProgress = progress ?? clamp((data.distance || 0) / this.trackLength, 0, 1);
    if (raceProgress < assist.startsAfterProgress || raceProgress > assist.endsBeforeProgress) return;

    const longTrackRatio = clamp((this.trackLength - TRACK_PRESETS.medium.base) / Math.max(TRACK_PRESETS.epic.base - TRACK_PRESETS.medium.base, 1), 0, 1);
    const lateRaceRatio = clamp((raceProgress - 0.45) / 0.35, 0, 1);
    const targetRatio = clamp(assist.minForwardSpeedRatio + longTrackRatio * 0.08 + lateRaceRatio * 0.06, 0, 0.98);
    const assistVelocity = velocity || new THREE.Vector3(data.body.velocity.x, data.body.velocity.y, data.body.velocity.z);
    const assistForwardSpeed = Math.max(0, assistVelocity.dot(frame.tangent));
    const targetForwardSpeed = maxSpeed * targetRatio;
    if (assistForwardSpeed >= targetForwardSpeed) return;

    const speedGapRatio = clamp((targetForwardSpeed - assistForwardSpeed) / Math.max(targetForwardSpeed, 0.001), 0, 1);
    const sustainScale = 1 + longTrackRatio * 0.55 + lateRaceRatio * 0.35;
    const force = frame.tangent.clone().multiplyScalar(this.speedPreset.accel * assist.forceScale * sustainScale * (0.45 + speedGapRatio * 0.55));
    data.body.wakeUp();
    data.body.applyForce(new CANNON.Vec3(force.x, Math.min(0, force.y), force.z), data.body.position);
    data.midTrackSpeedAssistForceCount = (data.midTrackSpeedAssistForceCount || 0) + 1;
    data.midTrackSpeedAssistTargetRatio = targetRatio;
    data.midTrackSpeedAssistSustainScale = sustainScale;
    data.midTrackSpeedAssistProgress = raceProgress;
    data.midTrackSpeedAssistForceOnly = assist.impulseScale <= 0;
    data.midTrackSpeedAssistFrameSource = 'centerFrame-at-driveDistance-no-lookAhead';

    if (assist.impulseScale > 0 && this.elapsed - (data.lastMidTrackSpeedAssistTime ?? -Infinity) >= assist.cooldown) {
      const impulse = frame.tangent.clone().multiplyScalar(this.speedPreset.unstuck * assist.impulseScale * (0.6 + speedGapRatio));
      data.body.applyImpulse(new CANNON.Vec3(impulse.x, Math.min(0, impulse.y), impulse.z), data.body.position);
      data.lastMidTrackSpeedAssistTime = this.elapsed;
      data.midTrackSpeedAssistCount = (data.midTrackSpeedAssistCount || 0) + 1;
      this.midTrackSpeedAssistCount += 1;
    }
  }

  applyFinalApproachAssist(data, frame, forwardSpeed, maxSpeed, progress = null, distanceToFinish = null) {
    const assist = this.finalApproachAssist;
    if (!assist?.enabled || data.finished || !this.trackLength) return;
    const raceProgress = progress ?? clamp((data.distance || 0) / this.trackLength, 0, 1);
    const remaining = distanceToFinish ?? Math.max(0, this.trackLength - (data.distance || 0));
    if (raceProgress < assist.startsAfterProgress && remaining > assist.finishDistance) return;

    const finishFrame = assist.useDirectFinishVector && remaining <= (assist.directFinishBlendDistance || assist.finishDistance)
      ? this.getFinishApproachFrame(data, frame)
      : frame;
    if (this.isAssistFrameBehindMarble(data, finishFrame)) {
      data.finalApproachAssistSkippedReason = 'assist-frame-behind-marble';
      return;
    }
    const finishVelocity = new THREE.Vector3(data.body.velocity.x, data.body.velocity.y, data.body.velocity.z);
    const finishForwardSpeed = Math.max(0, finishVelocity.dot(finishFrame.tangent));
    const targetForwardSpeed = maxSpeed * assist.minForwardSpeedRatio;
    const speedGapRatio = clamp((targetForwardSpeed - finishForwardSpeed) / Math.max(targetForwardSpeed, 0.001), 0, 1);
    const closeRatio = clamp(1 - remaining / Math.max(assist.finishDistance, 0.001), 0, 1);
    const forceScale = assist.forceScale * (0.75 + closeRatio * 0.55) * (0.45 + speedGapRatio * 0.75);
    const force = finishFrame.tangent.clone().multiplyScalar(this.speedPreset.accel * forceScale);
    data.body.wakeUp();
    data.body.applyForce(new CANNON.Vec3(force.x, Math.min(0, force.y), force.z), data.body.position);
    data.finalApproachAssistForceCount = (data.finalApproachAssistForceCount || 0) + 1;
    data.finalApproachAssistRemaining = remaining;
    data.finalApproachAssistTargetRatio = assist.minForwardSpeedRatio;
    data.finalApproachAssistForceOnly = assist.impulseScale <= 0;
    data.finalApproachUsesDirectFinishVector = Boolean(finishFrame.directFinishVector);
    data.finalApproachAssistFrameSource = finishFrame.directFinishVector ? 'direct-finish-vector' : 'track-frame';
    data.finalApproachAssistForceScale = forceScale;

    if (assist.impulseScale > 0 && this.elapsed - (data.lastFinalApproachAssistTime ?? -Infinity) >= assist.cooldown) {
      const impulse = finishFrame.tangent.clone().multiplyScalar(this.speedPreset.unstuck * assist.impulseScale * (0.7 + closeRatio + speedGapRatio));
      data.body.applyImpulse(new CANNON.Vec3(impulse.x, Math.min(0, impulse.y), impulse.z), data.body.position);
      data.lastFinalApproachAssistTime = this.elapsed;
      data.finalApproachAssistCount = (data.finalApproachAssistCount || 0) + 1;
      this.finalApproachAssistCount += 1;
    }
  }

  applyMinimumForwardSpeed(data, frame, forwardSpeed, maxSpeed, progress = null, velocity = null) {
    const assist = this.minForwardSpeedAssist;
    if (!assist?.enabled || data.finished || !this.trackLength) return;
    if (this.isAssistFrameBehindMarble(data, frame)) {
      data.minForwardSpeedSkippedReason = 'assist-frame-behind-marble';
      return;
    }
    const raceProgress = progress ?? clamp((data.distance || 0) / this.trackLength, 0, 1);
    if (raceProgress < assist.startsAfterProgress || raceProgress > assist.endsBeforeProgress) return;

    const currentVelocity = velocity || new THREE.Vector3(data.body.velocity.x, data.body.velocity.y, data.body.velocity.z);
    const assistForwardSpeed = Math.max(0, currentVelocity.dot(frame.tangent));
    const targetForwardSpeed = maxSpeed * assist.minForwardSpeedRatio;
    if (assistForwardSpeed >= targetForwardSpeed) return;

    const horizontalTangent = new THREE.Vector3(frame.tangent.x, 0, frame.tangent.z);
    if (horizontalTangent.lengthSq() < 0.0001) return;
    horizontalTangent.normalize();

    const lateralSpeed = currentVelocity.dot(frame.right);
    if (assist.lateralDamping < 1) {
      const lateralDelta = lateralSpeed * (assist.lateralDamping - 1);
      data.body.velocity.x += frame.right.x * lateralDelta;
      data.body.velocity.z += frame.right.z * lateralDelta;
    }

    const speedGap = targetForwardSpeed - assistForwardSpeed;
    // Feather the floor instead of snapping straight to the target. The old direct
    // large velocity delta could look like the marble was being pushed in visible
    // pulses whenever speed dipped below the floor after a bend/rail scrape.
    const velocityDelta = Math.min(speedGap * (assist.correctionBlend ?? 0.14), assist.maxVelocityDeltaPerFrame);
    if (velocityDelta <= 0.0001) return;
    data.body.wakeUp();
    data.body.velocity.x += horizontalTangent.x * velocityDelta;
    data.body.velocity.z += horizontalTangent.z * velocityDelta;
    data.minForwardSpeedAssistCount = (data.minForwardSpeedAssistCount || 0) + 1;
    data.minForwardSpeedTarget = targetForwardSpeed;
    data.minForwardSpeedVelocityDelta = velocityDelta;
    data.minForwardSpeedCorrectionBlend = assist.correctionBlend ?? 0.14;
    data.minForwardSpeedProgress = raceProgress;
    data.minForwardSpeedFrameSource = 'centerFrame-at-driveDistance-no-lookAhead';
    this.minForwardSpeedAssistCount += 1;
  }

  applyDirectionStabilityAssist(data, closest, frame, velocity, rawForwardSpeed, maxSpeed, progress = null, centerFrame = frame) {
    const assist = this.directionStabilityAssist;
    if (!assist?.enabled || data.finished || !this.trackLength) return;
    const raceProgress = progress ?? clamp((data.distance || 0) / this.trackLength, 0, 1);
    if (raceProgress < assist.startsAfterProgress || raceProgress > assist.endsBeforeProgress) return;

    const correctionFrame = centerFrame || frame;
    const correctionDistance = correctionFrame.distance ?? data.driveDistance ?? closest.distance;
    const localWidth = Math.max(1, this.getTrackWidthAt(correctionDistance));
    const toCorrectionPoint = new THREE.Vector3(
      correctionFrame.p.x - data.body.position.x,
      0,
      correctionFrame.p.z - data.body.position.z
    );
    const correctionAheadDistance = toCorrectionPoint.dot(frame.tangent);
    if (correctionAheadDistance < -(assist.correctionAheadTolerance ?? 0.2)) {
      data.directionStabilityAssistSkippedReason = 'correction-point-behind-marble';
      data.directionStabilityAssistCorrectionAheadDistance = correctionAheadDistance;
      return;
    }

    const offsetVector = new THREE.Vector3(data.body.position.x - correctionFrame.p.x, 0, data.body.position.z - correctionFrame.p.z);
    const lateralOffset = offsetVector.dot(correctionFrame.right);
    const lateralSpeed = velocity.dot(correctionFrame.right);
    const lateralSign = Math.sign(lateralOffset) || 1;
    const offsetRatio = clamp(Math.abs(lateralOffset) / Math.max(localWidth / 2, 0.001), 0, 1);
    const movingOutward = lateralSpeed * lateralSign > 0;
    const nearRail = offsetRatio >= (assist.railRiskOffsetRatio ?? assist.minLateralOffsetRatio ?? 0.72);
    const movingOutwardNearRail = movingOutward && offsetRatio >= (assist.outwardRailRiskOffsetRatio ?? 0.58);
    const recentlyRailContact = this.elapsed - (data.lastRailContactTime ?? -Infinity) <= (assist.recentRailContactSeconds ?? 0.7);
    const railRisk = nearRail || movingOutwardNearRail || recentlyRailContact;
    if (!railRisk) {
      data.directionStabilityAssistSkippedReason = 'not-near-or-recently-on-rail';
      data.directionStabilityAssistOffsetRatio = offsetRatio;
      data.directionStabilityAssistCorrectionAheadDistance = correctionAheadDistance;
      return;
    }

    if (assist.lateralDamping < 1 && Math.abs(lateralSpeed) > 0.05) {
      const lateralDelta = lateralSpeed * (assist.lateralDamping - 1);
      data.body.velocity.x += correctionFrame.right.x * lateralDelta;
      data.body.velocity.z += correctionFrame.right.z * lateralDelta;
    }

    if (rawForwardSpeed < 0 && assist.backwardDamping < 1) {
      const backwardDelta = rawForwardSpeed * (assist.backwardDamping - 1);
      data.body.velocity.x += frame.tangent.x * backwardDelta;
      data.body.velocity.y += frame.tangent.y * backwardDelta;
      data.body.velocity.z += frame.tangent.z * backwardDelta;
    }

    const inwardSign = -(Math.sign(lateralOffset) || 0);
    const centerRatio = Math.min(offsetRatio, assist.maxCenterCorrectionRatio ?? 0.46);
    const inwardForce = correctionFrame.right.clone().multiplyScalar(inwardSign * this.speedPreset.accel * assist.centerCorrectionForceScale * centerRatio);
    const tangentForceScale = rawForwardSpeed < maxSpeed * 0.35 ? assist.tangentRecoveryForceScale : assist.tangentRecoveryForceScale * 0.35;
    const tangentForce = frame.tangent.clone().multiplyScalar(this.speedPreset.accel * tangentForceScale);
    const combined = inwardForce.add(tangentForce);
    data.body.wakeUp();
    data.body.applyForce(new CANNON.Vec3(combined.x, Math.min(0, combined.y), combined.z), data.body.position);

    data.directionStabilityAssistCount = (data.directionStabilityAssistCount || 0) + 1;
    data.directionStabilityAssistProgress = raceProgress;
    data.directionStabilityAssistLateralOffset = lateralOffset;
    data.directionStabilityAssistOffsetRatio = offsetRatio;
    data.directionStabilityAssistRailRisk = railRisk;
    data.directionStabilityAssistNearRail = nearRail;
    data.directionStabilityAssistMovingOutwardNearRail = movingOutwardNearRail;
    data.directionStabilityAssistRecentlyRailContact = recentlyRailContact;
    data.directionStabilityAssistCorrectionAheadDistance = correctionAheadDistance;
    data.directionStabilityAssistCorrectionFrameDistance = correctionDistance;
    data.directionStabilityAssistDriveFrameDistance = frame.distance ?? data.driveFrameDistance;
    data.directionStabilityAssistForceOnly = true;
    data.directionStabilityAssistSkippedReason = null;
    this.directionStabilityAssistCount = (this.directionStabilityAssistCount || 0) + 1;
  }

  applyToyParkSoftGuidePhysics(data, centerFrame, guide, velocity, centerForwardSpeed, maxSpeed) {
    const assist = this.toyParkSoftGuidePhysics;
    if (this.physicsMechanicKey !== 'toyPark' || !assist?.enabled || data.finished || !centerFrame?.p || !centerFrame?.right) return;
    if (guide?.airborneAssistPaused) return;

    const localWidth = Math.max(1, this.getTrackWidthAt(guide?.driveDistance ?? data.driveDistance ?? 0));
    const offsetVector = new THREE.Vector3(
      data.body.position.x - centerFrame.p.x,
      0,
      data.body.position.z - centerFrame.p.z
    );
    const lateralOffset = offsetVector.dot(centerFrame.right);
    const offsetRatio = clamp(Math.abs(lateralOffset) / Math.max(localWidth / 2, 0.001), 0, 1);
    const startRatio = assist.centerPullStartsAtOffsetRatio ?? 0.16;
    const competitive = assist.competitive || {};
    const competitiveEnabled = competitive.enabled !== false;
    const activeRatio = clamp((offsetRatio - startRatio) / Math.max(0.001, 1 - startRatio), 0, 1);
    const piece = this.trackPieces?.[guide?.guideTargetPieceIndex] || this.trackPieces?.find((candidate) => {
      const d = guide?.guideDistance ?? data.guideDistance ?? 0;
      return d >= candidate.startD && d <= candidate.endD;
    });
    const turnDegreesSigned = piece?.turnDegrees || 0;
    const turnDegrees = Math.abs(turnDegreesSigned);
    const curveRatio = clamp((turnDegrees - (assist.curveStartsAtDegrees ?? 12)) / 78, 0, 1);
    const inwardSign = -(Math.sign(lateralOffset) || 0);
    const insideSign = turnDegreesSigned ? -Math.sign(turnDegreesSigned) : 0;
    const laneRole = !insideSign || Math.abs(lateralOffset) < 0.05
      ? 'center'
      : (Math.sign(lateralOffset) === insideSign ? 'inside' : 'outside');
    const centerFreedomReduction = competitiveEnabled ? (competitive.offsetFreedomCenterPullReduction ?? 0) : 0;
    const centerPullFreedomScale = 1 - clamp(centerFreedomReduction, 0, 0.75) * (1 - activeRatio) * (1 - curveRatio * 0.45);
    const centerPullScale = ((assist.centerPull ?? 0) + curveRatio * (assist.curveAssist ?? 0)) * centerPullFreedomScale;
    const innerCornerRailRiskRatio = competitiveEnabled && laneRole === 'inside' && curveRatio > 0
      ? clamp((offsetRatio - (competitive.innerCornerRailRescueStartsAtOffsetRatio ?? 0.58)) / Math.max(0.001, 1 - (competitive.innerCornerRailRescueStartsAtOffsetRatio ?? 0.58)), 0, 1)
      : 0;
    const perComponentMaxGuideForce = assist.maxGuideForce ?? Infinity;
    const maxCombinedGuideForce = assist.maxCombinedGuideForce ?? perComponentMaxGuideForce;
    const centerForceStrength = Math.min(
      perComponentMaxGuideForce,
      data.body.mass * this.speedPreset.accel * (centerPullScale * activeRatio + innerCornerRailRiskRatio * curveRatio * (competitive.innerCornerRailRescueCenterForceScale ?? 0.72))
    );
    const minForwardSpeed = maxSpeed * (assist.minForwardSpeedRatio ?? 0.42);
    const sustainForwardSpeed = maxSpeed * (assist.sustainForwardSpeedRatio ?? 0.38);
    const fullSpeedRecoveryRatio = clamp(assist.fullSpeedRecoveryRatio ?? 0, 0, 1);
    const fullSpeedRecoveryTarget = maxSpeed * fullSpeedRecoveryRatio;
    const fullSpeedRecoveryGapStartRatio = clamp(assist.fullSpeedRecoveryGapStartRatio ?? 0.08, 0, 1);
    const fullSpeedRecoveryGapFullRatio = Math.max(fullSpeedRecoveryGapStartRatio + 0.001, assist.fullSpeedRecoveryGapFullRatio ?? 0.55);
    const fullSpeedRecoveryGapRatio = fullSpeedRecoveryTarget > 0
      ? clamp((fullSpeedRecoveryTarget - centerForwardSpeed) / Math.max(fullSpeedRecoveryTarget, 0.001), 0, 1)
      : 0;
    const fullSpeedRecoveryActiveRatio = fullSpeedRecoveryRatio > 0
      ? clamp((fullSpeedRecoveryGapRatio - fullSpeedRecoveryGapStartRatio) / Math.max(0.001, fullSpeedRecoveryGapFullRatio - fullSpeedRecoveryGapStartRatio), 0, 1)
      : 0;
    const forwardGapRatio = centerForwardSpeed >= minForwardSpeed ? 0 : clamp((minForwardSpeed - centerForwardSpeed) / Math.max(minForwardSpeed, 0.001), 0, 1);
    const sustainGapRatio = centerForwardSpeed >= sustainForwardSpeed ? 0 : clamp((sustainForwardSpeed - centerForwardSpeed) / Math.max(sustainForwardSpeed, 0.001), 0, 1);
    const bendTangentAssist = curveRatio * (assist.bendTangentAssist ?? 0);
    const competitiveLaneSpeedRatio = competitiveEnabled && curveRatio > 0
      ? curveRatio * (laneRole === 'inside' ? (competitive.curveInsideBoostRatio ?? 0) : laneRole === 'outside' ? -(competitive.curveOutsideSlowdownRatio ?? 0) : 0)
      : 0;
    const railSlowdownStart = competitive.railSlowdownStartsAtOffsetRatio ?? 0.72;
    const railSlowdownRatio = competitiveEnabled
      ? clamp((offsetRatio - railSlowdownStart) / Math.max(0.001, 1 - railSlowdownStart), 0, 1)
      : 0;
    const railSlowdownDelta = Math.min(
      competitive.railSlowdownMaxDeltaPerFrame ?? 0,
      Math.max(0, centerForwardSpeed) * (competitive.railSlowdownStrength ?? 0) * railSlowdownRatio
    );
    if (railSlowdownDelta > 0.0001 && centerFrame?.tangent) {
      data.body.velocity.x -= centerFrame.tangent.x * railSlowdownDelta;
      data.body.velocity.z -= centerFrame.tangent.z * railSlowdownDelta;
      velocity.x = data.body.velocity.x;
      velocity.z = data.body.velocity.z;
    }
    const laneSpeedMultiplier = Math.max(0.72, 1 + competitiveLaneSpeedRatio - railSlowdownRatio * (competitive.railSlowdownStrength ?? 0) * 0.12);
    const innerCornerRailRescueTangentAssist = innerCornerRailRiskRatio * curveRatio * (competitive.innerCornerRailRescueTangentForceScale ?? 0.46);
    const fullSpeedRecoveryForce = Math.min(
      assist.fullSpeedRecoveryMaxForce ?? perComponentMaxGuideForce,
      data.body.mass
        * this.speedPreset.accel
        * (assist.fullSpeedRecoveryForceScale ?? 0)
        * (fullSpeedRecoveryActiveRatio * fullSpeedRecoveryActiveRatio)
        * (1 - curveRatio * (1 - (assist.fullSpeedRecoveryCurveScale ?? 0.42)))
        * (1 - railSlowdownRatio * (1 - (assist.fullSpeedRecoveryRailScale ?? 0.35)))
    );
    const tangentForceStrength = Math.min(
      perComponentMaxGuideForce,
      data.body.mass * this.speedPreset.accel * ((assist.forwardAssist ?? 0) * laneSpeedMultiplier * (0.72 * forwardGapRatio + 0.45 * sustainGapRatio) + bendTangentAssist + innerCornerRailRescueTangentAssist)
        + fullSpeedRecoveryForce
    );
    if (centerForceStrength <= 0.0001 && tangentForceStrength <= 0.0001) {
      data.toyParkSoftGuideActive = false;
      data.toyParkSoftGuideSkippedReason = 'below-force-threshold';
      data.toyParkSoftGuideMode = assist.mode;
      data.toyParkSoftGuideOffset = Number(lateralOffset.toFixed(3));
      data.toyParkSoftGuideOffsetRatio = Number(offsetRatio.toFixed(3));
      data.toyParkSoftGuideCurveRatio = Number(curveRatio.toFixed(3));
      data.toyParkCompetitiveEnabled = competitiveEnabled;
      data.toyParkCompetitiveLaneRole = laneRole;
      data.toyParkCompetitiveLaneSpeedRatio = Number(competitiveLaneSpeedRatio.toFixed(4));
      data.toyParkCompetitiveRailSlowdownRatio = Number(railSlowdownRatio.toFixed(3));
      data.toyParkCompetitiveRailSlowdownDelta = Number(railSlowdownDelta.toFixed(4));
      data.toyParkCompetitiveCenterPullFreedomScale = Number(centerPullFreedomScale.toFixed(3));
      data.toyParkCompetitiveLaneSpeedMultiplier = Number(laneSpeedMultiplier.toFixed(3));
      data.toyParkInnerCornerRailRiskRatio = Number(innerCornerRailRiskRatio.toFixed(3));
      data.toyParkInnerCornerRailRescueTangentAssist = Number(innerCornerRailRescueTangentAssist.toFixed(3));
      data.toyParkFullSpeedRecoveryTarget = Number(fullSpeedRecoveryTarget.toFixed(3));
      data.toyParkFullSpeedRecoveryGapRatio = Number(fullSpeedRecoveryGapRatio.toFixed(3));
      data.toyParkFullSpeedRecoveryActiveRatio = Number(fullSpeedRecoveryActiveRatio.toFixed(3));
      data.toyParkFullSpeedRecoveryForce = Number(fullSpeedRecoveryForce.toFixed(3));
      data.toyParkHardSplineLock = Boolean(assist.hardSplineLock);
      data.toyParkCollisionPreserved = Boolean(assist.collisionPreserved);
      return;
    }

    const centerForce = centerFrame.right.clone().multiplyScalar(inwardSign * centerForceStrength);
    const tangentForce = centerFrame.tangent.clone().multiplyScalar(tangentForceStrength);
    const force = centerForce.add(tangentForce);
    const forceMagnitude = Math.hypot(force.x, force.z);
    if (Number.isFinite(maxCombinedGuideForce) && forceMagnitude > maxCombinedGuideForce && forceMagnitude > 0.0001) {
      force.multiplyScalar(maxCombinedGuideForce / forceMagnitude);
    }
    data.body.wakeUp();
    data.body.applyForce(new CANNON.Vec3(force.x, 0, force.z), data.body.position);
    const velocitySustainBlend = clamp(assist.sustainVelocityBlend ?? 0, 0, 1);
    let sustainVelocityApplied = false;
    let sustainVelocityDelta = 0;
    if (velocitySustainBlend > 0 && centerForwardSpeed < sustainForwardSpeed && centerFrame?.tangent) {
      const targetForwardSpeed = lerp(centerForwardSpeed, sustainForwardSpeed, velocitySustainBlend);
      sustainVelocityDelta = Math.max(0, targetForwardSpeed - centerForwardSpeed);
      if (sustainVelocityDelta > 0.0001) {
        data.body.velocity.x += centerFrame.tangent.x * sustainVelocityDelta;
        data.body.velocity.z += centerFrame.tangent.z * sustainVelocityDelta;
        sustainVelocityApplied = true;
      }
    }
    data.toyParkSoftGuideActive = true;
    data.toyParkSoftGuideSkippedReason = null;
    data.toyParkSoftGuideMode = assist.mode;
    data.toyParkSoftGuideForce = Number(Math.hypot(force.x, force.z).toFixed(3));
    data.toyParkSoftGuideCenterForce = Number(centerForceStrength.toFixed(3));
    data.toyParkSoftGuideTangentForce = Number(tangentForceStrength.toFixed(3));
    data.toyParkSoftGuideMinForwardSpeed = Number(minForwardSpeed.toFixed(3));
    data.toyParkSoftGuideSustainForwardSpeed = Number(sustainForwardSpeed.toFixed(3));
    data.toyParkSoftGuideForwardGapRatio = Number(forwardGapRatio.toFixed(3));
    data.toyParkSoftGuideSustainGapRatio = Number(sustainGapRatio.toFixed(3));
    data.toyParkSoftGuideVelocitySustainApplied = sustainVelocityApplied;
    data.toyParkSoftGuideVelocitySustainDelta = Number(sustainVelocityDelta.toFixed(3));
    data.toyParkSoftGuideBendTangentAssist = Number(bendTangentAssist.toFixed(3));
    data.toyParkSoftGuideMaxCombinedForce = Number((Number.isFinite(maxCombinedGuideForce) ? maxCombinedGuideForce : 0).toFixed(3));
    data.toyParkSoftGuideOffset = Number(lateralOffset.toFixed(3));
    data.toyParkSoftGuideOffsetRatio = Number(offsetRatio.toFixed(3));
    data.toyParkSoftGuideCurveRatio = Number(curveRatio.toFixed(3));
    data.toyParkCompetitiveEnabled = competitiveEnabled;
    data.toyParkCompetitiveLaneRole = laneRole;
    data.toyParkCompetitiveLaneSpeedRatio = Number(competitiveLaneSpeedRatio.toFixed(4));
    data.toyParkCompetitiveRailSlowdownRatio = Number(railSlowdownRatio.toFixed(3));
    data.toyParkCompetitiveRailSlowdownDelta = Number(railSlowdownDelta.toFixed(4));
    data.toyParkCompetitiveCenterPullFreedomScale = Number(centerPullFreedomScale.toFixed(3));
    data.toyParkCompetitiveLaneSpeedMultiplier = Number(laneSpeedMultiplier.toFixed(3));
    data.toyParkHardSplineLock = Boolean(assist.hardSplineLock);
    data.toyParkCollisionPreserved = Boolean(assist.collisionPreserved);
    this.toyParkSoftGuideForceCount = (this.toyParkSoftGuideForceCount || 0) + 1;
  }

  applySlopeForwardAcceleration(data, frame, forwardSpeed, maxSpeed, rawForwardSpeed = forwardSpeed, velocity = null) {
    const slopeDrive = this.slopeDrive;
    if (!slopeDrive?.enabled || data.finished) return;
    if (this.isAssistFrameBehindMarble(data, frame)) {
      data.slopeDriveSkippedReason = 'assist-frame-behind-marble';
      return;
    }

    // 方向保護：frame 係由 Math.max(closest.distance, data.distance) + lookAhead 得出，
    // 即使複雜 90 度/U-turn 賽道附近 nearest sample 跳返後面，都唔會用倒退方向推波。
    if (rawForwardSpeed < 0 && slopeDrive.backwardDamping < 1) {
      const backwardDelta = rawForwardSpeed * (slopeDrive.backwardDamping - 1);
      data.body.velocity.x += frame.tangent.x * backwardDelta;
      data.body.velocity.y += frame.tangent.y * backwardDelta;
      data.body.velocity.z += frame.tangent.z * backwardDelta;
      data.forwardAccelerationDirectionCorrections = (data.forwardAccelerationDirectionCorrections || 0) + 1;
      this.forwardAccelerationDirectionCorrections += 1;
    }

    if (velocity && slopeDrive.lateralDamping < 1) {
      const lateralSpeed = velocity.dot(frame.right);
      const lateralDelta = lateralSpeed * (slopeDrive.lateralDamping - 1);
      data.body.velocity.x += frame.right.x * lateralDelta;
      data.body.velocity.z += frame.right.z * lateralDelta;
    }

    if (forwardSpeed >= maxSpeed) return;
    const accelGapRatio = clamp((maxSpeed - forwardSpeed) / Math.max(maxSpeed, 0.001), 0, 1);
    const forceRatio = clamp(accelGapRatio, slopeDrive.forceGapMin ?? 0.18, slopeDrive.forceGapMax ?? 1);
    const acceleration = this.speedPreset.accel * (slopeDrive.assistForceRatio ?? 1);
    const forceStrength = data.body.mass * acceleration * forceRatio;
    const guideBias = clamp(slopeDrive.guidePointBias ?? 0.68, slopeDrive.guidePointBiasMin ?? 0, slopeDrive.guidePointBiasMax ?? 1);
    const directGuideDirection = data.guideFrame
      ? new THREE.Vector3(data.guideFrame.p.x - data.body.position.x, data.guideFrame.p.y - data.body.position.y, data.guideFrame.p.z - data.body.position.z).normalize()
      : frame.tangent.clone();
    if (!Number.isFinite(directGuideDirection.x) || directGuideDirection.lengthSq() < 0.0001) directGuideDirection.copy(frame.tangent);
    const driveDirection = frame.tangent.clone().multiplyScalar(1 - guideBias).add(directGuideDirection.multiplyScalar(guideBias)).normalize();
    const force = driveDirection.multiplyScalar(forceStrength);
    data.body.wakeUp();
    data.body.applyForce(new CANNON.Vec3(force.x, force.y, force.z), data.body.position);
    data.slopeDriveForceCount = (data.slopeDriveForceCount || 0) + 1;
    data.forwardAccelerationActive = true;
    data.forwardAcceleration = acceleration;
    data.forwardAccelerationForce = forceStrength;
    data.forwardAccelerationFrameDistance = data.driveFrameDistance;
    data.forwardAccelerationLookAhead = slopeDrive.lookAhead;
    data.forwardAccelerationGuideBias = guideBias;
    data.forwardAccelerationDriveDirection = { x: driveDirection.x, y: driveDirection.y, z: driveDirection.z };
    data.forwardSpeed = forwardSpeed;
    data.rawForwardSpeed = rawForwardSpeed;
    data.topSpeed = maxSpeed;
    data.slopeDriveAcceleration = acceleration;
    data.slopeDriveSlopeY = frame.slopeY;
    this.slopeDriveForceCount += 1;
    this.forwardAccelerationForceCount += 1;
  }

  applyLandingReboundAbsorber(data, closest) {
    const absorber = this.landingReboundAbsorber;
    if (!absorber?.enabled || data.finished || !closest) return;
    const frame = this.getTrackFrameAt(closest.distance || data.distance || 0);
    const clearance = data.body.position.y - (frame.p.y + data.radius);
    const verticalVelocity = data.body.velocity.y;

    if (clearance > absorber.airborneClearance) {
      data.wasAirborne = true;
      data.airbornePeakClearance = Math.max(data.airbornePeakClearance || 0, clearance);
      if (verticalVelocity < 0) data.lastFallingSpeed = Math.max(data.lastFallingSpeed || 0, -verticalVelocity);
      return;
    }

    const recentlyTouchedTrack = this.elapsed - (data.lastTrackContactTime ?? -Infinity) <= (absorber.contactGraceSeconds ?? 0.18);
    const isLanding = data.wasAirborne
      && clearance <= absorber.landingClearance
      && recentlyTouchedTrack
      && (data.lastFallingSpeed || 0) >= (absorber.minFallingSpeed ?? 1);
    if (!isLanding) return;

    const upwardCap = absorber.upwardVelocityCap ?? 0.08;
    if (data.body.velocity.y > upwardCap) {
      data.body.velocity.y = upwardCap;
    } else if (data.body.velocity.y > 0) {
      data.body.velocity.y *= absorber.verticalDamping ?? 0.18;
    }
    if (!NO_ROLLING_SLOWDOWN.enabled) {
      data.body.angularVelocity.scale(absorber.angularDamping ?? 0.72, data.body.angularVelocity);
    }
    data.landingAbsorberCount = (data.landingAbsorberCount || 0) + 1;
    data.lastLandingAbsorberProgress = this.trackLength ? clamp((closest.distance || data.distance || 0) / this.trackLength, 0, 1) : 0;
    data.lastLandingAbsorberClearance = clearance;
    data.lastLandingAbsorberPeakClearance = data.airbornePeakClearance || 0;
    data.lastLandingAbsorberFallingSpeed = data.lastFallingSpeed || 0;
    data.lastLandingAbsorberUpwardCap = upwardCap;
    data.landingAbsorberNoImpulse = true;
    this.landingReboundAbsorberCount = (this.landingReboundAbsorberCount || 0) + 1;
    data.needsGuideRecalculationAfterLanding = true;
    data.lastLandingGuideRecalculationAt = this.elapsed;
    data.guideFrameSource = 'landing-recalculation-pending';
    data.wasAirborne = false;
    data.airbornePeakClearance = 0;
    data.lastFallingSpeed = 0;
  }

  getGuideTargetDistance(driveDistance) {
    const minForwardSeparation = this.guidePointPolicy?.minForwardSeparation ?? 0.35;
    const samePieceLookAhead = this.guidePointPolicy?.samePieceLookAhead ?? 1.35;
    const cornerSamePieceLookAhead = this.guidePointPolicy?.cornerSamePieceLookAhead ?? 0.9;
    const chainedTurnSamePieceLookAhead = this.guidePointPolicy?.chainedTurnSamePieceLookAhead ?? 0.72;
    const exitSnapDistance = this.guidePointPolicy?.exitSnapDistance ?? 2.2;
    const cornerExitNextEntranceMaxDistance = this.guidePointPolicy?.cornerExitNextEntranceMaxDistance ?? 4.2;
    const currentPiece = this.trackPieces.find((piece) => driveDistance >= piece.startD && driveDistance <= piece.endD);
    if (currentPiece) {
      const exitRemaining = currentPiece.endD - driveDistance;
      const prevPiece = this.trackPieces[currentPiece.index - 1];
      const nextPiece = this.trackPieces[currentPiece.index + 1];
      const isCornerPiece = Math.abs(currentPiece.turnDegrees || 0) > 0;
      const shouldSnapToNextEntrance = Boolean(
        nextPiece
        && currentPiece.endD < this.trackLength
        && nextPiece.startD - driveDistance <= exitSnapDistance
      );
      const isChainedTurnPiece = isCornerPiece && (
        Math.abs(prevPiece?.turnDegrees || 0) > 0 || Math.abs(nextPiece?.turnDegrees || 0) > 0
      );
      const lookAheadDistance = isChainedTurnPiece
        ? chainedTurnSamePieceLookAhead
        : (isCornerPiece ? cornerSamePieceLookAhead : samePieceLookAhead);

      if (shouldSnapToNextEntrance) {
        return {
          distance: clamp(nextPiece.startD, 0, this.trackLength),
          source: 'next-piece-entrance-guide',
          pieceIndex: nextPiece.index,
          pieceType: nextPiece.type,
          pieceStartD: nextPiece.startD,
          pieceEndD: nextPiece.endD,
          pieceBoundaryRole: 'entrance',
        };
      }

      if (exitRemaining > exitSnapDistance && currentPiece.endD < this.trackLength) {
        return {
          distance: clamp(driveDistance + Math.max(minForwardSeparation, lookAheadDistance), currentPiece.startD, currentPiece.endD),
          source: isChainedTurnPiece ? 'same-piece-chained-turn-lookahead-guide' : 'same-piece-lookahead-guide',
          pieceIndex: currentPiece.index,
          pieceType: currentPiece.type,
          pieceStartD: currentPiece.startD,
          pieceEndD: currentPiece.endD,
          pieceBoundaryRole: 'inside',
        };
      }

      if (exitRemaining >= minForwardSeparation || currentPiece.endD >= this.trackLength) {
        return {
          distance: clamp(currentPiece.endD, 0, this.trackLength),
          source: currentPiece.endD >= this.trackLength ? 'finish-line-guide' : 'current-piece-exit-guide',
          pieceIndex: currentPiece.index,
          pieceType: currentPiece.endD >= this.trackLength ? 'finish' : currentPiece.type,
          pieceStartD: currentPiece.startD,
          pieceEndD: currentPiece.endD,
          pieceBoundaryRole: currentPiece.endD >= this.trackLength ? 'finish' : 'exit',
        };
      }
    }

    const targetAfter = clamp(driveDistance + minForwardSeparation, 0, this.trackLength);
    const nextPiece = this.trackPieces.find((piece) => piece.startD > driveDistance && piece.startD >= targetAfter);
    if (nextPiece) {
      if (currentPiece && Math.abs(currentPiece.turnDegrees || 0) >= 89 && nextPiece.startD - driveDistance > cornerExitNextEntranceMaxDistance) {
        const clampedDistance = clamp(driveDistance + cornerExitNextEntranceMaxDistance, currentPiece.startD, currentPiece.endD);
        return {
          distance: clampedDistance,
          source: 'corner-exit-clamped-guide',
          pieceIndex: currentPiece.index,
          pieceType: currentPiece.type,
          pieceStartD: currentPiece.startD,
          pieceEndD: currentPiece.endD,
          pieceBoundaryRole: 'corner-exit-clamped',
        };
      }
      return {
        distance: clamp(nextPiece.startD, 0, this.trackLength),
        source: 'next-piece-entrance-guide',
        pieceIndex: nextPiece.index,
        pieceType: nextPiece.type,
        pieceStartD: nextPiece.startD,
        pieceEndD: nextPiece.endD,
        pieceBoundaryRole: 'entrance',
      };
    }
    return {
      distance: this.trackLength,
      source: 'finish-line-guide',
      pieceIndex: this.trackPieces[this.trackPieces.length - 1]?.index ?? null,
      pieceType: 'finish',
      pieceStartD: this.trackPieces[this.trackPieces.length - 1]?.startD ?? null,
      pieceEndD: this.trackLength,
      pieceBoundaryRole: 'finish',
    };
  }

  getGuideBlockingObstacle(guideDistance) {
    const padding = this.guidePointPolicy?.guideBlockedByObstacleRadiusPadding ?? 0.55;
    return (this.obstacles || [])
      .map((obstacle, index) => {
        const entry = this.getObstacleDebugEntries().find((candidate) => candidate.index === index);
        if (!entry) return null;
        const obstacleRadius = entry.radius || obstacle.radius || obstacle.halfLength || obstacle.halfWidth || 0;
        if (Math.abs(entry.distance - guideDistance) <= obstacleRadius + padding) {
          return {
            index: entry.index,
            type: entry.type,
            distance: entry.distance,
            pieceIndex: entry.pieceIndex,
            pieceType: entry.pieceType,
            radius: entry.radius,
            distanceFromGuide: Number(Math.abs(entry.distance - guideDistance).toFixed(2)),
          };
        }
        return null;
      })
      .find(Boolean) || null;
  }

  resolveDriveGuide(data, closest) {
    const policy = this.airborneGuidePolicy || AIRBORNE_GUIDE_POLICY;
    const nearestDistance = closest?.distance ?? data.distance ?? 0;
    const stableLastDriveDistance = Math.max(data.lastDriveMovementDistance || 0, data.distance || 0);
    const nonRegressionSlack = this.guidePointPolicy?.nonRegressionSlack ?? 1.15;
    const finishSlack = this.guidePointPolicy?.finishNearestSampleSlack ?? 3.5;
    let driveDistance = clamp(stableLastDriveDistance, 0, this.trackLength);
    if (nearestDistance >= stableLastDriveDistance - nonRegressionSlack || nearestDistance >= this.trackLength - finishSlack) {
      driveDistance = clamp(Math.max(stableLastDriveDistance, nearestDistance), 0, this.trackLength);
    }
    const nearestFrame = this.getTrackFrameAt(driveDistance);
    const beforeStartHandoff = this.isMarbleBeforeStartChuteHandoff(data);
    const clearance = beforeStartHandoff ? 0 : data.body.position.y - (nearestFrame.p.y + data.radius);
    const recentTrackContact = beforeStartHandoff || this.elapsed - (data.lastTrackContactTime ?? -Infinity) <= (this.landingReboundAbsorber?.contactGraceSeconds ?? 0.18);
    const airborneAssistPaused = Boolean(!beforeStartHandoff && policy.pauseAssistWhileAirborne && clearance > (policy.airborneClearance ?? 0.92));

    const guideTarget = this.getGuideTargetDistance(driveDistance);
    let guideDistance = guideTarget.distance;
    let guideFrameSource = guideTarget.source;
    let guideFrame = this.getTrackFrameAt(guideDistance);
    let guidePointAheadDistance = new THREE.Vector3(
      guideFrame.p.x - data.body.position.x,
      0,
      guideFrame.p.z - data.body.position.z
    ).dot(guideFrame.tangent);
    const guideBlockingObstacle = this.getGuideBlockingObstacle(guideDistance);
    const behindTolerance = policy.behindTolerance ?? 0.08;
    if (policy.guideMustStayBetweenMarbleAndFinish && !airborneAssistPaused) {
      let behindAdvanceAttempts = 0;
      while (guidePointAheadDistance < -behindTolerance && guideDistance < this.trackLength - 0.001 && behindAdvanceAttempts < 4) {
        const advanceBy = Math.max(
          this.guidePointPolicy?.minForwardSeparation ?? 0.35,
          Math.min(
            this.guidePointPolicy?.samePieceLookAhead ?? 1.35,
            Math.abs(guidePointAheadDistance) + (this.guidePointPolicy?.minForwardSeparation ?? 0.35)
          )
        );
        const advancedTarget = this.getGuideTargetDistance(Math.min(this.trackLength, guideDistance + advanceBy));
        if (!advancedTarget || advancedTarget.distance <= guideDistance + 0.001) break;
        guideDistance = advancedTarget.distance;
        guideFrameSource = `${advancedTarget.source}-advanced-from-behind-guide`;
        guideFrame = this.getTrackFrameAt(guideDistance);
        guidePointAheadDistance = new THREE.Vector3(
          guideFrame.p.x - data.body.position.x,
          0,
          guideFrame.p.z - data.body.position.z
        ).dot(guideFrame.tangent);
        Object.assign(guideTarget, advancedTarget, { source: guideFrameSource });
        behindAdvanceAttempts += 1;
      }
      if (behindAdvanceAttempts > 0) {
        data.guideBehindAdvanceCount = (data.guideBehindAdvanceCount || 0) + behindAdvanceAttempts;
        data.lastGuideBehindAdvanceAt = this.elapsed;
      }
    }
    const guideReached = guidePointAheadDistance <= (this.guidePointPolicy?.guideReachedAheadDistance ?? 0.22) && guidePointAheadDistance >= -behindTolerance;
    if (guideReached) {
      data.lastGuideReachTime = this.elapsed;
      data.lastGuideReachDistance = guideDistance;
    }
    const guideStalled = Boolean(
      !guideReached
      && this.elapsed - (data.lastGuideReachTime ?? this.elapsed) >= (this.guidePointPolicy?.guideStallSeconds ?? 1.15)
      && guidePointAheadDistance <= (this.guidePointPolicy?.guideUnreachedAheadDistance ?? 1.25)
    );

    if (guideStalled && !airborneAssistPaused) {
      const skipDistance = this.guidePointPolicy?.guideStallSkipDistance ?? 2.35;
      guideDistance = clamp(Math.max(guideDistance, driveDistance + skipDistance), 0, this.trackLength);
      guideFrameSource = guideBlockingObstacle ? 'stalled-guide-skip-obstacle-overlap' : 'stalled-guide-skip-next-point';
      guideFrame = this.getTrackFrameAt(guideDistance);
      guidePointAheadDistance = new THREE.Vector3(
        guideFrame.p.x - data.body.position.x,
        0,
        guideFrame.p.z - data.body.position.z
      ).dot(guideFrame.tangent);
      Object.assign(guideTarget, {
        distance: guideDistance,
        source: guideFrameSource,
        pieceIndex: this.trackPieces.find((piece) => guideDistance >= piece.startD && guideDistance <= piece.endD)?.index ?? guideTarget.pieceIndex,
        pieceType: this.trackPieces.find((piece) => guideDistance >= piece.startD && guideDistance <= piece.endD)?.type ?? guideTarget.pieceType,
        pieceBoundaryRole: guideBlockingObstacle ? 'stalled-skip-obstacle' : 'stalled-skip',
      });
    }

    const finishFallbackAllowed = driveDistance >= this.trackLength * (policy.finishFallbackOnlyAfterProgress ?? 0.92);
    if (policy.guideMustStayBetweenMarbleAndFinish && finishFallbackAllowed && !airborneAssistPaused && guidePointAheadDistance < -behindTolerance) {
      const finishTarget = {
        distance: this.trackLength,
        source: 'finish-line-guide',
        pieceIndex: this.trackPieces[this.trackPieces.length - 1]?.index ?? null,
        pieceType: 'finish',
        pieceStartD: this.trackPieces[this.trackPieces.length - 1]?.startD ?? null,
        pieceEndD: this.trackLength,
        pieceBoundaryRole: 'finish',
      };
      guideDistance = finishTarget.distance;
      guideFrameSource = finishTarget.source;
      guideFrame = this.getTrackFrameAt(guideDistance);
      guidePointAheadDistance = new THREE.Vector3(
        guideFrame.p.x - data.body.position.x,
        0,
        guideFrame.p.z - data.body.position.z
      ).dot(guideFrame.tangent);
      Object.assign(guideTarget, finishTarget);
    }

    if (data.needsGuideRecalculationAfterLanding && !airborneAssistPaused) {
      data.needsGuideRecalculationAfterLanding = false;
      data.lastGuideRecalculatedAfterLandingAt = this.elapsed;
      guideFrameSource = `${guideFrameSource}-post-landing-recalculated`;
    }

    const guideLateralOffset = new THREE.Vector3(
      guideFrame.p.x - guideFrame.p.x,
      0,
      guideFrame.p.z - guideFrame.p.z
    ).dot(guideFrame.right);
    const guideWithinTrackBounds = Math.abs(guideLateralOffset) <= this.getTrackWidthAt(guideDistance) / 2;

    const centerFrame = this.getTrackFrameAt(driveDistance);
    const driveFrameDistance = clamp(Math.max(guideDistance, driveDistance) + (this.slopeDrive?.lookAhead ?? this.finishDirectionAssist.lookAhead), 0, this.trackLength);
    const frame = this.getTrackFrameAt(driveFrameDistance);
    const forecastAheadDistance = new THREE.Vector3(
      frame.p.x - data.body.position.x,
      0,
      frame.p.z - data.body.position.z
    ).dot(centerFrame.tangent);
    const forecastBehindTolerance = this.slopeDrive?.forecastBehindTolerance ?? 0.05;
    const useForecastFrame = forecastAheadDistance >= -forecastBehindTolerance;
    const slopeFrame = guideFrame;
    const slopeFrameSource = `guide-target-frame:${guideFrameSource}`;

    return {
      guideDistance,
      driveDistance,
      driveFrameDistance,
      guideFrame,
      centerFrame,
      frame,
      slopeFrame,
      slopeFrameSource,
      forecastAheadDistance,
      forecastBehindTolerance,
      guidePointAheadDistance,
      guideFrameSource,
      guideTargetPieceIndex: guideTarget.pieceIndex ?? null,
      guideTargetPieceType: guideTarget.pieceType || null,
      guideTargetBoundaryRole: guideTarget.pieceBoundaryRole || null,
      guideWithinTrackBounds,
      guideLateralOffset,
      guideStalled,
      guideReached,
      guideBlockingObstacle,
      guideRecentlyTouchedTrack: recentTrackContact,
      guideRecentTrackContactWhileClearlyAirborne: Boolean(recentTrackContact && clearance > (policy.airborneClearance ?? 0.92)),
      airborneAssistPaused,
      airborneClearance: clearance,
    };
  }

  applyMarbleDrive() {
    const leaderDistance = Math.max(0, ...this.marbleData.map((marble) => marble.distance || 0));
    this.marbleData.forEach((data) => {
      if (data.finished) return;
      if (data.pendingFallRespawn) {
        if (this.elapsed >= data.pendingFallRespawn.respawnAt) {
          this.resetStuckMarble(data, data.pendingFallRespawn.respawnDistance, 'out-of-bounds');
          data.pendingFallRespawn = null;
        }
        return;
      }
      const closest = this.physicsMechanicKey === 'toyPark'
        ? this.findClosestProgressNearCurrent(data.body.position, data)
        : this.findClosestProgress(data.body.position);
      this.applyLandingReboundAbsorber(data, closest);
      const guide = this.resolveDriveGuide(data, closest);
      const { driveDistance, driveFrameDistance, frame, centerFrame, slopeFrame, slopeFrameSource, forecastAheadDistance, forecastBehindTolerance } = guide;
      data.driveDistance = driveDistance;
      data.guideDistance = guide.guideDistance;
      data.guideFrameSource = guide.guideFrameSource;
      data.guidePointAheadDistance = guide.guidePointAheadDistance;
      data.guideTargetPieceIndex = guide.guideTargetPieceIndex;
      data.guideTargetPieceType = guide.guideTargetPieceType;
      data.guideTargetBoundaryRole = guide.guideTargetBoundaryRole;
      data.guideWithinTrackBounds = guide.guideWithinTrackBounds;
      data.guideLateralOffset = guide.guideLateralOffset;
      data.guideStalled = guide.guideStalled;
      data.guideReached = guide.guideReached;
      data.guideBlockingObstacle = guide.guideBlockingObstacle;
      data.guideRecentlyTouchedTrack = guide.guideRecentlyTouchedTrack;
      data.guideRecentTrackContactWhileClearlyAirborne = guide.guideRecentTrackContactWhileClearlyAirborne;
      data.airborneGuideAssistPaused = guide.airborneAssistPaused;
      data.airborneGuideClearance = guide.airborneClearance;
      data.driveFrameDistance = driveFrameDistance;
      data.closestProgressDistance = closest.distance;
      data.rawClosestProgressDistance = closest.rawDistance ?? closest.distance;
      data.windowedClosestProgressDistance = closest.windowedDistance ?? closest.distance;
      data.overlapSafeProjection = Boolean(closest.overlapSafeProjection);
      data.overlapProjectionJump = Number.isFinite(closest.projectionJump) ? Number(closest.projectionJump.toFixed(3)) : 0;
      data.overlapProjectionWindow = closest.projectionWindow || null;
      const velocity = new THREE.Vector3(data.body.velocity.x, data.body.velocity.y, data.body.velocity.z);
      const speedPresetMax = this.speedPreset.maxSpeed;
      const progress = clamp(driveDistance / Math.max(this.trackLength, 0.001), 0, 1);
      const distanceToFinish = Math.max(0, this.trackLength - driveDistance);
      const slopeTopSpeed = speedPresetMax * (this.slopeDrive?.maxSpeedRatio ?? 1);
      const baseMaxSpeed = progress > 0.88 ? slopeTopSpeed * (this.finalApproachAssist?.maxSpeedRatio || 1.02) : slopeTopSpeed;
      const catchupMaxSpeed = this.getCatchupSpeedLimit(data, baseMaxSpeed, leaderDistance, guide);
      const maxSpeed = this.getObstacleBoostSpeedLimit(data, catchupMaxSpeed);
      if (this.physicsMechanicKey === 'toyPark'
        && this.toyParkSoftGuidePhysics?.enabled
        && this.elapsed <= (this.toyParkSoftGuidePhysics.startForwardSustainSeconds ?? 0)
        && centerFrame?.tangent) {
        const targetStartForwardSpeed = Math.min(
          maxSpeed,
          Math.max(
            this.toyParkSoftGuidePhysics.startForwardVelocityMin ?? 0,
            maxSpeed * (this.toyParkSoftGuidePhysics.startForwardVelocityRatio ?? 0)
          )
        );
        const currentStartForwardSpeed = velocity.dot(centerFrame.tangent);
        const startForwardDelta = clamp(
          targetStartForwardSpeed - currentStartForwardSpeed,
          0,
          this.toyParkSoftGuidePhysics.startForwardMaxDeltaPerFrame ?? 0.72
        );
        if (startForwardDelta > 0.0001) {
          data.body.velocity.x += centerFrame.tangent.x * startForwardDelta;
          data.body.velocity.z += centerFrame.tangent.z * startForwardDelta;
          velocity.x = data.body.velocity.x;
          velocity.z = data.body.velocity.z;
          data.toyParkStartForwardSustainApplied = true;
          data.toyParkStartForwardSustainDelta = Number(startForwardDelta.toFixed(3));
          data.toyParkStartForwardSustainTarget = Number(targetStartForwardSpeed.toFixed(3));
          data.toyParkStartForwardSustainPolicy = 'short-uniform-start-window-prevents-flat-grid-lane-contact-from-leaving-some-marbles-stationary';
        }
      }
      data.catchupMaxSpeed = catchupMaxSpeed;
      data.orbitRingBoostNormalMaxSpeed = catchupMaxSpeed;
      data.orbitRingBoostEffectiveMaxSpeed = this.getOrbitRingSpeedLimit(data, catchupMaxSpeed);
      data.orbitRingBoostCapOverrideActive = Boolean(data.orbitRingBoostActive && data.orbitRingBoostAllowExceedMaxSpeed && data.orbitRingBoostEffectiveMaxSpeed > catchupMaxSpeed);
      data.dropTargetBoostNormalMaxSpeed = catchupMaxSpeed;
      data.dropTargetBoostEffectiveMaxSpeed = maxSpeed;
      data.dropTargetBoostCapOverrideActive = Boolean(data.dropTargetBoostActive && data.dropTargetBoostAllowExceedMaxSpeed && maxSpeed > catchupMaxSpeed);
      if (guide.airborneAssistPaused) {
        data.guideAssistPausedReason = 'airborne-waiting-for-landing-recalculation';
        data.forwardAccelerationActive = false;
        if (this.physicsMechanicKey === 'toyPark' && this.toyParkSoftGuidePhysics?.enabled && this.elapsed <= 2.6 && centerFrame?.tangent) {
          const startSustainSpeed = Math.max(
            this.toyParkSoftGuidePhysics.launchForwardVelocityMin ?? 0,
            maxSpeed * (this.toyParkSoftGuidePhysics.sustainForwardSpeedRatio ?? 0.38)
          );
          const currentStartForward = Math.max(0, velocity.dot(centerFrame.tangent));
          const startSustainDelta = Math.max(0, startSustainSpeed - currentStartForward);
          if (startSustainDelta > 0.0001) {
            data.body.velocity.x += centerFrame.tangent.x * startSustainDelta;
            data.body.velocity.z += centerFrame.tangent.z * startSustainDelta;
            data.toyParkStartAirborneSustainApplied = true;
            data.toyParkStartAirborneSustainDelta = Number(startSustainDelta.toFixed(3));
            data.toyParkStartAirborneSustainSpeed = Number(startSustainSpeed.toFixed(3));
          }
        }
        data.finalSpeedCapApplied = false;
        return;
      }
      data.guideAssistPausedReason = null;
      data.body.wakeUp();
      const currentHorizontalSpeed = Math.hypot(data.body.velocity.x, data.body.velocity.z);
      if (currentHorizontalSpeed > maxSpeed) {
        const scale = maxSpeed / currentHorizontalSpeed;
        data.body.velocity.x *= scale;
        data.body.velocity.z *= scale;
        velocity.x = data.body.velocity.x;
        velocity.z = data.body.velocity.z;
      }
      const rawForwardSpeed = velocity.dot(slopeFrame.tangent);
      const forwardSpeed = Math.max(0, rawForwardSpeed);
      const centerRawForwardSpeed = velocity.dot(centerFrame.tangent);
      const centerForwardSpeed = Math.max(0, centerRawForwardSpeed);
      data.nonObstacleForceModel = 'tangent acceleration with top speed; no launch impulse';
      data.forwardAccelerationActive = false;
      data.centerFrameDistance = driveDistance;
      data.lookAheadDistanceDelta = driveFrameDistance - driveDistance;
      data.driveLookAhead = this.slopeDrive?.lookAhead ?? this.finishDirectionAssist.lookAhead;
      data.driveFrameTangent = { x: frame.tangent.x, y: frame.tangent.y, z: frame.tangent.z };
      data.centerFrameTangent = { x: centerFrame.tangent.x, y: centerFrame.tangent.y, z: centerFrame.tangent.z };
      data.slopeFrameSource = slopeFrameSource;
      data.slopeDriveGuideDistance = guide.guideDistance;
      data.slopeFrameForecastAheadDistance = forecastAheadDistance;
      data.slopeFrameForecastBehindTolerance = forecastBehindTolerance;
      data.slopeTopSpeed = slopeTopSpeed;
      data.centerForwardSpeed = centerForwardSpeed;
      data.centerRawForwardSpeed = centerRawForwardSpeed;
      this.applySlopeForwardAcceleration(data, slopeFrame, forwardSpeed, maxSpeed, rawForwardSpeed, velocity);
      this.applyToyParkSoftGuidePhysics(data, centerFrame, guide, velocity, centerForwardSpeed, maxSpeed);
      this.applyDirectionStabilityAssist(data, closest, frame, velocity, rawForwardSpeed, maxSpeed, progress, centerFrame);
      this.applyMinimumForwardSpeed(data, centerFrame, centerForwardSpeed, maxSpeed, progress, velocity);
      const postAssistHorizontalSpeed = Math.hypot(data.body.velocity.x, data.body.velocity.z);
      if (postAssistHorizontalSpeed > maxSpeed) {
        const scale = maxSpeed / postAssistHorizontalSpeed;
        data.body.velocity.x *= scale;
        data.body.velocity.z *= scale;
      }
      if (this.slopeDrive?.preserveSpeedAssists) {
        this.applyMidTrackSpeedAssist(data, centerFrame, centerForwardSpeed, maxSpeed, progress, velocity);
        this.applyFinalApproachAssist(data, frame, forwardSpeed, maxSpeed, progress, distanceToFinish);
      }
      const finalHorizontalSpeed = Math.hypot(data.body.velocity.x, data.body.velocity.z);
      if (this.slopeDrive?.capHorizontalSpeed && finalHorizontalSpeed > maxSpeed) {
        const scale = maxSpeed / finalHorizontalSpeed;
        data.body.velocity.x *= scale;
        data.body.velocity.z *= scale;
        data.finalSpeedCapApplied = true;
        data.finalSpeedCapLimit = maxSpeed;
      } else {
        data.finalSpeedCapApplied = false;
        data.finalSpeedCapLimit = maxSpeed;
      }

      const beforeStartChuteHandoff = this.isMarbleBeforeStartChuteHandoff(data);
      if (!beforeStartChuteHandoff && (data.body.position.y < frame.p.y - 5 || closest.lateralSq > (this.trackWidth * this.trackWidth * 3.2))) {
        this.scheduleFallRespawn(data, closest.distance);
        return;
      }

      const movedForward = driveDistance - (data.lastDriveMovementDistance ?? driveDistance);
      const minForwardProgress = this.stallElimination?.minForwardProgressMeters ?? 0.18;
      if (movedForward > minForwardProgress) {
        data.lastDriveMovementTime = this.elapsed;
        data.lastDriveMovementDistance = Math.max(data.lastDriveMovementDistance || 0, driveDistance);
        data.lastForwardProgressPercent = this.trackLength ? clamp(data.lastDriveMovementDistance / this.trackLength, 0, 1) : 0;
        data.lastForwardProgressPercentTime = this.elapsed;
        data.hasObservedForwardProgress = true;
      } else if (this.stallElimination?.enabled
        && (!this.stallElimination.requireObservedMotionBeforeElimination || data.hasObservedForwardProgress)
        && this.elapsed - (data.lastDriveMovementTime ?? 0) >= (this.stallElimination.delaySeconds ?? this.stuckResetDelay)) {
        // DNF is a real stall rule, not a long-track pacing penalty: timeout scales by track length/stage
        // and only starts after the marble has made meaningful forward progress since the gate opened.
        this.eliminateStalledMarble(data, closest.distance, 'no-forward-progress-timeout');
      }
    });
  }

  scheduleFallRespawn(data, currentDistance = 0) {
    if (data.finished || data.pendingFallRespawn) return;
    const confirmedSafeDistance = this.getFallRespawnSafeDistance(data, currentDistance);
    const respawnDistance = Math.max(0, confirmedSafeDistance - this.stuckResetPenalty);
    data.pendingFallRespawn = {
      detectedAt: this.elapsed,
      respawnAt: this.elapsed + this.fallRespawnDelay,
      closestDistanceAtFall: Number.isFinite(currentDistance) ? currentDistance : null,
      safeDistance: confirmedSafeDistance,
      respawnDistance,
      policy: FALL_RESPAWN_POLICY.label,
    };
    data.body.velocity.set(0, -0.2, 0);
    data.body.angularVelocity.set(0, 0, 0);
    data.body.force.set(0, 0, 0);
    data.body.torque.set(0, 0, 0);
    data.body.wakeUp();
  }

  getConfirmedOnTrackDistance(data, closest = null) {
    if (!data || data.pendingFallRespawn || data.finished || data.defeated || !data.body) return null;
    const progress = closest || this.findClosestProgress(data.body.position);
    if (!progress || !Number.isFinite(progress.distance)) return null;
    const frame = this.getTrackFrameAt(progress.distance);
    const localWidth = this.getTrackWidthAt(progress.distance);
    const dx = data.body.position.x - frame.p.x;
    const dz = data.body.position.z - frame.p.z;
    const lateral = Math.hypot(dx, dz);
    const edgeLimit = localWidth / 2 + (FALL_RESPAWN_POLICY.trackEdgeMarginMeters ?? 0.85);
    const verticalClearance = Math.abs(data.body.position.y - frame.p.y);
    if (lateral > edgeLimit) return null;
    if (verticalClearance > (FALL_RESPAWN_POLICY.maxVerticalClearanceMeters ?? 2.4)) return null;
    if (this.isMarbleBeforeStartChuteHandoff(data)) return null;
    return clamp(progress.distance, 0, Math.max(0, this.trackLength - (FALL_RESPAWN_POLICY.finishGuardDistanceMeters ?? 1.25)));
  }

  isMarbleBeforeStartChuteHandoff(data) {
    const startCatcher = this.startCatcher;
    const body = data?.body;
    if (!startCatcher || !body || !Number.isFinite(startCatcher.yaw) || !startCatcher.center) return false;
    const dx = body.position.x - startCatcher.center.x;
    const dz = body.position.z - startCatcher.center.z;
    const yaw = startCatcher.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const frontLocalZ = startCatcher.frontLocalZ ?? START_GATE_DESIGN.chuteDepth / 2;
    const handoffLocalZ = frontLocalZ - 0.45;
    const withinChuteWidth = Math.abs(localX) <= (startCatcher.width ?? this.trackWidth) / 2 + 0.65;
    if (withinChuteWidth && localZ < handoffLocalZ) {
      data.startHandoffProgressSuppressed = true;
      data.startHandoffLocalZ = localZ;
      return true;
    }
    data.startHandoffProgressSuppressed = false;
    data.startHandoffLocalZ = localZ;
    return false;
  }

  getConfirmedFinishDistance(data, closest = null) {
    if (!data || data.pendingFallRespawn || data.finished || data.defeated || !data.body) return null;
    const progress = closest || this.findClosestProgress(data.body.position);
    if (!progress || !Number.isFinite(progress.distance)) return null;
    const finishThreshold = FINISH_LINE_RULE.threshold ?? 0.08;
    if (progress.distance < this.trackLength - finishThreshold) return null;
    const frame = this.getTrackFrameAt(this.trackLength);
    const localWidth = this.getTrackWidthAt(this.trackLength);
    const dx = data.body.position.x - frame.p.x;
    const dz = data.body.position.z - frame.p.z;
    const lateral = Math.hypot(dx, dz);
    const edgeLimit = localWidth / 2 + (FALL_RESPAWN_POLICY.trackEdgeMarginMeters ?? 0.85);
    const verticalClearance = Math.abs(data.body.position.y - frame.p.y);
    if (lateral > edgeLimit) return null;
    if (verticalClearance > (FALL_RESPAWN_POLICY.maxVerticalClearanceMeters ?? 2.4)) return null;
    return clamp(progress.distance, 0, this.trackLength);
  }

  getFallRespawnSafeDistance(data, currentDistance = 0) {
    const finishGuardDistance = FALL_RESPAWN_POLICY.finishGuardDistanceMeters ?? 1.25;
    const maxSafeBeforeFinish = Math.max(0, this.trackLength - finishGuardDistance);
    const lastConfirmedSafeDistance = Number.isFinite(data?.lastSafeDistanceBeforeFall)
      ? data.lastSafeDistanceBeforeFall
      : 0;
    // Never trust the closest-path percentage measured while the marble is already falling/off-track.
    // Hairpins and the finish catcher can make an escaped marble's nearest sample jump forward;
    // respawn must use only the last confirmed on-track progress recorded before the fall.
    return clamp(lastConfirmedSafeDistance, 0, maxSafeBeforeFinish);
  }

  applyFallTimePenalty(data) {
    if (data.lastResetReason === 'out-of-bounds' && this.elapsed - (data.lastResetTime ?? -Infinity) < 0.35) return;
    const penalty = this.fallPenaltySeconds ?? FALL_TIME_PENALTY_SECONDS;
    data.timePenalty = (data.timePenalty || 0) + penalty;
    data.fallPenaltyCount = (data.fallPenaltyCount || 0) + 1;
    this.fallPenaltyCount += 1;
    this.totalFallPenaltySeconds += penalty;
  }

  resetStuckMarble(data, currentDistance = 0, reason = 'stuck') {
    if (data.finished) return;
    const safeDistance = Math.max(0, currentDistance);
    const respawnDistance = Math.max(0, safeDistance - this.stuckResetPenalty);
    const penaltyDistance = reason === 'out-of-bounds' ? safeDistance : respawnDistance;
    const frame = this.getTrackFrameAt(penaltyDistance);
    const localWidth = this.getTrackWidthAt(penaltyDistance);
    const sideJitter = ((data.id % 5) - 2) * Math.min(0.32, localWidth * 0.025);
    const resetPos = new THREE.Vector3(frame.p.x, frame.p.y + data.radius + 0.9, frame.p.z)
      .add(frame.right.clone().multiplyScalar(sideJitter))
      .add(frame.tangent.clone().multiplyScalar(-0.35));

    data.body.type = CANNON.Body.DYNAMIC;
    data.body.mass = 1.1 + (data.id % 4) * 0.04;
    data.body.updateMassProperties();
    data.body.position.copy(resetPos);
    data.body.velocity.set(0, 0, 0);
    data.body.angularVelocity.set(0, 0, 0);
    data.body.force.set(0, 0, 0);
    data.body.torque.set(0, 0, 0);
    data.body.wakeUp();

    data.pendingFallRespawn = null;
    const boundedPenaltyDistance = Math.min(penaltyDistance, Math.max(0, this.trackLength - (FALL_RESPAWN_POLICY.finishGuardDistanceMeters ?? 1.25)));
    data.distance = Math.min(data.distance || 0, boundedPenaltyDistance);
    data.lastSafeDistanceBeforeFall = boundedPenaltyDistance;
    data.progress = clamp(data.distance / this.trackLength, 0, 1);
    data.lastDistance = boundedPenaltyDistance;
    data.lastDriveMovementDistance = boundedPenaltyDistance;
    data.lastMovementTime = this.elapsed;
    data.lastDriveMovementTime = this.elapsed;
    data.hasObservedForwardProgress = false;
    data.lastResetTime = this.elapsed;
    data.stuckResets = (data.stuckResets || 0) + 1;
    data.lastResetReason = reason;
    if (reason === 'out-of-bounds') data.fallPenaltyCount = (data.fallPenaltyCount || 0) + 1;
    this.stuckResetCount += 1;

    data.mesh.position.copy(resetPos);
    if (data.visualQuaternion) data.mesh.quaternion.copy(data.visualQuaternion);
    data.lastVisualPosition = resetPos.clone();
  }

  eliminateStalledMarble(data, currentDistance = 0, reason = 'no-forward-progress-timeout', options = {}) {
    if (!data || data.finished || data.defeated) return;
    const { broadcast = true, dnfOrder = null, suppressCompletionCheck = false } = options;
    data.defeated = true;
    data.defeatTime = this.elapsed;
    data.defeatReason = reason;
    data.dnfOrder = Number.isFinite(dnfOrder) ? dnfOrder : null;
    data.finished = true;
    data.finishTime = Number.POSITIVE_INFINITY;
    data.distance = Math.max(data.distance || 0, currentDistance || 0);
    data.progress = this.trackLength ? clamp(data.distance / this.trackLength, 0, 1) : (data.progress || 0);
    data.lastResetReason = reason;
    data.lastResetTime = this.elapsed;
    data.pendingFallRespawn = null;
    data.body.velocity.set(0, 0, 0);
    data.body.angularVelocity.set(0, 0, 0);
    data.body.force.set(0, 0, 0);
    data.body.torque.set(0, 0, 0);
    data.body.type = CANNON.Body.STATIC;
    data.body.mass = 0;
    data.body.updateMassProperties();
    this.world.removeBody(data.body);
    this.scene.remove(data.mesh);
    if (data.labelSprite) this.scene.remove(data.labelSprite);
    if (data.trail?.line) this.scene.remove(data.trail.line);
    data.removedFromRace = true;
    data.rank = this.marbleData.length;
    this.finishers.push(data);
    this.defeatedMarbles.push(data);
    this.stallEliminationCount += 1;
    this.stuckResetCount += 1;
    this.cachedRanking = null;
    this.cachedRankingAt = 0;
    if (broadcast) this.pushBroadcastEvent('DNF Eliminated', `${data.name} DNF`, { kind: 'dnf', force: true, marbleId: data.id, lines: [`${data.name} DNF`, `${data.name} no progress`, `${data.name} out`] });
    if (!suppressCompletionCheck) this.checkFinishers();
  }

  applyPostFirstFinishDnfCutoff() {
    const policy = this.postFirstFinishDnfCutoff || POST_FIRST_FINISH_DNF_CUTOFF;
    if (!policy.enabled || policy.triggered || this.state !== 'running' || !this.firstFinishTime) return 0;
    const delaySeconds = policy.delaySeconds ?? 15;
    const elapsedSinceFirstFinish = this.firstFinishRealTimeMs
      ? (performance.now() - this.firstFinishRealTimeMs) / 1000
      : this.elapsed - this.firstFinishTime;
    if (elapsedSinceFirstFinish < delaySeconds) return 0;
    const unfinishedRanking = this.getRanking({ force: true }).filter((data) => !data.finished && !data.defeated);
    if (!unfinishedRanking.length) return 0;
    const finishedPodiumCount = this.finishers.filter((item) => item && !item.defeated && !item.removedFromRace).length;
    unfinishedRanking.forEach((data, index) => {
      data.postFirstFinishDnfRank = finishedPodiumCount + index + 1;
      this.eliminateStalledMarble(data, data.distance || data.driveDistance || 0, policy.reason || 'post-first-finish-cutoff', {
        broadcast: false,
        dnfOrder: index + 1,
        suppressCompletionCheck: true,
      });
    });
    this.postFirstFinishDnfCutoff = {
      ...policy,
      triggered: true,
      triggeredAt: this.elapsed,
      triggeredAtRealTimeMs: performance.now(),
      dnfCount: unfinishedRanking.length,
      unfinishedOrder: unfinishedRanking.map((data, index) => ({
        rank: finishedPodiumCount + index + 1,
        dnfOrder: index + 1,
        id: data.id,
        name: data.name,
        progress: data.progress || 0,
        distance: data.distance || 0,
      })),
    };
    const names = unfinishedRanking.slice(0, 4).map((data) => data.name).join(', ');
    const suffix = unfinishedRanking.length > 4 ? ` +${unfinishedRanking.length - 4}` : '';
    this.pushBroadcastEvent('DNF cutoff', `${unfinishedRanking.length} DNF after ${delaySeconds}s${names ? `: ${names}${suffix}` : ''}`, { kind: 'dnf', force: true, lines: [`${unfinishedRanking.length} DNF after ${delaySeconds}s`] });
    this.cachedRanking = null;
    this.cachedRankingAt = 0;
    this.checkFinishers();
    return unfinishedRanking.length;
  }

  syncMarbles() {
    this.marbleData.forEach((data) => {
      if (data.defeated || data.removedFromRace) return;
      const nextPos = new THREE.Vector3(data.body.position.x, data.body.position.y, data.body.position.z);
      const previous = data.lastVisualPosition || nextPos.clone();
      const delta = nextPos.clone().sub(previous);
      const horizontal = new THREE.Vector3(delta.x, 0, delta.z);
      const rollDistance = horizontal.length();

      if (!data.visualQuaternion) data.visualQuaternion = data.mesh.quaternion.clone();
      if (rollDistance > 0.0008 && data.radius > 0) {
        const direction = horizontal.normalize();
        const rollAxis = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
        const maxRoll = 0.34;
        const rollAngle = clamp(rollDistance / data.radius, -maxRoll, maxRoll);
        const rollQuat = new THREE.Quaternion().setFromAxisAngle(rollAxis, rollAngle);
        data.visualQuaternion.premultiply(rollQuat).normalize();
      } else if (!NO_ROLLING_SLOWDOWN.enabled) {
        data.body.angularVelocity.scale(NO_ROLLING_SLOWDOWN.idleAngularDampingScale ?? 0.86, data.body.angularVelocity);
      }

      const angularSpeed = data.body.angularVelocity.length();
      const maxAngularSpeed = NO_ROLLING_SLOWDOWN.maxAngularSpeed ?? 24;
      if (angularSpeed > maxAngularSpeed) data.body.angularVelocity.scale(maxAngularSpeed / angularSpeed, data.body.angularVelocity);

      data.mesh.position.copy(nextPos);
      data.mesh.quaternion.copy(data.visualQuaternion);
      if (data.labelSprite) data.labelSprite.position.copy(nextPos).add(new THREE.Vector3(0, data.radius + 0.82, 0));
      data.lastVisualPosition = nextPos;
      const closest = this.findClosestProgress(data.body.position);
      const trackDistanceForSafety = this.getConfirmedOnTrackDistance(data, closest);
      const finishDistance = this.getConfirmedFinishDistance(data, closest);
      if (Number.isFinite(finishDistance)) {
        data.distance = Math.max(data.distance || 0, finishDistance);
      }
      if (Number.isFinite(trackDistanceForSafety)) {
        data.lastSafeDistanceBeforeFall = Math.max(data.lastSafeDistanceBeforeFall || 0, trackDistanceForSafety);
        data.distance = Math.max(data.distance || 0, trackDistanceForSafety);
      }
      data.progress = clamp(data.distance / this.trackLength, 0, 1);
      if (!data.finished && Number.isFinite(trackDistanceForSafety) && trackDistanceForSafety > (data.lastDistance || 0) + 0.45) {
        data.lastDistance = trackDistanceForSafety;
        data.lastMovementTime = this.elapsed;
      }
    });
  }

  getRankingSlotPosition(index, collector, radius = 0.45, rank = index + 1) {
    if (collector.podiumStyle === 'top-3-on-podium-rest-below') {
      if (rank <= 3) {
        const slot = (collector.podiumSlots || []).find((item) => item.rank === rank) || collector.podiumSlots[index];
        return collector.center.clone().add(this.localToWorldOffset(slot.x, slot.height + radius + 0.14, slot.z, collector.yaw));
      }
      const lowerIndex = Math.max(0, rank - 4);
      const cols = collector.lowerSlots?.cols || collector.cols || 4;
      const row = Math.floor(lowerIndex / cols);
      const col = lowerIndex % cols;
      const x = (col - (cols - 1) / 2) * collector.slotGap;
      const z = (collector.lowerSlots?.originZ ?? 2.35) + row * collector.slotGap;
      return collector.center.clone().add(this.localToWorldOffset(x, radius + 0.08, z, collector.yaw));
    }
    const col = index % collector.cols;
    const row = Math.floor(index / collector.cols);
    const x = (col - (collector.cols - 1) / 2) * collector.slotGap;
    const z = -collector.depth / 2 + 2.35 + row * collector.slotGap;
    return collector.center.clone().add(this.localToWorldOffset(x, radius + 0.08, z, collector.yaw));
  }

  checkFinishers() {
    if (this.state === 'finished') return;
    this.marbleData.forEach((data) => {
      const finishThreshold = FINISH_LINE_RULE.threshold ?? 0.08;
      if (!data.finished && !data.defeated && !data.pendingFallRespawn && data.distance >= this.trackLength - finishThreshold) {
        data.finishTime = this.elapsed + (data.timePenalty || 0);
        data.body.linearDamping = 0.72;
        data.body.angularDamping = 0.78;
        const finishFrame = this.getTrackFrameAt(this.trackLength);
        const collector = this.finishRankingContainer;
        const finishedPodiumCount = this.finishers.filter((item) => item && !item.defeated && !item.removedFromRace).length;
        const rank = finishedPodiumCount + 1;
        const index = rank - 1;
        const collectPos = collector
          ? this.getRankingSlotPosition(index, collector, data.radius, rank)
          : new THREE.Vector3(finishFrame.p.x, finishFrame.p.y + 0.75, finishFrame.p.z).add(finishFrame.tangent.clone().multiplyScalar(3 + index * 1.2));
        data.body.position.copy(collectPos);
        data.body.velocity.set(0, 0, 0);
        data.body.angularVelocity.set(0, 0, 0);
        data.body.type = CANNON.Body.KINEMATIC;
        data.body.mass = 0;
        data.body.updateMassProperties();
        data.mesh.position.copy(data.body.position);
        if (data.labelSprite) data.labelSprite.position.copy(data.mesh.position).add(new THREE.Vector3(0, data.radius + 0.82, 0));
        if (data.visualQuaternion) data.mesh.quaternion.copy(data.visualQuaternion);
        data.finished = true;
        data.body.sleep();
        data.rank = rank;
        data.placedInFinishContainer = true;
        this.finishers.push(data);
        if (this.finishers.length === 1) {
          this.firstFinishTime = this.elapsed;
          this.firstFinishRealTimeMs = performance.now();
          this.defaultCameraPhaseUntil = this.elapsed + (BROADCAST_CAMERA.postFirstFinish?.finishHoldSeconds ?? 4);
          if (this.isToyParkViewerOverlayActive()) {
            this.ui.winner.textContent = '';
            this.ui.winner.classList.add('hidden');
          } else {
            this.ui.winner.textContent = `🏆 ${data.name} wins! ${data.finishTime.toFixed(2)}s`;
            this.ui.winner.classList.remove('hidden');
          }
          this.pushBroadcastEvent('Winner', `${data.name} wins`, { kind: 'winner', force: true, marbleId: data.id, lines: [`${data.name} wins`, `${data.name} takes flag`, `${data.name} first home`] });
          if (!this.finishSlowMotion?.active) this.triggerFinishSlowMotion(data, { reason: 'finish-line-crossed-fallback', crossed: true });
          this.playFinishSound(true);
          this.spawnImpactEffect(collectPos, 0xffd166, 'burst');
          this.spawnFinishConfetti(collectPos, 132, { cannon: true });
        }
      }
    });
    if (this.finishers.length === this.marbleData.length && this.marbleData.length > 0) {
      this.state = 'finished';
      this.cameraMode = 'default';
      const finalRanking = this.getRanking({ force: true });
      this.handleCupRaceComplete(finalRanking);
      this.handleSurvivorLeagueRaceComplete(finalRanking);
      this.handleSingleRecordingRaceComplete();
      this.handleContinuousRecordingRaceComplete();
      this.handleAutoCupRaceComplete();
      this.startPodiumCeremony(finalRanking.slice(0, 3));
      this.showFinalShowcase();
      const completeLabel = this.cupMode?.active
        ? (this.cupMode.status === 'complete' ? 'Cup Champion Ceremony' : 'Qualified')
        : 'Group winner';
      const podiumLine = this.buildPodiumResultLine(finalRanking);
      this.pushBroadcastEvent(completeLabel, podiumLine, { kind: 'complete', force: true, lines: [podiumLine] });
      this.ui.start.textContent = this.cupMode?.active
        ? (this.cupMode.status === 'complete' ? 'Restart Cup' : 'Next Cup Match')
        : 'Re-stage';
      this.defaultCameraPhaseUntil = Math.max(this.defaultCameraPhaseUntil || 0, this.elapsed + 999);
    }
  }

  getRaceRanking({ force = false, includeDefeated = true } = {}) {
    const now = performance.now();
    const cacheMs = this.performanceProfile?.rankingCacheMs || 80;
    if (includeDefeated && !force && this.cachedRanking && now - (this.cachedRankingAt || 0) < cacheMs) return this.cachedRanking;
    const ranking = [...this.marbleData]
      .filter((data) => includeDefeated || !data.defeated)
      .sort((a, b) => {
        if (a.defeated && b.defeated) {
          const aDnfOrder = Number.isFinite(a.dnfOrder) ? a.dnfOrder : Infinity;
          const bDnfOrder = Number.isFinite(b.dnfOrder) ? b.dnfOrder : Infinity;
          return aDnfOrder - bDnfOrder || (b.progress || 0) - (a.progress || 0) || (a.defeatTime ?? Infinity) - (b.defeatTime ?? Infinity);
        }
        if (a.defeated) return 1;
        if (b.defeated) return -1;
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.progress - a.progress;
      });
    if (includeDefeated) {
      this.cachedRanking = ranking;
      this.cachedRankingAt = now;
      this.cachedLeaderId = this.cachedRanking[0]?.id ?? null;
    }
    return ranking;
  }

  getRanking({ force = false } = {}) {
    return this.getRaceRanking({ force, includeDefeated: true });
  }

  getPodiumRanking({ force = false } = {}) {
    return this.getRaceRanking({ force, includeDefeated: false });
  }

  getReusableMarbleRegistry() {
    return this.marbleData.map((data) => ({
      id: data.id,
      code: data.code,
      name: data.name,
      displayName: data.displayName,
      colorName: data.colorName,
      colorHex: data.colorHex,
      paletteHex: data.paletteHex,
      materialKey: data.materialKey,
      materialName: data.materialName,
      patternKey: data.patternKey,
      patternName: data.patternName,
      sizeKey: data.sizeKey,
      sizeName: data.sizeName,
      radius: data.radius,
    }));
  }

  getReusableRaceResults() {
    return this.getRanking({ force: true }).map((data, index) => ({
      rank: data.finished ? index + 1 : null,
      dnfOrder: data.dnfOrder ?? null,
      postFirstFinishDnfRank: data.postFirstFinishDnfRank ?? null,
      defeated: Boolean(data.defeated),
      defeatTime: data.defeatTime ?? null,
      defeatReason: data.defeatReason || null,
      removedFromRace: Boolean(data.removedFromRace),
      code: data.code,
      name: data.name,
      colorName: data.colorName,
      colorHex: data.colorHex,
      paletteHex: data.paletteHex,
      materialName: data.materialName,
      patternName: data.patternName,
      sizeName: data.sizeName,
      radius: data.radius,
      finishTime: data.finishTime,
      progressPercent: Math.round((data.progress || 0) * 100),
      timePenalty: data.timePenalty || 0,
      fallPenalties: data.fallPenaltyCount || 0,
      pendingFallRespawn: Boolean(data.pendingFallRespawn),
      fallRespawnIn: data.pendingFallRespawn ? Math.max(0, data.pendingFallRespawn.respawnAt - this.elapsed) : 0,
      lastSafeDistanceBeforeFall: data.lastSafeDistanceBeforeFall || 0,
      reusableLine: `${data.code} | ${data.name} | ${data.colorName} ${data.colorHex} palette=${(data.paletteHex || [data.colorHex]).join('+')} | ${data.materialName || 'Glass'} | ${data.patternName} | ${data.sizeName} r=${data.radius.toFixed(3)}`,
    }));
  }

  getReusableMarbleLine(data) {
    return `${data.code} | ${data.name} | ${data.colorName} ${data.colorHex} palette=${(data.paletteHex || [data.colorHex]).join('+')} | ${data.materialName || 'Glass'} | ${data.patternName} | ${data.sizeName} r=${data.radius.toFixed(3)}`;
  }

  async copyReusableMarble(data, feedbackTarget = null) {
    const line = this.getReusableMarbleLine(data);
    let original = null;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(line);
      else {
        const textarea = document.createElement('textarea');
        textarea.value = line;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      if (feedbackTarget) {
        const isButton = feedbackTarget.tagName === 'BUTTON';
        original = feedbackTarget.dataset.label || feedbackTarget.textContent;
        feedbackTarget.dataset.label = original;
        feedbackTarget.textContent = isButton ? 'Copied' : `${original} ✓`;
        feedbackTarget.classList.add('copied');
        setTimeout(() => {
          feedbackTarget.textContent = original;
          feedbackTarget.classList.remove('copied');
        }, 900);
      }
    } catch (error) {
      console.warn('Copy marble identity failed', error);
      if (feedbackTarget) {
        original = feedbackTarget.dataset.label || feedbackTarget.textContent;
        feedbackTarget.textContent = 'Copy failed';
        setTimeout(() => { feedbackTarget.textContent = original; }, 1200);
      }
    }
  }

  updateLeaderboard(force) {
    const now = performance.now();
    if (!force && now - this.lastLeaderboardUpdate < (this.performanceProfile?.leaderboardUpdateMs || 300)) return;
    this.lastLeaderboardUpdate = now;
    const ranking = this.getRanking({ force: true });
    const signature = this.buildLeaderboardSignature(ranking);
    if (!force && signature === this.lastLeaderboardSignature) {
      this.uiThrottleCounters.leaderboardSkippedBySignature += 1;
      return;
    }
    this.lastLeaderboardSignature = signature;
    this.uiThrottleCounters.leaderboardSignature = signature;
    this.uiThrottleCounters.leaderboardRenders += 1;
    this.ui.leaderboard.replaceChildren();
    const fragment = document.createDocumentFragment();
    ranking.slice(0, 5).forEach((data, index) => {
      const li = document.createElement('li');
      if (data.finished) li.classList.add('finished');
      if (index === 0) li.classList.add('leader');
      const previousTopIndex = (this.previousTopFiveIds || []).indexOf(data.id);
      if (previousTopIndex > index) li.classList.add('rank-up');
      const color = `#${data.color.toString(16).padStart(6, '0')}`;
      const gapToLeader = ranking[0] && ranking[0].id !== data.id ? Math.max(0, (ranking[0].distance || 0) - (data.distance || 0)) : 0;
      const label = data.defeated
        ? `DNF ${Math.round(data.progress * 100)}%`
        : (data.finished
          ? `${data.finishTime.toFixed(2)}s${data.timePenalty ? ` (+${data.timePenalty}s)` : ''}`
          : `${Math.round(data.progress * 100)}%${data.timePenalty ? ` +${data.timePenalty}s` : ''}`);
      const gapLabel = index === 0
        ? 'Leader'
        : (data.defeated ? 'DNF' : (data.finished ? `#${index + 1}` : `+${gapToLeader.toFixed(1)}m`));
      li.innerHTML = `<div class="racer-row"><span class="rank-badge">#${index + 1}</span><span class="swatch" style="background:${color};color:${color}"></span><span class="racer-name">${data.name}</span><span class="racer-progress">${label}</span><span class="racer-gap">${gapLabel}</span></div>`;
      li.addEventListener('click', () => {
        this.selectedIndex = data.id;
        this.ui.select.value = String(data.id);
        this.cameraMode = 'selected';
      });
      fragment.appendChild(li);
    });
    this.ui.leaderboard.appendChild(fragment);
    if (ranking[0]) this.currentLeader = ranking[0];
  }

  updateUI() {
    if (!this.mediaRecorder && this.recordingCategory) this.recordingCategory = null;
    this.updateRecordingFpsVisibility();
    if (this.ui.record && this.mediaRecorder?.state !== 'recording') this.setCachedText(this.ui.record, 'Single', 'record-button');
    if (this.ui.record && this.singleRecording?.active) this.setCachedText(this.ui.record, 'Stop Single', 'record-button');
    if (this.ui.continuousRecord && !this.continuousRecording?.active) this.setCachedText(this.ui.continuousRecord, 'Multiple', 'continuous-record-button');
    if (this.ui.multipleRaceCount) this.ui.multipleRaceCount.disabled = Boolean(this.continuousRecording?.active);
    if (this.ui.autoCupRecord && !this.autoCupRecording?.active) this.setCachedText(this.ui.autoCupRecord, 'Cup Mode', 'auto-cup-record-button');
    const labels = { idle: 'Idle', ready: this.countdownActive ? 'Countdown' : 'Waiting for Gate', running: 'Racing', paused: 'Paused', finished: 'Finished' };
    this.setCachedText(this.ui.state, labels[this.state] || this.state, 'race-state');
    this.setCachedText(this.ui.elapsed, `${this.elapsed.toFixed(1)}s`, 'elapsed');
    this.uiThrottleCounters.debugPayloads += 1;
    const debug = {
      marbleCount: this.marbleData.length,
      trackLength: this.trackLength,
      trackPreset: this.trackPresetKey,
      customTrackLength: this.customTrackLength || null,
      trackLengthPresets: TRACK_PRESETS,
      recordingCategories: {
        single: { label: 'Single', buttonId: 'record-btn', active: Boolean(this.singleRecording?.active), phase: this.singleRecording?.phase || 'idle', gateDelaySeconds: this.singleRecording?.gateDelaySeconds ?? RECORDING_GATE_DELAY_SECONDS, nextActionAt: this.singleRecording?.nextActionAt || null },
        continuous: { label: 'Multiple', buttonId: 'continuous-record-btn', active: Boolean(this.continuousRecording?.active), phase: this.continuousRecording?.phase || 'idle', racesCompleted: this.continuousRecording?.racesCompleted || 0, totalRaces: this.continuousRecording?.active ? this.continuousRecording.totalRaces : this.getMultipleRecordingTotalRaces(), ceremonyHoldSeconds: this.continuousRecording?.nextRaceDelaySeconds ?? MULTIPLE_RECORDING_CEREMONY_HOLD_SECONDS, gateDelaySeconds: this.continuousRecording?.gateDelaySeconds ?? MULTIPLE_RECORDING_NEXT_GATE_SECONDS, initialGateDelaySeconds: this.continuousRecording?.initialGateDelaySeconds ?? RECORDING_GATE_DELAY_SECONDS, finalStopDelaySeconds: this.continuousRecording?.finalStopDelaySeconds ?? MULTIPLE_RECORDING_FINAL_STOP_SECONDS, nextActionAt: this.continuousRecording?.nextActionAt || null, regeneratesTrackBetweenRaces: true },
        cup: { label: 'Cup Mode', buttonId: 'auto-cup-record-btn', active: Boolean(this.autoCupRecording?.active), phase: this.autoCupRecording?.phase || 'idle', racesCompleted: this.autoCupRecording?.racesCompleted || 0 },
      },
      recordingCategory: this.recordingCategory || null,
      recordingCategoryLabel: this.recordingCategory ? this.getRecordingCategoryLabel(this.recordingCategory) : null,
      speedIndex: this.speedIndex,
      speedLabel: this.speedPreset.label,
      speedPreset: this.speedPreset,
      physicsMechanic: this.getPhysicsMechanicDebug(),
      speedMultiplier: SPEED_SCALE,
      requestedSpeedScale: SPEED_SCALE,
      widthPresetKey: this.widthPresetKey,
      widthPreset: this.widthPreset,
      obstacleIndex: this.obstacleIndex,
      obstaclePreset: this.obstaclePreset,
      obstacleMultiplier: this.obstaclePreset?.multiplier ?? 1,
      obstacleDistributionMode: this.obstacleDistributionMode,
      obstacleDistributionLabel: OBSTACLE_DISTRIBUTION_MODES[this.obstacleDistributionMode]?.label || OBSTACLE_DISTRIBUTION_MODES.random.label,
      obstacleDistributionSummary: this.obstacleDistributionSummary,
      obstaclePlacement: OBSTACLE_PLACEMENT,
      obstacleAnimationCulling: this.lastObstacleAnimationCullingDebug || this.getObstacleAnimationCullingDebug(),
      orbitRingSpeedBoost: ORBIT_RING_SPEED_BOOST,
      obstacleCategories: OBSTACLE_CATEGORIES,
      obstacleTypeMetadata: PINBALL_OBSTACLE_TYPE_METADATA,
      obstacleCatalog: PINBALL_OBSTACLE_CATALOG,
      enabledObstacleTypes: [...(this.enabledObstacleTypes || new Set(PINBALL_OBSTACLE_TYPES))],
      curveStyleKey: this.curveStyleKey,
      curveStyle: this.curveStyle,
      motionModel: this.slopeDrive?.model || 'no-sleep-tangent-forward-drive',
      trackSurface: 'continuous-ribbon-trimesh',
      marbleRotation: 'visual-rolling-smoothed',
      nameLanguage: 'English',
      marbleIdentitySystem: 'reusable-code-name-color-pattern-size',
      uiShowsMarbleIds: false,
      marbleIdentityCopyScope: 'winner-show-overlay-double-click-name-only',
      reusableMarbleRegistry: this.getReusableMarbleRegistry(),
      reusableRaceResults: this.getReusableRaceResults(),
      marbleCodeFormat: 'MB-##-RGB-PAT-SIZE',
      marbleStyleCatalog: {
        colors: MARBLE_COLOR_STYLES,
        patterns: MARBLE_PATTERN_STYLES,
        sizes: MARBLE_SIZE_STYLES,
      },
      topFiveLeaderboard: this.topFiveSnapshot || this.getRanking({ force: true }).slice(0, 5).map((data, index) => ({
        rank: index + 1,
        id: data.id,
        name: data.name,
        progress: data.progress || 0,
        distance: data.distance || 0,
        finished: Boolean(data.finished),
        defeated: Boolean(data.defeated),
      })),
      viewerCanvasOverlay: this.lastViewerOverlaySummary || {
        enabled: Boolean(CANVAS_VIEWER_OVERLAY.enabled),
        channelHandle: CANVAS_VIEWER_OVERLAY.channelHandle,
        ctaPrimary: CANVAS_VIEWER_OVERLAY.ctaPrimary,
      },
      webViewerOverlayCanvas: this.getWebViewerOverlayInfo?.() || null,
      videoCompositeCanvas: this.getVideoCompositeCanvasInfo?.() || null,
      broadcastStorylines: {
        eventCount: this.broadcastEvents.length,
        lastEvent: this.broadcastEvents[0] || null,
        replayHighlight: this.replayHighlight || null,
        replayPlayback: this.replayHighlight?.playback || null,
        replayHistory: {
          sampleIntervalSeconds: CUP_VIDEO_TIMING.replayHistorySampleSeconds,
          samples: this.raceHistoryBuffer?.length || 0,
          firstTime: this.raceHistoryBuffer?.[0]?.time ?? null,
          lastTime: this.raceHistoryBuffer?.at(-1)?.time ?? null,
          mode: this.replayHighlight?.playback?.mode || 'history-buffer-replay-ready',
        },
        replayHighlightSelection: this.selectReplayHighlightEvents().map((event) => ({ title: event.title, detail: event.detail, kind: event.kind, replayTitle: event.replayTitle, distance: event.distance, progress: event.progress, time: event.time, marbleId: event.marbleId, rivalId: event.rivalId })),
        previousTopFiveIds: this.previousTopFiveIds || [],
        lastOvertakeAt: Number.isFinite(this.lastOvertakeAt) ? this.lastOvertakeAt : null,
        lastNeckAndNeckAt: Number.isFinite(this.lastNeckAndNeckAt) ? this.lastNeckAndNeckAt : null,
      },
      centerAssist: false,
      forwardDrive: 'disabled: only world gravity, passive collision physics, and explicit obstacle impulses remain',
      nonObstacleForcesRemoved: true,
      allowedArtificialForces: ['pinball obstacle impulses only'],
      disabledArtificialForces: ['start impulse', 'slope drive assist', 'rail momentum assist', 'rail escape assist', 'finish direction correction', 'mid-track speed assist', 'final approach assist', 'unstuck impulse', 'speed-cap velocity scaling'],
      slopeDrive: this.slopeDrive,
      slopeDriveForceCount: this.slopeDriveForceCount,
      finishDirectionAssist: this.finishDirectionAssist,
      finishDirectionCorrectionCount: this.finishDirectionCorrectionCount,
      racerSleepDisabled: true,
      topSpeed: this.speedPreset.maxSpeed,
      finalStretchTopSpeedRatio: this.finalApproachAssist?.maxSpeedRatio || 1,
      effectiveCurrentTopSpeed: this.speedPreset.maxSpeed * (this.finalApproachAssist?.maxSpeedRatio || 1),
      dropTargetFinalBoost: DROP_TARGET_FINAL_BOOST,
      dropTargetBoostActiveCount: this.marbleData.filter((data) => data.dropTargetBoostActive).length,
      midTrackSpeedAssist: this.midTrackSpeedAssist,
      midTrackSpeedAssistCount: this.midTrackSpeedAssistCount,
      finalApproachAssist: this.finalApproachAssist,
      finishLineRule: FINISH_LINE_RULE,
      fallRespawnPolicy: FALL_RESPAWN_POLICY,
      guidePointBiasSlider: { value: this.slopeDrive?.guidePointBias ?? null, percent: Math.round((this.slopeDrive?.guidePointBias ?? 0) * 100) },
      finalApproachAssistCount: this.finalApproachAssistCount,
      minForwardSpeedAssist: this.minForwardSpeedAssist,
      minForwardSpeedAssistCount: this.minForwardSpeedAssistCount,
      stuckReset: STUCK_RESET,
      stuckResetDelay: this.stuckResetDelay,
      stuckResetPenalty: this.stuckResetPenalty,
      airborneGuidePolicy: this.airborneGuidePolicy,
      directionStabilityAssist: this.directionStabilityAssist,
      directionStabilityAssistCount: this.directionStabilityAssistCount,
      midTrackSpeedAssistPerMarble: this.marbleData.map((data) => ({
        id: data.id,
        name: data.name,
        count: data.midTrackSpeedAssistCount || 0,
        slopeDriveForceCount: data.slopeDriveForceCount || 0,
        slopeDriveAcceleration: data.slopeDriveAcceleration || 0,
        slopeDriveSlopeY: data.slopeDriveSlopeY || 0,
        finishDirectionCorrectionCount: data.finishDirectionCorrectionCount || 0,
        railEscapeAssistCount: data.railEscapeAssistCount || 0,
        directionStabilityAssistCount: data.directionStabilityAssistCount || 0,
        directionStabilityAssistProgress: data.directionStabilityAssistProgress ?? null,
        directionStabilityAssistOffsetRatio: data.directionStabilityAssistOffsetRatio ?? null,
        directionStabilityAssistRailRisk: data.directionStabilityAssistRailRisk ?? false,
        directionStabilityAssistNearRail: data.directionStabilityAssistNearRail ?? false,
        directionStabilityAssistMovingOutwardNearRail: data.directionStabilityAssistMovingOutwardNearRail ?? false,
        directionStabilityAssistRecentlyRailContact: data.directionStabilityAssistRecentlyRailContact ?? false,
        directionStabilityAssistCorrectionAheadDistance: data.directionStabilityAssistCorrectionAheadDistance ?? null,
        directionStabilityAssistSkippedReason: data.directionStabilityAssistSkippedReason ?? null,
        lastRailContactProgress: data.lastRailContactProgress ?? null,
        directionStabilityAssistCorrectionFrameDistance: data.directionStabilityAssistCorrectionFrameDistance ?? null,
        directionStabilityAssistDriveFrameDistance: data.directionStabilityAssistDriveFrameDistance ?? null,
        directionStabilityAssistForceOnly: data.directionStabilityAssistForceOnly ?? true,
        finalApproachAssistCount: data.finalApproachAssistCount || 0,
        finalApproachAssistForceCount: data.finalApproachAssistForceCount || 0,
        finalApproachAssistForceOnly: data.finalApproachAssistForceOnly ?? (this.finalApproachAssist?.impulseScale <= 0),
        finalApproachUsesDirectFinishVector: data.finalApproachUsesDirectFinishVector ?? false,
        finalApproachAssistRemaining: data.finalApproachAssistRemaining ?? null,
        minForwardSpeedAssistCount: data.minForwardSpeedAssistCount || 0,
        minForwardSpeedTarget: data.minForwardSpeedTarget || null,
        minForwardSpeedVelocityDelta: data.minForwardSpeedVelocityDelta || null,
        assistTargetRatio: data.midTrackSpeedAssistTargetRatio || null,
        assistSustainScale: data.midTrackSpeedAssistSustainScale || null,
        dropTargetBoostActive: Boolean(data.dropTargetBoostActive),
        dropTargetBoostSecondsRemaining: data.dropTargetBoostActive ? Number(Math.max(0, (data.dropTargetBoostUntil ?? this.elapsed) - this.elapsed).toFixed(2)) : 0,
        dropTargetBoostMultiplier: data.dropTargetBoostMultiplier || 1,
        dropTargetBoostNormalMaxSpeed: data.dropTargetBoostNormalMaxSpeed ?? null,
        dropTargetBoostEffectiveMaxSpeed: data.dropTargetBoostEffectiveMaxSpeed ?? null,
        dropTargetBoostCapOverrideActive: Boolean(data.dropTargetBoostCapOverrideActive),
        dropTargetBoostAuraVisible: Boolean(data.dropTargetBoostAuraVisible),
        dropTargetBoostLastStartedAt: data.dropTargetBoostLastStartedAt ?? null,
        dropTargetBoostLastExpiredAt: data.dropTargetBoostLastExpiredAt ?? null,
        orbitRingBoostActive: Boolean(data.orbitRingBoostActive),
        orbitRingBoostSecondsRemaining: data.orbitRingBoostActive ? Number(Math.max(0, (data.orbitRingBoostUntil ?? this.elapsed) - this.elapsed).toFixed(2)) : 0,
        orbitRingBoostMultiplier: data.orbitRingBoostMultiplier || 1,
        orbitRingBoostNormalMaxSpeed: data.orbitRingBoostNormalMaxSpeed ?? null,
        orbitRingBoostEffectiveMaxSpeed: data.orbitRingBoostEffectiveMaxSpeed ?? null,
        orbitRingBoostCapOverrideActive: Boolean(data.orbitRingBoostCapOverrideActive),
        orbitRingBoostLastStartedAt: data.orbitRingBoostLastStartedAt ?? null,
        orbitRingBoostLastExpiredAt: data.orbitRingBoostLastExpiredAt ?? null,
        midTrackSpeedAssistForceCount: data.midTrackSpeedAssistForceCount || 0,
        midTrackSpeedAssistForceOnly: data.midTrackSpeedAssistForceOnly ?? (this.midTrackSpeedAssist?.impulseScale <= 0),
        midTrackSpeedAssistProgress: data.midTrackSpeedAssistProgress ?? null,
        midTrackSpeedAssistFrameSource: data.midTrackSpeedAssistFrameSource ?? 'centerFrame-at-driveDistance-no-lookAhead',
        minForwardSpeedFrameSource: data.minForwardSpeedFrameSource ?? 'centerFrame-at-driveDistance-no-lookAhead',
        progress: data.progress || 0,
      })),
      railDiagnostics: this.marbleData.map((d) => ({
        id: d.id,
        name: d.name,
        railContactCount: d.railContactCount || 0,
        lastRailContactDistance: d.lastRailContactDistance ?? null,
        lastRailContactProgress: d.lastRailContactProgress ?? null,
        lastRailContactPieceIndex: d.lastRailContactPieceIndex ?? null,
        lastRailContactPieceType: d.lastRailContactPieceType || null,
        lastObstacleHitType: d.lastObstacleHitType || null,
        lastObstacleHitDistance: d.lastObstacleHitDistance ?? null,
        lastObstacleHitProgress: d.lastObstacleHitProgress ?? null,
        lastObstacleHitPieceIndex: d.lastObstacleHitPieceIndex ?? null,
        lastObstacleHitPieceType: d.lastObstacleHitPieceType || null,
        guideFrameSource: d.guideFrameSource || null,
        guideTargetPieceIndex: d.guideTargetPieceIndex ?? null,
        rawClosestProgressDistance: d.rawClosestProgressDistance ?? null,
        windowedClosestProgressDistance: d.windowedClosestProgressDistance ?? null,
        overlapSafeProjection: Boolean(d.overlapSafeProjection),
        overlapProjectionJump: d.overlapProjectionJump ?? 0,
        guidePointAheadDistance: d.guidePointAheadDistance ?? null,
      })),
      catchupAssistEnabled: this.catchupAssistEnabled,
      catchupMaxSpeed: this.catchupAssistEnabled ? this.speedPreset.maxSpeed * (1 + CATCHUP_ASSIST.maxEffectiveBonus) : this.speedPreset.maxSpeed,
      catchupAssist: CATCHUP_ASSIST,
      catchupAssistSamples: this.marbleData.slice(0, 8).map((d) => ({
        id: d.id,
        name: d.name,
        distance: Number((d.distance || 0).toFixed(2)),
        rankIndex: d.catchupRankIndex ?? null,
        gap: d.catchupGap == null ? null : Number(d.catchupGap.toFixed(2)),
        baseBonusRatio: d.catchupBaseBonusRatio == null ? null : Number(d.catchupBaseBonusRatio.toFixed(3)),
        lateBonusRatio: d.catchupLateBonusRatio == null ? null : Number(d.catchupLateBonusRatio.toFixed(3)),
        bonusRatio: d.catchupBonusRatio == null ? null : Number(d.catchupBonusRatio.toFixed(3)),
        catchupMaxSpeed: d.catchupMaxSpeed == null ? null : Number(d.catchupMaxSpeed.toFixed(2)),
        skippedReason: d.catchupAssistSkippedReason || null,
      })),
      decorationSummary: this.decorationSummary || { lampPosts: 0, lampGlobes: 0, decorativePointLights: 0, removed: true },
      performanceProfile: this.performanceProfile,
      uiThrottleProfiles: UI_THROTTLE_PROFILES,
      uiThrottleCounters: { ...this.uiThrottleCounters },
      performanceOptimizations: [
        'fps-balanced-renderer-pixel-ratio',
        'shadows-disabled-for-race-fps',
        'lower-rail-tube-segments',
        'lower-physical-rail-body-budget',
        'decorative-trackside-lamp-posts-removed',
        'reduced-trail-updates',
        'reduced-physics-substeps',
        'throttled-ui-debug-updates',
        'cached-ranking-sorts',
        'fragmented-leaderboard-render',
        'dom-text-write-cache',
        'leaderboard-signature-cache',
        'smooth1080p-render-ui-throttle-profile',
        'split-name-label-throttle-ranking-and-scale-targets',
        'visible-name-label-transform-updates-only',
      ],
      measuredFps: this.lastFps,
      motionModel: this.slopeDrive?.model,
      acceleration: this.speedPreset.accel,
      topSpeed: this.speedPreset.maxSpeed,
      forwardDrive: {
        enabled: Boolean(this.slopeDrive?.enabled),
        model: this.slopeDrive?.model,
        nonRegressingProgress: true,
        lookAhead: this.slopeDrive?.lookAhead,
        lookAheadReducedReason: this.slopeDrive?.lookAheadReducedReason,
        forecastBehindTolerance: this.slopeDrive?.forecastBehindTolerance,
        maxSpeedRatio: this.slopeDrive?.maxSpeedRatio,
        checkpointPullMitigation: 'short slope lookAhead; min/mid speed assists use centerFrame at driveDistance, not lookAhead frame',
        airborneGuideMitigation: 'airborne guide assists pause until landing and then recalculate an ahead guide between marble and finish',
        airborneGuidePolicy: this.airborneGuidePolicy,
        guidePointPolicy: this.guidePointPolicy,
        toyParkOverlapProjectionPolicy: this.physicsMechanicKey === 'toyPark' ? {
          mode: 'windowed-nearest-progress-to-prevent-stacked-road-guide-steal',
          behind: this.guidePointPolicy?.overlapProjectionWindowBehind,
          ahead: this.guidePointPolicy?.overlapProjectionWindowAhead,
          maxNearestProgressJump: this.guidePointPolicy?.maxNearestProgressJump,
          scopedToToyPark: true,
        } : null,
        guidePointBias: this.slopeDrive?.guidePointBias,
        guidePointBiasLabel: this.slopeDrive?.guidePointBiasLabel,
        guideTargetPolicy: 'same-piece-lookahead-then-piece-exit-then-next-piece-entrance-or-finish-centerline',
        centerFrameAssistPolicy: 'minimumForwardSpeedAssist and midTrackSpeedAssist use centerFrame-at-driveDistance-no-lookAhead',
        topSpeed: this.speedPreset.maxSpeed,
        minimumForwardSpeed: this.speedPreset.maxSpeed * (this.minForwardSpeedAssist?.minForwardSpeedRatio || 0),
        acceleration: this.speedPreset.accel * (this.slopeDrive?.assistForceRatio ?? 1),
        forceCount: this.forwardAccelerationForceCount,
        directionCorrections: this.forwardAccelerationDirectionCorrections,
        backwardDamping: this.slopeDrive?.backwardDamping,
        lateralDamping: this.slopeDrive?.lateralDamping,
        dampingDisabledReason: this.slopeDrive?.dampingDisabledReason,
        allBackwardAndLateralDampingDisabled: true,
        capHorizontalSpeed: Boolean(this.slopeDrive?.capHorizontalSpeed),
        frameSource: 'Math.max(closest.distance, data.distance, data.lastDriveMovementDistance) + lookAhead',
      },
      forwardDriveSamples: this.marbleData.slice(0, 6).map((d) => ({
        id: d.id,
        name: d.name,
        active: Boolean(d.forwardAccelerationActive),
        closestProgressDistance: d.closestProgressDistance || 0,
        driveDistance: d.driveDistance || 0,
        guideDistance: d.guideDistance || 0,
        guideFrameSource: d.guideFrameSource || null,
        guidePointAheadDistance: d.guidePointAheadDistance ?? null,
        guideBehindAdvanceCount: d.guideBehindAdvanceCount || 0,
        lastGuideBehindAdvanceAt: d.lastGuideBehindAdvanceAt ?? null,
        guideDistanceJump: (d.guideDistance ?? 0) - (d.driveDistance ?? 0),
        guideTargetPieceIndex: d.guideTargetPieceIndex ?? null,
        guideTargetPieceType: d.guideTargetPieceType || null,
        guideTargetBoundaryRole: d.guideTargetBoundaryRole || null,
        forwardAccelerationGuideBias: d.forwardAccelerationGuideBias ?? this.slopeDrive?.guidePointBias ?? null,
        forwardAccelerationDriveDirection: d.forwardAccelerationDriveDirection || null,
        guideWithinTrackBounds: Boolean(d.guideWithinTrackBounds),
        guideLateralOffset: d.guideLateralOffset ?? null,
        guideStalled: d.guideStalled ?? null,
        guideReached: d.guideReached ?? null,
        guideBlockingObstacle: d.guideBlockingObstacle || null,
        guideRecentlyTouchedTrack: d.guideRecentlyTouchedTrack ?? null,
        guideRecentTrackContactWhileClearlyAirborne: d.guideRecentTrackContactWhileClearlyAirborne ?? null,
        airborneGuideAssistPaused: Boolean(d.airborneGuideAssistPaused),
        guideAssistPausedReason: d.guideAssistPausedReason || null,
        airborneGuideClearance: d.airborneGuideClearance ?? null,
        needsGuideRecalculationAfterLanding: Boolean(d.needsGuideRecalculationAfterLanding),
        lastGuideRecalculatedAfterLandingAt: d.lastGuideRecalculatedAfterLandingAt ?? null,
        centerFrameDistance: d.centerFrameDistance || 0,
        driveFrameDistance: d.driveFrameDistance || 0,
        lookAheadDistanceDelta: d.lookAheadDistanceDelta || 0,
        driveLookAhead: d.driveLookAhead || 0,
        forwardSpeed: d.forwardSpeed || 0,
        rawForwardSpeed: d.rawForwardSpeed || 0,
        centerForwardSpeed: d.centerForwardSpeed || 0,
        centerRawForwardSpeed: d.centerRawForwardSpeed || 0,
        slopeFrameSource: d.slopeFrameSource || null,
        slopeDriveGuideDistance: d.slopeDriveGuideDistance ?? null,
        slopeFrameForecastAheadDistance: d.slopeFrameForecastAheadDistance ?? null,
        slopeFrameForecastBehindTolerance: d.slopeFrameForecastBehindTolerance ?? null,
        slopeTopSpeed: d.slopeTopSpeed || null,
        finalSpeedCapApplied: Boolean(d.finalSpeedCapApplied),
        finalSpeedCapLimit: d.finalSpeedCapLimit || null,
        driveFrameTangent: d.driveFrameTangent || null,
        centerFrameTangent: d.centerFrameTangent || null,
        minForwardSpeedFrameSource: d.minForwardSpeedFrameSource || null,
        midTrackSpeedAssistFrameSource: d.midTrackSpeedAssistFrameSource || null,
        finalApproachAssistFrameSource: d.finalApproachAssistFrameSource ?? null,
        finalApproachAssistForceCount: d.finalApproachAssistForceCount || 0,
        finalApproachAssistForceScale: d.finalApproachAssistForceScale ?? null,
        finalApproachUsesDirectFinishVector: d.finalApproachUsesDirectFinishVector ?? null,
        finalApproachAssistRemaining: d.finalApproachAssistRemaining ?? null,
        topSpeed: d.topSpeed || this.speedPreset.maxSpeed,
        minForwardSpeedTarget: d.minForwardSpeedTarget || null,
        minForwardSpeedSkippedReason: d.minForwardSpeedSkippedReason ?? null,
        midTrackSpeedAssistSkippedReason: d.midTrackSpeedAssistSkippedReason ?? null,
        finalApproachAssistSkippedReason: d.finalApproachAssistSkippedReason ?? null,
        slopeDriveSkippedReason: d.slopeDriveSkippedReason ?? null,
        minForwardSpeedAssistCount: d.minForwardSpeedAssistCount || 0,
        corrections: d.forwardAccelerationDirectionCorrections || 0,
      })),
      directionStabilityPolicy: {
        enabled: Boolean(this.directionStabilityAssist?.enabled),
        disabledReason: this.directionStabilityAssist?.disabledReason || null,
        railGuidePolicy: this.railGuidePolicy,
        progressWindow: [this.directionStabilityAssist?.startsAfterProgress, this.directionStabilityAssist?.endsBeforeProgress],
        forceOnly: true,
        railRiskOnly: false,
        correctionAheadRequired: false,
        railRiskOffsetRatio: this.directionStabilityAssist?.railRiskOffsetRatio,
        outwardRailRiskOffsetRatio: this.directionStabilityAssist?.outwardRailRiskOffsetRatio,
        recentRailContactSeconds: this.directionStabilityAssist?.recentRailContactSeconds,
        reason: 'disabled by request: no automatic return-to-center guide after rail hits; passive Cannon rail collision only',
        correction: 'disabled: no centerline inward force, no lateral damping, no tangent recovery, no random/no impulse rail guide',
      },
      trackSlope: this.trackSlope,
      startRamp: this.trackSlope?.startRamp || START_RAMP,
      startRampSlopeEnabled: Boolean(START_RAMP.enabled),
      startPrepTray: this.startCatcher ? {
        redesign: this.startCatcher.design,
        visualThemeKey: this.startCatcher.visualThemeKey,
        textureStyle: this.startCatcher.textureStyle,
        railTextureStyle: this.startCatcher.railTextureStyle,
        gateStyle: this.startCatcher.gateStyle,
        trackConnection: this.startCatcher.trackConnection,
        center: { x: this.startCatcher.center.x, y: this.startCatcher.center.y, z: this.startCatcher.center.z },
        backOffset: START_RAMP.prepTrayBackOffset,
        frontOffset: START_RAMP.prepTrayFrontOffset,
        dropPerMeter: START_RAMP.prepTrayDropPerMeter,
        backSurfaceY: this.getStartPrepSurfaceY(this.getTrackFrameAt(0), START_RAMP.prepTrayBackOffset),
        frontSurfaceY: this.getStartPrepSurfaceY(this.getTrackFrameAt(0), START_RAMP.prepTrayFrontOffset),
        totalDropToGate: (START_RAMP.prepTrayBackOffset - START_RAMP.prepTrayFrontOffset) * START_RAMP.prepTrayDropPerMeter,
        slopePitchDegrees: ((this.startCatcher.slopePitch || 0) * 180) / Math.PI,
        laneCount: this.startCatcher.laneCount,
        chuteWidth: this.startCatcher.width,
        chuteDepth: this.startCatcher.depth,
        marbleStartSurface: 'actual START_CHUTE tilted floor top plane',
        marbleStartUsesChuteLocalSurface: true,
        marbleStartLocalZRange: this.marbleData.length ? {
          min: Math.min(...this.marbleData.map((data) => data.startLocalZ ?? 0)),
          max: Math.max(...this.marbleData.map((data) => data.startLocalZ ?? 0)),
        } : null,
        marbleStartSamples: this.marbleData.slice(0, 6).map((data) => ({
          name: data.name,
          localZ: data.startLocalZ,
          localY: data.startLocalY,
          backDistance: data.startBackDistance,
          slotColumn: data.startSlotColumn,
          slotRow: data.startSlotRow,
          slotLaneCount: data.startSlotLaneCount,
          frozenUntilGateOpen: data.startFrozenUntilGateOpen,
          onChuteSurface: data.startOnChuteSurface,
        })),
        realTiltedPhysicsFloor: true,
        localZDirection: 'negative=behind start gate, positive=toward track d0/distance increasing',
        frontLocalZConnectsToTrack: this.startCatcher.frontLocalZ > 0,
        gateDistanceBehindTrackStart: START_GATE_DESIGN.gateBackDistance,
      } : null,
      startGateDesign: this.startGate ? {
        ...START_GATE_DESIGN,
        activeDesign: this.startGate.design,
        visualThemeKey: this.startGate.visualThemeKey,
        textureStyle: this.startGate.textureStyle,
        railTextureStyle: this.startGate.railTextureStyle,
        gateStyle: this.startGate.gateStyle,
        stallCount: this.startGate.stallCount,
        gateWidth: this.startGate.gateWidth,
        trackWidthAtGate: this.startGate.trackWidth,
        stallWidth: this.startGate.stallWidth,
        gateWidthRatioActual: this.startGate.widthRatio,
        reducedByWidth: this.startGate.reducedByWidth,
        physicsBlockers: this.startGate.bodies.length,
        launchImpulse: this.startGate.launchImpulse,
        openProgress: this.startGate.openProgress,
        opened: Boolean(this.startGate.opened),
        frozenUntilGateOpenCount: this.marbleData.filter((data) => data.startFrozenUntilGateOpen).length,
      } : {
        ...START_GATE_DESIGN,
        activeDesign: START_GATE_DESIGN.style,
        disabled: this.startCatcher?.gateEnabled === false,
        noGateRacingGridStart: Boolean(this.startCatcher?.noGateRacingGridStart),
        physicsBlockers: 0,
        opened: this.startCatcher?.gateEnabled === false,
        frozenUntilGateOpenCount: this.marbleData.filter((data) => data.startFrozenUntilGateOpen).length,
      },
      marbleLabelPolicy: {
        ...MARBLE_LABEL_POLICY,
        state: this.state,
        visibleLabelCount: this.marbleData.filter((data) => data.labelSprite?.visible).length,
        visibleLabelIds: this.marbleData.filter((data) => data.labelSprite?.visible).map((data) => data.id),
      },
      marbleVisualTheme: {
        active: this.visualTheme || MARBLE_VISUAL_THEMES[DEFAULT_MARBLE_VISUAL_THEME_KEY],
        world: this.getWorldVisualThemeStyle(),
        coveredObjects: ['marbles', 'track-surface', 'arena-ground', 'rails', 'start-chute', 'start-gate'],
        available: Object.values(MARBLE_VISUAL_THEMES).map(({ key, label, description }) => ({ key, label, description })),
        colorStyleCount: this.getVisualThemeStyles().colorStyles.length,
        patternStyleCount: this.getVisualThemeStyles().patternStyles.length,
        materialOverride: this.getVisualThemeStyles().materialOverride,
      },
      startSlotDiagnostics: this.marbleData.map((data) => ({
        id: data.id,
        name: data.name,
        visualThemeKey: data.visualThemeKey,
        visualThemeName: data.visualThemeName,
        colorName: data.colorName,
        colorHex: data.colorHex,
        paletteHex: data.paletteHex,
        materialKey: data.materialKey,
        materialName: data.materialName,
        patternKey: data.patternKey,
        patternName: data.patternName,
        labelVisible: Boolean(data.labelSprite?.visible),
        row: data.startSlotRow,
        column: data.startSlotColumn,
        laneCount: data.startSlotLaneCount,
        stagingMode: data.startSlotStagingMode,
        localZ: Number((data.startLocalZ ?? 0).toFixed(3)),
        stagingLayout: data.id === 0 ? this.startStagingLayout : undefined,
        frozenUntilGateOpen: data.startFrozenUntilGateOpen,
        bodyType: data.body?.type ?? null,
        mass: data.body?.mass ?? null,
        speed: data.body ? Math.hypot(data.body.velocity.x, data.body.velocity.y, data.body.velocity.z) : null,
        orbitRingBoost: {
          active: Boolean(data.orbitRingBoostActive),
          secondsRemaining: Number((data.orbitRingBoostSecondsRemaining || 0).toFixed(2)),
          multiplier: data.orbitRingBoostMultiplier || 1,
          normalMaxSpeed: data.orbitRingBoostNormalMaxSpeed ?? null,
          effectiveMaxSpeed: data.orbitRingBoostEffectiveMaxSpeed ?? null,
          auraVisible: Boolean(data.orbitRingBoostAuraVisible),
          auraOpacity: data.orbitRingBoostAura?.material?.opacity ?? null,
          capOverrideActive: Boolean(data.orbitRingBoostCapOverrideActive),
          lastStartedAt: data.orbitRingBoostLastStartedAt ?? null,
          lastExpiredAt: data.orbitRingBoostLastExpiredAt ?? null,
        },
      })),
      variableTrackWidth: true,
      trackWidthProfile: this.trackWidthProfile,
      trackPieceSystem: this.trackPieceSystem,
      toyParkTrackTiles: this.physicsMechanicKey === 'toyPark' ? (this.toyParkTrackTiles || null) : null,
      toyParkBoardSequence: this.physicsMechanicKey === 'toyPark' ? (this.toyParkBoardSequence || this.toyParkTrackTiles?.boardSequence || null) : null,
      toyParkBoardSequenceReadable: this.physicsMechanicKey === 'toyPark' ? (this.toyParkTrackTiles?.boardSequenceReadable || this.trackStats?.toyParkBoardSequenceReadable || []) : [],
      modularTrackPieces: this.trackPieces,
      modularTrackPieceCounts: {
        straight: this.trackPieces.filter((piece) => piece.type === 'straight').length,
        variableBend: this.trackPieces.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.variableBend?.key).length,
        rampUp: this.trackPieces.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampUp?.key).length,
        elevatedStraight: this.trackPieces.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.elevatedStraight?.key).length,
        rampDown: this.trackPieces.filter((piece) => piece.tileKey === TOY_PARK_TRACK_TILE_LIBRARY.rampDown?.key).length,
        uTurn180: 0,
        corner45: this.trackPieces.filter((piece) => Math.abs(piece.turnDegrees) === 45).length,
        corner90: this.trackPieces.filter((piece) => Math.abs(piece.turnDegrees) === 90).length,
      },
      hairpinTurnCount: this.hairpinTurnCount,
      hairpinTurns: this.hairpinTurns,
      rightAngleTurnCount: this.rightAngleTurnCount,
      rightAngleTurns: this.rightAngleTurns,
      rightAngleCornerSlope: this.trackSlope?.rightAngleCornerSlope || RIGHT_ANGLE_CORNER_SLOPE,
      visibleCornerStyle: '90-degree right-angle corners with boosted downhill pitch',
      branchCount: this.branchSegments.length,
      obstacleCount: this.obstacleMeshes.length,
      obstacleTypeCounts: this.obstacleTypeCounts,
      obstacleCategoryCounts: this.obstacleCategoryCounts,
      enabledObstacleTypes: [...(this.enabledObstacleTypes || new Set(PINBALL_OBSTACLE_TYPES))],
      pinballObstacleTypes: this.pinballObstacleTypes,
      pinballObstacleCategories: this.pinballObstacleCategories,
      pinballObstacleTypeMetadata: this.pinballObstacleTypeMetadata,
      pinballObstacleCatalog: this.pinballObstacleCatalog,
      pinballInteractions: this.pinballInteractions,
      activePinballObstacles: this.pinballObstacles.length,
      spectacleFeatures: ['broadcast-event-captions', 'impact-rings-and-sparks', 'marble-speed-trails', 'finish-slow-motion', 'finish-confetti-cannons', 'winner-showcase-awards', 'podium-ceremony', 'cup-mode-knockout', 'match-card-overlay', 'themed-sector-signage'],
      broadcastStageMarkers: this.trackStats.broadcastStageMarkers || 0,
      broadcastEvents: this.broadcastEvents,
      activeBroadcastCaption: this.activeCaption,
      spectacleEffectCount: this.spectacleEffects.length,
      spectacleEffectMeshCount: this.getSpectacleEffectMeshCount(),
      spectacleEffectBudget: this.effectBudget,
      spectacleEffectBudgetCounters: this.effectBudgetCounters,
      frameTimingDiagnostics: this.getFrameTimingDiagnostics?.() || null,
      marbleTrailCount: this.marbleData.filter((data) => Boolean(data.trail?.line)).length,
      confettiCount: this.confettiPieces.length,
      finishSlowMotion: {
        config: FINISH_SLOW_MOTION,
        active: Boolean(this.finishSlowMotion?.active),
        triggered: Boolean(this.finishSlowMotion?.triggered),
        timeScale: Number((this.finishSlowMotion?.timeScale ?? 1).toFixed(3)),
        triggerWinner: this.finishSlowMotion?.triggerWinner || null,
        triggerReason: this.finishSlowMotion?.triggerReason || null,
        preFinishDistance: this.finishSlowMotion?.preFinishDistance ?? null,
        triggeredAt: this.finishSlowMotion?.triggeredAt ?? null,
        wallAgeSeconds: this.finishSlowMotion?.startedAtMs ? Number(((performance.now() - this.finishSlowMotion.startedAtMs) / 1000).toFixed(2)) : null,
        endedAt: this.finishSlowMotion?.endedAt ?? null,
      },
      winnerShowcase: this.showcaseStats,
      podiumCeremony: this.podiumCeremony,
      cupMode: {
        active: Boolean(this.cupMode?.active),
        status: this.cupMode?.status || 'idle',
        size: this.cupMode?.size || null,
        stage: this.cupMode?.active ? this.getCupStage() : null,
        stageTitle: this.cupMode?.active ? this.getCupStageTitle() : null,
        displayName: this.cupMode?.active ? this.getCupDisplayName() : null,
        entrants: this.cupMode?.currentEntrants?.length || 0,
        qualifierCount: this.cupMode?.active ? this.getCupQualifierCount() : 0,
        champion: this.cupMode?.champion || null,
        resultCount: this.cupMode?.results?.length || 0,
      },
      obstacleForcePolicy: 'only pinball obstacle handlers may call applyImpulse/applyForce during racing',
      functionalPinballObstacles: ['popBumper impulse', 'slingshot kick', 'spinnerGate spin impulse', 'dropTarget knockdown'],
      removedObstacleDesigns: ['ramp', 'slanted/curved rail bumpers'],
      replacementObstacleDesigns: [],
      pinballMaterialStyle: 'pinball-table skin: clearcoat plastics, chrome bumper rings, neon rubber accents',
      branchesDisabled: true,
      curvedBranches: 0,
      branchSegments: this.branchSegments,
      trackStats: this.trackStats,
      guardRailVisualSmoothing: this.trackStats.visualRailSmoothing || null,
      guardRailJoinStyle: this.trackStats.guardRailJoinStyle || null,
      trackBodies: this.trackBodies.length,
      pathPointCount: this.pathPoints.length,
      minTrackY: this.minTrackY,
      groundY: this.groundY,
      hasStartCatcher: Boolean(this.startCatcher),
      hasStartGate: Boolean(this.startGate),
      startGateOpen: this.startGate ? Boolean(this.startGate.opened) : this.startCatcher?.gateEnabled === false,
      noGateRacingGridStart: Boolean(this.startCatcher?.noGateRacingGridStart),
      hasFinishCatcher: Boolean(this.finishCatcher),
      hasFinishSpinner: Boolean(this.finishSpinner),
      hasFinishRankingContainer: Boolean(this.finishRankingContainer),
      finishCollectorType: this.finishCatcher?.name || null,
      finishApproachAssistActive: Boolean(this.finalApproachAssist?.enabled),
      finishDetectionThreshold: this.finalApproachAssist?.finishThreshold ?? 1.5,
      finishPodiumStyle: this.finishRankingContainer?.podiumStyle || null,
      podiumSlots: this.finishRankingContainer?.podiumSlots || [],
      lowerFinisherSlots: this.finishRankingContainer?.lowerSlots || null,
      finishRankingSlots: this.finishRankingContainer ? (this.finishRankingContainer.podiumSlots?.length || 0) + (this.finishRankingContainer.lowerSlots?.count || 0) : 0,
      finishRankingContainerSize: this.finishRankingContainer ? {
        width: this.finishRankingContainer.width,
        depth: this.finishRankingContainer.depth,
        slotGap: this.finishRankingContainer.slotGap,
        lowerSlots: this.finishRankingContainer.lowerSlots || null,
      } : null,
      allFinishersPlaced: this.marbleData.length > 0 && this.finishers.length === this.marbleData.length && this.finishers.every((d) => d.defeated || d.placedInFinishContainer),
      finishedCount: this.finishers.length,
      defeatedCount: this.defeatedMarbles.length,
      activeRacerCount: this.marbleData.filter((d) => !d.finished && !d.defeated).length,
      finishLineVisualLength: 0.7,
      stuckReset: {
        enabled: false,
        replacedBy: 'stallElimination',
        total: this.stuckResetCount,
        penaltyMeters: this.stuckResetPenalty,
        delaySeconds: this.stuckResetDelay,
        marbles: this.marbleData.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          resets: d.stuckResets || 0,
          lastReason: d.lastResetReason || null,
          lastDriveMovementDistance: d.lastDriveMovementDistance || 0,
          lastDriveMovementAgo: this.elapsed - (d.lastDriveMovementTime ?? 0),
          defeated: Boolean(d.defeated),
          defeatReason: d.defeatReason || null,
          removedFromRace: Boolean(d.removedFromRace),
          timePenalty: d.timePenalty || 0,
          fallPenalties: d.fallPenaltyCount || 0,
        })),
      },
      stallElimination: {
        ...this.stallElimination,
        postFirstFinishCutoff: {
          ...this.postFirstFinishDnfCutoff,
          secondsSinceFirstFinish: this.firstFinishTime ? Number(Math.max(0, this.elapsed - this.firstFinishTime).toFixed(2)) : 0,
          remainingSeconds: this.firstFinishTime && !this.postFirstFinishDnfCutoff?.triggered
            ? Number(Math.max(0, (this.postFirstFinishDnfCutoff?.delaySeconds ?? 15) - (this.elapsed - this.firstFinishTime)).toFixed(2))
            : 0,
        },
        total: this.stallEliminationCount,
        activeRacerCount: this.marbleData.filter((d) => !d.finished && !d.defeated).length,
        defeatedCount: this.defeatedMarbles.length,
        defeatedMarbles: this.defeatedMarbles.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          progress: d.progress || 0,
          progressPercent: Math.round((d.progress || 0) * 100),
          defeatTime: d.defeatTime ?? null,
          dnfOrder: d.dnfOrder ?? null,
          postFirstFinishDnfRank: d.postFirstFinishDnfRank ?? null,
          reason: d.defeatReason || null,
          removedFromRace: Boolean(d.removedFromRace),
        })),
        marbles: this.marbleData.map((d) => ({
          id: d.id,
          name: d.name,
          defeated: Boolean(d.defeated),
          progress: d.progress || 0,
          progressPercent: Math.round((d.progress || 0) * 100),
          lastForwardProgressPercent: Math.round((d.lastForwardProgressPercent || 0) * 100),
          noForwardProgressForSeconds: Number(Math.max(0, this.elapsed - (d.lastDriveMovementTime ?? 0)).toFixed(2)),
          hasObservedForwardProgress: Boolean(d.hasObservedForwardProgress),
          removedFromRace: Boolean(d.removedFromRace),
        })),
      },
      fallPenalty: {
        enabled: false,
        secondsPerFall: 0,
        totalCount: this.fallPenaltyCount,
        totalSeconds: this.totalFallPenaltySeconds,
      },
      fallRespawn: {
        enabled: true,
        delaySeconds: this.fallRespawnDelay,
        timePenaltySeconds: 0,
        pendingCount: this.marbleData.filter((d) => Boolean(d.pendingFallRespawn)).length,
        mode: 'delayed-respawn-behind-last-safe-track-position',
      },
      physicsSteps: this.physicsSteps,
      state: this.state,
      backgroundMaterial: 'wood',
      broadcastAudioPack: this.localTtsBridge?.available
        ? 'web-audio-bgm + left-ui-commentary-status + mac-local-tts-bridge; BGM/SFX and local TTS are page-mixed into recording'
        : 'web-audio-bgm + left-ui-commentary-status + optional-browser-tts; BGM/SFX are page-mixed into recording, but browser speechSynthesis TTS is recordable only through Chrome tab audio with Share tab audio enabled',
      leftUICollapsed: this.leftUICollapsed,
      rightUICollapsed: this.rightUICollapsed,
      recordingUIPresentation: this.recordingUIPresentation ? {
        active: Boolean(this.recordingUIPresentation.active),
        category: this.recordingUIPresentation.category || null,
        restoreLeftCollapsed: this.recordingUIPresentation.restoreLeftCollapsed,
        preserveRightUI: this.recordingUIPresentation.preserveRightUI !== false,
        instantHideLeft: Boolean(this.recordingUIPresentation.instantHideLeft),
        leftToggleHidden: Boolean(this.ui.uiToggle?.classList.contains('hidden')),
        rightToggleHidden: Boolean(this.ui.rightUiToggle?.classList.contains('hidden')),
        cursorHidden: Boolean(document.body.classList.contains(RECORDING_CURSOR_SUPPRESSION.hidePageCursorClass)),
        cursorSuppression: RECORDING_CURSOR_SUPPRESSION,
        bodyClassActive: Boolean(document.body.classList.contains('recording-ui-presentation')),
        instantHideBodyClass: Boolean(document.body.classList.contains('recording-ui-instant-hide')),
      } : null,
      rightUIToggleLocation: 'bottom-left stacked above left UI toggle',
      controlsPanelDefaultCollapsed: true,
      controlsPanelCollapsed: this.ui.controlsPanel?.classList.contains('collapsed') || false,
      cameraPanelCollapsed: this.ui.cameraPanel?.classList.contains('collapsed') || false,
      debugConsoleOverlay: {
        enabled: Boolean(this.ui.debugConsole),
        location: 'left-overlay',
        fields: ['state', 'elapsed', 'leader', 'cameraMode', 'activeDefaultCameraShot', 'fps', 'physicsSteps', 'finishedCount', 'finishSlowMotion', 'confettiCount', 'startGateOpen'],
      },
      debugConsoleCopy: {
        enabled: Boolean(this.ui.debugConsoleCopy),
        label: 'one-click copy of the full live debug payload including marbles, rail diagnostics, guide samples, issue-window obstacles, and MR1 code',
        status: this.ui.debugCopyStatus?.textContent || 'Ready',
      },
      broadcastAudio: {
        bgmEnabled: this.bgmEnabled,
        bgmMode: this.bgmMode,
        bgmActive: Boolean(this.bgmTimer),
        bgmNodeCount: this.bgmNodes?.length || 0,
        audioUnlocked: this.audioUnlocked,
        audioContextState: this.audioContext?.state || null,
        commentaryEnabled: this.commentaryEnabled,
        commentaryVoiceEnabled: this.commentaryVoiceEnabled,
        activeCommentary: this.activeCommentary || null,
        lastCommentary: this.commentaryHistory?.[0] || null,
        commentaryHistoryCount: this.commentaryHistory?.length || 0,
        commentaryDisplay: 'left-ui-only',
        viewerOverlayHidden: this.ui.commentaryCaption?.classList.contains('hidden') !== false,
        ttsTestStatus: this.ui.ttsTestStatus?.textContent || null,
        ttsPitch: this.ttsPitch,
        ttsPitchSliderValue: this.ui.ttsPitchSlider?.value || null,
        ttsPitchLabel: this.ui.ttsPitchLabel?.textContent || null,
        ttsSupported: Boolean(window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined'),
        ttsSpeaking: this.commentaryVoiceSpeaking,
        ttsPreparing: this.commentaryVoicePreparing,
        ttsQueueLength: this.commentaryVoiceQueue?.length || 0,
        ttsCurrentLine: this.commentaryVoiceCurrentLine,
        ttsLastLine: this.lastCommentaryVoiceLine,
        ttsLastError: this.commentaryVoiceLastError,
        countdownVoiceLine: this.countdownVoiceLine,
        countdownVoiceWarmupReady: Boolean(this.countdownVoiceWarmupUrl),
        countdownVoiceWarmupUrl: this.countdownVoiceWarmupUrl,
        countdownVoicePlayStartedAt: this.countdownVoicePlayStartedAt,
        countdownLastAnnouncedSecond: this.countdownLastAnnouncedSecond,
        ttsRecordingPolicy: this.getTtsRecordingPolicy(),
      },
      debugPanelCollapsed: this.ui.debugPanel?.classList.contains('collapsed') || false,
      recordingState: this.mediaRecorder?.state || 'inactive',
      recordingSource: this.recordingSource || null,
      recordingSettings: this.recordingSettings || null,
      recordingAudioQuality: this.getRecordingAudioQualityDebug(),
      fpsHudHiddenForRecording: Boolean(this.ui?.fpsStat?.classList.contains('hidden')),
      lastRecordingRequest: this.lastRecordingRequest || null,
      autoCupRecording: this.autoCupRecording ? {
        active: Boolean(this.autoCupRecording.active),
        phase: this.autoCupRecording.phase,
        recordingMode: this.autoCupRecording.recordingMode || null,
        racesCompleted: this.autoCupRecording.racesCompleted || 0,
        currentStage: this.autoCupRecording.currentStage || null,
        gateDelaySeconds: this.autoCupRecording.gateDelaySeconds,
        postRaceHoldSeconds: this.autoCupRecording.postRaceHoldSeconds,
        nextRaceDelaySeconds: this.autoCupRecording.nextRaceDelaySeconds,
        replayHighlightHoldSeconds: getReplayHighlightHoldSeconds(CUP_VIDEO_TIMING),
        nextGateAfterRaceSeconds: this.autoCupRecording.nextGateAfterRaceSeconds,
        stopAfterFinalSeconds: this.autoCupRecording.stopAfterFinalSeconds,
        timingPlan: this.autoCupRecording.timingPlan || this.getCupVideoTimingEstimate(),
        nextActionInSeconds: this.autoCupRecording.nextActionAt ? Number(Math.max(0, (this.autoCupRecording.nextActionAt - performance.now()) / 1000).toFixed(2)) : null,
        lastError: this.autoCupRecording.lastError || null,
      } : null,
      screenRecordingSupported: Boolean(navigator.mediaDevices?.getDisplayMedia),
      recordingSupported: typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia || this.renderer?.domElement?.captureStream),
      leader: this.getAutoCameraRanking({ includeFinished: true })[0]?.name || this.getRanking({ force: false })[0]?.name,
      cameraMode: this.cameraMode,
      autoCameraOutOfBoundsPolicy: {
        ignoreAfterSeconds: BROADCAST_CAMERA.outOfBoundsIgnoreAfterSeconds,
        label: BROADCAST_CAMERA.outOfBoundsIgnoreLabel,
        ignoredCount: this.marbleData.filter((data) => this.isMarbleIgnoredByAutoCamera(data)).length,
        ignoredMarbles: this.marbleData
          .filter((data) => this.isMarbleIgnoredByAutoCamera(data))
          .map((data) => ({ id: data.id, name: data.name, outForSeconds: Number((this.elapsed - (data.pendingFallRespawn?.detectedAt ?? this.elapsed)).toFixed(2)) })),
      },
      enableAllCameraMouseOrbit: this.enableAllCameraMouseOrbit,
      railSpring: this.railSpring,
      noRollingSlowdown: NO_ROLLING_SLOWDOWN,
      railContactNoSlowdown: RAIL_REBOUND,
      railMomentumAssist: this.railMomentumAssist,
      railMomentumAssistCount: this.marbleData.reduce((sum, d) => sum + (d.railMomentumAssistCount || 0), 0),
      railEscapeAssist: this.railEscapeAssist,
      railEscapeAssistCount: this.railEscapeAssistCount,
      railEscapeAssistPerMarble: this.marbleData.map((d) => ({ id: d.id, name: d.name, count: d.railEscapeAssistCount || 0, progress: d.progress || 0 })),
      trackMaterials: this.trackMaterials,
      seedInputSanitization: {
        enabled: Boolean(this.seedInputWasTrackDebugCode || this.importedTrackDebugFromSeed),
        seedInputWasTrackDebugCode: Boolean(this.seedInputWasTrackDebugCode),
        importedTrackDebugActualLength: this.importedTrackDebugFromSeed?.actualTrackLength || null,
      },
      trackDebugCode: this.currentTrackDebugCode || this.getTrackDebugCode(),
      trackDebugPayload: this.currentTrackDebugPayload || this.getTrackDebugPayload(),
      trackDebugCopyUi: {
        enabled: Boolean(this.ui.trackCodeOutput && this.ui.copyTrackCode),
        codePrefix: 'MR1:',
        includesReproductionSettings: ['seed', 'trackPresetKey', 'customTrackLength', 'widthPresetKey', 'speedIndex', 'obstacleIndex', 'curveStyleKey', 'trackPieces', 'toyParkBoardSequence', 'driveAssist'],
      },
      trackDebugImportUi: {
        enabled: Boolean(this.ui.trackCodeImport && this.ui.importTrackCode),
        target: 'dedicated MR1 paste textarea regenerates the same track without using chat-sized seed input',
        lastImportStatus: this.lastTrackDebugImportStatus || this.ui.trackCodeImportStatus?.textContent || 'Ready',
      },
      speedAssistPolicy: {
        slopeDrive: this.slopeDrive,
        minimumForwardSpeedAssist: this.minForwardSpeedAssist,
        midTrackSpeedAssist: this.midTrackSpeedAssist,
        finalApproachAssist: this.finalApproachAssist,
        forceOnlySustainAssists: this.midTrackSpeedAssist?.impulseScale === 0 && this.finalApproachAssist?.impulseScale === 0,
        finalApproachDirectFinishVector: Boolean(this.finalApproachAssist?.useDirectFinishVector),
        finishDetectionThreshold: this.finalApproachAssist?.finishThreshold ?? 1.5,
        lateTrackCoverageEndProgress: Math.min(this.minForwardSpeedAssist?.endsBeforeProgress ?? 0, this.midTrackSpeedAssist?.endsBeforeProgress ?? 0),
        regressionTarget: '75% no-obstacle slowdown/stall and final-sector back-and-forth oscillation',
      },
      cupVideoTiming: this.getCupVideoTimingEstimate(),
      cupVideoStageTargetSeconds: this.cupMode?.active ? CUP_VIDEO_TIMING.stageTargetSeconds?.[this.getCupStage()] ?? null : null,
      cupVideoStageTargetTrackLength: this.cupMode?.active ? CUP_VIDEO_TIMING.stageTrackLengths?.[this.getCupStage()] ?? null : null,
      defaultCameraMode: BROADCAST_CAMERA.defaultMode,
      defaultCameraPreference: 'default auto every race/stage: finish-line shot owns the camera whenever finish slow-motion is active, including after the race flips to finished; otherwise lead-pack through countdown and 0-80% race progress; cinematic leader after 80%; after first finish, briefly hold finish then follow remaining racers; podium/orbit when fully finished',
      defaultCameraPhaseSwitchProgress: BROADCAST_CAMERA.cinematicLeaderFromProgress,
      finishSlowMotionCameraHoldSeconds: BROADCAST_CAMERA.finishSlowMotionCameraHoldSeconds,
      finishSlowMotionCameraLabel: BROADCAST_CAMERA.finishSlowMotionCameraLabel,
      activeDefaultCameraShot: this.getDefaultCameraMode(),
      defaultCameraSequence: BROADCAST_CAMERA.sequence,
      defaultCameraTrackingDirection: 'xy/xz direction sampled from next tracking point back toward previous tracking point',
      defaultCameraOffsets: { leader: BROADCAST_CAMERA.leader, leadPack: BROADCAST_CAMERA.leadPack, toyParkBroadcast: BROADCAST_CAMERA.toyParkBroadcast },
      cameraLineOfSight: {
        config: BROADCAST_CAMERA.lineOfSight,
        state: this.cameraLineOfSightState || null,
        occluderCount: this.getCameraOccluderMeshes?.().length || 0,
      },
      cinematicLeaderCamera: this.cinematicLeaderCameraState || null,
      leadPackCamera: this.leadPackCameraState || null,
      toyParkBroadcastCamera: this.toyParkBroadcastCameraState || null,
      toyParkBroadcastMoment: this.toyParkBroadcastMoment || null,
      videoCompositeCameraCrop: this.videoCompositeCameraCropState || null,
      videoCompositeCanvas: this.getVideoCompositeCanvasInfo(),
      canvasStartHook: this.startHookLastSummary || this.getStartHookState() || { active: false },
      postFirstFinishCamera: {
        config: BROADCAST_CAMERA.postFirstFinish,
        firstFinishTime: this.firstFinishTime || 0,
        defaultCameraPhaseUntil: this.defaultCameraPhaseUntil || 0,
        snapState: this.postFirstFinishCameraSnapState || null,
      },
      autoCameraDirector: BROADCAST_CAMERA.angleStyle,
      autoCameraOutOfBoundsIgnoreAfterSeconds: BROADCAST_CAMERA.outOfBoundsIgnoreAfterSeconds,
      autoCameraOutOfBoundsIgnoreLabel: BROADCAST_CAMERA.outOfBoundsIgnoreLabel,
      raceCompleteCameraMove: this.podiumCeremony?.isCupChampionCeremony ? BROADCAST_CAMERA.podium360.championLabel : BROADCAST_CAMERA.podium360.label,
      podium360Camera: BROADCAST_CAMERA.podium360,
      finalCeremonyCamera: {
        active: Boolean(this.podiumCeremony?.active && this.podiumCeremony?.isCupChampionCeremony),
        label: BROADCAST_CAMERA.podium360.championLabel,
        angularSpeed: BROADCAST_CAMERA.podium360.championAngularSpeed,
      },
      leadPackCloseCamera: true,
      leadBattleCloseCamera: BROADCAST_CAMERA.leadBattle,
      leadBattleState: this.leadBattleState,
      marbleNameLabels: {
        enabled: true,
        count: this.marbleData.filter((data) => Boolean(data.labelSprite)).length,
        style: 'small semi-transparent white names with no frame or background',
        label: 'name sprite floats above every marble and follows mesh/body position',
      },
      birdEyeCameraAngle: BROADCAST_CAMERA.birdEyeCameraAngle,
      defaultCameraPitchUpDegrees: BROADCAST_CAMERA.defaultCameraPitchUpDegrees,
      defaultCameraPitchModes: BROADCAST_CAMERA.defaultPitchModes,
      initialCameraVerticalAxisRotationDegrees: BROADCAST_CAMERA.initialVerticalAxisRotationDegrees,
      initialCameraRotationApplied: this.initialCameraRotationApplied,
      cameraAngleStyle: 'mostly high-angle downward broadcast follow; close low lead-battle shot disabled by default',
      leadPackSize: this.getLeadPackTarget()?.size ?? 0,
    };
    window.__MARBLE_RACE_DEBUG__ = debug;
    this.updateDebugConsole(debug);
  }

  updateDebugConsole(debug = window.__MARBLE_RACE_DEBUG__) {
    if (!this.ui.debugConsole || !debug) return;
    const compact = {
      state: debug.state,
      elapsed: this.elapsed.toFixed(1),
      leader: debug.leader || null,
      cameraMode: debug.cameraMode,
      broadcastAudio: debug.broadcastAudio,
      activeDefaultCameraShot: debug.activeDefaultCameraShot,
      videoCompositeCameraCrop: debug.videoCompositeCameraCrop,
      fps: debug.measuredFps,
      physicsSteps: debug.physicsSteps,
      finishedCount: debug.finishedCount,
      defeatedCount: debug.defeatedCount,
      activeRacerCount: debug.activeRacerCount,
      stallElimination: debug.stallElimination,
      finishSlowMotion: debug.finishSlowMotion,
      confettiCount: debug.confettiCount,
      podiumCeremony: debug.podiumCeremony,
      cupMode: debug.cupMode,
      cupVideoTiming: debug.cupVideoTiming ? `${debug.cupVideoTiming.estimatedMinutes} min target` : null,
      replayHighlight: debug.broadcastStorylines?.replayHighlight,
      replayHighlightSelection: debug.broadcastStorylines?.replayHighlightSelection,
      autoCupRecording: debug.autoCupRecording,
      trackLength: debug.trackLength,
      marbleCount: debug.marbleCount,
      trackStats: debug.trackStats,
      trackPieceCount: debug.modularTrackPieces?.length || 0,
      obstacleCount: debug.obstacleCount,
      speedLabel: debug.speedLabel,
      widthPresetKey: debug.widthPresetKey,
      obstaclePreset: debug.obstaclePreset?.label || debug.obstaclePreset,
      obstacleDistribution: debug.obstacleDistributionLabel || debug.obstacleDistributionMode,
      curveStyleKey: debug.curveStyleKey,
      trackDebugCodeLength: debug.trackDebugCode?.length || 0,
    };
    if (this.setCachedText(this.ui.debugConsole, JSON.stringify(compact, null, 2), 'debug-console')) {
      this.uiThrottleCounters.debugConsoleWrites += 1;
    }
    if (this.ui.debugCopyStatus && this.ui.debugCopyStatus.textContent !== 'Copied') {
      this.ui.debugCopyStatus.textContent = 'Ready';
    }
  }

  buildIssueDiagnostics(payload = window.__MARBLE_RACE_DEBUG__) {
    const debug = payload || {};
    const railDiagnostics = debug.railDiagnostics || [];
    const forwardDriveSamples = debug.forwardDriveSamples || [];
    const resetMarbles = debug.stuckReset?.marbles || [];
    const issueStart = 0.68;
    const issueEnd = 0.82;
    const issueWindowObstacles = debug.trackDebugPayload?.obstacles?.filter((obstacle) => obstacle.progress >= issueStart && obstacle.progress <= issueEnd) || [];
    return railDiagnostics.map((rail) => {
      const drive = forwardDriveSamples.find((sample) => sample.id === rail.id) || null;
      const reset = resetMarbles.find((sample) => sample.id === rail.id) || null;
      const progress = rail.lastRailContactProgress ?? ((drive?.closestProgressDistance && debug.trackLength) ? drive.closestProgressDistance / debug.trackLength : 0);
      const railObstacleGap = Math.abs((rail.lastRailContactDistance ?? 0) - (rail.lastObstacleHitDistance ?? Number.POSITIVE_INFINITY));
      const issueWindowHit = issueWindowObstacles.some((obstacle) => Math.abs((obstacle.distance ?? 0) - (rail.lastObstacleHitDistance ?? -9999)) <= 3);
      const guideTargetDeltaPieces = drive?.guideTargetPieceIndex != null && rail.lastRailContactPieceIndex != null
        ? drive.guideTargetPieceIndex - rail.lastRailContactPieceIndex
        : null;
      const hasBackwardRawSpeed = (drive?.rawForwardSpeed ?? 0) < -0.05 || (drive?.centerRawForwardSpeed ?? 0) < -0.05;
      const isGuidePossiblyBehind = (drive?.guidePointAheadDistance ?? 0) < -0.05 || /behind/i.test(drive?.guideFrameSource || '');
      const suspectedCause = (() => {
        if (hasBackwardRawSpeed) return 'backward-raw-speed-after-obstacle-or-rail-contact';
        if (isGuidePossiblyBehind) return 'guide-target-behind-marble-or-regressing';
        if (issueWindowHit && Number.isFinite(railObstacleGap) && railObstacleGap <= 8) return 'nearby-obstacle-impulse-before-rail-contact';
        if ((rail.railContactCount || 0) > 0 && !rail.lastObstacleHitType) return 'passive-rail-geometry-or-material-contact';
        if (reset?.lastReason) return `stuck-reset-${reset.lastReason}`;
        return 'insufficient-live-evidence';
      })();
      const diagnostic = {
        id: rail.id,
        name: rail.name,
        progress,
        railContactCount: rail.railContactCount || 0,
        lastRailContactDistance: rail.lastRailContactDistance ?? null,
        lastRailContactPieceIndex: rail.lastRailContactPieceIndex ?? null,
        lastRailContactPieceType: rail.lastRailContactPieceType || null,
        lastObstacleHitType: rail.lastObstacleHitType || null,
        lastObstacleHitDistance: rail.lastObstacleHitDistance ?? null,
        lastObstacleHitPieceIndex: rail.lastObstacleHitPieceIndex ?? null,
        lastObstacleHitPieceType: rail.lastObstacleHitPieceType || null,
        lastObstacleToRailGapMeters: Number(railObstacleGap.toFixed(2)),
        railVsObstacleDistanceGap: Number(railObstacleGap.toFixed(2)),
        issueWindowHit,
        rawForwardSpeed: drive?.rawForwardSpeed ?? null,
        centerRawForwardSpeed: drive?.centerRawForwardSpeed ?? null,
        hasBackwardRawSpeed,
        guideFrameSource: drive?.guideFrameSource || rail.guideFrameSource || null,
        guideDistance: drive?.guideDistance ?? null,
        guideTargetPieceIndex: drive?.guideTargetPieceIndex ?? rail.guideTargetPieceIndex ?? null,
        guideTargetPieceType: drive?.guideTargetPieceType || null,
        guideTargetBoundaryRole: drive?.guideTargetBoundaryRole || null,
        guideTargetDeltaPieces,
        guidePointAheadDistance: drive?.guidePointAheadDistance ?? rail.guidePointAheadDistance ?? null,
        isGuidePossiblyBehind,
        resetReason: reset?.lastReason || null,
        lastDriveMovementAgo: reset?.lastDriveMovementAgo ?? null,
        suspectedCause,
      };
      return diagnostic;
    });
  }

  buildDebugConsoleCopyPayload(debug = window.__MARBLE_RACE_DEBUG__) {
    const payload = debug || {};
    const issueStart = 0.68;
    const issueEnd = 0.82;
    const issueStartDistance = (payload.trackLength || 0) * issueStart;
    const issueEndDistance = (payload.trackLength || 0) * issueEnd;
    return {
      snapshotAt: new Date().toISOString(),
      compact: {
        state: payload.state,
        elapsed: this.elapsed.toFixed(1),
        leader: payload.leader || null,
        cameraMode: payload.cameraMode,
        activeDefaultCameraShot: payload.activeDefaultCameraShot,
        fps: payload.measuredFps,
        physicsSteps: payload.physicsSteps,
        finishedCount: payload.finishedCount,
        finishSlowMotion: payload.finishSlowMotion,
        confettiCount: payload.confettiCount,
        startGateOpen: payload.startGateOpen,
        trackLength: payload.trackLength,
        marbleCount: payload.marbleCount,
      },
      marbles: payload.marbleProgressSamples,
      railDiagnostics: payload.railDiagnostics,
      forwardDriveSamples: payload.forwardDriveSamples,
      stuckReset: payload.stuckReset,
      issueDiagnostics: this.buildIssueDiagnostics(payload),
      pinballInteractions: payload.pinballInteractions,
      obstaclesAroundIssue: payload.trackDebugPayload?.obstacles?.filter((obstacle) => obstacle.progress >= issueStart && obstacle.progress <= issueEnd),
      trackPiecesAroundIssue: payload.trackDebugPayload?.trackPieces?.map((piece, index) => ({ index, ...piece })).filter((piece) => piece.endDistance >= issueStartDistance && piece.startDistance <= issueEndDistance),
      trackDebugCode: payload.trackDebugCode,
    };
  }

  async copyDebugConsole() {
    if (!this.ui.debugConsole) return;
    const debugPayload = this.buildDebugConsoleCopyPayload();
    const debugText = JSON.stringify(debugPayload, null, 2);
    if (!debugText.trim()) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(debugText);
      else {
        const textarea = document.createElement('textarea');
        try {
          textarea.value = debugText;
          textarea.setAttribute('readonly', '');
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
        } finally {
          textarea.remove();
        }
      }
      if (this.ui.debugCopyStatus) this.ui.debugCopyStatus.textContent = 'Copied full debug';
    } catch (error) {
      console.warn('Copy debug console failed', error);
      if (this.ui.debugCopyStatus) this.ui.debugCopyStatus.textContent = 'Copy failed';
      return;
    }
    clearTimeout(this.debugCopyStatusTimer);
    this.debugCopyStatusTimer = setTimeout(() => {
      if (this.ui.debugCopyStatus) this.ui.debugCopyStatus.textContent = 'Ready';
    }, 1200);
  }

  isMarbleIgnoredByAutoCamera(data) {
    if (!data || data.finished) return false;
    if (!data.pendingFallRespawn) return false;
    const ignoreAfter = BROADCAST_CAMERA.outOfBoundsIgnoreAfterSeconds ?? 1;
    return this.elapsed - (data.pendingFallRespawn.detectedAt ?? this.elapsed) >= ignoreAfter;
  }

  getAutoCameraRanking({ includeFinished = false } = {}) {
    const candidates = this.marbleData.filter((data) => (includeFinished || !data.finished) && !this.isMarbleIgnoredByAutoCamera(data));
    const pool = candidates.length ? candidates : this.marbleData.filter((data) => includeFinished || !data.finished);
    return [...pool].sort((a, b) => b.distance - a.distance);
  }

  getLeadPackTarget() {
    const active = this.getAutoCameraRanking({ includeFinished: false });
    const ranking = active.length ? active : this.getAutoCameraRanking({ includeFinished: true });
    const pack = ranking.slice(0, Math.min(5, Math.max(1, Math.ceil(ranking.length * 0.35))));
    if (!pack.length) return null;

    const leaderDistance = pack[0].distance || 0;
    const closePack = pack.filter((data) => leaderDistance - (data.distance || 0) <= 14).slice(0, 5);
    const group = closePack.length ? closePack : pack.slice(0, 3);
    const center = new THREE.Vector3();
    let avgDistance = 0;
    group.forEach((data) => {
      center.add(data.mesh.position);
      avgDistance += data.distance || 0;
    });
    center.multiplyScalar(1 / group.length);
    avgDistance /= group.length;
    center.y += 0.8;

    return { center, avgDistance, leaderDistance, size: group.length, leader: pack[0] };
  }

  getLeadBattleTarget() {
    const cfg = BROADCAST_CAMERA.leadBattle;
    if (!cfg?.enabled || this.state !== 'running' || this.finishers.length > 0) return null;
    const ranking = this.getAutoCameraRanking({ includeFinished: false });
    if (ranking.length < 2) return null;
    const [leader, chaser] = ranking;
    const gap = (leader.distance || 0) - (chaser.distance || 0);
    const leaderProgress = this.trackLength ? (leader.distance || 0) / this.trackLength : 0;
    if (gap < 0 || gap > cfg.maxGap || leaderProgress < cfg.minProgress) return null;
    const center = leader.mesh.position.clone().add(chaser.mesh.position).multiplyScalar(0.5);
    center.y += cfg.targetLift;
    const avgDistance = ((leader.distance || 0) + (chaser.distance || 0)) / 2;
    return { center, avgDistance, leaderDistance: leader.distance || 0, size: 2, leader, chaser, gap };
  }

  getMouseOrbitAdjustedCamera(autoDesired, target) {
    if (!this.enableAllCameraMouseOrbit || this.cameraMode === 'orbit') return autoDesired;
    const userOffset = this.camera.position.clone().sub(this.controls.target);
    const autoOffset = autoDesired.clone().sub(target);
    if (userOffset.lengthSq() < 0.001) return autoDesired;
    const distance = clamp(userOffset.length(), this.controls.minDistance, this.controls.maxDistance);
    const orbitDirection = userOffset.normalize();
    const autoDistance = clamp(autoOffset.length() || this.cameraAutoDistance, this.controls.minDistance, this.controls.maxDistance);
    const blendedDistance = lerp(autoDistance, distance, 0.88);
    return target.clone().add(orbitDirection.multiplyScalar(blendedDistance));
  }

  applyDefaultCameraPitch(desired, target, activeCameraMode) {
    const pitchDegrees = BROADCAST_CAMERA.defaultCameraPitchUpDegrees || 0;
    if (!pitchDegrees || this.cameraMode !== 'default' || !BROADCAST_CAMERA.defaultPitchModes.includes(activeCameraMode)) return desired;
    const offset = desired.clone().sub(target);
    const horizontal = new THREE.Vector3(offset.x, 0, offset.z);
    if (horizontal.lengthSq() < 0.0001 || offset.lengthSq() < 0.0001) return desired;
    const rightAxis = new THREE.Vector3().crossVectors(horizontal.clone().normalize(), new THREE.Vector3(0, 1, 0)).normalize();
    const pitchedOffset = offset.applyAxisAngle(rightAxis, THREE.MathUtils.degToRad(-pitchDegrees));
    return target.clone().add(pitchedOffset);
  }

  getCameraTrackFrameAt(distance, lookAhead = 4.5) {
    const current = this.getTrackPointAt(distance);
    const nextDistance = clamp(distance + Math.max(0.35, lookAhead), 0, this.trackLength);
    const previousDistance = clamp(distance - Math.max(0.35, lookAhead * 0.55), 0, this.trackLength);
    let next = this.getTrackPointAt(nextDistance);
    let previous = this.getTrackPointAt(previousDistance);
    if (nextDistance === previousDistance || new THREE.Vector3(next.x - previous.x, 0, next.z - previous.z).lengthSq() < 0.0001) {
      next = this.getTrackPointAt(clamp(distance + 1.2, 0, this.trackLength));
      previous = this.getTrackPointAt(clamp(distance - 1.2, 0, this.trackLength));
    }
    const nextToPrevious = new THREE.Vector3(previous.x - next.x, previous.y - next.y, previous.z - next.z).normalize();
    const horizontalBack = new THREE.Vector3(nextToPrevious.x, 0, nextToPrevious.z);
    if (horizontalBack.lengthSq() < 0.0001) horizontalBack.set(0, 0, 1);
    horizontalBack.normalize();
    const forward = horizontalBack.clone().multiplyScalar(-1);
    const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    const trackForward = new THREE.Vector3(next.x - previous.x, next.y - previous.y, next.z - previous.z).normalize();
    let localUp = new THREE.Vector3().crossVectors(right, trackForward).normalize();
    if (localUp.lengthSq() < 0.0001 || localUp.y < 0.05) {
      localUp = new THREE.Vector3(0, 1, 0);
    }
    return {
      ...this.getTrackFrameAt(distance),
      p: current,
      tangent: nextToPrevious,
      horizontalTangent: horizontalBack,
      right,
      up: localUp,
      trackForward,
      cameraDirection: 'next-tracking-point-to-previous-tracking-point',
      heightReference: 'track-local-up-from-slope-normal',
      nextDistance,
      previousDistance,
    };
  }

  applyInitialCameraVerticalAxisRotation() {
    if (!this.camera || !this.controls || this.initialCameraRotationApplied) return;
    const degrees = BROADCAST_CAMERA.initialVerticalAxisRotationDegrees || 0;
    const basePosition = new THREE.Vector3(0, 30, 48);
    const baseTarget = new THREE.Vector3(0, 0, -35);
    const radians = THREE.MathUtils.degToRad(degrees);
    const offset = basePosition.clone().sub(baseTarget).applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
    this.controls.target.copy(baseTarget);
    this.cameraTargetSmoothed.copy(baseTarget);
    this.camera.position.copy(baseTarget).add(offset);
    this.camera.lookAt(baseTarget);
    this.controls.update();
    this.initialCameraRotationApplied = true;
  }

  getUpcomingObstacleForCamera(distance, maxAhead = 35) {
    if (!Array.isArray(this.pinballObstacles) || !this.pinballObstacles.length || !this.trackLength) return null;
    let best = null;
    for (const obstacle of this.pinballObstacles) {
      if (!obstacle?.center) continue;
      const progress = this.findClosestProgress(obstacle.center);
      const obstacleDistance = progress.distance || 0;
      const ahead = obstacleDistance - distance;
      if (ahead < 0 || ahead > maxAhead) continue;
      if (!best || ahead < best.ahead) best = { obstacle, distance: obstacleDistance, ahead };
    }
    return best;
  }

  getCameraOccluderMeshes() {
    const meshes = [];
    this.trackGroup?.traverse?.((object) => {
      if (object?.isMesh && object.userData?.cameraOccluder && object.geometry?.boundingSphere == null) {
        object.geometry.computeBoundingSphere?.();
      }
      if (object?.isMesh && object.userData?.cameraOccluder) meshes.push(object);
    });
    return meshes;
  }

  getCameraOccluderDistance(object) {
    const data = object?.userData || {};
    if (Number.isFinite(data.cameraOccluderDistance)) return data.cameraOccluderDistance;
    if (Number.isFinite(data.cameraOccluderDistanceStart) && Number.isFinite(data.cameraOccluderDistanceEnd)) {
      return (data.cameraOccluderDistanceStart + data.cameraOccluderDistanceEnd) / 2;
    }
    const sphere = object?.geometry?.boundingSphere;
    if (!sphere) return null;
    const center = sphere.center.clone();
    object.localToWorld(center);
    return this.findClosestProgress(center)?.distance ?? null;
  }

  getCameraLineOfSightHits(desired, target, occluders, cfg) {
    const offset = target.clone().sub(desired);
    const distance = offset.length();
    const direction = offset.clone().normalize();
    const raycaster = this.cameraLineOfSightRaycaster || new THREE.Raycaster();
    this.cameraLineOfSightRaycaster = raycaster;
    raycaster.set(desired, direction);
    raycaster.near = 0.4;
    raycaster.far = Math.max(0.4, distance - (cfg.minClearance || 4.8));
    let hits = raycaster.intersectObjects(occluders, true).filter((hit) => hit.distance < raycaster.far);
    if (!hits.length) {
      const segment = target.clone().sub(desired);
      const segmentLengthSq = Math.max(0.0001, segment.lengthSq());
      hits = occluders
        .map((object) => {
          const sphere = object.geometry?.boundingSphere;
          if (!sphere) return null;
          const center = sphere.center.clone();
          object.localToWorld(center);
          const t = clamp(center.clone().sub(desired).dot(segment) / segmentLengthSq, 0, 1);
          const closest = desired.clone().lerp(target, t);
          const clearance = center.distanceTo(closest) - sphere.radius;
          return { object, distance: desired.distanceTo(closest), clearance };
        })
        .filter((hit) => hit && hit.clearance <= (cfg.minClearance || 4.8) && hit.distance < raycaster.far)
        .sort((a, b) => a.distance - b.distance);
    }
    return hits.map((hit) => ({
      ...hit,
      occluderDistance: this.getCameraOccluderDistance(hit.object),
    }));
  }

  isPassedTrackCameraHit(hit, targetDistance, cfg) {
    const hitDistance = Number.isFinite(hit?.occluderDistance) ? hit.occluderDistance : null;
    if (hitDistance == null || !Number.isFinite(targetDistance)) return false;
    return hitDistance <= targetDistance - (cfg.passedTrackBehindDistance ?? 7);
  }

  rotateCameraAroundTarget(desired, target, angleDegrees) {
    const offset = desired.clone().sub(target);
    const horizontal = new THREE.Vector3(offset.x, 0, offset.z);
    if (horizontal.lengthSq() < 0.0001) return desired.clone();
    const rotatedOffset = offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(angleDegrees));
    return target.clone().add(rotatedOffset);
  }

  findRaceFollowAvoidanceCamera(desired, target, activeCameraMode, cfg, targetDistance, baseHits) {
    const avoidance = cfg?.raceFollowAvoidance;
    if (!avoidance?.enabled || !(avoidance.modes || []).includes(activeCameraMode)) return null;
    const occluders = this.getCameraOccluderMeshes();
    if (!occluders.length) return null;
    const maxAcceptedHits = avoidance.maxAcceptedHits ?? 0;
    const candidateAngles = Array.isArray(avoidance.angleDegrees) && avoidance.angleDegrees.length
      ? avoidance.angleDegrees
      : [18, -18, 32, -32, 48, -48];
    let best = null;
    for (const angle of candidateAngles) {
      const candidate = this.rotateCameraAroundTarget(desired, target, angle);
      const hits = this.getCameraLineOfSightHits(candidate, target, occluders, cfg);
      const passedHits = hits.filter((hit) => this.isPassedTrackCameraHit(hit, targetDistance, cfg));
      const score = passedHits.length * 100 + hits.length + Math.abs(angle) / 100;
      const entry = { candidate, angle, hits, passedHits, score };
      if (!best || entry.score < best.score) best = entry;
      if (passedHits.length <= maxAcceptedHits) return entry;
    }
    return best && best.passedHits.length < (baseHits?.length ?? Infinity) ? best : null;
  }

  applyRaceFollowPassedTrackGuard(desired, target, activeCameraMode, cfg) {
    const protectedModes = cfg?.raceFollowProtectedModes || [];
    if (!protectedModes.includes(activeCameraMode)) return null;
    const targetProgress = this.findClosestProgress(target);
    const targetDistance = targetProgress?.distance ?? null;
    const offset = target.clone().sub(desired);
    const distance = offset.length();
    if (distance <= (cfg.minClearance || 0) + 0.5) {
      this.cameraLineOfSightState = { active: false, mode: activeCameraMode, reason: 'target-too-close-race-follow', raceFollowGuard: true };
      return desired;
    }
    const occluders = this.getCameraOccluderMeshes();
    if (!occluders.length) {
      this.cameraLineOfSightState = { active: false, mode: activeCameraMode, reason: 'no-occluders-race-follow', raceFollowGuard: true };
      return desired;
    }
    const hits = this.getCameraLineOfSightHits(desired, target, occluders, cfg);
    const passedHits = hits.filter((hit) => this.isPassedTrackCameraHit(hit, targetDistance, cfg));
    if (!passedHits.length) {
      this.cameraLineOfSightState = {
        active: false,
        mode: activeCameraMode,
        reason: hits.length ? 'occluder-not-passed-track' : 'clear-line-of-sight',
        raceFollowGuard: true,
        hitCount: hits.length,
        targetDistance: Number((targetDistance ?? 0).toFixed(2)),
        nearestOccluderDistance: hits[0]?.occluderDistance != null ? Number(hits[0].occluderDistance.toFixed(2)) : null,
      };
      return desired;
    }
    const rotated = this.findRaceFollowAvoidanceCamera(desired, target, activeCameraMode, cfg, targetDistance, passedHits);
    if (rotated) {
      this.cameraLineOfSightState = {
        active: rotated.passedHits.length < passedHits.length,
        mode: activeCameraMode,
        raceFollowGuard: true,
        avoidanceStrategy: cfg.raceFollowAvoidance?.strategy || 'rotate-around-target',
        rotationApplied: true,
        rotationDegrees: Number(rotated.angle.toFixed(2)),
        hitCount: rotated.passedHits.length,
        totalHitCount: rotated.hits.length,
        basePassedHitCount: passedHits.length,
        targetDistance: Number((targetDistance ?? 0).toFixed(2)),
        nearestHitDistance: rotated.passedHits[0] ? Number(rotated.passedHits[0].distance.toFixed(2)) : null,
        nearestOccluderDistance: rotated.passedHits[0]?.occluderDistance != null ? Number(rotated.passedHits[0].occluderDistance.toFixed(2)) : null,
        nearestOccluderType: rotated.passedHits[0]?.object?.userData?.cameraOccluderType || null,
        protectedModes,
        label: cfg.raceFollowAvoidance?.label || cfg.passedTrackLabel,
      };
      return rotated.candidate;
    }
    let boost = Math.min(cfg.raceFollowMaxHeightBoost || cfg.maxHeightBoost || 0, (cfg.raceFollowBoostStep || cfg.boostStep || 2.5) * Math.min(passedHits.length, cfg.sampleCount || 2));
    if (boost > 0 && cfg.maxElevationDegrees) {
      const currentOffset = desired.clone().sub(target);
      const horizontalDistance = Math.max(0.001, Math.hypot(currentOffset.x, currentOffset.z));
      const currentLift = currentOffset.y;
      const maxLift = Math.tan(THREE.MathUtils.degToRad(cfg.maxElevationDegrees)) * horizontalDistance;
      boost = Math.max(0, Math.min(boost, maxLift - currentLift));
    }
    const boosted = boost > 0 ? desired.clone().add(new THREE.Vector3(0, boost, 0)) : desired;
    this.cameraLineOfSightState = {
      active: boost > 0,
      mode: activeCameraMode,
      boost: Number(boost.toFixed(2)),
      hitCount: passedHits.length,
      totalHitCount: hits.length,
      raceFollowGuard: true,
      targetDistance: Number((targetDistance ?? 0).toFixed(2)),
      nearestHitDistance: passedHits[0] ? Number(passedHits[0].distance.toFixed(2)) : null,
      nearestOccluderDistance: passedHits[0]?.occluderDistance != null ? Number(passedHits[0].occluderDistance.toFixed(2)) : null,
      nearestOccluderType: passedHits[0]?.object?.userData?.cameraOccluderType || null,
      protectedModes,
      label: cfg.passedTrackLabel,
    };
    return boosted;
  }

  applyCameraLineOfSightBoost(desired, target, activeCameraMode) {
    const cfg = BROADCAST_CAMERA.lineOfSight;
    const raceFollowGuardDesired = this.applyRaceFollowPassedTrackGuard(desired, target, activeCameraMode, cfg);
    if (raceFollowGuardDesired) return raceFollowGuardDesired;
    const protectedModes = cfg?.protectedModes || ['cinematicLeader', 'leadBattle', 'selected', 'unfinishedOrder', 'replayHighlight'];
    if (!cfg?.enabled || !protectedModes.includes(activeCameraMode)) {
      this.cameraLineOfSightState = { active: false, mode: activeCameraMode, reason: 'mode-not-protected' };
      return desired;
    }
    const offset = target.clone().sub(desired);
    const distance = offset.length();
    if (distance <= (cfg.minClearance || 0) + 0.5) {
      this.cameraLineOfSightState = { active: false, mode: activeCameraMode, reason: 'target-too-close' };
      return desired;
    }
    const occluders = this.getCameraOccluderMeshes();
    if (!occluders.length) {
      this.cameraLineOfSightState = { active: false, mode: activeCameraMode, reason: 'no-occluders' };
      return desired;
    }
    let hits = this.getCameraLineOfSightHits(desired, target, occluders, cfg);
    let boost = hits.length ? Math.min(cfg.maxHeightBoost || 0, (cfg.boostStep || 3.5) * Math.min(hits.length, cfg.sampleCount || 2)) : 0;
    if (boost > 0 && cfg.maxElevationDegrees) {
      const currentOffset = desired.clone().sub(target);
      const horizontalDistance = Math.max(0.001, Math.hypot(currentOffset.x, currentOffset.z));
      const currentLift = currentOffset.y;
      const maxLift = Math.tan(THREE.MathUtils.degToRad(cfg.maxElevationDegrees)) * horizontalDistance;
      boost = Math.max(0, Math.min(boost, maxLift - currentLift));
    }
    const boosted = boost > 0 ? desired.clone().add(new THREE.Vector3(0, boost, 0)) : desired;
    this.cameraLineOfSightState = {
      active: boost > 0,
      mode: activeCameraMode,
      boost: Number(boost.toFixed(2)),
      hitCount: hits.length,
      nearestHitDistance: hits[0] ? Number(hits[0].distance.toFixed(2)) : null,
      nearestOccluderType: hits[0]?.object?.userData?.cameraOccluderType || null,
      protectedModes,
      label: cfg.label,
    };
    return boosted;
  }

  getToyParkBroadcastTarget() {
    const cfgRoot = BROADCAST_CAMERA.toyParkBroadcast;
    if (!cfgRoot?.enabled || !this.isToyParkViewerOverlayActive()) return null;
    const ranking = this.getAutoCameraRanking({ includeFinished: false });
    const fullRanking = ranking.length ? ranking : this.getAutoCameraRanking({ includeFinished: true });
    if (!fullRanking.length) return null;
    const leader = fullRanking[0];
    const leaderProgress = this.trackLength ? clamp((leader.distance || 0) / this.trackLength, 0, 1) : 0;
    const now = this.elapsed || 0;
    const moment = this.toyParkBroadcastMoment && now <= (this.toyParkBroadcastMoment.expiresAt || 0)
      ? this.toyParkBroadcastMoment
      : null;
    if (!moment && this.toyParkBroadcastMoment) this.toyParkBroadcastMoment = null;

    let phase = 'actionSpot';
    let targetRanking = fullRanking.slice(0, 3);
    let primary = leader;
    let secondary = fullRanking.find((data) => data.id !== leader.id) || null;
    if (moment) {
      phase = 'momentZoom';
      primary = this.marbleData.find((data) => data.id === moment.marbleId) || leader;
      secondary = this.marbleData.find((data) => data.id === moment.rivalId) || secondary;
      targetRanking = [primary, secondary].filter(Boolean);
    } else if (this.countdownActive || this.state === 'ready' || this.state === 'idle' || now < 1.2) {
      phase = 'startClose';
      targetRanking = fullRanking.slice(0, 3);
      primary = targetRanking[0] || leader;
      secondary = targetRanking[1] || null;
    } else if (leaderProgress < (cfgRoot.firstCornerProgressEnd ?? 0.24)) {
      phase = 'firstCorner';
      targetRanking = fullRanking.slice(0, 3);
      primary = targetRanking[0] || leader;
      secondary = targetRanking[1] || null;
    } else if (leaderProgress >= (cfgRoot.finalLeaderProgressStart ?? 0.74)) {
      phase = 'leaderDuel';
      primary = leader;
      secondary = ranking
        .filter((data) => data.id !== leader.id)
        .sort((a, b) => Math.abs((leader.distance || 0) - (a.distance || 0)) - Math.abs((leader.distance || 0) - (b.distance || 0)))[0]
        || fullRanking.find((data) => data.id !== leader.id)
        || null;
      targetRanking = [primary, secondary].filter(Boolean);
    } else {
      const cycle = Math.max(0, now - 1.2) % Math.max(1, cfgRoot.cinematicForwardCycleSeconds || 14);
      if (cycle < Math.max(0, cfgRoot.cinematicForwardHoldSeconds || 0)) {
        phase = 'cinematicForward';
        targetRanking = fullRanking.slice(0, 3);
        primary = targetRanking[0] || leader;
        secondary = targetRanking[1] || null;
      } else {
        phase = 'actionSpot';
        const candidates = [];
        for (let i = 0; i < Math.min(ranking.length - 1, 6); i += 1) {
          const a = ranking[i];
          const b = ranking[i + 1];
          if (!a || !b) continue;
          const gap = Math.abs((a.distance || 0) - (b.distance || 0));
          const progress = this.trackLength ? (((a.distance || 0) + (b.distance || 0)) / 2) / this.trackLength : 0;
          candidates.push({ a, b, gap, progress, score: gap + Math.abs(progress - 0.52) * 2.5 });
        }
        const traffic = candidates.sort((a, b) => a.score - b.score)[0];
        primary = traffic?.a || leader;
        secondary = traffic?.b || fullRanking.find((data) => data.id !== primary.id) || null;
        targetRanking = [primary, secondary].filter(Boolean);
      }
    }

    const center = new THREE.Vector3();
    let avgDistance = 0;
    targetRanking.forEach((data) => {
      center.add(data.mesh?.position || new THREE.Vector3());
      avgDistance += data.distance || 0;
    });
    const size = Math.max(1, targetRanking.length);
    center.multiplyScalar(1 / size);
    avgDistance /= size;
    center.y += (cfgRoot[phase]?.targetLift ?? 0.9);
    return { phase, cfg: cfgRoot[phase] || cfgRoot.actionSpot, center, avgDistance, leaderDistance: leader.distance || 0, leaderProgress, size, primary, secondary, momentActive: Boolean(moment), momentKind: moment?.kind || null };
  }

  noteToyParkBroadcastMoment(event = {}) {
    const cfg = BROADCAST_CAMERA.toyParkBroadcast;
    if (!cfg?.enabled || !this.isToyParkViewerOverlayActive()) return;
    if (!['obstacle', 'overtake', 'leader', 'battle'].includes(event.kind)) return;
    this.toyParkBroadcastMoment = {
      kind: event.kind,
      title: event.title || null,
      marbleId: event.marbleId ?? null,
      rivalId: event.rivalId ?? null,
      startedAt: this.elapsed || 0,
      expiresAt: (this.elapsed || 0) + (cfg.momentZoomSeconds || 1.45),
      distance: event.distance ?? null,
      progress: event.progress ?? null,
    };
  }

  getDefaultCameraMode() {
    const leader = this.getAutoCameraRanking({ includeFinished: false })[0]
      || this.getAutoCameraRanking({ includeFinished: true })[0]
      || this.getRanking({ force: false })[0];
    if (this.finishSlowMotion?.active) return 'finish';
    if (this.state === 'finished') return BROADCAST_CAMERA.podium360.enabled ? 'podium360' : 'finish';
    if (this.getToyParkBroadcastTarget()) return 'toyParkBroadcast';
    if (this.countdownActive || this.state === 'ready' || this.state === 'idle') return 'leadPack';
    if (this.finishers.length > 0) {
      const holdUntil = Number.isFinite(this.defaultCameraPhaseUntil) ? this.defaultCameraPhaseUntil : 0;
      if ((this.elapsed || 0) < holdUntil) return 'finish';
      return BROADCAST_CAMERA.postFirstFinish?.followModeAfterHold || 'cinematicLeader';
    }
    if (BROADCAST_CAMERA.highAngleBattleEnabled && this.getLeadBattleTarget()) return 'leadBattle';
    const leaderProgress = this.trackLength && leader ? clamp((leader.distance || 0) / this.trackLength, 0, 1) : 0;
    if (leaderProgress >= BROADCAST_CAMERA.cinematicLeaderFromProgress) return 'cinematicLeader';
    return 'leadPack';
  }

  getNextUnfinishedTarget() {
    const unfinished = this.getAutoCameraRanking({ includeFinished: false })
      .sort((a, b) => b.progress - a.progress);
    if (!unfinished.length) return null;
    return unfinished[0];
  }

  getPodiumCameraTarget() {
    const collector = this.finishRankingContainer;
    if (!collector) return null;
    return collector.center.clone().add(this.localToWorldOffset(0, 1.2, 0.9, collector.yaw));
  }

  updateCamera(delta) {
    const requestedMode = (this.state === 'finished' && !this.replayHighlight?.active)
      ? 'default'
      : this.cameraMode;
    if (this.state === 'finished' && this.cameraMode !== 'default' && !this.replayHighlight?.active) {
      this.cameraMode = 'default';
    }
    const previousActiveCameraMode = this.activeCameraMode || null;
    const activeCameraMode = this.replayHighlight?.active ? 'replayHighlight' : (requestedMode === 'default' ? this.getDefaultCameraMode() : requestedMode);
    const shouldSnapPostFirstFinishLeadPack = Boolean(
      BROADCAST_CAMERA.postFirstFinish?.snapOnLeadPackSwitch
      && previousActiveCameraMode === 'finish'
      && (activeCameraMode === 'leadPack' || activeCameraMode === 'cinematicLeader')
      && this.finishers.length > 0
      && this.state !== 'finished'
    );
    this.activeCameraMode = activeCameraMode;
    const leader = this.getAutoCameraRanking({ includeFinished: false })[0]
      || this.getAutoCameraRanking({ includeFinished: true })[0]
      || this.getRanking({ force: false })[0];
    const selectedCandidate = this.marbleData[this.selectedIndex];
    const selected = selectedCandidate && !this.isMarbleIgnoredByAutoCamera(selectedCandidate) ? selectedCandidate : leader;
    const unfinishedTarget = this.getNextUnfinishedTarget();
    const leadPack = this.getLeadPackTarget();
    const toyParkBroadcast = activeCameraMode === 'toyParkBroadcast' ? this.getToyParkBroadcastTarget() : null;
    const leadBattle = activeCameraMode === 'leadBattle' ? this.getLeadBattleTarget() : null;
    let target = new THREE.Vector3(0, 0, -this.trackLength / 2);
    let desired = new THREE.Vector3(0, 52, 56);

    if (activeCameraMode === 'replayHighlight' && this.replayHighlight?.active) {
      const replayState = this.getReplayHighlightState();
      if (replayState) {
        const cfg = this.replayHighlight.playback || {};
        const frame = this.getCameraTrackFrameAt(replayState.distance, 4.8);
        if (replayState.focusMarble?.position) {
          target.set(replayState.focusMarble.position.x, replayState.focusMarble.position.y + 0.9, replayState.focusMarble.position.z);
        } else {
          target.copy(frame.p).add(new THREE.Vector3(0, 1.15, 0));
        }
        const pan = Math.sin(replayState.clipProgress * Math.PI * 2) * 0.85;
        desired.copy(target)
          .add(frame.tangent.clone().multiplyScalar(cfg.cameraBack ?? -4.2))
          .add(frame.right.clone().multiplyScalar((cfg.cameraSide ?? 3.6) + pan))
          .add(new THREE.Vector3(0, cfg.cameraHeight ?? 18, 0));
      }
    } else if (activeCameraMode === 'toyParkBroadcast' && toyParkBroadcast) {
      const cfg = toyParkBroadcast.cfg || BROADCAST_CAMERA.toyParkBroadcast.actionSpot;
      const dt = Math.max(0.001, Math.min(delta, 0.05));
      const targetEase = 1 - Math.exp(-dt * 5.0);
      if (!this.leadPackInitialized) {
        this.cameraTargetSmoothed.copy(toyParkBroadcast.center);
        this.leadPackDistanceSmoothed = toyParkBroadcast.avgDistance;
        this.leadPackInitialized = true;
      } else {
        this.cameraTargetSmoothed.lerp(toyParkBroadcast.center, targetEase);
        this.leadPackDistanceSmoothed = lerp(this.leadPackDistanceSmoothed, toyParkBroadcast.avgDistance, targetEase);
      }
      const lookAhead = cfg.lookAhead ?? 5.5;
      const frame = this.getCameraTrackFrameAt(this.leadPackDistanceSmoothed, lookAhead);
      const targetLead = clamp(lookAhead * 0.34, 1.2, 5.6);
      const guideTarget = this.getTrackPointAt(clamp(this.leadPackDistanceSmoothed + targetLead, 0, this.trackLength));
      target.copy(this.cameraTargetSmoothed).lerp(guideTarget, toyParkBroadcast.phase === 'startClose' ? 0.16 : 0.34);
      target.y = lerp(target.y, toyParkBroadcast.center.y, 0.72);
      const sideWave = Math.sin((this.elapsed || 0) * 0.42) * (toyParkBroadcast.phase === 'momentZoom' ? 0.12 : 0.28);
      desired.copy(this.cameraTargetSmoothed)
        .add(frame.tangent.clone().multiplyScalar(cfg.back ?? -4.8))
        .add(frame.right.clone().multiplyScalar((cfg.side ?? 1.1) + sideWave))
        .add((frame.up || new THREE.Vector3(0, 1, 0)).clone().normalize().multiplyScalar(cfg.height ?? 12));
      this.toyParkBroadcastCameraState = {
        enabled: true,
        phase: toyParkBroadcast.phase,
        style: toyParkBroadcast.phase === 'cinematicForward' ? 'cinematic-forward' : 'high-angle-look-across',
        label: cfg.label || BROADCAST_CAMERA.toyParkBroadcast.label,
        primary: toyParkBroadcast.primary?.name || null,
        secondary: toyParkBroadcast.secondary?.name || null,
        size: toyParkBroadcast.size,
        leaderProgress: Number(toyParkBroadcast.leaderProgress.toFixed(3)),
        avgDistance: Number(toyParkBroadcast.avgDistance.toFixed(2)),
        momentActive: toyParkBroadcast.momentActive,
        momentKind: toyParkBroadcast.momentKind,
        fov: cfg.fov || 38,
        offsets: { back: cfg.back, side: cfg.side, height: cfg.height, lookAhead },
      };
    } else if (activeCameraMode === 'leadBattle' && leadBattle) {
      const cfg = BROADCAST_CAMERA.leadBattle;
      const dt = Math.max(0.001, Math.min(delta, 0.05));
      const ease = 1 - Math.exp(-dt * 2.6);
      if (!this.leadBattleInitialized) {
        this.cameraTargetSmoothed.copy(leadBattle.center);
        this.leadPackDistanceSmoothed = leadBattle.avgDistance;
        this.leadBattleInitialized = true;
      } else {
        this.cameraTargetSmoothed.lerp(leadBattle.center, ease);
        this.leadPackDistanceSmoothed = lerp(this.leadPackDistanceSmoothed, leadBattle.avgDistance, ease);
      }
      this.leadBattleState = {
        leader: leadBattle.leader?.name || null,
        chaser: leadBattle.chaser?.name || null,
        gap: leadBattle.gap,
        active: true,
      };
      const frame = this.getTrackFrameAt(this.leadPackDistanceSmoothed);
      target.copy(this.cameraTargetSmoothed);
      desired.copy(target)
        .add(frame.tangent.clone().multiplyScalar(cfg.back))
        .add(frame.right.clone().multiplyScalar(cfg.side))
        .add(new THREE.Vector3(0, cfg.height, 0));
    } else if (activeCameraMode === 'leadPack' && leadPack) {
      const cfg = BROADCAST_CAMERA.leadPack;
      const dt = Math.max(0.001, Math.min(delta, 0.05));
      const packEase = 1 - Math.exp(-dt * 2.0);
      if (!this.leadPackInitialized) {
        this.cameraTargetSmoothed.copy(leadPack.center);
        this.leadPackDistanceSmoothed = leadPack.avgDistance;
        this.leadPackInitialized = true;
      } else {
        this.cameraTargetSmoothed.lerp(leadPack.center, packEase);
        this.leadPackDistanceSmoothed = lerp(this.leadPackDistanceSmoothed, leadPack.avgDistance, packEase);
      }
      const packMembers = this.getAutoCameraRanking({ includeFinished: false }).slice(0, Math.max(1, leadPack.size || 3));
      const avgSpeed = packMembers.length
        ? packMembers.reduce((sum, data) => {
          const velocity = data.body?.velocity;
          return sum + (velocity ? Math.hypot(velocity.x || 0, velocity.y || 0, velocity.z || 0) : 0);
        }, 0) / packMembers.length
        : 0;
      const speedFactor = clamp(avgSpeed / 20, 0, 1);
      const upcomingObstacle = this.getUpcomingObstacleForCamera(this.leadPackDistanceSmoothed, cfg.obstacleAwareDistance);
      const obstacleFactor = upcomingObstacle ? 1 - clamp(upcomingObstacle.ahead / cfg.obstacleAwareDistance, 0, 1) : 0;
      const lookAhead = cfg.lookAhead
        + speedFactor * (cfg.dynamicLookAheadBySpeed || 0)
        + obstacleFactor * (cfg.obstacleLookAheadBoost || 0);
      const frame = this.getCameraTrackFrameAt(this.leadPackDistanceSmoothed, lookAhead);
      const targetLead = clamp(lookAhead * (cfg.targetLookAheadScale ?? 0.2), 2.8, 7.2);
      const guideTarget = this.getTrackPointAt(clamp(this.leadPackDistanceSmoothed + targetLead, 0, this.trackLength));
      const guideBlend = clamp(cfg.targetGuideBlend ?? 0.28, 0, 1);
      const trackUp = cfg.useTrackNormalHeight ? (frame.up || new THREE.Vector3(0, 1, 0)).clone().normalize() : new THREE.Vector3(0, 1, 0);
      const packTarget = this.cameraTargetSmoothed.clone().lerp(guideTarget, guideBlend);
      const trackTarget = this.getTrackPointAt(clamp(this.leadPackDistanceSmoothed, 0, this.trackLength));
      const trackLiftTarget = new THREE.Vector3(trackTarget.x, trackTarget.y, trackTarget.z).add(trackUp.clone().multiplyScalar(cfg.targetLift ?? 1.7));
      packTarget.lerp(trackLiftTarget, 0.92);
      target.copy(packTarget);
      const packZoom = clamp((leadPack.size || 1) - 1, 0, 4);
      const t = this.elapsed || 0;
      const sideWave = Math.sin(t * (cfg.sideWaveSpeed || 0.28)) * (cfg.maxSideWave || 0);
      const desiredBack = cfg.back - packZoom * 0.35 - obstacleFactor * (cfg.obstaclePullback || 0);
      const desiredSide = cfg.side + sideWave;
      const slopeAmount = clamp(Math.abs(frame.trackForward?.y ?? frame.slopeY ?? 0), 0, 1);
      const flatnessFactor = clamp(1 - slopeAmount / Math.max(0.001, cfg.flatSlopeYThreshold ?? 0.18), 0, 1);
      const dynamicSlopeHeightBoost = flatnessFactor * (cfg.flatTrackHeightBoost || 0);
      const desiredHeight = cfg.height
        + packZoom * cfg.packHeightStep
        + obstacleFactor * (cfg.obstacleHeightBoost || 0)
        + dynamicSlopeHeightBoost;
      desired.copy(this.cameraTargetSmoothed)
        .add(frame.tangent.clone().multiplyScalar(desiredBack))
        .add(frame.right.clone().multiplyScalar(desiredSide))
        .add(trackUp.clone().multiplyScalar(desiredHeight));
      const relativeToTrack = desired.clone().sub(trackTarget);
      const normalHeight = relativeToTrack.dot(trackUp);
      this.leadPackCameraState = {
        size: leadPack.size,
        avgSpeed: Number(avgSpeed.toFixed(2)),
        speedFactor: Number(speedFactor.toFixed(2)),
        lookAhead: Number(lookAhead.toFixed(2)),
        targetLead: Number(targetLead.toFixed(2)),
        targetGuideBlend: Number(guideBlend.toFixed(2)),
        obstacleAware: Boolean(upcomingObstacle),
        upcomingObstacleType: upcomingObstacle?.obstacle?.type || null,
        upcomingObstacleAhead: upcomingObstacle ? Number(upcomingObstacle.ahead.toFixed(2)) : null,
        obstacleFactor: Number(obstacleFactor.toFixed(2)),
        desiredBack: Number(desiredBack.toFixed(2)),
        desiredSide: Number(desiredSide.toFixed(2)),
        desiredHeight: Number(desiredHeight.toFixed(2)),
        baseHeight: cfg.height,
        slopeAmount: Number(slopeAmount.toFixed(3)),
        flatnessFactor: Number(flatnessFactor.toFixed(2)),
        dynamicSlopeHeightBoost: Number(dynamicSlopeHeightBoost.toFixed(2)),
        flatTrackHeightBoost: cfg.flatTrackHeightBoost || 0,
        flatSlopeYThreshold: cfg.flatSlopeYThreshold ?? 0.18,
        useTrackNormalHeight: Boolean(cfg.useTrackNormalHeight),
        heightReference: cfg.useTrackNormalHeight ? 'track-local-up' : 'world-y',
        normalHeight: Number(normalHeight.toFixed(2)),
        trackUp: {
          x: Number(trackUp.x.toFixed(3)),
          y: Number(trackUp.y.toFixed(3)),
          z: Number(trackUp.z.toFixed(3)),
        },
        targetLiftMode: cfg.useTrackNormalHeight ? 'track-local-up' : 'world-y',
        fov: cfg.fov,
      };
    } else if (activeCameraMode === 'selected' && selected) {
      const cfg = BROADCAST_CAMERA.selected;
      const frame = this.getTrackFrameAt(selected.distance || 0);
      target.copy(selected.mesh.position);
      desired.copy(selected.mesh.position)
        .add(frame.tangent.clone().multiplyScalar(cfg.back))
        .add(frame.right.clone().multiplyScalar(cfg.side))
        .add(new THREE.Vector3(0, cfg.height, 0));
    } else if (activeCameraMode === 'unfinishedOrder' && unfinishedTarget) {
      const cfg = BROADCAST_CAMERA.unfinished;
      const frame = this.getTrackFrameAt(unfinishedTarget.distance || 0);
      target.copy(unfinishedTarget.mesh.position).add(new THREE.Vector3(0, 0.7, 0));
      desired.copy(target)
        .add(frame.tangent.clone().multiplyScalar(cfg.back))
        .add(frame.right.clone().multiplyScalar(cfg.side))
        .add(new THREE.Vector3(0, cfg.height, 0));
    } else if (activeCameraMode === 'cinematic') {
      const t = this.elapsed * 0.24;
      const d = lerp(8, this.trackLength - 18, (Math.sin(t * 0.42) + 1) / 2);
      const frame = this.getTrackFrameAt(d);
      target.set(frame.p.x, frame.p.y + 0.8, frame.p.z);
      desired.copy(target).add(frame.right.clone().multiplyScalar(Math.sin(t) * 28)).add(frame.tangent.clone().multiplyScalar(-22)).add(new THREE.Vector3(0, 17 + Math.cos(t * 0.7) * 5, 0));
    } else if (activeCameraMode === 'cinematicLeader' && leader) {
      const cfg = BROADCAST_CAMERA.leader;
      const leaderDistance = leader.distance || 0;
      const velocity = leader.body?.velocity;
      const speed = velocity ? Math.hypot(velocity.x || 0, velocity.y || 0, velocity.z || 0) : 0;
      const speedFactor = clamp(speed / 20, 0, 1);
      const upcomingObstacle = this.getUpcomingObstacleForCamera(leaderDistance, cfg.obstacleAwareDistance);
      const obstacleFactor = upcomingObstacle ? 1 - clamp(upcomingObstacle.ahead / cfg.obstacleAwareDistance, 0, 1) : 0;
      const lookAhead = cfg.lookAhead
        + speedFactor * (cfg.dynamicLookAheadBySpeed || 0)
        + obstacleFactor * (cfg.obstacleLookAheadBoost || 0);
      const t = this.elapsed || 0;
      const frame = this.getCameraTrackFrameAt(leaderDistance, lookAhead);
      const targetLead = clamp(lookAhead * (cfg.targetLookAheadScale ?? 0.22), 1.5, 5.5);
      const guideTarget = this.getTrackPointAt(clamp(leaderDistance + targetLead, 0, this.trackLength));
      const guideBlend = clamp(cfg.targetGuideBlend ?? 0.18, 0, 1);
      const lookPoint = leader.mesh.position.clone().lerp(guideTarget, guideBlend);
      const trackTarget = this.getTrackPointAt(clamp(leaderDistance, 0, this.trackLength));
      const leaderTrackUp = (frame.up || new THREE.Vector3(0, 1, 0)).clone().normalize();
      const trackLiftTarget = new THREE.Vector3(trackTarget.x, trackTarget.y, trackTarget.z).add(leaderTrackUp.clone().multiplyScalar(cfg.targetLift ?? 1.15));
      lookPoint.lerp(trackLiftTarget, 0.52);
      const sideWave = Math.sin(t * (cfg.sideWaveSpeed || 0.24)) * (cfg.maxSideWave || 0);
      const desiredBack = cfg.back - obstacleFactor * (cfg.obstaclePullback || 0);
      const desiredSide = cfg.side + sideWave;
      const desiredHeight = cfg.height + obstacleFactor * (cfg.obstacleHeightBoost || 0);
      target.copy(lookPoint);
      this.cameraTargetSmoothed.lerp(target, cfg.targetSmoothing || 0.075);
      target.copy(this.cameraTargetSmoothed);
      desired.copy(leader.mesh.position)
        .add(frame.tangent.clone().multiplyScalar(desiredBack))
        .add(frame.right.clone().multiplyScalar(desiredSide))
        .add(leaderTrackUp.clone().multiplyScalar(desiredHeight));
      this.cinematicLeaderCameraState = {
        speed: Number(speed.toFixed(2)),
        speedFactor: Number(speedFactor.toFixed(2)),
        lookAhead: Number(lookAhead.toFixed(2)),
        targetLead: Number(targetLead.toFixed(2)),
        targetGuideBlend: Number(guideBlend.toFixed(2)),
        obstacleAware: Boolean(upcomingObstacle),
        upcomingObstacleType: upcomingObstacle?.obstacle?.type || null,
        upcomingObstacleAhead: upcomingObstacle ? Number(upcomingObstacle.ahead.toFixed(2)) : null,
        obstacleFactor: Number(obstacleFactor.toFixed(2)),
        desiredBack: Number(desiredBack.toFixed(2)),
        desiredSide: Number(desiredSide.toFixed(2)),
        desiredHeight: Number(desiredHeight.toFixed(2)),
        angleReference: 'lead-pack-style track-local tangent/right/up',
        trackUp: {
          x: Number(leaderTrackUp.x.toFixed(3)),
          y: Number(leaderTrackUp.y.toFixed(3)),
          z: Number(leaderTrackUp.z.toFixed(3)),
        },
        targetYMode: 'track-local-up-leader-target',
        trackTargetY: Number(trackTarget.y.toFixed(2)),
        fov: cfg.fov,
      };
    } else if (activeCameraMode === 'finish') {
      const cfg = BROADCAST_CAMERA.finish;
      const frame = this.getTrackFrameAt(this.trackLength);
      target.set(frame.p.x, frame.p.y + 1.05, frame.p.z);
      desired.copy(target).add(frame.tangent.clone().multiplyScalar(cfg.forward)).add(new THREE.Vector3(0, cfg.height, 0));
    } else if (activeCameraMode === 'podium360') {
      const cfg = BROADCAST_CAMERA.podium360;
      const podiumTarget = this.getPodiumCameraTarget() || new THREE.Vector3(0, 1.2, 0);
      const collector = this.finishRankingContainer;
      const isChampionCeremony = Boolean(this.podiumCeremony?.active && this.podiumCeremony?.isCupChampionCeremony);
      const ceremonyAge = Math.max(0, this.podiumCeremony?.elapsedSeconds ?? ((this.elapsed || 0) - (this.podiumCeremony?.startedAt || this.elapsed || 0)));
      const t = ceremonyAge * (isChampionCeremony ? cfg.championAngularSpeed : cfg.angularSpeed);
      const radius = isChampionCeremony ? cfg.championRadius : cfg.radius;
      const height = isChampionCeremony ? cfg.championHeight : cfg.height;
      const heightBob = isChampionCeremony ? cfg.championHeightBob : cfg.heightBob;
      target.copy(podiumTarget);
      desired.copy(target).add(this.localToWorldOffset(
        Math.sin(t) * radius,
        height + Math.sin(t * 0.7) * heightBob,
        Math.cos(t) * radius,
        collector?.yaw || 0,
      ));
    } else {
      this.leadBattleState = this.leadBattleState ? { ...this.leadBattleState, active: false } : null;
      return;
    }

    if (activeCameraMode !== 'leadBattle') {
      this.leadBattleInitialized = false;
      this.leadBattleState = this.leadBattleState ? { ...this.leadBattleState, active: false } : null;
    }
    desired.copy(this.applyDefaultCameraPitch(desired, target, activeCameraMode));
    desired.copy(this.getMouseOrbitAdjustedCamera(desired, target));
    desired.copy(this.applyCameraLineOfSightBoost(desired, target, activeCameraMode));
    const toyParkNarrowPortraitPreview = Boolean(
      this.toyParkPreviewEndpoint
      && this.isToyParkViewerOverlayActive()
      && window.innerWidth < 600
      && window.innerHeight > window.innerWidth * 1.35
      && (activeCameraMode === 'leadPack' || activeCameraMode === 'cinematicLeader')
    );
    if (toyParkNarrowPortraitPreview) {
      // Phone portrait needs a gently wider shot, but not the extreme high overhead view
      // caused by treating the live web preview like a 16:9 composite crop.
      const viewOffset = desired.clone().sub(target);
      const horizontalOffset = new THREE.Vector3(viewOffset.x, 0, viewOffset.z).multiplyScalar(1.08);
      desired.set(target.x + horizontalOffset.x, desired.y + 1.8, target.z + horizontalOffset.z);
      target.y += 0.25;
    }
    const desiredFov = activeCameraMode === 'cinematicLeader'
      ? (BROADCAST_CAMERA.leader.fov || 40)
      : (activeCameraMode === 'toyParkBroadcast'
        ? (this.toyParkBroadcastCameraState?.fov || 38)
        : (activeCameraMode === 'leadPack'
          ? (BROADCAST_CAMERA.leadPack.fov || 44)
          : (activeCameraMode === 'replayHighlight' ? 38 : 58)));
    const portraitPreviewFovBoost = toyParkNarrowPortraitPreview ? 1.12 : 1;
    const viewportDesiredFov = portraitPreviewFovBoost > 1
      ? clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(desiredFov) / 2) * portraitPreviewFovBoost)), desiredFov, 78)
      : desiredFov;
    const layout = this.videoCanvasLayout || VIDEO_CANVAS_LAYOUTS.horizontal;
    const sourceWidth = this.renderer?.domElement?.width || this.renderer?.domElement?.clientWidth || window.innerWidth || 1;
    const sourceHeight = this.renderer?.domElement?.height || this.renderer?.domElement?.clientHeight || window.innerHeight || 1;
    const targetWidth = this.videoCompositeCanvas?.width || layout.width || sourceWidth;
    const targetHeight = this.videoCompositeCanvas?.height || layout.height || sourceHeight;
    const rawCropFactor = this.getVideoCompositeCameraCropFactor(sourceWidth, sourceHeight, targetWidth, targetHeight, layout.fit || 'cover');
    // The live /toypark phone preview is already portrait; do not widen the camera as if it
    // were being cover-cropped into the default 16:9 composite target.
    const cropFactor = toyParkNarrowPortraitPreview ? 1 : rawCropFactor;
    const verticalRenderZoomOutFactor = (layout.key || this.videoCanvasLayoutKey) === 'vertical' ? 1.08 : 1;
    const compensatedDesiredFov = (cropFactor > 1.01 || verticalRenderZoomOutFactor > 1 || portraitPreviewFovBoost > 1)
      ? clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(viewportDesiredFov) / 2) * cropFactor * verticalRenderZoomOutFactor)), viewportDesiredFov, 96)
      : viewportDesiredFov;
    this.videoCompositeCameraCropState = {
      layout: layout.key || this.videoCanvasLayoutKey || 'horizontal',
      fit: layout.fit || 'cover',
      sourceSize: `${sourceWidth}x${sourceHeight}`,
      targetSize: `${targetWidth}x${targetHeight}`,
      verticalRenderZoomOutFactor: Number(verticalRenderZoomOutFactor.toFixed(2)),
      rawCropFactor: Number(rawCropFactor.toFixed(3)),
      cropFactor: Number(cropFactor.toFixed(3)),
      baseFov: Number(desiredFov.toFixed(2)),
      viewportFov: Number(viewportDesiredFov.toFixed(2)),
      portraitPreviewFovBoost: Number(portraitPreviewFovBoost.toFixed(2)),
      compensatedFov: Number(compensatedDesiredFov.toFixed(2)),
      active: cropFactor > 1.01 || verticalRenderZoomOutFactor > 1 || portraitPreviewFovBoost > 1,
      label: portraitPreviewFovBoost > 1
        ? 'Toy Park phone portrait preview zoom-out: pulls/lifts camera and widens FOV so the road is not oversized/cropped'
        : (verticalRenderZoomOutFactor > 1
          ? 'vertical Shorts render zoom-out: widens live render FOV slightly after cover-crop compensation so fast leaders stay in frame'
          : (cropFactor > 1.01 ? 'compensates vertical Shorts cover-crop by widening the live render FOV before compositing' : 'no video-crop camera compensation needed')),
      toyParkNarrowPortraitPreview,
    };
    if (Math.abs(this.camera.fov - compensatedDesiredFov) > 0.01) {
      this.camera.fov = lerp(this.camera.fov, compensatedDesiredFov, (activeCameraMode === 'cinematicLeader' || activeCameraMode === 'leadPack') ? 0.035 : 0.055);
      this.camera.updateProjectionMatrix();
    }
    const isLeadCloseMode = activeCameraMode === 'leadPack' || activeCameraMode === 'leadBattle' || activeCameraMode === 'toyParkBroadcast' || activeCameraMode === 'replayHighlight';
    const isCinematicLeader = activeCameraMode === 'cinematicLeader';
    const isCinematicLeadPack = activeCameraMode === 'leadPack';
    const isToyParkBroadcast = activeCameraMode === 'toyParkBroadcast';
    const toyParkShotCfg = isToyParkBroadcast
      ? (BROADCAST_CAMERA.toyParkBroadcast?.[this.toyParkBroadcastCameraState?.phase] || BROADCAST_CAMERA.toyParkBroadcast?.actionSpot || {})
      : null;
    const positionSmooth = activeCameraMode === 'replayHighlight'
      ? 1
      : (isToyParkBroadcast
        ? (toyParkShotCfg.positionSmoothing || 0.12)
        : (isCinematicLeader
          ? (BROADCAST_CAMERA.leader.positionSmoothing || 0.035)
          : (isCinematicLeadPack
            ? (BROADCAST_CAMERA.leadPack.positionSmoothing || 0.035)
            : (isLeadCloseMode ? 1 - Math.exp(-delta * (activeCameraMode === 'leadBattle' ? 3.2 : 2.1)) : 1 - Math.pow(0.001, delta)))));
    const targetSmooth = activeCameraMode === 'replayHighlight'
      ? 1
      : (isToyParkBroadcast
        ? (toyParkShotCfg.targetSmoothing || 0.16)
        : (isCinematicLeader
          ? (BROADCAST_CAMERA.leader.targetSmoothing || 0.075)
          : (isCinematicLeadPack
            ? (BROADCAST_CAMERA.leadPack.targetSmoothing || 0.08)
            : (isLeadCloseMode ? 1 - Math.exp(-delta * (activeCameraMode === 'leadBattle' ? 4.2 : 2.8)) : 1 - Math.pow(0.001, delta)))));
    const cameraBlend = activeCameraMode === 'replayHighlight' ? 1 : (activeCameraMode === 'leadBattle' ? 0.78 : isToyParkBroadcast ? 1 : isCinematicLeadPack ? 0.84 : isCinematicLeader ? 0.82 : 0.72);
    if (shouldSnapPostFirstFinishLeadPack) {
      this.camera.position.copy(desired);
      this.controls.target.copy(target);
      this.postFirstFinishCameraSnapState = {
        active: true,
        from: previousActiveCameraMode,
        to: activeCameraMode,
        elapsed: Number((this.elapsed || 0).toFixed(2)),
        firstFinishTime: Number((this.firstFinishTime || 0).toFixed(2)),
        delaySeconds: BROADCAST_CAMERA.postFirstFinish?.finishHoldSeconds ?? 4,
        label: BROADCAST_CAMERA.postFirstFinish?.label,
      };
    } else {
      this.postFirstFinishCameraSnapState = this.postFirstFinishCameraSnapState ? { ...this.postFirstFinishCameraSnapState, active: false } : null;
      this.camera.position.lerp(desired, positionSmooth * cameraBlend);
      this.controls.target.lerp(target, targetSmooth);
    }
    this.camera.lookAt(this.controls.target);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.resizeWebViewerCanvasOverlay();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { window.__MARBLE_RACE_APP__ = new MarbleRace(); }, { once: true });
} else {
  window.__MARBLE_RACE_APP__ = new MarbleRace();
}
