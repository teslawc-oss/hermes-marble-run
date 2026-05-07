import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /const FINAL_APPROACH_ASSIST = \{\s*enabled: false,/,
  'final approach / finish pull assist should be disabled'
);

assert.match(
  js,
  /disabledReason:\s*'user requested cancelling finish pull \/ final approach assist; passive track physics and non-finish assists remain'/,
  'final approach assist should record why it is disabled'
);

assert.match(
  js,
  /finalApproachAssist:\s*this\.finalApproachAssist,/,
  'debug track code should still expose the disabled final approach assist config'
);

assert.match(
  js,
  /finalApproachAssistSkippedReason: d\.finalApproachAssistSkippedReason \?\? null,/,
  'debug payload should keep final approach skipped diagnostics available'
);

console.log('final approach assist disabled static checks passed');
