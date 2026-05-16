import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { TestDepth } from '../utils/runtime-config';

const depth = (process.argv[2] || 'smoke') as TestDepth;
const allowed: TestDepth[] = ['smoke', 'critical', 'full', 'enterprise'];
const lockPath = path.resolve('storage/run.lock.json');

if (!allowed.includes(depth)) {
  throw new Error(`Неизвестная глубина проверки: ${depth}`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(): boolean {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid?: number; depth?: string; startedAt?: string };
      if (lock.pid && isProcessAlive(lock.pid)) {
        console.log(`QA run skipped: уже идёт проверка ${lock.depth || 'unknown'} с pid ${lock.pid}, startedAt ${lock.startedAt || 'unknown'}`);
        return false;
      }
    } catch {
      // Bad lock file is treated as stale and overwritten.
    }
  }

  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, depth, startedAt: new Date().toISOString() }, null, 2), 'utf8');
  return true;
}

function releaseLock(): void {
  if (!fs.existsSync(lockPath)) return;
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid?: number };
    if (lock.pid === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {
    fs.rmSync(lockPath, { force: true });
  }
}

function run(script: string): number {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['run', script], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, QA_MODE: depth }
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

if (!acquireLock()) process.exit(0);

let exitCode = 1;
try {
  exitCode = run(`test:${depth}`);
  for (const script of ['qa:summary', 'qa:telegram', 'qa:drive', 'qa:email']) {
    const status = run(script);
    if (status !== 0) console.error(`${script} завершился с кодом ${status}`);
  }
} finally {
  releaseLock();
}

process.exit(exitCode);
