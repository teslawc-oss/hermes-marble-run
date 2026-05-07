import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const requirements = [
  ['slope drive preserves sustain assists', /preserveSpeedAssists:\s*true/],
  ['minimum forward speed floor covers finish', /const MIN_FORWARD_SPEED_ASSIST = \{[\s\S]*endsBeforeProgress:\s*1\.01[\s\S]*minForwardSpeedRatio:\s*0\.42/],
  ['mid-track sustain assist enabled through late race', /const MID_TRACK_SPEED_ASSIST = \{[\s\S]*enabled:\s*true[\s\S]*endsBeforeProgress:\s*1\.01[\s\S]*impulseScale:\s*0/],
  ['final approach force-only assist enabled before 75% stall can become permanent', /const FINAL_APPROACH_ASSIST = \{[\s\S]*enabled:\s*true[\s\S]*startsAfterProgress:\s*0\.84[\s\S]*finishDistance:\s*22[\s\S]*finishThreshold:\s*8[\s\S]*impulseScale:\s*0[\s\S]*useDirectFinishVector:\s*true[\s\S]*directFinishBlendDistance:\s*26/],
  ['mid-track assist is force-only guarded before applyImpulse', /if \(assist\.impulseScale > 0 && this\.elapsed - \(data\.lastMidTrackSpeedAssistTime \?\? -Infinity\) >= assist\.cooldown\)[\s\S]*data\.body\.applyImpulse/],
  ['final approach assist is force-only guarded before applyImpulse', /if \(assist\.impulseScale > 0 && this\.elapsed - \(data\.lastFinalApproachAssistTime \?\? -Infinity\) >= assist\.cooldown\)[\s\S]*data\.body\.applyImpulse/],
  ['track debug payload includes drive assist settings', /driveAssist:\s*\{[\s\S]*slopeDrive:\s*this\.slopeDrive[\s\S]*minimumForwardSpeedAssist:\s*this\.minForwardSpeedAssist[\s\S]*midTrackSpeedAssist:\s*this\.midTrackSpeedAssist[\s\S]*finalApproachAssist:\s*this\.finalApproachAssist[\s\S]*directionStabilityAssist:\s*this\.directionStabilityAssist/],
  ['track debug piece distances use generated startD/endD fallback', /startDistance:\s*Number\(\(\(piece\.startDistance \?\? piece\.startD\)[\s\S]*endDistance:\s*Number\(\(\(piece\.endDistance \?\? piece\.endD\)/],
  ['debug exposes speed assist policy for console verification', /speedAssistPolicy:\s*\{[\s\S]*forceOnlySustainAssists:[\s\S]*finalApproachDirectFinishVector:[\s\S]*finishDetectionThreshold:[\s\S]*lateTrackCoverageEndProgress:[\s\S]*final-sector back-and-forth oscillation/],
  ['finish approach frame points directly from marble to finish', /getFinishApproachFrame\(data, fallbackFrame\) \{[\s\S]*finishPoint\.x - data\.body\.position\.x[\s\S]*directFinishVector:\s*true/],
  ['final approach assist uses direct finish vector inside blend distance', /const finishFrame = assist\.useDirectFinishVector && remaining <= \(assist\.directFinishBlendDistance \|\| assist\.finishDistance\)[\s\S]*\? this\.getFinishApproachFrame\(data, frame\)[\s\S]*finishVelocity\.dot\(finishFrame\.tangent\)[\s\S]*finishFrame\.tangent\.clone\(\)/],
  ['forward drive applies minimum assist before post-assist speed cap', /this\.applyMinimumForwardSpeed\(data, centerFrame, centerForwardSpeed, maxSpeed, progress, velocity\);[\s\S]*const postAssistHorizontalSpeed = Math\.hypot/],
  ['direction stability / rail guide explicitly disabled by user request', /const DIRECTION_STABILITY_ASSIST = \{[\s\S]*enabled:\s*false[\s\S]*disabledReason:\s*'user requested cancelling all rail-hit center guide \/ return-to-center assists; passive rail collision remains'[\s\S]*centerCorrectionForceScale:\s*0[\s\S]*lateralDamping:\s*1[\s\S]*backwardDamping:\s*1[\s\S]*tangentRecoveryForceScale:\s*0[\s\S]*no rail-hit return-to-center guide/],
  ['disabled direction stability is still ordered before minimum speed floor but exits immediately', /applyDirectionStabilityAssist\(data, closest, frame, velocity, rawForwardSpeed, maxSpeed, progress = null, centerFrame = frame\)[\s\S]*if \(!assist\?\.enabled \|\| data\.finished \|\| !this\.trackLength\) return;[\s\S]*this\.applySlopeForwardAcceleration\(data, slopeFrame, forwardSpeed, maxSpeed, rawForwardSpeed, velocity\);[\s\S]*this\.applyDirectionStabilityAssist\(data, closest, frame, velocity, rawForwardSpeed, maxSpeed, progress, centerFrame\);[\s\S]*this\.applyMinimumForwardSpeed/],
  ['rail contact is recorded and debug exposes disabled rail guide policy', /body\.addEventListener\('collide'[\s\S]*otherBody\?\.material === this\.railMaterial[\s\S]*data\.lastRailContactTime = this\.elapsed[\s\S]*directionStabilityPolicy:\s*\{[\s\S]*enabled:\s*Boolean\(this\.directionStabilityAssist\?\.enabled\)[\s\S]*disabledReason:\s*this\.directionStabilityAssist\?\.disabledReason[\s\S]*railGuidePolicy:\s*this\.railGuidePolicy[\s\S]*no automatic return-to-center guide/],
  ['MR1 debug code pasted into seed is decoded instead of recursively becoming seed material', /function decodeTrackDebugCode\(value\)[\s\S]*startsWith\('MR1:'\)[\s\S]*JSON\.parse[\s\S]*function normalizeSeedInput\(rawSeed\)[\s\S]*decoded\?\.app === 'marble-race'[\s\S]*seed:\s*String\(decoded\.seed \|\| decoded\.rngMaterial \|\| value\)[\s\S]*seedInputSanitization:[\s\S]*MR1 debug codes pasted into Seed are decoded/],
  ['preserved assists run after speed cap as sustained force only', /if \(this\.slopeDrive\?\.preserveSpeedAssists\) \{[\s\S]*this\.applyMidTrackSpeedAssist\(data, centerFrame, centerForwardSpeed, maxSpeed, progress, velocity\);[\s\S]*this\.applyFinalApproachAssist\(data, frame, forwardSpeed, maxSpeed, progress, distanceToFinish\);/],
];

for (const [label, pattern] of requirements) {
  assert(pattern.test(js), `Missing speed sustain regression requirement: ${label}`);
}

console.log('speed sustain regression checks passed');
