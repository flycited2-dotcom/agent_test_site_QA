import { test, expect } from '@playwright/test';
import { buildReportModel, toCsv } from '../src/reporters/report-model';

test('report model builds spreadsheet rows from Playwright JSON', () => {
  const model = buildReportModel({
    stats: { expected: 1, unexpected: 1, flaky: 0, skipped: 0 },
    suites: [{
      file: 'tests/example.spec.ts',
      specs: [{
        title: 'catalog link works',
        tests: [{
          results: [{
            status: 'failed',
            errors: [{ message: 'Timeout, line 1\nline 2' }]
          }]
        }]
      }]
    }]
  }, 'https://example.test/', 'critical');

  expect(model.summary.total).toBe(1);
  expect(model.summary.failed).toBe(1);
  expect(model.rows[0]).toMatchObject({
    status: 'failed',
    severity: 'High',
    file: 'tests/example.spec.ts'
  });

  const csv = toCsv(model);
  expect(csv).toContain('Дата,Сайт,Режим,Статус,Важность,Тест,Файл,Детали');
  expect(csv).toContain('"Timeout, line 1\nline 2"');
});

test('report model separates skipped checks from real failures', () => {
  const model = buildReportModel({
    stats: { expected: 1, unexpected: 1, flaky: 0, skipped: 1 },
    suites: [{
      file: 'tests/example.spec.ts',
      specs: [
        { title: 'passes', tests: [{ status: 'expected', results: [{ status: 'passed' }] }] },
        { title: 'fails', tests: [{ status: 'unexpected', results: [{ status: 'failed', errors: [{ message: 'boom' }] }] }] },
        { title: 'skips', tests: [{ status: 'skipped', results: [{ status: 'skipped' }] }] }
      ]
    }]
  }, 'https://example.test/', 'full');

  expect(model.summary).toMatchObject({
    total: 3,
    passed: 1,
    failed: 1,
    skipped: 1
  });
  expect(model.rows.map(row => row.status)).toEqual(['passed', 'failed', 'skipped']);
});
