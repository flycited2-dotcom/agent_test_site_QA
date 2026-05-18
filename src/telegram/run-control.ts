import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { TestDepth } from '../utils/runtime-config';

export type ControlState = {
  paused?: boolean;
  updatedAt?: string;
  restartedAt?: string;
};

export type RunLock = {
  pid?: number;
  depth?: string;
  startedAt?: string;
};

export type RunControlState = {
  control?: ControlState;
  lock?: RunLock;
};

export type RunControlPaths = {
  controlPath?: string;
  lockPath?: string;
};

export type ManualRunOptions = {
  logDir?: string;
  now?: Date;
  detached?: boolean;
  shell?: boolean;
  env?: NodeJS.ProcessEnv;
};

export type StartedManualRun = {
  pid?: number;
  logPath: string;
  done: Promise<number | null>;
};

function readJson<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export function readRunControlState(paths: RunControlPaths = {}): RunControlState {
  const controlPath = paths.controlPath || path.resolve('storage/control.json');
  const lockPath = paths.lockPath || path.resolve('storage/run.lock.json');

  return {
    control: readJson<ControlState>(controlPath),
    lock: readJson<RunLock>(lockPath)
  };
}

export function formatRunControlState(state: RunControlState): string {
  const paused = state.control?.paused === true;
  const changedAt = state.control?.updatedAt || state.control?.restartedAt;
  const lines = [
    'Состояние агента:',
    `Расписание: ${paused ? 'пауза' : 'активно'}${changedAt ? ` (${changedAt})` : ''}`
  ];

  if (state.lock) {
    const details = [
      state.lock.depth || 'unknown',
      state.lock.pid ? `PID: ${state.lock.pid}` : '',
      state.lock.startedAt ? `старт: ${state.lock.startedAt}` : ''
    ].filter(Boolean);
    lines.push(`Активный прогон: ${details.join(', ')}`);
  } else {
    lines.push('Активный прогон: нет');
  }

  return lines.join('\n');
}

export function manualRunLogPath(depth: TestDepth | string, now = new Date(), logDir = path.resolve('storage/manual-runs')): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const safeDepth = String(depth).replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  return path.join(logDir, `${stamp}-${safeDepth}.log`);
}

export function startManualRun(command: string, args: string[], depth: TestDepth, options: ManualRunOptions = {}): StartedManualRun {
  const logPath = manualRunLogPath(depth, options.now || new Date(), options.logDir);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const log = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn(command, args, {
    detached: options.detached ?? true,
    shell: options.shell ?? process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: options.env || process.env
  });

  const header = `[${new Date().toISOString()}] Manual QA run started: ${command} ${args.join(' ')} pid=${child.pid ?? 'unknown'} log=${logPath}\n`;
  process.stdout.write(header);
  log.write(header);

  const pipeChunk = (stream: NodeJS.WriteStream, chunk: Buffer | string): void => {
    stream.write(chunk);
    log.write(chunk);
  };

  child.stdout?.on('data', chunk => pipeChunk(process.stdout, chunk));
  child.stderr?.on('data', chunk => pipeChunk(process.stderr, chunk));

  const done = new Promise<number | null>(resolve => {
    let settled = false;
    const finish = (code: number | null, signal?: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      const footer = `[${new Date().toISOString()}] Manual QA run finished: code=${code ?? 'null'} signal=${signal ?? 'none'} log=${logPath}\n`;
      process.stdout.write(footer);
      log.end(footer);
      resolve(code);
    };

    child.on('error', error => {
      const line = `[${new Date().toISOString()}] Manual QA run error: ${error.message}\n`;
      process.stderr.write(line);
      log.write(line);
      finish(1);
    });
    child.on('close', finish);
  });

  if (options.detached ?? true) child.unref();

  return { pid: child.pid, logPath, done };
}
