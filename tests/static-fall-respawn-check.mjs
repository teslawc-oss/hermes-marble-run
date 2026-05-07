import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(source, /fallRespawnDelay\s*=\s*2(?:\.0)?/, 'Fall respawn delay should be 2 seconds');
assert.match(source, /scheduleFallRespawn\(data,\s*closest\.distance/, 'Out-of-bounds should schedule delayed fall respawn instead of immediate reset');
assert.doesNotMatch(source, /applyFallTimePenalty\(data\);\s*\n\s*this\.resetStuckMarble\(data, closest\.distance, 'out-of-bounds'\)/, 'Out-of-bounds should not immediately apply time penalty and reset');
assert.match(source, /data\.pendingFallRespawn/, 'Marble state should record pending fall respawn');
assert.match(source, /data\.lastSafeDistanceBeforeFall/, 'Respawn should use a safe pre-fall track distance');
assert.match(source, /respawnDistance\s*=\s*Math\.max\(0,\s*safeDistance - this\.stuckResetPenalty\)/, 'Respawn position should be behind the safe pre-fall track position');
assert.match(source, /reason === 'out-of-bounds'[^]*?data\.fallPenaltyCount = \(data\.fallPenaltyCount \|\| 0\) \+ 1/, 'Out-of-bounds should count falls inside reset path');
assert.doesNotMatch(source, /reason === 'out-of-bounds'[^]*?data\.timePenalty = \(data\.timePenalty \|\| 0\) \+ penalty/, 'Out-of-bounds should not add a race-time penalty');
assert.match(source, /fallRespawn:\s*\{[^}]*delaySeconds:\s*this\.fallRespawnDelay[^}]*timePenaltySeconds:\s*0/s, 'Debug output should expose 2s delayed no-time-penalty fall respawn');

console.log('fall respawn static checks passed');
