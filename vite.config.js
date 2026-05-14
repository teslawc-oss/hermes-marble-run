import { defineConfig } from 'vite';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ttsCacheDir = path.join(__dirname, '.cache', 'tts');
const defaultVoice = process.env.MARBLE_TTS_VOICE || 'Alex';
const maxTtsChars = 220;

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 20000, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function sanitizeTtsText(value = '') {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxTtsChars);
}

function sanitizeVoice(value = '') {
  return String(value || defaultVoice).replace(/[^\w .'-]/g, '').trim().slice(0, 48) || defaultVoice;
}

async function commandExists(command) {
  try {
    await execFilePromise('/usr/bin/env', ['bash', '-lc', `command -v ${command}`], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureMacTtsAudio({ text, voice = defaultVoice }) {
  const cleanText = sanitizeTtsText(text);
  if (!cleanText) throw new Error('Missing TTS text');
  const cleanVoice = sanitizeVoice(voice);
  await fs.mkdir(ttsCacheDir, { recursive: true });
  const hash = crypto.createHash('sha256').update(`${cleanVoice}\n${cleanText}`).digest('hex').slice(0, 24);
  const aiffPath = path.join(ttsCacheDir, `${hash}.aiff`);
  const mp3Path = path.join(ttsCacheDir, `${hash}.mp3`);
  try {
    await fs.access(mp3Path);
    return { mp3Path, hash, voice: cleanVoice, text: cleanText, cached: true };
  } catch {}

  await execFilePromise('/usr/bin/say', ['-v', cleanVoice, '-o', aiffPath, cleanText]);
  await execFilePromise('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', aiffPath, '-codec:a', 'libmp3lame', '-b:a', '96k', mp3Path]);
  await fs.rm(aiffPath, { force: true });
  return { mp3Path, hash, voice: cleanVoice, text: cleanText, cached: false };
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function macTtsBridgePlugin() {
  const attachTtsMiddleware = (server) => {
    server.middlewares.use(async (req, res, next) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/api/tts/status') {
          const [sayAvailable, ffmpegAvailable] = await Promise.all([commandExists('say'), commandExists('ffmpeg')]);
          sendJson(res, 200, {
            ok: sayAvailable && ffmpegAvailable,
            engine: 'macos-say-ffmpeg',
            voice: defaultVoice,
            sayAvailable,
            ffmpegAvailable,
            maxChars: maxTtsChars,
          });
          return;
        }
        if (url.pathname !== '/api/tts') {
          next();
          return;
        }
        const text = url.searchParams.get('text') || '';
        const voice = url.searchParams.get('voice') || defaultVoice;
        const result = await ensureMacTtsAudio({ text, voice });
        const stat = await fs.stat(result.mp3Path);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('X-TTS-Engine', 'macos-say-ffmpeg');
        res.setHeader('X-TTS-Voice', result.voice);
        res.setHeader('X-TTS-Cache', result.cached ? 'hit' : 'miss');
        res.setHeader('Content-Length', String(stat.size));
        const file = await fs.readFile(result.mp3Path);
        res.end(file);
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: error?.message || 'TTS bridge failed',
          stderr: error?.stderr || undefined,
        });
      }
    });
  };

  return {
    name: 'mac-local-tts-bridge',
    configureServer: attachTtsMiddleware,
    configurePreviewServer: attachTtsMiddleware,
  };
}

export default defineConfig({
  plugins: [macTtsBridgePlugin()],
  server: {
    allowedHosts: ['itdog.mynetgear.com'],
  },
});
