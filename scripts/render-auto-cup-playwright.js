#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const recordingsDir = path.join(rootDir, 'recordings');
const defaultStamp = new Date().toISOString().replace(/[:.]/g, '-');

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const config = {
  url: args.get('url') || process.env.MARBLE_RENDER_URL || 'http://127.0.0.1:4173',
  port: Number(args.get('port') || process.env.MARBLE_RENDER_PORT || 4173),
  output: path.resolve(args.get('output') || process.env.MARBLE_RENDER_OUTPUT || path.join(recordingsDir, `auto-cup-${defaultStamp}.webm`)),
  cupSize: Number(args.get('cup-size') || process.env.MARBLE_RENDER_CUP_SIZE || 16),
  trackLength: Number(args.get('track-length') || process.env.MARBLE_RENDER_TRACK_LENGTH || 600),
  width: Number(args.get('width') || process.env.MARBLE_RENDER_WIDTH || 1920),
  height: Number(args.get('height') || process.env.MARBLE_RENDER_HEIGHT || 1080),
  captureScale: Number(args.get('capture-scale') || process.env.MARBLE_RENDER_CAPTURE_SCALE || 1),
  fps: Number(args.get('fps') || process.env.MARBLE_RENDER_FPS || 60),
  videoCrf: Number(args.get('crf') || process.env.MARBLE_RENDER_CRF || 16),
  videoPreset: args.get('video-preset') || process.env.MARBLE_RENDER_VIDEO_PRESET || 'slow',
  timeoutSeconds: Number(args.get('timeout') || process.env.MARBLE_RENDER_TIMEOUT || 900),
  smokeSeconds: Number(args.get('smoke-seconds') || process.env.MARBLE_RENDER_SMOKE_SECONDS || 0),
  maxRaceSeconds: Number(args.get('max-race-seconds') || process.env.MARBLE_RENDER_MAX_RACE_SECONDS || 0),
  keepWebm: args.get('keep-webm') === 'true' || process.env.MARBLE_RENDER_KEEP_WEBM === 'true',
  headful: args.get('headful') === 'true' || process.env.MARBLE_RENDER_HEADFUL === 'true',
  noBuild: args.get('no-build') === 'true' || process.env.MARBLE_RENDER_NO_BUILD === 'true',
  noServer: args.get('no-server') === 'true' || process.env.MARBLE_RENDER_NO_SERVER === 'true',
  showLeftUi: args.get('show-left-ui') === 'true' || process.env.MARBLE_RENDER_SHOW_LEFT_UI === 'true',
  showRightUi: args.get('show-right-ui') !== 'false' && process.env.MARBLE_RENDER_SHOW_RIGHT_UI !== 'false',
  disableMouseOrbit: args.get('disable-mouse-orbit') !== 'false' && process.env.MARBLE_RENDER_DISABLE_MOUSE_ORBIT !== 'false',
  audio: args.get('audio') !== 'false' && process.env.MARBLE_RENDER_AUDIO !== 'false',
  outputFormat: (args.get('format') || process.env.MARBLE_RENDER_FORMAT || path.extname(args.get('output') || process.env.MARBLE_RENDER_OUTPUT || '').replace(/^\./, '') || 'webm').toLowerCase(),
  renderPerformanceMode: args.get('render-performance-mode') !== 'false' && process.env.MARBLE_RENDER_PERFORMANCE_MODE !== 'false',
  audioOutput: path.resolve(args.get('audio-output') || process.env.MARBLE_RENDER_AUDIO_OUTPUT || path.join(recordingsDir, `auto-cup-${defaultStamp}.wav`)),
  cupName: args.get('cup-name') || process.env.MARBLE_RENDER_CUP_NAME || 'Speed X Cup',
  ttsVoice: args.get('tts-voice') || process.env.MARBLE_RENDER_TTS_VOICE || 'Alex',
  obstaclePreset: args.get('obstacle-preset') || process.env.MARBLE_RENDER_OBSTACLE_PRESET || '',
  obstacleTypes: (args.get('obstacle-types') || process.env.MARBLE_RENDER_OBSTACLE_TYPES || '').split(',').map((type) => type.trim()).filter(Boolean),
};
config.captureScale = Number.isFinite(config.captureScale) && config.captureScale > 0 ? config.captureScale : 1;
config.trackLength = Number.isFinite(config.trackLength) ? Math.max(80, Math.min(3000, Math.round(config.trackLength))) : 600;
config.captureWidth = Math.round(config.width * config.captureScale);
config.captureHeight = Math.round(config.height * config.captureScale);

config.ttsVoice = String(config.ttsVoice || 'Alex').replace(/[^\w .'-]/g, '').trim().slice(0, 48) || 'Alex';

const log = (...parts) => console.log('[render:auto-cup]', ...parts);
const fail = (message, error = null) => {
  console.error('[render:auto-cup] ERROR:', message);
  if (error) console.error(error);
  process.exit(1);
};

const commandExists = (command) => spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status === 0;
const run = (command, args, options = {}) => {
  log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`${command} exited with ${result.status}`);
};

async function waitForUrl(url, server = null, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (server?.exitCode !== null || server?.signalCode) return false;
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

const audioCaptureBridge = `(() => {
  if (window.__MARBLE_RENDER_AUDIO_CAPTURE__) return window.__MARBLE_RENDER_AUDIO_CAPTURE__;
  const capture = {
    destination: null,
    sourceGain: null,
    processor: null,
    chunks: [],
    sampleRate: null,
    frames: 0,
    startedAt: performance.now(),
    stoppedAt: null,
    async attach(app) {
      app.unlockAudio?.();
      const ctx = app.audioContext;
      const master = app.audioMasterGain;
      if (!ctx || !master) return { ok: false, reason: 'audio-context-missing' };
      await ctx.resume?.();
      this.sampleRate = ctx.sampleRate;
      this.destination = ctx.createMediaStreamDestination();
      this.sourceGain = ctx.createGain();
      this.sourceGain.gain.value = 1;
      master.connect(this.destination);
      master.connect(this.sourceGain);
      this.processor = ctx.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        this.chunks.push(new Float32Array(input));
        this.frames += input.length;
      };
      this.sourceGain.connect(this.processor);
      this.processor.connect(ctx.destination);
      return this.getInfo();
    },
    stop() {
      this.stoppedAt = performance.now();
      try { this.processor?.disconnect(); } catch {}
      try { this.sourceGain?.disconnect(); } catch {}
      try { this.destination?.disconnect?.(); } catch {}
      this.processor = null;
      return this.getWavBase64();
    },
    getInfo() {
      return {
        active: Boolean(this.processor),
        sampleRate: this.sampleRate,
        frames: this.frames,
        chunks: this.chunks.length,
        durationSeconds: this.sampleRate ? this.frames / this.sampleRate : 0,
        startedAt: this.startedAt,
        stoppedAt: this.stoppedAt,
      };
    },
    getWavBase64() {
      const wav = encodeWav(this.chunks, this.frames, this.sampleRate || 48000);
      let binary = '';
      const step = 0x8000;
      for (let i = 0; i < wav.length; i += step) {
        binary += String.fromCharCode(...wav.subarray(i, i + step));
      }
      return btoa(binary);
    },
  };

  function writeString(view, offset, value) {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  }

  function encodeWav(chunks, frames, rate) {
    const bytesPerSample = 2;
    const dataSize = frames * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, chunk[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Uint8Array(buffer);
  }

  window.__MARBLE_RENDER_AUDIO_CAPTURE__ = capture;
  return capture;
})()`;

async function main() {
  if (!commandExists('ffmpeg')) fail('ffmpeg is required. Install it first, e.g. `brew install ffmpeg`.');
  mkdirSync(recordingsDir, { recursive: true });
  mkdirSync(path.dirname(config.output), { recursive: true });

  if (!config.noBuild) run('npm', ['run', 'build']);

  let server = null;
  if (!config.noServer) {
    const previewHost = '127.0.0.1';
    const previewPort = new URL(config.url).port || String(config.port);
    server = spawn('npx', ['vite', 'preview', '--host', previewHost, '--port', previewPort, '--strictPort'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    });
    server.stdout.on('data', (chunk) => process.stdout.write(`[vite-preview] ${chunk}`));
    server.stderr.on('data', (chunk) => process.stderr.write(`[vite-preview] ${chunk}`));
    server.on('exit', (code) => {
      if (code !== null && code !== 0) console.error(`[vite-preview] exited with ${code}`);
    });
    const ready = await waitForUrl(config.url, server, 30000);
    if (!ready) fail(`Preview server did not become ready at ${config.url}`);
  }

  const videoDir = path.join(recordingsDir, `.playwright-${defaultStamp}`);
  rmSync(videoDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });

  let browser;
  try {
    log(`Opening ${config.url}`);
    log('Render settings:', JSON.stringify({
      viewport: `${config.width}x${config.height}`,
      capture: `${config.captureWidth}x${config.captureHeight}`,
      captureScale: config.captureScale,
      fps: config.fps,
      crf: config.videoCrf,
      videoPreset: config.videoPreset,
      showLeftUi: config.showLeftUi,
      showRightUi: config.showRightUi,
      disableMouseOrbit: config.disableMouseOrbit,
      renderPerformanceMode: config.renderPerformanceMode,
      audio: config.audio,
      outputFormat: config.outputFormat,
      trackLength: config.trackLength,
    }));
    browser = await chromium.launch({ headless: !config.headful });
    const context = await browser.newContext({
      viewport: { width: config.captureWidth, height: config.captureHeight },
      deviceScaleFactor: 1,
      recordVideo: { dir: videoDir, size: { width: config.captureWidth, height: config.captureHeight } },
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      const type = message.type();
      if (['error', 'warning'].includes(type)) console.log(`[browser:${type}] ${message.text()}`);
    });
    page.on('pageerror', (error) => console.error('[browser:pageerror]', error));
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__MARBLE_RACE_APP__), null, { timeout: 60000 });
    let audioCaptureInfo = null;
    if (config.audio) {
      audioCaptureInfo = await page.evaluate(async (bridge) => {
        const capture = eval(bridge);
        return capture.attach(window.__MARBLE_RACE_APP__);
      }, audioCaptureBridge);
      if (!audioCaptureInfo?.active) fail(`Could not start audio capture: ${JSON.stringify(audioCaptureInfo)}`);
      log('Audio capture started:', JSON.stringify(audioCaptureInfo));
    }

    const started = await page.evaluate(({ cupSize, trackLength, smokeSeconds, maxRaceSeconds, cupName, ttsVoice, obstaclePreset, obstacleTypes, showLeftUi, showRightUi, disableMouseOrbit, renderPerformanceMode }) => {
      const app = window.__MARBLE_RACE_APP__;
      if (!app) return { ok: false, reason: 'app-missing' };
      const forceDefaultAutoCamera = () => {
        app.resetDefaultAutoCameraForRace?.({ preservePhase: true });
        if (!app.resetDefaultAutoCameraForRace) {
          app.cameraMode = 'default';
          app.leadPackInitialized = false;
          app.leadBattleInitialized = false;
          app.leadBattleState = null;
          app.defaultCameraFocusId = null;
        }
        if (disableMouseOrbit) app.enableAllCameraMouseOrbit = false;
      };
      app.__playwrightRenderTrackLength = trackLength;
      app.applyCupVideoStageTrackSettings = (stage = app.getCupStage?.()) => {
        if (!app.cupMode?.active || !app.ui?.lengthSelect || !app.ui?.customLength) return;
        const targetLength = app.getCupVideoTimingEstimate?.()?.stageTrackLengths?.[stage] || app.__playwrightRenderTrackLength || 600;
        app.ui.lengthSelect.value = 'custom';
        app.ui.customLength.value = String(targetLength);
      };
      if (!app.__playwrightDefaultAutoCameraWrapped && typeof app.updateCamera === 'function') {
        const originalUpdateCamera = app.updateCamera.bind(app);
        app.updateCamera = (delta) => {
          if (!app.replayHighlight?.active) app.cameraMode = 'default';
          if (disableMouseOrbit) app.enableAllCameraMouseOrbit = false;
          return originalUpdateCamera(delta);
        };
        app.__playwrightDefaultAutoCameraWrapped = true;
      }
      forceDefaultAutoCamera();
      app.unlockAudio?.();
      app.setCommentaryEnabled?.(true);
      app.setCommentaryVoiceEnabled?.(true);
      app.setTtsVoice?.(ttsVoice, { resetQueue: false, updateStatus: true });
      app.checkLocalTtsBridge?.();
      if (app.ui?.cupName) app.ui.cupName.value = cupName || 'Speed X Cup';
      if (app.ui?.cupSize) app.ui.cupSize.value = String(cupSize);
      if (app.ui?.raceMode) app.ui.raceMode.value = 'cup';
      if (app.ui?.lengthSelect) app.ui.lengthSelect.value = 'custom';
      if (app.ui?.customLength) app.ui.customLength.value = String(trackLength || 600);
      if (obstaclePreset) {
        const presets = ['none', 'standard', 'many', 'extreme'];
        const obstacleIndex = presets.indexOf(String(obstaclePreset).toLowerCase());
        if (obstacleIndex >= 0 && app.ui?.obstacle) {
          app.ui.obstacle.value = String(obstacleIndex);
          app.updateObstaclePreset?.({ regenerateTrack: false });
        }
      }
      if (Array.isArray(obstacleTypes) && obstacleTypes.length && app.ui?.obstacleTypeToggles) {
        app.ui.obstacleTypeToggles.forEach((toggle) => {
          toggle.checked = obstacleTypes.includes(toggle.dataset.obstacleType);
        });
        app.updateObstacleTypeToggles?.({ regenerateTrack: false });
      }
      if (showLeftUi && app.leftUICollapsed) app.toggleLeftUI?.();
      if (!showLeftUi && !app.leftUICollapsed) app.toggleLeftUI?.();
      if (showRightUi && app.rightUICollapsed) app.toggleRightUI?.();
      if (!showRightUi && !app.rightUICollapsed) app.toggleRightUI?.();
      app.cameraMode = 'default';
      app.activeCameraMode = 'default';
      app.leadPackInitialized = false;
      app.defaultCameraPhaseUntil = 0;
      if (disableMouseOrbit) app.enableAllCameraMouseOrbit = false;
      if (renderPerformanceMode) {
        const profile = app.performanceProfile || {};
        app.performanceProfile = {
          ...profile,
          mode: 'playwright-render-performance',
          renderPerformanceMode: true,
          uiUpdateMs: Math.max(profile.uiUpdateMs || 500, 900),
          debugUpdateMs: Math.max(profile.debugUpdateMs || 1200, 2200),
          leaderboardUpdateMs: Math.max(profile.leaderboardUpdateMs || 800, 1400),
          rankingCacheMs: Math.max(profile.rankingCacheMs || 220, 420),
        };
        if (app.renderer?.setPixelRatio) app.renderer.setPixelRatio(1);
        if (app.renderer?.setSize) app.renderer.setSize(window.innerWidth, window.innerHeight, false);
      }
      app.startCupMode?.(cupSize, { preserveCurrentSettings: true });
      forceDefaultAutoCamera();
      app.activeCameraMode = app.getDefaultCameraMode?.() || 'default';
      if (disableMouseOrbit) app.enableAllCameraMouseOrbit = false;
      const showRenderLiveEventCaption = (title, detail) => {
        app.activeCaption = {
          title,
          detail,
          kind: 'render-live-event',
          force: true,
          expiresAt: (app.elapsed || 0) + 9999,
        };
        if (app.ui?.captionTitle) app.ui.captionTitle.textContent = title;
        if (app.ui?.captionDetail) app.ui.captionDetail.textContent = detail;
        app.ui?.caption?.classList.remove('hidden');
      };
      showRenderLiveEventCaption(
        app.getCupDisplayName?.() || cupName || 'Cup Mode',
        `${app.getCupStage?.() || 'Cup'} · ${app.obstaclePreset?.label || 'High-density'} · Live race coverage`,
      );
      const timing = smokeSeconds > 0
        ? {
            gateDelaySeconds: 0.2,
            nextRaceDelaySeconds: 0.2,
            postRaceHoldSeconds: 0.2,
            postReplayPodiumHoldSeconds: 0.2,
            replayHighlightSeconds: 0.6,
            replayClipSeconds: 0.2,
            nextGateAfterRaceSeconds: 0.2,
            stopAfterFinalSeconds: Math.max(0.5, smokeSeconds),
          }
        : {};
      app.autoCupRecording = {
        ...(app.autoCupRecording || {}),
        active: true,
        phase: 'playwright-render-waiting-open-gate',
        startedAt: performance.now(),
        currentStage: null,
        racesCompleted: 0,
        stopAfterFinalSeconds: timing.stopAfterFinalSeconds ?? ((app.getCupVideoTimingEstimate?.()?.finalPodiumSeconds ?? 59.8) + (app.getCupVideoTimingEstimate?.()?.endCardSeconds ?? 0) + (app.getCupVideoTimingEstimate?.()?.recordingStopGraceSeconds ?? 10)),
        nextRaceDelaySeconds: timing.nextRaceDelaySeconds ?? (app.getCupVideoTimingEstimate?.()?.nextRaceDelaySeconds ?? 10),
        postRaceHoldSeconds: timing.postRaceHoldSeconds ?? (app.getCupVideoTimingEstimate?.()?.postRaceHoldSeconds ?? 5),
        postReplayPodiumHoldSeconds: timing.postReplayPodiumHoldSeconds ?? (app.getCupVideoTimingEstimate?.()?.postReplayPodiumHoldSeconds ?? 8),
        nextGateAfterRaceSeconds: timing.nextGateAfterRaceSeconds ?? (app.getCupVideoTimingEstimate?.()?.nextGateAfterRaceSeconds ?? 5),
        gateDelaySeconds: timing.gateDelaySeconds ?? (app.getCupVideoTimingEstimate?.()?.introSeconds ?? 5),
        nextActionAt: null,
        pendingTimer: null,
        timingPlan: app.getCupVideoTimingEstimate?.() || null,
        lastError: null,
        playwrightRender: true,
      };
      if (timing.replayHighlightSeconds != null) {
        app.autoCupRecording.playwrightReplayHoldSeconds = timing.replayHighlightSeconds;
      }
      if (maxRaceSeconds > 0) {
        app.autoCupRecording.maxRaceSeconds = maxRaceSeconds;
        const originalStartAutoCupRace = app.startAutoCupRace?.bind(app);
        if (originalStartAutoCupRace && !app.__playwrightAutoCupRaceTimeoutWrapped) {
          app.startAutoCupRace = (...args) => {
            const result = originalStartAutoCupRace(...args);
            const expectedStage = app.getCupStage?.();
            window.setTimeout(() => {
              if (!app.autoCupRecording?.active) return;
              if (app.state !== 'running') return;
              if (expectedStage && app.getCupStage?.() !== expectedStage) return;
              const unfinished = (app.marbleData || []).filter((data) => data && !data.finished && !data.defeated);
              unfinished.forEach((data) => app.eliminateStalledMarble?.(data, data.distance || 0, 'playwright-max-race-timeout'));
              app.checkFinishers?.();
            }, maxRaceSeconds * 1000);
            return result;
          };
          app.__playwrightAutoCupRaceTimeoutWrapped = true;
        }
      }
      app.scheduleAutoCupRecordingAction?.(app.autoCupRecording.gateDelaySeconds, 'waiting-open-gate', () => app.startAutoCupRace?.());
      return {
        ok: true,
        cupSize,
        trackLength: app.trackLength,
        trackPreset: app.trackPresetKey,
        customTrackLength: app.customTrackLength,
        renderTrackLength: app.__playwrightRenderTrackLength,
        cupName: app.getCupDisplayName?.(),
        ttsVoice: app.localTtsBridge?.voice || ttsVoice,
        obstacleLabel: app.obstaclePreset?.label,
        obstacleTypes: [...(app.enabledObstacleTypes || [])],
        obstacleTypeCounts: app.obstacleTypeCounts,
        phase: app.autoCupRecording.phase,
        stage: app.getCupStage?.(),
        cameraMode: app.cameraMode,
        activeDefaultCameraShot: app.getDefaultCameraMode?.(),
        activeCameraMode: app.activeCameraMode,
        enableAllCameraMouseOrbit: app.enableAllCameraMouseOrbit,
        leftUICollapsed: app.leftUICollapsed,
        rightUICollapsed: app.rightUICollapsed,
        rightHudVisible: Boolean(app.ui?.rightHud && !app.ui.rightHud.classList.contains('collapsed')),
        liveEventOverlayVisible: Boolean(app.ui?.caption && !app.ui.caption.classList.contains('hidden')),
        liveEventOverlayTitle: app.ui?.captionTitle?.textContent || null,
        liveEventOverlayDetail: app.ui?.captionDetail?.textContent || null,
        performanceProfile: app.performanceProfile,
        rendererPixelRatio: app.renderer?.getPixelRatio?.() ?? null,
        rendererSize: app.renderer?.getSize ? (() => { const size = { width: 0, height: 0, set(x, y) { this.width = x; this.height = y; return this; } }; app.renderer.getSize(size); return { width: size.width, height: size.height }; })() : null,
        timingPlan: app.autoCupRecording.timingPlan,
      };
    }, {
      cupSize: config.cupSize,
      trackLength: config.trackLength,
      smokeSeconds: config.smokeSeconds,
      maxRaceSeconds: config.maxRaceSeconds,
      cupName: config.cupName,
      ttsVoice: config.ttsVoice,
      obstaclePreset: config.obstaclePreset,
      obstacleTypes: config.obstacleTypes,
      showLeftUi: config.showLeftUi,
      showRightUi: config.showRightUi,
      disableMouseOrbit: config.disableMouseOrbit,
      renderPerformanceMode: config.renderPerformanceMode,
    });
    if (!started.ok) fail(`Could not start Playwright auto cup: ${started.reason || 'unknown'}`);
    log('Auto cup started:', JSON.stringify(started));

    if (config.smokeSeconds > 0) {
      await page.waitForTimeout(config.smokeSeconds * 1000);
      const smokeState = await page.evaluate(() => {
        const app = window.__MARBLE_RACE_APP__;
        if (app?.autoCupRecording) {
          app.autoCupRecording.active = false;
          app.autoCupRecording.phase = 'playwright-smoke-complete';
          app.clearAutoCupRecordingTimer?.();
        }
        return app ? {
          done: true,
          ok: true,
          phase: app.autoCupRecording?.phase,
          racesCompleted: app.autoCupRecording?.racesCompleted,
          cupStatus: app.cupMode?.status,
          stage: app.getCupStage?.(),
          cameraMode: app.cameraMode,
          activeDefaultCameraShot: app.getDefaultCameraMode?.(),
          activeCameraMode: app.activeCameraMode,
          enableAllCameraMouseOrbit: app.enableAllCameraMouseOrbit,
          leftUICollapsed: app.leftUICollapsed,
          rightUICollapsed: app.rightUICollapsed,
          rightHudVisible: Boolean(app.ui?.rightHud && !app.ui.rightHud.classList.contains('collapsed')),
          liveEventOverlayVisible: Boolean(app.ui?.caption && !app.ui.caption.classList.contains('hidden')),
          liveEventOverlayTitle: app.ui?.captionTitle?.textContent || null,
        } : { done: true, ok: false, reason: 'app-missing' };
      });
      log('Smoke render stopped:', JSON.stringify(smokeState));
    } else {
      const waitTimeout = Math.max(10, config.timeoutSeconds) * 1000;
      const completion = await page.waitForFunction(
        () => {
          const app = window.__MARBLE_RACE_APP__;
          if (!app) return { done: true, ok: false, reason: 'app-missing' };
          const finalDone = app.cupMode?.status === 'complete' && app.autoCupRecording?.active === false;
          const stopped = app.autoCupRecording?.active === false && ['final-complete', 'playwright-smoke-complete'].includes(app.autoCupRecording?.phase);
          if (finalDone || stopped) return {
            done: true,
            ok: true,
            phase: app.autoCupRecording?.phase,
            racesCompleted: app.autoCupRecording?.racesCompleted,
            cupStatus: app.cupMode?.status,
            champion: app.cupMode?.champion?.name || null,
          };
          return false;
        },
        null,
        { timeout: waitTimeout, polling: 1000 },
      ).then((handle) => handle.jsonValue()).catch(async (error) => {
        const state = await page.evaluate(() => {
          const app = window.__MARBLE_RACE_APP__;
          return app ? {
            state: app.state,
            phase: app.autoCupRecording?.phase,
            racesCompleted: app.autoCupRecording?.racesCompleted,
            cupStatus: app.cupMode?.status,
            stage: app.getCupStage?.(),
            cameraMode: app.cameraMode,
            activeDefaultCameraShot: app.getDefaultCameraMode?.(),
            activeCameraMode: app.activeCameraMode,
            enableAllCameraMouseOrbit: app.enableAllCameraMouseOrbit,
            rightUICollapsed: app.rightUICollapsed,
          } : null;
        }).catch(() => null);
        fail(`Timed out waiting for auto cup completion. Last state: ${JSON.stringify(state)}`, error);
      });
      log('Auto cup completed:', JSON.stringify(completion));
    }

    await page.waitForTimeout(1000);
    const runtimeFpsSummary = await page.evaluate(() => {
      const app = window.__MARBLE_RACE_APP__;
      return app ? {
        measuredFps: app.lastFps,
        fpsHudText: app.ui?.fps?.textContent || null,
        performanceProfile: app.performanceProfile,
        rendererPixelRatio: app.renderer?.getPixelRatio?.() ?? null,
      } : { measuredFps: null };
    }).catch(() => null);
    if (runtimeFpsSummary) log('Runtime FPS summary:', JSON.stringify(runtimeFpsSummary));
    if (config.audio) {
      const audioResult = await page.evaluate(() => {
        const capture = window.__MARBLE_RENDER_AUDIO_CAPTURE__;
        if (!capture) return { ok: false, reason: 'capture-missing' };
        const info = capture.getInfo();
        const wavBase64 = capture.stop();
        return { ok: true, info, wavBase64 };
      });
      if (!audioResult?.ok) fail(`Audio capture failed: ${JSON.stringify(audioResult)}`);
      writeFileSync(config.audioOutput, Buffer.from(audioResult.wavBase64, 'base64'));
      log('Audio captured:', JSON.stringify({ ...audioResult.info, wav: config.audioOutput, bytes: statSync(config.audioOutput).size }));
    }
    await context.close();
    await browser.close();
    browser = null;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill('SIGTERM');
  }

  const webmFiles = [];
  const collect = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) collect(full);
      else if (/\.webm$/i.test(entry)) webmFiles.push(full);
    }
  };
  collect(videoDir);
  if (!webmFiles.length) fail(`No Playwright .webm video found in ${videoDir}`);
  webmFiles.sort((a, b) => statSync(b).size - statSync(a).size);
  const sourceWebm = webmFiles[0];
  const outputExt = config.outputFormat === 'mp4' ? '.mp4' : '.webm';
  const requestedOutputExt = path.extname(config.output).toLowerCase();
  const finalOutput = requestedOutputExt === outputExt
    ? config.output
    : path.resolve(`${config.output.replace(/\.[^.]+$/, '')}${outputExt}`);
  if (finalOutput !== config.output) {
    log(`Output extension adjusted for requested format ${config.outputFormat}: ${config.output} -> ${finalOutput}`);
    config.output = finalOutput;
    mkdirSync(path.dirname(config.output), { recursive: true });
  }
  if (outputExt === '.webm') {
    log(`Muxing browser-canvas WebM and captured page/TTS audio ${sourceWebm} -> ${config.output}`);
    const ffmpegArgs = ['-y', '-i', sourceWebm];
    const hasAudio = config.audio && existsSync(config.audioOutput) && statSync(config.audioOutput).size > 44;
    if (hasAudio) {
      ffmpegArgs.push('-i', config.audioOutput, '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '160k');
    } else {
      ffmpegArgs.push('-map', '0:v:0', '-c:v', 'copy');
    }
    ffmpegArgs.push(config.output);
    run('ffmpeg', ffmpegArgs);
  } else {
    log(`Converting ${sourceWebm} -> ${config.output}`);
    const ffmpegArgs = ['-y', '-i', sourceWebm];
    if (config.audio && existsSync(config.audioOutput) && statSync(config.audioOutput).size > 44) {
      ffmpegArgs.push('-i', config.audioOutput, '-map', '0:v:0', '-map', '1:a:0', '-shortest');
    }
    ffmpegArgs.push('-vf', `fps=${config.fps},scale=${config.width}:${config.height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', config.videoPreset, '-crf', String(config.videoCrf));
    if (config.audio && existsSync(config.audioOutput) && statSync(config.audioOutput).size > 44) {
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '160k');
    }
    ffmpegArgs.push('-movflags', '+faststart', config.output);
    run('ffmpeg', ffmpegArgs);
  }
  if (!existsSync(config.output) || statSync(config.output).size <= 0) fail(`Output video was not created: ${config.output}`);
  if (!config.keepWebm) rmSync(videoDir, { recursive: true, force: true });
  log(`Done: ${config.output}`);
}

main().catch((error) => fail('Unhandled render failure', error));
