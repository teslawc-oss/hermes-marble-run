import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import obstacleCatalogData from './obstacle-catalog.json';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const VIDEO_CANVAS_LAYOUTS = {
  horizontal: {
    key: 'horizontal',
    label: 'Long / Horizontal Video Canvas',
    width: 1920,
    height: 1080,
    fit: 'cover',
  },
  vertical: {
    key: 'vertical',
    label: 'Shorts / Vertical Video Canvas',
    width: 1080,
    height: 1920,
    fit: 'cover',
  },
};

const CANVAS_VIEWER_OVERLAY = {
  enabled: true,
  channelHandle: '@VibeCodeCreator',
  ctaPrimary: 'LIKE & SUBSCRIBE',
  maxStandingRows: 5,
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
  style: 'track-aligned-gravity-staging-chute-with-lane-stalls-and-lift-gate',
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
  freezeMarblesUntilGateOpen: false,
  allowPreGateSlideToGate: true,
  slotFillMode: 'fill-all-lane-slots-before-starting-next-row',
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
  maxBonus: 0.16,
  fullEffectGap: 36,
  disableBonusOnTurnPieces: true,
  turnPieceMaxSpeedRatio: 0.7,
  label: 'slightly stronger comeback pacing: trailing marbles reach up to +16% top speed on straights once the gap is about 36m, while leaders and corner pieces stay protected',
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
  guideBlockedByObstacleRadiusPadding: 0.55,
  cornerExitNextEntranceMaxDistance: 4.2,
  label: 'guide point advances only a short distance within the current board first; if a near guide point cannot be reached, advance to the next small point, including obstacle-overlap stalls; corner exits cannot jump far into the next straight',
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
  minSpacingMeters: 8,
  minSpacingFloorMeters: 4,
  startPaddingMeters: 12,
  finishPaddingMeters: 16,
  label: 'obstacle placements are sorted and relaxed along the track with a minimum distance gap so generated obstacles do not overlap or cluster on top of each other',
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
  angleStyle: 'broadcast-auto-director-late-race-leader-chase',
  highAngleBattleEnabled: false,
  birdEyeCameraAngle: true,
  initialVerticalAxisRotationDegrees: 150,
  defaultCameraPitchUpDegrees: 58,
  defaultPitchModes: ['leadPack', 'leadBattle', 'unfinishedOrder'],
  outOfBoundsIgnoreAfterSeconds: 1.0,
  outOfBoundsIgnoreLabel: 'auto camera: if a marble is outside the track for more than 1 second, stop targeting it until it respawns/returns',
  cinematicLeaderFromProgress: 0.6,
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
    back: -11.5,
    side: 0.9,
    height: 28,
    lookAhead: 8,
    targetLookAheadScale: 0.18,
    targetGuideBlend: 0.28,
    targetLift: 1.15,
    dynamicLookAheadBySpeed: 6,
    maxSideWave: 0.08,
    sideWaveSpeed: 0.2,
    positionSmoothing: 0.07,
    targetSmoothing: 0.14,
    fov: 26,
    obstacleAwareDistance: 24,
    obstaclePullback: 0.6,
    obstacleHeightBoost: 2,
    obstacleLookAheadBoost: 2,
    label: 'late-race leader chase shot: from 60% progress it follows P1 more tightly with lower non-bird-eye height, longer chase distance, less guide lead, restrained side drift, and wider FOV so the leader stays in frame',
  },
  leadPack: {
    back: -8.5,
    side: 0.9,
    height: 34,
    packHeightStep: 0.5,
    lookAhead: 11,
    targetLookAheadScale: 0.34,
    targetGuideBlend: 0.38,
    targetLift: 1.7,
    useTrackNormalHeight: true,
    flatTrackHeightBoost: 8,
    flatSlopeYThreshold: 0.18,
    dynamicLookAheadBySpeed: 5,
    maxSideWave: 0.28,
    sideWaveSpeed: 0.28,
    positionSmoothing: 0.035,
    targetSmoothing: 0.08,
    fov: 28,
    obstacleAwareDistance: 38,
    obstaclePullback: 3.5,
    obstacleHeightBoost: 3,
    obstacleLookAheadBoost: 5,
    label: 'cinematic lead-pack hero shot: follows the pack center while using track-local normal height over uneven slopes, track direction, small guide blend, obstacle-aware height/pullback, and gentle side drift',
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
  decorationStepMeters: 26,
  disableDecorativePointLights: true,
  renderNameLabelUpdateMs: 0,
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
  },
  smooth1080p: {
    key: 'smooth1080p',
    label: 'Smooth 1080p render UI',
    uiUpdateMs: 1000,
    debugUpdateMs: 2600,
    leaderboardUpdateMs: 1800,
    rankingCacheMs: 700,
  },
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
];
const nameNouns = [
  'Bolt', 'Racer', 'Spinner', 'Flash', 'Rocket', 'Marble', 'Surge', 'Pearl',
  'Bandit', 'Drifter', 'Chaser', 'Nova', 'Dash', 'Champion', 'Whisker', 'Falcon',
  'Comet', 'Vortex', 'Voyager', 'Meteor', 'Orbit', 'Pulse', 'Spark', 'Jet',
  'Arrow', 'Storm', 'River', 'Flare', 'Phoenix', 'Dragon', 'Panther', 'Tiger',
  'Cyclone', 'Ranger', 'Runner', 'Glider', 'Striker', 'Pioneer', 'Ace', 'Maverick',
  'Cruiser', 'Breaker', 'Sprinter', 'Blazer', 'Seeker', 'Raider', 'Knight', 'Pilot',
];
const nameTitles = [
  'Turbo', 'Omega', 'Zero', 'Neo', 'Pro', 'Prime', 'Infinity', 'Velocity',
  'Legend', 'Apex', 'Blitz', 'Fusion', 'Nitro', 'Quantum', 'Orbit', 'Zenith',
  'Eclipse', 'Vertex', 'Momentum', 'Radiance', 'Catalyst', 'Overdrive', 'Miracle', 'Vanguard',
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
  { key: 'rings', label: 'Layered Rings' },
  { key: 'spiral', label: 'Spiral Swirl' },
  { key: 'ripple', label: 'Ripple Waves' },
  { key: 'speckle', label: 'Speckled Pearl' },
  { key: 'comet', label: 'Comet Trails' },
  { key: 'storm', label: 'Storm Veins' },
  { key: 'split', label: 'Two-Tone Split' },
  { key: 'triad', label: 'Tri-Color Panels' },
  { key: 'chevron', label: 'Chevron Bands' },
  { key: 'circuit', label: 'Circuit Lines' },
  { key: 'flame', label: 'Flame Licks' },
  { key: 'marble-vein', label: 'Natural Marble Veins' },
  { key: 'checker', label: 'Checker Pop' },
  { key: 'starfield', label: 'Starfield Glitter' },
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
    this.defaultCameraPhaseUntil = 0;
    this.defaultCameraFocusId = null;
    this.firstFinishTime = 0;
    this.firstFinishRealTimeMs = 0;
    this.elapsed = 0;
    this.countdownDuration = 3;
    this.countdownRemaining = 0;
    this.countdownActive = false;
    this.countdownLastAnnouncedSecond = null;
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
    this.obstacleIndex = 0;
    this.obstaclePreset = OBSTACLE_PRESETS[this.obstacleIndex];
    this.obstacleDistributionMode = 'random';
    this.obstacleDistributionSummary = null;
    this.curveStyleKey = 'mixed';
    this.curveStyle = CURVE_PRESETS[this.curveStyleKey];
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
      uiThrottleProfile: 'live',
    };
    this.lastFps = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.lastNameLabelUpdate = 0;
    this.viewerOverlayCanvas = null;
    this.viewerOverlayContext = null;
    this.lastViewerOverlaySummary = null;
    this.webViewerOverlayCanvas = null;
    this.webViewerOverlayContext = null;
    this.lastWebViewerOverlaySummary = null;
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
    this.enabledObstacleTypes = new Set(PINBALL_OBSTACLE_TYPES);
    this.pinballObstacles = [];
    this.showGuidePoints = false;
    this.guidePointGroup = new THREE.Group();
    this.guidePointGroup.name = 'guide-point-marker-group';
    this.guidePointGroup.visible = false;
    this.scene?.add?.(this.guidePointGroup);
    this.pinballInteractions = Object.fromEntries(PINBALL_OBSTACLE_TYPES.map((type) => [type, 0]));
    this.trackStats = { ribbonMeshes: 0, visibleDecks: 0, physicsDecks: 0, railTubes: 0, branchJoinDecks: 0, physicalRailBodies: 0, smoothRailJoinBodies: 0, optimizedRailBodies: 0, broadcastStageMarkers: 0 };
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
    this.slopeDrive = SLOPE_DRIVE;
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
    this.lastFinalStretchAt = -Infinity;
    this.activeCaption = null;
    this.replayHighlight = { active: false, stage: null, events: [], startedAt: 0, startedAtMs: 0, duration: 0, playback: null };
    this.raceHistoryBuffer = [];
    this.lastRaceHistorySampleAt = -Infinity;
    this.replayOriginalSnapshots = null;
    this.spectacleEffects = [];
    this.confettiPieces = [];
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
      replayHighlight: document.querySelector('#replay-highlight-overlay'),
      finalShowcase: document.querySelector('#final-showcase'),
    };

    this.leftUICollapsed = true;
    this.applyLeftUIState();
    this.applyRightUIState();
    this.setTtsPitch(this.ui.ttsPitchSlider?.value || this.ttsPitch || 1, { resetQueue: false, updateStatus: false });
    this.initTtsVoiceSelector();
    this.buildObstacleTypeToggles();
    this.initThree();
    this.initPhysics();
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

  getViewerOverlayCaption() {
    const active = this.activeCaption && this.elapsed <= this.activeCaption.expiresAt ? this.activeCaption : null;
    if (active) return { title: active.title || 'LIVE EVENT', detail: active.detail || '' };
    const leader = this.getRanking({ force: false })[0];
    if (this.state === 'running' && leader) return { title: 'LIVE EVENT', detail: `${leader.name} leads the rush` };
    if (this.countdownActive) return { title: 'GET READY', detail: 'The gate is about to open' };
    if (this.state === 'finished') return { title: 'RACE COMPLETE', detail: this.buildPodiumResultLine?.() || 'Podium locked' };
    return { title: 'MARBLE RUSH', detail: 'Pick your winner' };
  }

  drawViewerCanvasOverlay({ canvas = this.viewerOverlayCanvas, ctx = this.viewerOverlayContext, summaryTarget = 'recording' } = {}) {
    if (!CANVAS_VIEWER_OVERLAY.enabled || !ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const layoutKey = this.videoCanvasLayoutKey || (w < h ? 'vertical' : 'horizontal');
    const isVertical = layoutKey === 'vertical' || h > w * 1.2;
    const maxRows = isVertical ? 3 : CANVAS_VIEWER_OVERLAY.maxStandingRows;
    const ranking = this.getRanking({ force: false }).slice(0, maxRows);
    const leader = ranking[0] || null;
    const leaderProgress = clamp(leader?.progress || 0, 0, 1);
    const leaderDistance = Math.max(0, Math.min(this.trackLength || 0, leader?.distance || 0));
    const caption = this.getViewerOverlayCaption();
    if (isVertical) {
      this.drawVerticalViewerCanvasOverlay({ ctx, canvas, ranking, leaderProgress, leaderDistance, caption, summaryTarget });
      return;
    }

    // Live Event caption, top-left.
    const capX = 46;
    const capY = 38;
    const capW = 760;
    const capH = 132;
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

    // Live Standing, right side.
    const boardX = w - 438;
    const boardY = 44;
    const boardW = 390;
    const rowH = 62;
    const boardH = 94 + rowH * CANVAS_VIEWER_OVERLAY.maxStandingRows;
    this.drawViewerRoundedRect(ctx, boardX, boardY, boardW, boardH, 28);
    ctx.fillStyle = 'rgba(3, 8, 18, 0.74)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 3;
    ctx.stroke();
    this.drawViewerText(ctx, 'LIVE STANDING', boardX + 24, boardY + 36, { font: '900 31px Arial Black, Impact, sans-serif', fill: '#8df7ff', strokeWidth: 5 });
    ranking.forEach((data, index) => {
      const y = boardY + 74 + index * rowH;
      const color = `#${(data.color || 0xffffff).toString(16).padStart(6, '0')}`;
      this.drawViewerRoundedRect(ctx, boardX + 18, y, boardW - 36, 50, 16);
      ctx.fillStyle = index === 0 ? 'rgba(255, 214, 64, 0.28)' : 'rgba(255,255,255,0.10)';
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(boardX + 88, y + 25, 12, 0, Math.PI * 2);
      ctx.fill();
      this.drawViewerText(ctx, `#${index + 1}`, boardX + 34, y + 26, { font: '900 23px Arial Black, Impact, sans-serif', fill: index === 0 ? '#ffdf3f' : '#ffffff', strokeWidth: 4 });
      this.drawViewerText(ctx, data.name || `Marble ${data.id + 1}`, boardX + 116, y + 25, { font: '800 22px Arial, system-ui, sans-serif', fill: '#ffffff', strokeWidth: 4, maxWidth: 168 });
      const label = data.defeated ? 'DNF' : data.finished ? `${(data.finishTime || this.elapsed || 0).toFixed(1)}s` : `${Math.round((data.progress || 0) * 100)}%`;
      this.drawViewerText(ctx, label, boardX + boardW - 36, y + 25, { font: '900 22px Arial Black, Impact, sans-serif', fill: '#aefcff', strokeWidth: 4, align: 'right' });
    });

    // Bottom CTA and channel handle.
    const ctaX = 54;
    const ctaY = h - 132;
    const ctaW = 610;
    const ctaH = 86;
    this.drawViewerRoundedRect(ctx, ctaX, ctaY, ctaW, ctaH, 28);
    ctx.fillStyle = 'rgba(255, 36, 66, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 4;
    ctx.stroke();
    this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.ctaPrimary, ctaX + 32, ctaY + 33, { font: '900 37px Arial Black, Impact, sans-serif', fill: '#ffffff', strokeWidth: 5 });
    this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.channelHandle, ctaX + 34, ctaY + 66, { font: '800 25px Arial, system-ui, sans-serif', fill: '#fff3a0', strokeWidth: 4 });

    // Time / progress / distance lower-third.
    const infoX = 690;
    const infoY = h - 116;
    const infoW = 700;
    const infoH = 66;
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

    const overlaySummary = {
      enabled: true,
      target: summaryTarget,
      canvasSize: `${w}x${h}`,
      liveEventTitle: caption.title,
      liveEventDetail: caption.detail,
      liveStandingCount: ranking.length,
      layout: 'horizontal',
      maxStandingRows: CANVAS_VIEWER_OVERLAY.maxStandingRows,
      channelHandle: CANVAS_VIEWER_OVERLAY.channelHandle,
      ctaPrimary: CANVAS_VIEWER_OVERLAY.ctaPrimary,
      elapsed: Number(this.elapsed.toFixed(2)),
      leaderProgress: Number(leaderProgress.toFixed(3)),
      leaderDistance: Number(leaderDistance.toFixed(1)),
    };
    if (summaryTarget === 'web') this.lastWebViewerOverlaySummary = overlaySummary;
    else this.lastViewerOverlaySummary = overlaySummary;
  }

  drawVerticalViewerCanvasOverlay({ ctx, canvas, ranking = [], leaderProgress = 0, leaderDistance = 0, caption = {}, summaryTarget = 'recording' } = {}) {
    const w = canvas.width;
    const h = canvas.height;
    const margin = 42;

    // Compact Shorts event card at the top.
    const capX = margin;
    const capY = 54;
    const capW = w - margin * 2;
    const capH = 172;
    ctx.save();
    const capGradient = ctx.createLinearGradient(capX, capY, capX + capW, capY + capH);
    capGradient.addColorStop(0, 'rgba(255, 128, 0, 0.94)');
    capGradient.addColorStop(1, 'rgba(255, 224, 80, 0.80)');
    this.drawViewerRoundedRect(ctx, capX, capY, capW, capH, 34);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.54)';
    ctx.fill();
    this.drawViewerRoundedRect(ctx, capX + 18, capY + 18, 182, 44, 20);
    ctx.fillStyle = capGradient;
    ctx.fill();
    this.drawViewerText(ctx, 'LIVE EVENT', capX + 109, capY + 41, { font: '900 25px Arial Black, Impact, sans-serif', fill: '#141414', strokeWidth: 0, align: 'center' });
    this.drawViewerText(ctx, caption.title || 'MARBLE RUSH', capX + 34, capY + 100, { font: '900 54px Arial Black, Impact, sans-serif', fill: '#fff7b1', maxWidth: capW - 68 });
    this.drawViewerText(ctx, caption.detail || 'Pick your winner', capX + 34, capY + 145, { font: '800 30px Arial, system-ui, sans-serif', fill: '#ffffff', strokeWidth: 4, maxWidth: capW - 68 });
    ctx.restore();

    // Shorts-friendly top-three standings card. Keep it compact so the middle race action stays visible.
    const boardW = w - margin * 2;
    const rowH = 72;
    const boardH = 92 + rowH * Math.max(1, ranking.length || 3);
    const boardX = margin;
    const boardY = Math.min(h - 720, 270);
    this.drawViewerRoundedRect(ctx, boardX, boardY, boardW, boardH, 34);
    ctx.fillStyle = 'rgba(3, 8, 18, 0.70)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 4;
    ctx.stroke();
    this.drawViewerText(ctx, 'LIVE STANDING', boardX + 30, boardY + 42, { font: '900 38px Arial Black, Impact, sans-serif', fill: '#8df7ff', strokeWidth: 5 });
    ranking.forEach((data, index) => {
      const y = boardY + 76 + index * rowH;
      const color = `#${(data.color || 0xffffff).toString(16).padStart(6, '0')}`;
      this.drawViewerRoundedRect(ctx, boardX + 24, y, boardW - 48, 56, 18);
      ctx.fillStyle = index === 0 ? 'rgba(255, 214, 64, 0.30)' : 'rgba(255,255,255,0.11)';
      ctx.fill();
      this.drawViewerText(ctx, `#${index + 1}`, boardX + 48, y + 28, { font: '900 28px Arial Black, Impact, sans-serif', fill: index === 0 ? '#ffdf3f' : '#ffffff', strokeWidth: 4 });
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(boardX + 130, y + 28, 14, 0, Math.PI * 2);
      ctx.fill();
      this.drawViewerText(ctx, data.name || `Marble ${data.id + 1}`, boardX + 160, y + 28, { font: '800 27px Arial, system-ui, sans-serif', fill: '#ffffff', strokeWidth: 4, maxWidth: boardW - 340 });
      const label = data.defeated ? 'DNF' : data.finished ? `${(data.finishTime || this.elapsed || 0).toFixed(1)}s` : `${Math.round((data.progress || 0) * 100)}%`;
      this.drawViewerText(ctx, label, boardX + boardW - 52, y + 28, { font: '900 27px Arial Black, Impact, sans-serif', fill: '#aefcff', strokeWidth: 4, align: 'right' });
    });

    // Bottom stacked CTA and progress lower-third.
    const ctaX = margin;
    const ctaY = h - 292;
    const ctaW = w - margin * 2;
    const ctaH = 94;
    this.drawViewerRoundedRect(ctx, ctaX, ctaY, ctaW, ctaH, 32);
    ctx.fillStyle = 'rgba(255, 36, 66, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 4;
    ctx.stroke();
    this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.ctaPrimary, ctaX + ctaW / 2, ctaY + 38, { font: '900 46px Arial Black, Impact, sans-serif', fill: '#ffffff', strokeWidth: 5, align: 'center', maxWidth: ctaW - 60 });
    this.drawViewerText(ctx, CANVAS_VIEWER_OVERLAY.channelHandle, ctaX + ctaW / 2, ctaY + 73, { font: '800 27px Arial, system-ui, sans-serif', fill: '#fff3a0', strokeWidth: 4, align: 'center', maxWidth: ctaW - 60 });

    const infoX = margin;
    const infoY = h - 172;
    const infoW = w - margin * 2;
    const infoH = 112;
    this.drawViewerRoundedRect(ctx, infoX, infoY, infoW, infoH, 30);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.64)';
    ctx.fill();
    this.drawViewerText(ctx, `TIME ${this.elapsed.toFixed(1)}s`, infoX + 34, infoY + 38, { font: '900 31px Arial Black, Impact, sans-serif', fill: '#ffffff', strokeWidth: 4 });
    this.drawViewerText(ctx, `PROGRESS ${Math.round(leaderProgress * 100)}%`, infoX + infoW - 34, infoY + 38, { font: '900 29px Arial Black, Impact, sans-serif', fill: '#aefcff', strokeWidth: 4, align: 'right' });
    const progressX = infoX + 34;
    const progressY = infoY + 78;
    const progressW = infoW - 68;
    const progressH = 16;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    this.drawViewerRoundedRect(ctx, progressX, progressY - progressH / 2, progressW, progressH, 8);
    ctx.fill();
    ctx.fillStyle = '#35f2ff';
    this.drawViewerRoundedRect(ctx, progressX, progressY - progressH / 2, Math.max(8, progressW * leaderProgress), progressH, 8);
    ctx.fill();
    this.drawViewerText(ctx, `DISTANCE ${leaderDistance.toFixed(0)} / ${Math.round(this.trackLength || 0)}m`, infoX + infoW / 2, infoY + 102, { font: '800 23px Arial, system-ui, sans-serif', fill: '#ffffff', strokeWidth: 3, align: 'center', maxWidth: infoW - 68 });

    const overlaySummary = {
      enabled: true,
      target: summaryTarget,
      layout: 'vertical',
      canvasSize: `${w}x${h}`,
      liveEventTitle: caption.title,
      liveEventDetail: caption.detail,
      liveStandingCount: ranking.length,
      maxStandingRows: 3,
      channelHandle: CANVAS_VIEWER_OVERLAY.channelHandle,
      ctaPrimary: CANVAS_VIEWER_OVERLAY.ctaPrimary,
      elapsed: Number(this.elapsed.toFixed(2)),
      leaderProgress: Number(leaderProgress.toFixed(3)),
      leaderDistance: Number(leaderDistance.toFixed(1)),
    };
    if (summaryTarget === 'web') this.lastWebViewerOverlaySummary = overlaySummary;
    else this.lastViewerOverlaySummary = overlaySummary;
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
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -16, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    // Disable sleeping for racers: small sustained drive forces can be ignored by sleeping Cannon bodies,
    // which makes marbles look like they lose speed or die out around the middle of long tracks.
    this.world.allowSleep = false;
    this.world.solver.iterations = PERFORMANCE_TUNING.physicsSolverIterations;
    this.marbleMaterial = new CANNON.Material('marble');
    this.trackMaterial = new CANNON.Material('track');
    this.railMaterial = new CANNON.Material('rail');
    this.obstacleMaterial = new CANNON.Material('obstacle');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.marbleMaterial, this.trackMaterial, NO_ROLLING_SLOWDOWN.trackContact));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.marbleMaterial, this.railMaterial, RAIL_REBOUND));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.marbleMaterial, this.obstacleMaterial, NO_ROLLING_SLOWDOWN.obstacleContact));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.marbleMaterial, this.marbleMaterial, NO_ROLLING_SLOWDOWN.marbleContact));
    this.world.addEventListener('postStep', () => { this.physicsSteps += 1; });
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    const unlockAudio = () => this.unlockAudio();
    window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    this.ui.start.addEventListener('click', () => {
      if (this.state === 'ready' || this.state === 'idle') this.startCountdownAndGateOpen();
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
      if (!isTyping && event.key.toLowerCase() === 'v') this.toggleSingleRecording();
      const map = { '1': 'default', '2': 'leadPack', '3': 'selected', '4': 'cinematicLeader', '5': 'orbit' };
      if (map[event.key]) this.cameraMode = map[event.key];
    });
  }

  updateRaceMode() {
    const mode = this.ui.raceMode?.value || 'single';
    if (mode === 'cup') this.startCupMode(Number(this.ui.cupSize?.value) || 12);
    else {
      this.cupMode = { ...this.cupMode, active: false, status: 'idle', stageIndex: 0, currentEntrants: [], results: [], lastQualified: [], champion: null, podium: [] };
      this.hideMatchCard();
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

  updateSpeedPreset() {
    this.speedIndex = clamp(Math.round(Number(this.ui.speed.value) || 0), 0, SPEED_PRESETS.length - 1);
    this.speedPreset = SPEED_PRESETS[this.speedIndex];
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
          return `<label><span>${escapeHtml(metadata.label)}</span><input type="checkbox" data-obstacle-type="${escapeHtml(type)}" data-obstacle-category="${escapeHtml(categoryKey)}" checked /></label>`;
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
    const nextTypes = checkedTypes.length ? checkedTypes : [...PINBALL_OBSTACLE_TYPES];
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
    this.showcaseStats = null;
    this.resetPodiumCeremony();
    this.ui.pause.textContent = 'Pause';
    this.ui.start.textContent = 'Open Gate';
    this.ui.regen.textContent = this.cupMode?.active ? 'Regenerate Cup Track' : 'Generate New Track';
    this.updateSpeedPreset();
    this.updateGuideBias();
    this.updateObstacleDistribution({ regenerateTrack: false });
    this.updateObstacleTypeToggles({ regenerateTrack: false });
    this.updateWidthPreset({ regenerateTrack: false });
    this.updateObstaclePreset({ regenerateTrack: false });
    this.updateCatchupAssist();
    this.updateCurveStyle();
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
      this.updateTrackDebugCode();
      this.refreshStallEliminationPolicy();
      this.buildGuidePointMarkers();
      this.guidePointGroup.visible = this.showGuidePoints;
      this.updateTrackDebugCode();
    }

    const requestedCount = this.cupMode?.active
      ? Math.max(1, this.cupMode.currentEntrants?.length || this.cupMode.size || 12)
      : Math.max(1, Math.floor(Number(this.ui.count.value) || 12));
    if (this.cupMode?.active && this.ui.count) this.ui.count.value = String(requestedCount);
    this.createMarbles(requestedCount);
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

  getObstacleDebugEntries() {
    return this.pinballObstacles.map((obstacle, index) => {
      const progress = this.findClosestProgress(obstacle.center);
      const distance = progress.distance || 0;
      const frame = this.getTrackFrameAt(distance);
      const laneOffset = new THREE.Vector3(obstacle.center.x - frame.p.x, 0, obstacle.center.z - frame.p.z).dot(frame.right);
      const piece = this.trackPieces.find((trackPiece) => distance >= trackPiece.startD && distance <= trackPiece.endD);
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
        progress: this.trackLength ? Number((distance / this.trackLength).toFixed(4)) : 0,
        laneOffset: Number(laneOffset.toFixed(2)),
        radius: Number((obstacle.radius || obstacle.halfLength || obstacle.halfWidth || 0).toFixed(2)),
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
      obstacleIndex: this.obstacleIndex,
      obstacleLabel: this.obstaclePreset?.label,
      obstacleMultiplier: this.obstaclePreset?.multiplier ?? 1,
      obstacleDistributionMode: this.obstacleDistributionMode,
      obstacleDistributionLabel: OBSTACLE_DISTRIBUTION_MODES[this.obstacleDistributionMode]?.label || OBSTACLE_DISTRIBUTION_MODES.random.label,
      obstacleDistributionSummary: this.obstacleDistributionSummary,
      obstaclePlacement: OBSTACLE_PLACEMENT,
      obstacleCategories: OBSTACLE_CATEGORIES,
      obstacleTypeMetadata: PINBALL_OBSTACLE_TYPE_METADATA,
      obstacleCatalog: PINBALL_OBSTACLE_CATALOG,
      enabledObstacleTypes: [...(this.enabledObstacleTypes || new Set(PINBALL_OBSTACLE_TYPES))],
      curveStyleKey: this.curveStyleKey,
      catchupAssistEnabled: this.catchupAssistEnabled,
      catchupAssist: CATCHUP_ASSIST,
      trackWidth: Number((this.trackWidth || 0).toFixed(3)),
      rightAngleTurnCount: this.rightAngleTurnCount,
      modularTrackPieceCounts: {
        straight: this.trackPieces.filter((piece) => piece.type === 'straight').length,
        corner45: this.trackPieces.filter((piece) => Math.abs(piece.turnDegrees) === 45).length,
        corner90: this.trackPieces.filter((piece) => Math.abs(piece.turnDegrees) === 90).length,
      },
      trackPieces: this.trackPieces.map((piece) => ({
        type: piece.type,
        length: Number((piece.length || 0).toFixed(2)),
        turnDegrees: piece.turnDegrees,
        startDistance: Number(((piece.startDistance ?? piece.startD) || 0).toFixed(2)),
        endDistance: Number(((piece.endDistance ?? piece.endD) || 0).toFixed(2)),
      })),
      driveAssist: {
        slopeDrive: this.slopeDrive,
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
    this.trackStats = { ribbonMeshes: 0, visibleDecks: 0, physicsDecks: 0, railTubes: 0, branchJoinDecks: 0, physicalRailBodies: 0, smoothRailJoinBodies: 0, optimizedRailBodies: 0, broadcastStageMarkers: 0 };
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
    this.slopeDrive = SLOPE_DRIVE;
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
    this.marbleData.forEach(({ mesh, body, labelSprite, dropTargetBoostAura }) => {
      this.scene.remove(mesh);
      if (labelSprite) this.scene.remove(labelSprite);
      if (dropTargetBoostAura) this.scene.remove(dropTargetBoostAura);
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

    ctx.font = '900 44px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#050816';
    ctx.lineWidth = 10;
    ctx.strokeText('PRIZE', 256, 438);
    ctx.fillStyle = '#ffe259';
    ctx.fillText('PRIZE', 256, 438);
    return this.finishTexture(canvas, 1, 1);
  }

  createDropTargetBankSignTexture(remainingText = 'W I N') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    this.drawDropTargetBankSign(ctx, remainingText);
    const texture = this.finishTexture(canvas, 1, 1);
    texture.userData = { canvas, ctx, remainingText };
    return texture;
  }

  drawDropTargetBankSign(ctx, remainingText = 'W I N') {
    ctx.clearRect(0, 0, 512, 192);
    ctx.fillStyle = 'rgba(5, 8, 22, 0.92)';
    ctx.beginPath();
    ctx.roundRect(18, 18, 476, 156, 28);
    ctx.fill();
    ctx.strokeStyle = '#ffe259';
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.font = '1000 44px Inter, Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#050816';
    ctx.lineWidth = 10;
    ctx.strokeText('PRIZE', 256, 58);
    ctx.fillStyle = '#ffe259';
    ctx.fillText('PRIZE', 256, 58);
    ctx.font = '1000 62px Impact, Arial Black, sans-serif';
    ctx.strokeStyle = '#050816';
    ctx.lineWidth = 14;
    ctx.strokeText(remainingText, 256, 126);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(remainingText, 256, 126);
  }

  getDropTargetBankSignText(obstacle) {
    const remaining = ['W', 'I', 'N'].filter((label) =>
      !(obstacle.targets || []).some((target) => target.label === label && target.dropped)
    );
    return remaining.length ? remaining.join(' ') : 'CLEAR';
  }

  updateDropTargetBankSignText(obstacle) {
    if (!obstacle?.bankSign?.material?.map?.userData) return;
    const remainingText = this.getDropTargetBankSignText(obstacle);
    const texture = obstacle.bankSign.material.map;
    if (texture.userData.remainingText === remainingText) return;
    this.drawDropTargetBankSign(texture.userData.ctx, remainingText);
    texture.userData.remainingText = remainingText;
    texture.needsUpdate = true;
    obstacle.bankSignText = `PRIZE / ${remainingText}`;
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
    texture.anisotropy = 8;
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

  createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8a552f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let plank = 0; plank < 8; plank += 1) {
      const y = plank * 64;
      const grad = ctx.createLinearGradient(0, y, 512, y + 64);
      grad.addColorStop(0, plank % 2 ? '#7b4827' : '#9a6236');
      grad.addColorStop(0.5, plank % 2 ? '#a96c3d' : '#734323');
      grad.addColorStop(1, plank % 2 ? '#6d3e21' : '#b87945');
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
    texture.anisotropy = 8;
    return texture;
  }

  createPinballPlayfieldTexture() {
    const { canvas, ctx } = this.createTextureCanvas(1024, '#10172a');
    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0, '#10172a');
    grad.addColorStop(0.45, '#252b55');
    grad.addColorStop(1, '#3b1243');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    for (let i = 0; i < 90; i += 1) {
      const x = (i * 137 + 61) % 1024;
      const y = (i * 251 + 97) % 1024;
      const r = 18 + (i % 7) * 8;
      const hue = ['#ff4fa3', '#7cf7d4', '#ffd166', '#9b8cff'][i % 4];
      ctx.strokeStyle = hue;
      ctx.globalAlpha = 0.08 + (i % 3) * 0.025;
      ctx.lineWidth = 4 + (i % 4);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 7;
    for (let x = -220; x < 1220; x += 160) {
      ctx.beginPath();
      ctx.moveTo(x, 1024);
      ctx.bezierCurveTo(x + 90, 720, x + 10, 310, x + 180, 0);
      ctx.stroke();
    }

    ctx.font = 'bold 82px sans-serif';
    ctx.fillStyle = 'rgba(255,209,102,0.18)';
    ctx.textAlign = 'center';
    ctx.fillText('PINBALL', 512, 540);
    return this.finishTexture(canvas, 1, 1);
  }

  createNeonRubberTexture() {
    const { canvas, ctx } = this.createTextureCanvas(512, '#151827');
    for (let y = 0; y < 512; y += 1) {
      const pulse = Math.sin(y * 0.045) * 20;
      ctx.fillStyle = `rgb(${25 + pulse}, ${31 + pulse * 0.4}, ${47 + pulse * 0.8})`;
      ctx.fillRect(0, y, 512, 1);
    }
    ['#ff4fa3', '#7cf7d4', '#ffd166', '#9b8cff'].forEach((color, i) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-40, 70 + i * 98);
      ctx.lineTo(552, 10 + i * 112);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    return this.finishTexture(canvas, 3, 1);
  }

  createTrack() {
    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);
    const presetBase = TRACK_PRESETS[this.trackPresetKey] || TRACK_PRESETS.medium;
    const preset = this.trackPresetKey === 'custom'
      ? { ...presetBase, label: 'Custom', base: this.customTrackLength || this.getCustomTrackLength(), variation: 0 }
      : presetBase;
    this.trackLength = preset.base + Math.floor((this.rng() - 0.5) * preset.variation);
    const widthPreset = this.widthPreset || WIDTH_PRESETS.normal;
    this.trackWidth = widthPreset.min + this.rng() * (widthPreset.max - widthPreset.min);
    this.buildPath(preset);
    this.ui.length.textContent = `${preset.label} ${this.trackLength}m`;

    const bounds = this.getTrackBounds();
    const minTrackY = Math.min(...this.pathPoints.map((p) => p.y));
    const groundY = minTrackY - 3.2;
    this.groundY = groundY;
    this.minTrackY = minTrackY;
    const woodTexture = this.createWoodTexture();
    this.woodGroundMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: woodTexture,
      roughness: 0.82,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds.width + 120, bounds.depth + 140),
      this.woodGroundMaterial
    );
    ground.rotation.x = -Math.PI / 2;
    // 賽道一路向下坡，草地如果固定喺 -0.22 會喺標準/長途中段蓋住路面。
    // 跟住最低路面再低 3.2m，確保任何 preset 都唔會「行到中間無地板」。
    ground.position.set(bounds.cx, groundY, bounds.cz);
    ground.receiveShadow = PERFORMANCE_TUNING.shadows;
    this.trackGroup.add(ground);

    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: this.createPinballPlayfieldTexture(),
      roughness: 0.38,
      metalness: 0.12,
      clearcoat: 0.75,
      clearcoatRoughness: 0.18,
      side: THREE.DoubleSide,
    });
    const railMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: this.createNeonRubberTexture(),
      roughness: 0.3,
      metalness: 0.18,
      clearcoat: 0.8,
      clearcoatRoughness: 0.16,
    });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf7f7ff, roughness: 0.5 });
    const finishMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.3, emissive: 0x443000 });

    this.addTrackRibbon(this.pathPoints, this.trackWidth, floorMat);
    this.addTrackPhysicsRibbon(this.pathPoints, this.trackWidth);
    this.addContinuousRails(this.pathPoints, railMat, this.trackWidth);

    // 分岔路先取消：保留主賽道，避免支路接駁同護欄未穩定時影響比賽。
    this.addStartFinish(stripeMat, finishMat);
    this.addCatchers(railMat, finishMat);
    const enabledTypeCount = this.enabledObstacleTypes?.size ?? PINBALL_OBSTACLE_TYPES.length;
    const obstacleCount = enabledTypeCount > 0
      ? Math.round((this.obstaclePreset?.multiplier ?? 0) * Math.max(4, Math.floor(this.trackLength / 55)))
      : 0;
    this.createObstacles(obstacleCount);
    this.createDecorations();
  }

  buildPath(preset) {
    const step = Math.min(1.2, preset.segment);
    const slopeDropPerMeter = this.slopeDrive?.dropPerMeter ?? 0.118;
    const startHeight = Math.max(14, Math.min(42, this.trackLength * slopeDropPerMeter + 5.5));
    const widthPreset = this.widthPreset || WIDTH_PRESETS.normal;
    const minWidth = Math.max(widthPreset.absoluteMin, this.trackWidth * widthPreset.minFactor);
    const narrowSections = Array.from({ length: Math.max(2, Math.floor(this.trackLength / 85)) }, () => ({
      center: 28 + this.rng() * Math.max(24, this.trackLength - 56),
      length: 14 + this.rng() * 28,
      strength: 0.18 + this.rng() * 0.32,
    }));
    const widthAt = (d) => {
      const baseWave = 1 - 0.1 * (Math.sin(d * 0.035 + 0.7) + 1) / 2;
      const factor = narrowSections.reduce((value, section) => {
        const t = clamp(1 - Math.abs(d - section.center) / section.length, 0, 1);
        return value - section.strength * (t * t * (3 - 2 * t));
      }, baseWave);
      return clamp(this.trackWidth * factor, minWidth, this.trackWidth);
    };

    const addPiece = (pieces, type, length, turnDegrees = 0) => {
      pieces.push({ type, length, turnDegrees, angleRadians: THREE.MathUtils.degToRad(turnDegrees) });
    };
    const modularPieces = [];
    addPiece(modularPieces, 'straight', 16 + this.rng() * 8, 0);
    const targetLength = this.trackLength;
    let plannedLength = modularPieces.reduce((sum, piece) => sum + piece.length, 0);
    let previousTurn = this.rng() < 0.5 ? -1 : 1;
    let safety = 0;
    while (plannedLength < targetLength - 18 && safety < 40) {
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
    addPiece(modularPieces, 'straight', Math.max(12, targetLength - plannedLength), 0);

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
        const slopeJitter = (this.rng() - 0.5) * (this.slopeDrive?.undulationAmplitude ?? 0.035);
        const startRampRatio = START_RAMP.enabled ? clamp(1 - prevD / Math.max(START_RAMP.length, 0.001), 0, 1) : 0;
        const rightAngleRatio = RIGHT_ANGLE_CORNER_SLOPE.enabled && Math.abs(piece.turnDegrees) === 90
          ? (localT < 0.22 ? localT / 0.22 : (localT > 0.78 ? (1 - localT) / 0.22 : 1))
          : 0;
        const nearConsecutiveRightAngle = RIGHT_ANGLE_CORNER_SLOPE.enabled && Math.abs(piece.turnDegrees) === 90 && (
          Math.abs(modularPieces[index - 1]?.turnDegrees || 0) === 90 || Math.abs(modularPieces[index + 1]?.turnDegrees || 0) === 90
        );
        const rightAngleExtraDrop = rightAngleRatio * (
          RIGHT_ANGLE_CORNER_SLOPE.extraDropPerMeter
          + (nearConsecutiveRightAngle ? RIGHT_ANGLE_CORNER_SLOPE.consecutiveExtraDropPerMeter : 0)
        );
        const transitionExtraDrop = RIGHT_ANGLE_CORNER_SLOPE.enabled && Math.abs(piece.turnDegrees) !== 90 && (
          Math.abs(modularPieces[index - 1]?.turnDegrees || 0) === 90 || Math.abs(modularPieces[index + 1]?.turnDegrees || 0) === 90
        ) ? RIGHT_ANGLE_CORNER_SLOPE.transitionExtraDropPerMeter : 0;
        const segmentDropPerMeter = Math.max(
          this.slopeDrive?.minSegmentDropPerMeter ?? 0.086,
          slopeDropPerMeter + slopeJitter + startRampRatio * START_RAMP.extraDropPerMeter + rightAngleExtraDrop + transitionExtraDrop
        );
        y -= deltaD * segmentDropPerMeter;
        pathPoints.push({ x, y, z, d, w: widthAt(d), pieceType: piece.type, heading, segmentDropPerMeter, startRampRatio, rightAngleRatio, rightAngleExtraDrop, transitionExtraDrop });
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
        startHeading,
        endHeading: heading,
      });
    });

    this.pathPoints = pathPoints;
    this.trackLength = pathPoints[pathPoints.length - 1].d;
    const rightAngleTurns = pieceMetadata.filter((piece) => Math.abs(piece.turnDegrees) === 90);
    const fortyFiveTurns = pieceMetadata.filter((piece) => Math.abs(piece.turnDegrees) === 45);
    const straightPieces = pieceMetadata.filter((piece) => piece.type === 'straight');
    const rightAngleSlopePanels = pathPoints.filter((point) => (point.rightAngleExtraDrop || 0) > 0);
    const consecutiveRightAngleSections = rightAngleTurns.filter((piece) => {
      const before = pieceMetadata[piece.index - 1];
      const after = pieceMetadata[piece.index + 1];
      return Math.abs(before?.turnDegrees || 0) === 90 || Math.abs(after?.turnDegrees || 0) === 90;
    });
    this.trackPieceSystem = 'modular-pieces';
    this.trackPieces = pieceMetadata;
    this.rightAngleTurnCount = rightAngleTurns.length;
    this.rightAngleTurns = rightAngleTurns;
    this.hairpinTurnCount = rightAngleTurns.length;
    this.hairpinTurns = rightAngleTurns;
    this.trackSlope = {
      enabled: true,
      slopeDriveModel: this.slopeDrive?.model,
      startHeight,
      dropPerMeter: slopeDropPerMeter,
      minSegmentDropPerMeter: this.slopeDrive?.minSegmentDropPerMeter,
      finishHeight: pathPoints[pathPoints.length - 1].y,
      totalDrop: startHeight - pathPoints[pathPoints.length - 1].y,
      everyPanelDownhill: pathPoints.every((point, index) => index === 0 || point.y < pathPoints[index - 1].y),
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
      generatedBy: 'monotonic-per-segment-downhill-panels-with-extra-90-degree-corner-pitch',
    };
    this.trackWidthProfile = {
      preset: this.widthPresetKey,
      label: widthPreset.label,
      baseWidth: this.trackWidth,
      minWidth,
      narrowSections,
      generationMode: 'modular-pieces',
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

  addTrackRibbon(points, width, material) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];
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
        uvs.push(side < 0 ? 0 : 1, point.d / 12);
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
    mesh.userData = {
      ...(mesh.userData || {}),
      cameraOccluder: true,
      cameraOccluderType: 'track-ribbon',
      cameraOccluderDistanceStart: points[0]?.d ?? 0,
      cameraOccluderDistanceEnd: points[points.length - 1]?.d ?? this.trackLength,
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
        Math.max(48, Math.floor(renderPoints.length * PERFORMANCE_TUNING.railTubeSegmentMultiplier)),
        railRadius,
        PERFORMANCE_TUNING.railTubeRadialSegments,
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
        Math.max(48, Math.floor(renderPoints.length * PERFORMANCE_TUNING.railTubeSegmentMultiplier)),
        0.1,
        PERFORMANCE_TUNING.lowerRailTubeRadialSegments,
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
    const sampleStep = PERFORMANCE_TUNING.railTubeSampleStep;
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
    const wallHeight = 1.12;
    const wallThickness = 0.98;
    const wallBaseOffset = -0.06;
    const railCenterOffset = 0.58;
    const targetBodyBudget = this.performanceProfile?.maxPhysicalRailBodies || 520;
    const budgetInterval = this.trackLength > 0 ? (this.trackLength * 2) / targetBodyBudget : 1.65;
    const interval = clamp(
      Math.max(this.performanceProfile?.guardRailInterval || 1.65, budgetInterval),
      1.35,
      2.45
    );
    const overlap = this.performanceProfile?.guardRailOverlap || 3.35;
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
          userData: { type: 'guard-rail', railSide: side, railSampleDistance: Number(d.toFixed(2)) },
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
    this.trackStats.physicalRailEscapeStyle = 'thicker-low-side-lip-catches-fast-cornering-marbles-but-allows-clear-jumps';
    this.trackStats.physicalRailBodyBudget = targetBodyBudget;
    this.trackStats.railOptimization = 'denser-thicker-overlapped-side-lip-bodies';
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
    body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, thickness / 2, (length + extraLength) / 2)));
    body.position.copy(center);
    body.quaternion.setFromEuler(pitch, yaw, 0, 'YXZ');
    if (options.userData) body.userData = { ...(body.userData || {}), ...options.userData };
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
    this.addLinePlate(start, startNext, stripeMat, this.trackWidth + 1.4, 1.0);
    // 終點線改幼身，唔再似一大塊厚板蓋住尾段賽道。
    this.addLinePlate(finish, finishPrev, finishMat, this.trackWidth + 1.0, 0.7);
  }

  addLinePlate(p, forwardPoint, mat, width, length) {
    const dx = forwardPoint.x - p.x;
    const dz = forwardPoint.z - p.z;
    const yaw = Math.atan2(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.045, length), mat);
    mesh.position.set(p.x, p.y + 0.1, p.z);
    mesh.rotation.y = yaw;
    mesh.receiveShadow = PERFORMANCE_TUNING.shadows;
    this.trackGroup.add(mesh);
  }

  addCatchers(railMat, finishMat) {
    const startFrame = this.getTrackFrameAt(0);
    const finishFrame = this.getTrackFrameAt(this.trackLength);
    this.startCatcher = this.addStartingChute({
      frame: startFrame,
      railMat,
      accentMat: new THREE.MeshStandardMaterial({ color: 0x7cf7d4, roughness: 0.32, emissive: 0x00382f, emissiveIntensity: 0.45 }),
      labelColor: 0x7cf7d4,
    });
    // No start apron/bridge here: even an invisible physics bridge can block the marbles after the gate opens.
    // START_CHUTE now connects directly to the track entrance; the gate is the only removable blocker.
    this.startGate = this.addStartingGate(startFrame, railMat);
    this.finishCatcher = this.addRankingCollector({
      frame: finishFrame,
      width: this.trackWidth + 12,
      racerCount: Math.max(1, Math.floor(Number(this.ui.count.value) || 12)),
      mat: railMat,
      accentMat: finishMat,
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
    const width = this.trackWidth + START_GATE_DESIGN.chuteWidthPadding;
    const depth = START_GATE_DESIGN.chuteDepth;
    const center = this.getStartPrepTrayCenter(frame);
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = yaw;
    this.trackGroup.add(group);

    const transparentStartVisuals = Boolean(START_GATE_DESIGN.transparentVisuals);
    const floorMat = transparentStartVisuals
      ? makeStartTransparentMaterial(accentMat, START_GATE_DESIGN.startFloorOpacity)
      : accentMat;
    const railVisualMat = transparentStartVisuals
      ? makeStartTransparentMaterial(railMat, START_GATE_DESIGN.startRailOpacity)
      : railMat;
    const markingMat = (color, emissive, opacity = START_GATE_DESIGN.startMarkingOpacity) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.24, emissive, emissiveIntensity: 0.28 });
      return transparentStartVisuals ? makeStartTransparentMaterial(material, opacity) : material;
    };

    const drop = (START_RAMP.prepTrayBackOffset - START_RAMP.prepTrayFrontOffset) * START_RAMP.prepTrayDropPerMeter;
    const pitch = Math.atan2(drop, depth);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.20, depth), floorMat);
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

    if (START_GATE_DESIGN.surroundingWallsEnabled) {
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
    for (let i = 0; i <= stallCount; i += 1) {
      const isOuterLaneBoard = i === 0 || i === stallCount;
      const x = -gateWidth / 2 + i * laneGap;
      const railHeight = isOuterLaneBoard ? Math.max(START_GATE_DESIGN.laneRailHeight, 1.05) : START_GATE_DESIGN.laneRailHeight;
      const railThickness = isOuterLaneBoard ? Math.max(START_GATE_DESIGN.laneRailThickness, 0.18) : START_GATE_DESIGN.laneRailThickness;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(railThickness, railHeight, depth - 1.2), railVisualMat);
      rail.name = isOuterLaneBoard ? `START_OUTER_LANE_BOARD_${i === 0 ? 'LEFT' : 'RIGHT'}` : `START_LANE_DIVIDER_${i}`;
      rail.position.set(x, railHeight / 2 + 0.08, -0.25);
      rail.rotation.x = pitch;
      rail.castShadow = PERFORMANCE_TUNING.shadows;
      rail.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(rail);
      const body = new CANNON.Body({ mass: 0, material: this.railMaterial || this.obstacleMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(railThickness / 2, railHeight / 2, (depth - 1.2) / 2)));
      body.position.copy(center.clone().add(this.localToWorldOffset(x, railHeight / 2 + 0.08, -0.25, yaw)));
      body.quaternion.setFromEuler(pitch, yaw, 0, 'YXZ');
      body.userData = { name: rail.name, startLaneBoard: true, outerLaneBoard: isOuterLaneBoard };
      this.world.addBody(body);
      this.trackBodies.push(body);
    }

    const gateLine = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.075, 0.34), markingMat(labelColor, labelColor, START_GATE_DESIGN.startMarkingOpacity));
    gateLine.position.set(0, 0.11, depth / 2 - 0.62);
    gateLine.rotation.x = pitch;
    group.add(gateLine);

    const startText = new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, 0.08, 0.5), markingMat(0xffffff, 0x153a34, START_GATE_DESIGN.startMarkingOpacity));
    startText.position.set(0, 0.16, -depth * 0.16);
    startText.rotation.x = pitch;
    group.add(startText);

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
    };
  }

  getStartPrepTrayCenter(frame) {
    const back = START_RAMP.prepTrayBackOffset;
    const front = START_RAMP.prepTrayFrontOffset;
    const offset = -(back + front) / 2;
    const heightAtCenter = ((back - front) / 2) * START_RAMP.prepTrayDropPerMeter;
    return new THREE.Vector3(frame.p.x, frame.p.y + 0.18 + heightAtCenter, frame.p.z)
      .add(frame.tangent.clone().multiplyScalar(offset));
  }

  getStartPrepLocalZForBack(backDistance) {
    const back = START_RAMP.prepTrayBackOffset;
    const front = START_RAMP.prepTrayFrontOffset;
    return ((back + front) / 2) - backDistance;
  }

  getStartPrepSurfaceY(frame, backDistance) {
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

    const gateMat = makeStartTransparentMaterial(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.38, metalness: 0.55 }),
      START_GATE_DESIGN.startGateOpacity
    );
    const barMat = makeStartTransparentMaterial(
      new THREE.MeshStandardMaterial({ color: 0x7cf7d4, roughness: 0.24, metalness: 0.28, emissive: 0x00483d, emissiveIntensity: 0.42 }),
      START_GATE_DESIGN.startGateOpacity
    );
    const warningMat = makeStartTransparentMaterial(
      new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.3, metalness: 0.15, emissive: 0x3d2500, emissiveIntensity: 0.28 }),
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

  addRankingCollector({ frame, width, racerCount, mat, accentMat }) {
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const slotGap = 1.45;
    const lowerCount = Math.max(0, racerCount - 3);
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
    const podiumSpecs = [
      { rank: 1, x: 0, z: -0.6, height: 1.28, color: podiumColors[0], label: '1' },
      { rank: 2, x: -1.65, z: 0.05, height: 0.88, color: podiumColors[1], label: '2' },
      { rank: 3, x: 1.65, z: 0.35, height: 0.64, color: podiumColors[2], label: '3' },
    ];
    podiumSpecs.forEach((spec) => {
      const blockMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.25, metalness: 0.38, emissive: spec.color, emissiveIntensity: 0.12 });
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.32, spec.height, 1.32), blockMat);
      block.position.set(spec.x, spec.height / 2 - 0.02, spec.z);
      block.castShadow = PERFORMANCE_TUNING.shadows;
      block.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(block);
      const label = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.42), accentMat);
      label.position.set(spec.x, spec.height + 0.05, spec.z - 0.36);
      group.add(label);
    });

    const lowerSlotMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.08 });
    for (let i = 3; i < racerCount; i += 1) {
      const lowerIndex = i - 3;
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
      name: 'PODIUM_COLLECTOR',
      podiumStyle: 'top-3-on-podium-rest-below',
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

  addStaticBox(position, halfExtents, yaw, material) {
    const body = new CANNON.Body({ mass: 0, material });
    body.addShape(new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z)));
    body.position.copy(position);
    body.quaternion.setFromEuler(0, yaw, 0);
    this.world.addBody(body);
    this.trackBodies.push(body);
    return body;
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

  findClosestProgress(position) {
    let best = this.trackSamples[0];
    let bestDist = Infinity;
    for (const sample of this.trackSamples) {
      const dx = position.x - sample.x;
      const dz = position.z - sample.z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) { bestDist = dist; best = sample; }
    }
    return { distance: best.d, point: best, lateralSq: bestDist };
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
      dropTarget: new THREE.MeshPhysicalMaterial({ color: 0xff8f3f, roughness: 0.17, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x5a1900, emissiveIntensity: 0.36 }),
      rubber: new THREE.MeshPhysicalMaterial({ color: 0x101422, roughness: 0.32, metalness: 0.02, clearcoat: 0.45, clearcoatRoughness: 0.18, emissive: 0x061020, emissiveIntensity: 0.26 }),
      chrome: new THREE.MeshPhysicalMaterial({ color: 0xe6f2ff, roughness: 0.12, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.04 }),
      yellowInsert: new THREE.MeshPhysicalMaterial({ color: 0xffd166, roughness: 0.18, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0x7a4a00, emissiveIntensity: 0.42 }),
      redInsert: new THREE.MeshPhysicalMaterial({ color: 0xff3864, roughness: 0.18, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0x79001c, emissiveIntensity: 0.44 }),
    };

    const enabledTypes = (this.enabledObstacleTypes?.size ? [...this.enabledObstacleTypes] : [...PINBALL_OBSTACLE_TYPES])
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
      const obstacle = this.createPinballObstacle(type, frame, lane, localWidth, palette);
      const category = PINBALL_OBSTACLE_TYPE_METADATA[type]?.category || 'normal';
      if (obstacle) {
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
    const gaps = distances.slice(1).map((distance, index) => distance - distances[index]);
    const minObservedGap = gaps.length ? Math.min(...gaps) : null;
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
      startPadding: OBSTACLE_PLACEMENT.startPaddingMeters,
      finishPadding: OBSTACLE_PLACEMENT.finishPaddingMeters,
      minObservedGap: minObservedGap == null ? null : Number(minObservedGap.toFixed(2)),
      minObservedZoneGap: Number.isFinite(minObservedZoneGap) ? Number(minObservedZoneGap.toFixed(2)) : null,
      sampleDistances: distances.slice(0, 20).map((distance) => Number(distance.toFixed(2))),
      label: OBSTACLE_PLACEMENT.label,
    };
  }

  buildObstacleDistributionZones(enabledTypes) {
    const usableStart = OBSTACLE_PLACEMENT.startPaddingMeters;
    const usableEnd = Math.max(usableStart + 8, this.trackLength - OBSTACLE_PLACEMENT.finishPaddingMeters);
    const usableLength = Math.max(1, usableEnd - usableStart);
    const maxZonesByLength = Math.max(1, Math.floor(usableLength / (OBSTACLE_DISTRIBUTION_MODES.zoned.minZoneMeters || 70)));
    const zoneCount = Math.max(1, Math.min(enabledTypes.length, maxZonesByLength));
    return Array.from({ length: zoneCount }, (_, index) => {
      const start = usableStart + (usableLength * index) / zoneCount;
      const end = usableStart + (usableLength * (index + 1)) / zoneCount;
      return { index, start, end, type: enabledTypes[index % enabledTypes.length] };
    });
  }

  getObstaclePlacementMinSpacing(count, minD = OBSTACLE_PLACEMENT.startPaddingMeters, maxD = Math.max(minD + 0.5, this.trackLength - OBSTACLE_PLACEMENT.finishPaddingMeters)) {
    const usableLength = Math.max(0.5, maxD - minD);
    const requested = Number(OBSTACLE_PLACEMENT.minSpacingMeters) || 8;
    const floor = Number(OBSTACLE_PLACEMENT.minSpacingFloorMeters) || 4;
    const maxEvenSpacing = count > 1 ? usableLength / (count - 1) : requested;
    return clamp(Math.min(requested, maxEvenSpacing * 0.92), Math.min(floor, maxEvenSpacing), requested);
  }

  applyObstaclePlacementSpacing(placements, { minD = OBSTACLE_PLACEMENT.startPaddingMeters, maxD = Math.max(minD + 0.5, this.trackLength - OBSTACLE_PLACEMENT.finishPaddingMeters), minSpacing = null } = {}) {
    if (!placements.length) return placements;
    const spacing = minSpacing ?? this.getObstaclePlacementMinSpacing(placements.length, minD, maxD);
    const sorted = placements
      .map((placement, index) => ({ ...placement, originalIndex: index, distance: clamp(placement.distance, minD, maxD) }))
      .sort((a, b) => a.distance - b.distance);
    const span = Math.max(0.5, maxD - minD);
    let cursor = minD;
    sorted.forEach((placement, sortedIndex) => {
      const remaining = sorted.length - sortedIndex - 1;
      const upper = maxD - spacing * Math.max(0, remaining);
      const relaxed = clamp(placement.distance, cursor, Math.max(cursor, upper));
      placement.distance = clamp(relaxed, minD, maxD);
      cursor = Math.min(maxD, placement.distance + spacing);
    });
    if (sorted.length > 1 && sorted[sorted.length - 1].distance > maxD) {
      const overflow = sorted[sorted.length - 1].distance - maxD;
      sorted.forEach((placement) => { placement.distance -= overflow; });
    }
    const minGap = sorted.length > 1
      ? sorted.slice(1).reduce((gap, placement, index) => Math.min(gap, placement.distance - sorted[index].distance), Infinity)
      : null;
    this.obstaclePlacementSpacingState = {
      configuredMinSpacing: OBSTACLE_PLACEMENT.minSpacingMeters,
      appliedMinSpacing: Number(spacing.toFixed(2)),
      minObservedGap: minGap == null || !Number.isFinite(minGap) ? null : Number(minGap.toFixed(2)),
      startPadding: OBSTACLE_PLACEMENT.startPaddingMeters,
      finishPadding: OBSTACLE_PLACEMENT.finishPaddingMeters,
      placementCount: sorted.length,
      usableSpan: Number(span.toFixed(2)),
      relaxed: true,
      label: OBSTACLE_PLACEMENT.label,
    };
    return sorted.sort((a, b) => a.originalIndex - b.originalIndex).map(({ originalIndex, ...placement }) => placement);
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
      return Array.from({ length: count }, (_, i) => {
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
    }
    const minD = OBSTACLE_PLACEMENT.startPaddingMeters;
    const maxD = Math.max(minD + 0.5, this.trackLength - OBSTACLE_PLACEMENT.finishPaddingMeters);
    const placements = Array.from({ length: count }, () => ({
      type: enabledTypes[Math.floor(this.rng() * enabledTypes.length)] || enabledTypes[0],
      distance: minD + this.rng() * Math.max(0.5, maxD - minD),
      zoneIndex: null,
      zoneStart: null,
      zoneEnd: null,
    }));
    return this.applyObstaclePlacementSpacing(placements, { minD, maxD });
  }

  createPinballObstacle(type, frame, lane, localWidth, palette) {
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

    const signTexture = this.createDropTargetBankSignTexture('W I N');
    const bankSign = new THREE.Sprite(new THREE.SpriteMaterial({
      map: signTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }));
    bankSign.position.set(0, signY, signZ);
    bankSign.scale.set(signScaleX, signScaleY, 1);
    bankSign.renderOrder = 45;
    group.add(bankSign);
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
      bankSign,
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
        signScaleX,
        signScaleY,
      },
      trackSlopePitch: pitch,
      trackYaw: yaw,
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
      bankSignText: 'PRIZE / W I N',
    };
    this.pinballObstacles.push(obstacle);
    return obstacle;
  }

  updatePinballObstacles(delta) {
    if (!this.pinballObstacles.length) return;
    this.pinballObstacles.forEach((obstacle) => {
      if (obstacle.type === 'spinnerGate') {
        obstacle.spinAngle = (obstacle.spinAngle || 0) + delta * obstacle.spinnerSpeed;
        obstacle.spinnerArms?.forEach((arm, index) => {
          arm.rotation.y = obstacle.spinAngle + (Math.PI * 2 * index) / 3;
        });
      }
      if (obstacle.type === 'dropTarget') {
        this.updateDropTargetBank(obstacle, delta);
      }
      if (obstacle.type === 'gongBumper') {
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
      if (obstacle.bankSign?.material) {
        obstacle.bankSign.material.opacity = obstacle.bankCleared ? 0.58 : 0.96;
      }
      if (obstacle.pulse) {
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
      }
      this.marbleData.forEach((data) => {
        if (data.finished) return;
        const lastHit = obstacle.cooldown?.get(data.id) || -Infinity;
        if (this.elapsed - lastHit < 0.32) return;
        const dx = data.body.position.x - obstacle.center.x;
        const dz = data.body.position.z - obstacle.center.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > obstacle.radius * obstacle.radius) return;
        if (obstacle.type === 'popBumper') this.applyPopBumperImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'pinBumper') this.applyPinBumperImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'gongBumper') this.applyGongBumperImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'slingshot') this.applySlingshotImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'spinnerGate') this.applySpinnerGateImpulse(obstacle, data, dx, dz);
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

    this.updateDropTargetBankSignText(obstacle);

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
    this.updateDropTargetBankSignText(obstacle);
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
    const targetText = obstacle?.bankSignText || 'PRIZE / CLEAR';
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
      if (!data.dropTargetBoostAura) return;
      const active = Boolean(data.dropTargetBoostActive);
      data.dropTargetBoostAura.visible = active;
      data.dropTargetBoostAuraVisible = active;
      if (!active) return;
      data.dropTargetBoostAura.position.copy(data.mesh?.position || data.body.position);
      const remaining = Math.max(0, (data.dropTargetBoostUntil ?? this.elapsed) - this.elapsed);
      const pulse = 1 + Math.sin((this.elapsed + data.id * 0.17) * 14) * 0.08;
      data.dropTargetBoostAura.scale.setScalar(pulse);
      if (data.dropTargetBoostAura.material) {
        data.dropTargetBoostAura.material.opacity = Math.max(0.08, (DROP_TARGET_FINAL_BOOST.auraOpacity || 0.36) * Math.min(1, remaining / 0.75));
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
      if (!PERFORMANCE_TUNING.disableDecorativePointLights) {
        const light = new THREE.PointLight(index === 2 ? 0xffd166 : 0x7cf7d4, 0.65, 18);
        light.position.set(pos.x, pos.y + 2.4, pos.z);
        this.trackGroup.add(light);
      }
    });
    this.trackStats.broadcastStageMarkers = sectors.length;
  }

  createMarbleTrail(color, radius) {
    const points = Array.from({ length: PERFORMANCE_TUNING.trailPoints }, () => new THREE.Vector3(0, -1000, 0));
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
      sampleEvery: PERFORMANCE_TUNING.trailSampleEvery,
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

  updateMarbleNameLabels() {
    const labelsAllowed = !MARBLE_LABEL_POLICY.showOnlyAfterRaceStart
      || this.state === 'running'
      || this.state === 'finished';
    const topLabelIds = new Set(
      labelsAllowed
        ? this.getRanking({ force: true })
          .slice(0, Math.max(0, MARBLE_LABEL_POLICY.visibleTopRankCount ?? 5))
          .map((data) => data.id)
        : []
    );
    this.visibleLabelCount = 0;
    this.marbleData.forEach((data) => {
      if (!data.labelSprite) return;
      data.labelSprite.position.copy(data.mesh.position).add(new THREE.Vector3(0, data.radius + 0.72, 0));
      const cameraDistance = data.labelSprite.position.distanceTo(this.camera.position);
      const targetScale = clamp(cameraDistance * 0.035, 0.62, 1.25);
      const previousBaseScale = Number.isFinite(data.labelBaseScale) ? data.labelBaseScale : targetScale;
      const smoothing = clamp(this.performanceProfile?.nameLabelScaleSmoothing ?? PERFORMANCE_TUNING.nameLabelScaleSmoothing ?? 0.18, 0, 1);
      const scale = previousBaseScale + (targetScale - previousBaseScale) * smoothing;
      data.labelBaseScale = scale;
      data.labelSprite.scale.set(scale * 3.8, scale * 0.95, 1);
      const fallLabelAllowed = !data.pendingFallRespawn
        || this.elapsed - (data.pendingFallRespawn.detectedAt ?? this.elapsed) < MARBLE_LABEL_POLICY.hidePendingFallAfterSeconds;
      const renderAllLabels = false;
      const visible = (renderAllLabels || topLabelIds.has(data.id)) && fallLabelAllowed && labelsAllowed;
      data.labelSprite.visible = visible;
      data.labelVisible = visible;
      if (visible) this.visibleLabelCount += 1;
    });
  }

  clearSpectacleEffects({ clearTrails = true } = {}) {
    this.spectacleEffects?.forEach((effect) => {
      effect.meshes?.forEach((mesh) => this.scene?.remove(mesh));
      if (effect.mesh) this.scene?.remove(effect.mesh);
    });
    this.spectacleEffects = [];
    this.confettiPieces?.forEach((piece) => this.scene?.remove(piece.mesh));
    this.confettiPieces = [];
    if (clearTrails) {
      this.marbleData?.forEach((data) => {
        if (data.trail?.line) this.scene?.remove(data.trail.line);
        data.trail = null;
      });
    }
  }

  spawnImpactEffect(position, color = 0x7cf7d4, kind = 'ring') {
    if (this.spectacleEffects.length >= PERFORMANCE_TUNING.maxSpectacleEffects) return;
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
    });
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
      this.defaultCameraPhaseUntil = Math.max(this.defaultCameraPhaseUntil || 0, this.elapsed + 3.2);
      this.triggerFinishSlowMotion(leader, { reason: 'pre-finish-window', crossed: false });
    }
  }

  spawnFinishConfetti(origin, count = 42, { cannon = false } = {}) {
    const colors = [0xffd166, 0xff77b7, 0x7cf7d4, 0xffffff, 0x8cff66, 0x66a6ff];
    const finishFrame = this.getTrackFrameAt?.(this.trackLength);
    const cannonOffsets = cannon && finishFrame
      ? [
        finishFrame.right.clone().multiplyScalar(-3.6).add(new THREE.Vector3(0, 0.5, 0)),
        finishFrame.right.clone().multiplyScalar(3.6).add(new THREE.Vector3(0, 0.5, 0)),
        finishFrame.tangent.clone().multiplyScalar(-1.3).add(new THREE.Vector3(0, 1.1, 0)),
      ]
      : [new THREE.Vector3()];
    for (let i = 0; i < count; i += 1) {
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
    const cupStage = this.cupMode?.active ? this.getCupStage() : null;
    const showcaseTitle = this.cupMode?.active
      ? (cupStage === 'final' ? '🏆 Cup Champion Ceremony' : '✅ Qualified')
      : '🏁 Group Winner';
    const showcaseHint = this.cupMode?.active
      ? (cupStage === 'final' ? 'Cup Champion' : `${this.getCupStageTitle(cupStage)} qualifiers locked in`)
      : 'Group winner locked in';
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
      const top3 = ranking.slice(0, 3).map((data, index) => `<li class="podium-medalist rank-${index + 1}"><strong>${medals[index]} #${index + 1}</strong> <span class="showcase-racer-name" data-marble-id="${data.id}" title="Double-click to copy reusable marble identity" style="--medal-color:${data.colorHex}">${data.name}</span> <span>${data.finishTime?.toFixed(2) ?? '--'}s</span></li>`).join('');
      this.ui.finalShowcase.innerHTML = `<h2>${showcaseTitle}</h2><p class="copy-hint">${showcaseHint}</p><ol class="podium-list">${top3}</ol><p>Best comeback: <strong>${this.showcaseStats.comeback || '—'}</strong></p><p>Pinball hits: <strong>${this.showcaseStats.totalPinballHits}</strong></p>`;
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
    const laneCount = Math.max(1, this.startCatcher?.laneCount || Math.min(fallbackLayout.stallCount, requestedCols));
    const gateWidth = this.startCatcher?.gateWidth || fallbackLayout.gateWidth;
    const laneGap = Math.max(1.05, gateWidth / Math.max(1, laneCount));
    const cols = laneCount;
    const chuteDepth = this.startCatcher?.depth || START_GATE_DESIGN.chuteDepth;
    const highCountStaging = START_GATE_DESIGN.highCountStaging || {};
    const maxRowsInsideChute = highCountStaging.enabled === false
      ? Infinity
      : Math.max(1, Math.floor(highCountStaging.maxRowsBeforeHoldingPattern ?? 3));
    const laneRowSpacing = Math.max(1.12, Math.min(laneGap * 0.92, highCountStaging.rowSpacing ?? 1.18));
    const gateLocalZ = this.getStartPrepLocalZForBack(START_GATE_DESIGN.gateBackDistance);
    const safeChuteBackLocalZ = -chuteDepth / 2 + 0.7;
    const safeChuteFrontLocalZ = gateLocalZ - 0.55;
    const laneFrontLocalZ = clamp(gateLocalZ - 0.75, safeChuteBackLocalZ, safeChuteFrontLocalZ);
    const laneBackLocalZ = Math.max(safeChuteBackLocalZ, laneFrontLocalZ - (maxRowsInsideChute - 1) * laneRowSpacing);
    const holdingPatternCols = laneCount;
    const holdingPatternLateralSpacing = laneGap;
    const holdingPatternDepthGap = Math.max(1.05, highCountStaging.holdingPatternDepthGap ?? 1.18);
    const holdingPatternStartLocalZ = Math.max(safeChuteBackLocalZ, laneBackLocalZ - holdingPatternDepthGap);
    this.startStagingLayout = {
      count,
      laneCount,
      gateWidth,
      laneGap,
      maxRowsInsideChute,
      laneRowSpacing,
      holdingPatternCols,
      holdingPatternStartLocalZ,
      holdingPatternLateralSpacing,
      holdingPatternDepthGap,
      mode: count > cols * maxRowsInsideChute ? 'lane-plus-holding-grid' : 'lane-grid',
    };
    this.ui.select.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const identity = this.cupMode?.active && this.cupMode.currentEntrants?.[i]
        ? this.cupMode.currentEntrants[i]
        : this.createMarbleIdentity(i, count);
      const { color, radius } = identity;
      const mesh = this.makeMarbleMesh(radius, color, i, identity.patternKey, identity.palette, identity.materialKey);
      const labelSprite = this.createMarbleNameLabel(identity.name);
      const col = i % cols;
      const row = Math.floor(i / cols);
      let lane = (col - (cols - 1) / 2) * laneGap;
      let localZ;
      let localY;
      let stagingMode = 'lane-grid';
      if (row < maxRowsInsideChute) {
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
        mass: 1.1 + (i % 4) * 0.04,
        material: this.marbleMaterial,
        linearDamping: NO_ROLLING_SLOWDOWN.marbleLinearDamping,
        angularDamping: NO_ROLLING_SLOWDOWN.marbleAngularDamping,
      });
      body.allowSleep = false;
      body.sleepState = CANNON.Body.AWAKE;
      body.addShape(new CANNON.Sphere(radius));
      body.position.copy(mesh.position);
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.linearDamping = NO_ROLLING_SLOWDOWN.marbleLinearDamping;
      body.angularDamping = NO_ROLLING_SLOWDOWN.marbleAngularDamping;
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
        materialKey: identity.materialKey,
        materialName: identity.materialName,
        patternKey: identity.patternKey,
        patternName: identity.patternName,
        sizeKey: identity.sizeKey,
        sizeName: identity.sizeName,
        radius,
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
    const colorStyle = MARBLE_COLOR_STYLES[index % MARBLE_COLOR_STYLES.length];
    const patternStyle = MARBLE_PATTERN_STYLES[Math.floor(index / MARBLE_COLOR_STYLES.length) % MARBLE_PATTERN_STYLES.length];
    const sizeStyle = MARBLE_SIZE_STYLES[index % MARBLE_SIZE_STYLES.length];
    const materialKey = colorStyle.material || 'glass';
    const materialStyle = MARBLE_MATERIAL_STYLES[materialKey] || MARBLE_MATERIAL_STYLES.glass;
    const paletteHex = colorStyle.palette?.length ? colorStyle.palette : [colorStyle.hex];
    const palette = paletteHex.map((hex) => Number.parseInt(hex.replace('#', ''), 16));
    const codeNumber = String(index + 1).padStart(Math.max(2, String(count).length), '0');
    const code = `MB-${codeNumber}-${colorStyle.hex.slice(1, 4).toUpperCase()}-${patternStyle.key.slice(0, 3).toUpperCase()}-${materialKey.slice(0, 3).toUpperCase()}-${sizeStyle.key}`;
    const name = this.generateName(index);
    return {
      id: index,
      code,
      name,
      displayName: `${code} ${name}`,
      color: colorStyle.color,
      colorHex: colorStyle.hex,
      colorName: colorStyle.label,
      palette,
      paletteHex,
      materialKey,
      materialName: materialStyle.label,
      patternKey: patternStyle.key,
      patternName: patternStyle.label,
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
    const materialStyle = MARBLE_MATERIAL_STYLES[materialKey] || MARBLE_MATERIAL_STYLES.glass;
    const material = new THREE.MeshStandardMaterial({
      color,
      map: texture,
      roughness: materialStyle.roughness,
      metalness: materialStyle.metalness,
      emissive: color,
      emissiveIntensity: materialStyle.emissiveIntensity,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, PERFORMANCE_TUNING.marbleSegments, PERFORMANCE_TUNING.marbleRings), material);
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
      this.pushBroadcastEvent('Gate Open', gateOpenLine, { kind: 'start', force: true, countdownLine: gateOpenLine });
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
        data.body.mass = 1.1 + (i % 4) * 0.04;
        data.body.updateMassProperties();
        data.startFrozenUntilGateOpen = false;
      }
      data.body.wakeUp();
      data.body.velocity.set(0, 0, 0);
      data.body.angularVelocity.set(0, 0, 0);
      data.body.linearDamping = NO_ROLLING_SLOWDOWN.marbleLinearDamping;
      data.body.angularDamping = NO_ROLLING_SLOWDOWN.marbleAngularDamping;
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
    if (!this.ui.countdown) return;
    this.ui.countdown.textContent = value;
    this.ui.countdown.classList.remove('hidden');
    this.ui.countdown.classList.toggle('go', isGo);
    this.ui.countdown.classList.add('pulse');
    clearTimeout(this.countdownOverlayTimer);
    this.countdownOverlayTimer = setTimeout(() => {
      this.ui.countdown?.classList.remove('pulse');
    }, 120);
  }

  hideCountdownOverlay() {
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
      width: { ideal: 1920 },
      height: { ideal: 1080 },
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

  animate() {
    requestAnimationFrame(() => this.animate());
    const rawDelta = Math.min(this.clock.getDelta(), 0.05);
    const timeScale = this.getFinishSlowMotionTimeScale();
    if (this.finishSlowMotion) this.finishSlowMotion.timeScale = timeScale;
    const delta = rawDelta * timeScale;
    this.updateStartGateAnimation(rawDelta);
    this.updateFinishSpinner(rawDelta);
    this.updatePinballObstacles(delta);
    this.updateDropTargetBoostAuras(delta);
    if (!this.performanceProfile?.renderSkipSpectacleEffects) this.updateSpectacleEffects(rawDelta);
    this.updatePodiumCeremony(rawDelta);
    this.updateMarbleTrails(delta);
    if (this.state === 'running') {
      this.elapsed += delta;
      this.applyMarbleDrive();
      this.world.step(1 / 60, delta, PERFORMANCE_TUNING.runningMaxSubSteps);
      this.syncMarbles();
      this.recordRaceHistorySample();
      this.updatePreFinishSlowMotionTrigger();
      this.checkFinishers();
      this.applyPostFirstFinishDnfCutoff();
      this.updateBroadcastDirector();
    } else if (this.state === 'ready') {
      this.updateCountdown(delta);
      this.world.step(1 / 60, delta, PERFORMANCE_TUNING.readyMaxSubSteps);
      this.syncMarbles();
    }
    this.updateCamera(delta);
    const labelUpdateMs = this.performanceProfile?.renderNameLabelUpdateMs || 0;
    if (!labelUpdateMs || performance.now() - (this.lastNameLabelUpdate || 0) >= labelUpdateMs) {
      this.lastNameLabelUpdate = performance.now();
      this.updateMarbleNameLabels();
    }
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
    if (performance.now() - this.lastLeaderboardUpdate > (this.performanceProfile?.leaderboardUpdateMs || 300)) this.updateLeaderboard(false);
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
      this.updateUI();
    }
    this.updateReplayHighlightPlayback(rawDelta);
    this.renderer.render(this.scene, this.camera);
    this.renderViewerCanvasOverlay();
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
      mode: overrides.mode || (key === 'smooth1080p' ? 'playwright-render-performance' : (this.performanceProfile?.mode || PERFORMANCE_TUNING.label)),
      uiThrottleProfile: key,
    };
    this.uiThrottleCounters.profileKey = key;
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
    if (!this.catchupAssistEnabled || data.id === this.getLeaderId()) return turnLimitedMaxSpeed;
    if (CATCHUP_ASSIST.disableBonusOnTurnPieces && isTurnGuide) return turnLimitedMaxSpeed;
    const gap = Math.max(0, leaderDistance - (data.distance || 0));
    const bonusRatio = clamp(gap / CATCHUP_ASSIST.fullEffectGap, 0, 1) * CATCHUP_ASSIST.maxBonus;
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
    const clearance = data.body.position.y - (nearestFrame.p.y + data.radius);
    const recentTrackContact = this.elapsed - (data.lastTrackContactTime ?? -Infinity) <= (this.landingReboundAbsorber?.contactGraceSeconds ?? 0.18);
    const airborneAssistPaused = Boolean(policy.pauseAssistWhileAirborne && clearance > (policy.airborneClearance ?? 0.92));

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
      const closest = this.findClosestProgress(data.body.position);
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
      const velocity = new THREE.Vector3(data.body.velocity.x, data.body.velocity.y, data.body.velocity.z);
      const speedPresetMax = this.speedPreset.maxSpeed;
      const progress = clamp(driveDistance / Math.max(this.trackLength, 0.001), 0, 1);
      const distanceToFinish = Math.max(0, this.trackLength - driveDistance);
      const slopeTopSpeed = speedPresetMax * (this.slopeDrive?.maxSpeedRatio ?? 1);
      const baseMaxSpeed = progress > 0.88 ? slopeTopSpeed * (this.finalApproachAssist?.maxSpeedRatio || 1.02) : slopeTopSpeed;
      const catchupMaxSpeed = this.getCatchupSpeedLimit(data, baseMaxSpeed, leaderDistance, guide);
      const maxSpeed = this.getDropTargetSpeedLimit(data, catchupMaxSpeed);
      data.catchupMaxSpeed = catchupMaxSpeed;
      data.dropTargetBoostNormalMaxSpeed = catchupMaxSpeed;
      data.dropTargetBoostEffectiveMaxSpeed = maxSpeed;
      data.dropTargetBoostCapOverrideActive = Boolean(data.dropTargetBoostActive && data.dropTargetBoostAllowExceedMaxSpeed && maxSpeed > catchupMaxSpeed);
      if (guide.airborneAssistPaused) {
        data.guideAssistPausedReason = 'airborne-waiting-for-landing-recalculation';
        data.forwardAccelerationActive = false;
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

      if (data.body.position.y < frame.p.y - 5 || closest.lateralSq > (this.trackWidth * this.trackWidth * 3.2)) {
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
    return clamp(progress.distance, 0, Math.max(0, this.trackLength - (FALL_RESPAWN_POLICY.finishGuardDistanceMeters ?? 1.25)));
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
          this.ui.winner.textContent = `🏆 ${data.name} wins! ${data.finishTime.toFixed(2)}s`;
          this.ui.winner.classList.remove('hidden');
          this.pushBroadcastEvent('Winner', `${data.name} wins`, { kind: 'winner', force: true, marbleId: data.id, lines: [`${data.name} wins`, `${data.name} takes flag`, `${data.name} first home`] });
          this.triggerFinishSlowMotion(data, { reason: 'finish-line-crossed-fallback', crossed: true });
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
        guidePointAheadDistance: d.guidePointAheadDistance ?? null,
      })),
      catchupAssistEnabled: this.catchupAssistEnabled,
      catchupMaxSpeed: this.catchupAssistEnabled ? this.speedPreset.maxSpeed * (1 + CATCHUP_ASSIST.maxBonus) : this.speedPreset.maxSpeed,
      catchupAssist: CATCHUP_ASSIST,
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
      } : START_GATE_DESIGN,
      marbleLabelPolicy: {
        ...MARBLE_LABEL_POLICY,
        state: this.state,
        visibleLabelCount: this.marbleData.filter((data) => data.labelSprite?.visible).length,
        visibleLabelIds: this.marbleData.filter((data) => data.labelSprite?.visible).map((data) => data.id),
      },
      startSlotDiagnostics: this.marbleData.map((data) => ({
        id: data.id,
        name: data.name,
        colorName: data.colorName,
        colorHex: data.colorHex,
        paletteHex: data.paletteHex,
        materialName: data.materialName,
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
      })),
      variableTrackWidth: true,
      trackWidthProfile: this.trackWidthProfile,
      trackPieceSystem: this.trackPieceSystem,
      modularTrackPieces: this.trackPieces,
      modularTrackPieceCounts: {
        straight: this.trackPieces.filter((piece) => piece.type === 'straight').length,
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
      startGateOpen: Boolean(this.startGate?.opened),
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
        includesReproductionSettings: ['seed', 'trackPresetKey', 'customTrackLength', 'widthPresetKey', 'speedIndex', 'obstacleIndex', 'curveStyleKey', 'trackPieces', 'driveAssist'],
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
      defaultCameraPreference: 'default auto every race/stage: lead-pack through countdown and early race; cinematic leader from 60%; after first finish, stay on lead pack of remaining marbles to avoid rapid switching; podium/orbit when fully finished',
      defaultCameraPhaseSwitchProgress: BROADCAST_CAMERA.cinematicLeaderFromProgress,
      activeDefaultCameraShot: this.getDefaultCameraMode(),
      defaultCameraSequence: BROADCAST_CAMERA.sequence,
      defaultCameraTrackingDirection: 'xy/xz direction sampled from next tracking point back toward previous tracking point',
      defaultCameraOffsets: { leader: BROADCAST_CAMERA.leader, leadPack: BROADCAST_CAMERA.leadPack },
      cameraLineOfSight: {
        config: BROADCAST_CAMERA.lineOfSight,
        state: this.cameraLineOfSightState || null,
        occluderCount: this.getCameraOccluderMeshes?.().length || 0,
      },
      cinematicLeaderCamera: this.cinematicLeaderCameraState || null,
      leadPackCamera: this.leadPackCameraState || null,
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

  getDefaultCameraMode() {
    const leader = this.getAutoCameraRanking({ includeFinished: false })[0]
      || this.getAutoCameraRanking({ includeFinished: true })[0]
      || this.getRanking({ force: false })[0];
    if (this.state === 'finished') return BROADCAST_CAMERA.podium360.enabled ? 'podium360' : 'finish';
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
    const desiredFov = activeCameraMode === 'cinematicLeader'
      ? (BROADCAST_CAMERA.leader.fov || 40)
      : (activeCameraMode === 'leadPack'
        ? (BROADCAST_CAMERA.leadPack.fov || 44)
        : (activeCameraMode === 'replayHighlight' ? 38 : 58));
    if (Math.abs(this.camera.fov - desiredFov) > 0.01) {
      this.camera.fov = lerp(this.camera.fov, desiredFov, (activeCameraMode === 'cinematicLeader' || activeCameraMode === 'leadPack') ? 0.035 : 0.055);
      this.camera.updateProjectionMatrix();
    }
    const isLeadCloseMode = activeCameraMode === 'leadPack' || activeCameraMode === 'leadBattle' || activeCameraMode === 'replayHighlight';
    const isCinematicLeader = activeCameraMode === 'cinematicLeader';
    const isCinematicLeadPack = activeCameraMode === 'leadPack';
    const positionSmooth = activeCameraMode === 'replayHighlight'
      ? 1
      : (isCinematicLeader
        ? (BROADCAST_CAMERA.leader.positionSmoothing || 0.035)
        : (isCinematicLeadPack
          ? (BROADCAST_CAMERA.leadPack.positionSmoothing || 0.035)
          : (isLeadCloseMode ? 1 - Math.exp(-delta * (activeCameraMode === 'leadBattle' ? 3.2 : 2.1)) : 1 - Math.pow(0.001, delta))));
    const targetSmooth = activeCameraMode === 'replayHighlight'
      ? 1
      : (isCinematicLeader
        ? (BROADCAST_CAMERA.leader.targetSmoothing || 0.075)
        : (isCinematicLeadPack
          ? (BROADCAST_CAMERA.leadPack.targetSmoothing || 0.08)
          : (isLeadCloseMode ? 1 - Math.exp(-delta * (activeCameraMode === 'leadBattle' ? 4.2 : 2.8)) : 1 - Math.pow(0.001, delta))));
    const cameraBlend = activeCameraMode === 'replayHighlight' ? 1 : (activeCameraMode === 'leadBattle' ? 0.78 : isCinematicLeadPack ? 0.84 : isCinematicLeader ? 0.82 : 0.72);
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
