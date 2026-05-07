import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const TRACK_PRESETS = {
  short: { label: 'Short', base: 240, variation: 56, segment: 9, branches: 1 },
  medium: { label: 'Standard', base: 380, variation: 90, segment: 10, branches: 2 },
  long: { label: 'Long', base: 560, variation: 140, segment: 11, branches: 3 },
  epic: { label: 'Endurance', base: 840, variation: 190, segment: 12, branches: 4 },
};

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
  maxBonus: 0.12,
  fullEffectGap: 42,
  disableBonusOnTurnPieces: true,
  turnPieceMaxSpeedRatio: 0.7,
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
  delaySeconds: 5.0,
  penaltyDistance: 5.5,
  label: '卡死 / no-forward-progress reset 固定 5 秒，避免波子撞欄長時間停住',
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
const PINBALL_OBSTACLE_TYPES = [
  'popBumper',
  'slingshot',
  'spinnerGate',
  'rolloverLane',
  'dropTarget',
];

const BROADCAST_CAMERA = {
  defaultMode: 'default',
  angleStyle: 'high-angle-broadcast-auto-director',
  birdEyeCameraAngle: true,
  outOfBoundsIgnoreAfterSeconds: 1.0,
  outOfBoundsIgnoreLabel: 'auto camera: if a marble is outside the track for more than 1 second, stop targeting it until it respawns/returns',
  leader: { back: -7.2, side: 3.2, height: 24.5 },
  leadPack: { back: -7.6, side: 1.8, height: 22.8, packHeightStep: 1.25 },
  leadBattle: {
    enabled: true,
    label: 'auto close-up when top two marbles are neck-and-neck',
    maxGap: 3.2,
    minProgress: 0.04,
    back: -2.8,
    side: 0.65,
    height: 6.2,
    targetLift: 0.58,
  },
  selected: { back: -7.0, side: -3.2, height: 22.0 },
  unfinished: { back: -6.8, side: 2.8, height: 21.6 },
  finish: { forward: 8.5, height: 25.5 },
  podium360: {
    enabled: true,
    label: 'race-complete-360-degree-podium-orbit',
    radius: 14.5,
    height: 7.2,
    heightBob: 1.1,
    angularSpeed: 0.46,
  },
  sequence: ['highAngleLeader', 'highAngleLeadPack', 'finishLineHighShot', 'unfinishedOrderHighTrack', 'raceCompletePodium360Orbit'],
};

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

const PERFORMANCE_TUNING = {
  label: 'fps-balanced',
  maxPixelRatio: 1.35,
  antialias: false,
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
  physicalRailBodyBudget: 340,
  guardRailInterval: 2.25,
  guardRailOverlap: 3.85,
  uiUpdateMs: 500,
  debugUpdateMs: 1200,
  leaderboardUpdateMs: 800,
  rankingCacheMs: 220,
  trailSampleEvery: 0.085,
  trailPoints: 7,
  marbleSegments: 20,
  marbleRings: 14,
  obstacleCylinderSegments: 18,
  obstacleSphereSegments: 12,
  maxSpectacleEffects: 7,
  decorationStepMeters: 26,
  disableDecorativePointLights: true,
};

const PINBALL_PHYSICS = {
  popBumperRadius: 1.55,
  popBumperImpulse: 7.2,
  slingshotRadius: 1.75,
  slingshotImpulse: 6.6,
  spinnerRadius: 1.65,
  spinnerImpulse: 5.2,
  spinnerSpeed: 5.2,
  rolloverRadius: 1.35,
  rolloverBoostImpulse: 3.9,
  dropTargetRadius: 1.35,
  dropTargetImpulse: 7.8,
  dropTargetUpImpulse: 0.55,
  dropTargetSingleUse: true,
  dropTargetBounceMode: 'first-contact-marble-only-radial-rebound',
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

const nameAdjectives = ['Thunder', 'Phantom', 'Crystal', 'Blaze', 'Silver', 'Rapid', 'Violet', 'Stellar', 'Aurora', 'Rose', 'Frost', 'Comet', 'Night', 'Golden', 'Emerald', 'Scarlet'];
const nameNouns = ['Bolt', 'Racer', 'Spinner', 'Flash', 'Rocket', 'Marble', 'Surge', 'Pearl', 'Bandit', 'Drifter', 'Chaser', 'Nova', 'Lucky', 'Dash', 'Champion', 'Whisker'];
const nameTitles = ['Mk.I', 'Turbo', 'Omega', 'DX', 'Zero', 'No.7', 'Neo', 'Pro', 'Prime', 'Infinity'];

const MARBLE_COLOR_STYLES = [
  { label: 'Crimson Pulse', hex: '#ff3864', color: 0xff3864 },
  { label: 'Aqua Neon', hex: '#35e0ff', color: 0x35e0ff },
  { label: 'Sunlit Gold', hex: '#ffd166', color: 0xffd166 },
  { label: 'Lime Comet', hex: '#75ff8a', color: 0x75ff8a },
  { label: 'Violet Haze', hex: '#ae7cff', color: 0xae7cff },
  { label: 'Orange Flare', hex: '#ff8f3d', color: 0xff8f3d },
  { label: 'Pearl White', hex: '#f7f7ff', color: 0xf7f7ff },
  { label: 'Blue Nova', hex: '#4d96ff', color: 0x4d96ff },
  { label: 'Rose Candy', hex: '#ff70a6', color: 0xff70a6 },
  { label: 'Mint Circuit', hex: '#00f5d4', color: 0x00f5d4 },
  { label: 'Acid Glow', hex: '#c8ff00', color: 0xc8ff00 },
  { label: 'Amber Spark', hex: '#ffbe0b', color: 0xffbe0b },
];

const MARBLE_PATTERN_STYLES = [
  { key: 'rings', label: 'Layered Rings' },
  { key: 'spiral', label: 'Spiral Swirl' },
  { key: 'ripple', label: 'Ripple Waves' },
  { key: 'speckle', label: 'Speckled Pearl' },
  { key: 'comet', label: 'Comet Trails' },
  { key: 'storm', label: 'Storm Veins' },
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
    this.leadBattleInitialized = false;
    this.leadBattleState = null;
    this.defaultCameraPhaseUntil = 0;
    this.defaultCameraFocusId = null;
    this.firstFinishTime = 0;
    this.elapsed = 0;
    this.countdownDuration = 3;
    this.countdownRemaining = 0;
    this.countdownActive = false;
    this.countdownLastAnnouncedSecond = null;
    this.audioContext = null;
    this.audioMasterGain = null;
    this.audioUnlocked = false;
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
    this.curveStyleKey = 'mixed';
    this.curveStyle = CURVE_PRESETS[this.curveStyleKey];
    this.rng = Math.random;
    this.physicsSteps = 0;
    this.lastLeaderboardUpdate = 0;
    this.lastUIUpdate = 0;
    this.lastDebugUpdate = 0;
    this.lastRecordingStatusUpdate = 0;
    this.lastUIState = '';
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
    };
    this.lastFps = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.pathPoints = [];
    this.trackSamples = [];
    this.branchSegments = [];
    this.startCatcher = null;
    this.finishCatcher = null;
    this.finishRankingContainer = null;
    this.startGate = null;
    this.finishSpinner = null;
    this.obstacleTypeCounts = Object.fromEntries(PINBALL_OBSTACLE_TYPES.map((type) => [type, 0]));
    this.pinballObstacleTypes = PINBALL_OBSTACLE_TYPES;
    this.enabledObstacleTypes = new Set(PINBALL_OBSTACLE_TYPES);
    this.pinballObstacles = [];
    this.showGuidePoints = false;
    this.guidePointGroup = new THREE.Group();
    this.guidePointGroup.name = 'guide-point-marker-group';
    this.guidePointGroup.visible = false;
    this.scene?.add?.(this.guidePointGroup);
    this.pinballInteractions = {
      popBumper: 0,
      slingshot: 0,
      spinnerGate: 0,
      rolloverLane: 0,
      dropTarget: 0,
    };
    this.trackStats = { ribbonMeshes: 0, visibleDecks: 0, physicsDecks: 0, railTubes: 0, branchJoinDecks: 0, physicalRailBodies: 0, smoothRailJoinBodies: 0, optimizedRailBodies: 0, broadcastStageMarkers: 0 };
    this.stuckResetPenalty = STUCK_RESET.penaltyDistance;
    this.stuckResetDelay = STUCK_RESET.delaySeconds;
    this.fallRespawnDelay = 2;
    this.stuckResetCount = 0;
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
    this.leftUICollapsed = false;
    this.rightUICollapsed = false;
    this.enableAllCameraMouseOrbit = true;
    this.cameraAutoDistance = 24;
    this.trackMaterials = ['dark illustrated pinball playfield texture', 'neon rubber rail texture', 'MeshPhysicalMaterial clearcoat obstacle plastics', 'chrome bumper rings', 'lit rollover lane inserts'];
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
    this.previousTopFiveIds = [];
    this.topFiveSnapshot = [];
    this.lastFinalStretchAt = -Infinity;
    this.activeCaption = null;
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

    this.ui = {
      leftHud: document.querySelector('#left-hud'),
      rightHud: document.querySelector('#right-hud'),
      uiToggle: document.querySelector('#ui-toggle-btn'),
      rightUiToggle: document.querySelector('#right-ui-toggle-btn'),
      record: document.querySelector('#record-btn'),
      recordStatus: document.querySelector('#record-status'),
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
      seed: document.querySelector('#seed-input'),
      lengthSelect: document.querySelector('#length-select'),
      customLength: document.querySelector('#custom-length-input'),
      width: document.querySelector('#width-slider'),
      widthLabel: document.querySelector('#width-label'),
      obstacle: document.querySelector('#obstacle-slider'),
      obstacleLabel: document.querySelector('#obstacle-label'),
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
      fps: document.querySelector('#fps'),
      winner: document.querySelector('#winner-banner'),
      caption: document.querySelector('#broadcast-caption'),
      captionTitle: document.querySelector('#caption-title'),
      captionDetail: document.querySelector('#caption-detail'),
      countdown: document.querySelector('#countdown-overlay'),
      finalShowcase: document.querySelector('#final-showcase'),
    };

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
    this.ui.debugConsoleCopy?.addEventListener('click', () => this.copyDebugConsole());
    this.ui.record.addEventListener('click', () => this.toggleRecording());
    this.ui.copyTrackCode?.addEventListener('click', () => this.copyTrackDebugCode());
    this.ui.importTrackCode?.addEventListener('click', () => this.importTrackDebugCode());
    this.ui.lengthSelect.addEventListener('change', () => this.newRace({ regenerateTrack: true }));
    this.ui.customLength?.addEventListener('change', () => {
      this.ui.lengthSelect.value = 'custom';
      this.newRace({ regenerateTrack: true });
    });
    this.ui.width.addEventListener('input', () => this.updateWidthPreset({ regenerateTrack: false }));
    this.ui.width.addEventListener('change', () => this.updateWidthPreset({ regenerateTrack: true }));
    this.ui.obstacle.addEventListener('input', () => this.updateObstaclePreset({ regenerateTrack: false }));
    this.ui.obstacle.addEventListener('change', () => this.updateObstaclePreset({ regenerateTrack: true }));
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
      if (event.code === 'Space') {
        event.preventDefault();
        if (this.state === 'ready') this.startCountdownAndGateOpen();
        else this.togglePause();
      }
      if (event.key.toLowerCase() === 'r') this.newRace({ regenerateTrack: false });
      const target = event.target;
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (!isTyping && event.key.toLowerCase() === 'h') this.toggleLeftUI();
      if (!isTyping && event.key.toLowerCase() === 'j') this.toggleRightUI();
      if (!isTyping && event.key.toLowerCase() === 'v') this.toggleRecording();
      const map = { '1': 'default', '2': 'leader', '3': 'leadPack', '4': 'selected', '5': 'finish', '6': 'orbit' };
      if (map[event.key]) this.cameraMode = map[event.key];
    });
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
    this.state = 'ready';
    this.elapsed = 0;
    this.finishers = [];
    this.cachedRanking = null;
    this.cachedRankingAt = 0;
    this.cachedLeaderId = null;
    this.physicsSteps = 0;
    this.stuckResetCount = 0;
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
    this.previousTopFiveIds = [];
    this.topFiveSnapshot = [];
    this.lastFinalStretchAt = -Infinity;
    this.activeCaption = null;
    this.hideBroadcastCaption();
    this.clearSpectacleEffects({ clearTrails: false });
    this.showcaseStats = null;
    this.ui.pause.textContent = 'Pause';
    this.ui.start.textContent = 'Open Gate';
    this.ui.regen.textContent = 'Generate New Track';
    this.updateSpeedPreset();
    this.updateGuideBias();
    this.updateObstacleTypeToggles({ regenerateTrack: false });
    this.updateWidthPreset({ regenerateTrack: false });
    this.updateObstaclePreset({ regenerateTrack: false });
    this.updateCatchupAssist();
    this.updateCurveStyle();
    this.cameraMode = 'default';
    this.leadPackInitialized = false;
    this.leadBattleInitialized = false;
    this.leadBattleState = null;
    this.defaultCameraPhaseUntil = 0;
    this.defaultCameraFocusId = null;
    this.firstFinishTime = 0;
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
      this.rng = mulberry32(cyrb128(`${this.seed}-${this.trackPresetKey}-${this.customTrackLength || 'preset'}-${this.widthPresetKey}-${this.curveStyleKey}-${this.obstacleIndex}`)[0]);
      this.clearTrack();
      this.createTrack();
      this.buildGuidePointMarkers();
      this.guidePointGroup.visible = this.showGuidePoints;
      this.updateTrackDebugCode();
    }

    const requestedCount = Math.max(1, Math.floor(Number(this.ui.count.value) || 12));
    this.createMarbles(requestedCount);
    this.updateLeaderboard(true);
    this.updateTrackDebugCode();
    this.updateUI();
  }

  getCustomTrackLength() {
    const raw = Number(this.ui.customLength?.value || TRACK_PRESETS.medium.base);
    const meters = Math.round(clamp(Number.isFinite(raw) ? raw : TRACK_PRESETS.medium.base, 80, 3000));
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
      rngMaterial: `${this.seed}-${this.trackPresetKey}-${this.customTrackLength || 'preset'}-${this.widthPresetKey}-${this.curveStyleKey}-${this.obstacleIndex}`,
      trackPresetKey: this.trackPresetKey,
      customTrackLength: this.customTrackLength || null,
      actualTrackLength: this.trackLength,
      widthPresetKey: this.widthPresetKey,
      speedIndex: this.speedIndex,
      speedLabel: this.speedPreset?.label,
      obstacleIndex: this.obstacleIndex,
      obstacleLabel: this.obstaclePreset?.label,
      obstacleMultiplier: this.obstaclePreset?.multiplier ?? 1,
      enabledObstacleTypes: [...(this.enabledObstacleTypes || new Set(PINBALL_OBSTACLE_TYPES))],
      curveStyleKey: this.curveStyleKey,
      catchupAssistEnabled: this.catchupAssistEnabled,
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
    this.pinballInteractions = {
      popBumper: 0,
      slingshot: 0,
      spinnerGate: 0,
      rolloverLane: 0,
      dropTarget: 0,
    };
    this.obstacleTypeCounts = Object.fromEntries(PINBALL_OBSTACLE_TYPES.map((type) => [type, 0]));
    this.branchSegments = [];
    this.pathPoints = [];
    this.trackSamples = [];
    this.startCatcher = null;
    this.finishCatcher = null;
    this.finishRankingContainer = null;
    this.finishSpinner = null;
    this.trackStats = { ribbonMeshes: 0, visibleDecks: 0, physicsDecks: 0, railTubes: 0, branchJoinDecks: 0, physicalRailBodies: 0, smoothRailJoinBodies: 0, optimizedRailBodies: 0, broadcastStageMarkers: 0 };
    this.stuckResetCount = 0;
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
    this.marbleData.forEach(({ mesh, body, labelSprite }) => {
      this.scene.remove(mesh);
      if (labelSprite) this.scene.remove(labelSprite);
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

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.createPinballPlayfieldTexture(),
      roughness: 0.38,
      metalness: 0.12,
      clearcoat: 0.75,
      clearcoatRoughness: 0.18,
      side: THREE.DoubleSide,
    });
    const railMat = new THREE.MeshStandardMaterial({
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
    // Invisible rail boxes should act like low side lips, not tall invisible guide walls.
    // If a marble jumps higher than the rail, it should be able to leave the track naturally.
    const wallHeight = 0.92;
    const wallThickness = 0.58;
    const wallBaseOffset = -0.02;
    const targetBodyBudget = this.performanceProfile?.maxPhysicalRailBodies || 520;
    const budgetInterval = this.trackLength > 0 ? (this.trackLength * 2) / targetBodyBudget : 1.65;
    const interval = clamp(
      Math.max(this.performanceProfile?.guardRailInterval || 1.65, budgetInterval),
      1.8,
      3.2
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
        const offsetA = widthA / 2 + 0.42;
        const offsetB = widthB / 2 + 0.42;
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
    this.trackStats.physicalRailHeight = wallHeight;
    this.trackStats.physicalRailTopAboveTrack = wallHeight + wallBaseOffset;
    this.trackStats.physicalRailEscapeStyle = 'low-side-lip-allows-jumped-marbles-to-leave-track';
    this.trackStats.physicalRailBodyBudget = targetBodyBudget;
    this.trackStats.railOptimization = 'lower-fewer-overlapped-side-lip-bodies';
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
    this.world.addBody(body);
    this.trackBodies.push(body);
    return mesh;
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

    const drop = (START_RAMP.prepTrayBackOffset - START_RAMP.prepTrayFrontOffset) * START_RAMP.prepTrayDropPerMeter;
    const pitch = Math.atan2(drop, depth);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.20, depth), accentMat);
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

    const sideSpecs = [
      { x: -width / 2 - START_GATE_DESIGN.sideWallThickness / 2, z: 0, sx: START_GATE_DESIGN.sideWallThickness, sz: depth + 0.8 },
      { x: width / 2 + START_GATE_DESIGN.sideWallThickness / 2, z: 0, sx: START_GATE_DESIGN.sideWallThickness, sz: depth + 0.8 },
    ];
    sideSpecs.forEach((spec) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(spec.sx, START_GATE_DESIGN.sideWallHeight, spec.sz), railMat);
      wall.position.set(spec.x, START_GATE_DESIGN.sideWallHeight / 2 - 0.02, spec.z);
      wall.castShadow = PERFORMANCE_TUNING.shadows;
      wall.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(wall);
      const pos = center.clone().add(this.localToWorldOffset(spec.x, START_GATE_DESIGN.sideWallHeight / 2 - 0.02, spec.z, yaw));
      this.addStaticBox(pos, new THREE.Vector3(spec.sx / 2, START_GATE_DESIGN.sideWallHeight / 2, spec.sz / 2), yaw, this.railMaterial || this.obstacleMaterial);
    });

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, START_GATE_DESIGN.backWallHeight, START_GATE_DESIGN.sideWallThickness), railMat);
    backWall.position.set(0, START_GATE_DESIGN.backWallHeight / 2, -depth / 2 - START_GATE_DESIGN.sideWallThickness / 2);
    backWall.castShadow = PERFORMANCE_TUNING.shadows;
    backWall.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(backWall);
    this.addStaticBox(
      center.clone().add(this.localToWorldOffset(0, START_GATE_DESIGN.backWallHeight / 2, -depth / 2 - START_GATE_DESIGN.sideWallThickness / 2, yaw)),
      new THREE.Vector3((width + 0.8) / 2, START_GATE_DESIGN.backWallHeight / 2, START_GATE_DESIGN.sideWallThickness / 2),
      yaw,
      this.obstacleMaterial
    );

    const requestedCount = Math.max(1, Math.floor(Number(this.ui.count.value) || 12));
    const gateLayout = this.getStartGateLayout(requestedCount);
    const stallCount = gateLayout.stallCount;
    const laneGap = gateLayout.stallWidth;
    const gateWidth = gateLayout.gateWidth;
    for (let i = 1; i < stallCount; i += 1) {
      const x = -gateWidth / 2 + i * laneGap;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(START_GATE_DESIGN.laneRailThickness, START_GATE_DESIGN.laneRailHeight, depth - 1.2), railMat);
      rail.position.set(x, START_GATE_DESIGN.laneRailHeight / 2 + 0.08, -0.25);
      rail.rotation.x = pitch;
      rail.castShadow = PERFORMANCE_TUNING.shadows;
      rail.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(rail);
      const body = new CANNON.Body({ mass: 0, material: this.railMaterial || this.obstacleMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(START_GATE_DESIGN.laneRailThickness / 2, START_GATE_DESIGN.laneRailHeight / 2, (depth - 1.2) / 2)));
      body.position.copy(center.clone().add(this.localToWorldOffset(x, START_GATE_DESIGN.laneRailHeight / 2 + 0.08, -0.25, yaw)));
      body.quaternion.setFromEuler(pitch, yaw, 0, 'YXZ');
      this.world.addBody(body);
      this.trackBodies.push(body);
    }

    const gateLine = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.075, 0.34), new THREE.MeshStandardMaterial({ color: labelColor, roughness: 0.24, emissive: labelColor, emissiveIntensity: 0.36 }));
    gateLine.position.set(0, 0.11, depth / 2 - 0.62);
    gateLine.rotation.x = pitch;
    group.add(gateLine);

    const startText = new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, emissive: 0x153a34, emissiveIntensity: 0.18 }));
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
      trackConnection: 'frontLocalZ-positive-aligns-with-frame-tangent-and-track-d0',
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

    const gateMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.38, metalness: 0.55 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x7cf7d4, roughness: 0.24, metalness: 0.28, emissive: 0x00483d, emissiveIntensity: 0.42 });
    const warningMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.3, metalness: 0.15, emissive: 0x3d2500, emissiveIntensity: 0.28 });
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
    const slotGap = 1.35;
    const lowerCount = Math.max(0, racerCount - 3);
    const lowerCols = Math.max(4, Math.min(10, Math.ceil(Math.sqrt(Math.max(1, lowerCount)) + 1)));
    const lowerRows = Math.max(1, Math.ceil(Math.max(1, lowerCount) / lowerCols));
    const containerWidth = Math.max(width, lowerCols * slotGap + 4.8, 12);
    const depth = Math.max(11.5, lowerRows * slotGap + 7.2);
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
      const z = 2.35 + row * slotGap;
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
      lowerSlots: { cols: lowerCols, rows: lowerRows, count: lowerCount },
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
      popBumperCap: new THREE.MeshPhysicalMaterial({ color: 0xfff1fa, roughness: 0.12, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0xff5fb7, emissiveIntensity: 0.18 }),
      slingshot: new THREE.MeshPhysicalMaterial({ color: 0x12f0c8, roughness: 0.16, metalness: 0.06, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0x00685d, emissiveIntensity: 0.46 }),
      spinnerGate: new THREE.MeshPhysicalMaterial({ color: 0x8d7dff, roughness: 0.15, metalness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06, emissive: 0x280090, emissiveIntensity: 0.38 }),
      rolloverLane: new THREE.MeshPhysicalMaterial({ color: 0x7ee9ff, roughness: 0.2, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x00475f, emissiveIntensity: 0.32 }),
      dropTarget: new THREE.MeshPhysicalMaterial({ color: 0xff8f3f, roughness: 0.17, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x5a1900, emissiveIntensity: 0.36 }),
      rubber: new THREE.MeshPhysicalMaterial({ color: 0x101422, roughness: 0.32, metalness: 0.02, clearcoat: 0.45, clearcoatRoughness: 0.18, emissive: 0x061020, emissiveIntensity: 0.26 }),
      chrome: new THREE.MeshPhysicalMaterial({ color: 0xe6f2ff, roughness: 0.12, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.04 }),
      yellowInsert: new THREE.MeshPhysicalMaterial({ color: 0xffd166, roughness: 0.18, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0x7a4a00, emissiveIntensity: 0.42 }),
      redInsert: new THREE.MeshPhysicalMaterial({ color: 0xff3864, roughness: 0.18, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0x79001c, emissiveIntensity: 0.44 }),
    };

    const enabledTypes = (this.enabledObstacleTypes?.size ? [...this.enabledObstacleTypes] : [...PINBALL_OBSTACLE_TYPES])
      .filter((type) => PINBALL_OBSTACLE_TYPES.includes(type));
    if (!enabledTypes.length) return;

    for (let i = 0; i < count; i += 1) {
      const d = 12 + this.rng() * Math.max(8, this.trackLength - 28);
      const frame = this.getTrackFrameAt(d);
      const localWidth = this.getTrackWidthAt(d);
      const lane = (this.rng() - 0.5) * Math.max(2.8, localWidth - 3.8);
      const type = enabledTypes[i % enabledTypes.length];
      this.createPinballObstacle(type, frame, lane, localWidth, palette);
      this.obstacleTypeCounts[type] = (this.obstacleTypeCounts[type] || 0) + 1;
    }
  }

  createPinballObstacle(type, frame, lane, localWidth, palette) {
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const center = new THREE.Vector3(frame.p.x + frame.right.x * lane, frame.p.y, frame.p.z + frame.right.z * lane);
    switch (type) {
      case 'popBumper':
        palette.popBumper.userData.capMaterial = palette.popBumperCap;
        palette.popBumper.userData.ringMaterial = palette.chrome;
        return this.createPopBumperObstacle(center, palette.popBumper);
      case 'slingshot':
        palette.slingshot.userData.insertMaterial = palette.yellowInsert;
        return this.createSlingshotObstacle(center, yaw + (this.rng() < 0.5 ? -1 : 1) * Math.PI * 0.24, palette.slingshot);
      case 'spinnerGate':
        palette.spinnerGate.userData.yellowInsert = palette.yellowInsert;
        palette.spinnerGate.userData.redInsert = palette.redInsert;
        return this.createSpinnerGateObstacle(center, yaw, palette.spinnerGate);
      case 'rolloverLane':
        return this.createRolloverLaneObstacle(center, yaw, palette.rolloverLane);
      case 'dropTarget':
      default:
        palette.rubber.userData.insertMaterial = palette.yellowInsert;
        return this.createDropTargetObstacle(center, yaw, palette.dropTarget, palette.rubber);
    }
  }

  addObstacleBody(body, meshOrGroup) {
    this.world.addBody(body);
    this.obstacleBodies.push(body);
    this.obstacleMeshes.push(meshOrGroup);
  }

  createPopBumperObstacle(center, material) {
    const capMaterial = material.userData?.capMaterial || material;
    const ringMaterial = material.userData?.ringMaterial || material;
    const radius = 0.55 + this.rng() * 0.35;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.56, 40), material);
    mesh.position.set(center.x, center.y + 0.34, center.z);
    mesh.castShadow = PERFORMANCE_TUNING.shadows;
    mesh.receiveShadow = PERFORMANCE_TUNING.shadows;
    this.trackGroup.add(mesh);

    const skirt = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.08, 0.075, 8, 36), ringMaterial);
    skirt.position.set(center.x, center.y + 0.64, center.z);
    skirt.rotation.x = Math.PI / 2;
    skirt.castShadow = PERFORMANCE_TUNING.shadows;
    this.trackGroup.add(skirt);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.78, 24, 12), capMaterial);
    cap.position.set(center.x, center.y + 0.78, center.z);
    cap.scale.y = 0.38;
    cap.castShadow = PERFORMANCE_TUNING.shadows;
    this.trackGroup.add(cap);

    const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    body.addShape(new CANNON.Cylinder(radius, radius, 0.66, 28));
    body.position.copy(mesh.position);
    this.addObstacleBody(body, mesh);
    this.pinballObstacles.push({
      type: 'popBumper',
      center: mesh.position.clone(),
      radius: Math.max(PINBALL_PHYSICS.popBumperRadius, radius + 0.62),
      impulse: PINBALL_PHYSICS.popBumperImpulse,
      cooldown: new Map(),
      mesh,
      cap,
      skirt,
      pulse: 0,
    });
  }

  createSlingshotObstacle(center, yaw, material) {
    const w = 2.1 + this.rng() * 0.65;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.44, 0.36), material);
    mesh.position.set(center.x, center.y + 0.3, center.z);
    mesh.rotation.y = yaw;
    mesh.castShadow = PERFORMANCE_TUNING.shadows;
    mesh.receiveShadow = PERFORMANCE_TUNING.shadows;
    this.trackGroup.add(mesh);

    const insertMat = material.userData?.insertMaterial || material;
    [-0.38, 0, 0.38].forEach((offset) => {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8), insertMat);
      const localX = offset * w;
      bulb.position.copy(center.clone().add(this.localToWorldOffset(localX, 0.57, 0, yaw)));
      bulb.scale.y = 0.42;
      bulb.castShadow = PERFORMANCE_TUNING.shadows;
      this.trackGroup.add(bulb);
    });

    const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, 0.22, 0.18)));
    body.position.copy(mesh.position);
    body.quaternion.copy(mesh.quaternion);
    this.addObstacleBody(body, mesh);
    this.pinballObstacles.push({
      type: 'slingshot',
      center: mesh.position.clone(),
      normal: new THREE.Vector3(Math.sin(yaw + Math.PI / 2), 0, Math.cos(yaw + Math.PI / 2)).normalize(),
      radius: PINBALL_PHYSICS.slingshotRadius,
      impulse: PINBALL_PHYSICS.slingshotImpulse,
      cooldown: new Map(),
      mesh,
      pulse: 0,
    });
  }

  createSpinnerGateObstacle(center, yaw, material) {
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = yaw;
    this.trackGroup.add(group);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.52, 20), material);
    hub.position.y = 0.48;
    hub.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(hub);
    for (let i = 0; i < 3; i += 1) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.22, 0.2), material);
      arm.position.y = 0.5;
      arm.rotation.y = (Math.PI * 2 * i) / 3;
      arm.castShadow = PERFORMANCE_TUNING.shadows;
      group.add(arm);
      const tipMat = i % 2 === 0 ? (material.userData?.yellowInsert || material) : (material.userData?.redInsert || material);
      [-0.72, 0.72].forEach((x) => {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), tipMat);
        tip.position.set(x, 0.5, 0);
        tip.scale.y = 0.55;
        arm.add(tip);
      });
    }

    const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
    body.addShape(new CANNON.Cylinder(0.62, 0.62, 0.5, 16));
    body.position.set(center.x, center.y + 0.48, center.z);
    this.addObstacleBody(body, group);
    this.pinballObstacles.push({
      type: 'spinnerGate',
      center: center.clone().add(new THREE.Vector3(0, 0.48, 0)),
      radius: PINBALL_PHYSICS.spinnerRadius,
      impulse: PINBALL_PHYSICS.spinnerImpulse,
      cooldown: new Map(),
      group,
      spinnerSpeed: PINBALL_PHYSICS.spinnerSpeed * (this.rng() < 0.5 ? -1 : 1),
    });
  }

  createRolloverLaneObstacle(center, yaw, material) {
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = yaw;
    this.trackGroup.add(group);
    [-0.72, 0.72].forEach((x) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.72, 16), material);
      post.position.set(x, 0.42, 0);
      post.castShadow = PERFORMANCE_TUNING.shadows;
      group.add(post);
      const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
      body.addShape(new CANNON.Cylinder(0.16, 0.16, 0.72, 16));
      body.position.copy(center.clone().add(this.localToWorldOffset(x, 0.42, 0, yaw)));
      this.addObstacleBody(body, post);
    });
    const lanePlate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 1.1), material);
    lanePlate.position.set(0, 0.08, 0);
    lanePlate.receiveShadow = PERFORMANCE_TUNING.shadows;
    group.add(lanePlate);

    const insertTexture = this.createPinballInsertTexture('LANE', { mid: '#7ee9ff', edge: '#00324a', glow: '#f7fdff' });
    const insertMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: insertTexture,
      roughness: 0.16,
      metalness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      emissive: 0x2ddfff,
      emissiveIntensity: 0.2,
    });
    const insertDisc = new THREE.Mesh(new THREE.CircleGeometry(0.48, 36), insertMat);
    insertDisc.position.set(0, 0.115, 0);
    insertDisc.rotation.x = -Math.PI / 2;
    group.add(insertDisc);
    this.pinballObstacles.push({
      type: 'rolloverLane',
      center: center.clone().add(this.localToWorldOffset(0, 0.16, 0, yaw)),
      direction: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize(),
      radius: PINBALL_PHYSICS.rolloverRadius,
      boostImpulse: PINBALL_PHYSICS.rolloverBoostImpulse,
      cooldown: new Map(),
      mesh: lanePlate,
      pulse: 0,
    });
  }

  createDropTargetObstacle(center, yaw, material, rubberMaterial) {
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = yaw;
    this.trackGroup.add(group);
    const targets = [];
    const bodies = [];
    [-0.62, 0, 0.62].forEach((x, index) => {
      const target = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05 - index * 0.08, 0.24), material);
      target.position.set(x, 0.58, 0);
      target.rotation.x = -0.08;
      target.castShadow = PERFORMANCE_TUNING.shadows;
      target.receiveShadow = PERFORMANCE_TUNING.shadows;
      group.add(target);
      const body = new CANNON.Body({ mass: 0, material: this.obstacleMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.21, 0.5, 0.12)));
      body.position.copy(center.clone().add(this.localToWorldOffset(x, 0.58, 0, yaw)));
      body.quaternion.setFromEuler(-0.08, yaw, 0, 'XYZ');
      this.addObstacleBody(body, target);
      targets.push(target);
      bodies.push(body);
    });
    const rubber = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.22), rubberMaterial);
    rubber.position.set(0, 0.18, -0.42);
    rubber.castShadow = PERFORMANCE_TUNING.shadows;
    group.add(rubber);
    const jewelMat = rubberMaterial.userData?.insertMaterial || material;
    const jewel = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 8, 32), jewelMat);
    jewel.position.set(0, 0.3, -0.42);
    jewel.rotation.x = Math.PI / 2;
    group.add(jewel);
    this.pinballObstacles.push({
      type: 'dropTarget',
      center: center.clone().add(this.localToWorldOffset(0, 0.58, 0, yaw)),
      direction: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize(),
      radius: PINBALL_PHYSICS.dropTargetRadius,
      impulse: PINBALL_PHYSICS.dropTargetImpulse,
      upImpulse: PINBALL_PHYSICS.dropTargetUpImpulse,
      singleUseBounce: PINBALL_PHYSICS.dropTargetSingleUse,
      bouncedMarbleId: null,
      bouncedMarbleName: null,
      bounceMode: PINBALL_PHYSICS.dropTargetBounceMode,
      cooldown: new Map(),
      group,
      targets,
      bodies,
      dropped: false,
      dropProgress: 0,
    });
  }

  updatePinballObstacles(delta) {
    if (!this.pinballObstacles.length) return;
    this.pinballObstacles.forEach((obstacle) => {
      if (obstacle.type === 'spinnerGate') {
        obstacle.group.rotation.y += delta * obstacle.spinnerSpeed;
      }
      if (obstacle.type === 'dropTarget' && obstacle.dropped) {
        obstacle.dropProgress = Math.min(1, obstacle.dropProgress + delta * 3.4);
        obstacle.targets?.forEach((target, index) => {
          target.rotation.x = -0.08 - obstacle.dropProgress * 1.28;
          target.position.y = 0.58 - obstacle.dropProgress * (0.42 + index * 0.03);
          target.material.emissiveIntensity = Math.max(0.06, 0.34 * (1 - obstacle.dropProgress));
        });
      }
      if (obstacle.pulse) {
        obstacle.pulse = Math.max(0, obstacle.pulse - delta * 5.5);
        const scale = 1 + obstacle.pulse * 0.18;
        obstacle.mesh?.scale.set(scale, 1 + obstacle.pulse * 0.08, scale);
        obstacle.cap?.scale.set(scale, 0.42 + obstacle.pulse * 0.1, scale);
        obstacle.skirt?.scale.set(scale, scale, scale);
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
        if (obstacle.type === 'slingshot') this.applySlingshotImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'spinnerGate') this.applySpinnerGateImpulse(obstacle, data, dx, dz);
        if (obstacle.type === 'rolloverLane') this.applyRolloverLaneBoost(obstacle, data);
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
    this.pushBroadcastEvent('Bumper Blast', `${data.name} ricochets off a pop bumper`, { kind: 'obstacle' });
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
    this.pushBroadcastEvent('Slingshot Kick', `${data.name} gets fired across the lane`, { kind: 'obstacle' });
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
    this.pushBroadcastEvent('Spinner Snap', `${data.name} catches a spinning gate boost`, { kind: 'obstacle' });
  }

  applyRolloverLaneBoost(obstacle, data) {
    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const frame = this.getTrackFrameAt(Math.max(closest.distance, data.distance || 0) + this.finishDirectionAssist.lookAhead);
    const rawImpulse = new THREE.Vector3(
      obstacle.direction.x * obstacle.boostImpulse,
      0,
      obstacle.direction.z * obstacle.boostImpulse
    );
    data.body.wakeUp();
    this.applyFinishDirectedImpulse(data, rawImpulse, frame, 0.22);
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.pulse = 1;
    this.pinballInteractions.rolloverLane += 1;
    this.spawnImpactEffect(obstacle.center, 0x8cff66, 'spark');
    this.pushBroadcastEvent('Lane Lit', `${data.name} triggers a rollover speed lane`, { kind: 'obstacle' });
  }

  applyDropTargetHit(obstacle, data) {
    if (obstacle.singleUseBounce && obstacle.bouncedMarbleId !== null && obstacle.bouncedMarbleId !== data.id) return;

    if (!obstacle.dropped) {
      obstacle.dropped = true;
      obstacle.bouncedMarbleId = data.id;
      obstacle.bouncedMarbleName = data.name;
      obstacle.bodies?.forEach((body) => {
        if (this.world.bodies.includes(body)) this.world.removeBody(body);
      });
    } else if (obstacle.singleUseBounce) {
      return;
    }

    const closest = this.findClosestProgress(data.body.position);
    this.noteObstacleHit(data, obstacle, closest.distance);
    const dx = data.body.position.x - obstacle.center.x;
    const dz = data.body.position.z - obstacle.center.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    const radial = new THREE.Vector3(dx / dist, 0, dz / dist);
    const outgoingSpeed = Math.max(1.6, data.body.velocity.x * radial.x + data.body.velocity.z * radial.z);
    const reboundImpulse = obstacle.impulse + outgoingSpeed * 0.38;
    const rawImpulse = radial.multiplyScalar(reboundImpulse);
    data.body.wakeUp();
    data.body.applyImpulse(new CANNON.Vec3(rawImpulse.x, obstacle.upImpulse ?? 0.55, rawImpulse.z), data.body.position);
    obstacle.cooldown.set(data.id, this.elapsed);
    obstacle.lastBouncedAt = this.elapsed;
    obstacle.lastBouncedMarbleId = data.id;
    obstacle.lastBouncedMarbleName = data.name;
    data.lastDropTargetBounceMode = obstacle.bounceMode;
    data.dropTargetBounceCount = (data.dropTargetBounceCount || 0) + 1;
    this.pinballInteractions.dropTarget += 1;
    this.spawnImpactEffect(obstacle.center, 0xff8844, 'burst');
    this.pushBroadcastEvent('Target Rebound', `${data.name} gets bounced back by the drop targets`, { kind: 'obstacle' });
  }

  createDecorations() {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1a8, emissive: 0xffbb33, emissiveIntensity: 0.7 });
    const count = Math.ceil(this.trackLength / PERFORMANCE_TUNING.decorationStepMeters);
    for (let i = 0; i < count; i += 1) {
      const frame = this.getTrackFrameAt(6 + i * (this.trackLength / count));
      const side = i % 2 === 0 ? -1 : 1;
      const pos = new THREE.Vector3(frame.p.x + frame.right.x * side * (this.trackWidth / 2 + 4), frame.p.y, frame.p.z + frame.right.z * side * (this.trackWidth / 2 + 4));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.4, 10), postMat);
      post.position.set(pos.x, pos.y + 2.1, pos.z);
      post.castShadow = PERFORMANCE_TUNING.shadows;
      this.trackGroup.add(post);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lampMat);
      lamp.position.set(pos.x, pos.y + 4.45, pos.z);
      this.trackGroup.add(lamp);
      if (!PERFORMANCE_TUNING.disableDecorativePointLights) {
        const light = new THREE.PointLight(0xffd38a, 0.5, 16);
        light.position.copy(lamp.position);
        this.trackGroup.add(light);
      }
    }
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
    return { line, points, cursor: 0, sampleEvery: PERFORMANCE_TUNING.trailSampleEvery, lastSample: -Infinity, radius };
  }

  updateMarbleTrails(delta) {
    if (!this.marbleData.length) return;
    const now = this.elapsed;
    this.marbleData.forEach((data) => {
      if (!data.trail) return;
      const trail = data.trail;
      if (this.state === 'running' && now - trail.lastSample >= trail.sampleEvery) {
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
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.strokeText(label, canvas.width / 2, canvas.height / 2 + 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.name = `marble-name-label-${label}`;
    sprite.renderOrder = 80;
    sprite.frustumCulled = false;
    sprite.scale.set(1.8, 0.45, 1);
    this.scene.add(sprite);
    return sprite;
  }

  updateMarbleNameLabels() {
    this.marbleData.forEach((data) => {
      if (!data.labelSprite) return;
      data.labelSprite.position.copy(data.mesh.position).add(new THREE.Vector3(0, data.radius + 0.72, 0));
      const cameraDistance = data.labelSprite.position.distanceTo(this.camera.position);
      const scale = clamp(cameraDistance * 0.035, 0.62, 1.25);
      data.labelSprite.scale.set(scale * 3.8, scale * 0.95, 1);
      data.labelSprite.visible = !data.pendingFallRespawn || this.elapsed - (data.pendingFallRespawn.detectedAt ?? this.elapsed) < 1.1;
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
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });
    if (kind === 'spark' || kind === 'burst') {
      const count = kind === 'burst' ? 8 : 5;
      for (let i = 0; i < count; i += 1) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), material.clone());
        mesh.position.copy(base);
        const angle = (i / count) * Math.PI * 2;
        mesh.userData.velocity = new THREE.Vector3(Math.cos(angle) * (2.4 + i * 0.08), 1.2 + (i % 3) * 0.25, Math.sin(angle) * (2.4 + i * 0.08));
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
    this.spectacleEffects.push({ kind, meshes, age: 0, life: kind === 'ring' ? 0.75 : 0.9 });
  }

  updateSpectacleEffects(delta) {
    this.spectacleEffects = this.spectacleEffects.filter((effect) => {
      effect.age += delta;
      const t = clamp(effect.age / effect.life, 0, 1);
      effect.meshes.forEach((mesh) => {
        if (effect.kind === 'ring') mesh.scale.setScalar(1 + t * 5.5);
        if (mesh.userData.velocity) mesh.position.addScaledVector(mesh.userData.velocity, delta);
        if (mesh.material) mesh.material.opacity = Math.max(0, 0.72 * (1 - t));
      });
      if (t >= 1) {
        effect.meshes.forEach((mesh) => this.scene.remove(mesh));
        return false;
      }
      return true;
    });
    this.updateConfetti(delta);
  }

  pushBroadcastEvent(title, detail = '', { kind = 'general', force = false } = {}) {
    if (!force && this.elapsed - (this.lastBroadcastAt || -Infinity) < 2.2) return;
    this.lastBroadcastAt = this.elapsed;
    if (this.activeCaption && !force) this.hideBroadcastCaption();
    const event = { title, detail, kind, time: this.elapsed };
    this.broadcastEvents.unshift(event);
    this.broadcastEvents = this.broadcastEvents.slice(0, 10);
    this.activeCaption = { ...event, expiresAt: this.elapsed + 2.8 };
    if (this.ui.captionTitle) this.ui.captionTitle.textContent = title;
    if (this.ui.captionDetail) this.ui.captionDetail.textContent = detail;
    this.ui.caption?.classList.remove('hidden');
  }

  hideBroadcastCaption() {
    this.ui?.caption?.classList.add('hidden');
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
        const detail = passed && passed.id !== frontOvertake.data.id
          ? `${frontOvertake.data.name} slips past ${passed.name} for ${position}`
          : `${frontOvertake.data.name} jumps up into ${position}`;
        this.pushBroadcastEvent('Overtake!', detail, { kind: 'overtake', force: true });
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
      this.pushBroadcastEvent('Neck and Neck', `${livePair.name} vs ${rival.name} — only ${gap.toFixed(1)}m apart`, { kind: 'battle' });
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
    const ranking = this.getRanking({ force: false });
    this.updateRaceStorylines(ranking);
    const leader = ranking[0];
    if (!leader) return;
    if (leader.id !== this.lastBroadcastLeaderId && this.elapsed > 2.0) {
      this.lastBroadcastLeaderId = leader.id;
      this.pushBroadcastEvent('New Leader', `${leader.name} takes control at ${Math.round(leader.progress * 100)}%`, { kind: 'leader' });
    }
    const second = ranking.find((data) => !data.finished && data.id !== leader.id);
    if (second && !leader.finished && leader.distance - second.distance < 5 && this.elapsed - this.lastCloseBattleAt > 5) {
      this.lastCloseBattleAt = this.elapsed;
      this.pushBroadcastEvent('Close Battle', `${leader.name} and ${second.name} are almost side-by-side`, { kind: 'battle' });
    }
    if (!leader.finished && leader.progress > 0.82 && this.elapsed - this.lastFinalStretchAt > 8) {
      this.lastFinalStretchAt = this.elapsed;
      this.pushBroadcastEvent('Final Stretch', `${leader.name} enters the closing sector`, { kind: 'finish' });
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
      ? `${winner?.name || 'Leader'} breaks the line — confetti cannons firing`
      : `${winner?.name || 'Leader'} is ${this.finishSlowMotion.preFinishDistance.toFixed(1)}m from the line — slow-mo engaged`;
    this.pushBroadcastEvent(crossed ? 'Slow Motion Finish' : 'Final Slow-Mo', detail, { kind: 'winner', force: true });
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

  showFinalShowcase() {
    const ranking = this.getRanking({ force: true });
    const winner = ranking[0];
    const comeback = ranking.reduce((best, data) => ((data.stuckResets || 0) + (data.fallPenaltyCount || 0) > ((best?.stuckResets || 0) + (best?.fallPenaltyCount || 0)) ? data : best), ranking[0]);
    this.showcaseStats = {
      winner: winner ? winner.name : null,
      top3: ranking.slice(0, 3).map((data) => ({ name: data.name, code: data.code, finishTime: data.finishTime })),
      comeback: comeback ? comeback.name : null,
      pinballHits: { ...this.pinballInteractions },
      totalPinballHits: Object.values(this.pinballInteractions).reduce((sum, value) => sum + value, 0),
    };
    if (this.ui.finalShowcase) {
      const top3 = ranking.slice(0, 3).map((data, index) => `<li><strong>#${index + 1}</strong> <span class="showcase-racer-name" data-marble-id="${data.id}" title="Double-click to copy reusable marble identity">${data.name}</span> <span>${data.finishTime?.toFixed(2) ?? '--'}s</span></li>`).join('');
      this.ui.finalShowcase.innerHTML = `<h2>Winner Show</h2><ol>${top3}</ol><p>Best comeback: <strong>${this.showcaseStats.comeback || '—'}</strong></p><p>Pinball hits: <strong>${this.showcaseStats.totalPinballHits}</strong></p>`;
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
    this.ui.select.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const identity = this.createMarbleIdentity(i, count);
      const { color, radius } = identity;
      const mesh = this.makeMarbleMesh(radius, color, i, identity.patternKey);
      const labelSprite = this.createMarbleNameLabel(identity.name);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const lane = (col - (cols - 1) / 2) * laneGap;
      const chuteDepth = this.startCatcher?.depth || START_GATE_DESIGN.chuteDepth;
      const rowSpacing = Math.max(1.35, laneGap * 0.92);
      const firstRowLocalZ = Math.max(-chuteDepth / 2 + 1.4, -4.15);
      const localZ = clamp(firstRowLocalZ + row * rowSpacing, -chuteDepth / 2 + 1.0, -START_GATE_DESIGN.gateBackDistance - 0.85);
      const localY = this.getStartChuteFloorTopLocalY(localZ, radius, 0.16);
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
        startSlotFillMode: START_GATE_DESIGN.slotFillMode,
        startFrozenUntilGateOpen: Boolean(START_GATE_DESIGN.freezeMarblesUntilGateOpen),
        startOnChuteSurface: true,
        mesh,
        labelSprite,
        body,
        finished: false, finishTime: null, progress: 0, distance: 0,
        lastDistance: 0, lastMovementTime: 0, stuckResets: 0, lastResetTime: -Infinity,
        lastDriveMovementDistance: 0, lastDriveMovementTime: 0,
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
    const codeNumber = String(index + 1).padStart(Math.max(2, String(count).length), '0');
    const code = `MB-${codeNumber}-${colorStyle.hex.slice(1, 4).toUpperCase()}-${patternStyle.key.slice(0, 3).toUpperCase()}-${sizeStyle.key}`;
    const name = this.generateName(index);
    return {
      id: index,
      code,
      name,
      displayName: `${code} ${name}`,
      color: colorStyle.color,
      colorHex: colorStyle.hex,
      colorName: colorStyle.label,
      patternKey: patternStyle.key,
      patternName: patternStyle.label,
      sizeKey: sizeStyle.key,
      sizeName: sizeStyle.label,
      radius: sizeStyle.radius,
    };
  }

  makeMarbleMesh(radius, color, index, patternKey = 'rings') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const base = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.55;
    const drawLoop = patternKey === 'speckle' ? 22 : 9;
    for (let i = 0; i < drawLoop; i += 1) {
      ctx.beginPath();
      ctx.strokeStyle = i % 2 ? '#ffffff' : '#050a18';
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.72)' : 'rgba(5,10,24,0.58)';
      ctx.lineWidth = 8 + (index % 3) * 2;
      if (patternKey === 'spiral') {
        const x = 128 + Math.cos(i * 0.95 + index) * (12 + i * 7);
        const y = 64 + Math.sin(i * 0.95 + index) * (8 + i * 3.5);
        ctx.arc(x, y, 12 + i * 4, 0.3 + i * 0.35, Math.PI * 1.45 + i * 0.35);
        ctx.stroke();
      } else if (patternKey === 'ripple') {
        ctx.moveTo(0, 20 + i * 13);
        for (let x = 0; x <= canvas.width; x += 12) {
          ctx.lineTo(x, 20 + i * 13 + Math.sin(x * 0.05 + index + i) * 11);
        }
        ctx.stroke();
      } else if (patternKey === 'speckle') {
        ctx.arc((i * 47 + index * 19) % canvas.width, (i * 31 + index * 23) % canvas.height, 3 + (i % 5), 0, Math.PI * 2);
        ctx.fill();
      } else if (patternKey === 'comet') {
        ctx.moveTo((i * 33) % canvas.width, 16 + (i % 5) * 24);
        ctx.quadraticCurveTo(80 + i * 10, 18 + Math.sin(index + i) * 35, 250 - i * 8, 42 + (i % 4) * 18);
        ctx.stroke();
      } else if (patternKey === 'storm') {
        ctx.moveTo((i * 29) % canvas.width, 0);
        ctx.lineTo(34 + i * 24 + Math.sin(index + i) * 18, canvas.height);
        ctx.stroke();
      } else {
        ctx.arc(40 + i * 30, 58 + Math.sin(i + index) * 22, 20 + (i % 4) * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ color, map: texture, roughness: 0.24, metalness: 0.04 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, PERFORMANCE_TUNING.marbleSegments, PERFORMANCE_TUNING.marbleRings), material);
    mesh.castShadow = PERFORMANCE_TUNING.shadows;
    mesh.receiveShadow = PERFORMANCE_TUNING.shadows;
    return mesh;
  }

  generateName(i) {
    const adjective = nameAdjectives[Math.floor(this.rng() * nameAdjectives.length)];
    const noun = nameNouns[Math.floor(this.rng() * nameNouns.length)];
    const title = nameTitles[Math.floor(this.rng() * nameTitles.length)];
    return `${adjective} ${noun} ${title}${i >= 12 ? `-${i + 1}` : ''}`;
  }

  startRace() {
    if (this.state !== 'ready' && this.state !== 'idle') return;
    this.state = 'running';
    this.elapsed = 0;
    this.pushBroadcastEvent('Gate Open', 'The pack launches into the first sector', { kind: 'start', force: true });
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
    });
    this.updateUI();
  }

  startCountdownAndGateOpen() {
    if (this.countdownActive || this.state !== 'ready') return;
    this.countdownActive = true;
    this.countdownRemaining = this.countdownDuration;
    this.countdownLastAnnouncedSecond = null;
    this.ui.start.textContent = 'Counting down';
    this.showCountdownOverlay('3');
    this.pushBroadcastEvent('Race Countdown', '3 seconds until gate open', { kind: 'start', force: true });
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
      this.pushBroadcastEvent('Race Countdown', `${nextSecond}...`, { kind: 'start', force: true });
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
    if (this.audioUnlocked) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    this.audioContext = this.audioContext || new AudioCtor();
    this.audioMasterGain = this.audioMasterGain || this.audioContext.createGain();
    this.audioMasterGain.gain.value = 0.18;
    this.audioMasterGain.connect(this.audioContext.destination);
    this.audioContext.resume?.();
    this.audioUnlocked = true;
  }

  playTone({ frequency = 440, duration = 0.12, type = 'sine', gain = 0.12, detune = 0 } = {}) {
    if (!this.audioUnlocked || !this.audioContext) return;
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
      rolloverLane: { frequency: 420, duration: 0.07, type: 'sine', gain: 0.08 },
      popBumper: { frequency: 520, duration: 0.06, type: 'triangle', gain: 0.08 },
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

  toggleLeftUI() {
    this.leftUICollapsed = !this.leftUICollapsed;
    this.ui.leftHud.classList.toggle('collapsed', this.leftUICollapsed);
    this.ui.uiToggle.textContent = this.leftUICollapsed ? 'Show UI' : 'Hide UI';
    this.ui.uiToggle.title = this.leftUICollapsed ? 'Show left UI' : 'Hide left UI';
    this.ui.uiToggle.setAttribute('aria-expanded', String(!this.leftUICollapsed));
    this.updateUI();
  }

  toggleRightUI() {
    this.rightUICollapsed = !this.rightUICollapsed;
    this.ui.rightHud.classList.toggle('collapsed', this.rightUICollapsed);
    this.ui.rightUiToggle.textContent = this.rightUICollapsed ? 'Show Right UI' : 'Hide Right UI';
    this.ui.rightUiToggle.title = this.rightUICollapsed ? 'Show right UI' : 'Hide right UI';
    this.ui.rightUiToggle.setAttribute('aria-expanded', String(!this.rightUICollapsed));
    this.updateUI();
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
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  async createRecordingStream({ preferScreenRecording = true } = {}) {
    const displayMedia = navigator.mediaDevices?.getDisplayMedia;
    if (preferScreenRecording && displayMedia) {
      try {
        const stream = await displayMedia.call(navigator.mediaDevices, {
          video: {
            frameRate: 60,
            displaySurface: 'browser',
            preferCurrentTab: true,
          },
          audio: false,
        });
        return { stream, source: 'screen' };
      } catch (error) {
        if (error?.name !== 'NotAllowedError') console.warn('Screen recording unavailable, falling back to canvas capture.', error);
      }
    }

    if (!this.renderer?.domElement?.captureStream) return null;
    return { stream: this.renderer.domElement.captureStream(60), source: 'canvas' };
  }

  async toggleRecording() {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      this.ui.recordStatus.textContent = 'Recording is not supported in this browser';
      return;
    }

    const recording = await this.createRecordingStream({ preferScreenRecording: true });
    if (!recording) {
      this.ui.recordStatus.textContent = 'Recording is not supported in this browser';
      return;
    }
    const { stream, source } = recording;
    const mimeType = this.getRecordingMimeType();
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.recordingStartedAt = performance.now();
    this.recordingSource = source;

    stream.getVideoTracks().forEach((track) => {
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
    this.ui.record.textContent = 'Stop Recording';
    this.ui.recordStatus.textContent = source === 'screen' ? 'Recording: full page UI' : 'Recording: 3D only';
    this.updateUI();
  }

  saveRecording(mimeType, stream) {
    stream?.getTracks().forEach((track) => track.stop());
    this.ui.record.classList.remove('recording');
    this.ui.record.textContent = 'Start Recording';
    const duration = (performance.now() - this.recordingStartedAt) / 1000;
    if (!this.recordedChunks.length) {
      this.ui.recordStatus.textContent = 'No video was recorded';
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
    this.updateUI();
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
    this.updateSpectacleEffects(rawDelta);
    this.updateMarbleTrails(delta);
    if (this.state === 'running') {
      this.elapsed += delta;
      this.applyMarbleDrive();
      this.world.step(1 / 60, delta, PERFORMANCE_TUNING.runningMaxSubSteps);
      this.syncMarbles();
      this.updatePreFinishSlowMotionTrigger();
      this.checkFinishers();
      this.updateBroadcastDirector();
    } else if (this.state === 'ready') {
      this.updateCountdown(delta);
      this.world.step(1 / 60, delta, PERFORMANCE_TUNING.readyMaxSubSteps);
      this.syncMarbles();
    }
    this.updateCamera(delta);
    this.controls.enabled = true;
    this.controls.update();
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
      const scope = this.recordingSource === 'screen' ? 'full page UI' : '3D only';
      this.ui.recordStatus.textContent = `Recording ${seconds.toFixed(1)}s | ${scope}`;
    }
    if (now - this.lastUIUpdate > (this.performanceProfile?.uiUpdateMs || 200)) {
      this.lastUIUpdate = now;
      this.updateUI();
    }
    this.renderer.render(this.scene, this.camera);
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
      const maxSpeed = this.getCatchupSpeedLimit(data, baseMaxSpeed, leaderDistance, guide);
      data.catchupMaxSpeed = maxSpeed;
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
      if (movedForward > 0.18) {
        data.lastDriveMovementTime = this.elapsed;
        data.lastDriveMovementDistance = Math.max(data.lastDriveMovementDistance || 0, driveDistance);
      } else if (this.elapsed - (data.lastDriveMovementTime ?? 0) > this.stuckResetDelay
        && this.elapsed - (data.lastResetTime ?? -Infinity) > this.stuckResetDelay) {
        // 唔再用水平速度判定「有郁」：波子可能原地打轉/貼住護欄高速磨擦，但實際無前進。
        this.resetStuckMarble(data, closest.distance, 'no-forward-progress');
      }
    });
  }

  scheduleFallRespawn(data, currentDistance = 0) {
    if (data.finished || data.pendingFallRespawn) return;
    const safeDistance = Math.max(0, Math.min(data.lastSafeDistanceBeforeFall ?? data.lastDistance ?? data.distance ?? currentDistance, currentDistance));
    const respawnDistance = Math.max(0, safeDistance - this.stuckResetPenalty);
    data.pendingFallRespawn = {
      detectedAt: this.elapsed,
      respawnAt: this.elapsed + this.fallRespawnDelay,
      safeDistance,
      respawnDistance,
    };
    data.body.velocity.set(0, -0.2, 0);
    data.body.angularVelocity.set(0, 0, 0);
    data.body.force.set(0, 0, 0);
    data.body.torque.set(0, 0, 0);
    data.body.wakeUp();
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
    data.distance = Math.min(data.distance || 0, penaltyDistance);
    data.lastSafeDistanceBeforeFall = penaltyDistance;
    data.progress = clamp(data.distance / this.trackLength, 0, 1);
    data.lastDistance = penaltyDistance;
    data.lastDriveMovementDistance = penaltyDistance;
    data.lastMovementTime = this.elapsed;
    data.lastDriveMovementTime = this.elapsed;
    data.lastResetTime = this.elapsed;
    data.stuckResets = (data.stuckResets || 0) + 1;
    data.lastResetReason = reason;
    if (reason === 'out-of-bounds') data.fallPenaltyCount = (data.fallPenaltyCount || 0) + 1;
    this.stuckResetCount += 1;

    data.mesh.position.copy(resetPos);
    if (data.visualQuaternion) data.mesh.quaternion.copy(data.visualQuaternion);
    data.lastVisualPosition = resetPos.clone();
  }

  syncMarbles() {
    this.marbleData.forEach((data) => {
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
      if (!data.pendingFallRespawn && closest.lateralSq <= (this.trackWidth * this.trackWidth * 0.9)) {
        data.lastSafeDistanceBeforeFall = Math.max(data.lastSafeDistanceBeforeFall || 0, closest.distance);
      }
      data.distance = Math.max(data.distance || 0, closest.distance);
      data.progress = clamp(data.distance / this.trackLength, 0, 1);
      if (!data.finished && closest.distance > (data.lastDistance || 0) + 0.45) {
        data.lastDistance = closest.distance;
        data.lastMovementTime = this.elapsed;
      }
    });
  }

  getRankingSlotPosition(index, collector, radius = 0.45) {
    if (collector.podiumStyle === 'top-3-on-podium-rest-below') {
      if (index < 3) {
        const slot = collector.podiumSlots[index];
        return collector.center.clone().add(this.localToWorldOffset(slot.x, slot.height + radius + 0.14, slot.z, collector.yaw));
      }
      const lowerIndex = index - 3;
      const cols = collector.lowerSlots?.cols || collector.cols || 4;
      const row = Math.floor(lowerIndex / cols);
      const col = lowerIndex % cols;
      const x = (col - (cols - 1) / 2) * collector.slotGap;
      const z = 2.35 + row * collector.slotGap;
      return collector.center.clone().add(this.localToWorldOffset(x, radius + 0.08, z, collector.yaw));
    }
    const col = index % collector.cols;
    const row = Math.floor(index / collector.cols);
    const x = (col - (collector.cols - 1) / 2) * collector.slotGap;
    const z = -collector.depth / 2 + 2.35 + row * collector.slotGap;
    return collector.center.clone().add(this.localToWorldOffset(x, radius + 0.08, z, collector.yaw));
  }

  checkFinishers() {
    this.marbleData.forEach((data) => {
      const finishThreshold = FINISH_LINE_RULE.threshold ?? 0.08;
      if (!data.finished && data.distance >= this.trackLength - finishThreshold) {
        data.finishTime = this.elapsed + (data.timePenalty || 0);
        data.body.linearDamping = 0.72;
        data.body.angularDamping = 0.78;
        const finishFrame = this.getTrackFrameAt(this.trackLength);
        const collector = this.finishRankingContainer;
        const index = this.finishers.length;
        const collectPos = collector
          ? this.getRankingSlotPosition(index, collector, data.radius)
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
        data.rank = index + 1;
        data.placedInFinishContainer = true;
        this.finishers.push(data);
        if (this.finishers.length === 1) {
          this.firstFinishTime = this.elapsed;
          this.defaultCameraPhaseUntil = this.elapsed + 3.2;
          this.ui.winner.textContent = `🏆 ${data.name} wins! ${data.finishTime.toFixed(2)}s`;
          this.ui.winner.classList.remove('hidden');
          this.pushBroadcastEvent('Winner Crowned', `${data.name} takes the flag in ${data.finishTime.toFixed(2)}s`, { kind: 'winner', force: true });
          this.triggerFinishSlowMotion(data, { reason: 'finish-line-crossed-fallback', crossed: true });
          this.playFinishSound(true);
          this.spawnImpactEffect(collectPos, 0xffd166, 'burst');
          this.spawnFinishConfetti(collectPos, 132, { cannon: true });
        }
      }
    });
    if (this.finishers.length === this.marbleData.length && this.marbleData.length > 0) {
      this.state = 'finished';
      this.showFinalShowcase();
      this.pushBroadcastEvent('Race Complete', 'Final podium and awards are locked in', { kind: 'complete', force: true });
      this.defaultCameraPhaseUntil = Math.max(this.defaultCameraPhaseUntil || 0, this.elapsed + 999);
    }
  }

  getRanking({ force = false } = {}) {
    const now = performance.now();
    const cacheMs = this.performanceProfile?.rankingCacheMs || 80;
    if (!force && this.cachedRanking && now - (this.cachedRankingAt || 0) < cacheMs) return this.cachedRanking;
    this.cachedRanking = [...this.marbleData].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    this.cachedRankingAt = now;
    this.cachedLeaderId = this.cachedRanking[0]?.id ?? null;
    return this.cachedRanking;
  }

  getReusableMarbleRegistry() {
    return this.marbleData.map((data) => ({
      id: data.id,
      code: data.code,
      name: data.name,
      displayName: data.displayName,
      colorName: data.colorName,
      colorHex: data.colorHex,
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
      code: data.code,
      name: data.name,
      colorName: data.colorName,
      colorHex: data.colorHex,
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
      reusableLine: `${data.code} | ${data.name} | ${data.colorName} ${data.colorHex} | ${data.patternName} | ${data.sizeName} r=${data.radius.toFixed(3)}`,
    }));
  }

  getReusableMarbleLine(data) {
    return `${data.code} | ${data.name} | ${data.colorName} ${data.colorHex} | ${data.patternName} | ${data.sizeName} r=${data.radius.toFixed(3)}`;
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
    this.ui.leaderboard.innerHTML = '';
    const fragment = document.createDocumentFragment();
    ranking.slice(0, 5).forEach((data, index) => {
      const li = document.createElement('li');
      if (data.finished) li.classList.add('finished');
      if (index === 0) li.classList.add('leader');
      const previousTopIndex = (this.previousTopFiveIds || []).indexOf(data.id);
      if (previousTopIndex > index) li.classList.add('rank-up');
      const color = `#${data.color.toString(16).padStart(6, '0')}`;
      const gapToLeader = ranking[0] && ranking[0].id !== data.id ? Math.max(0, (ranking[0].distance || 0) - (data.distance || 0)) : 0;
      const label = data.finished
        ? `${data.finishTime.toFixed(2)}s${data.timePenalty ? ` (+${data.timePenalty}s)` : ''}`
        : `${Math.round(data.progress * 100)}%${data.timePenalty ? ` +${data.timePenalty}s` : ''}`;
      const gapLabel = index === 0
        ? 'Leader'
        : (data.finished ? `#${index + 1}` : `+${gapToLeader.toFixed(1)}m`);
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
    const labels = { idle: 'Idle', ready: this.countdownActive ? 'Countdown' : 'Waiting for Gate', running: 'Racing', paused: 'Paused', finished: 'Finished' };
    this.ui.state.textContent = labels[this.state] || this.state;
    this.ui.elapsed.textContent = `${this.elapsed.toFixed(1)}s`;
    const debug = {
      marbleCount: this.marbleData.length,
      trackLength: this.trackLength,
      trackPreset: this.trackPresetKey,
      customTrackLength: this.customTrackLength || null,
      trackLengthPresets: TRACK_PRESETS,
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
      })),
      broadcastStorylines: {
        eventCount: this.broadcastEvents.length,
        lastEvent: this.broadcastEvents[0] || null,
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
      midTrackSpeedAssist: this.midTrackSpeedAssist,
      midTrackSpeedAssistCount: this.midTrackSpeedAssistCount,
      finalApproachAssist: this.finalApproachAssist,
      finishLineRule: FINISH_LINE_RULE,
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
      performanceProfile: this.performanceProfile,
      performanceOptimizations: [
        'fps-balanced-renderer-pixel-ratio',
        'shadows-disabled-for-race-fps',
        'lower-rail-tube-segments',
        'lower-physical-rail-body-budget',
        'fewer-decorative-point-lights',
        'reduced-trail-updates',
        'reduced-physics-substeps',
        'throttled-ui-debug-updates',
        'cached-ranking-sorts',
        'fragmented-leaderboard-render',
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
      startSlotDiagnostics: this.marbleData.map((data) => ({
        id: data.id,
        name: data.name,
        row: data.startSlotRow,
        column: data.startSlotColumn,
        laneCount: data.startSlotLaneCount,
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
      enabledObstacleTypes: [...(this.enabledObstacleTypes || new Set(PINBALL_OBSTACLE_TYPES))],
      pinballObstacleTypes: this.pinballObstacleTypes,
      pinballInteractions: this.pinballInteractions,
      activePinballObstacles: this.pinballObstacles.length,
      spectacleFeatures: ['broadcast-event-captions', 'impact-rings-and-sparks', 'marble-speed-trails', 'finish-slow-motion', 'finish-confetti-cannons', 'winner-showcase-awards', 'themed-sector-signage'],
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
      obstacleForcePolicy: 'only pinball obstacle handlers may call applyImpulse/applyForce during racing',
      functionalPinballObstacles: ['popBumper impulse', 'slingshot kick', 'spinnerGate spin impulse', 'rolloverLane boost', 'dropTarget knockdown'],
      removedObstacleDesigns: ['ramp', 'slanted/curved rail bumpers'],
      replacementObstacleDesigns: [],
      pinballMaterialStyle: 'pinball-table skin: clearcoat plastics, chrome bumper rings, neon rubber, lit rollover inserts',
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
      allFinishersPlaced: this.marbleData.length > 0 && this.finishers.length === this.marbleData.length && this.finishers.every((d) => d.placedInFinishContainer),
      finishedCount: this.finishers.length,
      finishLineVisualLength: 0.7,
      stuckReset: {
        enabled: true,
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
          timePenalty: d.timePenalty || 0,
          fallPenalties: d.fallPenaltyCount || 0,
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
      leftUICollapsed: this.leftUICollapsed,
      rightUICollapsed: this.rightUICollapsed,
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
      debugPanelCollapsed: this.ui.debugPanel?.classList.contains('collapsed') || false,
      recordingState: this.mediaRecorder?.state || 'inactive',
      recordingSource: this.recordingSource || null,
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
      defaultCameraMode: BROADCAST_CAMERA.defaultMode,
      activeDefaultCameraShot: this.getDefaultCameraMode(),
      defaultCameraSequence: BROADCAST_CAMERA.sequence,
      autoCameraDirector: BROADCAST_CAMERA.angleStyle,
      autoCameraOutOfBoundsIgnoreAfterSeconds: BROADCAST_CAMERA.outOfBoundsIgnoreAfterSeconds,
      autoCameraOutOfBoundsIgnoreLabel: BROADCAST_CAMERA.outOfBoundsIgnoreLabel,
      raceCompleteCameraMove: BROADCAST_CAMERA.podium360.label,
      podium360Camera: BROADCAST_CAMERA.podium360,
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
      cameraAngleStyle: 'high-angle overhead broadcast follow; lead battle switches to lower closer two-marble shot',
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
      activeDefaultCameraShot: debug.activeDefaultCameraShot,
      fps: debug.measuredFps,
      physicsSteps: debug.physicsSteps,
      finishedCount: debug.finishedCount,
      finishSlowMotion: debug.finishSlowMotion,
      confettiCount: debug.confettiCount,
      startGateOpen: debug.startGateOpen,
      trackLength: debug.trackLength,
      marbleCount: debug.marbleCount,
      trackStats: debug.trackStats,
      trackPieceCount: debug.modularTrackPieces?.length || 0,
      obstacleCount: debug.obstacleCount,
      speedLabel: debug.speedLabel,
      widthPresetKey: debug.widthPresetKey,
      obstaclePreset: debug.obstaclePreset?.label || debug.obstaclePreset,
      curveStyleKey: debug.curveStyleKey,
      trackDebugCodeLength: debug.trackDebugCode?.length || 0,
    };
    this.ui.debugConsole.textContent = JSON.stringify(compact, null, 2);
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

  getDefaultCameraMode() {
    if (this.state === 'finished') return BROADCAST_CAMERA.podium360.enabled ? 'podium360' : 'finish';
    if (this.finishers.length > 0) {
      if (this.elapsed < (this.defaultCameraPhaseUntil || 0)) return 'finish';
      return 'unfinishedOrder';
    }
    if (this.getLeadBattleTarget()) return 'leadBattle';
    const cycle = (this.elapsed || 0) % 24;
    if (cycle < 18) return 'leadPack';
    if (cycle < 22) return 'leader';
    return 'leadPack';
  }

  getNextUnfinishedTarget() {
    const unfinished = this.getAutoCameraRanking({ includeFinished: false })
      .sort((a, b) => b.progress - a.progress);
    if (!unfinished.length) return null;
    const index = Math.floor((this.elapsed - (this.firstFinishTime || 0)) / 4) % unfinished.length;
    return unfinished[index];
  }

  getPodiumCameraTarget() {
    const collector = this.finishRankingContainer;
    if (!collector) return null;
    return collector.center.clone().add(this.localToWorldOffset(0, 1.2, 0.9, collector.yaw));
  }

  updateCamera(delta) {
    const requestedMode = this.cameraMode;
    const activeCameraMode = requestedMode === 'default' ? this.getDefaultCameraMode() : requestedMode;
    const leader = this.getAutoCameraRanking({ includeFinished: true })[0] || this.getRanking({ force: false })[0];
    const selectedCandidate = this.marbleData[this.selectedIndex];
    const selected = selectedCandidate && !this.isMarbleIgnoredByAutoCamera(selectedCandidate) ? selectedCandidate : leader;
    const unfinishedTarget = this.getNextUnfinishedTarget();
    const leadPack = this.getLeadPackTarget();
    const leadBattle = activeCameraMode === 'leadBattle' ? this.getLeadBattleTarget() : null;
    let target = new THREE.Vector3(0, 0, -this.trackLength / 2);
    let desired = new THREE.Vector3(0, 52, 56);

    if (activeCameraMode === 'leadBattle' && leadBattle) {
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
      const distanceEase = 1 - Math.exp(-dt * 1.25);
      if (!this.leadPackInitialized) {
        this.cameraTargetSmoothed.copy(leadPack.center);
        this.leadPackDistanceSmoothed = leadPack.avgDistance;
        this.leadPackInitialized = true;
      } else {
        this.cameraTargetSmoothed.lerp(leadPack.center, distanceEase);
        this.leadPackDistanceSmoothed = lerp(this.leadPackDistanceSmoothed, leadPack.avgDistance, distanceEase);
      }
      const frame = this.getTrackFrameAt(this.leadPackDistanceSmoothed);
      target.copy(this.cameraTargetSmoothed);
      const packZoom = clamp(leadPack.size - 1, 0, 4);
      desired.copy(target)
        .add(frame.tangent.clone().multiplyScalar(cfg.back - packZoom * 0.45))
        .add(frame.right.clone().multiplyScalar(cfg.side))
        .add(new THREE.Vector3(0, cfg.height + packZoom * cfg.packHeightStep, 0));
    } else if (activeCameraMode === 'leader' && leader) {
      const cfg = BROADCAST_CAMERA.leader;
      const frame = this.getTrackFrameAt(leader.distance || 0);
      target.copy(leader.mesh.position);
      desired.copy(leader.mesh.position)
        .add(frame.tangent.clone().multiplyScalar(cfg.back))
        .add(frame.right.clone().multiplyScalar(cfg.side))
        .add(new THREE.Vector3(0, cfg.height, 0));
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
      const t = this.elapsed * 0.9;
      const frame = this.getTrackFrameAt(leader.distance || 0);
      target.copy(leader.mesh.position).add(new THREE.Vector3(0, 0.75, 0));
      desired.copy(target)
        .add(frame.tangent.clone().multiplyScalar(-13 - Math.sin(t * 0.7) * 3))
        .add(frame.right.clone().multiplyScalar(Math.sin(t) * 8))
        .add(new THREE.Vector3(0, 17 + Math.cos(t * 0.55) * 2.2, 0));
    } else if (activeCameraMode === 'finish') {
      const cfg = BROADCAST_CAMERA.finish;
      const frame = this.getTrackFrameAt(this.trackLength);
      target.set(frame.p.x, frame.p.y + 1.05, frame.p.z);
      desired.copy(target).add(frame.tangent.clone().multiplyScalar(cfg.forward)).add(new THREE.Vector3(0, cfg.height, 0));
    } else if (activeCameraMode === 'podium360') {
      const cfg = BROADCAST_CAMERA.podium360;
      const podiumTarget = this.getPodiumCameraTarget() || new THREE.Vector3(0, 1.2, 0);
      const collector = this.finishRankingContainer;
      const t = this.elapsed * cfg.angularSpeed;
      const radius = cfg.radius;
      target.copy(podiumTarget);
      desired.copy(target).add(this.localToWorldOffset(
        Math.sin(t) * radius,
        cfg.height + Math.sin(t * 0.7) * cfg.heightBob,
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
    this.updateMarbleNameLabels();
    desired.copy(this.getMouseOrbitAdjustedCamera(desired, target));
    const isLeadCloseMode = activeCameraMode === 'leadPack' || activeCameraMode === 'leadBattle';
    const positionSmooth = isLeadCloseMode ? 1 - Math.exp(-delta * (activeCameraMode === 'leadBattle' ? 3.2 : 2.1)) : 1 - Math.pow(0.001, delta);
    const targetSmooth = isLeadCloseMode ? 1 - Math.exp(-delta * (activeCameraMode === 'leadBattle' ? 4.2 : 2.8)) : 1 - Math.pow(0.001, delta);
    this.camera.position.lerp(desired, positionSmooth * (activeCameraMode === 'leadBattle' ? 0.78 : activeCameraMode === 'leadPack' ? 0.62 : 0.72));
    this.controls.target.lerp(target, targetSmooth);
    this.camera.lookAt(this.controls.target);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new MarbleRace(), { once: true });
} else {
  new MarbleRace();
}
