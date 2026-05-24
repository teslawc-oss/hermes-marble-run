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
    && source.includes("state.phase === 'waiting-final-stop'")
    && source.includes('renderWaitDonePhases.has(state.phase)')
    && source.includes('Number(state.racesCompleted || 0) >= Number(state.totalRaces || 0)'),
  stopsCanvasCaptureAfterCompletion: source.includes('requestCanvasCaptureStop')
    && source.includes('finalRaceCompletionBufferSeconds')
    && source.includes('isFinalRaceFinishedState')
    && source.includes('isFinalCeremonyCommentaryCompleteState')
    && source.includes('isPodiumCeremonyComplete')
    && source.includes('isCommentaryComplete')
    && source.includes('getFinalRaceCompletionCaptureTargetSeconds')
    && source.includes('final-race-finished-awaiting-ceremony-commentary')
    && source.includes('final-race-finished-buffer-start')
    && source.includes('canvas-stop-requested-after-final-race-buffer')
    && source.includes('final-race-ceremony-commentary-complete-plus-buffer')
    && source.includes('completionCanvasStopRequested')
    && source.includes('marbleRenderNotifyFinalRaceFinished')
    && source.includes('app.__playwrightContinuousFinalRaceSignalWrapped')
    && source.includes("eventSource: 'handleContinuousRecordingRaceComplete'")
    && source.includes('capture.dropChunks = true'),
  waitsForPodiumAndCommentaryBeforeFinalStop: source.includes('isFinalCeremonyCommentaryCompleteState')
    && source.includes('const hasPodiumStarted')
    && source.includes('if (!hasPodiumStarted) return false')
    && source.includes("waitFor: ['podium-complete', 'commentary-voice-idle']")
    && source.includes('waitedForCeremonyAndCommentarySeconds')
    && source.includes('final-race-ceremony-commentary-waiting')
    && source.includes('podiumComplete: isPodiumCeremonyComplete(completionSnapshot)')
    && source.includes('commentaryComplete: isCommentaryComplete(completionSnapshot)')
    && source.includes('podium: snapshot.podium || null')
    && source.includes('commentary: snapshot.commentary || null'),
  guardsCanvasWritesAfterStreamClose: source.includes("reason: 'stream-closed'")
    && source.includes('canvasChunkStream.destroyed')
    && source.includes('canvasChunkStream.closed'),
  hasThirtySecondProgressPoller: source.includes("logRenderProgressSnapshot(page, 'periodic')")
    && source.includes('}, 30000)'),
  hasProgressFields: ['active', 'phase', 'racesCompleted', 'totalRaces', 'jobElapsedSeconds', 'gameElapsedSeconds', 'captureElapsedSeconds', 'chunks', 'estimatedTotalChunks', 'totalChunkProgress', 'mb', 'browserFps', 'simulationLag', 'podium', 'commentary']
    .every((field) => source.includes(field)),
};

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  console.log(JSON.stringify(renderAutoCupDiagnostics, null, 2));
}
