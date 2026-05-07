#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

assert.match(
  html,
  /<button[^>]+id="right-ui-toggle-btn"[^>]+class="[^"]*ui-toggle[^"]*right-ui-toggle[^"]*"[^>]+aria-controls="right-hud"[^>]+aria-expanded="true"[^>]*>Hide Right UI<\/button>/,
  'right UI toggle button should live outside the right HUD and control #right-hud',
);
assert.match(
  html,
  /<aside\s+id="right-hud"\s+class="hud hud-right">/,
  'right HUD needs an id so the toggle can target it accessibly',
);

assert.match(css, /\.right-ui-toggle\s*\{[\s\S]*bottom:\s*66px;[\s\S]*\}/, 'right UI toggle should be fixed at the lower-left stack above the left UI toggle');
assert.match(css, /\.hud-left,\s*\.hud-right\s*\{[\s\S]*transition:\s*transform 0\.24s ease, opacity 0\.2s ease;[\s\S]*\}/, 'right HUD should use the same transform/opacity transition pattern as left HUD');
assert.match(css, /\.hud-right\.collapsed\s*\{[\s\S]*transform:\s*translateX\(calc\(100% \+ 28px\)\);[\s\S]*opacity:\s*0;[\s\S]*pointer-events:\s*none;[\s\S]*\}/, 'collapsed right HUD should slide out to the right and stop intercepting pointer events');

assert.match(source, /this\.rightUICollapsed\s*=\s*false;/, 'right UI collapsed state should initialize false');
assert.match(source, /rightHud:\s*document\.querySelector\('#right-hud'\)/, 'main UI refs should include rightHud');
assert.match(source, /rightUiToggle:\s*document\.querySelector\('#right-ui-toggle-btn'\)/, 'main UI refs should include right toggle button');
assert.match(source, /this\.ui\.rightUiToggle\.addEventListener\('click', \(\) => this\.toggleRightUI\(\)\)/, 'right toggle click should call toggleRightUI');
assert.match(source, /event\.key\.toLowerCase\(\) === 'j'[\s\S]*this\.toggleRightUI\(\)/, 'keyboard shortcut J should toggle right UI while not typing');
assert.match(source, /toggleRightUI\(\)\s*\{[\s\S]*this\.rightUICollapsed = !this\.rightUICollapsed;[\s\S]*this\.ui\.rightHud\.classList\.toggle\('collapsed', this\.rightUICollapsed\);[\s\S]*Show Right UI[\s\S]*Hide Right UI[\s\S]*aria-expanded[\s\S]*this\.updateUI\(\);[\s\S]*\}/, 'toggleRightUI should update class, text/title/aria, and debug UI');
assert.match(source, /rightUICollapsed:\s*this\.rightUICollapsed/, 'debug object should expose rightUICollapsed');
assert.match(source, /rightUIToggleLocation:\s*'bottom-left stacked above left UI toggle'/, 'debug object should expose right toggle placement');

console.log('right UI toggle static checks passed');
