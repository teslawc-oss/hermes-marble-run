#!/usr/bin/env node
import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

const children = new Map();
const externalServices = new Set();
let shuttingDown = false;
let keepAliveTimer = null;

function isPortListening(host, port, timeoutMs = 350) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (listening) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

function ensureKeepAlive() {
  if (children.size || !externalServices.size || keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {}, 60_000);
}

function clearKeepAliveIfManagedChildrenExist() {
  if (!keepAliveTimer || !children.size) return;
  clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

function start(name, command, args, env = {}) {
  console.log(`[marble-dev-stack] starting ${name}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env, BROWSER: 'none' },
  });
  children.set(name, child);
  clearKeepAliveIfManagedChildrenExist();

  const prefix = `[${name}] `;
  child.stdout.on('data', (chunk) => process.stdout.write(prefix + chunk.toString().replace(/\n$/, '').replace(/\n/g, `\n${prefix}`) + '\n'));
  child.stderr.on('data', (chunk) => process.stderr.write(prefix + chunk.toString().replace(/\n$/, '').replace(/\n/g, `\n${prefix}`) + '\n'));
  child.on('error', (error) => {
    console.error(`[marble-dev-stack] ${name} error: ${error.message}`);
    stopAll(1);
  });
  child.on('exit', (code, signal) => {
    children.delete(name);
    console.log(`[marble-dev-stack] ${name} exited: ${code ?? signal}`);
    if (!shuttingDown && children.size === 0 && externalServices.size > 0) {
      console.log(`[marble-dev-stack] managed children exited; keeping stack wrapper alive for external service(s): ${[...externalServices].join(', ')}`);
      ensureKeepAlive();
      return;
    }
    if (!shuttingDown) stopAll(code && code !== 0 ? code : 1);
  });
  return child;
}

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  console.log(`[marble-dev-stack] stopping ${children.size} child process(es)`);
  for (const child of children.values()) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => {
    for (const child of children.values()) {
      if (!child.killed) child.kill('SIGKILL');
    }
    process.exit(exitCode);
  }, 2500).unref();
  if (children.size === 0) process.exit(exitCode);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

const viteListening = await isPortListening('127.0.0.1', 5174);
if (viteListening) {
  externalServices.add('vite-5174');
  console.log('[marble-dev-stack] vite-5174 already listening; reusing existing backend instead of starting another Vite process');
} else {
  start('vite-5174', 'npm', ['run', 'dev:backend']);
}

const proxyListening = await isPortListening('127.0.0.1', 5173);
if (proxyListening) {
  externalServices.add('proxy-5173');
  console.log('[marble-dev-stack] proxy-5173 already listening; reusing existing HTTPS proxy instead of starting another proxy process');
} else {
  start('proxy-5173', 'npm', ['run', 'proxy:https']);
}

ensureKeepAlive();
