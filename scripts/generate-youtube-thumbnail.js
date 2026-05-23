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
    frameStrategy: args.get('frame-strategy') || env.MARBLE_THUMBNAIL_FRAME_STRATEGY || 'mid-highlight',
    noProbeLog: args.get('quiet') === 'true' || env.MARBLE_THUMBNAIL_QUIET === 'true',
    safeCrop: args.get('safe-crop') || env.MARBLE_THUMBNAIL_SAFE_CROP || 'hud-safe',
    fontFamily: args.get('font-family') || env.MARBLE_THUMBNAIL_FONT_FAMILY || 'Comic Sans MS, Chalkboard, Impact, Arial Black, fantasy',
    textPosition: args.get('text-position') || env.MARBLE_THUMBNAIL_TEXT_POSITION || 'auto',
    badgeText: args.get('badge-text') || env.MARBLE_THUMBNAIL_BADGE_TEXT || '',
    hideBadge: args.get('hide-badge') === 'true' || env.MARBLE_THUMBNAIL_HIDE_BADGE === 'true',
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
  const raw = metadata?.thumbnailCandidates || metadata?.thumbnailEvents || metadata?.eventMarkers || metadata?.broadcastEvents || metadata?.events || metadata?.replayHighlightSelection || [];
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

export function pickFirstRaceThirtyPercentFrame({ events, durationSeconds }) {
  const usableDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const firstRaceEvents = events.filter((event) => {
    const raceIndex = Number(event.activeRaceIndex ?? event.raceIndex ?? event.race ?? event.racesCompleted + 1);
    return !Number.isFinite(raceIndex) || raceIndex === 1;
  });
  const sourceEvents = firstRaceEvents.length ? firstRaceEvents : events;
  const times = sourceEvents
    .map((event) => Number(event.suggestedFrameSeconds ?? event.time ?? event.elapsed ?? event.seconds ?? event.at ?? event.timestamp))
    .filter((time) => Number.isFinite(time) && time > 0);
  const firstRaceEnd = times.length ? Math.max(...times) : (usableDuration > 0 ? Math.min(usableDuration * 0.18, 120) : 0);
  const targetTime = firstRaceEnd > 0 ? Math.max(1.2, firstRaceEnd * 0.30) : 2;
  const windowStart = Math.max(1.2, targetTime - Math.max(1.5, firstRaceEnd * 0.18));
  const windowEnd = Math.max(windowStart + 0.5, targetTime + Math.max(2, firstRaceEnd * 0.22));
  const priority = {
    overtake: 100,
    battle: 94,
    obstacle: 90,
    leader: 84,
    speed: 80,
    progress: 74,
    finish: 42,
    winner: 34,
    complete: 24,
    dnf: 18,
    general: 10,
  };
  const scored = sourceEvents
    .map((event) => {
      const rawTime = Number(event.suggestedFrameSeconds ?? event.time ?? event.elapsed ?? event.seconds ?? event.at ?? event.timestamp);
      const time = Number.isFinite(rawTime) ? rawTime : null;
      const kind = String(event.kind || 'general');
      const title = `${event.title || ''} ${event.detail || ''}`;
      const progress = Number(event.progress);
      const progressDistance = Number.isFinite(progress) ? Math.abs(progress - 0.30) : 0.18;
      const targetDistance = time != null ? Math.abs(time - targetTime) : Number.POSITIVE_INFINITY;
      const windowBonus = time != null && time >= windowStart && time <= windowEnd ? 34 : 0;
      const progressBonus = Number.isFinite(progress) ? Math.max(0, 18 - progressDistance * 70) : 0;
      const titleBonus = /overtake|neck|battle|target|buff|speed|burst|leader|hit|chaos|blast/i.test(title) ? 9 : 0;
      const latePenalty = usableDuration && time != null && time > usableDuration - 0.5 ? 999 : 0;
      return {
        event,
        time,
        score: (priority[kind] ?? priority.general) + windowBonus + progressBonus + titleBonus - targetDistance * 1.2 - latePenalty,
      };
    })
    .filter((item) => item.time != null && item.time >= 1.2 && (!usableDuration || item.time < usableDuration - 0.5))
    .sort((a, b) => (b.score - a.score) || Math.abs(a.time - targetTime) - Math.abs(b.time - targetTime) || (a.event.__index - b.event.__index));

  const chosen = scored[0] || null;
  if (chosen) {
    return {
      seconds: Math.max(0.8, Math.min(chosen.time + 0.15, usableDuration ? Math.max(0.8, usableDuration - 0.5) : chosen.time + 0.15)),
      reason: `first-race-30pct:${chosen.event.kind || 'general'}:${chosen.event.title || ''}`,
      event: chosen.event,
      targetTime: Number(targetTime.toFixed(3)),
      firstRaceEnd: Number(firstRaceEnd.toFixed(3)),
    };
  }
  const fallback = usableDuration > 0 ? Math.max(1, Math.min(usableDuration * 0.08, 20)) : 2;
  return { seconds: fallback, reason: 'fallback-first-race-30pct', event: null, targetTime, firstRaceEnd };
}

export function pickMidHighlightFrame({ events, durationSeconds }) {
  const usableDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const targetTime = usableDuration > 0 ? Math.max(1.2, usableDuration * 0.50) : 0;
  const priority = {
    overtake: 130,
    battle: 120,
    obstacle: 112,
    leader: 82,
    speed: 76,
    progress: 64,
    finish: 38,
    winner: 30,
    complete: 20,
    dnf: 14,
    general: 8,
  };
  const scored = events
    .map((event) => {
      const rawTime = Number(event.suggestedFrameSeconds ?? event.time ?? event.elapsed ?? event.seconds ?? event.at ?? event.timestamp);
      const time = Number.isFinite(rawTime) ? rawTime : null;
      const kind = String(event.kind || 'general');
      const text = `${event.title || ''} ${event.detail || ''}`;
      const progress = Number(event.progress);
      const progressDistance = Number.isFinite(progress) ? Math.abs(progress - 0.50) : 0.20;
      const timeDistance = targetTime > 0 && time != null ? Math.abs(time - targetTime) : 0;
      const preferredKindBonus = ['overtake', 'battle', 'obstacle'].includes(kind) ? 48 : 0;
      const obstacleHitBonus = kind === 'obstacle' && /hit|obstacle|chaos|blast|kick|snap|collision/i.test(text) ? 18 : 0;
      const textBonus = /overtake|battle|neck|hit|obstacle|chaos|blast|kick|snap|collision/i.test(text) ? 12 : 0;
      const progressBonus = Number.isFinite(progress) ? Math.max(0, 36 - progressDistance * 120) : 0;
      const midpointBonus = targetTime > 0 ? Math.max(0, 42 - timeDistance * 1.4) : 0;
      const latePenalty = usableDuration && time != null && time > usableDuration - 0.5 ? 999 : 0;
      return {
        event,
        time,
        score: (priority[kind] ?? priority.general) + preferredKindBonus + obstacleHitBonus + textBonus + progressBonus + midpointBonus - timeDistance * 0.18 - latePenalty,
      };
    })
    .filter((item) => item.time != null && item.time >= 1.2 && (!usableDuration || item.time < usableDuration - 0.5))
    .sort((a, b) => (b.score - a.score) || Math.abs((a.time || 0) - targetTime) - Math.abs((b.time || 0) - targetTime) || (a.event.__index - b.event.__index));

  const chosen = scored[0] || null;
  if (chosen) {
    return {
      seconds: Math.max(0.8, Math.min(chosen.time + 0.15, usableDuration ? Math.max(0.8, usableDuration - 0.5) : chosen.time + 0.15)),
      reason: `mid-highlight:${chosen.event.kind || 'general'}:${chosen.event.title || ''}`,
      event: chosen.event,
      targetTime: Number(targetTime.toFixed(3)),
      score: Number(chosen.score.toFixed(2)),
    };
  }
  const fallback = usableDuration > 0 ? Math.max(1, Math.min(usableDuration * 0.50, Math.max(1, usableDuration - 0.5))) : 2;
  return { seconds: fallback, reason: 'fallback-mid-video-position', event: null, targetTime };
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
      const rawTime = Number(event.suggestedFrameSeconds ?? event.time ?? event.elapsed ?? event.seconds ?? event.at ?? event.timestamp);
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
  if (words.length === 1) return [words[0], 'RACE'];
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
  while (lines.length < 2 && words.length >= 2) {
    const line = lines.pop() || '';
    const lineWords = line.split(/\s+/).filter(Boolean);
    if (lineWords.length < 2) {
      lines.push(line, 'RACE');
      break;
    }
    const pivot = Math.max(1, Math.ceil(lineWords.length / 2));
    lines.push(lineWords.slice(0, pivot).join(' '), lineWords.slice(pivot).join(' '));
  }
  return lines.filter(Boolean).slice(0, 3);
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
  const widthRatio = lineCount >= 3 ? 0.70 : 0.68;
  const heightRatio = lineCount >= 3 ? 0.18 : 0.205;
  const maxFontSize = lineCount >= 3 ? 132 : 152;
  const byWidth = Math.floor((width * widthRatio) / Math.max(longest, 4) * 1.55);
  const byHeight = Math.floor(height * heightRatio);
  const fontSize = Math.max(72, Math.min(maxFontSize, byWidth, byHeight));
  return { lines, colors: pickLineColors(title), fontSize };
}

function parsePpmPixels(buffer) {
  const text = buffer.toString('latin1');
  const match = text.match(/^P6\s+(?:#.*\s+)*(\d+)\s+(\d+)\s+(\d+)\s/);
  if (!match) return null;
  const headerLength = match[0].length;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    max: Number(match[3]),
    data: buffer.subarray(headerLength),
  };
}

export function analyzeFrameLayout(framePath, width, height) {
  try {
    const result = spawnSync('ffmpeg', ['-v', 'error', '-i', framePath, '-vf', 'scale=32:18', '-f', 'image2pipe', '-vcodec', 'ppm', '-'], { encoding: null, maxBuffer: 1024 * 1024 });
    if (result.status !== 0 || !result.stdout?.length) throw new Error('ffmpeg frame analysis failed');
    const ppm = parsePpmPixels(result.stdout);
    if (!ppm) throw new Error('could not parse ppm');
    const zones = [
      { key: 'left', x0: 0, x1: 12, y0: 2, y1: 16, css: { left: Math.round(width * 0.045), top: Math.round(height * 0.10), width: Math.round(width * 0.62), align: 'left' } },
      { key: 'right', x0: 20, x1: 32, y0: 2, y1: 16, css: { left: Math.round(width * 0.36), top: Math.round(height * 0.10), width: Math.round(width * 0.60), align: 'right' } },
      { key: 'top', x0: 4, x1: 28, y0: 0, y1: 8, css: { left: Math.round(width * 0.08), top: Math.round(height * 0.05), width: Math.round(width * 0.84), align: 'center' } },
      { key: 'bottom', x0: 3, x1: 29, y0: 10, y1: 18, css: { left: Math.round(width * 0.08), top: Math.round(height * 0.50), width: Math.round(width * 0.84), align: 'center' } },
    ];
    const scoreZone = (zone) => {
      let count = 0;
      let brightness = 0;
      let edge = 0;
      for (let y = zone.y0; y < zone.y1; y += 1) {
        for (let x = zone.x0; x < zone.x1; x += 1) {
          const index = (y * ppm.width + x) * 3;
          const r = ppm.data[index] || 0;
          const g = ppm.data[index + 1] || 0;
          const b = ppm.data[index + 2] || 0;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          brightness += luma;
          const right = x + 1 < ppm.width ? (y * ppm.width + x + 1) * 3 : index;
          const down = y + 1 < ppm.height ? ((y + 1) * ppm.width + x) * 3 : index;
          edge += Math.abs(r - (ppm.data[right] || r)) + Math.abs(g - (ppm.data[right + 1] || g)) + Math.abs(b - (ppm.data[right + 2] || b));
          edge += Math.abs(r - (ppm.data[down] || r)) + Math.abs(g - (ppm.data[down + 1] || g)) + Math.abs(b - (ppm.data[down + 2] || b));
          count += 1;
        }
      }
      const avgBrightness = brightness / Math.max(1, count);
      const avgEdge = edge / Math.max(1, count);
      return { ...zone, avgBrightness, avgEdge, score: avgBrightness * 0.55 + avgEdge * 0.45 };
    };
    const ranked = zones.map(scoreZone).sort((a, b) => a.score - b.score);
    const selected = ranked[0];
    return { selected: selected.key, css: selected.css, zones: ranked.map(({ key, avgBrightness, avgEdge, score }) => ({ key, avgBrightness: Number(avgBrightness.toFixed(1)), avgEdge: Number(avgEdge.toFixed(1)), score: Number(score.toFixed(1)) })) };
  } catch (error) {
    return { selected: 'left', css: { left: Math.round(width * 0.045), top: Math.round(height * 0.10), width: Math.round(width * 0.62), align: 'left' }, zones: [], error: error?.message || String(error) };
  }
}

export function makeFilter({ width, height, safeCrop = 'hud-safe' }) {
  const mode = String(safeCrop || '').toLowerCase();
  const cropProfiles = {
    none: { zoom: 1, x: 0.5, y: 0.5 },
    off: { zoom: 1, x: 0.5, y: 0.5 },
    center: { zoom: 1.12, x: 0.5, y: 0.5 },
    'hud-safe': { zoom: 1.65, x: 0.20, y: 0.30 },
    'composite-center': { zoom: 1.55, x: 0.50, y: 0.52 },
    'composite-no-live-event': { zoom: 1.75, x: 0.40, y: 0.58 },
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

function formatDurationBadge(durationSeconds) {
  const seconds = Number(durationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} SEC`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} MIN`;
}

export function makeThumbnailHtml({ framePath, title, width, height, fontFamily, layout = null, badgeText = '' }) {
  const frameUrl = pathToFileURL(framePath).href;
  const { lines, colors, fontSize } = computeThumbnailTextStyle({ title, width, height });
  const centeredPlacement = { left: Math.round(width * 0.07), top: Math.round(height * 0.50), width: Math.round(width * 0.86), align: 'center' };
  const placement = layout?.css || centeredPlacement;
  const strokeWidth = Math.max(5, Math.round(fontSize * 0.065));
  const softShadow = Math.round(fontSize * 0.045);
  const rowGap = Math.round(fontSize * (lines.length >= 3 ? 0.03 : 0.13));
  const renderedLines = lines.map((line, index) => `<span class=\"title-line title-line-${index + 1}\">${escapeHtml(line)}<\/span>`).join('');
  const lineCss = lines.map((line, index) => {
    const offset = index % 2 === 0 ? -Math.round(width * 0.015) : Math.round(width * 0.018);
    return `.title-line-${index + 1} { color: ${colors[index] || colors[0]}; transform: translateX(${offset}px); }`;
  }).join('\n');
  const badgeVisible = Boolean(badgeText) && lines.length <= 2;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
.stage { position: relative; width: ${width}px; height: ${height}px; font-family: ${fontFamily}; }
.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.10) contrast(1.04); }
.title {
  position: absolute; left: ${placement.left}px; top: ${placement.top}px; width: ${placement.width}px;
  display: flex; flex-direction: column; align-items: center;
  gap: ${rowGap}px; box-sizing: border-box; transform: translateY(-50%) rotate(-5deg);
  font-size: ${fontSize}px; line-height: .88; font-weight: 1000; letter-spacing: -0.058em; text-transform: uppercase; text-align: center;
}
.title-line {
  display: block; white-space: nowrap; padding: 0 .06em;
  -webkit-text-stroke: ${strokeWidth}px #4d2200;
  text-shadow: 0 ${softShadow}px 0 rgba(255,132,0,.76), 0 0 ${Math.round(fontSize * 0.16)}px rgba(255,255,255,.46), 0 ${Math.round(fontSize * 0.09)}px ${Math.round(fontSize * 0.08)}px rgba(0,0,0,.54);
  filter: drop-shadow(0 ${Math.round(fontSize * 0.045)}px ${Math.round(fontSize * 0.035)}px rgba(0,0,0,.48));
}
${lineCss}
.badge { display: ${badgeVisible ? 'block' : 'none'}; position: absolute; right: 48px; bottom: 44px; background: rgba(255,222,79,.94); color: #291300; border: 6px solid #4b2100; border-radius: 26px; padding: 10px 24px; font: 900 40px 'Arial Black', Impact, sans-serif; transform: rotate(4deg); box-shadow: 0 8px 0 rgba(0,0,0,.34); }
</style></head><body><div class="stage"><img class="bg" src="${frameUrl}"><div class="title">${renderedLines}</div><div class="badge">${escapeHtml(badgeText)}</div></div></body></html>`;
}

export function buildThumbnailPlan({ config, metadata = {}, durationSeconds }) {
  const events = normalizeEvents(metadata);
  const frame = config.frameStrategy === 'early-highlight'
    ? pickEarlyHighlightFrame({ events, durationSeconds })
    : config.frameStrategy === 'first-race-30pct'
      ? pickFirstRaceThirtyPercentFrame({ events, durationSeconds })
      : config.frameStrategy === 'mid-highlight'
        ? pickMidHighlightFrame({ events, durationSeconds })
        : { seconds: Math.max(1, Math.min(durationSeconds * 0.50 || 2, durationSeconds ? Math.max(1, durationSeconds - 0.5) : 20)), reason: `strategy:${config.frameStrategy}`, event: null };
  const rawTitle = config.title || titleFromMetadata(metadata, events);
  const title = compactTitle(rawTitle, config.maxWords);
  const filter = makeFilter({ width: config.width, height: config.height, safeCrop: config.safeCrop });
  const badgeText = config.hideBadge ? '' : (config.badgeText || formatDurationBadge(durationSeconds));
  return { events, frame, rawTitle, title, filter, badgeText };
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
  const { events, frame, title, filter, badgeText } = buildThumbnailPlan({ config, metadata, durationSeconds });
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
    badgeText,
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
    const layout = { selected: 'center', css: { left: Math.round(config.width * 0.07), top: Math.round(config.height * 0.50), width: Math.round(config.width * 0.86), align: 'center' }, zones: [], fixed: true };
    summary.textLayout = layout;
    if (!config.noProbeLog) log('Text layout:', JSON.stringify(summary.textLayout));
    writeFileSync(htmlPath, makeThumbnailHtml({ framePath, title, width: config.width, height: config.height, fontFamily: config.fontFamily, layout, badgeText }));
    await renderHtmlToJpeg({ htmlPath, output: config.output, width: config.width, height: config.height });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  if (!existsSync(config.output) || statSync(config.output).size <= 0) fail(`thumbnail was not created: ${config.output}`);
  writeFileSync(`${config.output}.json`, `${JSON.stringify(summary, null, 2)}\n`);
  log(`Done: ${config.output}`);
}

if (isMainModule) main().catch((error) => fail('Unhandled thumbnail failure', error));
