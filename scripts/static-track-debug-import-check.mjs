import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  html,
  /<textarea[^>]+id="track-code-import"[^>]+placeholder="Paste MR1:/s,
  'race actions should provide a dedicated large textarea for pasting an MR1 debug code instead of only the Random Seed field'
);

assert.match(
  html,
  /<button[^>]+id="import-track-code-btn"[^>]*>Import Track Code<\/button>/,
  'race actions should expose an Import Track Code button'
);

assert.match(
  html,
  /id="track-code-import-status"[^>]+aria-live="polite"/,
  'import result should be announced beside the paste box'
);

assert.match(
  js,
  /trackCodeImport:\s*document\.querySelector\('#track-code-import'\)/,
  'MarbleRace UI bindings should include the import textarea'
);

assert.match(
  js,
  /importTrackCode:\s*document\.querySelector\('#import-track-code-btn'\)/,
  'MarbleRace UI bindings should include the import button'
);

assert.match(
  js,
  /this\.ui\.importTrackCode\?\.addEventListener\('click',\s*\(\) => this\.importTrackDebugCode\(\)\)/,
  'Import Track Code button should call importTrackDebugCode()'
);

assert.match(
  js,
  /importTrackDebugCode\(\)\s*\{[\s\S]*decodeTrackDebugCode\(this\.ui\.trackCodeImport\.value\)/,
  'importTrackDebugCode() should decode the pasted MR1 code from the dedicated textarea'
);

assert.match(
  js,
  /applyImportedTrackDebugSettings\(payload\)\s*\{[\s\S]*this\.ui\.seed\.value\s*=\s*String\(payload\.seed \|\| payload\.rngMaterial \|\| ''\)/,
  'import should apply the original seed/rng material to the seed field'
);

assert.match(
  js,
  /applyImportedTrackDebugSettings\(payload\)\s*\{[\s\S]*this\.ui\.lengthSelect\.value\s*=\s*payload\.trackPresetKey[\s\S]*this\.ui\.customLength\.value\s*=\s*String\(payload\.customTrackLength[\s\S]*this\.ui\.width\.value\s*=\s*String\(widthIndex\)[\s\S]*this\.ui\.speed\.value\s*=\s*String\(payload\.speedIndex[\s\S]*this\.ui\.obstacle\.value\s*=\s*String\(payload\.obstacleIndex[\s\S]*this\.ui\.curveSelect\.value\s*=\s*payload\.curveStyleKey/s,
  'import should restore preset, custom length, width, speed, obstacle density, and curve style before regenerating'
);

assert.match(
  js,
  /importTrackDebugCode\(\)\s*\{[\s\S]*this\.newRace\(\{ regenerateTrack: true \}\)/,
  'import should regenerate the same track after applying settings'
);

assert.match(
  js,
  /trackDebugImportUi:\s*\{[\s\S]*enabled:\s*Boolean\(this\.ui\.trackCodeImport && this\.ui\.importTrackCode\)[\s\S]*lastImportStatus:/,
  'debug object should expose import UI support and last import status'
);

console.log('track debug import UI static checks passed');
