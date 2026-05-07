import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const htmlRequirements = [
  ['#track-code-output textarea', /<textarea[^>]+id="track-code-output"[^>]+readonly[^>]*>/s],
  ['#copy-track-code-btn button', /<button[^>]+id="copy-track-code-btn"[^>]*>Copy Track Code<\/button>/s],
  ['#track-code-status live region', /id="track-code-status"[^>]+aria-live="polite"/s],
];
for (const [label, pattern] of htmlRequirements) {
  assert(pattern.test(html), `Missing HTML requirement: ${label}`);
}

const jsRequirements = [
  ['MR1 base64 encoder', /function encodeTrackDebugCode\(payload\)[\s\S]*MR1:/],
  ['UI selector for track code textarea', /trackCodeOutput:\s*document\.querySelector\('#track-code-output'\)/],
  ['UI selector for copy button', /copyTrackCode:\s*document\.querySelector\('#copy-track-code-btn'\)/],
  ['copy button event handler', /copyTrackCode\?\.addEventListener\('click', \(\) => this\.copyTrackDebugCode\(\)\)/],
  ['debug payload method', /getTrackDebugPayload\(\)\s*{/],
  ['seed included in payload', /seed:\s*this\.seed/],
  ['track pieces included in payload', /trackPieces:\s*this\.trackPieces\.map/],
  ['obstacle settings included in payload', /obstacleIndex:\s*this\.obstacleIndex[\s\S]*obstacleMultiplier:/],
  ['speed setting included in payload', /speedIndex:\s*this\.speedIndex/],
  ['clipboard fallback', /navigator\.clipboard\?\.writeText[\s\S]*document\.execCommand\('copy'\)/],
  ['updates after track regeneration', /this\.createTrack\(\);\s*this\.updateTrackDebugCode\(\);/],
  ['debug object exposes code', /trackDebugCode:\s*this\.currentTrackDebugCode/],
  ['debug object exposes reproduction settings list', /includesReproductionSettings:\s*\[[^\]]*'seed'[^\]]*'trackPieces'[^\]]*\]/s],
];
for (const [label, pattern] of jsRequirements) {
  assert(pattern.test(js), `Missing JS requirement: ${label}`);
}

const cssRequirements = [
  ['track code row style', /\.track-code-row\s*{/],
  ['textarea monospace style', /#track-code-output\s*{[\s\S]*font-family:\s*ui-monospace/],
  ['copy action layout', /\.track-code-actions\s*{/],
];
for (const [label, pattern] of cssRequirements) {
  assert(pattern.test(css), `Missing CSS requirement: ${label}`);
}

console.log('track debug code static checks passed');
