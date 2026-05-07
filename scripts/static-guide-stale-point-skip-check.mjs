import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /guideStallSkipDistance:\s*2\.35,/,
  'guide point policy should define a small forward skip distance for unreachable guide points'
);

assert.match(
  js,
  /guideStallSeconds:\s*1\.15,/,
  'guide point policy should define how long a guide can remain unreachable before skipping'
);

assert.match(
  js,
  /guideBlockedByObstacleRadiusPadding:\s*0\.55,/,
  'guide point policy should define obstacle overlap padding for diagnostics'
);

assert.match(
  js,
  /getGuideBlockingObstacle\(guideDistance\)\s*{/,
  'should expose helper that detects obstacles overlapping the current guide distance'
);

assert.match(
  js,
  /Math\.abs\(entry\.distance - guideDistance\) <= obstacleRadius \+ padding/,
  'guide obstacle overlap check should compare obstacle distance to guide distance with radius padding'
);

assert.match(
  js,
  /const guideStalled = Boolean\([\s\S]*?this\.elapsed - \(data\.lastGuideReachTime \?\? this\.elapsed\) >= \(this\.guidePointPolicy\?\.guideStallSeconds \?\? 1\.15\)[\s\S]*?guidePointAheadDistance <= \(this\.guidePointPolicy\?\.guideUnreachedAheadDistance \?\? 1\.25\)[\s\S]*?\);/,
  'resolveDriveGuide should detect guide points that remain unreached near the marble'
);

assert.match(
  js,
  /if \(guideStalled && !airborneAssistPaused\) \{[\s\S]*?guideDistance = clamp\(Math\.max\(guideDistance, driveDistance \+ skipDistance\), 0, this\.trackLength\);[\s\S]*?guideFrameSource = guideBlockingObstacle \? 'stalled-guide-skip-obstacle-overlap' : 'stalled-guide-skip-next-point';/,
  'stalled guide should advance to a small next point, with obstacle-overlap source when applicable'
);

assert.match(
  js,
  /data\.lastGuideReachTime = this\.elapsed;/,
  'marble state should update lastGuideReachTime when guide point is reached/passed'
);

assert.match(
  js,
  /guideStalled,/,
  'guide diagnostics should expose stalled guide flag'
);

assert.match(
  js,
  /guideBlockingObstacle,/,
  'guide diagnostics should expose blocking obstacle details'
);

assert.match(
  js,
  /guideStalled:\s*d\.guideStalled \?\? null,/,
  'forward drive samples should include guide stalled flag'
);

assert.match(
  js,
  /guideBlockingObstacle:\s*d\.guideBlockingObstacle \|\| null,/,
  'forward drive samples should include guide blocking obstacle details'
);

console.log('guide stale point skip static checks passed');
