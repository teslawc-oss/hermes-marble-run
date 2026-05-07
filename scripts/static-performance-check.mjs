import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const requiredSnippets = [
  "mode: 'optimized'",
  'maxPhysicalRailBodies: 520',
  'uiUpdateMs: 300',
  'debugUpdateMs: 600',
  'leaderboardUpdateMs: 450',
  'rankingCacheMs: 120',
  "performanceOptimizations: ['guardrail-body-budget'",
  'this.getRanking({ force: false })[0]',
  'ranking.slice(0, 32)',
  'document.createDocumentFragment()',
];

for (const snippet of requiredSnippets) {
  assert.ok(source.includes(snippet), `Missing expected performance snippet: ${snippet}`);
}

assert.ok(!source.includes('guardRailInterval: 1.25'), 'Old dense rail interval should not remain in the performance profile.');
assert.ok(!source.includes('leaderboardUpdateMs: 300'), 'Old high-frequency leaderboard update interval should not remain.');
assert.ok(!source.includes('rankingCacheMs: 80'), 'Old short ranking cache interval should not remain.');

assert.match(
  source,
  /if \(now - this\.lastUIUpdate > \(this\.performanceProfile\?\.uiUpdateMs \|\| 200\)\)[\s\S]*this\.updateUI\(\)/,
  'UI/debug state should remain throttled rather than being rebuilt every frame.'
);

console.log('performance static checks passed');
