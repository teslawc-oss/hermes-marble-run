#!/usr/bin/env node
import { chromium } from 'playwright';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
const hasExplicitMaxRaceSeconds = args.has('max-race-seconds') || process.env.MARBLE_RENDER_MAX_RACE_SECONDS != null;
const averageRaceSecondsPerMeter = 90 / 300;
const estimateMaxRaceSecondsForTrackLength = (trackLength) => Math.max(45, Math.min(1200, Math.ceil(trackLength * averageRaceSecondsPerMeter)));

const config = {
  url: args.get('url') || process.env.MARBLE_RENDER_URL || 'http://127.0.0.1:4173',
  port: Number(args.get('port') || process.env.MARBLE_RENDER_PORT || 4173),
  output: path.resolve(args.get('output') || process.env.MARBLE_RENDER_OUTPUT || path.join(recordingsDir, `auto-cup-${defaultStamp}.webm`)),
  cupSize: Number(args.get('cup-size') || process.env.MARBLE_RENDER_CUP_SIZE || 12),
  trackLength: Number(args.get('track-length') || process.env.MARBLE_RENDER_TRACK_LENGTH || 600),
  targetSeconds: Number(args.get('target-seconds') || process.env.MARBLE_RENDER_TARGET_SECONDS || 600),
  lengthMode: args.get('length-mode') || process.env.MARBLE_RENDER_LENGTH_MODE || 'target-duration',
  width: Number(args.get('width') || process.env.MARBLE_RENDER_WIDTH || 1920),
  height: Number(args.get('height') || process.env.MARBLE_RENDER_HEIGHT || 1080),
  captureScale: Number(args.get('capture-scale') || process.env.MARBLE_RENDER_CAPTURE_SCALE || 1),
  fps: Number(args.get('fps') || process.env.MARBLE_RENDER_FPS || 60),
  videoCrf: Number(args.get('crf') || process.env.MARBLE_RENDER_CRF || 14),
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
  videoCapture: ['playwright', 'canvas'].includes(args.get('video-capture') || process.env.MARBLE_RENDER_VIDEO_CAPTURE) ? (args.get('video-capture') || process.env.MARBLE_RENDER_VIDEO_CAPTURE) : 'playwright',
  videoCanvasLayout: ['horizontal', 'vertical'].includes(String(args.get('video-canvas') || args.get('video-canvas-layout') || process.env.MARBLE_RENDER_VIDEO_CANVAS || 'horizontal').toLowerCase())
    ? String(args.get('video-canvas') || args.get('video-canvas-layout') || process.env.MARBLE_RENDER_VIDEO_CANVAS || 'horizontal').toLowerCase()
    : 'horizontal',
  outputFormat: (args.get('format') || process.env.MARBLE_RENDER_FORMAT || path.extname(args.get('output') || process.env.MARBLE_RENDER_OUTPUT || '').replace(/^\./, '') || 'webm').toLowerCase(),
  thumbnail: args.get('thumbnail') !== 'false' && process.env.MARBLE_RENDER_THUMBNAIL !== 'false',
  thumbnailTitle: args.get('thumbnail-title') || process.env.MARBLE_RENDER_THUMBNAIL_TITLE || '',
  thumbnailOutput: args.get('thumbnail-output') || process.env.MARBLE_RENDER_THUMBNAIL_OUTPUT || '',
  thumbnailFrameStrategy: args.get('thumbnail-frame-strategy') || process.env.MARBLE_RENDER_THUMBNAIL_FRAME_STRATEGY || 'mid-highlight',
  thumbnailSafeCrop: args.get('thumbnail-safe-crop') || process.env.MARBLE_RENDER_THUMBNAIL_SAFE_CROP || 'hud-safe',
  thumbnailMaxWords: Number(args.get('thumbnail-max-words') || process.env.MARBLE_RENDER_THUMBNAIL_MAX_WORDS || 6),
  eventMarkersOutput: args.get('event-markers-output') || process.env.MARBLE_RENDER_EVENT_MARKERS_OUTPUT || '',
  eventMarkerIntervalSeconds: Number(args.get('event-marker-interval-seconds') || process.env.MARBLE_RENDER_EVENT_MARKER_INTERVAL_SECONDS || 5),
  youtubeMetadata: args.get('youtube-metadata') !== 'false' && process.env.MARBLE_RENDER_YOUTUBE_METADATA !== 'false',
  youtubeMetadataOutput: args.get('youtube-metadata-output') || process.env.MARBLE_RENDER_YOUTUBE_METADATA_OUTPUT || '',
  keepEventMarkers: args.get('keep-event-markers') === 'true' || process.env.MARBLE_RENDER_KEEP_EVENT_MARKERS === 'true',
  keepThumbnailMetadata: args.get('keep-thumbnail-metadata') === 'true' || process.env.MARBLE_RENDER_KEEP_THUMBNAIL_METADATA === 'true',
  youtubeMetadataTemplate: args.get('youtube-metadata-template') || process.env.MARBLE_RENDER_YOUTUBE_METADATA_TEMPLATE || path.join(rootDir, 'config/youtube-video-metadata-template.json'),
  youtubeTitleHistory: args.get('youtube-title-history') || process.env.MARBLE_RENDER_YOUTUBE_TITLE_HISTORY || recordingsDir,
  youtubeTitleHistoryLimit: Number(args.get('youtube-title-history-limit') || process.env.MARBLE_RENDER_YOUTUBE_TITLE_HISTORY_LIMIT || 10),
  renderPerformanceMode: args.get('render-performance-mode') !== 'false' && process.env.MARBLE_RENDER_PERFORMANCE_MODE !== 'false',
  audioOutput: path.resolve(args.get('audio-output') || process.env.MARBLE_RENDER_AUDIO_OUTPUT || path.join(recordingsDir, `auto-cup-${defaultStamp}.wav`)),
  mode: ['cup', 'continuous', 'single'].includes(args.get('mode') || process.env.MARBLE_RENDER_MODE) ? (args.get('mode') || process.env.MARBLE_RENDER_MODE) : 'continuous',
  multipleRaceCount: Number(args.get('multiple-race-count') || process.env.MARBLE_RENDER_MULTIPLE_RACE_COUNT || 5),
  cupName: args.get('cup-name') || process.env.MARBLE_RENDER_CUP_NAME || 'Speed X Cup',
  ttsVoice: args.get('tts-voice') || process.env.MARBLE_RENDER_TTS_VOICE || 'Alex',
  obstaclePreset: args.get('obstacle-preset') || process.env.MARBLE_RENDER_OBSTACLE_PRESET || '',
  obstacleDistribution: args.get('obstacle-distribution') || process.env.MARBLE_RENDER_OBSTACLE_DISTRIBUTION || 'random',
  obstacleTypes: (args.get('obstacle-types') || process.env.MARBLE_RENDER_OBSTACLE_TYPES || '').split(',').map((type) => type.trim()).filter(Boolean),
};
config.captureScale = Number.isFinite(config.captureScale) && config.captureScale > 0 ? config.captureScale : 1;
config.targetSeconds = Number.isFinite(config.targetSeconds) ? Math.max(60, Math.min(7200, Math.round(config.targetSeconds))) : 600;
config.lengthMode = config.lengthMode === 'fixed-track' ? 'fixed-track' : 'target-duration';
config.trackLength = Number.isFinite(config.trackLength) ? Math.max(80, Math.min(3000, Math.round(config.trackLength))) : 600;
config.maxRaceSeconds = hasExplicitMaxRaceSeconds && Number.isFinite(config.maxRaceSeconds) && config.maxRaceSeconds > 0
  ? Math.max(45, Math.min(1200, Math.round(config.maxRaceSeconds)))
  : estimateMaxRaceSecondsForTrackLength(config.trackLength);
config.captureWidth = Math.round(config.width * config.captureScale);
config.captureHeight = Math.round(config.height * config.captureScale);
config.thumbnailMaxWords = Number.isFinite(config.thumbnailMaxWords) ? Math.max(2, Math.min(10, Math.round(config.thumbnailMaxWords))) : 6;
config.eventMarkerIntervalSeconds = Number.isFinite(config.eventMarkerIntervalSeconds) ? Math.max(1, Math.min(60, Math.round(config.eventMarkerIntervalSeconds))) : 5;
config.eventMarkersOutput = config.eventMarkersOutput ? path.resolve(config.eventMarkersOutput) : '';
config.youtubeTitleHistoryLimit = Number.isFinite(config.youtubeTitleHistoryLimit) ? Math.max(0, Math.min(50, Math.round(config.youtubeTitleHistoryLimit))) : 10;
config.youtubeTitleHistory = String(config.youtubeTitleHistory || '').trim();

config.ttsVoice = String(config.ttsVoice || 'Alex').replace(/[^\w .'-]/g, '').trim().slice(0, 48) || 'Alex';
config.multipleRaceCount = Number.isFinite(config.multipleRaceCount) ? Math.max(1, Math.min(99, Math.round(config.multipleRaceCount))) : 5;
config.obstacleDistribution = ['random', 'zoned'].includes(config.obstacleDistribution) ? config.obstacleDistribution : 'random';

const renderStartedAt = Date.now();
let currentStageLabel = 'init';
const elapsedLabel = () => `${((Date.now() - renderStartedAt) / 1000).toFixed(1)}s`;
const log = (...parts) => console.log(`[render:auto-cup +${elapsedLabel()}]`, ...parts);
const progress = (stage, detail = '') => {
  currentStageLabel = stage;
  log(`[progress] ${stage}${detail ? `: ${detail}` : ''}`);
};
const fail = (message, error = null) => {
  console.error(`[render:auto-cup +${elapsedLabel()}] ERROR (${currentStageLabel}):`, message);
  if (error) console.error(error);
  process.exit(1);
};

const commandExists = (command) => spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status === 0;
const sanitizeSingleLine = (value, fallback = '') => String(value || fallback)
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const sanitizeHashtags = (hashtags) => Array.isArray(hashtags)
  ? hashtags.map((tag) => sanitizeSingleLine(tag)).filter((tag) => /^#[\w-]+$/i.test(tag))
  : [];
const run = (command, args, options = {}) => {
  log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`${command} exited with ${result.status}`);
};
const ffprobeJson = (file) => JSON.parse(execFileSync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,bit_rate,sample_rate,channels',
  '-show_entries', 'format=duration,size,bit_rate',
  '-of', 'json',
  file,
], { encoding: 'utf8' }));

function readYoutubeMetadataTemplate(templatePath) {
  const fallback = {
    descriptionTemplate: 'Get ready for {raceCountLabel} exciting races with {marbleCount} marbles competing for victory! Every race is full of speed, chaos, close finishes, and unpredictable moments as the marbles battle their way through the track. Watch to see which marble comes out on top and whether your favorite can win it all.\nComment below with your favorite marble, your predictions, or ideas for future race challenges. Your suggestions help make every video more fun and exciting.\nLike, subscribe, and stay tuned for more Marble Rush races!',
    hashtags: ['#marblerace', '#marblerush', '#12marbles', '#racechallenge', '#gameplay', '#games', '#fun', '#gameforkids', '#marblegame', '#racing', '#challenge', '#kidsvideos', '#obstacles', '#indiegame', '#gamedev'],
    defaults: { marbleCount: 12, raceCount: 10, fallbackTitle: '12 Marbles, 10 Races, Total Chaos!' },
  };
  const resolved = path.resolve(templatePath || path.join(rootDir, 'config/youtube-video-metadata-template.json'));
  if (!existsSync(resolved)) return { ...fallback, templatePath: resolved, templateFound: false };
  try {
    const parsed = JSON.parse(readFileSync(resolved, 'utf8'));
    return {
      descriptionTemplate: String(parsed.descriptionTemplate || fallback.descriptionTemplate),
      hashtags: sanitizeHashtags(parsed.hashtags).length ? sanitizeHashtags(parsed.hashtags) : fallback.hashtags,
      defaults: { ...fallback.defaults, ...(parsed.defaults || {}) },
      templatePath: resolved,
      templateFound: true,
    };
  } catch (error) {
    fail(`could not parse YouTube metadata template JSON: ${resolved}`, error);
  }
}

function classifyYoutubeTitleType(title) {
  const normalized = sanitizeSingleLine(title).toLowerCase();
  if (!normalized) return 'unknown';
  if (/\b(you won.?t believe|unbelievable|shocking|unexpected|surprise)\b/i.test(normalized)) return 'shock-reveal';
  if (/\b(insane finish|photo finish|close finish|last second|final second|comeback)\b/i.test(normalized)) return 'finish-drama';
  if (/\b(battle|vs\.?|showdown|duel|clash)\b/i.test(normalized)) return 'battle';
  if (/\b(speed|fast|rush|sprint|dash|boost)\b/i.test(normalized)) return 'speed';
  if (/\b(trap|obstacle|bumper|spinner|gate|target|drop)\b/i.test(normalized)) return 'obstacle';
  if (/\b(total chaos|chaos|crazy|wild|mayhem|madness)\b/i.test(normalized)) return 'chaos';
  if (/\b(wins?|winner|champion|takes all|victory)\b/i.test(normalized)) return 'winner';
  if (/\b(\d+\s*races?|\d+\s*marbles?)\b/i.test(normalized)) return 'numbers';
  return 'general-hype';
}

function readYoutubeTitleHistory(historyPath, limit = 10) {
  if (!historyPath || limit <= 0) return [];
  const resolved = path.resolve(historyPath);
  const files = [];
  const collect = (entry) => {
    if (!existsSync(entry)) return;
    const info = statSync(entry);
    if (info.isDirectory()) {
      for (const name of readdirSync(entry)) {
        const child = path.join(entry, name);
        try {
          const childInfo = statSync(child);
          if (childInfo.isDirectory()) collect(child);
          else if (/\.youtube\.json$/i.test(name)) files.push({ path: child, mtimeMs: childInfo.mtimeMs });
        } catch {}
      }
    } else if (/\.json$/i.test(entry)) {
      files.push({ path: entry, mtimeMs: info.mtimeMs });
    }
  };
  collect(resolved);
  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((file) => {
      try {
        const parsed = JSON.parse(readFileSync(file.path, 'utf8'));
        const title = sanitizeSingleLine(parsed.title || parsed.videoTitle || parsed?.metadata?.title || '');
        if (!title) return null;
        return { title, titleType: parsed.titleType || classifyYoutubeTitleType(title), path: file.path, mtimeMs: file.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, limit);
}

function makeClickbaitVideoTitle(baseTitle, context = {}) {
  const fallbackTitle = context.fallbackTitle || '30 Marbles, 10 Races, Total Chaos!';
  const title = sanitizeSingleLine(baseTitle, fallbackTitle).replace(/[.!?]+$/g, '');
  const recentTypes = new Set((context.recentTitles || []).slice(0, context.historyLimit || 10).map((item) => item.titleType || classifyYoutubeTitleType(item.title)));
  const templates = [
    { type: 'chaos', suffix: 'Total Chaos!' },
    { type: 'finish-drama', suffix: 'Insane Finish!' },
    { type: 'shock-reveal', suffix: 'You Won’t Believe It!' },
    { type: 'battle', suffix: 'Wild Marble Battle!' },
    { type: 'speed', suffix: 'Speed Run Madness!' },
    { type: 'obstacle', suffix: 'Obstacle Trouble!' },
    { type: 'winner', suffix: 'Who Takes Victory?' },
    { type: 'general-hype', suffix: 'This Gets Intense!' },
  ];
  const directType = classifyYoutubeTitleType(title);
  const hasHype = /[!?]|\b(insane|crazy|chaos|shocking|epic|wild|unbelievable|last second)\b/i.test(title);
  if (hasHype && !recentTypes.has(directType)) {
    return { title: title.slice(0, 100), titleType: directType };
  }
  const seed = [...title].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const rotated = templates.map((_, index) => templates[(seed + index) % templates.length]);
  const selected = rotated.find((template) => !recentTypes.has(template.type)) || rotated[0];
  const candidate = `${title} — ${selected.suffix}`;
  return { title: (candidate.length <= 100 ? candidate : `${title}!`).slice(0, 100), titleType: selected.type };
}

function pickMidRaceThumbnailEvent(events = [], summary = {}) {
  const validEvents = Array.isArray(events) ? events : [];
  const battleEvents = validEvents
    .filter((event) => ['battle', 'overtake'].includes(event.kind) && Number.isFinite(Number(event.time)))
    .map((event, index) => ({ ...event, __index: index, time: Number(event.time) }))
    .sort((a, b) => a.time - b.time);
  if (!battleEvents.length) return null;

  const lastTime = Math.max(
    Number(summary?.elapsed) || 0,
    Number(summary?.lastSampleAt) || 0,
    ...battleEvents.map((event) => event.time),
  );
  const duration = Number.isFinite(lastTime) && lastTime > 0 ? lastTime : battleEvents[battleEvents.length - 1].time;
  const lower = Math.max(1.2, duration * 0.28);
  const upper = Math.max(lower, duration * 0.72);
  const middle = duration * 0.5;
  const scored = battleEvents.map((event) => {
    const inMiddle = event.time >= lower && event.time <= upper;
    const kindBonus = event.kind === 'overtake' ? 4 : 0;
    const progress = Number(event.progress);
    const progressBonus = Number.isFinite(progress) && progress >= 0.25 && progress <= 0.75 ? 4 : 0;
    return {
      event,
      score: (inMiddle ? 40 : 0) + kindBonus + progressBonus - Math.abs(event.time - middle) * 0.06,
    };
  }).sort((a, b) => (b.score - a.score) || Math.abs(a.event.time - middle) - Math.abs(b.event.time - middle) || a.event.__index - b.event.__index);

  const picked = scored[0]?.event;
  if (!picked) return null;
  const suggestedFrameSeconds = Number(Math.max(0.8, picked.suggestedFrameSeconds ?? picked.time + 0.15).toFixed(3));
  return {
    title: picked.title || '',
    detail: picked.detail || '',
    kind: picked.kind,
    time: Number(picked.time.toFixed(3)),
    suggestedFrameSeconds,
    progress: Number.isFinite(Number(picked.progress)) ? Number(Number(picked.progress).toFixed(4)) : null,
    distance: Number.isFinite(Number(picked.distance)) ? Number(Number(picked.distance).toFixed(3)) : null,
    marbleId: picked.marbleId ?? null,
    rivalId: picked.rivalId ?? null,
    activeRaceIndex: picked.activeRaceIndex ?? null,
  };
}

function buildYoutubeVideoMetadata({ config, renderSummary = {}, thumbnailOutput, metadataOutput = '', companionWebmOutput, eventMarkersOutput = '', thumbnailEvent = null }) {
  const template = readYoutubeMetadataTemplate(config.youtubeMetadataTemplate);
  const raceCount = config.mode === 'continuous'
    ? config.multipleRaceCount
    : (config.mode === 'single'
      ? 1
      : Number(renderSummary.raceCount || renderSummary.stageSummaries?.length || template.defaults.raceCount || 10));
  const marbleCount = Number(renderSummary.marbleCount || config.cupSize || template.defaults.marbleCount || 30);
  const baseTitle = config.thumbnailTitle || renderSummary.thumbnailTitle || renderSummary.title || renderSummary.cupName || config.cupName || template.defaults.fallbackTitle;
  const recentTitles = readYoutubeTitleHistory(config.youtubeTitleHistory, config.youtubeTitleHistoryLimit);
  const titleResult = makeClickbaitVideoTitle(baseTitle, { fallbackTitle: template.defaults.fallbackTitle, recentTitles, historyLimit: config.youtubeTitleHistoryLimit });
  const title = titleResult.title;
  const titleType = titleResult.titleType || classifyYoutubeTitleType(title);
  const descriptionBody = template.descriptionTemplate
    .replace(/\{raceCount\}/g, String(raceCount))
    .replace(/\{raceCountLabel\}/g, raceCount === 1 ? '1 exciting race' : `${raceCount} exciting races`)
    .replace(/\{marbleCount\}/g, String(marbleCount))
    .replace(/\{title\}/g, title)
    .replace(/\{cupName\}/g, sanitizeSingleLine(config.cupName || renderSummary.cupName || 'Marble Rush'));
  const description = `${descriptionBody}\n\n${template.hashtags.join(' ')}`;
  return {
    title,
    titleType,
    description,
    hashtags: template.hashtags,
    recentTitleTypesAvoided: [...new Set(recentTitles.map((item) => item.titleType))],
    source: {
      titleSource: config.thumbnailTitle ? 'thumbnailTitle' : 'renderMetadata',
      thumbnailTitle: config.thumbnailTitle || '',
      cupName: config.cupName,
      raceCount,
      marbleCount,
      renderOutput: config.output,
      thumbnailOutput,
      thumbnailMetadataOutput: metadataOutput,
      companionWebmOutput,
      eventMarkersOutput,
      generatedAt: new Date().toISOString(),
      templatePath: template.templatePath,
      templateFound: template.templateFound,
      titleHistoryPath: config.youtubeTitleHistory,
      titleHistoryLimit: config.youtubeTitleHistoryLimit,
      recentTitles: recentTitles.map((item) => ({ title: item.title, titleType: item.titleType, path: item.path })),
    },
  };
}


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
  progress('startup', `output=${config.output}`);
  if (!commandExists('ffmpeg')) fail('ffmpeg is required. Install it first, e.g. `brew install ffmpeg`.');
  mkdirSync(recordingsDir, { recursive: true });
  mkdirSync(path.dirname(config.output), { recursive: true });

  if (!config.noBuild) {
    progress('build', 'npm run build');
    run('npm', ['run', 'build']);
  }

  let server = null;
  if (!config.noServer) {
    progress('preview-server', config.url);
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

  let canvasChunkStream = null;
  let canvasChunkOutput = null;
  let canvasChunkWriteChain = Promise.resolve();
  const canvasChunkStats = { chunks: 0, bytes: 0, lastLogAt: Date.now() };

  const waitForCanvasChunkWrites = async () => {
    await canvasChunkWriteChain;
    if (!canvasChunkStream) return;
    await new Promise((resolve, reject) => {
      canvasChunkStream.once('error', reject);
      canvasChunkStream.end(resolve);
    });
    canvasChunkStream = null;
  };

  const collectEventMarkerSnapshot = async (page, state = eventMarkerState) => {
    if (!page || page.isClosed?.()) return null;
    const snapshot = await page.evaluate(() => {
      const app = window.__MARBLE_RACE_APP__;
      if (!app) return null;
      const activeRecording = app.singleRecording?.playwrightRender
        ? app.singleRecording
        : app.continuousRecording?.playwrightRender
          ? app.continuousRecording
          : app.autoCupRecording;
      const serializeEvent = (event, index) => ({
        title: event.title,
        detail: event.detail,
        kind: event.kind || 'general',
        time: Number(event.time),
        progress: event.progress,
        distance: event.distance,
        marbleId: event.marbleId,
        rivalId: event.rivalId,
        lines: Array.isArray(event.lines) ? event.lines.slice(0, 4) : undefined,
        sourceIndex: index,
      });
      return {
        sampledAt: Number(app.elapsed || 0),
        state: app.state,
        phase: activeRecording?.phase || null,
        mode: activeRecording?.mode || null,
        racesCompleted: activeRecording?.racesCompleted ?? null,
        activeRaceIndex: activeRecording?.racesCompleted != null ? activeRecording.racesCompleted + 1 : null,
        leader: app.getRanking?.({ force: false })?.[0] ? (() => {
          const leader = app.getRanking({ force: false })[0];
          return { id: leader.id, name: leader.name, distance: leader.distance, progress: leader.progress };
        })() : null,
        events: (app.broadcastEvents || [])
          .map(serializeEvent)
          .filter((event) => event.title && !/record/i.test(`${event.title} ${event.detail || ''}`)),
        replayHighlightSelection: app.selectReplayHighlightEvents?.().map(serializeEvent) || [],
      };
    }).catch(() => null);
    if (!snapshot) return null;
    state.samples.push(snapshot);
    state.samples = state.samples.slice(-240);
    [...(snapshot.events || []), ...(snapshot.replayHighlightSelection || [])].forEach((event) => {
      const time = Number(event.time);
      if (!Number.isFinite(time)) return;
      const key = `${event.kind}:${event.title}:${event.detail}:${time.toFixed(2)}:${event.marbleId ?? ''}:${event.rivalId ?? ''}`;
      if (!state.eventsByKey.has(key)) {
        state.eventsByKey.set(key, {
          ...event,
          recordedAt: snapshot.sampledAt,
          phase: snapshot.phase,
          mode: snapshot.mode,
          activeRaceIndex: snapshot.activeRaceIndex,
          racesCompleted: snapshot.racesCompleted,
        });
      }
    });
    state.lastSampleAt = snapshot.sampledAt;
    return snapshot;
  };

  const buildEventMarkerDocument = (state = eventMarkerState, summary = renderSummary) => {
    const eventPriority = { overtake: 100, battle: 94, obstacle: 88, leader: 82, speed: 78, progress: 74, finish: 60, winner: 48, complete: 30, general: 10 };
    const events = [...state.eventsByKey.values()]
      .filter((event) => event.title && Number.isFinite(Number(event.time)))
      .sort((a, b) => Number(a.time) - Number(b.time));
    const firstRaceEvents = events.filter((event) => {
      const raceIndex = Number(event.activeRaceIndex ?? event.raceIndex ?? event.race ?? event.racesCompleted + 1);
      return !Number.isFinite(raceIndex) || raceIndex === 1;
    });
    const sourceEvents = firstRaceEvents.length ? firstRaceEvents : events;
    const sourceTimes = sourceEvents.map((event) => Number(event.time)).filter((time) => Number.isFinite(time) && time > 0);
    const firstRaceEnd = sourceTimes.length ? Math.max(...sourceTimes) : 0;
    const firstRaceTarget = firstRaceEnd > 0 ? Math.max(1.2, firstRaceEnd * 0.50) : 0;
    const thumbnailCandidates = events
      .map((event) => {
        const time = Number(event.time);
        const progress = Number(event.progress);
        const earlyBonus = time <= 90 ? 18 : time <= 180 ? 8 : 0;
        const firstRace = sourceEvents.includes(event);
        const firstRaceBonus = firstRace ? 45 : 0;
        const firstRaceTargetBonus = firstRace && firstRaceTarget > 0 ? Math.max(0, 28 - Math.abs(time - firstRaceTarget) * 2.2) : 0;
        const progressTargetBonus = Number.isFinite(progress) ? Math.max(0, 30 - Math.abs(progress - 0.50) * 100) : 0;
        const progressBonus = Number.isFinite(progress) && progress >= 0.25 && progress <= 0.75 ? 12 : 0;
        const textBonus = /overtake|battle|hit|obstacle|chaos|blast|kick|snap|collision/i.test(`${event.title} ${event.detail || ''}`) ? 12 : 0;
        const score = (eventPriority[event.kind] || eventPriority.general) + firstRaceBonus + firstRaceTargetBonus + progressTargetBonus + earlyBonus + progressBonus + textBonus - Math.max(0, time - 180) * 0.12;
        return { ...event, score: Number(score.toFixed(2)), firstRace, firstRaceTarget: firstRaceTarget ? Number(firstRaceTarget.toFixed(3)) : null, suggestedFrameSeconds: Number(Math.max(0.8, time + 0.15).toFixed(3)) };
      })
      .sort((a, b) => (b.score - a.score) || (a.suggestedFrameSeconds - b.suggestedFrameSeconds))
      .slice(0, 12);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      renderOutput: config.output,
      mode: config.mode,
      raceCount: config.mode === 'continuous' ? config.multipleRaceCount : undefined,
      marbleCount: config.cupSize,
      cupName: config.cupName,
      eventCount: events.length,
      sampleCount: state.samples.length,
      lastSampleAt: state.lastSampleAt,
      events,
      thumbnailCandidates,
      samples: state.samples,
      renderSummary: summary || null,
    };
  };

  let browser;
  let renderSummary = null;
  let eventMarkerPoller = null;
  let eventMarkerState = { samples: [], eventsByKey: new Map(), lastSampleAt: 0 };
  try {
    progress('browser-open', config.url);
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
      videoCapture: config.videoCapture,
      videoCanvasLayout: config.videoCanvasLayout,
      outputFormat: config.outputFormat,
      mode: config.mode,
      multipleRaceCount: config.multipleRaceCount,
      marbleCount: config.cupSize,
      cupSize: config.cupSize,
      trackLength: config.trackLength,
      targetSeconds: config.targetSeconds,
      lengthMode: config.lengthMode,
      maxRaceSeconds: config.maxRaceSeconds,
    }));
    const chromeArgs = [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=CalculateNativeWinOcclusion',
      '--enable-gpu',
      '--enable-gpu-rasterization',
      '--enable-zero-copy',
      '--ignore-gpu-blocklist',
    ];
    if (config.headful) chromeArgs.push('--disable-frame-rate-limit');
    if (process.platform === 'darwin') chromeArgs.push('--use-angle=metal');
    browser = await chromium.launch({ headless: !config.headful, args: chromeArgs });
    const context = await browser.newContext({
      viewport: { width: config.captureWidth, height: config.captureHeight },
      deviceScaleFactor: 1,
      ...(config.videoCapture === 'playwright' ? { recordVideo: { dir: videoDir, size: { width: config.captureWidth, height: config.captureHeight } } } : {}),
    });
    const page = await context.newPage();
    if (config.videoCapture === 'canvas') {
      canvasChunkOutput = path.join(videoDir, `canvas-capture-${defaultStamp}.webm`);
      canvasChunkStream = createWriteStream(canvasChunkOutput);
      await page.exposeBinding('marbleRenderWriteCanvasChunk', async (_source, payload = {}) => {
        const bytes = Array.isArray(payload.bytes) ? Buffer.from(payload.bytes) : Buffer.alloc(0);
        if (!bytes.length) return { ok: false, reason: 'empty-chunk', index: payload.index ?? null };
        const index = Number(payload.index ?? 0);
        canvasChunkStats.chunks += 1;
        canvasChunkStats.bytes += bytes.length;
        const now = Date.now();
        if (now - canvasChunkStats.lastLogAt >= 30000) {
          canvasChunkStats.lastLogAt = now;
          log('[progress] canvas-recording', JSON.stringify({ chunks: canvasChunkStats.chunks, mb: Number((canvasChunkStats.bytes / 1048576).toFixed(1)), webm: canvasChunkOutput }));
        }
        canvasChunkWriteChain = canvasChunkWriteChain.then(() => new Promise((resolve, reject) => {
          canvasChunkStream.write(bytes, (error) => (error ? reject(error) : resolve()));
        }));
        await canvasChunkWriteChain;
        return { ok: true, index, bytes: bytes.length };
      });
    }
    page.on('console', (message) => {
      const type = message.type();
      if (['error', 'warning'].includes(type)) console.log(`[browser:${type}] ${message.text()}`);
    });
    page.on('pageerror', (error) => console.error('[browser:pageerror]', error));
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__MARBLE_RACE_APP__), null, { timeout: 60000 });
    let audioCaptureInfo = null;
    if (config.audio) {
      progress('audio-capture-start');
      audioCaptureInfo = await page.evaluate(async (bridge) => {
        const capture = eval(bridge);
        return capture.attach(window.__MARBLE_RACE_APP__);
      }, audioCaptureBridge);
      if (!audioCaptureInfo?.active) fail(`Could not start audio capture: ${JSON.stringify(audioCaptureInfo)}`);
      log('Audio capture started:', JSON.stringify(audioCaptureInfo));
    }
    let canvasCaptureInfo = null;
    if (config.videoCapture === 'canvas') {
      progress('canvas-capture-start', config.videoCanvasLayout);
      canvasCaptureInfo = await page.evaluate(async ({ fps, width, height, videoCanvasLayout }) => {
        const app = window.__MARBLE_RACE_APP__;
        const requestedLayout = ['horizontal', 'vertical'].includes(String(videoCanvasLayout || '').toLowerCase()) ? String(videoCanvasLayout).toLowerCase() : 'horizontal';
        const canvas = app?.setVideoCanvasLayout?.(requestedLayout) && app?.getVideoCaptureCanvas?.() || app?.getVideoCaptureCanvas?.() || app?.renderer?.domElement || document.querySelector('canvas');
        if (!canvas) return { ok: false, reason: 'canvas-missing' };
        if (typeof canvas.captureStream !== 'function') return { ok: false, reason: 'captureStream-unsupported' };
        if (typeof MediaRecorder === 'undefined') return { ok: false, reason: 'MediaRecorder-unsupported' };
        const mimeTypes = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ];
        const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
        const stream = canvas.captureStream(Math.max(1, Math.round(Number(fps) || 60)));
        const recorderOptions = mimeType ? { mimeType, videoBitsPerSecond: 24_000_000 } : { videoBitsPerSecond: 24_000_000 };
        const recorder = new MediaRecorder(stream, recorderOptions);
        const chunks = [];
        let bytes = 0;
        let chunkCount = 0;
        const writeChunk = async (blob) => {
          if (!blob?.size) return;
          const index = chunkCount;
          chunkCount += 1;
          bytes += blob.size;
          chunks.push({ id: index, size: blob.size, type: blob.type || recorder.mimeType || mimeType || 'video/webm' });
          if (typeof window.marbleRenderWriteCanvasChunk === 'function') {
            const arrayBuffer = await blob.arrayBuffer();
            const byteArray = Array.from(new Uint8Array(arrayBuffer));
            await window.marbleRenderWriteCanvasChunk({ index, bytes: byteArray, type: blob.type || recorder.mimeType || mimeType || 'video/webm' });
          }
        };
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data?.size) {
            writeChunk(event.data).catch((error) => {
              console.error('[render:auto-cup] Canvas chunk write failed', error);
            });
          }
        });
        const stopped = new Promise((resolve) => {
          recorder.addEventListener('stop', async () => {
            const bytes = chunks.reduce((sum, chunk) => sum + (chunk.size || 0), 0);
            resolve({
              ok: true,
              mimeType: recorder.mimeType || mimeType || 'video/webm',
              requestedFps: Math.max(1, Math.round(Number(fps) || 60)),
              width: canvas.width || width,
              height: canvas.height || height,
              videoCanvas: app?.getVideoCompositeCanvasInfo?.() || null,
              trackSettings: stream.getVideoTracks()[0]?.getSettings?.() || null,
              bytes,
              chunkCount: chunks.length,
              chunks,
            });
          }, { once: true });
        });
        window.__MARBLE_RENDER_CANVAS_CAPTURE__ = {
          stream,
          recorder,
          chunks,
          startedAt: performance.now(),
          getInfo: () => ({
            ok: true,
            state: recorder.state,
            mimeType: recorder.mimeType || mimeType || 'video/webm',
            requestedFps: Math.max(1, Math.round(Number(fps) || 60)),
            chunkCount: chunks.length,
            elapsedSeconds: (performance.now() - window.__MARBLE_RENDER_CANVAS_CAPTURE__.startedAt) / 1000,
            trackSettings: stream.getVideoTracks()[0]?.getSettings?.() || null,
            videoCanvas: app?.getVideoCompositeCanvasInfo?.() || null,
          }),
          stop: () => {
            if (recorder.state === 'recording') recorder.stop();
            else if (recorder.state === 'inactive') return stopped;
            return stopped.finally(() => stream.getTracks().forEach((track) => track.stop()));
          },
        };
        recorder.start(1000);
        return window.__MARBLE_RENDER_CANVAS_CAPTURE__.getInfo();
      }, { fps: config.fps, width: config.captureWidth, height: config.captureHeight, videoCanvasLayout: config.videoCanvasLayout });
      if (!canvasCaptureInfo?.ok) fail(`Could not start canvas video capture: ${JSON.stringify(canvasCaptureInfo)}`);
      log('Canvas video capture started:', JSON.stringify(canvasCaptureInfo));
    }

    progress('app-start', `${config.mode}, races=${config.multipleRaceCount}, marbles=${config.cupSize}`);
    const started = await page.evaluate(({ mode, multipleRaceCount, cupSize, trackLength, targetSeconds, lengthMode, smokeSeconds, maxRaceSeconds, cupName, ttsVoice, obstaclePreset, obstacleDistribution, obstacleTypes, showLeftUi, showRightUi, disableMouseOrbit, renderPerformanceMode }) => {
      const app = window.__MARBLE_RACE_APP__;
      if (!app) return { ok: false, reason: 'app-missing' };
      app.__playwrightRenderTrackLength = trackLength;
      app.__playwrightRenderTargetSeconds = targetSeconds;
      app.__playwrightRenderLengthMode = lengthMode;
      const unifiedCupTiming = app.getCupVideoTimingEstimate?.() || {};
      app.getCupVideoTimingEstimate = () => ({
        ...unifiedCupTiming,
        targetSeconds,
        targetMinutes: Number((targetSeconds / 60).toFixed(2)),
        stageTrackLengths: { 'quarter-final': trackLength, 'semi-final': trackLength, final: trackLength },
      });
      app.applyCupVideoStageTrackSettings = (stage = app.getCupStage?.()) => {
        if (!app.cupMode?.active || !app.ui?.lengthSelect || !app.ui?.customLength) return;
        const targetLength = lengthMode === 'target-duration'
          ? (app.getCupVideoTimingEstimate?.()?.stageTrackLengths?.[stage] || app.__playwrightRenderTrackLength || 600)
          : (app.__playwrightRenderTrackLength || 600);
        app.ui.lengthSelect.value = 'custom';
        app.ui.customLength.value = String(targetLength);
      };
      app.unlockAudio?.();
      app.setCommentaryEnabled?.(true);
      app.setCommentaryVoiceEnabled?.(true);
      app.setTtsVoice?.(ttsVoice, { resetQueue: false, updateStatus: true });
      app.checkLocalTtsBridge?.();
      if (app.ui?.cupName) app.ui.cupName.value = cupName || 'Speed X Cup';
      if (app.ui?.count) app.ui.count.value = String(cupSize);
      app.marbleCount = cupSize;
      if (app.ui?.cupSize) app.ui.cupSize.value = String(cupSize);
      if (app.ui?.multipleRaceCount) app.ui.multipleRaceCount.value = String(multipleRaceCount || 5);
      if (app.ui?.raceMode) app.ui.raceMode.value = mode === 'cup' ? 'cup' : 'single';
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
      if (app.ui?.obstacleDistribution) {
        app.ui.obstacleDistribution.value = ['random', 'zoned'].includes(obstacleDistribution) ? obstacleDistribution : 'random';
        app.updateObstacleDistribution?.({ regenerateTrack: false });
      }
      if (Array.isArray(obstacleTypes) && obstacleTypes.length && app.ui?.obstacleTypeToggles) {
        app.ui.obstacleTypeToggles.forEach((toggle) => {
          toggle.checked = obstacleTypes.includes(toggle.dataset.obstacleType);
        });
        app.updateObstacleTypeToggles?.({ regenerateTrack: false });
      }
      if (showLeftUi && app.leftUICollapsed) app.toggleLeftUI?.();
      if (!showLeftUi && !app.leftUICollapsed) app.toggleLeftUI?.();
      document.body.classList.toggle('playwright-render-hide-left-ui', !showLeftUi);
      if (!showLeftUi && app.ui?.uiToggle) {
        app.ui.uiToggle.classList.remove('hidden');
        app.ui.uiToggle.style.removeProperty('display');
        app.ui.uiToggle.textContent = 'Like ＆ Subscribe';
      }
      if (showRightUi && app.rightUICollapsed) app.toggleRightUI?.();
      if (!showRightUi && !app.rightUICollapsed) app.toggleRightUI?.();
      if (renderPerformanceMode) {
        const profile = app.performanceProfile || {};
        app.performanceProfile = {
          ...profile,
          mode: 'playwright-render-performance',
          renderPerformanceMode: true,
          uiUpdateMs: Math.max(profile.uiUpdateMs || 500, 1000),
          debugUpdateMs: Math.max(profile.debugUpdateMs || 1200, 2600),
          leaderboardUpdateMs: Math.max(profile.leaderboardUpdateMs || 800, 1800),
          rankingCacheMs: Math.max(profile.rankingCacheMs || 220, 700),
          renderNameLabelUpdateMs: 0,
          renderSkipOrbitControlsUpdate: false,
          renderSkipSpectacleEffects: false,
        };
        const renderPixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        if (app.renderer?.setPixelRatio) app.renderer.setPixelRatio(renderPixelRatio);
        if (app.renderer?.setSize) app.renderer.setSize(window.innerWidth, window.innerHeight, false);
        if (app.renderer?.capabilities?.getMaxAnisotropy) {
          const maxAnisotropy = Math.min(16, app.renderer.capabilities.getMaxAnisotropy() || 1);
          app.scene?.traverse?.((object) => {
            const materials = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
            materials.forEach((material) => {
              ['map', 'emissiveMap', 'roughnessMap', 'metalnessMap'].forEach((key) => {
                const texture = material?.[key];
                if (texture) {
                  texture.anisotropy = Math.max(texture.anisotropy || 1, maxAnisotropy);
                  texture.needsUpdate = true;
                }
              });
            });
          });
        }
        app.__playwrightRenderQuality = { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1, rendererPixelRatio: app.renderer?.getPixelRatio?.() ?? null };
      }
      if (mode === 'cup') app.startCupMode?.(cupSize, { preserveCurrentSettings: true });
      else if (app.cupMode?.active) {
        app.cupMode = { ...app.cupMode, active: false, status: 'idle', stageIndex: 0, currentEntrants: [], results: [], lastQualified: [], champion: null, podium: [] };
        app.newRace?.({ regenerateTrack: false });
      } else {
        app.newRace?.({ regenerateTrack: true });
      }
      app.cameraMode = 'default';
      app.resetDefaultAutoCameraForRace?.();
      if (app.ui?.cameraMode) app.ui.cameraMode.value = 'default';
      app.updateCamera?.(1 / 60);
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
        mode === 'cup' ? (app.getCupDisplayName?.() || cupName || 'Cup Mode') : (mode === 'continuous' ? `Multiple · ${multipleRaceCount || 5} races` : 'Single Race'),
        `${mode === 'cup' ? (app.getCupStage?.() || 'Cup') : (mode === 'continuous' ? 'Multiple' : 'Single')} · ${app.obstaclePreset?.label || 'High-density'} · Live race coverage`,
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
      if (mode === 'single') {
        app.singleRecording = {
          ...(app.singleRecording || {}),
          active: true,
          mode: 'single',
          label: 'Single',
          phase: 'playwright-render-waiting-open-gate',
          startedAt: performance.now(),
          gateDelaySeconds: timing.gateDelaySeconds ?? 2,
          nextActionAt: null,
          pendingTimer: null,
          playwrightRender: true,
        };
        if (maxRaceSeconds > 0) {
          const originalStartSingleRecordingRace = app.startSingleRecordingRace?.bind(app);
          if (originalStartSingleRecordingRace && !app.__playwrightSingleRaceTimeoutWrapped) {
            app.startSingleRecordingRace = (...args) => {
              const result = originalStartSingleRecordingRace(...args);
              window.setTimeout(() => {
                if (!app.singleRecording?.active || app.state !== 'running') return;
                const unfinished = (app.marbleData || []).filter((data) => data && !data.finished && !data.defeated);
                unfinished.forEach((data) => app.eliminateStalledMarble?.(data, data.distance || 0, 'playwright-max-race-timeout'));
                app.checkFinishers?.();
              }, maxRaceSeconds * 1000);
              return result;
            };
            app.__playwrightSingleRaceTimeoutWrapped = true;
          }
        }
        const originalCheckFinishers = app.checkFinishers?.bind(app);
        if (originalCheckFinishers && !app.__playwrightSingleCompletionWrapped) {
          app.checkFinishers = (...args) => {
            const beforeState = app.state;
            const result = originalCheckFinishers(...args);
            if (app.singleRecording?.active && beforeState !== 'finished' && app.state === 'finished') {
              window.setTimeout(() => {
                app.singleRecording.active = false;
                app.singleRecording.phase = 'final-complete';
              }, smokeSeconds > 0 ? Math.max(500, smokeSeconds * 1000) : 5000);
            }
            return result;
          };
          app.__playwrightSingleCompletionWrapped = true;
        }
        app.scheduleSingleRecordingAction?.(app.singleRecording.gateDelaySeconds, 'waiting-open-gate', () => app.startSingleRecordingRace?.());
      } else if (mode === 'continuous') {
        app.continuousRecording = {
          ...(app.continuousRecording || {}),
          active: true,
          mode: 'continuous',
          label: 'Multiple',
          phase: 'playwright-render-waiting-open-gate',
          startedAt: performance.now(),
          racesCompleted: 0,
          totalRaces: multipleRaceCount || 5,
          preserveCurrentSettings: false,
          nextRaceDelaySeconds: timing.postRaceHoldSeconds ?? 5,
          gateDelaySeconds: timing.nextGateAfterRaceSeconds ?? 5,
          initialGateDelaySeconds: timing.gateDelaySeconds ?? 2,
          finalStopDelaySeconds: timing.stopAfterFinalSeconds ?? 5,
          nextActionAt: null,
          pendingTimer: null,
          playwrightRender: true,
        };
        if (maxRaceSeconds > 0) {
          const originalStartContinuousRecordingRace = app.startContinuousRecordingRace?.bind(app);
          if (originalStartContinuousRecordingRace && !app.__playwrightContinuousRaceTimeoutWrapped) {
            app.startContinuousRecordingRace = (...args) => {
              const result = originalStartContinuousRecordingRace(...args);
              window.setTimeout(() => {
                if (!app.continuousRecording?.active || app.state !== 'running') return;
                const unfinished = (app.marbleData || []).filter((data) => data && !data.finished && !data.defeated);
                unfinished.forEach((data) => app.eliminateStalledMarble?.(data, data.distance || 0, 'playwright-max-race-timeout'));
                app.checkFinishers?.();
              }, maxRaceSeconds * 1000);
              return result;
            };
            app.__playwrightContinuousRaceTimeoutWrapped = true;
          }
        }
        app.scheduleContinuousRecordingAction?.(app.continuousRecording.initialGateDelaySeconds, 'waiting-open-gate', () => {
          app.cameraMode = 'default';
          app.resetDefaultAutoCameraForRace?.();
          app.updateCamera?.(1 / 60);
          app.startContinuousRecordingRace?.();
        });
      } else {
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
      app.scheduleAutoCupRecordingAction?.(app.autoCupRecording.gateDelaySeconds, 'waiting-open-gate', () => {
        app.cameraMode = 'default';
        app.resetDefaultAutoCameraForRace?.();
        app.updateCamera?.(1 / 60);
        app.startAutoCupRace?.();
      });
      }
      const activeRecording = mode === 'single' ? app.singleRecording : mode === 'continuous' ? app.continuousRecording : app.autoCupRecording;
      return {
        ok: true,
        cupSize,
        trackLength: app.trackLength,
        trackPreset: app.trackPresetKey,
        customTrackLength: app.customTrackLength,
        renderTrackLength: app.__playwrightRenderTrackLength,
        renderTargetSeconds: app.__playwrightRenderTargetSeconds,
        renderLengthMode: app.__playwrightRenderLengthMode,
        mode,
        multipleRaceCount,
        cupName: mode === 'cup' ? app.getCupDisplayName?.() : (cupName || 'Single Race'),
        ttsVoice: app.localTtsBridge?.voice || ttsVoice,
        obstacleLabel: app.obstaclePreset?.label,
        obstacleTypes: [...(app.enabledObstacleTypes || [])],
        obstacleTypeCounts: app.obstacleTypeCounts,
        phase: activeRecording?.phase,
        stage: mode === 'cup' ? app.getCupStage?.() : mode,
        cameraMode: app.cameraMode,
        activeDefaultCameraShot: app.getDefaultCameraMode?.(),
        activeCameraMode: app.activeCameraMode,
        enableAllCameraMouseOrbit: app.enableAllCameraMouseOrbit,
        leftUICollapsed: app.leftUICollapsed,
        leftUiInstantHidden: document.body.classList.contains('playwright-render-hide-left-ui'),
        leftHudDisplay: app.ui?.leftHud ? getComputedStyle(app.ui.leftHud).display : null,
        likeSubscribeVisible: app.ui?.uiToggle ? getComputedStyle(app.ui.uiToggle).display !== 'none' : null,
        likeSubscribeText: app.ui?.uiToggle?.textContent || null,
        rightUICollapsed: app.rightUICollapsed,
        rightHudVisible: Boolean(app.ui?.rightHud && !app.ui.rightHud.classList.contains('collapsed')),
        fpsHudHidden: Boolean(app.ui?.fpsStat?.classList.contains('hidden') || app.ui?.fps?.closest?.('.stats-grid > div')?.classList.contains('hidden')),
        liveEventOverlayVisible: Boolean(app.ui?.caption && !app.ui.caption.classList.contains('hidden')),
        liveEventOverlayTitle: app.ui?.captionTitle?.textContent || null,
        liveEventOverlayDetail: app.ui?.captionDetail?.textContent || null,
        performanceProfile: app.performanceProfile,
        rendererPixelRatio: app.renderer?.getPixelRatio?.() ?? null,
        rendererSize: app.renderer?.getSize ? (() => { const size = { width: 0, height: 0, set(x, y) { this.width = x; this.height = y; return this; } }; app.renderer.getSize(size); return { width: size.width, height: size.height }; })() : null,
        timingPlan: mode === 'cup' ? app.autoCupRecording?.timingPlan : {
          gateDelaySeconds: activeRecording?.gateDelaySeconds,
          totalRaces: activeRecording?.totalRaces,
          nextRaceDelaySeconds: activeRecording?.nextRaceDelaySeconds,
          finalStopDelaySeconds: activeRecording?.finalStopDelaySeconds,
          singleUsesMultipleFinalStopLogic: mode === 'single' ? true : undefined,
        },
      };
    }, {
      mode: config.mode,
      multipleRaceCount: config.multipleRaceCount,
      cupSize: config.cupSize,
      trackLength: config.trackLength,
      targetSeconds: config.targetSeconds,
      lengthMode: config.lengthMode,
      smokeSeconds: config.smokeSeconds,
      maxRaceSeconds: config.maxRaceSeconds,
      cupName: config.cupName,
      ttsVoice: config.ttsVoice,
      obstaclePreset: config.obstaclePreset,
      obstacleDistribution: config.obstacleDistribution,
      obstacleTypes: config.obstacleTypes,
      showLeftUi: config.showLeftUi,
      showRightUi: config.showRightUi,
      disableMouseOrbit: config.disableMouseOrbit,
      renderPerformanceMode: config.renderPerformanceMode,
    });
    if (!started.ok) fail(`Could not start Playwright auto cup: ${started.reason || 'unknown'}`);
    log('Auto cup started:', JSON.stringify(started));
    progress('race-running', `${config.mode}, target=${config.targetSeconds}s, timeout=${config.timeoutSeconds}s`);

    await collectEventMarkerSnapshot(page);
    eventMarkerPoller = setInterval(() => {
      collectEventMarkerSnapshot(page).catch(() => {});
    }, config.eventMarkerIntervalSeconds * 1000);

    if (config.smokeSeconds > 0) {
      await page.waitForTimeout(config.smokeSeconds * 1000);
      const smokeState = await page.evaluate(() => {
        const app = window.__MARBLE_RACE_APP__;
        if (app?.autoCupRecording) {
          app.autoCupRecording.active = false;
          app.autoCupRecording.phase = 'playwright-smoke-complete';
          app.clearAutoCupRecordingTimer?.();
        }
        if (app?.singleRecording) {
          app.singleRecording.active = false;
          app.singleRecording.phase = 'playwright-smoke-complete';
          app.clearSingleRecordingTimer?.();
        }
        if (app?.continuousRecording) {
          app.continuousRecording.active = false;
          app.continuousRecording.phase = 'playwright-smoke-complete';
          app.clearContinuousRecordingTimer?.();
        }
        const activeRecording = app ? (app.singleRecording?.playwrightRender ? app.singleRecording : app.continuousRecording?.playwrightRender ? app.continuousRecording : app.autoCupRecording) : null;
        return app ? {
          done: true,
          ok: true,
          mode: activeRecording?.mode || null,
          phase: activeRecording?.phase,
          racesCompleted: activeRecording?.racesCompleted,
          cupStatus: app.cupMode?.status,
          stage: app.getCupStage?.(),
          cameraMode: app.cameraMode,
          activeDefaultCameraShot: app.getDefaultCameraMode?.(),
          activeCameraMode: app.activeCameraMode,
          enableAllCameraMouseOrbit: app.enableAllCameraMouseOrbit,
          leftUICollapsed: app.leftUICollapsed,
          leftUiInstantHidden: document.body.classList.contains('playwright-render-hide-left-ui'),
          leftHudDisplay: app.ui?.leftHud ? getComputedStyle(app.ui.leftHud).display : null,
          likeSubscribeVisible: app.ui?.uiToggle ? getComputedStyle(app.ui.uiToggle).display !== 'none' : null,
          likeSubscribeText: app.ui?.uiToggle?.textContent || null,
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
          const singleDone = app.singleRecording?.playwrightRender && app.singleRecording.active === false && ['final-complete', 'playwright-smoke-complete'].includes(app.singleRecording.phase);
          const continuousDone = app.continuousRecording?.playwrightRender && app.continuousRecording.active === false && ['completed-all-races', 'playwright-smoke-complete'].includes(app.continuousRecording.phase);
          const continuousReachedTarget = app.continuousRecording?.playwrightRender
            && Number(app.continuousRecording.racesCompleted || 0) >= Number(app.continuousRecording.totalRaces || 0)
            && app.continuousRecording.phase === 'waiting-final-stop';
          if (finalDone || stopped || singleDone || continuousDone || continuousReachedTarget) {
            if (continuousReachedTarget && app.continuousRecording?.active) {
              app.stopContinuousRecording?.({ stopRecorder: false, reason: 'completed-all-races' });
            }
            const activeRecording = singleDone ? app.singleRecording : (continuousDone || continuousReachedTarget) ? app.continuousRecording : app.autoCupRecording;
            return {
            done: true,
            ok: true,
            mode: activeRecording?.mode || null,
            phase: activeRecording?.phase,
            racesCompleted: activeRecording?.racesCompleted,
            cupStatus: app.cupMode?.status,
            champion: app.cupMode?.champion?.name || null,
          };
          }
          return false;
        },
        null,
        { timeout: waitTimeout, polling: 1000 },
      ).then((handle) => handle.jsonValue()).catch(async (error) => {
        const state = await page.evaluate(() => {
          const app = window.__MARBLE_RACE_APP__;
          return app ? {
            state: app.state,
            mode: app.singleRecording?.playwrightRender ? app.singleRecording.mode : app.continuousRecording?.playwrightRender ? app.continuousRecording.mode : app.autoCupRecording?.mode,
            phase: app.singleRecording?.playwrightRender ? app.singleRecording.phase : app.continuousRecording?.playwrightRender ? app.continuousRecording.phase : app.autoCupRecording?.phase,
            racesCompleted: app.singleRecording?.playwrightRender ? null : app.continuousRecording?.playwrightRender ? app.continuousRecording.racesCompleted : app.autoCupRecording?.racesCompleted,
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

    progress('capture-finalize', 'collect metadata + stop recorder');
    await page.waitForTimeout(1000);
    if (eventMarkerPoller) {
      clearInterval(eventMarkerPoller);
      eventMarkerPoller = null;
    }
    await collectEventMarkerSnapshot(page);
    renderSummary = await page.evaluate(() => {
      const app = window.__MARBLE_RACE_APP__;
      if (!app) return null;
      const activeRecording = app.singleRecording?.playwrightRender
        ? app.singleRecording
        : app.continuousRecording?.playwrightRender
          ? app.continuousRecording
          : app.autoCupRecording;
      const podium = app.cupMode?.podium?.length ? app.cupMode.podium : (app.finishers || []).slice(0, 3);
      return {
        cupName: app.cupMode?.active ? app.getCupDisplayName?.() : activeRecording?.label,
        mode: activeRecording?.mode || null,
        phase: activeRecording?.phase || null,
        state: app.state,
        elapsed: app.elapsed,
        winner: podium?.[0]?.name || app.finishers?.[0]?.name || app.cupMode?.champion?.name || null,
        champion: app.cupMode?.champion?.name || null,
        podium: (podium || []).slice(0, 3).map((data, index) => ({ rank: index + 1, id: data.id, name: data.name, time: data.finishTime ?? null })),
        broadcastEvents: (app.broadcastEvents || []).map((event) => ({
          title: event.title,
          detail: event.detail,
          kind: event.kind,
          time: event.time,
          progress: event.progress,
          distance: event.distance,
          marbleId: event.marbleId,
          rivalId: event.rivalId,
        })).filter((event) => event.title && !/record/i.test(`${event.title} ${event.detail || ''}`)).slice(0, 60),
        replayHighlightSelection: app.selectReplayHighlightEvents?.().map((event) => ({
          title: event.title,
          detail: event.detail,
          kind: event.kind,
          time: event.time,
          progress: event.progress,
          distance: event.distance,
          marbleId: event.marbleId,
          rivalId: event.rivalId,
        })) || [],
      };
    }).catch(() => null);
    if (renderSummary) {
      const markerDocument = buildEventMarkerDocument(eventMarkerState, renderSummary);
      renderSummary.eventMarkers = markerDocument.events;
      renderSummary.thumbnailCandidates = markerDocument.thumbnailCandidates;
      renderSummary.eventMarkersOutput = config.eventMarkersOutput || '';
    }
    if (renderSummary) log('Render metadata summary:', JSON.stringify({ eventCount: renderSummary.eventMarkers?.length || renderSummary.broadcastEvents?.length || 0, thumbnailCandidateCount: renderSummary.thumbnailCandidates?.length || 0, winner: renderSummary.winner, champion: renderSummary.champion, cupName: renderSummary.cupName }));
    const runtimeFpsSummary = await page.evaluate(() => {
      const app = window.__MARBLE_RACE_APP__;
      return app ? {
        measuredFps: app.lastFps,
        fpsHudText: app.ui?.fps?.textContent || null,
        performanceProfile: app.performanceProfile,
        rendererPixelRatio: app.renderer?.getPixelRatio?.() ?? null,
        rendererSize: app.renderer?.getSize ? (() => { const size = { width: 0, height: 0, set(x, y) { this.width = x; this.height = y; return this; } }; app.renderer.getSize(size); return { width: size.width, height: size.height }; })() : null,
        nameLabelUpdateMs: app.performanceProfile?.renderNameLabelUpdateMs ?? null,
        skipOrbitControlsUpdate: Boolean(app.performanceProfile?.renderSkipOrbitControlsUpdate),
        skipSpectacleEffects: Boolean(app.performanceProfile?.renderSkipSpectacleEffects),
        marbleCount: app.marbleData?.length || 0,
      } : { measuredFps: null };
    }).catch(() => null);
    if (runtimeFpsSummary) log('Runtime FPS summary:', JSON.stringify(runtimeFpsSummary));
    let canvasSourceWebm = null;
    if (config.videoCapture === 'canvas') {
      progress('canvas-stop');
      const canvasResult = await page.evaluate(() => {
        const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__;
        if (!capture) return { ok: false, reason: 'capture-missing' };
        return capture.stop();
      });
      if (!canvasResult?.ok || !canvasResult.chunkCount) fail(`Canvas video capture failed: ${JSON.stringify(canvasResult)}`);
      await waitForCanvasChunkWrites();
      canvasSourceWebm = canvasChunkOutput || path.join(videoDir, `canvas-capture-${defaultStamp}.webm`);
      if (!existsSync(canvasSourceWebm) || statSync(canvasSourceWebm).size <= 0) fail(`Canvas stream output was not written: ${canvasSourceWebm}`);
      log('Canvas video captured:', JSON.stringify({ ...canvasResult, webm: canvasSourceWebm, bytes: statSync(canvasSourceWebm).size }));
    }
    if (config.audio) {
      progress('audio-finalize');
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
    if (eventMarkerPoller) {
      clearInterval(eventMarkerPoller);
      eventMarkerPoller = null;
    }
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill('SIGTERM');
  }

  let sourceWebm = null;
  if (config.videoCapture === 'canvas') {
    sourceWebm = path.join(videoDir, `canvas-capture-${defaultStamp}.webm`);
    if (!existsSync(sourceWebm) || statSync(sourceWebm).size <= 0) fail(`No canvas capture .webm video found: ${sourceWebm}`);
  } else {
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
    sourceWebm = webmFiles[0];
  }
  try {
    log('Source WebM probe:', JSON.stringify(ffprobeJson(sourceWebm)));
  } catch (error) {
    console.warn('[render:auto-cup] Could not ffprobe source WebM:', error?.message || error);
  }
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
  const hasAudio = config.audio && existsSync(config.audioOutput) && statSync(config.audioOutput).size > 44;
  const companionWebmOutput = outputExt === '.mp4'
    ? path.resolve(`${config.output.replace(/\.[^.]+$/, '')}.comparison.webm`)
    : null;
  if (outputExt === '.webm') {
    log(`Muxing browser-canvas WebM and captured page/TTS audio ${sourceWebm} -> ${config.output}`);
    const ffmpegArgs = ['-y', '-i', sourceWebm];
    if (hasAudio) {
      ffmpegArgs.push('-i', config.audioOutput, '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '160k');
    } else {
      ffmpegArgs.push('-map', '0:v:0', '-c:v', 'copy');
    }
    ffmpegArgs.push(config.output);
    progress('ffmpeg-webm-mux', config.output);
    run('ffmpeg', ffmpegArgs);
  } else {
    log(`Muxing comparison WebM ${sourceWebm} -> ${companionWebmOutput}`);
    const webmArgs = ['-y', '-i', sourceWebm];
    if (hasAudio) {
      webmArgs.push('-i', config.audioOutput, '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '160k');
    } else {
      webmArgs.push('-map', '0:v:0', '-c:v', 'copy');
    }
    webmArgs.push(companionWebmOutput);
    progress('ffmpeg-comparison-webm', companionWebmOutput);
    run('ffmpeg', webmArgs);
    if (!existsSync(companionWebmOutput) || statSync(companionWebmOutput).size <= 0) fail(`Comparison WebM was not created: ${companionWebmOutput}`);
    try {
      log('Comparison WebM probe:', JSON.stringify(ffprobeJson(companionWebmOutput)));
    } catch (error) {
      console.warn('[render:auto-cup] Could not ffprobe comparison WebM:', error?.message || error);
    }

    log(`Converting ${sourceWebm} -> ${config.output}`);
    const ffmpegArgs = ['-y', '-i', sourceWebm];
    if (hasAudio) {
      ffmpegArgs.push('-i', config.audioOutput, '-map', '0:v:0', '-map', '1:a:0', '-shortest');
    }
    ffmpegArgs.push('-vf', `fps=${config.fps},scale=${config.width}:${config.height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', config.videoPreset, '-crf', String(config.videoCrf));
    if (hasAudio) {
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '160k');
    }
    ffmpegArgs.push('-movflags', '+faststart', config.output);
    progress('ffmpeg-mp4-encode', config.output);
    run('ffmpeg', ffmpegArgs);
  }
  if (!existsSync(config.output) || statSync(config.output).size <= 0) fail(`Output video was not created: ${config.output}`);
  try {
    log('Output video probe:', JSON.stringify(ffprobeJson(config.output)));
  } catch (error) {
    console.warn('[render:auto-cup] Could not ffprobe output video:', error?.message || error);
  }
  if (companionWebmOutput) log(`Comparison WebM: ${companionWebmOutput}`);
  const eventMarkersOutput = path.resolve(config.eventMarkersOutput || `${config.output.replace(/\.[^.]+$/, '')}.events.json`);
  const eventMarkerDocument = buildEventMarkerDocument(eventMarkerState, renderSummary);
  if (renderSummary) {
    renderSummary.eventMarkers = eventMarkerDocument.events;
    renderSummary.thumbnailCandidates = eventMarkerDocument.thumbnailCandidates;
    renderSummary.eventMarkersOutput = config.keepEventMarkers ? eventMarkersOutput : '';
  }
  if (config.keepEventMarkers) {
    mkdirSync(path.dirname(eventMarkersOutput), { recursive: true });
    writeFileSync(eventMarkersOutput, `${JSON.stringify(eventMarkerDocument, null, 2)}\n`);
    config.eventMarkersOutput = eventMarkersOutput;
    log(`Event markers: ${eventMarkersOutput} (${eventMarkerDocument.eventCount} events, ${eventMarkerDocument.thumbnailCandidates.length} thumbnail candidates)`);
  } else {
    config.eventMarkersOutput = '';
    log(`Event markers kept in memory only (${eventMarkerDocument.eventCount} events, ${eventMarkerDocument.thumbnailCandidates.length} thumbnail candidates)`);
  }
  if (config.thumbnail) {
    progress('thumbnail-youtube-postprocess');
    const thumbnailOutput = path.resolve(config.thumbnailOutput || `${config.output.replace(/\.[^.]+$/, '')}.thumbnail.jpg`);
    const metadataOutput = path.resolve(`${thumbnailOutput}.metadata.json`);
    const youtubeMetadataOutput = path.resolve(config.youtubeMetadataOutput || `${config.output.replace(/\.[^.]+$/, '')}.youtube.json`);
    const metadata = {
      ...(renderSummary || {}),
      title: config.thumbnailTitle || renderSummary?.cupName || config.cupName || 'Epic Marble Race',
      thumbnailTitle: config.thumbnailTitle || '',
      generatedFrom: config.output,
      renderOutput: config.output,
      companionWebmOutput,
      eventMarkersOutput,
    };
    mkdirSync(path.dirname(thumbnailOutput), { recursive: true });
    writeFileSync(metadataOutput, `${JSON.stringify(metadata, null, 2)}\n`);
    const thumbnailArgs = [
      'scripts/generate-youtube-thumbnail.js',
      `--input=${config.output}`,
      `--output=${thumbnailOutput}`,
      `--metadata=${metadataOutput}`,
      `--frame-strategy=${config.thumbnailFrameStrategy}`,
      `--safe-crop=${config.thumbnailSafeCrop}`,
      `--max-words=${config.thumbnailMaxWords}`,
    ];
    if (config.thumbnailTitle) thumbnailArgs.push(`--title=${config.thumbnailTitle}`);
    run('node', thumbnailArgs);
    if (!config.keepThumbnailMetadata) {
      rmSync(metadataOutput, { force: true });
      rmSync(`${thumbnailOutput}.json`, { force: true });
    }
    if (!existsSync(thumbnailOutput) || statSync(thumbnailOutput).size <= 0) fail(`Thumbnail was not created: ${thumbnailOutput}`);
    log(`Thumbnail: ${thumbnailOutput}`);
    if (config.youtubeMetadata) {
      const youtubeMetadata = buildYoutubeVideoMetadata({ config, renderSummary, thumbnailOutput, metadataOutput: config.keepThumbnailMetadata ? metadataOutput : '', companionWebmOutput, eventMarkersOutput: config.keepEventMarkers ? eventMarkersOutput : '' });
      mkdirSync(path.dirname(youtubeMetadataOutput), { recursive: true });
      writeFileSync(youtubeMetadataOutput, `${JSON.stringify(youtubeMetadata, null, 2)}\n`);
      log(`YouTube metadata: ${youtubeMetadataOutput}`);
      log(`YouTube title: ${youtubeMetadata.title}`);
      log(`YouTube title type: ${youtubeMetadata.titleType}; avoided recent types: ${youtubeMetadata.recentTitleTypesAvoided.join(', ') || 'none'}`);
    }
  }
  if (!config.keepWebm) rmSync(videoDir, { recursive: true, force: true });
  progress('done', config.output);
  log(`Done: ${config.output}`);
}

if (process.env.MARBLE_RENDER_TEST_TITLE_HISTORY === 'true') {
  const recentTitles = readYoutubeTitleHistory(process.env.MARBLE_RENDER_YOUTUBE_TITLE_HISTORY || recordingsDir, Number(process.env.MARBLE_RENDER_YOUTUBE_TITLE_HISTORY_LIMIT || 10));
  const titleResult = makeClickbaitVideoTitle(process.env.MARBLE_RENDER_TEST_BASE_TITLE || '8 Races, 30 Marbles!', { fallbackTitle: '30 Marbles, 10 Races, Total Chaos!', recentTitles, historyLimit: 10 });
  process.stdout.write(`${JSON.stringify({ title: titleResult.title, titleType: titleResult.titleType || classifyYoutubeTitleType(titleResult.title), recentTitleTypesAvoided: [...new Set(recentTitles.map((item) => item.titleType))] }, null, 2)}\n`);
  process.exit(0);
}

main().catch((error) => fail('Unhandled render failure', error));
