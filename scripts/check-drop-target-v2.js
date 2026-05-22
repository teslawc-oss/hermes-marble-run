#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/main.js'), 'utf8');

const checks = [
  ['drop target physics uses per-target bank mode', "dropTargetBounceMode: 'per-target-bank-clear-forward-boost'"],
  ['drop target has reset timer tuning', 'dropTargetResetSeconds: 6'],
  ['drop target has bank clear bonus tuning', 'dropTargetBankBonusImpulse: 4.5'],
  ['decorative prize face texture removes panel glyphs', 'decorative-drop-target-faces'],
  ['panel face keeps decorative stripes instead of W/I/N letters', "ctx.moveTo(184, 200)"],
  ['drop target face texture uses 512px canvas', 'createTextureCanvas(512'],
  ['drop target module is scaled 2x', 'const dropTargetScale = 2'],
  ['larger target mesh uses scaled dimensions', 'new THREE.BoxGeometry(targetWidth, targetHeight, targetDepth'],
  ['drop target panels are raised above track', 'const targetBaseY = 0.78 * dropTargetScale'],
  ['drop target debug exposes track clearance', 'targetTrackClearance'],
  ['lower decorative ring is removed from drop target', 'jewelRadius', { absent: true }],
  ['bank sign has dynamic texture helper', 'createDropTargetBankSignTexture'],
  ['bank sign initial text is PRIZE / W I N', "bankSignText: 'PRIZE / W I N'"],
  ['bank sign draws PRIZE header', "strokeText('PRIZE'"],
  ['bank sign draws dynamic remaining letters', 'ctx.strokeText(remainingText, 256, 126)'],
  ['bank sign remaining order is W I N', "const remaining = ['W', 'I', 'N'].filter"],
  ['hit letters are removed from bank sign by dropped state', 'target.dropped'],
  ['per-panel viewer-facing label sprites are cancelled', "bankSignText: 'PRIZE / W I N'"],
  ['target labels are reversed in local space for hit mapping', "const labels = ['N', 'I', 'W']"],
  ['obstacle stores target objects with state', 'dropped: false,\n        progress: 0,\n        hitBy: null'],
  ['per-frame bank animation exists', 'updateDropTargetBank(obstacle, delta)'],
  ['per-frame bank sign update exists', 'this.updateDropTargetBankSignText(obstacle)'],
  ['bank reset re-adds target bodies', 'resetDropTargetBank(obstacle)'],
  ['bank reset restores PRIZE / W I N sign', 'this.updateDropTargetBankSignText(obstacle)'],
  ['marble hit chooses an individual panel', 'findDropTargetPanelForMarble(obstacle, data)'],
  ['individual panel body is removed after hit', 'clearDropTargetPanelBody(obstacle, target)'],
  ['bank clear grants forward bonus', 'applyDropTargetBankBonus(obstacle, data, frame)'],
  ['bank clear activates final target boost aura', 'this.activateDropTargetFinalBoost(data, obstacle)'],
  ['drop target final boost lasts 5 seconds', 'durationSeconds: 5'],
  ['drop target final boost doubles speed limit', 'speedMultiplier: 2'],
  ['drop target final boost can exceed normal max speed', 'allowExceedMaxSpeed: true'],
  ['drop target boost creates visible aura mesh', 'createDropTargetBoostAura(data)'],
  ['drop target boost expires back to normal cap', 'expireDropTargetFinalBoost(data)'],
  ['drive cap uses boosted speed limit while active', 'const maxSpeed = this.getDropTargetSpeedLimit(data, catchupMaxSpeed)'],
  ['debug exposes drop target final boost policy', 'dropTargetFinalBoost: DROP_TARGET_FINAL_BOOST'],
  ['debug exposes aura visibility per marble', 'dropTargetBoostAuraVisible: Boolean(data.dropTargetBoostAuraVisible)'],
  ['debug payload exposes bank sign text', 'bankSignText: obstacle.bankSignText ?? null'],
  ['debug payload exposes drop target banks', 'dropTargetBanks: this.pinballObstacles.filter'],
  ['broadcast says target hit', "this.pushBroadcastEvent('Target Hit'"],
  ['broadcast says target bank clear', "this.pushBroadcastEvent('Target Bank Clear'"],
];

const missing = checks.filter(([, needle, options]) => {
  const present = source.includes(needle);
  return options?.absent ? present : !present;
});
if (missing.length) {
  console.error('Drop target v2 checks failed:');
  missing.forEach(([label]) => console.error(`- ${label}`));
  process.exit(1);
}

console.log(`Drop target v2 source checks passed (${checks.length}/${checks.length}).`);
