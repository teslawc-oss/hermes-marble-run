import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  js,
  /createBroadcastMarkerTexture\(label\) \{/,
  'broadcast marker should have a canvas texture helper for readable text'
);
assert.match(
  js,
  /new THREE\.BoxGeometry\(8\.8, 2\.2, 0\.16\)/,
  'broadcast marker signboard should be enlarged'
);
assert.match(
  js,
  /map: this\.createBroadcastMarkerTexture\(sector\.label\)/,
  'broadcast marker material should use sector label texture'
);
assert.match(
  js,
  /ctx\.fillText\(label, 512, 256\)/,
  'broadcast marker texture should render the label centered and large'
);
assert.match(
  js,
  /new THREE\.BoxGeometry\(7\.8, 0\.22, 0\.18\)/,
  'cyan stripe should be scaled with the larger sign'
);
console.log('broadcast marker readable sign static checks passed');
