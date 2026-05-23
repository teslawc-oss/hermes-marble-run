import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./render-auto-cup-playwright.js', import.meta.url), 'utf8');

export const renderAutoCupDiagnostics = {
  defaults: {
    fps: Number(source.match(/fps: Number\(args\.get\('fps'\).*?\|\| (\d+)\)/s)?.[1]),
    crf: Number(source.match(/videoCrf: Number\(args\.get\('crf'\).*?\|\| (\d+)\)/s)?.[1]),
    videoPreset: source.match(/videoPreset: args\.get\('video-preset'\).*?\|\| '([^']+)'/)?.[1] || null,
  },
  hasCompletedAllRacesTimeoutFinalizer: source.includes('completed-all-races-timeout-finalize'),
  hasCompletedAllRacesPredicate: source.includes("state?.mode === 'continuous'")
    && source.includes("state.phase === 'completed-all-races'")
    && source.includes('Number(state.racesCompleted || 0) >= Number(state.totalRaces || 0)'),
  hasThirtySecondProgressPoller: source.includes("logRenderProgressSnapshot(page, 'periodic')")
    && source.includes('}, 30000)'),
  hasProgressFields: ['active', 'phase', 'racesCompleted', 'totalRaces', 'elapsed', 'chunks', 'mb', 'browserFps', 'simulationLag']
    .every((field) => source.includes(field)),
};

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  console.log(JSON.stringify(renderAutoCupDiagnostics, null, 2));
}
