import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(/id="debug-copy-btn"/.test(html), 'debug console copy button is missing from index.html');
assert(/Copy Debug/.test(html), 'debug console copy button label is missing');
assert(/debugConsoleCopy:\s*document\.querySelector\('#debug-copy-btn'\)/.test(src), 'debugConsoleCopy UI binding is missing');
assert(/copyDebugConsole\(/.test(src), 'copyDebugConsole method is missing');
assert(/updateDebugConsole\(debug = window\.__MARBLE_RACE_DEBUG__\)/.test(src), 'updateDebugConsole method is missing');
assert(/this\.ui\.debugConsole\.textContent = JSON\.stringify\(compact, null, 2\)/.test(src), 'debug console compact renderer is missing');
assert(/this\.ui\.debugConsoleCopy\?\.addEventListener\('click',\s*\(\) => this\.copyDebugConsole\(\)\)/.test(src), 'debug console copy click handler is missing');
assert(src.includes('navigator.clipboard?.writeText') && src.includes('navigator.clipboard.writeText(debugText)'), 'debug console copy method should use clipboard API with debug text');
assert(/this\.ui\.debugCopyStatus/.test(src), 'debug console copy status field is missing');

assert(/buildDebugConsoleCopyPayload\(debug = window\.__MARBLE_RACE_DEBUG__\)/.test(src), 'full debug copy payload builder is missing');
assert(/const debugPayload = this\.buildDebugConsoleCopyPayload\(\)/.test(src), 'copyDebugConsole should copy the full live debug payload, not only compact panel text');
assert(/JSON\.stringify\(debugPayload, null, 2\)/.test(src), 'copyDebugConsole should serialize the full debug payload');
assert(/marbles:\s*payload\.marbleProgressSamples/.test(src), 'full debug copy should include live marble progress samples');
assert(/railDiagnostics:\s*payload\.railDiagnostics/.test(src), 'full debug copy should include live rail diagnostics');
assert(/forwardDriveSamples:\s*payload\.forwardDriveSamples/.test(src), 'full debug copy should include guide/forward drive samples');
assert(/stuckReset:\s*payload\.stuckReset/.test(src), 'full debug copy should include stuck reset diagnostics');
assert(/obstaclesAroundIssue/.test(src), 'full debug copy should include obstacle window around the issue zone');
assert(/trackDebugCode:\s*payload\.trackDebugCode/.test(src), 'full debug copy should include the MR1 track debug code');

console.log('debug console copy static checks passed');
