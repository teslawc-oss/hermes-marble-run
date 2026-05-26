#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';

const LISTEN_HOST = process.env.MARBLE_PROXY_HOST || '0.0.0.0';
const LISTEN_PORT = Number(process.env.MARBLE_PROXY_PORT || 5173);
const TARGET_HOST = process.env.MARBLE_PROXY_TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.MARBLE_PROXY_TARGET_PORT || 5174);
const TLS_CERT = process.env.MARBLE_HTTPS_CERT || process.env.GAME_DASHBOARD_HTTPS_CERT || '/Users/bert/.config/marble-rush/tls/itdog.mynetgear.com.crt';
const TLS_KEY = process.env.MARBLE_HTTPS_KEY || process.env.GAME_DASHBOARD_HTTPS_KEY || '/Users/bert/.config/marble-rush/tls/itdog.mynetgear.com.key';
const AUTH_USER = String(process.env.MARBLE_DASHBOARD_AUTH_USER || process.env.GAME_DASHBOARD_AUTH_USER || 'bert');
const AUTH_PASSWORD = String(process.env.MARBLE_DASHBOARD_PASSWORD || process.env.GAME_DASHBOARD_PASSWORD || '');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function requestHostName(req) {
  const rawHost = String(req.headers.host || '').trim().toLowerCase();
  if (!rawHost) return '';
  if (rawHost.startsWith('[')) return rawHost.slice(0, rawHost.indexOf(']') + 1);
  return rawHost.split(':')[0];
}

function isLocalRequest(req) {
  const hostName = requestHostName(req);
  return !hostName || LOCAL_HOSTS.has(hostName);
}

function safeEqualString(left = '', right = '') {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidPassword(req) {
  const header = String(req.headers.authorization || '');
  if (!header.toLowerCase().startsWith('basic ')) return false;
  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  return safeEqualString(decoded.slice(0, separator), AUTH_USER)
    && safeEqualString(decoded.slice(separator + 1), AUTH_PASSWORD);
}

function requireAuth(req, res) {
  if (isLocalRequest(req)) return true;
  if (!AUTH_PASSWORD) {
    res.writeHead(403, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end('Remote Marble Rush access is disabled until MARBLE_DASHBOARD_PASSWORD or GAME_DASHBOARD_PASSWORD is configured.\n');
    return false;
  }
  if (hasValidPassword(req)) return true;
  res.writeHead(401, {
    'www-authenticate': 'Basic realm="Marble Rush", charset="UTF-8"',
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end('Authentication required.\n');
  return false;
}

function proxyHeaders(req) {
  const headers = { ...req.headers };
  for (const header of Object.keys(headers)) {
    if (HOP_BY_HOP_HEADERS.has(header.toLowerCase())) delete headers[header];
  }
  delete headers.authorization;
  headers.host = `${TARGET_HOST}:${TARGET_PORT}`;
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-for'] = [req.socket.remoteAddress, req.headers['x-forwarded-for']].filter(Boolean).join(', ');
  return headers;
}

function sendBadGateway(res, error) {
  res.writeHead(502, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(`Marble Rush dev server is unavailable: ${error.message}\n`);
}

function handleRequest(req, res) {
  if (!requireAuth(req, res)) return;
  const upstream = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: req.url,
    headers: proxyHeaders(req),
  }, (upstreamRes) => {
    const responseHeaders = { ...upstreamRes.headers };
    for (const header of Object.keys(responseHeaders)) {
      if (HOP_BY_HOP_HEADERS.has(header.toLowerCase())) delete responseHeaders[header];
    }
    res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
    upstreamRes.pipe(res);
  });
  upstream.on('error', (error) => sendBadGateway(res, error));
  req.pipe(upstream);
}

const server = https.createServer({
  cert: readFileSync(TLS_CERT),
  key: readFileSync(TLS_KEY),
}, handleRequest);

server.on('upgrade', (req, socket, head) => {
  if (!requireAuth(req, {
    writeHead(statusCode, headers) {
      const reason = statusCode === 401 ? 'Unauthorized' : 'Forbidden';
      socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\n`);
      for (const [key, value] of Object.entries(headers || {})) socket.write(`${key}: ${value}\r\n`);
      socket.write('\r\n');
    },
    end(body = '') {
      socket.end(body);
    },
  })) return;

  const upstream = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: req.url,
    headers: {
      ...proxyHeaders(req),
      connection: 'Upgrade',
      upgrade: req.headers.upgrade,
    },
  });
  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    socket.write(`HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage}\r\n`);
    for (const [key, value] of Object.entries(upstreamRes.headers)) socket.write(`${key}: ${value}\r\n`);
    socket.write('\r\n');
    if (upstreamHead?.length) socket.write(upstreamHead);
    if (head?.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[marble-proxy] https://${LISTEN_HOST}:${LISTEN_PORT} -> http://${TARGET_HOST}:${TARGET_PORT}`);
});
