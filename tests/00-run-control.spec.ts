import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { formatRunControlState, manualRunLogPath, readRunControlState, startManualRun } from '../src/telegram/run-control';

test('formats paused agent state without an active run', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-run-control-'));
  const storage = path.join(tmp, 'storage');
  fs.mkdirSync(storage, { recursive: true });
  fs.writeFileSync(path.join(storage, 'control.json'), JSON.stringify({
    paused: true,
    updatedAt: '2026-05-17T22:27:01.829Z'
  }), 'utf8');

  const state = readRunControlState({
    controlPath: path.join(storage, 'control.json'),
    lockPath: path.join(storage, 'run.lock.json')
  });
  const text = formatRunControlState(state);

  expect(text).toContain('Расписание: пауза');
  expect(text).toContain('Активный прогон: нет');
  expect(text).toContain('2026-05-17T22:27:01.829Z');
});

test('formats active run lock details', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-run-control-'));
  const storage = path.join(tmp, 'storage');
  fs.mkdirSync(storage, { recursive: true });
  fs.writeFileSync(path.join(storage, 'control.json'), JSON.stringify({ paused: false }), 'utf8');
  fs.writeFileSync(path.join(storage, 'run.lock.json'), JSON.stringify({
    depth: 'enterprise',
    pid: 1234,
    startedAt: '2026-05-18T06:10:22.800Z'
  }), 'utf8');

  const state = readRunControlState({
    controlPath: path.join(storage, 'control.json'),
    lockPath: path.join(storage, 'run.lock.json')
  });
  const text = formatRunControlState(state);

  expect(text).toContain('Расписание: активно');
  expect(text).toContain('Активный прогон: enterprise');
  expect(text).toContain('PID: 1234');
  expect(text).toContain('2026-05-18T06:10:22.800Z');
});

test('builds safe manual run log file names', () => {
  const logPath = manualRunLogPath(
    'enterprise',
    new Date('2026-05-18T11:08:49.625Z'),
    path.join('storage', 'manual-runs')
  ).replace(/\\/g, '/');

  expect(logPath).toBe('storage/manual-runs/2026-05-18T11-08-49-625Z-enterprise.log');
});

test('writes manual run output to a log file', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-run-control-'));
  const started = startManualRun(process.execPath, ['-e', 'console.log("manual run visible")'], 'smoke', {
    logDir: tmp,
    now: new Date('2026-05-18T11:08:49.625Z'),
    detached: false,
    shell: false
  });

  await expect(started.done).resolves.toBe(0);
  const log = fs.readFileSync(started.logPath, 'utf8');

  expect(log).toContain('Manual QA run started:');
  expect(log).toContain('manual run visible');
  expect(log).toContain('Manual QA run finished: code=0');
});
