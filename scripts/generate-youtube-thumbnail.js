import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

const cliArgs = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) cliArgs.set(match[1], match[2]);
  else if (arg.startsWith('--')) cliArgs.set(arg.slice(2), 'true');
}

const rootDir = process.cwd();
const recordingsDir = path.join(rootDir, 'recordings');
const defaultOutputFor = (videoPath) => path.resolve(`${videoPath.replace(/\.[^.]+$/, '')}.thumbnail.jpg`);

export function buildThumbnailConfig(args = cliArgs, env = process.env) {
  const input = path.resolve(args.get('input') || args.get('video') || env.MARBLE_THUMBNAIL_INPUT || '');
  const output = args.get('output') || env.MARBLE_THUMBNAIL_OUTPUT || '';
  const config = {
    input,
    output,
    title: args.get('title') || env.MARBLE_THUMBNAIL_TITLE || '',
    metadata: args.get('metadata') || env.MARBLE_THUMBNAIL_METADATA || '',
    width: Number(args.get('width') || env.MARBLE_THUMBNAIL_WIDTH || 1280),
    height: Number(args.get('height') || env.MARBLE_THUMBNAIL_HEIGHT || 720),
    maxWords: Number(args.get('max-words') || env.MARBLE_THUMBNAIL_MAX_WORDS || 6),
    frameStrategy: args.get('frame-strategy') || env.MARBLE_THUMBNAIL_FRAME_STRATEGY || 'early-highlight',
    noProbeLog: args.get('quiet') === 'true' || env.MARBLE_THUMBNAIL_QUIET === 'true',
    safeCrop: args.get('safe-crop') || env.MARBLE_THUMBNAIL_SAFE_CROP || 'hud-safe',
    fontFamily: args.get('font-family') || env.MARBLE_THUMBNAIL_FONT_FAMILY || 'Comic Sans MS, Chalkboard, Impact, Arial Black, fantasy',
  };
  config.output = path.resolve(config.output || defaultOutputFor(config.input || path.join(recordingsDir, 'thumbnail-source.webm')));
  config.width = Number.isFinite(config.width) ? Math.max(320, Math.min(3840, Math.round(config.width))) : 1280;
  config.height = Number.isFinite(config.height) ? Math.max(180, Math.min(2160, Math.round(config.height))) : 720;
  config.maxWords = Number.isFinite(config.maxWords) ? Math.max(2, Math.min(10, Math.round(config.maxWords))) : 6;
  return config;
}

const log = (...parts) => console.log('[thumbnail]', ...parts);
const fail = (message, error = null) => {
  console.error('[thumbnail] ERROR:', message);
  if (error) console.error(error);
  process.exit(1);
};
const commandExists = (command) => spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' }).status === 0;
const run = (command, commandArgs, options = {}) => {
  log(`$ ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, { cwd: rootDir, stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`${command} exited with ${result.status}`);
};
const ffprobeJson = (file) => JSON.parse(execFileSync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration:stream=width,height',
  '-of', 'json',
  file,
], { encoding: 'utf8' }));

function readMetadata(metadataPath) {
  if (!metadataPath) return null;
  const resolved = path.resolve(metadataPath);
  if (!existsSync(resolved)) fail(`metadata file not found: ${resolved}`);
  try {
    return JSON.parse(execFileSync('node', ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(resolved)}, 'utf8'))`], { encoding: 'utf8' }));
  } catch (error) {
    fail(`could not parse metadata JSON: ${resolved}`, error);
  }
  return null;
}

export function normalizeEvents(metadata) {
  const raw = metadata?.thumbnailEvents || metadata?.broadcastEvents || metadata?.events || metadata?.replayHighlightSelection || [];
  return Array.isArray(raw) ? raw.filter(Boolean).map((event, index) => ({ ...event, __index: index })) : [];
}

function getDurationSeconds(videoPath) {
  try {
    const probe = ffprobeJson(videoPath);
    const duration = Number(probe?.format?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch (error) {
    console.warn('[thumbnail] Could not ffprobe duration:', error?.message || error);
    return 0;
  }
}

export function pickEarlyHighlightFrame({ events, durationSeconds }) {
  const usableDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const earlyLimit = usableDuration > 0 ? Math.max(8, Math.min(usableDuration * 0.45, 90)) : 90;
  const minimumTime = 1.2;
  const priority = {
    overtake: 100,
    battle: 94,
    obstacle: 88,
    leader: 82,
    speed: 78,
    progress: 74,
    finish: 60,
    winner: 48,
    complete: 30,
    dnf: 25,
    general: 10,
  };
  const scored = events
    .map((event) => {
      const rawTime = Number(event.time ?? event.elapsed ?? event.seconds ?? event.at ?? event.timestamp);
      const time = Number.isFinite(rawTime) ? rawTime : null;
      const kind = String(event.kind || 'general');
      const title = `${event.title || ''} ${event.detail || ''}`;
      const titleBonus = /overtake|neck|battle|target|buff|speed|burst|leader/i.test(title) ? 8 : 0;
      const progress = Number(event.progress);
      const progressBonus = Number.isFinite(progress) && progress <= 0.45 ? 8 : Number.isFinite(progress) && progress <= 0.65 ? 2 : 0;
      const earlyPenalty = time != null && time > earlyLimit ? (time - earlyLimit) * 1.8 : 0;
      return {
        event,
        time,
        score: (priority[kind] ?? priority.general) + titleBonus + progressBonus - earlyPenalty,
      };
    })
    .filter((item) => item.time != null && item.time >= minimumTime && (!usableDuration || item.time < usableDuration - 0.5))
    .sort((a, b) => (b.score - a.score) || (a.time - b.time) || (a.event.__index - b.event.__index));

  const earlyScored = scored.filter((item) => item.time <= earlyLimit);
  const chosen = earlyScored[0] || scored[0] || null;
  if (chosen) {
    return {
      seconds: Math.max(0.8, Math.min(chosen.time + 0.15, usableDuration ? Math.max(0.8, usableDuration - 0.5) : chosen.time + 0.15)),
      reason: `early-highlight:${chosen.event.kind || 'general'}:${chosen.event.title || ''}`,
      event: chosen.event,
      earlyLimit,
    };
  }
  const fallback = usableDuration > 0 ? Math.max(1, Math.min(usableDuration * 0.28, 20)) : 2;
  return { seconds: fallback, reason: 'fallback-early-video-position', event: null, earlyLimit };
}

export function sanitizeTitle(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();
}

export function titleFromMetadata(metadata, events) {
  const direct = metadata?.thumbnailTitle || metadata?.title || metadata?.cupName || metadata?.videoTitle || '';
  if (direct) return direct;
  const winner = metadata?.winner || metadata?.champion || metadata?.podium?.[0]?.name || '';
  if (winner) return `${winner} Wins Big`;
  const firstHighlight = events.find((event) => ['overtake', 'battle', 'obstacle', 'speed', 'leader'].includes(event.kind));
  if (firstHighlight?.kind === 'overtake') return 'Huge Early Overtake';
  if (firstHighlight?.kind === 'battle') return 'Insane Marble Battle';
  if (firstHighlight?.kind === 'obstacle') return 'Crazy Obstacle Hit';
  if (firstHighlight?.kind === 'speed') return 'Speed Burst Madness';
  return 'Epic Marble Race';
}

export function compactTitle(title, maxWords = 6) {
  const cleaned = sanitizeTitle(title).replace(/[^\p{L}\p{N} &'!-]+/gu, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return 'EPIC MARBLE RACE';
  return words.slice(0, maxWords).join(' ').toUpperCase();
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function splitTitleLines(title) {
  const words = sanitizeTitle(title).toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return ['EPIC', 'MARBLE RACE'];
  if (words.length === 1) return [words[0]];
  const totalChars = words.join('').length;
  const targetLines = words.length >= 7 || totalChars >= 32 ? 3 : 2;
  const totalLength = words.reduce((sum, word) => sum + word.length, 0) + Math.max(0, words.length - 1);
  const targetLength = Math.ceil(totalLength / targetLines);
  const lines = [];
  let current = [];
  let currentLength = 0;
  words.forEach((word, index) => {
    const remainingWords = words.length - index;
    const remainingLines = targetLines - lines.length;
    const wordLength = word.length + (current.length ? 1 : 0);
    const shouldBreak = current.length
      && lines.length < targetLines - 1
      && currentLength + wordLength > targetLength
      && remainingWords >= remainingLines;
    if (shouldBreak) {
      lines.push(current.join(' '));
      current = [word];
      currentLength = word.length;
    } else {
      current.push(word);
      currentLength += wordLength;
    }
  });
  if (current.length) lines.push(current.join(' '));
  return lines.filter(Boolean);
}

export function pickLineColors(title) {
  const palettes = [
    ['#fff38a', '#9ff7ff', '#ffd6f4'],
    ['#ffd6f4', '#b8ffb0', '#ffe59d'],
    ['#ffe0a3', '#c7d8ff', '#cffff1'],
    ['#fff7c2', '#ffb9d8', '#b8ffb0'],
    ['#cffff1', '#ffe59d', '#ffd6f4'],
  ];
  return palettes[hashString(title) % palettes.length];
}

export function computeThumbnailTextStyle({ title, width, height }) {
  const lines = splitTitleLines(title);
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const lineCount = lines.length;
  const widthRatio = lineCount >= 3 ? 0.56 : 0.62;
  const heightRatio = lineCount >= 3 ? 0.195 : 0.235;
  const maxFontSize = lineCount >= 3 ? 142 : 156;
  const byWidth = Math.floor((width * widthRatio) / Math.max(longest, 4) * 1.72);
  const byHeight = Math.floor(height * heightRatio);
  const fontSize = Math.max(66, Math.min(maxFontSize, byWidth, byHeight));
  return { lines, colors: pickLineColors(title), fontSize };
}

export function makeFilter({ width, height, safeCrop = 'hud-safe' }) {
  const mode = String(safeCrop || '').toLowerCase();
  const cropProfiles = {
    none: { zoom: 1, x: 0.5, y: 0.5 },
    off: { zoom: 1, x: 0.5, y: 0.5 },
    center: { zoom: 1.12, x: 0.5, y: 0.5 },
    'hud-safe': { zoom: 1.65, x: 0.20, y: 0.30 },
  };
  const profile = cropProfiles[mode] || cropProfiles['hud-safe'];
  const scaledWidth = Math.round(width * profile.zoom);
  const scaledHeight = Math.round(height * profile.zoom);
  const maxX = Math.max(0, scaledWidth - width);
  const maxY = Math.max(0, scaledHeight - height);
  const cropX = Math.round(maxX * profile.x);
  const cropY = Math.round(maxY * profile.y);
  return [
    `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}:${cropX}:${cropY}`,
    'eq=saturation=1.28:contrast=1.08:brightness=0.015',
    'format=yuv420p',
  ].join(',');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function makeThumbnailHtml({ framePath, title, width, height, fontFamily }) {
  const frameUrl = pathToFileURL(framePath).href;
  const { lines, colors, fontSize } = computeThumbnailTextStyle({ title, width, height });
  const strokeWidth = Math.round(fontSize * 0.055);
  const softShadow = Math.round(fontSize * 0.035);
  const rowGap = Math.round(fontSize * (lines.length >= 3 ? -0.15 : -0.08));
  const topOffset = Math.round(height * (lines.length >= 3 ? 0.015 : 0.05));
  const renderedLines = lines.map((line, index) => `<span class=\"title-line title-line-${index + 1}\">${escapeHtml(line)}<\/span>`).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
.stage { position: relative; width: ${width}px; height: ${height}px; font-family: ${fontFamily}; }
.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.10) contrast(1.04); }
.band { position: absolute; left: 0; right: 0; top: 33%; height: 34%; background: linear-gradient(90deg, rgba(0,0,0,.10), rgba(0,0,0,.23), rgba(0,0,0,.06)); }
.title {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: ${rowGap}px; padding: 26px 78px; box-sizing: border-box; transform: translateY(${topOffset}px) rotate(-7deg);
  font-size: ${fontSize}px; line-height: .84; font-weight: 1000; letter-spacing: -0.055em; text-transform: uppercase;
}
.title-line {
  display: block; white-space: nowrap; max-width: 58%; padding: 0 .06em;
  -webkit-text-stroke: ${strokeWidth}px #5b2a00;
  text-shadow: 0 ${softShadow}px 0 rgba(255,132,0,.70), 0 0 ${Math.round(fontSize * 0.11)}px rgba(255,255,255,.38);
  filter: drop-shadow(0 ${Math.round(fontSize * 0.035)}px ${Math.round(fontSize * 0.025)}px rgba(0,0,0,.34));
}
.title-line-1 { align-self: flex-start; margin-left: ${lines.length >= 3 ? 7 : 9}%; color: ${colors[0]}; }
.title-line-2 { align-self: center; color: ${colors[1] || colors[0]}; }
.title-line-3 { align-self: flex-end; margin-right: 7%; color: ${colors[2] || colors[0]}; }
.title:not(:has(.title-line-3)) .title-line-2 { align-self: flex-end; margin-right: 9%; }
</style></head><body><div class="stage"><img class="bg" src="${frameUrl}"><div class="band"></div><div class="title">${renderedLines}</div></div></body></html>`;
}

export function buildThumbnailPlan({ config, metadata = {}, durationSeconds }) {
  const events = normalizeEvents(metadata);
  const frame = config.frameStrategy === 'early-highlight'
    ? pickEarlyHighlightFrame({ events, durationSeconds })
    : { seconds: Math.max(1, Math.min(durationSeconds * 0.28 || 2, 20)), reason: `strategy:${config.frameStrategy}`, event: null };
  const rawTitle = config.title || titleFromMetadata(metadata, events);
  const title = compactTitle(rawTitle, config.maxWords);
  const filter = makeFilter({ width: config.width, height: config.height, safeCrop: config.safeCrop });
  return { events, frame, rawTitle, title, filter };
}

async function renderHtmlToJpeg({ htmlPath, output, width, height }) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
    await page.screenshot({ path: output, type: 'jpeg', quality: 92, fullPage: false });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function main() {
  const config = buildThumbnailConfig();
  if (!config.input || config.input === path.resolve('')) fail('input video is required: --input=recordings/video.webm');
  if (!existsSync(config.input)) fail(`input video not found: ${config.input}`);
  if (!commandExists('ffmpeg')) fail('ffmpeg is required. Install it first, e.g. `brew install ffmpeg`.');
  if (!commandExists('ffprobe')) fail('ffprobe is required. Install it first, e.g. `brew install ffmpeg`.');
  mkdirSync(path.dirname(config.output), { recursive: true });

  const metadata = readMetadata(config.metadata) || {};
  const durationSeconds = getDurationSeconds(config.input);
  const { events, frame, title, filter } = buildThumbnailPlan({ config, metadata, durationSeconds });
  const workDir = path.join(path.dirname(config.output), `.thumbnail-work-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(workDir, { recursive: true });
  const framePath = path.join(workDir, 'frame.jpg');
  const htmlPath = path.join(workDir, 'thumbnail.html');

  const summary = {
    input: config.input,
    output: config.output,
    width: config.width,
    height: config.height,
    title,
    frameSeconds: Number(frame.seconds.toFixed(3)),
    frameReason: frame.reason,
    selectedEvent: frame.event ? { title: frame.event.title, detail: frame.event.detail, kind: frame.event.kind, time: frame.event.time, progress: frame.event.progress } : null,
    eventCount: events.length,
    durationSeconds: Number(durationSeconds.toFixed(3)),
    fontFamily: config.fontFamily,
    safeCrop: config.safeCrop,
    filter,
  };
  if (!config.noProbeLog) log('Plan:', JSON.stringify(summary));

  try {
    run('ffmpeg', [
      '-y',
      '-ss', String(Math.max(0, frame.seconds)),
      '-i', config.input,
      '-frames:v', '1',
      '-vf', filter,
      '-q:v', '2',
      framePath,
    ]);
    writeFileSync(htmlPath, makeThumbnailHtml({ framePath, title, width: config.width, height: config.height, fontFamily: config.fontFamily }));
    await renderHtmlToJpeg({ htmlPath, output: config.output, width: config.width, height: config.height });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  if (!existsSync(config.output) || statSync(config.output).size <= 0) fail(`thumbnail was not created: ${config.output}`);
  writeFileSync(`${config.output}.json`, `${JSON.stringify(summary, null, 2)}\n`);
  log(`Done: ${config.output}`);
}

if (isMainModule) main().catch((error) => fail('Unhandled thumbnail failure', error));
