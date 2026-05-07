#!/usr/bin/env node
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const checks = [
  ['slope lookAhead reduced to short value', /const SLOPE_DRIVE = \{[\s\S]*lookAhead:\s*1\.1[\s\S]*maxSpeedRatio:\s*0\.92[\s\S]*forecastBehindTolerance:\s*0\.05[\s\S]*lookAheadReducedReason:\s*'continuous 90-degree corners felt like checkpoint pull/],
  ['slope forecast falls back to centerFrame if forecast target is behind marble', /const forecastAheadDistance = new THREE\.Vector3\([\s\S]*frame\.p\.x - data\.body\.position\.x[\s\S]*\.dot\(centerFrame\.tangent\);[\s\S]*const useForecastFrame = forecastAheadDistance >= -forecastBehindTolerance;[\s\S]*const slopeFrame = useForecastFrame \? frame : centerFrame;/],
  ['slope drive uses slopeFrame guarded by behind-forecast check', /const rawForwardSpeed = velocity\.dot\(slopeFrame\.tangent\);[\s\S]*this\.applySlopeForwardAcceleration\(data, slopeFrame, forwardSpeed, maxSpeed, rawForwardSpeed, velocity\)/],
  ['final horizontal speed cap runs after preserved speed assists', /this\.applyFinalApproachAssist\(data, frame, forwardSpeed, maxSpeed, progress, distanceToFinish\);[\s\S]*const finalHorizontalSpeed = Math\.hypot\(data\.body\.velocity\.x, data\.body\.velocity\.z\);[\s\S]*if \(this\.slopeDrive\?\.capHorizontalSpeed && finalHorizontalSpeed > maxSpeed\)/],
  ['minimum speed assist called with centerFrame', /this\.applyMinimumForwardSpeed\(data, centerFrame, centerForwardSpeed, maxSpeed, progress, velocity\)/],
  ['mid-track assist called with centerFrame', /this\.applyMidTrackSpeedAssist\(data, centerFrame, centerForwardSpeed, maxSpeed, progress, velocity\)/],
  ['center forward speed computed from centerFrame tangent', /const centerRawForwardSpeed = velocity\.dot\(centerFrame\.tangent\);[\s\S]*const centerForwardSpeed = Math\.max\(0, centerRawForwardSpeed\);/],
  ['minimum assist measures speed against passed frame tangent', /const assistForwardSpeed = Math\.max\(0, currentVelocity\.dot\(frame\.tangent\)\);[\s\S]*const speedGap = targetForwardSpeed - assistForwardSpeed;/],
  ['mid assist measures speed against passed frame tangent', /const assistForwardSpeed = Math\.max\(0, assistVelocity\.dot\(frame\.tangent\)\);[\s\S]*const speedGapRatio = clamp\(\(targetForwardSpeed - assistForwardSpeed\)/],
  ['debug exposes checkpoint pull mitigation policy', /checkpointPullMitigation:\s*'short slope lookAhead; min\/mid speed assists use centerFrame at driveDistance, not lookAhead frame'/],
  ['debug exposes center and lookAhead tangents', /driveFrameTangent:\s*d\.driveFrameTangent \|\| null[\s\S]*centerFrameTangent:\s*d\.centerFrameTangent \|\| null/],
  ['debug exposes forecast behind guard and speed cap', /slopeFrameSource:\s*d\.slopeFrameSource \|\| null[\s\S]*slopeFrameForecastAheadDistance:\s*d\.slopeFrameForecastAheadDistance \?\? null[\s\S]*finalSpeedCapApplied:\s*Boolean\(d\.finalSpeedCapApplied\)/],
  ['debug exposes frame source for min and mid assists', /midTrackSpeedAssistFrameSource:[\s\S]*centerFrame-at-driveDistance-no-lookAhead[\s\S]*minForwardSpeedFrameSource:[\s\S]*centerFrame-at-driveDistance-no-lookAhead/],
];

for (const [name, pattern] of checks) {
  if (!pattern.test(source)) {
    console.error(`lookahead/centerFrame assist check failed: ${name}`);
    process.exit(1);
  }
}

const badCalls = [
  /this\.applyMinimumForwardSpeed\(data, frame, forwardSpeed, maxSpeed, progress, velocity\)/,
  /this\.applyMidTrackSpeedAssist\(data, frame, forwardSpeed, maxSpeed, progress\)/,
];
for (const pattern of badCalls) {
  if (pattern.test(source)) {
    console.error(`lookahead/centerFrame assist check failed: legacy lookAhead frame assist call remains: ${pattern}`);
    process.exit(1);
  }
}

console.log('lookAhead center-frame assist static checks passed');
