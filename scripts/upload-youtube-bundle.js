#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const TOKEN_PATH_DEFAULT = '/Users/bert/.config/marble-rush/youtube-token.json';
const VALID_PRIVACY = new Set(['private', 'unlisted', 'public']);
const CHUNK_SIZE = 8 * 1024 * 1024;

function usage(message = '') {
  if (message) console.error(message);
  console.error(`Usage: node scripts/upload-youtube-bundle.js --video=FILE --thumbnail=FILE --metadata=FILE [--privacy=public|private|unlisted] [--output=FILE] [--dry-run]`);
  process.exit(message ? 1 : 0);
}

const sanitizeSingleLine = (value, fallback = '') => String(value || fallback)
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function resolveInput(name, fallback = '') {
  const value = args.get(name) || process.env[`MARBLE_YOUTUBE_${name.replace(/-/g, '_').toUpperCase()}`] || fallback;
  return value ? path.resolve(value) : '';
}

const config = {
  video: resolveInput('video'),
  thumbnail: resolveInput('thumbnail'),
  metadata: resolveInput('metadata'),
  output: resolveInput('output'),
  tokenPath: path.resolve(args.get('token') || process.env.MARBLE_YOUTUBE_TOKEN || TOKEN_PATH_DEFAULT),
  privacy: String(args.get('privacy') || process.env.MARBLE_YOUTUBE_PRIVACY || 'private').toLowerCase(),
  dryRun: args.get('dry-run') === 'true' || process.env.MARBLE_YOUTUBE_DRY_RUN === 'true',
};

if (!VALID_PRIVACY.has(config.privacy)) usage(`Invalid privacy: ${config.privacy}`);
if (!config.video) usage('Missing --video');
if (!config.metadata) usage('Missing --metadata');
if (!config.output) config.output = path.resolve(`${config.video.replace(/\.[^.]+$/, '')}.youtube-upload.json`);

function assertFile(file, label) {
  if (!file || !existsSync(file) || !statSync(file).isFile()) usage(`${label} not found: ${file}`);
  return statSync(file).size;
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

function loadToken() {
  if (!existsSync(config.tokenPath)) throw new Error(`YouTube OAuth token not found: ${config.tokenPath}`);
  return JSON.parse(readFileSync(config.tokenPath, 'utf8'));
}

function saveToken(token) {
  writeFileSync(config.tokenPath, `${JSON.stringify(token, null, 2)}\n`);
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return body;
}

async function refreshToken(token) {
  const body = new URLSearchParams({
    client_id: token.client_id,
    client_secret: token.client_secret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  });
  const data = await httpJson(token.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  token.token = data.access_token;
  token.access_token = data.access_token;
  token.expiry = Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
  saveToken(token);
  return token;
}

async function accessToken() {
  let token = loadToken();
  if (!token.refresh_token) throw new Error(`Token has no refresh_token: ${config.tokenPath}`);
  if (Number(token.expiry || 0) < Math.floor(Date.now() / 1000) + 120) token = await refreshToken(token);
  return token.token || token.access_token;
}

async function youtubeJson(url, options = {}, retry = true) {
  const token = await accessToken();
  const headers = { ...(options.headers || {}), authorization: `Bearer ${token}` };
  let body = options.body;
  if (body && typeof body !== 'string' && !(body instanceof Uint8Array) && !(body instanceof ArrayBuffer)) {
    body = JSON.stringify(body);
    headers['content-type'] = headers['content-type'] || 'application/json; charset=UTF-8';
  }
  const res = await fetch(url, { ...options, headers, body });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  if (res.status === 401 && retry) {
    await refreshToken(loadToken());
    return youtubeJson(url, options, false);
  }
  if (!res.ok) throw new Error(`YouTube HTTP ${res.status}: ${text}`);
  return parsed;
}

async function startResumableUpload(videoPath, metadata) {
  const payload = {
    snippet: {
      title: sanitizeSingleLine(metadata.title, 'Marble Race').slice(0, 100),
      description: String(metadata.description || ''),
      categoryId: String(metadata.categoryId || '20'),
      tags: Array.isArray(metadata.hashtags) ? metadata.hashtags.map((tag) => String(tag).replace(/^#/, '')).filter(Boolean).slice(0, 25) : [],
    },
    status: {
      privacyStatus: config.privacy,
      selfDeclaredMadeForKids: Boolean(metadata.selfDeclaredMadeForKids || false),
    },
  };
  const token = await accessToken();
  const res = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(statSync(videoPath).size),
      'x-upload-content-type': mimeFor(videoPath),
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube resumable start HTTP ${res.status}: ${text}`);
  return res.headers.get('location');
}

async function uploadVideo(videoPath, metadata) {
  const uploadUrl = await startResumableUpload(videoPath, metadata);
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL');
  const total = statSync(videoPath).size;
  const file = await import('node:fs/promises');
  const handle = await file.open(videoPath, 'r');
  try {
    let sent = 0;
    while (sent < total) {
      const length = Math.min(CHUNK_SIZE, total - sent);
      const buffer = Buffer.allocUnsafe(length);
      await handle.read(buffer, 0, length, sent);
      const start = sent;
      const end = sent + length - 1;
      sent += length;
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'content-length': String(length),
          'content-type': mimeFor(videoPath),
          'content-range': `bytes ${start}-${end}/${total}`,
        },
        body: buffer,
      });
      const text = await res.text();
      if (res.status === 308) {
        console.log(JSON.stringify({ phase: 'video-upload-progress', sent, total, percent: Number(((sent / total) * 100).toFixed(1)) }));
        continue;
      }
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
      if (!res.ok) throw new Error(`YouTube upload HTTP ${res.status}: ${text}`);
      console.log(JSON.stringify({ phase: 'video-upload-complete', videoId: parsed.id, bytes: total }));
      return parsed;
    }
  } finally {
    await handle.close();
  }
  throw new Error('Upload ended without final YouTube response');
}

async function setThumbnail(videoId, thumbnailPath) {
  if (!thumbnailPath) return null;
  const size = assertFile(thumbnailPath, 'Thumbnail');
  const token = await accessToken();
  const data = readFileSync(thumbnailPath);
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': mimeFor(thumbnailPath),
      'content-length': String(size),
    },
    body: data,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  if (!res.ok) throw new Error(`YouTube thumbnail HTTP ${res.status}: ${text}`);
  return parsed;
}

async function main() {
  const videoBytes = assertFile(config.video, 'Video');
  const metadataBytes = assertFile(config.metadata, 'YouTube metadata');
  const thumbnailBytes = config.thumbnail && existsSync(config.thumbnail) ? statSync(config.thumbnail).size : 0;
  const metadata = JSON.parse(readFileSync(config.metadata, 'utf8'));
  const dryRunPayload = {
    ok: true,
    dryRun: true,
    video: config.video,
    thumbnail: config.thumbnail || '',
    metadata: config.metadata,
    output: config.output,
    privacyStatus: config.privacy,
    title: sanitizeSingleLine(metadata.title, 'Marble Race').slice(0, 100),
    descriptionLength: String(metadata.description || '').length,
    videoBytes,
    thumbnailBytes,
    metadataBytes,
    tokenPath: config.tokenPath,
  };
  if (config.dryRun) {
    writeFileSync(config.output, `${JSON.stringify(dryRunPayload, null, 2)}\n`);
    console.log(JSON.stringify(dryRunPayload, null, 2));
    return;
  }
  console.log(JSON.stringify({ phase: 'start', video: config.video, thumbnail: config.thumbnail, metadata: config.metadata, title: dryRunPayload.title, privacy: config.privacy, videoBytes, thumbnailBytes }));
  const videoResponse = await uploadVideo(config.video, metadata);
  const videoId = videoResponse.id;
  if (!videoId) throw new Error(`No video ID in response: ${JSON.stringify(videoResponse)}`);
  console.log(JSON.stringify({ phase: 'set-thumbnail', videoId }));
  const thumbnailResponse = config.thumbnail ? await setThumbnail(videoId, config.thumbnail) : null;
  const verify = await youtubeJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`);
  const item = verify.items?.[0] || {};
  const output = {
    ok: true,
    videoId,
    url: `https://youtu.be/${videoId}`,
    studioUrl: `https://studio.youtube.com/video/${videoId}/edit`,
    privacyStatus: item.status?.privacyStatus || config.privacy,
    title: item.snippet?.title || dryRunPayload.title,
    descriptionLength: String(item.snippet?.description || '').length,
    thumbnailSet: Boolean(thumbnailResponse),
    uploadedAt: new Date().toISOString(),
    source: { video: config.video, thumbnail: config.thumbnail || '', metadata: config.metadata },
    api: { videoResponse, thumbnailResponse, verify },
  };
  writeFileSync(config.output, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ phase: 'done', videoId, url: output.url, privacyStatus: output.privacyStatus, title: output.title, uploadRecord: config.output }, null, 2));
}

main().catch((error) => {
  console.error(`[youtube-upload] ${error.stack || error.message}`);
  process.exit(1);
});
