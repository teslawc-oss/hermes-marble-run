#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const recordingsDir = path.join(rootDir, 'recordings');
const PORT = Number(process.env.MARBLE_DASHBOARD_PORT || 8888);
const HOST = process.env.MARBLE_DASHBOARD_HOST || '127.0.0.1';
const RENDER_PORT_START = Number(process.env.MARBLE_RENDER_PORT_START || 4300);
const MARBLE_SERVER_HOST = process.env.MARBLE_SERVER_HOST || '127.0.0.1';
const MARBLE_SERVER_PORT = Number(process.env.MARBLE_SERVER_PORT || 5173);
const MARBLE_SERVER_URL = process.env.MARBLE_SERVER_URL || `http://${MARBLE_SERVER_HOST}:${MARBLE_SERVER_PORT}`;

mkdirSync(recordingsDir, { recursive: true });

const OBSTACLE_CATEGORIES = {
  normal: {
    label: '普通障礙物',
    description: '物理方向影響、反彈、旋轉、阻擋等現有 pinball 障礙物。',
  },
  buff: {
    label: '增益類',
    description: '預留給之後加速、保護、分數或能力提升效果。',
  },
  debuff: {
    label: '減益類',
    description: '預留給之後減速、干擾、失控或懲罰效果。',
  },
};

const OBSTACLE_TYPES = [
  { value: 'popBumper', label: 'Pop Bumper', category: 'normal' },
  { value: 'slingshot', label: 'Slingshot', category: 'normal' },
  { value: 'spinnerGate', label: 'Spinner Gate', category: 'normal' },
  { value: 'dropTarget', label: 'Drop Target', category: 'normal' },
];

const OBSTACLE_DISTRIBUTION_MODES = [
  { value: 'random', label: '完全隨機', description: 'Each obstacle independently picks a random enabled type and distance.' },
  { value: 'zoned', label: '障礙物分區', description: 'Track length is split into zones; each zone uses one obstacle type only.' },
];

const BACKGROUND_RECORD_MODES = [
  { value: 'continuous', key: 'multiple', label: 'Multiple', description: 'Background record several single races; regenerate track between races.' },
  { value: 'cup', key: 'cup', label: 'Cup Mode', description: 'Background tournament render using QF / SF / Final timing.' },
];

const DENSITY_PRESETS = [
  { value: 'none', label: 'None / 無' },
  { value: 'standard', label: 'Standard / 標準' },
  { value: 'many', label: 'Many / 多' },
  { value: 'extreme', label: 'Extreme / 高密度' },
];

const CUP_STAGE_TRACK_LENGTHS = {
  'quarter-final': 600,
  'semi-final': 700,
  final: 800,
};
const CUP_STAGE_TRACK_LABEL = 'QF 600m / SF 700m / Final 800m';
const CUP_VIDEO_DEFAULTS = {
  targetSeconds: 600,
  targetMinutes: 10,
  trackLength: CUP_STAGE_TRACK_LENGTHS['quarter-final'],
  stageTrackLengths: CUP_STAGE_TRACK_LENGTHS,
  maxRaceSeconds: 240,
  timeout: 1800,
  label: '10-minute Cup default used by dashboard and background Playwright renders',
};

const jobs = new Map();
let nextJobId = 1;
let nextRenderPort = RENDER_PORT_START;

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function htmlResponse(res, body) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function notFound(res) {
  jsonResponse(res, 404, { ok: false, error: 'not-found' });
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('request-too-large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function safeSlug(value, fallback = 'marble-cup') {
  const slug = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function normalizeOptions(input = {}) {
  const cupName = String(input.cupName || 'Marble Cup').trim().slice(0, 80) || 'Marble Cup';
  const density = DENSITY_PRESETS.some((item) => item.value === input.density) ? input.density : 'extreme';
  const requestedTypes = Array.isArray(input.obstacleTypes) ? input.obstacleTypes : [];
  const allowedTypes = new Set(OBSTACLE_TYPES.map((item) => item.value));
  const obstacleTypes = requestedTypes.filter((type) => allowedTypes.has(type));
  const format = input.format === 'mp4' ? 'mp4' : 'webm';
  const cupSize = [16, 24, 32].includes(Number(input.cupSize)) ? Number(input.cupSize) : 16;
  const trackLength = Math.max(80, Math.min(3000, Math.round(Number(input.trackLength) || CUP_VIDEO_DEFAULTS.trackLength)));
  const maxRaceSeconds = Math.max(30, Math.min(600, Number(input.maxRaceSeconds) || CUP_VIDEO_DEFAULTS.maxRaceSeconds));
  const timeout = Math.max(120, Math.min(3600, Number(input.timeout) || CUP_VIDEO_DEFAULTS.timeout));
  const audio = input.audio !== false;
  const ttsVoice = String(input.ttsVoice || 'Alex').replace(/[^\w .'-]/g, '').trim().slice(0, 48) || 'Alex';
  const dryRun = input.dryRun === true || input.__dryRun === true;
  const recordMode = BACKGROUND_RECORD_MODES.some((mode) => mode.value === input.recordMode) ? input.recordMode : 'cup';
  const multipleRaceCount = Math.max(1, Math.min(99, Math.round(Number(input.multipleRaceCount) || 5)));
  const obstacleDistribution = OBSTACLE_DISTRIBUTION_MODES.some((mode) => mode.value === input.obstacleDistribution) ? input.obstacleDistribution : 'random';
  return {
    recordMode,
    multipleRaceCount,
    obstacleDistribution,
    cupName,
    density,
    obstacleTypes,
    format,
    cupSize,
    trackLength,
    maxRaceSeconds,
    timeout,
    targetSeconds: CUP_VIDEO_DEFAULTS.targetSeconds,
    targetMinutes: CUP_VIDEO_DEFAULTS.targetMinutes,
    stageTrackLengths: CUP_VIDEO_DEFAULTS.stageTrackLengths,
    stageTrackLabel: CUP_STAGE_TRACK_LABEL,
    audio,
    ttsVoice,
    dryRun,
  };
}

function publicJob(job) {
  const outputExists = Boolean(job.output && existsSync(job.output));
  const size = outputExists ? statSync(job.output).size : 0;
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    signal: job.signal,
    options: job.options,
    output: job.output,
    outputName: job.output ? path.basename(job.output) : null,
    outputExists,
    size,
    renderPort: job.renderPort,
    command: job.command,
    error: job.error,
    log: job.log.slice(-16000),
  };
}

function listRecordings() {
  if (!existsSync(recordingsDir)) return [];
  return readdirSync(recordingsDir)
    .filter((name) => /\.(webm|mp4)$/i.test(name))
    .map((name) => {
      const full = path.join(recordingsDir, name);
      const st = statSync(full);
      return {
        name,
        path: full,
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
        url: `/recordings/${encodeURIComponent(name)}`,
      };
    })
    .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)))
    .slice(0, 30);
}

function startRender(options) {
  const id = String(nextJobId++);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = safeSlug(options.cupName, 'marble-cup');
  const typeSlug = options.obstacleTypes.length ? options.obstacleTypes.join('-') : 'all-obstacles';
  const modeSlug = {
    single: 'single-record',
    continuous: `multiple-${options.multipleRaceCount || 5}`,
    cup: 'cup-mode',
  }[options.recordMode] || 'cup-mode';
  const output = path.join(recordingsDir, `${stamp}-${slug}-${modeSlug}-${options.density}-${typeSlug}.${options.format}`);
  const renderPort = nextRenderPort++;
  const renderUrl = `http://127.0.0.1:${renderPort}`;
  const args = [
    'run', 'render:auto-cup', '--',
    '--no-build',
    `--output=${output}`,
    `--format=${options.format}`,
    `--cup-name=${options.cupName}`,
    `--mode=${options.recordMode}`,
    `--multiple-race-count=${options.multipleRaceCount}`,
    `--cup-size=${options.cupSize}`,
    `--track-length=${options.trackLength}`,
    `--obstacle-preset=${options.density}`,
    `--obstacle-distribution=${options.obstacleDistribution}`,
    `--max-race-seconds=${options.maxRaceSeconds}`,
    `--timeout=${options.timeout}`,
    `--tts-voice=${options.ttsVoice}`,
    `--port=${renderPort}`,
    `--url=${renderUrl}`,
  ];
  if (options.obstacleTypes.length) args.push(`--obstacle-types=${options.obstacleTypes.join(',')}`);
  if (!options.audio) args.push('--audio=false');

  const job = {
    id,
    status: options.dryRun ? 'completed' : 'running',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: options.dryRun ? new Date().toISOString() : null,
    exitCode: options.dryRun ? 0 : null,
    signal: null,
    options,
    output,
    renderPort,
    command: `npm ${args.map((arg) => JSON.stringify(arg)).join(' ')}`,
    log: options.dryRun ? `[dry-run] Would run from ${rootDir}\n[dry-run] ${`npm ${args.map((arg) => JSON.stringify(arg)).join(' ')}`}\n` : '',
    error: null,
    child: null,
  };
  jobs.set(id, job);

  if (options.dryRun) return job;

  const child = spawn('npm', args, {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });
  job.child = child;

  const append = (chunk) => {
    job.log += chunk.toString();
    if (job.log.length > 60000) job.log = job.log.slice(-60000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (error) => {
    job.status = 'failed';
    job.error = error.message;
    job.finishedAt = new Date().toISOString();
  });
  child.on('exit', (code, signal) => {
    job.exitCode = code;
    job.signal = signal;
    job.finishedAt = new Date().toISOString();
    job.status = code === 0 ? 'completed' : 'failed';
    if (code !== 0 && !job.error) job.error = `render exited with ${code ?? signal}`;
  });

  return job;
}

function stopJob(job) {
  if (!job || job.status !== 'running' || !job.child) return false;
  job.child.kill('SIGTERM');
  job.status = 'stopping';
  job.finishedAt = new Date().toISOString();
  return true;
}

const marbleServer = {
  status: 'stopped',
  child: null,
  pid: null,
  startedAt: null,
  stoppedAt: null,
  exitCode: null,
  signal: null,
  error: null,
  log: '',
};

function appendMarbleServerLog(chunk) {
  marbleServer.log += chunk.toString();
  if (marbleServer.log.length > 60000) marbleServer.log = marbleServer.log.slice(-60000);
}

function probeUrl(url, timeoutMs = 900) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve({ online: true, statusCode: res.statusCode });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ online: false, statusCode: null });
    });
    req.on('error', () => resolve({ online: false, statusCode: null }));
  });
}

async function publicMarbleServerStatus() {
  const probe = await probeUrl(MARBLE_SERVER_URL);
  const managedRunning = Boolean(marbleServer.child && !marbleServer.child.killed && ['starting', 'running'].includes(marbleServer.status));
  const status = managedRunning ? (probe.online ? 'running' : marbleServer.status) : (probe.online ? 'external-running' : marbleServer.status === 'stopping' ? 'stopping' : 'stopped');
  return {
    ok: true,
    status,
    url: MARBLE_SERVER_URL,
    host: MARBLE_SERVER_HOST,
    port: MARBLE_SERVER_PORT,
    managed: managedRunning,
    pid: managedRunning ? marbleServer.pid : null,
    startedAt: marbleServer.startedAt,
    stoppedAt: marbleServer.stoppedAt,
    exitCode: marbleServer.exitCode,
    signal: marbleServer.signal,
    error: marbleServer.error,
    httpOnline: probe.online,
    httpStatusCode: probe.statusCode,
    log: marbleServer.log.slice(-16000),
  };
}

async function startMarbleServer() {
  const current = await publicMarbleServerStatus();
  if (['running', 'starting', 'external-running'].includes(current.status)) {
    return { started: false, reason: 'already-running', server: current };
  }

  marbleServer.status = 'starting';
  marbleServer.startedAt = new Date().toISOString();
  marbleServer.stoppedAt = null;
  marbleServer.exitCode = null;
  marbleServer.signal = null;
  marbleServer.error = null;
  marbleServer.log = `[marble-server] Starting ${MARBLE_SERVER_URL}\n`;

  const child = spawn('npm', ['run', 'dev', '--', '--host', MARBLE_SERVER_HOST, '--port', String(MARBLE_SERVER_PORT)], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });
  marbleServer.child = child;
  marbleServer.pid = child.pid;

  child.stdout.on('data', (chunk) => {
    appendMarbleServerLog(chunk);
    if (/Local:|ready in|VITE/i.test(chunk.toString())) marbleServer.status = 'running';
  });
  child.stderr.on('data', appendMarbleServerLog);
  child.on('error', (error) => {
    marbleServer.status = 'failed';
    marbleServer.error = error.message;
    marbleServer.stoppedAt = new Date().toISOString();
  });
  child.on('exit', (code, signal) => {
    marbleServer.exitCode = code;
    marbleServer.signal = signal;
    marbleServer.stoppedAt = new Date().toISOString();
    marbleServer.status = code === 0 || signal === 'SIGTERM' ? 'stopped' : 'failed';
    marbleServer.child = null;
    marbleServer.pid = null;
    if (code !== 0 && signal !== 'SIGTERM' && !marbleServer.error) marbleServer.error = `marble server exited with ${code ?? signal}`;
  });

  return { started: true, server: await publicMarbleServerStatus() };
}

async function stopMarbleServer() {
  const current = await publicMarbleServerStatus();
  if (!marbleServer.child || !['running', 'starting'].includes(marbleServer.status)) {
    return { stopped: false, reason: current.status === 'external-running' ? 'external-process-not-managed' : 'not-running', server: current };
  }
  marbleServer.status = 'stopping';
  appendMarbleServerLog('\n[marble-server] Stopping by dashboard request...\n');
  marbleServer.child.kill('SIGTERM');
  return { stopped: true, server: await publicMarbleServerStatus() };
}

function dashboardHtml() {
  const obstacleChecks = Object.entries(OBSTACLE_CATEGORIES).map(([categoryKey, category]) => {
    const types = OBSTACLE_TYPES.filter((type) => type.category === categoryKey);
    const body = types.length
      ? types.map((type) => `
        <label class="check"><input type="checkbox" name="obstacleTypes" value="${type.value}" data-obstacle-category="${categoryKey}" checked> <span>${type.label}</span></label>
      `).join('')
      : `<p class="muted category-note">${category.description}</p>`;
    return `
      <fieldset class="obstacle-category" data-dashboard-obstacle-category="${categoryKey}">
        <legend>${category.label}</legend>
        ${body}
      </fieldset>
    `;
  }).join('');
  const densityOptions = DENSITY_PRESETS.map((density) => `
    <option value="${density.value}" ${density.value === 'extreme' ? 'selected' : ''}>${density.label}</option>
  `).join('');
  const obstacleDistributionOptions = OBSTACLE_DISTRIBUTION_MODES.map((mode) => `
    <option value="${mode.value}" ${mode.value === 'random' ? 'selected' : ''}>${mode.label}</option>
  `).join('');
  const backgroundRecordModeCards = BACKGROUND_RECORD_MODES.map((mode) => `
    <label class="record-mode-card" data-background-record-mode="${mode.key}">
      <input type="radio" name="recordMode" value="${mode.value}" ${mode.value === 'cup' ? 'checked' : ''}>
      <b>${mode.label}</b>
      <span>${mode.description}</span>
    </label>
  `).join('');
  const trackLengthOptions = `
    <option value="${CUP_VIDEO_DEFAULTS.trackLength}" selected>${CUP_STAGE_TRACK_LABEL}</option>
  `;
  const ttsVoiceOptions = ['Rishi', 'Tom (Enhanced)', 'Samantha', 'Alex', 'Daniel', 'Moira', 'Karen', 'Tessa'].map((voice) => `
    <option value="${voice}" ${voice === 'Alex' ? 'selected' : ''}>${voice}</option>
  `).join('');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Game Ops Dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --panel: rgba(12,18,32,.84); --line: rgba(255,255,255,.11); --muted: #96a4bc; --text: #f4f7fb; --accent: #8ef4ff; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, #203052, #080b12 48%, #05060a); color: var(--text); font-size: 14px; }
    main { max-width: 1440px; margin: 0 auto; padding: 16px; }
    .topbar { position: sticky; top: 0; z-index: 5; display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; margin: -16px -16px 12px; padding: 12px 16px; background: rgba(5,8,15,.86); border-bottom: 1px solid var(--line); backdrop-filter: blur(18px); }
    h1 { margin: 0; font-size: 22px; letter-spacing: -.03em; }
    h2 { margin: 0; font-size: 15px; letter-spacing: -.01em; }
    h3 { margin: 0; font-size: 13px; color: #dfe8fb; }
    .sub { color: var(--muted); margin: 2px 0 0; line-height: 1.35; font-size: 12px; }
    .shell { display: grid; grid-template-columns: 280px minmax(360px, 1fr) 420px; gap: 12px; align-items: start; }
    .stack { display: grid; gap: 12px; }
    .card { border: 1px solid var(--line); background: var(--panel); box-shadow: 0 18px 54px rgba(0,0,0,.26); border-radius: 18px; padding: 14px; backdrop-filter: blur(16px); }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .game-card { display: grid; gap: 10px; padding: 12px; border-radius: 16px; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.09); }
    .game-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .game-badge { font-size: 11px; color: #06101c; background: linear-gradient(135deg, #8ef4ff, #b49cff); border-radius: 999px; padding: 4px 7px; font-weight: 900; }
    .quick-actions, .actions, .server-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .stat { padding: 8px; border-radius: 13px; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.075); }
    .stat b { display: block; font-size: 12px; color: #dce7fb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stat span { display: block; margin-top: 2px; color: var(--muted); font-size: 11px; }
    label { display: block; font-weight: 800; margin: 9px 0 5px; color: #e8eefb; font-size: 12px; }
    input[type="text"], input[type="number"], select { width: 100%; border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 9px 10px; background: rgba(255,255,255,.08); color: #fff; outline: none; font: inherit; min-height: 38px; }
    select option { color: #111; }
    .form-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
    .wide { grid-column: span 2; }
    .full { grid-column: 1 / -1; }
    .checks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .obstacle-category { margin: 0; border: 1px solid rgba(255,255,255,.09); border-radius: 13px; padding: 8px; background: rgba(255,255,255,.04); }
    .obstacle-category legend { padding: 0 5px; color: #dfe8fb; font-weight: 900; font-size: 12px; }
    .obstacle-category .check + .check { margin-top: 6px; }
    .category-note { margin: 6px 0 0; line-height: 1.35; }
    .check { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 9px; border-radius: 12px; background: rgba(255,255,255,.055); font-weight: 700; font-size: 12px; min-height: 36px; }
    button { border: 0; border-radius: 12px; padding: 9px 12px; min-height: 36px; font-weight: 900; color: #07111d; background: linear-gradient(135deg, #8ef4ff, #b49cff); cursor: pointer; font-size: 12px; }
    button.secondary { background: rgba(255,255,255,.11); color: #f4f7fb; border: 1px solid rgba(255,255,255,.14); }
    button.danger { background: #ff7e8d; color: #22070b; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .status { display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 7px 10px; background: rgba(255,255,255,.075); color: #cfdbf2; font-weight: 800; font-size: 12px; white-space: nowrap; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; flex: 0 0 auto; }
    .dot.running { background: #38bdf8; box-shadow: 0 0 16px #38bdf8; }
    .dot.completed { background: #34d399; box-shadow: 0 0 16px #34d399; }
    .dot.failed { background: #fb7185; box-shadow: 0 0 16px #fb7185; }
    pre { white-space: pre-wrap; word-break: break-word; max-height: 280px; overflow: auto; padding: 11px; border-radius: 13px; background: #050812; color: #dbeafe; border: 1px solid rgba(255,255,255,.08); font-size: 12px; line-height: 1.35; margin: 8px 0 0; }
    .mini-log { max-height: 150px; }
    .recording { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
    a { color: var(--accent); text-decoration: none; }
    .muted { color: var(--muted); font-size: 12px; }
    .pill { display: inline-block; border: 1px solid rgba(255,255,255,.13); border-radius: 999px; padding: 4px 8px; color: #cad7ef; font-size: 11px; margin: 4px 4px 0 0; }
    .section-divider { height: 1px; background: var(--line); margin: 12px 0 10px; }
    .record-mode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .record-mode-card { position: relative; display: grid; gap: 4px; margin: 0; padding: 10px 10px 10px 34px; border-radius: 14px; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.09); font-weight: 800; min-height: 78px; }
    .record-mode-card input { position: absolute; left: 10px; top: 12px; }
    .record-mode-card:has(input:checked) { border-color: rgba(142,244,255,.62); box-shadow: inset 0 0 0 1px rgba(142,244,255,.22); background: rgba(142,244,255,.12); }
    .record-mode-card b { font-size: 13px; color: #f4f7fb; }
    .record-mode-card span { color: var(--muted); font-size: 11px; line-height: 1.3; }
    .record-mode-extra { margin-top: 8px; display: grid; grid-template-columns: minmax(0, 180px) 1fr; gap: 10px; align-items: end; }
    .record-mode-extra .muted { padding-bottom: 8px; }
    details { border-radius: 14px; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.075); padding: 9px; }
    summary { cursor: pointer; font-weight: 900; font-size: 12px; color: #eaf1ff; }
    @media (max-width: 760px) { .record-mode-grid, .record-mode-extra { grid-template-columns: 1fr; } }
    @media (max-width: 1180px) { .shell { grid-template-columns: 260px 1fr; } .right-pane { grid-column: 1 / -1; } }
    @media (max-width: 760px) { main { padding: 10px; } .topbar { grid-template-columns: 1fr; margin: -10px -10px 10px; } .shell, .form-grid { grid-template-columns: 1fr; } .wide { grid-column: auto; } .checks { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="topbar">
      <div>
        <h1>Game Ops Dashboard</h1>
        <p class="sub">Compact multi-game control surface · Dashboard port ${PORT} · services / recording / renders</p>
      </div>
      <div class="status"><span id="serverDot" class="dot"></span><span id="serverStatusText">Checking server...</span></div>
      <div class="status"><span id="statusDot" class="dot"></span><span id="statusText">Idle</span></div>
    </section>

    <section class="shell">
      <aside class="stack">
        <section class="card">
          <div class="card-head"><h2>Games</h2><span class="muted">1 active</span></div>
          <div class="game-card">
            <div class="game-title"><h3>Marble Rush</h3><span class="game-badge">READY</span></div>
            <div class="stats">
              <div class="stat"><b id="gameServiceStat">...</b><span>service</span></div>
              <div class="stat"><b>Vite</b><span>runtime</span></div>
              <div class="stat"><b>Record</b><span>cup/video</span></div>
            </div>
            <a id="serverOpenLink" href="${MARBLE_SERVER_URL}" target="_blank" rel="noreferrer">Open game ↗</a>
            <div class="quick-actions">
              <button id="serverStartBtn" type="button">Start</button>
              <button id="serverStopBtn" class="danger" type="button">Stop</button>
              <button id="serverRefreshBtn" class="secondary" type="button">Refresh</button>
            </div>
            <div id="serverMeta" class="muted">URL: ${MARBLE_SERVER_URL}</div>
          </div>
          <p class="muted">之後加新遊戲時，每隻 game 會變成同款 compact card：service、open、record/render actions。</p>
        </section>

        <section class="card">
          <div class="card-head"><h2>Server Log</h2><span class="muted">live</span></div>
          <pre id="serverLog" class="mini-log">等待 server 狀態...</pre>
        </section>
      </aside>

      <form id="renderForm" class="card">
        <div class="card-head"><h2>Marble Cup Render</h2><span class="muted">background recording</span></div>
        <div class="form-grid">
          <div class="wide">
            <label for="cupName">Cup 名稱</label>
            <input id="cupName" name="cupName" type="text" value="Bumper Cup" maxlength="80">
          </div>
          <div>
            <label for="cupSize">人數</label>
            <select id="cupSize" name="cupSize"><option selected>16</option><option>24</option><option>32</option></select>
          </div>
          <div>
            <label for="format">格式</label>
            <select id="format" name="format"><option value="webm" selected>WebM</option><option value="mp4">MP4</option></select>
          </div>
          <div>
            <label for="density">障礙密度</label>
            <select id="density" name="density">${densityOptions}</select>
          </div>
          <div>
            <label for="obstacleDistribution">障礙分佈</label>
            <select id="obstacleDistribution" name="obstacleDistribution">${obstacleDistributionOptions}</select>
          </div>
          <div>
            <label for="trackLength">賽道</label>
            <select id="trackLength" name="trackLength">${trackLengthOptions}</select>
          </div>
          <div>
            <label for="maxRaceSeconds">單場秒數</label>
            <input id="maxRaceSeconds" name="maxRaceSeconds" type="number" min="30" max="600" value="${CUP_VIDEO_DEFAULTS.maxRaceSeconds}">
          </div>
          <div>
            <label for="timeout">Timeout</label>
            <input id="timeout" name="timeout" type="number" min="120" max="3600" value="${CUP_VIDEO_DEFAULTS.timeout}">
          </div>
          <div>
            <label for="ttsVoice">TTS</label>
            <select id="ttsVoice" name="ttsVoice">${ttsVoiceOptions}</select>
          </div>
          <label class="check"><input id="audio" name="audio" type="checkbox" checked> <span>遊戲音訊</span></label>
        </div>

        <div class="section-divider"></div>
        <section aria-label="Background Record" data-dashboard-section="background-record-categories">
          <div class="card-head"><h2>Background Record</h2><span class="muted">Multiple / Cup Mode</span></div>
          <div class="record-mode-grid">${backgroundRecordModeCards}</div>
          <div class="record-mode-extra">
            <div>
              <label for="multipleRaceCount">Multiple 場數</label>
              <input id="multipleRaceCount" name="multipleRaceCount" type="number" min="1" max="99" value="5">
            </div>
            <div id="recordModeHint" class="muted">Cup Mode: background tournament recording.</div>
          </div>
        </section>

        <div class="section-divider"></div>
        <details open>
          <summary>障礙物種類 / 分類</summary>
          <div class="checks" style="margin-top:8px">${obstacleChecks}</div>
          <p class="muted">Dashboard now mirrors the game categories: 普通 / 增益 / 減益. Empty categories are reserved so future obstacle add/remove changes are visible here too.</p>
          <div class="actions">
            <button type="button" class="secondary" id="allTypes">全選</button>
            <button type="button" class="secondary" id="bumperOnly">只選 Bumper</button>
            <button type="button" class="secondary" id="clearTypes">清空=全部</button>
          </div>
        </details>

        <div class="actions">
          <button id="startBtn" type="submit">Start render</button>
          <button id="stopBtn" class="danger" type="button" disabled>Stop job</button>
          <span class="muted">Track: ${CUP_STAGE_TRACK_LABEL}</span>
        </div>
      </form>

      <aside class="stack right-pane">
        <section class="card">
          <div class="card-head"><h2>Current Job</h2><span class="muted">render log</span></div>
          <div id="jobMeta" class="muted">尚未開始</div>
          <div id="jobPills"></div>
          <pre id="log">等待生成...</pre>
        </section>
        <section class="card">
          <div class="card-head"><h2>Recent Outputs</h2><button class="secondary" type="button" onclick="refreshRecordings()">Refresh</button></div>
          <div id="recordings"></div>
        </section>
      </aside>
    </section>
  </main>

<script>
const form = document.querySelector('#renderForm');
const logEl = document.querySelector('#log');
const statusText = document.querySelector('#statusText');
const statusDot = document.querySelector('#statusDot');
const jobMeta = document.querySelector('#jobMeta');
const jobPills = document.querySelector('#jobPills');
const recEl = document.querySelector('#recordings');
const startBtn = document.querySelector('#startBtn');
const stopBtn = document.querySelector('#stopBtn');
const serverDot = document.querySelector('#serverDot');
const serverStatusText = document.querySelector('#serverStatusText');
const serverMeta = document.querySelector('#serverMeta');
const serverLog = document.querySelector('#serverLog');
const serverStartBtn = document.querySelector('#serverStartBtn');
const serverStopBtn = document.querySelector('#serverStopBtn');
const serverRefreshBtn = document.querySelector('#serverRefreshBtn');
const serverOpenLink = document.querySelector('#serverOpenLink');
const gameServiceStat = document.querySelector('#gameServiceStat');
const recordModeHint = document.querySelector('#recordModeHint');
const multipleRaceCountInput = document.querySelector('#multipleRaceCount');
const recordModeHints = {
  single: 'Single: in-game recording only; use Marble Rush page for manual Single capture.',
  continuous: 'Multiple: background record repeated single races; 場數由 Multiple 場數控制。',
  cup: 'Cup Mode: background tournament recording.',
};
let currentJobId = null;
let pollTimer = null;

function selectedTypes() {
  return Array.from(document.querySelectorAll('input[name="obstacleTypes"]:checked')).map((el) => el.value);
}
function selectedRecordMode() {
  return form.recordMode?.value || 'cup';
}
function normalizeMultipleRaceCount() {
  const raw = Number(multipleRaceCountInput?.value);
  const count = Number.isFinite(raw) ? Math.round(raw) : 5;
  return Math.max(1, Math.min(99, count));
}
function updateRecordModeHint() {
  const mode = selectedRecordMode();
  if (recordModeHint) recordModeHint.textContent = recordModeHints[mode] || recordModeHints.cup;
  if (multipleRaceCountInput) multipleRaceCountInput.disabled = mode !== 'continuous';
}
function setTypes(types) {
  document.querySelectorAll('input[name="obstacleTypes"]').forEach((el) => { el.checked = types.includes(el.value); });
}
document.querySelector('#allTypes').onclick = () => setTypes(${JSON.stringify(OBSTACLE_TYPES.map((type) => type.value))});
document.querySelector('#bumperOnly').onclick = () => setTypes(['popBumper']);
document.querySelector('#clearTypes').onclick = () => setTypes([]);
document.querySelectorAll('input[name="recordMode"]').forEach((el) => el.addEventListener('change', updateRecordModeHint));
multipleRaceCountInput?.addEventListener('change', () => { multipleRaceCountInput.value = String(normalizeMultipleRaceCount()); });
updateRecordModeHint();

function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i = 0; let value = n;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return value.toFixed(value >= 10 || i === 0 ? 0 : 1) + ' ' + units[i];
}
function setStatus(status) {
  statusText.textContent = status;
  statusDot.className = 'dot ' + status;
  startBtn.disabled = status === 'running' || status === 'stopping';
  stopBtn.disabled = !(status === 'running');
}
function renderMarbleServer(server) {
  const status = server.status || 'unknown';
  serverStatusText.textContent = status;
  if (gameServiceStat) gameServiceStat.textContent = status === 'external-running' ? 'external' : status;
  serverDot.className = 'dot ' + (status === 'running' || status === 'external-running' ? 'completed' : status === 'starting' ? 'running' : status === 'failed' ? 'failed' : '');
  serverStartBtn.disabled = ['running', 'starting', 'external-running'].includes(status);
  serverStopBtn.disabled = !['running', 'starting'].includes(status) || !server.managed;
  serverOpenLink.href = server.url;
  serverMeta.innerHTML = [
    'URL: <a href="' + server.url + '" target="_blank" rel="noreferrer">' + server.url + '</a>',
    'HTTP: ' + (server.httpOnline ? 'online ' + (server.httpStatusCode || '') : 'offline'),
    'Mode: ' + (server.managed ? 'dashboard-managed' : status === 'external-running' ? 'external process' : 'stopped'),
    server.pid ? 'PID: ' + server.pid : null,
  ].filter(Boolean).join(' · ');
  serverLog.textContent = server.log || (server.httpOnline ? 'Server is online.' : 'Server is stopped.');
  serverLog.scrollTop = serverLog.scrollHeight;
}
async function refreshMarbleServer() {
  const res = await fetch('/api/marble-server');
  const data = await res.json();
  if (data.ok) renderMarbleServer(data.server);
}
async function controlMarbleServer(action) {
  serverLog.textContent = action === 'start' ? '啟動 server 中...' : '關閉 server 中...';
  const res = await fetch('/api/marble-server/' + action, { method: 'POST' });
  const data = await res.json();
  if (data.server) renderMarbleServer(data.server);
  setTimeout(refreshMarbleServer, 900);
}
serverStartBtn.onclick = () => controlMarbleServer('start');
serverStopBtn.onclick = () => controlMarbleServer('stop');
serverRefreshBtn.onclick = refreshMarbleServer;
function renderJob(job) {
  if (!job) { setStatus('idle'); return; }
  setStatus(job.status);
  jobMeta.innerHTML = 'Job #' + job.id + ' · ' + (job.outputName || '') + ' · ' + (job.size ? fmtBytes(job.size) : 'rendering...') +
    (job.outputExists ? ' · <a href="/recordings/' + encodeURIComponent(job.outputName) + '" target="_blank">下載/預覽</a>' : '');
  jobPills.innerHTML = [
    'Mode: ' + (job.options.recordMode === 'continuous' ? 'Multiple' : 'Cup Mode'),
    job.options.recordMode === 'continuous' ? 'Races: ' + (job.options.multipleRaceCount || 5) : null,
    'Cup: ' + job.options.cupName,
    'Density: ' + job.options.density,
    'Distribution: ' + (job.options.obstacleDistribution || 'random'),
    'Types: ' + (job.options.obstacleTypes.length ? job.options.obstacleTypes.join(', ') : 'all'),
    'Target: ' + (job.options.targetMinutes || ${CUP_VIDEO_DEFAULTS.targetMinutes}) + ' min',
    'Track: ' + (job.options.stageTrackLabel || (job.options.trackLength + 'm')),
    'Format: ' + job.options.format,
    'TTS: ' + (job.options.ttsVoice || 'Alex'),
    'Port: ' + job.renderPort,
  ].filter(Boolean).map((text) => '<span class="pill">' + text + '</span>').join('');
  logEl.textContent = job.log || '已開始，等待 render log...';
  logEl.scrollTop = logEl.scrollHeight;
}
async function refreshRecordings() {
  const res = await fetch('/api/recordings');
  const data = await res.json();
  recEl.innerHTML = data.recordings.length ? data.recordings.map((rec) =>
    '<div class="recording"><div><a href="' + rec.url + '" target="_blank">' + rec.name + '</a><div class="muted">' + fmtBytes(rec.size) + ' · ' + rec.modifiedAt + '</div></div></div>'
  ).join('') : '<p class="muted">暫無影片</p>';
}
async function pollJob() {
  if (!currentJobId) return;
  const res = await fetch('/api/jobs/' + encodeURIComponent(currentJobId));
  const data = await res.json();
  if (data.ok) {
    renderJob(data.job);
    if (['completed','failed','stopping'].includes(data.job.status)) {
      if (data.job.status !== 'running') await refreshRecordings();
      if (data.job.status !== 'stopping') clearInterval(pollTimer);
    }
  }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    recordMode: selectedRecordMode(),
    multipleRaceCount: normalizeMultipleRaceCount(),
    cupName: form.cupName.value,
    density: form.density.value,
    obstacleDistribution: form.obstacleDistribution.value,
    obstacleTypes: selectedTypes(),
    format: form.format.value,
    cupSize: Number(form.cupSize.value),
    trackLength: Number(form.trackLength.value),
    maxRaceSeconds: Number(form.maxRaceSeconds.value),
    timeout: Number(form.timeout.value),
    audio: form.audio.checked,
    ttsVoice: form.ttsVoice.value,
  };
  setStatus('running');
  logEl.textContent = '提交生成任務中...';
  const res = await fetch('/api/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!data.ok) {
    setStatus('failed');
    logEl.textContent = data.error || '提交失敗';
    return;
  }
  currentJobId = data.job.id;
  renderJob(data.job);
  clearInterval(pollTimer);
  pollTimer = setInterval(pollJob, 2000);
});
stopBtn.onclick = async () => {
  if (!currentJobId) return;
  await fetch('/api/jobs/' + encodeURIComponent(currentJobId) + '/stop', { method: 'POST' });
  await pollJob();
};
refreshRecordings();
refreshMarbleServer();
setInterval(refreshMarbleServer, 3000);
</script>
</body>
</html>`;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === 'GET' && url.pathname === '/') return htmlResponse(res, dashboardHtml());

  if (req.method === 'GET' && url.pathname === '/api/options') {
    return jsonResponse(res, 200, {
      ok: true,
      obstacleTypes: OBSTACLE_TYPES,
      obstacleCategories: OBSTACLE_CATEGORIES,
      obstacleDistributionModes: OBSTACLE_DISTRIBUTION_MODES,
      densityPresets: DENSITY_PRESETS,
      backgroundRecordModes: BACKGROUND_RECORD_MODES,
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/marble-server') {
    return jsonResponse(res, 200, { ok: true, server: await publicMarbleServerStatus() });
  }

  if (req.method === 'POST' && url.pathname === '/api/marble-server/start') {
    const result = await startMarbleServer();
    return jsonResponse(res, result.started ? 202 : 200, { ok: true, ...result });
  }

  if (req.method === 'POST' && url.pathname === '/api/marble-server/stop') {
    const result = await stopMarbleServer();
    return jsonResponse(res, 200, { ok: true, ...result });
  }

  if (req.method === 'GET' && url.pathname === '/api/jobs') {
    return jsonResponse(res, 200, { ok: true, jobs: Array.from(jobs.values()).map(publicJob).reverse() });
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === 'GET' && jobMatch) {
    const job = jobs.get(decodeURIComponent(jobMatch[1]));
    if (!job) return notFound(res);
    return jsonResponse(res, 200, { ok: true, job: publicJob(job) });
  }

  const stopMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/stop$/);
  if (req.method === 'POST' && stopMatch) {
    const job = jobs.get(decodeURIComponent(stopMatch[1]));
    if (!job) return notFound(res);
    const stopped = stopJob(job);
    return jsonResponse(res, 200, { ok: true, stopped, job: publicJob(job) });
  }

  if (req.method === 'POST' && url.pathname === '/api/render') {
    try {
      const body = await readRequestJson(req);
      const running = Array.from(jobs.values()).find((job) => job.status === 'running' || job.status === 'stopping');
      if (running) return jsonResponse(res, 409, { ok: false, error: `job ${running.id} is already running` });
      const options = normalizeOptions(body);
      const job = startRender(options);
      return jsonResponse(res, 202, { ok: true, job: publicJob(job) });
    } catch (error) {
      return jsonResponse(res, 400, { ok: false, error: error.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/recordings') {
    return jsonResponse(res, 200, { ok: true, recordings: listRecordings() });
  }

  const recordingMatch = url.pathname.match(/^\/recordings\/([^/]+)$/);
  if (req.method === 'GET' && recordingMatch) {
    const name = decodeURIComponent(recordingMatch[1]);
    if (name.includes('/') || name.includes('..') || !/\.(webm|mp4)$/i.test(name)) return notFound(res);
    const full = path.join(recordingsDir, name);
    if (!existsSync(full)) return notFound(res);
    const ext = path.extname(name).toLowerCase();
    res.writeHead(200, {
      'content-type': ext === '.mp4' ? 'video/mp4' : 'video/webm',
      'content-length': statSync(full).size,
      'cache-control': 'no-store',
    });
    return createReadStream(full).pipe(res);
  }

  return notFound(res);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    jsonResponse(res, 500, { ok: false, error: error.message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[marble-dashboard] http://${HOST}:${PORT}`);
  console.log(`[marble-dashboard] project root: ${rootDir}`);
});
