import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const requiredSnippets = [
  'getSmoothedRailPoints(points, width)',
  'const sampleStep = 0.55',
  "visualRailSmoothing = 'frame-sampled-rounded-corners'",
  "guardRailJoinStyle = 'optimized-rounded-corner-frame-sampled-overlapped'",
  'guardRailInterval: 1.65',
  'guardRailOverlap: 3.35',
  'maxPhysicalRailBodies: 520',
  'const wallThickness = 0.82',
  'const targetBodyBudget = this.performanceProfile?.maxPhysicalRailBodies || 520',
  'const budgetInterval = this.trackLength > 0 ? (this.trackLength * 2) / targetBodyBudget : 1.65',
  'Math.max(this.performanceProfile?.guardRailInterval || 1.65, budgetInterval)',
  'const overlap = this.performanceProfile?.guardRailOverlap || 3.35',
  "railOptimization = 'wider-fewer-overlapped-bodies'",
  'const frameA = this.getTrackFrameAt(aD)',
  'const frameB = this.getTrackFrameAt(bD)',
  'guardRailVisualSmoothing: this.trackStats.visualRailSmoothing || null',
  'guardRailJoinStyle: this.trackStats.guardRailJoinStyle || null',
];

for (const snippet of requiredSnippets) {
  assert.ok(source.includes(snippet), `Missing expected rounded/optimized guardrail snippet: ${snippet}`);
}

assert.match(
  source,
  /getSmoothedRailPoints[\s\S]*for \(let d = 0; d <= this\.trackLength; d \+= sampleStep\)[\s\S]*this\.getTrackFrameAt\(d\)[\s\S]*right: frame\.right\.clone\(\)/,
  'Visual rails should be resampled from track frames so 90-degree bends render as rounded tubes instead of angular joins.'
);

assert.match(
  source,
  /addPhysicalGuardRails[\s\S]*targetBodyBudget[\s\S]*budgetInterval[\s\S]*frameA[\s\S]*frameB[\s\S]*offsetA[\s\S]*offsetB/,
  'Physical rails should stay endpoint-frame based while using a body budget to avoid too many Cannon static boxes.'
);

assert.match(
  source,
  /performanceOptimizations: \[[\s\S]*'guardrail-body-budget'[\s\S]*'wider-fewer-overlapped-guardrail-bodies'[\s\S]*'throttled-ui-debug-updates'/,
  'Debug output should advertise the guardrail body budget and throttled UI/debug optimizations.'
);

console.log('rounded/optimized guardrail static checks passed');
