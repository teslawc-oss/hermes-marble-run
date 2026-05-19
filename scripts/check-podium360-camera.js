import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const requireSnippet = (snippet, description) => {
  if (!source.includes(snippet)) {
    console.error(`Missing ${description}`);
    process.exit(1);
  }
};

requireSnippet('elapsedSeconds: 0', 'podium ceremony elapsedSeconds initialization');
requireSnippet('this.podiumCeremony.elapsedSeconds = (this.podiumCeremony.elapsedSeconds || 0) + Math.max(0, delta || 0);', 'real-time podium ceremony elapsed accumulation');
requireSnippet('const ceremonyAge = Math.max(0, this.podiumCeremony?.elapsedSeconds ??', 'podium360 camera uses ceremony elapsedSeconds');
requireSnippet('const t = ceremonyAge * (isChampionCeremony ? cfg.championAngularSpeed : cfg.angularSpeed);', 'podium360 camera orbit angle uses ceremony age for all podium modes');
requireSnippet('confettiDurationSeconds: 4.8', 'normal podium confetti duration limit');
requireSnippet('championConfettiDurationSeconds: 7.5', 'champion podium confetti duration limit');
requireSnippet('maxConfettiBursts: 5', 'normal podium max confetti burst limit');
requireSnippet('championMaxConfettiBursts: 14', 'champion podium max confetti burst limit');
requireSnippet('this.podiumCeremony.confettiBurstCount = (this.podiumCeremony.confettiBurstCount || 0) + 1;', 'confetti burst counter increment');
requireSnippet('this.podiumCeremony.confettiComplete = !(confettiAllowedByAge && confettiAllowedByCount);', 'confetti completion state');

const oldFrozenPattern = /const\s+t\s*=\s*\(isChampionCeremony \? ceremonyAge : this\.elapsed\)/;
if (oldFrozenPattern.test(source)) {
  console.error('Old podium360 elapsed-time expression still present');
  process.exit(1);
}

const oldConfettiElapsedPattern = /this\.elapsed\s*-\s*this\.podiumCeremony\.lastConfettiAt\s*>=\s*confettiEverySeconds/;
if (oldConfettiElapsedPattern.test(source)) {
  console.error('Old elapsed-based podium confetti loop still present');
  process.exit(1);
}

console.log('podium360 ceremony timing and bounded confetti checks passed');
