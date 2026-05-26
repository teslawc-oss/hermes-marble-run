#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';

const children = new Map();
let shuttingDown = false;

function start(name, command, args, env = {}) {
  console.log(`[marble-dev-stack] starting ${name}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env, BROWSER: 'none' },
  });
  children.set(name, child);

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
    if (!shuttingDown) stopAll(code && code !== 0 ? code : 1);
  });
  return child;
}

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
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

start('vite-5174', 'npm', ['run', 'dev:backend']);
start('proxy-5173', 'npm', ['run', 'proxy:https']);
