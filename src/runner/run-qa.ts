import { spawnSync } from 'node:child_process';
import type { TestDepth } from '../utils/runtime-config';

const depth = (process.argv[2] || 'smoke') as TestDepth;
const allowed: TestDepth[] = ['smoke', 'critical', 'full'];

if (!allowed.includes(depth)) {
  throw new Error(`Неизвестная глубина проверки: ${depth}`);
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

const testStatus = run(`test:${depth}`);

for (const script of ['qa:summary', 'qa:telegram', 'qa:drive', 'qa:email']) {
  const status = run(script);
  if (status !== 0) console.error(`${script} завершился с кодом ${status}`);
}

process.exit(testStatus);
