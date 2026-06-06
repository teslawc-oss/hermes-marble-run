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
const hasExplicitTimeout = args.has('timeout') || process.env.MARBLE_RENDER_TIMEOUT != null;
const averageRaceSecondsPerMeter = 90 / 300;
const estimateMaxRaceSecondsForTrackLength = (trackLength) => Math.max(45, Math.min(1200, Math.ceil(trackLength * averageRaceSecondsPerMeter)));
const estimateNonRaceSeconds = (mode, raceCount) => {
  if (mode === 'cup') return 164;
  if (mode === 'survivor') return 2 + Math.max(0, raceCount - 1) * 15 + 5;
  if (mode === 'continuous') return 2 + Math.max(0, raceCount - 1) * 10 + 5;
  return 7;
};

const rawVideoCapture = String(args.get('video-capture') || process.env.MARBLE_RENDER_VIDEO_CAPTURE || '').toLowerCase();
const MARBLE_VISUAL_THEME_KEYS = ['mixed', 'neon', 'luxe', 'candy', 'natural'];
const config = {
  url: args.get('url') || process.env.MARBLE_RENDER_URL || 'http://127.0.0.1:4173',
  port: Number(args.get('port') || process.env.MARBLE_RENDER_PORT || 4173),
  output: path.resolve(args.get('output') || process.env.MARBLE_RENDER_OUTPUT || path.join(recordingsDir, `auto-cup-${defaultStamp}.webm`)),
  cupSize: Number(args.get('cup-size') || process.env.MARBLE_RENDER_CUP_SIZE || 12),
  trackLength: Number(args.get('track-length') || process.env.MARBLE_RENDER_TRACK_LENGTH || 600),
  targetSeconds: Number(args.get('target-seconds') || process.env.MARBLE_RENDER_TARGET_SECONDS || 600),
  lengthMode: args.get('length-mode') || process.env.MARBLE_RENDER_LENGTH_MODE || 'target-duration',
  width: Number(args.get('width') || process.env.MARBLE_RENDER_WIDTH || 1280),
  height: Number(args.get('height') || process.env.MARBLE_RENDER_HEIGHT || 720),
  captureScale: Number(args.get('capture-scale') || process.env.MARBLE_RENDER_CAPTURE_SCALE || 1),
  fps: Number(args.get('fps') || process.env.MARBLE_RENDER_FPS || 60),
  videoCrf: Number(args.get('crf') || process.env.MARBLE_RENDER_CRF || 18),
  videoPreset: args.get('video-preset') || process.env.MARBLE_RENDER_VIDEO_PRESET || 'veryfast',
  timeoutSeconds: Number(args.get('timeout') || process.env.MARBLE_RENDER_TIMEOUT || 900),
  smokeSeconds: Number(args.get('smoke-seconds') || process.env.MARBLE_RENDER_SMOKE_SECONDS || 0),
  maxRaceSeconds: Number(args.get('max-race-seconds') || process.env.MARBLE_RENDER_MAX_RACE_SECONDS || 0),
  keepWebm: args.get('keep-webm') === 'true' || process.env.MARBLE_RENDER_KEEP_WEBM === 'true',
  debugLogs: args.get('debug-logs') === 'true' || args.get('verbose') === 'true' || process.env.MARBLE_RENDER_DEBUG_LOGS === 'true' || process.env.MARBLE_RENDER_VERBOSE === 'true',
  headful: args.get('headful') === 'true' || process.env.MARBLE_RENDER_HEADFUL === 'true',
  browserWindowPosition: args.get('browser-window-position') || process.env.MARBLE_RENDER_BROWSER_WINDOW_POSITION || '',
  noBuild: args.get('no-build') === 'true' || process.env.MARBLE_RENDER_NO_BUILD === 'true',
  noServer: args.get('no-server') === 'true' || process.env.MARBLE_RENDER_NO_SERVER === 'true',
  showLeftUi: args.get('show-left-ui') === 'true' || process.env.MARBLE_RENDER_SHOW_LEFT_UI === 'true',
  showRightUi: args.get('show-right-ui') !== 'false' && process.env.MARBLE_RENDER_SHOW_RIGHT_UI !== 'false',
  disableMouseOrbit: args.get('disable-mouse-orbit') !== 'false' && process.env.MARBLE_RENDER_DISABLE_MOUSE_ORBIT !== 'false',
  audio: args.get('audio') !== 'false' && process.env.MARBLE_RENDER_AUDIO !== 'false',
  videoCapture: ['playwright', 'canvas', 'none', 'off', 'false'].includes(rawVideoCapture)
    ? ({ off: 'none', false: 'none' }[rawVideoCapture] || rawVideoCapture)
    : 'canvas',
  canvasTransport: String(args.get('canvas-transport') || process.env.MARBLE_RENDER_CANVAS_TRANSPORT || 'chunk').toLowerCase(),
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
  uploadYoutube: args.get('upload-youtube') === 'true' || process.env.MARBLE_RENDER_UPLOAD_YOUTUBE === 'true',
  youtubePrivacy: args.get('youtube-privacy') || process.env.MARBLE_RENDER_YOUTUBE_PRIVACY || 'private',
  youtubeUploadOutput: args.get('youtube-upload-output') || process.env.MARBLE_RENDER_YOUTUBE_UPLOAD_OUTPUT || '',
  youtubeUploadToken: args.get('youtube-upload-token') || process.env.MARBLE_RENDER_YOUTUBE_UPLOAD_TOKEN || '',
  keepEventMarkers: args.get('keep-event-markers') === 'true' || process.env.MARBLE_RENDER_KEEP_EVENT_MARKERS === 'true',
  keepThumbnailMetadata: args.get('keep-thumbnail-metadata') === 'true' || process.env.MARBLE_RENDER_KEEP_THUMBNAIL_METADATA === 'true',
  youtubeMetadataTemplate: args.get('youtube-metadata-template') || process.env.MARBLE_RENDER_YOUTUBE_METADATA_TEMPLATE || path.join(rootDir, 'config/youtube-video-metadata-template.json'),
  youtubeTitleHistory: args.get('youtube-title-history') || process.env.MARBLE_RENDER_YOUTUBE_TITLE_HISTORY || recordingsDir,
  youtubeTitleHistoryLimit: Number(args.get('youtube-title-history-limit') || process.env.MARBLE_RENDER_YOUTUBE_TITLE_HISTORY_LIMIT || 10),
  renderPerformanceMode: args.get('render-performance-mode') !== 'false' && process.env.MARBLE_RENDER_PERFORMANCE_MODE !== 'false',
  renderPerformanceProfile: args.get('render-performance-profile') || process.env.MARBLE_RENDER_PERFORMANCE_PROFILE || 'turbo60',
  audioOutput: args.get('audio-output') || process.env.MARBLE_RENDER_AUDIO_OUTPUT || '',
  mode: ['cup', 'continuous', 'single', 'survivor'].includes(args.get('mode') || process.env.MARBLE_RENDER_MODE) ? (args.get('mode') || process.env.MARBLE_RENDER_MODE) : 'continuous',
  multipleRaceCount: Number(args.get('multiple-race-count') || process.env.MARBLE_RENDER_MULTIPLE_RACE_COUNT || 5),
  cupName: args.get('cup-name') || process.env.MARBLE_RENDER_CUP_NAME || 'Speed X Cup',
  ttsVoice: args.get('tts-voice') || process.env.MARBLE_RENDER_TTS_VOICE || 'Alex',
  obstaclePreset: args.get('obstacle-preset') || process.env.MARBLE_RENDER_OBSTACLE_PRESET || '',
  obstacleDistribution: args.get('obstacle-distribution') || process.env.MARBLE_RENDER_OBSTACLE_DISTRIBUTION || 'random',
  obstacleTypes: (args.get('obstacle-types') || process.env.MARBLE_RENDER_OBSTACLE_TYPES || '').split(',').map((type) => type.trim()).filter(Boolean),
  visualTheme: args.get('visual-theme') || args.get('theme') || process.env.MARBLE_RENDER_VISUAL_THEME || process.env.MARBLE_RENDER_THEME || '',
  survivorStateInput: args.get('survivor-state-input') || process.env.MARBLE_RENDER_SURVIVOR_STATE_INPUT || '',
  survivorStateOutput: args.get('survivor-state-output') || process.env.MARBLE_RENDER_SURVIVOR_STATE_OUTPUT || '',
};
config.captureScale = Number.isFinite(config.captureScale) && config.captureScale > 0 ? config.captureScale : 1;
config.targetSeconds = Number.isFinite(config.targetSeconds) ? Math.max(60, Math.min(7200, Math.round(config.targetSeconds))) : 600;
config.lengthMode = config.lengthMode === 'fixed-track' ? 'fixed-track' : 'target-duration';
config.trackLength = Number.isFinite(config.trackLength) ? Math.max(30, Math.min(3000, Math.round(config.trackLength))) : 600;
const configuredMaxRaceSeconds = hasExplicitMaxRaceSeconds && Number.isFinite(config.maxRaceSeconds) && config.maxRaceSeconds > 0
  ? Math.max(45, Math.min(1200, Math.round(config.maxRaceSeconds)))
  : 0;
const timeoutRaceSecondsEstimate = configuredMaxRaceSeconds || estimateMaxRaceSecondsForTrackLength(config.trackLength);
config.maxRaceSeconds = configuredMaxRaceSeconds;
config.multipleRaceCount = Number.isFinite(config.multipleRaceCount) ? Math.max(1, Math.min(99, Math.round(config.multipleRaceCount))) : 5;
const estimatedRaceCount = config.mode === 'continuous' || config.mode === 'survivor' ? config.multipleRaceCount : config.mode === 'single' ? 1 : 7;
const dynamicTimeoutSeconds = Math.ceil((timeoutRaceSecondsEstimate * estimatedRaceCount) + estimateNonRaceSeconds(config.mode, estimatedRaceCount) + 300);
config.timeoutSeconds = hasExplicitTimeout && Number.isFinite(config.timeoutSeconds) && config.timeoutSeconds > 0
  ? Math.max(120, Math.min(7200, Math.round(config.timeoutSeconds)))
  : Math.max(120, Math.min(7200, dynamicTimeoutSeconds));
if (config.videoCanvasLayout === 'vertical' && !args.has('width') && !process.env.MARBLE_RENDER_WIDTH) config.width = 720;
if (config.videoCanvasLayout === 'vertical' && !args.has('height') && !process.env.MARBLE_RENDER_HEIGHT) config.height = 1280;
config.youtubeKind = config.videoCanvasLayout === 'vertical' ? 'shorts' : 'long';
config.outputAspectRatio = config.videoCanvasLayout === 'vertical' ? '9:16' : '16:9';
config.captureWidth = Math.round(config.width * config.captureScale);
config.captureHeight = Math.round(config.height * config.captureScale);
config.thumbnailMaxWords = Number.isFinite(config.thumbnailMaxWords) ? Math.max(2, Math.min(10, Math.round(config.thumbnailMaxWords))) : 6;
config.eventMarkerIntervalSeconds = Number.isFinite(config.eventMarkerIntervalSeconds) ? Math.max(1, Math.min(60, Math.round(config.eventMarkerIntervalSeconds))) : 5;
config.eventMarkersOutput = config.eventMarkersOutput ? path.resolve(config.eventMarkersOutput) : '';
config.youtubeTitleHistoryLimit = Number.isFinite(config.youtubeTitleHistoryLimit) ? Math.max(0, Math.min(50, Math.round(config.youtubeTitleHistoryLimit))) : 10;
config.youtubeTitleHistory = String(config.youtubeTitleHistory || '').trim();
config.youtubePrivacy = ['private', 'unlisted', 'public'].includes(String(config.youtubePrivacy).toLowerCase()) ? String(config.youtubePrivacy).toLowerCase() : 'private';
config.youtubeUploadOutput = config.youtubeUploadOutput ? path.resolve(config.youtubeUploadOutput) : '';
config.youtubeUploadToken = String(config.youtubeUploadToken || '').trim();
if (config.uploadYoutube) config.youtubeMetadata = true;

config.ttsVoice = String(config.ttsVoice || 'Alex').replace(/[^\w .'-]/g, '').trim().slice(0, 48) || 'Alex';
config.obstacleDistribution = ['random', 'zoned'].includes(config.obstacleDistribution) ? config.obstacleDistribution : 'random';
config.visualTheme = MARBLE_VISUAL_THEME_KEYS.includes(String(config.visualTheme || '').trim()) ? String(config.visualTheme).trim() : '';
config.survivorStateInput = config.survivorStateInput ? path.resolve(config.survivorStateInput) : '';
config.survivorStateOutput = config.survivorStateOutput
  ? path.resolve(config.survivorStateOutput)
  : (config.mode === 'survivor' ? path.join(recordingsDir, 'survivor-league-state.json') : '');
if (config.mode === 'survivor' && !config.survivorStateInput) config.survivorStateInput = config.survivorStateOutput;
let audioOutputPath = config.audioOutput ? path.resolve(config.audioOutput) : '';
const explicitAudioOutputPath = audioOutputPath;

function defaultAudioOutputForRenderOutput(outputPath) {
  const parsed = path.parse(path.resolve(outputPath || path.join(recordingsDir, `auto-cup-${defaultStamp}.webm`)));
  return path.join(parsed.dir, `${parsed.name}.wav`);
}

function resolveAudioOutputPath({ syncToOutput = false } = {}) {
  if (!explicitAudioOutputPath && (syncToOutput || !audioOutputPath)) audioOutputPath = defaultAudioOutputForRenderOutput(config.output);
  audioOutputPath = path.resolve(audioOutputPath || defaultAudioOutputForRenderOutput(config.output));
  mkdirSync(path.dirname(audioOutputPath), { recursive: true });
  return audioOutputPath;
}

const renderStartedAt = Date.now();
let currentStageLabel = 'init';
let renderLogStream = null;
let renderLogPath = '';
const elapsedLabel = () => `${((Date.now() - renderStartedAt) / 1000).toFixed(1)}s`;
const formatLogPart = (part) => {
  if (part instanceof Error) return part.stack || part.message;
  if (typeof part === 'string') return part;
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
};
const writeRenderLogLine = (line, { force = false } = {}) => {
  if (!renderLogStream || (!force && !config.debugLogs)) return;
  renderLogStream.write(`${line}\n`);
};
const log = (...parts) => {
  if (!config.debugLogs) return;
  const line = [`[render:auto-cup +${elapsedLabel()}]`, ...parts.map(formatLogPart)].join(' ');
  console.log(line);
  writeRenderLogLine(line);
};
const warn = (...parts) => {
  const line = [`[render:auto-cup +${elapsedLabel()}] WARN`, ...parts.map(formatLogPart)].join(' ');
  console.warn(line);
  writeRenderLogLine(line, { force: true });
};
const progress = (stage, detail = '') => {
  currentStageLabel = stage;
  if (config.debugLogs) log(`[progress] ${stage}${detail ? `: ${detail}` : ''}`);
};
const fail = (message, error = null) => {
  const line = `[render:auto-cup +${elapsedLabel()}] ERROR (${currentStageLabel}): ${message}`;
  console.error(line);
  writeRenderLogLine(line, { force: true });
  if (error) {
    const errorText = formatLogPart(error);
    console.error(error);
    writeRenderLogLine(errorText, { force: true });
  }
  process.exit(1);
};
const safeJson = (value) => JSON.stringify(value, (key, innerValue) => {
  if (key === 'parent' || key === 'children') return undefined;
  if (typeof innerValue === 'function') return undefined;
  if (innerValue instanceof Error) return innerValue.stack || innerValue.message;
  return innerValue;
});
const sanitizeRenderCompletion = (state = {}) => ({
  done: Boolean(state.done ?? true),
  ok: state.ok !== false,
  reason: state.reason || undefined,
  mode: state.mode || null,
  phase: state.phase || null,
  active: Boolean(state.active),
  state: state.state || null,
  elapsed: Number(state.elapsed || 0),
  racesCompleted: state.racesCompleted ?? null,
  totalRaces: state.totalRaces ?? null,
  cupStatus: state.cupStatus || null,
  champion: state.champion || null,
  captureTargetSeconds: state.captureTargetSeconds ?? null,
  captureElapsedSeconds: state.capture?.elapsedSeconds ?? state.captureElapsedSeconds ?? null,
  captureChunks: state.capture?.chunkCount ?? state.chunks ?? null,
  podium: state.podium ? {
    active: Boolean(state.podium.active),
    elapsedSeconds: state.podium.elapsedSeconds ?? null,
    duration: state.podium.duration ?? null,
    confettiComplete: Boolean(state.podium.confettiComplete),
    medalists: state.podium.medalists ?? null,
    isCupChampionCeremony: Boolean(state.podium.isCupChampionCeremony),
  } : null,
  commentary: state.commentary ? {
    enabled: Boolean(state.commentary.enabled),
    voiceEnabled: Boolean(state.commentary.voiceEnabled),
    speaking: Boolean(state.commentary.speaking),
    preparing: Boolean(state.commentary.preparing),
    queueLength: state.commentary.queueLength ?? null,
    activeRemainingSeconds: state.commentary.activeRemainingSeconds ?? null,
    activeKind: state.commentary.activeKind || null,
  } : null,
});

const commandExists = (command) => spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status === 0;
const sanitizeSingleLine = (value, fallback = '') => String(value || fallback)
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const sanitizeHashtags = (hashtags) => Array.isArray(hashtags)
  ? hashtags.map((tag) => sanitizeSingleLine(tag).toLowerCase()).filter((tag) => /^#[\w-]+$/i.test(tag))
  : [];
const SHORTS_TITLE_HASHTAGS = ['#shorts'];
const SEO_TITLE_KEYWORDS = ['Marble Race', 'Marble Rush', 'Marble Run', 'Marble Battle', 'Marble Racing'];
const SHORTS_TITLE_MAX_LENGTH = 70;
const LONG_TITLE_MAX_LENGTH = 95;
const normalizeTitleForDedupe = (value) => sanitizeSingleLine(value)
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/—/g, '-')
  .replace(/#\w[\w-]*/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const stripShortsHashtags = (title) => sanitizeSingleLine(title, 'Epic Marble Race')
  .replace(/\s+#\w[\w-]*/gi, '')
  .trim();
const trimTitleBase = (title, maxLength = SHORTS_TITLE_MAX_LENGTH) => {
  const clean = stripShortsHashtags(title);
  if (clean.length <= maxLength) return clean;
  return clean
    .slice(0, maxLength)
    .replace(/\s+\S*$/g, '')
    .replace(/[\s—:-]+$/g, '')
    .trim() || clean.slice(0, maxLength).trim();
};
const appendTitleHashtags = (title, hashtags = [], maxLength = 100) => {
  const cleanTitle = stripShortsHashtags(title);
  const cleanHashtags = sanitizeHashtags(hashtags);
  if (!cleanHashtags.length) return cleanTitle.slice(0, maxLength);
  const suffix = ` ${cleanHashtags.join(' ')}`;
  const maxBaseLength = Math.max(1, maxLength - suffix.length);
  let base = cleanTitle.length > maxBaseLength ? cleanTitle.slice(0, maxBaseLength) : cleanTitle;
  base = base
    .replace(/\s+—\s+[^—]*$/g, '')
    .replace(/[\s—:-]+$/g, '')
    .trim();
  if (!base || base.length < 20) {
    base = cleanTitle.slice(0, maxBaseLength).replace(/[\s—:-]+$/g, '').trim() || 'Epic Marble Race';
  }
  return `${base}${suffix}`.slice(0, maxLength);
};
const run = (command, args, options = {}) => {
  log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`${command} failed with exit code ${result.status ?? result.signal}`);
};

function readJsonFileIfExists(filePath, label) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`could not parse ${label || 'JSON file'}: ${filePath}`, error);
  }
  return null;
}

function writeJsonFile(filePath, value) {
  if (!filePath) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const survivorStateInput = readJsonFileIfExists(config.survivorStateInput, 'Survivor League state input');
const withTimeout = async (label, promiseFactory, timeoutMs = 5000) => {
  let timer = null;
  let timedOut = false;
  try {
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve({ __timeout: true });
      }, timeoutMs);
    });
    const result = await Promise.race([
      Promise.resolve().then(promiseFactory),
      timeoutPromise,
    ]);
    if (result?.__timeout) {
      warn(`${label} timed out after ${timeoutMs}ms; continuing render finalization`);
      return { timedOut: true };
    }
    return { timedOut: false, result };
  } catch (error) {
    warn(`${label} failed; continuing render finalization`, error?.message || error);
    return { timedOut: false, error };
  } finally {
    if (timer) clearTimeout(timer);
    if (timedOut) {
      // Keep the timed-out Playwright/server cleanup from blocking ffmpeg muxing.
    }
  }
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
    survivorDescriptionTemplate: 'Who will survive the Marble Race Survivor League? {marbleCount} marbles race through chaotic obstacle tracks, but only the strongest stay in the league.\n\nEvery race brings speed, crashes, moving gates, close finishes, and eliminations. Top racers survive, weaker marbles are replaced, and the league keeps getting tougher until one marble stands above the rest.\n\nComment your favorite marble and predict the next survivor!',
    defaults: { marbleCount: 12, raceCount: 10, fallbackTitle: '12 Marbles, 10 Races, Total Chaos!' },
  };
  const resolved = path.resolve(templatePath || path.join(rootDir, 'config/youtube-video-metadata-template.json'));
  if (!existsSync(resolved)) return { ...fallback, templatePath: resolved, templateFound: false };
  try {
    const parsed = JSON.parse(readFileSync(resolved, 'utf8'));
    return {
      descriptionTemplate: String(parsed.descriptionTemplate || fallback.descriptionTemplate),
      survivorDescriptionTemplate: String(parsed.survivorDescriptionTemplate || parsed.descriptionTemplate || fallback.descriptionTemplate),
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
        return {
          title,
          titleType: parsed.titleType || classifyYoutubeTitleType(title),
          baseTitle: sanitizeSingleLine(parsed?.source?.baseTitle || parsed.baseTitle || ''),
          titleStrategy: parsed.titleStrategy || parsed?.source?.titleStrategy || '',
          path: file.path,
          mtimeMs: file.mtimeMs,
        };
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
    return { title: title.slice(0, 100), titleType: directType, titleStrategy: 'legacy-direct-hype' };
  }
  const seed = [...title].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const rotated = templates.map((_, index) => templates[(seed + index) % templates.length]);
  const selected = rotated.find((template) => !recentTypes.has(template.type)) || rotated[0];
  const candidate = `${title} — ${selected.suffix}`;
  return { title: (candidate.length <= 100 ? candidate : `${title}!`).slice(0, 100), titleType: selected.type, titleStrategy: 'legacy-clickbait-suffix', titleTemplate: selected.suffix };
}

function detectShortsEventKind(baseTitle, context = {}) {
  const normalized = sanitizeSingleLine(baseTitle).toLowerCase();
  const selectedKind = String(context.thumbnailEvent?.kind || context.thumbnailAudit?.selectedEvent?.kind || '').toLowerCase();
  if (context.mode === 'survivor') return 'survivor';
  if (/\b(trap|obstacle|spinner|bumper|hit|impact|smash|crash|collision|destroy|mayhem)\b/i.test(normalized) || ['obstacle', 'collision', 'crash'].includes(selectedKind)) return 'obstacle';
  if (/\b(last second|finish|caught|comeback|pass|overtake|steals?|leader)\b/i.test(normalized) || ['overtake', 'battle'].includes(selectedKind)) return 'drama';
  if (/\b(speed|fast|rush|sprint|dash|boost|flying|took off)\b/i.test(normalized) || selectedKind === 'speed') return 'speed';
  if (/\b(win|winner|champion|victory|takes all|first)\b/i.test(normalized) || ['finish', 'winner'].includes(selectedKind)) return 'winner';
  return 'general-hype';
}

function makeSeoShortsVideoTitle(baseTitle, context = {}) {
  return makeSeoVideoTitle(baseTitle, { ...context, titleKind: 'shorts', maxLength: SHORTS_TITLE_MAX_LENGTH, hashtags: SHORTS_TITLE_HASHTAGS });
}

function makeSeoLongVideoTitle(baseTitle, context = {}) {
  return makeSeoVideoTitle(baseTitle, { ...context, titleKind: 'long', maxLength: LONG_TITLE_MAX_LENGTH, hashtags: [] });
}

function makeSeoVideoTitle(baseTitle, context = {}) {
  const isShorts = context.titleKind === 'shorts';
  const maxLength = Number(context.maxLength) || (isShorts ? SHORTS_TITLE_MAX_LENGTH : LONG_TITLE_MAX_LENGTH);
  const cleanBase = trimTitleBase(baseTitle || context.fallbackTitle || 'Marble Race Chaos', isShorts ? 42 : 52).replace(/[.!?]+$/g, '');
  const recentTitles = (context.recentTitles || []).slice(0, 30);
  const recentExact = new Set(recentTitles.map((item) => normalizeTitleForDedupe(item.title)));
  const recentPhrases = new Set(recentTitles.slice(0, 10).map((item) => normalizeTitleForDedupe(item.baseTitle || item.source?.baseTitle || stripShortsHashtags(item.title).replace(/^marble\s+(race|rush|run|battle|racing)\s+/i, '').replace(/[!?]+$/g, ''))));
  const eventKind = detectShortsEventKind(cleanBase, context);
  const seedText = `${cleanBase}|${context.mode || ''}|${context.titleKind || ''}|${recentTitles.map((item) => item.titleType || '').join('|')}`;
  const seed = [...seedText].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const survivorPool = isShorts ? [
    { type: 'survivor', keyword: 'Survivor Marble Race', build: () => 'Survivor Marble Race Gets Brutal!' },
    { type: 'survivor', keyword: 'Marble Race', build: () => 'Only One Marble Survives!' },
    { type: 'survivor', keyword: 'Marble Battle', build: () => 'Last Marble Standing Challenge!' },
    { type: 'survivor', keyword: 'Marble Rush', build: () => 'Marble Rush Elimination Battle!' },
    { type: 'survivor', keyword: 'Marble League', build: () => 'Who Survives the Marble League?' },
    { type: 'survivor', keyword: 'Marble Race', build: () => 'This Marble Almost Got Eliminated!' },
  ] : [
    { type: 'survivor', keyword: 'Survivor Marble Race', build: () => 'Survivor Marble Race League: Last Marble Standing' },
    { type: 'survivor', keyword: 'Marble Race', build: () => 'Marble Race Elimination League: Who Survives?' },
    { type: 'survivor', keyword: 'Marble Battle', build: () => 'Marble Battle Survivor League Gets Brutal' },
    { type: 'survivor', keyword: 'Marble Rush', build: () => 'Marble Rush Survivor Challenge: Only One Wins' },
    { type: 'survivor', keyword: 'Marble League', build: () => 'Marble League Survival Race With Chaos Obstacles' },
  ];
  const templatePools = {
    survivor: survivorPool,
    obstacle: isShorts ? [
      { type: 'obstacle', keyword: 'Marble Race', build: () => 'Marble Race Chaos at the Trap!' },
      { type: 'obstacle', keyword: 'Marble Run', build: () => 'This Marble Run Went Wrong Fast!' },
      { type: 'obstacle', keyword: 'Marble Rush', build: () => 'Marble Rush Obstacle Mayhem!' },
      { type: 'chaos', keyword: 'Marble Race', build: () => 'One Hit Changed the Marble Race!' },
      { type: 'obstacle', keyword: 'Marble Race', build: () => `${SEO_TITLE_KEYWORDS[seed % 2]} ${cleanBase}!` },
    ] : [
      { type: 'obstacle', keyword: 'Marble Race', build: () => 'Marble Race Chaos With Brutal Obstacle Traps' },
      { type: 'obstacle', keyword: 'Marble Run', build: () => 'Marble Run Obstacle Challenge Goes Wrong Fast' },
      { type: 'chaos', keyword: 'Marble Rush', build: () => 'Marble Rush Chaos Race With Insane Impacts' },
      { type: 'obstacle', keyword: 'Marble Battle', build: () => 'Marble Battle Obstacle Course: One Hit Changes Everything' },
    ],
    drama: isShorts ? [
      { type: 'finish-drama', keyword: 'Marble Race', build: () => 'Marble Race Leader Gets Caught!' },
      { type: 'finish-drama', keyword: 'Marble Race', build: () => 'Last Second Marble Race Pass!' },
      { type: 'finish-drama', keyword: 'Marble Rush', build: () => 'Marble Rush Final Stretch Chaos!' },
      { type: 'battle', keyword: 'Marble Battle', build: () => 'Marble Battle Changes in Seconds!' },
      { type: 'finish-drama', keyword: 'Marble Race', build: () => `Marble Race ${cleanBase}!` },
    ] : [
      { type: 'finish-drama', keyword: 'Marble Race', build: () => 'Marble Race Comeback Battle With a Last Second Finish' },
      { type: 'finish-drama', keyword: 'Marble Rush', build: () => 'Marble Rush Race: Leader Gets Caught at the Finish' },
      { type: 'battle', keyword: 'Marble Battle', build: () => 'Marble Battle Race With Wild Overtakes and Chaos' },
      { type: 'finish-drama', keyword: 'Marble Race', build: () => `Marble Race ${cleanBase} in a Wild Finish` },
    ],
    speed: isShorts ? [
      { type: 'speed', keyword: 'Marble Rush', build: () => 'Marble Rush Speed Battle!' },
      { type: 'speed', keyword: 'Marble Race', build: () => 'Fastest Marble Race Finish!' },
      { type: 'speed', keyword: 'Marble Run', build: () => 'High Speed Marble Run Chaos!' },
      { type: 'speed', keyword: 'Marble Race', build: () => `Marble Race ${cleanBase}!` },
    ] : [
      { type: 'speed', keyword: 'Marble Rush', build: () => 'Marble Rush High Speed Race With Chaos Finish' },
      { type: 'speed', keyword: 'Marble Race', build: () => 'Fast Marble Race Battle Through a Wild Track' },
      { type: 'speed', keyword: 'Marble Run', build: () => 'High Speed Marble Run Challenge With Close Finish' },
    ],
    winner: isShorts ? [
      { type: 'winner', keyword: 'Marble Race', build: () => 'Only One Marble Can Win This!' },
      { type: 'winner', keyword: 'Marble Race', build: () => 'Marble Race Winner Takes Everything!' },
      { type: 'winner', keyword: 'Marble Rush', build: () => 'Unexpected Marble Rush Winner!' },
      { type: 'winner', keyword: 'Marble Race', build: () => `Marble Race ${cleanBase}!` },
    ] : [
      { type: 'winner', keyword: 'Marble Race', build: () => 'Marble Race Championship: Winner Takes Everything' },
      { type: 'winner', keyword: 'Marble Rush', build: () => 'Unexpected Marble Rush Winner After Total Chaos' },
      { type: 'winner', keyword: 'Marble Battle', build: () => 'Marble Battle Final: Only One Marble Wins' },
    ],
    'general-hype': isShorts ? [
      { type: 'general-hype', keyword: 'Marble Race', build: () => 'This Marble Race Was Too Close!' },
      { type: 'chaos', keyword: 'Marble Race', build: () => 'The Marble Race Turned Insane!' },
      { type: 'shock-reveal', keyword: 'Marble Race', build: () => 'You Won’t Believe This Marble Finish!' },
      { type: 'general-hype', keyword: 'Marble Rush', build: () => `Marble Rush ${cleanBase}!` },
    ] : [
      { type: 'general-hype', keyword: 'Marble Race', build: () => 'Marble Race Chaos Challenge With Close Finishes' },
      { type: 'chaos', keyword: 'Marble Rush', build: () => 'Marble Rush Full Race With Total Track Chaos' },
      { type: 'shock-reveal', keyword: 'Marble Race', build: () => 'You Won’t Believe This Marble Race Finish' },
      { type: 'general-hype', keyword: 'Marble Run', build: () => 'Marble Run Racing Challenge With Wild Moments' },
    ],
  };
  const rawPool = eventKind === 'survivor'
    ? [...(templatePools.survivor || [])]
    : [...(templatePools[eventKind] || []), ...templatePools['general-hype']];
  const rotated = rawPool.map((_, index) => rawPool[(seed + index) % rawPool.length]);
  let selected = null;
  let dedupeReason = 'unique';
  const basePhraseKey = normalizeTitleForDedupe(cleanBase);
  for (const template of rotated) {
    const candidateBase = trimTitleBase(template.build(), maxLength);
    const candidate = appendTitleHashtags(candidateBase, context.hashtags || [], maxLength);
    const exactKey = normalizeTitleForDedupe(candidate);
    const phrasePenalty = basePhraseKey && recentPhrases.has(basePhraseKey) && new RegExp(`\\b${basePhraseKey.replace(/\s+/g, '\\s+')}\\b`, 'i').test(exactKey);
    if (!recentExact.has(exactKey) && !phrasePenalty) {
      selected = { template, candidate, candidateBase, exactKey };
      break;
    }
  }
  if (!selected) {
    dedupeReason = 'fallback-after-recent-title-collisions';
    const fallbackTemplates = [
      `Marble Race Chaos Moment ${seed % 97}!`,
      `Marble Rush Wild Finish ${seed % 89}!`,
      `Marble Battle Highlight ${seed % 83}!`,
      `Marble Run Surprise Finish ${seed % 79}!`,
    ];
    const fallbackBase = fallbackTemplates.find((candidate) => !recentExact.has(normalizeTitleForDedupe(appendTitleHashtags(candidate, context.hashtags || [], maxLength)))) || fallbackTemplates[0];
    selected = { template: { type: eventKind, keyword: 'Marble Race', build: () => fallbackBase }, candidateBase: fallbackBase, candidate: appendTitleHashtags(fallbackBase, context.hashtags || [], maxLength), exactKey: normalizeTitleForDedupe(fallbackBase) };
  }
  const titleType = selected.template.type || classifyYoutubeTitleType(selected.candidate);
  return {
    title: selected.candidate,
    titleType,
    titleStrategy: context.mode === 'survivor'
      ? (isShorts ? 'seo-shorts-survivor-dedupe' : 'seo-long-survivor-dedupe')
      : (isShorts ? 'seo-shorts-event-dedupe' : 'seo-long-event-dedupe'),
    titleTemplate: selected.candidateBase,
    titleKeyword: selected.template.keyword || SEO_TITLE_KEYWORDS[seed % SEO_TITLE_KEYWORDS.length],
    titleEventKind: eventKind,
    dedupeReason,
    basePhrase: cleanBase,
  };
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

function buildYoutubeVideoMetadata({ config, renderSummary = {}, thumbnailOutput, metadataOutput = '', companionWebmOutput, eventMarkersOutput = '', thumbnailEvent = null, thumbnailAudit = null }) {
  const template = readYoutubeMetadataTemplate(config.youtubeMetadataTemplate);
  const raceCount = config.mode === 'continuous'
    ? config.multipleRaceCount
    : (config.mode === 'single'
      ? 1
      : Number(renderSummary.raceCount || renderSummary.stageSummaries?.length || template.defaults.raceCount || 10));
  const marbleCount = Number(renderSummary.marbleCount || config.cupSize || template.defaults.marbleCount || 30);
  const baseTitle = config.thumbnailTitle || thumbnailAudit?.rawTitle || renderSummary.thumbnailTitle || renderSummary.title || renderSummary.cupName || config.cupName || template.defaults.fallbackTitle;
  const recentTitleLimit = config.youtubeKind === 'shorts' ? Math.max(30, config.youtubeTitleHistoryLimit) : Math.max(20, config.youtubeTitleHistoryLimit);
  const recentTitles = readYoutubeTitleHistory(config.youtubeTitleHistory, recentTitleLimit);
  const titleContext = {
    fallbackTitle: template.defaults.fallbackTitle,
    recentTitles,
    historyLimit: recentTitleLimit,
    mode: config.mode,
    thumbnailEvent,
    thumbnailAudit,
  };
  const titleResult = config.youtubeKind === 'shorts'
    ? makeSeoShortsVideoTitle(baseTitle, titleContext)
    : makeSeoLongVideoTitle(baseTitle, titleContext);
  const titleHashtags = config.youtubeKind === 'shorts' ? SHORTS_TITLE_HASHTAGS : [];
  const title = config.youtubeKind === 'shorts'
    ? titleResult.title
    : titleResult.title;
  const titleType = titleResult.titleType || classifyYoutubeTitleType(title);
  const selectedDescriptionTemplate = config.mode === 'survivor'
    ? (template.survivorDescriptionTemplate || template.descriptionTemplate)
    : template.descriptionTemplate;
  const descriptionBody = selectedDescriptionTemplate
    .replace(/\{raceCount\}/g, String(raceCount))
    .replace(/\{raceCountLabel\}/g, raceCount === 1 ? '1 exciting race' : `${raceCount} exciting races`)
    .replace(/\{marbleCount\}/g, String(marbleCount))
    .replace(/\{title\}/g, title)
    .replace(/\{cupName\}/g, sanitizeSingleLine(config.cupName || renderSummary.cupName || 'Marble Rush'));
  const baseHashtags = template.hashtags;
  const hashtags = config.youtubeKind === 'shorts'
    ? [...new Set(['#Shorts', ...baseHashtags])]
    : baseHashtags;
  const description = `${descriptionBody}

${hashtags.join(' ')}`;
  return {
    title,
    titleType,
    titleStrategy: titleResult.titleStrategy || (config.youtubeKind === 'shorts' ? 'seo-shorts-event-dedupe' : 'legacy-clickbait'),
    titleTemplate: titleResult.titleTemplate || '',
    titleKeyword: titleResult.titleKeyword || '',
    titleEventKind: titleResult.titleEventKind || '',
    dedupeReason: titleResult.dedupeReason || '',
    youtubeKind: config.youtubeKind || 'long',
    aspectRatio: config.outputAspectRatio || (config.videoCanvasLayout === 'vertical' ? '9:16' : '16:9'),
    videoCanvasLayout: config.videoCanvasLayout || 'horizontal',
    description,
    hashtags,
    recentTitleTypesAvoided: [...new Set(recentTitles.map((item) => item.titleType))],
    source: {
      titleSource: thumbnailAudit?.titleSource || (config.thumbnailTitle ? 'manual-thumbnail-title' : (renderSummary.thumbnailTitle ? 'render-summary-thumbnail-title' : (renderSummary.title ? 'render-summary-title' : (renderSummary.cupName || config.cupName ? 'cup-name' : 'template-fallback')))),
      titleStrategy: titleResult.titleStrategy || '',
      titleTemplate: titleResult.titleTemplate || '',
      titleKeyword: titleResult.titleKeyword || '',
      titleEventKind: titleResult.titleEventKind || '',
      dedupeReason: titleResult.dedupeReason || '',
      descriptionTemplate: config.mode === 'survivor' ? 'survivor-short' : 'default',
      baseTitle,
      thumbnailTitle: config.thumbnailTitle || thumbnailAudit?.rawTitle || '',
      generatedThumbnailTitle: thumbnailAudit?.rawTitle || '',
      thumbnailTitleSource: thumbnailAudit?.titleSource || '',
      thumbnailSelectedEvent: thumbnailAudit?.selectedEvent || null,
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
      recentTitles: recentTitles.map((item) => ({ title: item.title, titleType: item.titleType, baseTitle: item.baseTitle || '', titleStrategy: item.titleStrategy || '', path: item.path })),
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
  mkdirSync(recordingsDir, { recursive: true });
  mkdirSync(path.dirname(config.output), { recursive: true });
  resolveAudioOutputPath();
  renderLogPath = path.resolve(`${config.output.replace(/\.[^.]+$/, '')}.render.log`);
  renderLogStream = createWriteStream(renderLogPath, { flags: 'a' });
  progress('startup', `output=${config.output}`);
  log(`Render log: ${renderLogPath}`);
  if (!commandExists('ffmpeg')) fail('ffmpeg is required. Install it first, e.g. `brew install ffmpeg`.');

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
    server.stdout.on('data', (chunk) => { if (config.debugLogs) process.stdout.write(`[vite-preview] ${chunk}`); });
    server.stderr.on('data', (chunk) => { if (config.debugLogs) process.stderr.write(`[vite-preview] ${chunk}`); });
    server.on('exit', (code) => {
      if (code !== null && code !== 0) console.error(`[vite-preview] exited with ${code}`);
    });
    const ready = await waitForUrl(config.url, server, 30000);
    if (!ready) fail(`Preview server did not become ready at ${config.url}`);
  }

  const videoDir = path.join(recordingsDir, `.playwright-${defaultStamp}`);
  rmSync(videoDir, { recursive: true, force: true });
  mkdirSync(videoDir, { recursive: true });

  const requestedCanvasTransport = ['buffered', 'browser-buffered-final-export', 'auto-buffered'].includes(config.canvasTransport)
    ? 'buffered'
    : ['array', 'chunk-array', 'legacy-array', 'array-binding'].includes(config.canvasTransport)
      ? 'array'
      : 'base64';
  const useBufferedCanvasCapture = config.videoCapture === 'canvas' && requestedCanvasTransport === 'buffered';
  const useArrayCanvasChunkTransport = config.videoCapture === 'canvas' && requestedCanvasTransport === 'array';
  const canvasChunkTransportLabel = useBufferedCanvasCapture
    ? 'browser-buffered-final-export'
    : useArrayCanvasChunkTransport
      ? 'chunk-array-binding-legacy'
      : 'chunk-base64-binding';
  log('Canvas capture transport:', JSON.stringify({
    videoCapture: config.videoCapture,
    transport: canvasChunkTransportLabel,
    requestedCanvasTransport: config.canvasTransport,
    videoCanvasLayout: config.videoCanvasLayout,
    targetSeconds: config.targetSeconds,
  }));

  let canvasChunkStream = null;
  let canvasChunkOutput = null;
  let canvasChunkWriteChain = Promise.resolve();
  const canvasChunkStats = {
    chunks: 0,
    bytes: 0,
    lastLogAt: Date.now(),
    lastChunkAt: null,
    maxChunkBytes: 0,
    browserPrepMsTotal: 0,
    browserPrepMsMax: 0,
    arrayBufferMsTotal: 0,
    arrayBufferMsMax: 0,
    byteArrayMsTotal: 0,
    byteArrayMsMax: 0,
    base64EncodeMsTotal: 0,
    base64EncodeMsMax: 0,
    bindingRoundTripMsTotal: 0,
    bindingRoundTripMsMax: 0,
    nodeBindingMsTotal: 0,
    nodeBindingMsMax: 0,
    nodeBufferMsTotal: 0,
    nodeBufferMsMax: 0,
    nodeWriteMsTotal: 0,
    nodeWriteMsMax: 0,
    chunkIntervalMsTotal: 0,
    chunkIntervalMsMax: 0,
    chunkIntervalSamples: 0,
    pendingWritesMax: 0,
  };
  let canvasCaptureStopRequestedAt = null;
  let canvasCaptureStopRequestedChunk = null;

  const waitForCanvasChunkWrites = async () => {
    await canvasChunkWriteChain;
    if (!canvasChunkStream) return;
    await new Promise((resolve, reject) => {
      canvasChunkStream.once('error', reject);
      canvasChunkStream.end(resolve);
    });
    canvasChunkStream = null;
  };

  const readRenderProgressSnapshot = async (page) => {
    if (!page || page.isClosed?.()) return null;
    return page.evaluate(() => {
      const app = window.__MARBLE_RACE_APP__;
      if (!app) return null;
      const activeRecording = app.singleRecording?.playwrightRender
        ? app.singleRecording
        : app.continuousRecording?.playwrightRender
          ? app.continuousRecording
          : app.autoCupRecording;
      const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__?.getInfo?.() || null;
      const podium = app.podiumCeremony || null;
      const activeCommentary = app.activeCommentary || null;
      const commentaryQueueLength = Array.isArray(app.commentaryVoiceQueue) ? app.commentaryVoiceQueue.length : 0;
      return {
        active: Boolean(activeRecording?.active),
        mode: activeRecording?.mode || null,
        phase: activeRecording?.phase || null,
        state: app.state || null,
        racesCompleted: activeRecording?.racesCompleted ?? null,
        totalRaces: activeRecording?.totalRaces ?? null,
        elapsed: Number(app.elapsed || 0),
        browserFps: Number(app.lastFps || 0),
        fpsHudText: app.ui?.fps?.textContent || null,
        simulationLag: app.performanceProfile?.simulationLag ?? app.simulationLag ?? null,
        frameProfiler: app.frameProfiler?.lastSummary || null,
        frameTiming: app.getFrameTimingDiagnostics?.() || null,
        runtimeStats: {
          marbleCount: app.marbleData?.length || 0,
          worldBodies: app.world?.bodies?.length || 0,
          obstacleCounts: app.obstacleTypeCounts || null,
          trackStats: app.trackStats || null,
          rendererInfo: app.renderer?.info ? {
            calls: app.renderer.info.render?.calls ?? null,
            triangles: app.renderer.info.render?.triangles ?? null,
            points: app.renderer.info.render?.points ?? null,
            lines: app.renderer.info.render?.lines ?? null,
            geometries: app.renderer.info.memory?.geometries ?? null,
            textures: app.renderer.info.memory?.textures ?? null,
          } : null,
        },
        podium: podium ? {
          active: Boolean(podium.active),
          elapsedSeconds: Number(podium.elapsedSeconds || 0),
          duration: Number.isFinite(podium.duration) ? podium.duration : null,
          confettiComplete: Boolean(podium.confettiComplete),
          medalists: Array.isArray(podium.medalists) ? podium.medalists.length : 0,
          isCupChampionCeremony: Boolean(podium.isCupChampionCeremony),
        } : null,
        commentary: {
          enabled: Boolean(app.commentaryEnabled),
          voiceEnabled: Boolean(app.commentaryVoiceEnabled),
          speaking: Boolean(app.commentaryVoiceSpeaking),
          preparing: Boolean(app.commentaryVoicePreparing),
          queueLength: commentaryQueueLength,
          currentLine: app.commentaryVoiceCurrentLine || null,
          activeLine: activeCommentary?.line || null,
          activeKind: activeCommentary?.kind || null,
          activeExpiresAt: activeCommentary?.expiresAt ?? null,
          activeRemainingSeconds: activeCommentary?.expiresAt != null ? Math.max(0, Number(activeCommentary.expiresAt || 0) - Number(app.elapsed || 0)) : 0,
        },
        capture: capture ? {
          state: capture.state,
          requestedFps: capture.requestedFps,
          elapsedSeconds: capture.elapsedSeconds,
          targetSeconds: capture.targetSeconds ?? null,
          chunkCount: capture.chunkCount ?? null,
          pendingWrites: capture.pendingWrites ?? null,
          pendingWritesMax: capture.pendingWritesMax ?? null,
          lastChunkTiming: capture.lastChunkTiming || null,
          trackSettings: capture.trackSettings,
        } : null,
      };
    }).catch(() => null);
  };

  const logRenderProgressSnapshot = async (page, reason = 'periodic') => {
    const snapshot = await readRenderProgressSnapshot(page);
    if (!snapshot) return null;
    const jobElapsedSeconds = Number(((Date.now() - renderStartedAt) / 1000).toFixed(1));
    const gameElapsedSeconds = Number(snapshot.elapsed?.toFixed?.(2) ?? snapshot.elapsed);
    const captureElapsedSeconds = snapshot.capture?.elapsedSeconds != null
      ? Number(snapshot.capture.elapsedSeconds.toFixed?.(2) ?? snapshot.capture.elapsedSeconds)
      : null;
    const expectedChunkIntervalSeconds = 2;
    const effectiveTargetSeconds = snapshot.capture?.targetSeconds || config.targetSeconds;
    const estimatedTotalChunks = Math.max(1, Math.ceil(effectiveTargetSeconds / expectedChunkIntervalSeconds));
    const totalChunkProgress = Number(Math.min(100, (canvasChunkStats.chunks / estimatedTotalChunks) * 100).toFixed(1));
    log('[progress] render-state', JSON.stringify({
      reason,
      stage: currentStageLabel,
      active: snapshot.active,
      mode: snapshot.mode,
      phase: snapshot.phase,
      state: snapshot.state,
      racesCompleted: snapshot.racesCompleted,
      totalRaces: snapshot.totalRaces,
      jobElapsedSeconds,
      gameElapsedSeconds,
      captureElapsedSeconds,
      chunks: canvasChunkStats.chunks,
      estimatedTotalChunks,
      totalChunkProgress,
      mb: Number((canvasChunkStats.bytes / 1048576).toFixed(1)),
      browserFps: Number(snapshot.browserFps?.toFixed?.(1) ?? snapshot.browserFps),
      fpsHudText: snapshot.fpsHudText,
      simulationLag: snapshot.simulationLag,
      frameProfiler: snapshot.frameProfiler || null,
      frameTiming: snapshot.frameTiming || null,
      runtimeStats: snapshot.runtimeStats || null,
      podium: snapshot.podium || null,
      commentary: snapshot.commentary || null,
      capture: snapshot.capture ? {
        ...snapshot.capture,
        elapsedSeconds: captureElapsedSeconds,
        estimatedTotalChunks,
        totalChunkProgress,
      } : null,
    }));
    return snapshot;
  };

  const finalRaceCompletionBufferSeconds = Math.max(0, Number(args.get('final-race-buffer-seconds') || process.env.MARBLE_RENDER_FINAL_RACE_BUFFER_SECONDS || 10));

  const renderWaitDonePhases = new Set([
    'completed-all-races',
    'final-complete',
    'playwright-smoke-complete',
    'completed-all-races-render-stop',
    'completed-all-races-render-stop-scheduled',
  ]);

  const isTerminalContinuousCompletionState = (state) => state?.mode === 'continuous'
    && Number(state.racesCompleted || 0) >= Number(state.totalRaces || 0)
    && (
      state.phase === 'waiting-final-stop'
      || renderWaitDonePhases.has(state.phase)
    );

  const isFinalRaceFinishedState = (state) => state?.mode === 'continuous'
    && Number(state.racesCompleted || 0) >= Number(state.totalRaces || 0)
    && Number(state.totalRaces || 0) > 0
    && (
      state.phase === 'waiting-final-stop'
      || state.phase === 'racing'
      || state.phase === 'ceremony-hold'
      || renderWaitDonePhases.has(state.phase)
    );

  const getActualCanvasCaptureElapsedSeconds = (state = {}) => {
    const captureElapsed = Number(state.capture?.elapsedSeconds ?? state.captureElapsedSeconds);
    if (Number.isFinite(captureElapsed) && captureElapsed > 0) return Math.max(0, captureElapsed);
    const nodeElapsed = (Date.now() - renderStartedAt) / 1000;
    return Number.isFinite(nodeElapsed) ? Math.max(0, nodeElapsed) : 0;
  };

  const getFinalRaceCompletionCaptureTargetSeconds = (state = {}) => {
    const actualElapsed = getActualCanvasCaptureElapsedSeconds(state);
    const configuredTargetSeconds = Math.max(1, Number(config.targetSeconds || 0));
    return Math.max(1, Math.min(configuredTargetSeconds, Math.ceil(actualElapsed + finalRaceCompletionBufferSeconds)));
  };

  const armBrowserCanvasStopTimer = async (page, delaySeconds = 0, reason = 'final-race-finished-plus-buffer') => {
    if (config.videoCapture !== 'canvas' || !page || page.isClosed?.()) return null;
    return page.evaluate(({ delayMs, reason: stopReason }) => {
      const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__;
      if (!capture) return { ok: false, reason: 'capture-missing' };
      if (capture.browserStopTimerArmedAt != null) {
        return { ok: true, alreadyArmed: true, armedAt: capture.browserStopTimerArmedAt, delayMs: capture.browserStopTimerDelayMs, stopReason: capture.stopReason || stopReason };
      }
      capture.browserStopTimerArmedAt = performance.now();
      capture.browserStopTimerDelayMs = Math.max(0, Number(delayMs || 0));
      capture.stopReason = stopReason;
      window.__MARBLE_RENDER_CANVAS_TARGET_SECONDS = Math.max(1, Math.ceil(((performance.now() - capture.startedAt) / 1000) + (capture.browserStopTimerDelayMs / 1000)));
      capture.browserStopTimer = setTimeout(() => {
        try { capture.requestStop?.(stopReason); } catch {}
      }, capture.browserStopTimerDelayMs);
      return { ok: true, armedAt: capture.browserStopTimerArmedAt, delayMs: capture.browserStopTimerDelayMs, stopReason };
    }, { delayMs: Math.max(0, Number(delaySeconds || 0)) * 1000, reason }).catch((error) => ({ ok: false, reason: error?.message || String(error) }));
  };

  const calculateContinuousCompletionCaptureTargetSeconds = (state = {}) => {
    const actualElapsed = getActualCanvasCaptureElapsedSeconds(state);
    const finalizationGraceSeconds = 2;
    const configuredTargetSeconds = Math.max(1, Number(config.targetSeconds || 0));
    return Math.max(1, Math.min(configuredTargetSeconds, Math.ceil(actualElapsed + finalizationGraceSeconds)));
  };

  const requestCanvasCaptureStop = async (page, reason = 'app-completed') => {
    if (config.videoCapture !== 'canvas' || !page || page.isClosed?.()) return null;
    return page.evaluate((stopReason) => {
      const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__;
      if (!capture) return { ok: false, reason: 'capture-missing' };
      const beforeStop = capture.getInfo?.() || {};
      const recorder = capture.recorder;
      const requestedAt = performance.now();
      capture.stopReason = stopReason;
      capture.stopRequestedAt = capture.stopRequestedAt || requestedAt;
      // Keep accepting chunks until recorder.stop() has delivered the final
      // dataavailable payload; dropping chunks at stop-request time can truncate
      // the WebM and prevent dashboard MP4/thumbnail postprocess from running.
      const stopResult = typeof capture.requestStop === 'function'
        ? capture.requestStop(stopReason)
        : (() => {
          try {
            if (recorder?.state === 'paused') recorder.resume?.();
            if (recorder?.state === 'recording') recorder.stop();
            return { ok: true, requestedStop: beforeStop.state === 'recording', state: recorder?.state || beforeStop.state || null };
          } catch (error) {
            return { ok: false, reason: error?.message || String(error), state: recorder?.state || null };
          }
        })();
      return {
        ok: stopResult?.ok !== false,
        requestedStop: beforeStop.state === 'recording' || beforeStop.state === 'paused',
        stopReason,
        beforeStop,
        requestStop: stopResult,
        ...(capture.getInfo?.() || beforeStop),
      };
    }, reason).catch((error) => ({ ok: false, reason: error?.message || String(error) }));
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
  let progressLogPoller = null;
  let completionStopPoller = null;
  let finalRaceStopTimer = null;
  let finalRaceStopPromise = null;
  let completionCanvasStopRequested = false;
  let completionStopPollerRunning = false;
  let finalRaceStopLogged = false;
  let finalRaceNodeGateLogged = false;
  let finalRaceCanvasStopLogged = false;
  let scheduleFinalRaceCanvasStop = async () => null;
  let eventMarkerState = { samples: [], eventsByKey: new Map(), lastSampleAt: 0 };
  try {
    progress('browser-open', config.url);
    log(`Opening ${config.url}`);
    log('Render settings:', JSON.stringify({
      debugLogs: config.debugLogs,
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
      renderPerformanceProfile: config.renderPerformanceProfile,
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
      '--mute-audio',
      '--disable-notifications',
      '--disable-popup-blocking',
    ];
    if (config.headful) {
      chromeArgs.push('--disable-frame-rate-limit');
      chromeArgs.push(`--window-size=${config.captureWidth},${config.captureHeight}`);
      if (config.browserWindowPosition) chromeArgs.push(`--window-position=${config.browserWindowPosition}`);
    }
    if (process.platform === 'darwin') chromeArgs.push('--use-angle=metal');
    log('Browser launch settings:', JSON.stringify({
      headful: config.headful,
      headless: !config.headful,
      audio: config.audio,
      muted: true,
      videoCapture: config.videoCapture,
      browserWindowPosition: config.browserWindowPosition || null,
      args: chromeArgs,
    }));
    browser = await chromium.launch({ headless: !config.headful, args: chromeArgs });
    const context = await browser.newContext({
      viewport: { width: config.captureWidth, height: config.captureHeight },
      deviceScaleFactor: 1,
      ...(config.videoCapture === 'playwright' ? { recordVideo: { dir: videoDir, size: { width: config.captureWidth, height: config.captureHeight } } } : {}),
    });
    const page = await context.newPage();
    await page.exposeBinding('marbleRenderWriteSurvivorLeagueState', async (_source, payload = {}) => {
      if (config.mode !== 'survivor' || !config.survivorStateOutput) return { ok: false, reason: 'not-survivor-render' };
      const state = payload?.state && typeof payload.state === 'object' ? payload.state : payload;
      if (!state || typeof state !== 'object' || !Array.isArray(state.roster) || !state.standings) return { ok: false, reason: 'invalid-state' };
      const document = {
        ...state,
        version: 1,
        updatedAt: new Date().toISOString(),
        renderOutput: config.output,
        source: payload?.source || 'playwright-render',
      };
      writeJsonFile(config.survivorStateOutput, document);
      return { ok: true, path: config.survivorStateOutput, raceNumber: document.raceNumber ?? null, rosterSize: document.roster?.length ?? null };
    });
    await page.exposeBinding('marbleRenderNotifyFinalRaceFinished', async (_source, payload = {}) => {
      if (config.videoCapture !== 'canvas') return { ok: false, reason: 'not-canvas-capture' };
      const snapshot = {
        done: true,
        ok: true,
        mode: payload.mode || 'continuous',
        phase: payload.phase || 'app-final-race-finished-event',
        active: payload.active !== false,
        state: payload.state || null,
        elapsed: Number(payload.elapsed || 0),
        racesCompleted: payload.racesCompleted ?? null,
        totalRaces: payload.totalRaces ?? null,
        captureElapsedSeconds: payload.captureElapsedSeconds ?? payload.capture?.elapsedSeconds ?? null,
        capture: payload.capture || null,
        podium: payload.podium || null,
        commentary: payload.commentary || null,
        eventSource: payload.eventSource || 'app-binding',
      };
      if (!isFinalRaceFinishedState(snapshot)) return { ok: false, reason: 'not-final-race-finished', snapshot: sanitizeRenderCompletion(snapshot) };
      scheduleFinalRaceCanvasStop(snapshot, 'app-binding').catch((error) => {
        warn('[progress] final-race-stop-schedule-failed', safeJson({
          source: 'app-binding',
          reason: error?.message || String(error),
          snapshot: sanitizeRenderCompletion(snapshot),
        }));
      });
      return { ok: true, scheduled: true, snapshot: sanitizeRenderCompletion(snapshot) };
    });
    if (config.videoCapture === 'canvas') {
      canvasChunkOutput = path.join(videoDir, `canvas-capture-${defaultStamp}.webm`);
      if (!useBufferedCanvasCapture) canvasChunkStream = createWriteStream(canvasChunkOutput);
      await page.exposeBinding('marbleRenderWriteCanvasChunk', async (_source, payload = {}) => {
        const nodeBindingStartedAt = Date.now();
        const payloadEncoding = payload.encoding === 'base64' ? 'base64' : 'array';
        const nodeBufferStartedAt = Date.now();
        const bytes = payloadEncoding === 'base64'
          ? Buffer.from(typeof payload.base64 === 'string' ? payload.base64 : '', 'base64')
          : (Array.isArray(payload.bytes) ? Buffer.from(payload.bytes) : Buffer.alloc(0));
        const nodeBufferMs = Date.now() - nodeBufferStartedAt;
        canvasChunkStats.nodeBufferMsTotal += nodeBufferMs;
        canvasChunkStats.nodeBufferMsMax = Math.max(canvasChunkStats.nodeBufferMsMax, nodeBufferMs);
        if (!bytes.length) return { ok: false, reason: 'empty-chunk', index: payload.index ?? null, nodeBufferMs };
        const index = Number(payload.index ?? 0);
        const browserTiming = payload.timing && typeof payload.timing === 'object' ? payload.timing : {};
        if (canvasCaptureStopRequestedAt !== null && !payload.final) {
          const droppedAfterStop = {
            ok: false,
            reason: 'canvas-stop-requested-drop-late-chunk',
            index,
            bytes: bytes.length,
            stopRequestedChunk: canvasCaptureStopRequestedChunk,
            msAfterStopRequest: Date.now() - canvasCaptureStopRequestedAt,
          };
          if (Date.now() - canvasChunkStats.lastLogAt >= 5000) {
            canvasChunkStats.lastLogAt = Date.now();
            log('[progress] canvas-chunk-dropped-after-stop-request', JSON.stringify(droppedAfterStop));
          }
          return droppedAfterStop;
        }
        canvasChunkStats.chunks += 1;
        canvasChunkStats.bytes += bytes.length;
        canvasChunkStats.maxChunkBytes = Math.max(canvasChunkStats.maxChunkBytes, bytes.length);
        const addBrowserTiming = (field, totalField, maxField) => {
          const value = Number(browserTiming[field]);
          if (!Number.isFinite(value) || value < 0) return;
          canvasChunkStats[totalField] += value;
          canvasChunkStats[maxField] = Math.max(canvasChunkStats[maxField], value);
        };
        addBrowserTiming('browserPrepMs', 'browserPrepMsTotal', 'browserPrepMsMax');
        addBrowserTiming('arrayBufferMs', 'arrayBufferMsTotal', 'arrayBufferMsMax');
        addBrowserTiming('byteArrayMs', 'byteArrayMsTotal', 'byteArrayMsMax');
        addBrowserTiming('base64EncodeMs', 'base64EncodeMsTotal', 'base64EncodeMsMax');
        addBrowserTiming('bindingRoundTripMs', 'bindingRoundTripMsTotal', 'bindingRoundTripMsMax');
        const now = Date.now();
        if (canvasChunkStats.lastChunkAt != null) {
          const intervalMs = now - canvasChunkStats.lastChunkAt;
          canvasChunkStats.chunkIntervalMsTotal += intervalMs;
          canvasChunkStats.chunkIntervalMsMax = Math.max(canvasChunkStats.chunkIntervalMsMax, intervalMs);
          canvasChunkStats.chunkIntervalSamples += 1;
        }
        canvasChunkStats.lastChunkAt = now;
        const chunkSummary = () => {
          const count = Math.max(1, canvasChunkStats.chunks);
          const intervalCount = Math.max(1, canvasChunkStats.chunkIntervalSamples);
          return {
            chunks: canvasChunkStats.chunks,
            mb: Number((canvasChunkStats.bytes / 1048576).toFixed(1)),
            avgChunkMB: Number((canvasChunkStats.bytes / count / 1048576).toFixed(3)),
            maxChunkMB: Number((canvasChunkStats.maxChunkBytes / 1048576).toFixed(3)),
            avgChunkIntervalMs: Number((canvasChunkStats.chunkIntervalMsTotal / intervalCount).toFixed(1)),
            maxChunkIntervalMs: canvasChunkStats.chunkIntervalMsMax,
            avgBrowserPrepMs: Number((canvasChunkStats.browserPrepMsTotal / count).toFixed(1)),
            maxBrowserPrepMs: Number(canvasChunkStats.browserPrepMsMax.toFixed?.(1) ?? canvasChunkStats.browserPrepMsMax),
            avgArrayBufferMs: Number((canvasChunkStats.arrayBufferMsTotal / count).toFixed(1)),
            maxArrayBufferMs: Number(canvasChunkStats.arrayBufferMsMax.toFixed?.(1) ?? canvasChunkStats.arrayBufferMsMax),
            avgByteArrayMs: Number((canvasChunkStats.byteArrayMsTotal / count).toFixed(1)),
            maxByteArrayMs: Number(canvasChunkStats.byteArrayMsMax.toFixed?.(1) ?? canvasChunkStats.byteArrayMsMax),
            avgBase64EncodeMs: Number((canvasChunkStats.base64EncodeMsTotal / count).toFixed(1)),
            maxBase64EncodeMs: Number(canvasChunkStats.base64EncodeMsMax.toFixed?.(1) ?? canvasChunkStats.base64EncodeMsMax),
            bytePayloadEncoding: payloadEncoding,
            avgBindingRoundTripMs: Number((canvasChunkStats.bindingRoundTripMsTotal / count).toFixed(1)),
            maxBindingRoundTripMs: Number(canvasChunkStats.bindingRoundTripMsMax.toFixed?.(1) ?? canvasChunkStats.bindingRoundTripMsMax),
            avgNodeBindingMs: Number((canvasChunkStats.nodeBindingMsTotal / count).toFixed(1)),
            maxNodeBindingMs: canvasChunkStats.nodeBindingMsMax,
            avgNodeBufferMs: Number((canvasChunkStats.nodeBufferMsTotal / count).toFixed(1)),
            maxNodeBufferMs: canvasChunkStats.nodeBufferMsMax,
            avgNodeWriteMs: Number((canvasChunkStats.nodeWriteMsTotal / count).toFixed(1)),
            maxNodeWriteMs: canvasChunkStats.nodeWriteMsMax,
            pendingWritesMax: canvasChunkStats.pendingWritesMax,
            lastBrowserFps: browserTiming.browserFps ?? null,
            webm: canvasChunkOutput,
          };
        };
        if (now - canvasChunkStats.lastLogAt >= 30000) {
          canvasChunkStats.lastLogAt = now;
          log('[progress] canvas-recording', JSON.stringify(chunkSummary()));
        }
        if (!canvasChunkStream?.writable || canvasChunkStream.destroyed || canvasChunkStream.closed) {
          return { ok: false, reason: 'stream-closed', index, bytes: bytes.length };
        }
        const writeStartedAt = Date.now();
        canvasChunkWriteChain = canvasChunkWriteChain.then(() => new Promise((resolve, reject) => {
          if (!canvasChunkStream?.writable || canvasChunkStream.destroyed || canvasChunkStream.closed) {
            resolve();
            return;
          }
          canvasChunkStream.write(bytes, (error) => (error ? reject(error) : resolve()));
        }));
        await canvasChunkWriteChain;
        const nodeWriteMs = Date.now() - writeStartedAt;
        const nodeBindingMs = Date.now() - nodeBindingStartedAt;
        canvasChunkStats.nodeWriteMsTotal += nodeWriteMs;
        canvasChunkStats.nodeWriteMsMax = Math.max(canvasChunkStats.nodeWriteMsMax, nodeWriteMs);
        canvasChunkStats.nodeBindingMsTotal += nodeBindingMs;
        canvasChunkStats.nodeBindingMsMax = Math.max(canvasChunkStats.nodeBindingMsMax, nodeBindingMs);
        return { ok: true, index, bytes: bytes.length, nodeBindingMs, nodeBufferMs, nodeWriteMs };
      });
    }
    page.on('console', (message) => {
      if (!config.debugLogs) return;
      const type = message.type();
      if (['error', 'warning'].includes(type)) console.log(`[browser:${type}] ${message.text()}`);
    });
    page.on('pageerror', (error) => { if (config.debugLogs) console.error('[browser:pageerror]', error); });
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__MARBLE_RACE_APP__), null, { timeout: 60000 });
    await page.evaluate((debugLogs) => { window.__MARBLE_RENDER_DEBUG_LOGS = Boolean(debugLogs); }, config.debugLogs);
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
      canvasCaptureInfo = await page.evaluate(async ({ fps, width, height, videoCanvasLayout, targetSeconds, useBufferedFinalExport, chunkPayloadEncoding }) => {
        window.__MARBLE_RENDER_CANVAS_TARGET_SECONDS = Math.max(1, Number(targetSeconds || 0) || 1);
        window.__MARBLE_RENDER_CANVAS_BUFFERED_EXPORT = Boolean(useBufferedFinalExport);
        const app = window.__MARBLE_RACE_APP__;
        const requestedLayout = ['horizontal', 'vertical'].includes(String(videoCanvasLayout || '').toLowerCase()) ? String(videoCanvasLayout).toLowerCase() : 'horizontal';
        const canvas = app?.setVideoCanvasLayout?.(requestedLayout) && app?.getVideoCaptureCanvas?.() || app?.getVideoCaptureCanvas?.() || app?.renderer?.domElement || document.querySelector('canvas');
        if (!canvas) return { ok: false, reason: 'canvas-missing' };
        if (typeof canvas.captureStream !== 'function') return { ok: false, reason: 'captureStream-unsupported' };
        if (typeof MediaRecorder === 'undefined') return { ok: false, reason: 'MediaRecorder-unsupported' };
        const mimeTypes = [
          'video/webm;codecs=vp8',
          'video/webm;codecs=vp9',
          'video/webm',
        ];
        const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
        const stream = canvas.captureStream(Math.max(1, Math.round(Number(fps) || 60)));
        const bufferedFinalExport = Boolean(window.__MARBLE_RENDER_CANVAS_BUFFERED_EXPORT);
        const payloadEncoding = chunkPayloadEncoding === 'array' ? 'array' : 'base64';
        const videoBitsPerSecond = Math.max(4_000_000, Math.min(16_000_000, Math.round(Number(window.__MARBLE_RENDER_CANVAS_BITRATE || 7_000_000))));
        const recorderOptions = mimeType ? { mimeType, videoBitsPerSecond } : { videoBitsPerSecond };
        const recorder = new MediaRecorder(stream, recorderOptions);
        const captureTargetSeconds = Math.max(1, Number(window.__MARBLE_RENDER_CANVAS_TARGET_SECONDS || 0) || 0);
        let hardStopTimer = null;
        const chunks = [];
        const pendingWrites = new Set();
        let bytes = 0;
        let chunkCount = 0;
        let stoppedResolve;
        let stoppedFallbackTimer = null;
        const waitForPendingWrites = async (timeoutMs = 5000) => {
          const deadline = performance.now() + Math.max(0, Number(timeoutMs || 0));
          while (pendingWrites.size && performance.now() < deadline) {
            await Promise.race(Array.from(pendingWrites));
          }
          return pendingWrites.size;
        };
        const writeChunk = async (blob, options = {}) => {
          const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__;
          if (capture?.dropChunks) return;
          if (!blob?.size) return;
          const index = chunkCount;
          const chunkStartedAt = performance.now();
          const msSinceLastChunk = capture?.lastChunkEventAt != null ? chunkStartedAt - capture.lastChunkEventAt : null;
          if (capture) capture.lastChunkEventAt = chunkStartedAt;
          if (bufferedFinalExport) {
            chunkCount += 1;
            bytes += blob.size;
            chunks.push(blob);
            if (capture) {
              capture.lastChunkTiming = {
                blobBytes: blob.size,
                msSinceLastChunk: msSinceLastChunk == null ? null : Number(msSinceLastChunk.toFixed(1)),
                buffered: true,
                browserFps: Number(app?.lastFps || 0),
                captureElapsedSeconds: Number(((performance.now() - capture.startedAt) / 1000).toFixed(3)),
              };
              app?.recordCaptureChunkTiming?.(capture.lastChunkTiming);
            }
            return { ok: true, index, bytes: blob.size, buffered: true };
          }
          if (typeof window.marbleRenderWriteCanvasChunk === 'function') {
            const arrayBufferStartedAt = performance.now();
            const arrayBuffer = await blob.arrayBuffer();
            const arrayBufferMs = performance.now() - arrayBufferStartedAt;
            if (capture?.dropChunks) return;
            const payloadStartedAt = performance.now();
            let payload;
            let bytePayloadMs;
            if (payloadEncoding === 'array') {
              const byteArray = Array.from(new Uint8Array(arrayBuffer));
              bytePayloadMs = performance.now() - payloadStartedAt;
              payload = { bytes: byteArray };
            } else {
              let binary = '';
              const view = new Uint8Array(arrayBuffer);
              const step = 0x8000;
              for (let offset = 0; offset < view.length; offset += step) {
                binary += String.fromCharCode(...view.subarray(offset, offset + step));
              }
              payload = { base64: btoa(binary) };
              bytePayloadMs = performance.now() - payloadStartedAt;
            }
            const browserPrepMs = performance.now() - chunkStartedAt;
            const pendingBefore = pendingWrites.size;
            if (capture) capture.pendingWritesMax = Math.max(capture.pendingWritesMax || 0, pendingBefore + 1);
            const timing = {
              blobBytes: blob.size,
              msSinceLastChunk: msSinceLastChunk == null ? null : Number(msSinceLastChunk.toFixed(1)),
              arrayBufferMs: Number(arrayBufferMs.toFixed(1)),
              byteArrayMs: payloadEncoding === 'array' ? Number(bytePayloadMs.toFixed(1)) : 0,
              base64EncodeMs: payloadEncoding === 'base64' ? Number(bytePayloadMs.toFixed(1)) : 0,
              payloadEncoding,
              browserPrepMs: Number(browserPrepMs.toFixed(1)),
              pendingBefore,
              browserFps: Number(app?.lastFps || 0),
              captureElapsedSeconds: capture ? Number(((performance.now() - capture.startedAt) / 1000).toFixed(3)) : null,
              final: Boolean(options.final),
            };
            const bindingStartedAt = performance.now();
            const writePromise = Promise.resolve(window.marbleRenderWriteCanvasChunk({ index, encoding: payloadEncoding, ...payload, type: blob.type || recorder.mimeType || mimeType || 'video/webm', timing }));
            pendingWrites.add(writePromise);
            try {
              const result = await writePromise;
              const bindingRoundTripMs = performance.now() - bindingStartedAt;
              const totalWriteMs = performance.now() - chunkStartedAt;
              if (capture) {
                capture.lastChunkTiming = {
                  ...timing,
                  bindingRoundTripMs: Number(bindingRoundTripMs.toFixed(1)),
                  totalWriteMs: Number(totalWriteMs.toFixed(1)),
                  pendingAfter: pendingWrites.size,
                  nodeBindingMs: result?.nodeBindingMs ?? null,
                  nodeBufferMs: result?.nodeBufferMs ?? null,
                  nodeWriteMs: result?.nodeWriteMs ?? null,
                };
                app?.recordCaptureChunkTiming?.(capture.lastChunkTiming);
              }
              if (result?.ok) {
                chunkCount += 1;
                bytes += blob.size;
                chunks.push({ id: index, size: blob.size, type: blob.type || recorder.mimeType || mimeType || 'video/webm' });
              }
              return result;
            } finally {
              pendingWrites.delete(writePromise);
            }
          }
          chunkCount += 1;
          bytes += blob.size;
          chunks.push({ id: index, size: blob.size, type: blob.type || recorder.mimeType || mimeType || 'video/webm' });
        };
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data?.size) {
            const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__;
            const final = Boolean(capture?.stopRequestedAt);
            writeChunk(event.data, { final }).catch((error) => {
              console.error('[render:auto-cup] Canvas chunk write failed', error);
            });
          }
        });
        const stopped = new Promise((resolve) => {
          stoppedResolve = resolve;
          const resolveStopped = (fallbackReason = null) => {
            if (!stoppedResolve) return;
            const resolveNow = stoppedResolve;
            stoppedResolve = null;
            if (stoppedFallbackTimer) {
              clearTimeout(stoppedFallbackTimer);
              stoppedFallbackTimer = null;
            }
            const bytes = chunks.reduce((sum, chunk) => sum + (chunk.size || 0), 0);
            resolveNow({
              ok: true,
              fallbackReason,
              mimeType: recorder.mimeType || mimeType || 'video/webm',
              requestedFps: Math.max(1, Math.round(Number(fps) || 60)),
              width: canvas.width || width,
              height: canvas.height || height,
              videoCanvas: app?.getVideoCompositeCanvasInfo?.() || null,
              trackSettings: stream.getVideoTracks()[0]?.getSettings?.() || null,
              bytes,
              chunkCount: chunks.length,
              chunks: bufferedFinalExport ? chunks.map((chunk, id) => ({ id, size: chunk.size || 0, type: chunk.type || recorder.mimeType || mimeType || 'video/webm' })) : chunks,
              bufferedFinalExport,
              targetSeconds: captureTargetSeconds,
              videoBitsPerSecond,
              elapsedSeconds: (performance.now() - window.__MARBLE_RENDER_CANVAS_CAPTURE__.startedAt) / 1000,
            });
          };
          recorder.addEventListener('stop', () => resolveStopped(null), { once: true });
          window.__MARBLE_RENDER_RESOLVE_CANVAS_STOP__ = resolveStopped;
        });
        window.__MARBLE_RENDER_CANVAS_CAPTURE__ = {
          stream,
          recorder,
          chunks,
          startedAt: performance.now(),
          stopRequestedAt: null,
          stopReason: null,
          dropChunks: false,
          lastChunkEventAt: null,
          lastChunkTiming: null,
          pendingWritesMax: 0,
          bufferedFinalExport,
          payloadEncoding,
          hardStopTargetSeconds: captureTargetSeconds,
          hardStopArmedAt: performance.now(),
          hardStopGraceSeconds: 2,
          getInfo: () => ({
            ok: true,
            state: recorder.state,
            mimeType: recorder.mimeType || mimeType || 'video/webm',
            requestedFps: Math.max(1, Math.round(Number(fps) || 60)),
            chunkCount: chunks.length,
            elapsedSeconds: (performance.now() - window.__MARBLE_RENDER_CANVAS_CAPTURE__.startedAt) / 1000,
            targetSeconds: Number(window.__MARBLE_RENDER_CANVAS_TARGET_SECONDS || captureTargetSeconds || 0) || captureTargetSeconds,
            bufferedFinalExport,
            payloadEncoding,
            pendingWrites: pendingWrites.size,
            pendingWritesMax: window.__MARBLE_RENDER_CANVAS_CAPTURE__.pendingWritesMax || 0,
            lastChunkTiming: window.__MARBLE_RENDER_CANVAS_CAPTURE__.lastChunkTiming || null,
            stopRequestedAt: window.__MARBLE_RENDER_CANVAS_CAPTURE__.stopRequestedAt,
            stopReason: window.__MARBLE_RENDER_CANVAS_CAPTURE__.stopReason || null,
            hardStopTargetSeconds: window.__MARBLE_RENDER_CANVAS_CAPTURE__.hardStopTargetSeconds ?? captureTargetSeconds,
            hardStopGraceSeconds: window.__MARBLE_RENDER_CANVAS_CAPTURE__.hardStopGraceSeconds ?? 2,
            videoBitsPerSecond,
            trackSettings: stream.getVideoTracks()[0]?.getSettings?.() || null,
            videoCanvas: app?.getVideoCompositeCanvasInfo?.() || null,
          }),
          requestStop: (reason = 'manual-stop') => {
            const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__;
            capture.stopReason = reason || capture.stopReason || 'manual-stop';
            capture.stopRequestedAt = capture.stopRequestedAt || performance.now();
            // Do not drop the recorder's final dataavailable chunk. It is emitted
            // as part of stop() and is required for a complete seekable WebM.
            let stopCalled = false;
            let stopError = null;
            try {
              if (recorder.state === 'paused') recorder.resume?.();
              if (recorder.state === 'recording') {
                recorder.stop();
                stopCalled = true;
              }
              stream.getTracks().forEach((track) => {
                try { track.stop(); } catch {}
              });
              if (recorder.state !== 'recording' && recorder.state !== 'paused') {
                setTimeout(() => {
                  window.__MARBLE_RENDER_RESOLVE_CANVAS_STOP__?.('already-inactive-after-request-stop');
                }, 0);
              }
            } catch (error) {
              stopError = error?.message || String(error);
            }
            if (hardStopTimer) {
              clearTimeout(hardStopTimer);
              hardStopTimer = null;
            }
            if (!stoppedFallbackTimer) {
              stoppedFallbackTimer = setTimeout(() => {
                window.__MARBLE_RENDER_RESOLVE_CANVAS_STOP__?.('fallback-after-stop-request');
              }, 1500);
            }
            return {
              ok: !stopError,
              reason: stopError || null,
              requestedStop: stopCalled,
              state: recorder.state,
              stopReason: capture.stopReason,
              stopRequestedAt: capture.stopRequestedAt,
            };
          },
          stop: async (reason = 'manual-stop') => {
            const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__;
            if (capture.stopPromise) return capture.stopPromise;
            const requested = capture.requestStop(reason);
            capture.stopPromise = (async () => {
              const result = await stopped;
              await waitForPendingWrites(1000);
              capture.dropChunks = true;
              stream.getTracks().forEach((track) => track.stop());
              return { ...result, requestStop: requested, pendingWrites: pendingWrites.size, stopReason: capture.stopReason, stopRequestedAt: capture.stopRequestedAt };
            })();
            return capture.stopPromise;
          },
        };
        const hardStopDelayMs = Math.max(1000, ((captureTargetSeconds + 2) * 1000));
        hardStopTimer = setTimeout(() => {
          try {
            const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__;
            const elapsedSeconds = capture?.getInfo?.()?.elapsedSeconds ?? 0;
            if (capture && capture.stopRequestedAt == null) {
              capture.requestStop?.(`hard-target-seconds-${Math.round(captureTargetSeconds)}-elapsed-${Number(elapsedSeconds).toFixed(1)}`);
            }
          } catch {}
        }, hardStopDelayMs);
        recorder.start(2000);
        return window.__MARBLE_RENDER_CANVAS_CAPTURE__.getInfo();
      }, {
        fps: config.fps,
        width: config.captureWidth,
        height: config.captureHeight,
        videoCanvasLayout: config.videoCanvasLayout,
        targetSeconds: config.targetSeconds,
        useBufferedFinalExport: useBufferedCanvasCapture,
        chunkPayloadEncoding: useArrayCanvasChunkTransport ? 'array' : 'base64',
      });
      if (!canvasCaptureInfo?.ok) fail(`Could not start canvas video capture: ${JSON.stringify(canvasCaptureInfo)}`);
      log('Canvas video capture started:', JSON.stringify(canvasCaptureInfo));
    }

    progress('app-start', `${config.mode}, races=${config.multipleRaceCount}, marbles=${config.cupSize}`);
    const started = await page.evaluate(({ mode, multipleRaceCount, cupSize, trackLength, targetSeconds, lengthMode, smokeSeconds, maxRaceSeconds, cupName, ttsVoice, obstaclePreset, obstacleDistribution, obstacleTypes, visualTheme, showLeftUi, showRightUi, disableMouseOrbit, renderPerformanceMode, renderPerformanceProfile, survivorStateInput }) => {
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
      if (visualTheme && app.ui?.visualTheme) {
        app.ui.visualTheme.value = visualTheme;
        app.updateVisualTheme?.({ themeKey: visualTheme, regenerateMarbles: true, source: 'playwright-render' });
      }
      if (app.ui?.cupName) app.ui.cupName.value = cupName || 'Speed X Cup';
      if (app.ui?.count) app.ui.count.value = String(cupSize);
      app.marbleCount = cupSize;
      if (app.ui?.cupSize) app.ui.cupSize.value = String(cupSize);
      if (app.ui?.multipleRaceCount) app.ui.multipleRaceCount.value = String(multipleRaceCount || 5);
      if (app.ui?.raceMode) app.ui.raceMode.value = mode === 'cup' ? 'cup' : mode === 'survivor' ? 'survivor' : 'single';
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
        const perfProfile = renderPerformanceProfile || 'turbo60';
        app.setUIThrottleProfile?.(perfProfile, {
          mode: 'playwright-render-performance',
          renderPerformanceMode: true,
        });
        const profile = app.performanceProfile || {};
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
      else if (mode === 'survivor') app.startSurvivorLeagueMode?.({ initialState: survivorStateInput });
      else if (app.cupMode?.active) {
        app.cupMode = { ...app.cupMode, active: false, status: 'idle', stageIndex: 0, currentEntrants: [], results: [], lastQualified: [], champion: null, podium: [] };
        if (app.survivorLeague?.active) app.survivorLeague = { ...app.survivorLeague, active: false, status: 'idle', roster: [], spotlight: null };
        app.newRace?.({ regenerateTrack: false });
      } else {
        if (app.survivorLeague?.active) app.survivorLeague = { ...app.survivorLeague, active: false, status: 'idle', roster: [], spotlight: null };
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
        mode === 'cup' ? (app.getCupDisplayName?.() || cupName || 'Cup Mode') : (mode === 'survivor' ? `Survivor League · ${multipleRaceCount || 5} races` : mode === 'continuous' ? `Multiple · ${multipleRaceCount || 5} races` : 'Single Race'),
        `${mode === 'cup' ? (app.getCupStage?.() || 'Cup') : (mode === 'survivor' ? 'Survivor League' : mode === 'continuous' ? 'Multiple' : 'Single')} · ${app.obstaclePreset?.label || 'High-density'} · Live race coverage`,
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
        const originalHandleContinuousRecordingRaceComplete = app.handleContinuousRecordingRaceComplete?.bind(app);
        if (originalHandleContinuousRecordingRaceComplete && !app.__playwrightContinuousFinalRaceSignalWrapped) {
          app.handleContinuousRecordingRaceComplete = (...args) => {
            const result = originalHandleContinuousRecordingRaceComplete(...args);
            const recording = app.continuousRecording;
            const totalRaces = Math.max(1, Number(recording?.totalRaces || 0));
            const racesCompleted = Number(recording?.racesCompleted || 0);
            if (recording?.playwrightRender && racesCompleted >= totalRaces && totalRaces > 0) {
              const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__?.getInfo?.() || null;
              const activeCommentary = app.activeCommentary || null;
              const payload = {
                eventSource: 'handleContinuousRecordingRaceComplete',
                mode: recording.mode || 'continuous',
                phase: recording.phase || 'waiting-final-stop',
                active: Boolean(recording.active),
                state: app.state || null,
                elapsed: Number(app.elapsed || 0),
                racesCompleted,
                totalRaces,
                captureElapsedSeconds: capture?.elapsedSeconds ?? null,
                capture,
                podium: app.podiumCeremony ? {
                  active: Boolean(app.podiumCeremony.active),
                  elapsedSeconds: Number(app.podiumCeremony.elapsedSeconds || 0),
                  duration: Number.isFinite(app.podiumCeremony.duration) ? app.podiumCeremony.duration : null,
                  confettiComplete: Boolean(app.podiumCeremony.confettiComplete),
                  medalists: Array.isArray(app.podiumCeremony.medalists) ? app.podiumCeremony.medalists.length : 0,
                  isCupChampionCeremony: Boolean(app.podiumCeremony.isCupChampionCeremony),
                } : null,
                commentary: {
                  enabled: Boolean(app.commentaryEnabled),
                  voiceEnabled: Boolean(app.commentaryVoiceEnabled),
                  speaking: Boolean(app.commentaryVoiceSpeaking),
                  preparing: Boolean(app.commentaryVoicePreparing),
                  queueLength: Array.isArray(app.commentaryVoiceQueue) ? app.commentaryVoiceQueue.length : 0,
                  currentLine: app.commentaryVoiceCurrentLine || null,
                  activeKind: activeCommentary?.kind || null,
                  activeRemainingSeconds: activeCommentary?.expiresAt != null ? Math.max(0, Number(activeCommentary.expiresAt || 0) - Number(app.elapsed || 0)) : 0,
                },
              };
              if (typeof window.marbleRenderNotifyFinalRaceFinished === 'function') {
                Promise.resolve(window.marbleRenderNotifyFinalRaceFinished(payload)).catch((error) => {
                  if (window.__MARBLE_RENDER_DEBUG_LOGS) console.warn('[render:auto-cup] final-race binding notify failed', error?.message || error);
                });
              }
            }
            return result;
          };
          app.__playwrightContinuousFinalRaceSignalWrapped = true;
        }
        if (maxRaceSeconds > 0) {
          const originalStartContinuousRecordingRace = app.startContinuousRecordingRace?.bind(app);
          if (originalStartContinuousRecordingRace && !app.__playwrightContinuousRaceTimeoutWrapped) {
            app.startContinuousRecordingRace = (...args) => {
              const result = originalStartContinuousRecordingRace(...args);
              const startedRaceIndex = Number(app.continuousRecording?.racesCompleted || 0) + 1;
              window.setTimeout(() => {
                if (!app.continuousRecording?.active || app.state !== 'running') return;
                const currentRaceIndex = Number(app.continuousRecording?.racesCompleted || 0) + 1;
                if (currentRaceIndex !== startedRaceIndex) return;
                const unfinished = (app.marbleData || []).filter((data) => data && !data.finished && !data.defeated);
                unfinished.forEach((data) => app.eliminateStalledMarble?.(data, data.distance || 0, 'playwright-max-race-timeout'));
                const stillUnfinished = (app.marbleData || []).filter((data) => data && !data.finished && !data.defeated);
                if (stillUnfinished.length) {
                  stillUnfinished.forEach((data) => {
                    data.defeated = true;
                    data.finished = true;
                    data.finishTime = app.elapsed || maxRaceSeconds;
                  });
                }
                app.checkFinishers?.();
                if (app.state === 'running') {
                  app.state = 'finished';
                  const finalRanking = app.getRanking?.({ force: true }) || [];
                  if (Array.isArray(app.finishers)) {
                    const known = new Set(app.finishers.map((data) => data.id));
                    finalRanking.forEach((data) => {
                      if (data && !known.has(data.id)) app.finishers.push(data);
                    });
                  }
                  app.handleContinuousRecordingRaceComplete?.();
                  app.startPodiumCeremony?.(finalRanking.slice(0, 3));
                }
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
      } else if (mode === 'survivor') {
        app.continuousRecording = {
          ...(app.continuousRecording || {}),
          active: true,
          mode: 'survivor',
          label: 'Survivor League',
          phase: 'playwright-render-waiting-open-gate',
          startedAt: performance.now(),
          racesCompleted: 0,
          totalRaces: multipleRaceCount || 5,
          preserveCurrentSettings: false,
          nextRaceDelaySeconds: timing.postRaceHoldSeconds ?? 5,
          gateDelaySeconds: timing.nextGateAfterRaceSeconds ?? 5,
          initialGateDelaySeconds: timing.gateDelaySeconds ?? 2,
          finalStopDelaySeconds: timing.stopAfterFinalSeconds ?? 12,
          nextActionAt: null,
          pendingTimer: null,
          playwrightRender: true,
        };
        const scheduleSurvivorRecordingAction = (delaySeconds, phase, action) => {
          if (!app.continuousRecording?.active || app.continuousRecording.mode !== 'survivor') return;
          app.clearContinuousRecordingTimer?.();
          app.continuousRecording.phase = phase;
          app.continuousRecording.nextActionAt = performance.now() + delaySeconds * 1000;
          app.continuousRecording.pendingTimer = setTimeout(() => {
            if (!app.continuousRecording?.active || app.continuousRecording.mode !== 'survivor') return;
            app.continuousRecording.pendingTimer = null;
            app.continuousRecording.nextActionAt = null;
            action();
            app.updateUI?.();
          }, delaySeconds * 1000);
          app.updateUI?.();
        };
        const originalHandleSurvivorLeagueRaceComplete = app.handleSurvivorLeagueRaceComplete?.bind(app);
        if (originalHandleSurvivorLeagueRaceComplete && !app.__playwrightSurvivorRaceCompleteWrapped) {
          app.handleSurvivorLeagueRaceComplete = (...args) => {
            const result = originalHandleSurvivorLeagueRaceComplete(...args);
            const recording = app.continuousRecording;
            if (recording?.playwrightRender && recording.mode === 'survivor') {
              recording.racesCompleted = Number(app.survivorLeague?.raceNumber || recording.racesCompleted || 0);
              if (typeof window.marbleRenderWriteSurvivorLeagueState === 'function') {
                const state = app.exportSurvivorLeagueState?.();
                if (state) Promise.resolve(window.marbleRenderWriteSurvivorLeagueState({ state, source: 'race-complete' })).catch((error) => {
                  if (window.__MARBLE_RENDER_DEBUG_LOGS) console.warn('[render:auto-cup] survivor state export failed', error?.message || error);
                });
              }
              const completed = Number(recording.racesCompleted || 0);
              const totalRaces = Math.max(1, Number(recording.totalRaces || 0));
              if (completed >= totalRaces) {
                scheduleSurvivorRecordingAction(Number(recording.finalStopDelaySeconds || 0), 'waiting-final-stop', () => {
                  if (!app.continuousRecording?.active || app.continuousRecording.mode !== 'survivor') return;
                  app.clearContinuousRecordingTimer?.();
                  app.continuousRecording.active = false;
                  app.continuousRecording.phase = 'completed-all-races';
                  app.continuousRecording.nextActionAt = null;
                });
                const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__?.getInfo?.() || null;
                if (typeof window.marbleRenderNotifyFinalRaceFinished === 'function') {
                  Promise.resolve(window.marbleRenderNotifyFinalRaceFinished({
                    eventSource: 'handleSurvivorLeagueRaceComplete',
                    mode: 'survivor',
                    phase: 'waiting-final-stop',
                    active: true,
                    state: app.state || null,
                    elapsed: Number(app.elapsed || 0),
                    racesCompleted: completed,
                    totalRaces,
                    captureElapsedSeconds: capture?.elapsedSeconds ?? null,
                    capture,
                  })).catch((error) => {
                    if (window.__MARBLE_RENDER_DEBUG_LOGS) console.warn('[render:auto-cup] survivor final-race binding notify failed', error?.message || error);
                  });
                }
              } else {
                scheduleSurvivorRecordingAction(Number(recording.nextRaceDelaySeconds || 0), 'ceremony-hold', () => {
                  app.newRace?.({ regenerateTrack: true });
                  scheduleSurvivorRecordingAction(Number(app.continuousRecording?.gateDelaySeconds || 0), 'waiting-open-gate', () => {
                    app.cameraMode = 'default';
                    app.resetDefaultAutoCameraForRace?.();
                    app.updateCamera?.(1 / 60);
                    app.startSurvivorLeagueRaceWithSpotlight?.();
                  });
                });
              }
            }
            return result;
          };
          app.__playwrightSurvivorRaceCompleteWrapped = true;
        }
        if (maxRaceSeconds > 0) {
          const originalStartSurvivorLeagueRaceWithSpotlight = app.startSurvivorLeagueRaceWithSpotlight?.bind(app);
          if (originalStartSurvivorLeagueRaceWithSpotlight && !app.__playwrightSurvivorRaceTimeoutWrapped) {
            app.startSurvivorLeagueRaceWithSpotlight = (...args) => {
              const result = originalStartSurvivorLeagueRaceWithSpotlight(...args);
              const expectedRaceNumber = Number(app.survivorLeague?.raceNumber || 0);
              window.setTimeout(() => {
                if (!app.continuousRecording?.active || app.continuousRecording.mode !== 'survivor') return;
                if (!app.survivorLeague?.active || Number(app.survivorLeague.raceNumber || 0) !== expectedRaceNumber) return;
                if (app.state !== 'running') return;
                const unfinished = (app.marbleData || []).filter((data) => data && !data.finished && !data.defeated);
                unfinished.forEach((data) => app.eliminateStalledMarble?.(data, data.distance || 0, 'playwright-max-race-timeout'));
                app.checkFinishers?.();
              }, maxRaceSeconds * 1000);
              return result;
            };
            app.__playwrightSurvivorRaceTimeoutWrapped = true;
          }
        }
        scheduleSurvivorRecordingAction(app.continuousRecording.initialGateDelaySeconds, 'waiting-open-gate', () => {
          app.cameraMode = 'default';
          app.resetDefaultAutoCameraForRace?.();
          app.updateCamera?.(1 / 60);
          app.startSurvivorLeagueRaceWithSpotlight?.();
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
      const activeRecording = mode === 'single' ? app.singleRecording : (mode === 'continuous' || mode === 'survivor') ? app.continuousRecording : app.autoCupRecording;
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
        cupName: mode === 'cup' ? app.getCupDisplayName?.() : mode === 'survivor' ? 'Survivor League' : (cupName || 'Single Race'),
        ttsVoice: app.localTtsBridge?.voice || ttsVoice,
        obstacleLabel: app.obstaclePreset?.label,
        obstacleTypes: [...(app.enabledObstacleTypes || [])],
        visualTheme: app.visualThemeKey || app.ui?.visualTheme?.value || null,
        obstacleTypeCounts: app.obstacleTypeCounts,
        phase: activeRecording?.phase,
        stage: mode === 'cup' ? app.getCupStage?.() : mode === 'survivor' ? (app.survivorLeague?.status || mode) : mode,
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
      visualTheme: config.visualTheme,
      showLeftUi: config.showLeftUi,
      showRightUi: config.showRightUi,
      disableMouseOrbit: config.disableMouseOrbit,
      renderPerformanceMode: config.renderPerformanceMode,
      renderPerformanceProfile: config.renderPerformanceProfile,
      survivorStateInput,
    });
    if (!started.ok) fail(`Could not start Playwright auto cup: ${started.reason || 'unknown'}`);
    log('Auto cup started:', JSON.stringify(started));
    progress('race-running', `${config.mode}, target=${config.targetSeconds}s, timeout=${config.timeoutSeconds}s`);

    await collectEventMarkerSnapshot(page);
    eventMarkerPoller = setInterval(() => {
      collectEventMarkerSnapshot(page).catch(() => {});
    }, config.eventMarkerIntervalSeconds * 1000);
    scheduleFinalRaceCanvasStop = async (snapshot, source = 'poller') => {
      if (completionCanvasStopRequested || finalRaceStopPromise) return finalRaceStopPromise;
      completionCanvasStopRequested = true;
      if (completionStopPoller) {
        clearInterval(completionStopPoller);
        completionStopPoller = null;
      }
      const initialSnapshot = snapshot;
      const finalRaceDetectedAt = Date.now();
      const nodeGateDelayMs = Math.max(0, Number(finalRaceCompletionBufferSeconds || 0)) * 1000;
      let browserStopTimerArm = { status: 'not-started' };
      let browserStopTimerArmSettled = false;
      let browserStopTimerArmPromise = null;
      const nodeGatePromise = new Promise((resolve) => {
        finalRaceStopTimer = setTimeout(resolve, nodeGateDelayMs);
      });
      const completionSnapshot = initialSnapshot;
      const captureTargetSeconds = getFinalRaceCompletionCaptureTargetSeconds(completionSnapshot);
      if (!finalRaceStopLogged) {
        finalRaceStopLogged = true;
        log('[progress] final-race-finished-buffer-start', safeJson({
          source,
          completion: sanitizeRenderCompletion(completionSnapshot),
          bufferSeconds: finalRaceCompletionBufferSeconds,
          nodeGateDelayMs,
          captureTargetSeconds,
        }));
      }
      browserStopTimerArmPromise = armBrowserCanvasStopTimer(page, finalRaceCompletionBufferSeconds, 'final-race-complete-plus-buffer')
        .then((result) => {
          browserStopTimerArmSettled = true;
          browserStopTimerArm = { status: 'settled', result };
          return result;
        })
        .catch((error) => {
          browserStopTimerArmSettled = true;
          browserStopTimerArm = { status: 'rejected', reason: error?.message || String(error) };
          return browserStopTimerArm;
        });
      page.evaluate(({ captureTargetSeconds }) => {
        window.__MARBLE_RENDER_CANVAS_TARGET_SECONDS = Math.max(1, Number(captureTargetSeconds || 0) || 1);
      }, { captureTargetSeconds }).catch(() => null);

      finalRaceStopPromise = (async () => {
        await nodeGatePromise;
        finalRaceStopTimer = null;
        const nodeGateFiredAt = Date.now();
        if (canvasCaptureStopRequestedAt === null) {
          canvasCaptureStopRequestedAt = nodeGateFiredAt;
          canvasCaptureStopRequestedChunk = canvasChunkStats.chunks;
        }
        const nodeGateActualElapsedSeconds = getActualCanvasCaptureElapsedSeconds(completionSnapshot);
        if (!finalRaceNodeGateLogged) {
          finalRaceNodeGateLogged = true;
          log('[progress] canvas-stop-request-node-gate', JSON.stringify({
            reason: 'final-race-complete-plus-buffer',
            source,
            acceptedChunks: canvasChunkStats.chunks,
            mb: Number((canvasChunkStats.bytes / 1048576).toFixed(1)),
            nodeGateActualElapsedSeconds: Number(nodeGateActualElapsedSeconds.toFixed(3)),
            nodeGateWallElapsedSeconds: Number(((nodeGateFiredAt - finalRaceDetectedAt) / 1000).toFixed(3)),
            secondsSinceFinalRaceDetected: Number(((nodeGateFiredAt - finalRaceDetectedAt) / 1000).toFixed(3)),
            cutTimeSource: 'actual-capture-elapsed',
            browserStopTimerArm: browserStopTimerArmSettled ? browserStopTimerArm : { status: 'pending' },
            completion: sanitizeRenderCompletion(completionSnapshot),
          }));
        }
        let canvasStopRequest = null;
        try {
          canvasStopRequest = await requestCanvasCaptureStop(page, 'final-race-complete-plus-buffer');
        } catch (error) {
          canvasStopRequest = { ok: false, reason: error?.message || String(error) };
        }
        if (canvasStopRequest && !finalRaceCanvasStopLogged) {
          finalRaceCanvasStopLogged = true;
          log('[progress] canvas-stop-requested-after-final-race-buffer', safeJson({
            completion: sanitizeRenderCompletion(completionSnapshot),
            bufferSeconds: finalRaceCompletionBufferSeconds,
            nodeGateWallElapsedSeconds: Number(((Date.now() - finalRaceDetectedAt) / 1000).toFixed(3)),
            secondsSinceFinalRaceDetected: Number(((Date.now() - finalRaceDetectedAt) / 1000).toFixed(3)),
            browserStopTimerArm: browserStopTimerArmSettled ? browserStopTimerArm : { status: 'pending' },
            canvasStopRequest,
          }));
        }
        if (browserStopTimerArmPromise) browserStopTimerArmPromise.catch(() => null);
        return canvasStopRequest;
      })();
      return finalRaceStopPromise;
    };

    if (config.videoCapture === 'canvas') {
      completionStopPoller = setInterval(() => {
        if (completionCanvasStopRequested || completionStopPollerRunning || !page || page.isClosed?.()) return;
        completionStopPollerRunning = true;
        readRenderProgressSnapshot(page)
          .then((snapshot) => {
            if (!isFinalRaceFinishedState(snapshot)) return null;
            return scheduleFinalRaceCanvasStop(snapshot, 'poller');
          })
          .catch(() => null)
          .finally(() => { completionStopPollerRunning = false; });
      }, 1000);
    }
    await logRenderProgressSnapshot(page, 'started');
    progressLogPoller = setInterval(() => {
      logRenderProgressSnapshot(page, 'periodic').catch(() => {});
    }, 30000);

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
          const donePhases = ['final-complete', 'playwright-smoke-complete', 'completed-all-races', 'completed-all-races-render-stop', 'completed-all-races-render-stop-scheduled'];
          const stopRenderCompletion = (reason = 'completed-all-races-render-stop') => {
            if (!app?.continuousRecording?.playwrightRender) return null;
            const recording = app.continuousRecording;
            if (Number(recording.racesCompleted || 0) < Number(recording.totalRaces || 0)) return null;
            app.clearContinuousRecordingTimer?.();
            app.stopContinuousRecording?.({ stopRecorder: false, reason });
            recording.active = false;
            recording.phase = reason;
            recording.nextActionAt = null;
            return recording;
          };
          const finalDone = app.cupMode?.status === 'complete' && app.autoCupRecording?.active === false;
          const stopped = app.autoCupRecording?.active === false && donePhases.includes(app.autoCupRecording?.phase);
          const singleDone = app.singleRecording?.playwrightRender && app.singleRecording.active === false && donePhases.includes(app.singleRecording.phase);
          const continuousDone = app.continuousRecording?.playwrightRender && app.continuousRecording.active === false && donePhases.includes(app.continuousRecording.phase);
          const continuousReachedTarget = app.continuousRecording?.playwrightRender
            && app.continuousRecording.mode !== 'survivor'
            && Number(app.continuousRecording.racesCompleted || 0) >= Number(app.continuousRecording.totalRaces || 0)
            && (app.continuousRecording.phase === 'waiting-final-stop' || donePhases.includes(app.continuousRecording.phase));
          const survivorDone = app.continuousRecording?.playwrightRender
            && app.continuousRecording.mode === 'survivor'
            && app.continuousRecording.active === false
            && donePhases.includes(app.continuousRecording.phase);
          if (continuousReachedTarget && app.continuousRecording?.active) {
            stopRenderCompletion('completed-all-races-render-stop');
          }
          if (finalDone || stopped || singleDone || continuousDone || continuousReachedTarget || survivorDone) {
            const activeRecording = singleDone ? app.singleRecording : (continuousDone || continuousReachedTarget || survivorDone) ? app.continuousRecording : app.autoCupRecording;
            return {
            done: true,
            ok: true,
            mode: activeRecording?.mode || null,
            phase: activeRecording?.phase,
            active: Boolean(activeRecording?.active),
            state: app.state,
            elapsed: app.elapsed,
            racesCompleted: activeRecording?.racesCompleted,
            totalRaces: activeRecording?.totalRaces,
            cupStatus: app.cupMode?.status,
            champion: app.cupMode?.champion?.name || null,
          };
          }
          return false;
        },
        null,
        { timeout: waitTimeout, polling: 1000 },
      ).then((handle) => handle.jsonValue()).catch(async (error) => {
        const state = await readRenderProgressSnapshot(page);
        if (isTerminalContinuousCompletionState(state)) {
          const captureTargetSeconds = calculateContinuousCompletionCaptureTargetSeconds(state);
          log('[progress] timeout reached after app completed all races; continuing to recorder finalization', JSON.stringify({ ...state, captureTargetSeconds }));
          await page.evaluate(({ captureTargetSeconds }) => {
            window.__MARBLE_RENDER_CANVAS_TARGET_SECONDS = Math.max(1, Number(captureTargetSeconds || 0) || 1);
            const app = window.__MARBLE_RACE_APP__;
            if (app?.continuousRecording?.playwrightRender) {
              app.clearContinuousRecordingTimer?.();
              app.stopContinuousRecording?.({ stopRecorder: false, reason: 'completed-all-races-render-stop' });
              app.continuousRecording.active = false;
              app.continuousRecording.phase = 'completed-all-races-render-stop';
              app.continuousRecording.nextActionAt = null;
            }
          }, { captureTargetSeconds }).catch(() => null);
          return sanitizeRenderCompletion({ ...state, reason: 'completed-all-races-timeout-finalize', captureTargetSeconds });
        }
        fail(`Timed out waiting for auto cup completion. Last state: ${safeJson(sanitizeRenderCompletion(state))}`, error);
      });
      log('Auto cup completed:', safeJson(sanitizeRenderCompletion(completion)));
      if (isTerminalContinuousCompletionState(completion) || (completion?.mode === 'continuous' && Number(completion?.racesCompleted || 0) >= Number(completion?.totalRaces || 0))) {
        if (completionStopPoller) {
          clearInterval(completionStopPoller);
          completionStopPoller = null;
        }
        if (!finalRaceStopPromise) {
          await scheduleFinalRaceCanvasStop(completion, 'completion-wait');
        }
        if (finalRaceStopPromise) await finalRaceStopPromise;
      }
    }

    progress('capture-finalize', 'collect metadata + stop recorder');
    await page.waitForTimeout(1000);
    if (completionStopPoller) {
      clearInterval(completionStopPoller);
      completionStopPoller = null;
    }
    if (progressLogPoller) {
      clearInterval(progressLogPoller);
      progressLogPoller = null;
    }
    await logRenderProgressSnapshot(page, 'finalize');
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
        survivorLeague: app.exportSurvivorLeagueState?.() || null,
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
    if (config.mode === 'survivor' && config.survivorStateOutput && renderSummary?.survivorLeague) {
      writeJsonFile(config.survivorStateOutput, {
        ...renderSummary.survivorLeague,
        version: 1,
        updatedAt: new Date().toISOString(),
        renderOutput: config.output,
        source: 'render-finalize',
      });
      renderSummary.survivorStateOutput = config.survivorStateOutput;
    }
    if (renderSummary) log('Render metadata summary:', JSON.stringify({ eventCount: renderSummary.eventMarkers?.length || renderSummary.broadcastEvents?.length || 0, thumbnailCandidateCount: renderSummary.thumbnailCandidates?.length || 0, winner: renderSummary.winner, champion: renderSummary.champion, cupName: renderSummary.cupName, survivorRaces: renderSummary.survivorLeague?.raceNumber ?? null, survivorStateOutput: renderSummary.survivorStateOutput || null }));
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
      if (canvasCaptureStopRequestedAt === null) {
        canvasCaptureStopRequestedAt = Date.now();
        canvasCaptureStopRequestedChunk = canvasChunkStats.chunks;
        const nodeGateActualElapsedSeconds = getActualCanvasCaptureElapsedSeconds();
        log('[progress] canvas-stop-request-node-gate', JSON.stringify({ reason: 'finalize-canvas-stop', acceptedChunks: canvasChunkStats.chunks, mb: Number((canvasChunkStats.bytes / 1048576).toFixed(1)), nodeGateActualElapsedSeconds: Number(nodeGateActualElapsedSeconds.toFixed(3)), cutTimeSource: 'actual-capture-elapsed' }));
      }
      const canvasStopRequest = finalRaceStopPromise ? await finalRaceStopPromise : await requestCanvasCaptureStop(page, 'finalize-canvas-stop');
      const canvasResult = await page.evaluate(async (reason) => {
        const capture = window.__MARBLE_RENDER_CANVAS_CAPTURE__;
        if (!capture) return { ok: false, reason: 'capture-missing' };
        const result = await capture.stop(reason);
        if (capture.bufferedFinalExport) {
          const blob = new Blob(capture.chunks || [], { type: result.mimeType || 'video/webm' });
          const arrayBufferStartedAt = performance.now();
          const arrayBuffer = await blob.arrayBuffer();
          const arrayBufferMs = performance.now() - arrayBufferStartedAt;
          const byteArrayStartedAt = performance.now();
          const bytes = Array.from(new Uint8Array(arrayBuffer));
          const byteArrayMs = performance.now() - byteArrayStartedAt;
          return {
            ...result,
            bufferedFinalExport: true,
            bytes,
            exportBytes: bytes.length,
            exportArrayBufferMs: Number(arrayBufferMs.toFixed(1)),
            exportByteArrayMs: Number(byteArrayMs.toFixed(1)),
          };
        }
        return result;
      }, canvasStopRequest?.stopReason || 'finalize-canvas-stop');
      if (!canvasResult?.ok || !canvasResult.chunkCount) fail(`Canvas video capture failed: ${JSON.stringify({ ...canvasResult, bytes: canvasResult?.bytes ? `[${canvasResult.bytes.length} bytes]` : undefined })}`);
      if (canvasResult.bufferedFinalExport) {
        const bufferedBytes = Array.isArray(canvasResult.bytes) ? Buffer.from(canvasResult.bytes) : Buffer.alloc(0);
        if (!bufferedBytes.length) fail(`Canvas buffered export was empty: ${JSON.stringify({ ...canvasResult, bytes: undefined })}`);
        canvasSourceWebm = canvasChunkOutput || path.join(videoDir, `canvas-capture-${defaultStamp}.webm`);
        writeFileSync(canvasSourceWebm, bufferedBytes);
        delete canvasResult.bytes;
      } else {
        await waitForCanvasChunkWrites();
        canvasSourceWebm = canvasChunkOutput || path.join(videoDir, `canvas-capture-${defaultStamp}.webm`);
      }
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
      const audioOutputPath = resolveAudioOutputPath();
      writeFileSync(audioOutputPath, Buffer.from(audioResult.wavBase64, 'base64'));
      log('Audio captured:', JSON.stringify({ ...audioResult.info, wav: audioOutputPath, bytes: statSync(audioOutputPath).size }));
    }
    await withTimeout('context.close', () => context.close(), 5000);
    await withTimeout('browser.close', () => browser.close(), 5000);
    browser = null;
  } finally {
    if (renderLogPath) log(`Render log saved: ${renderLogPath}`);
    if (renderLogStream) {
      const streamToClose = renderLogStream;
      renderLogStream = null;
      await withTimeout('renderLogStream.end', () => new Promise((resolve) => streamToClose.end(resolve)), 3000);
    }
    if (progressLogPoller) {
      clearInterval(progressLogPoller);
      progressLogPoller = null;
    }
    if (finalRaceStopTimer) {
      clearTimeout(finalRaceStopTimer);
      finalRaceStopTimer = null;
    }
    if (completionStopPoller) {
      clearInterval(completionStopPoller);
      completionStopPoller = null;
    }
    if (eventMarkerPoller) {
      clearInterval(eventMarkerPoller);
      eventMarkerPoller = null;
    }
    if (browser) await withTimeout('browser.close(finally)', () => browser.close(), 5000);
    if (server) server.kill('SIGTERM');
  }

  let sourceWebm = null;
  if (config.videoCapture === 'none') {
    log('No video capture requested; skipping source WebM probe and ffmpeg mux/encode.');
    mkdirSync(path.dirname(config.output), { recursive: true });
    const diagnosticsOutput = path.resolve(`${config.output.replace(/\.[^.]+$/, '')}.no-video-diagnostics.json`);
    writeFileSync(diagnosticsOutput, JSON.stringify({
      ok: true,
      videoCapture: config.videoCapture,
      output: config.output,
      renderSummary: renderSummary || null,
      generatedAt: new Date().toISOString(),
    }, null, 2));
    log(`No-video diagnostics written: ${diagnosticsOutput}`);
    progress('done', diagnosticsOutput);
    log(`Done: ${diagnosticsOutput}`);
    return;
  }
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
  const audioOutputPath = resolveAudioOutputPath({ syncToOutput: true });
  log('Audio output path:', audioOutputPath);
  const hasAudio = config.audio && existsSync(audioOutputPath) && statSync(audioOutputPath).size > 44;
  const companionWebmOutput = outputExt === '.mp4'
    ? path.resolve(`${config.output.replace(/\.[^.]+$/, '')}.comparison.webm`)
    : null;
  if (outputExt === '.webm') {
    log(`Muxing browser-canvas WebM and captured page/TTS audio ${sourceWebm} -> ${config.output}`);
    const ffmpegArgs = ['-y', '-i', sourceWebm];
    if (hasAudio) {
      ffmpegArgs.push('-i', audioOutputPath, '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '160k');
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
      webmArgs.push('-i', audioOutputPath, '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '160k');
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
      ffmpegArgs.push('-i', audioOutputPath, '-map', '0:v:0', '-map', '1:a:0', '-shortest');
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
  if (config.thumbnail || config.youtubeMetadata || config.uploadYoutube) {
    progress('thumbnail-youtube-postprocess');
    const thumbnailOutput = path.resolve(config.thumbnailOutput || `${config.output.replace(/\.[^.]+$/, '')}.thumbnail.jpg`);
    const metadataOutput = path.resolve(`${thumbnailOutput}.metadata.json`);
    const youtubeMetadataOutput = path.resolve(config.youtubeMetadataOutput || `${config.output.replace(/\.[^.]+$/, '')}.youtube.json`);
    let thumbnailAudit = null;
    if (config.thumbnail) {
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
        `--title-history=${config.youtubeTitleHistory}`,
        `--title-history-limit=${config.youtubeTitleHistoryLimit}`,
        `--width=${config.videoCanvasLayout === 'vertical' ? 1080 : 1280}`,
        `--height=${config.videoCanvasLayout === 'vertical' ? 1920 : 720}`,
      ];
      if (config.thumbnailTitle) thumbnailArgs.push(`--title=${config.thumbnailTitle}`);
      run('node', thumbnailArgs);
      if (!config.keepThumbnailMetadata) {
        rmSync(metadataOutput, { force: true });
      }
      const thumbnailAuditPath = `${thumbnailOutput}.json`;
      if (existsSync(thumbnailAuditPath)) {
        try {
          thumbnailAudit = JSON.parse(readFileSync(thumbnailAuditPath, 'utf8'));
          log(`Thumbnail title: ${thumbnailAudit.rawTitle || thumbnailAudit.title || ''} (${thumbnailAudit.titleSource || 'unknown'})`);
        } catch (error) {
          console.warn('[render:auto-cup] Could not read thumbnail audit JSON:', error?.message || error);
        }
      }
      if (!config.keepThumbnailMetadata) {
        rmSync(thumbnailAuditPath, { force: true });
      }
      if (!existsSync(thumbnailOutput) || statSync(thumbnailOutput).size <= 0) fail(`Thumbnail was not created: ${thumbnailOutput}`);
      log(`Thumbnail: ${thumbnailOutput}`);
    }
    if (config.youtubeMetadata) {
      const youtubeMetadata = buildYoutubeVideoMetadata({
        config,
        renderSummary,
        thumbnailOutput: config.thumbnail ? thumbnailOutput : '',
        metadataOutput: config.thumbnail && config.keepThumbnailMetadata ? metadataOutput : '',
        companionWebmOutput,
        eventMarkersOutput: config.keepEventMarkers ? eventMarkersOutput : '',
        thumbnailAudit,
      });
      mkdirSync(path.dirname(youtubeMetadataOutput), { recursive: true });
      writeFileSync(youtubeMetadataOutput, `${JSON.stringify(youtubeMetadata, null, 2)}\n`);
      log(`YouTube metadata: ${youtubeMetadataOutput}`);
      log(`YouTube title: ${youtubeMetadata.title}`);
      log(`YouTube title type: ${youtubeMetadata.titleType}; avoided recent types: ${youtubeMetadata.recentTitleTypesAvoided.join(', ') || 'none'}`);
      if (config.uploadYoutube) {
        if (!config.thumbnail) fail('YouTube upload requested but thumbnail generation is disabled. Enable --thumbnail=true so the upload has a thumbnail file.');
        progress('youtube-upload', `${config.youtubePrivacy} ${youtubeMetadata.title}`);
        const uploadOutput = path.resolve(config.youtubeUploadOutput || `${config.output.replace(/\.[^.]+$/, '')}.youtube-upload.json`);
        const uploadArgs = [
          'scripts/upload-youtube-bundle.js',
          `--video=${config.output}`,
          `--thumbnail=${thumbnailOutput}`,
          `--metadata=${youtubeMetadataOutput}`,
          `--privacy=${config.youtubePrivacy}`,
          `--output=${uploadOutput}`,
        ];
        if (config.youtubeUploadToken) uploadArgs.push(`--token=${config.youtubeUploadToken}`);
        run('node', uploadArgs);
        if (!existsSync(uploadOutput) || statSync(uploadOutput).size <= 0) fail(`YouTube upload record was not created: ${uploadOutput}`);
        log(`YouTube upload record: ${uploadOutput}`);
      }
    } else if (config.uploadYoutube) {
      fail('YouTube upload requested but metadata generation is disabled. Enable --youtube-metadata=true.');
    }
  }
  if (!config.keepWebm) rmSync(videoDir, { recursive: true, force: true });
  progress('done', config.output);
  log(`Done: ${config.output}`);
}

if (process.env.MARBLE_RENDER_TEST_TITLE_HISTORY === 'true') {
  const recentTitles = readYoutubeTitleHistory(process.env.MARBLE_RENDER_YOUTUBE_TITLE_HISTORY || recordingsDir, Number(process.env.MARBLE_RENDER_YOUTUBE_TITLE_HISTORY_LIMIT || 10));
  const isShortsTest = process.env.MARBLE_RENDER_TEST_YOUTUBE_KIND === 'shorts' || process.env.MARBLE_RENDER_VIDEO_CANVAS === 'vertical';
  const titleContext = { fallbackTitle: '30 Marbles, 10 Races, Total Chaos!', recentTitles, historyLimit: 30, mode: process.env.MARBLE_RENDER_MODE || 'continuous' };
  const titleResult = isShortsTest
    ? makeSeoShortsVideoTitle(process.env.MARBLE_RENDER_TEST_BASE_TITLE || '8 Races, 30 Marbles!', titleContext)
    : makeSeoLongVideoTitle(process.env.MARBLE_RENDER_TEST_BASE_TITLE || '8 Races, 30 Marbles!', titleContext);
  const metadata = buildYoutubeVideoMetadata({
    config,
    renderSummary: {
      raceCount: config.multipleRaceCount,
      marbleCount: config.cupSize,
      cupName: config.cupName,
      title: process.env.MARBLE_RENDER_TEST_BASE_TITLE || '8 Races, 30 Marbles!',
    },
  });
  process.stdout.write(`${JSON.stringify({
    title: titleResult.title,
    titleType: titleResult.titleType || classifyYoutubeTitleType(titleResult.title),
    titleStrategy: titleResult.titleStrategy || '',
    titleTemplate: titleResult.titleTemplate || '',
    titleKeyword: titleResult.titleKeyword || '',
    titleEventKind: titleResult.titleEventKind || '',
    dedupeReason: titleResult.dedupeReason || '',
    description: metadata.description,
    descriptionTemplate: metadata.source?.descriptionTemplate || '',
    hashtags: metadata.hashtags || [],
    recentTitleTypesAvoided: [...new Set(recentTitles.map((item) => item.titleType))],
  }, null, 2)}\n`);
  process.exit(0);
}

main()
  .then(() => {
    // Playwright/Chromium can leave internal handles alive after a bounded browser.close()
    // timeout. At this point the render has logged Done and written all outputs, so exit
    // explicitly so dashboard child tracking can mark the job completed instead of
    // showing a stale running process.
    process.exit(0);
  })
  .catch((error) => fail('Unhandled render failure', error));
