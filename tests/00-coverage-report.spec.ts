import { test, expect } from '@playwright/test';
import { buildCoverageReport } from '../src/reporters/coverage-report';
import type { ReportModel } from '../src/reporters/report-model';

test('coverage report explains whether the run was shallow or deep', () => {
  const model: ReportModel = {
    summary: {
      date: '2026-05-10T12:00:00.000Z',
      site: 'https://example.com/',
      mode: 'critical',
      total: 3,
      passed: 3,
      failed: 0
    },
    rows: [
      {
        date: '2026-05-10T12:00:00.000Z',
        site: 'https://example.com/',
        mode: 'critical',
        status: 'passed',
        severity: 'High',
        title: 'buyer journey works',
        file: 'tests/07-user-journeys.spec.ts',
        details: ''
      },
      {
        date: '2026-05-10T12:00:00.000Z',
        site: 'https://example.com/',
        mode: 'critical',
        status: 'passed',
        severity: 'High',
        title: 'forms work',
        file: 'tests/03-forms-links.spec.ts',
        details: ''
      },
      {
        date: '2026-05-10T12:00:00.000Z',
        site: 'https://example.com/',
        mode: 'critical',
        status: 'passed',
        severity: 'High',
        title: 'forms work',
        file: 'tests/03-forms-links.spec.ts',
        details: ''
      }
    ]
  };

  const report = buildCoverageReport(model, { deepSteps: [] });

  expect(report.markdown).toContain('Режим: critical');
  expect(report.markdown).toContain('tests/07-user-journeys.spec.ts');
  expect(report.markdown).toContain('не полный обход ассортимента');
  expect(report.csv).toContain('tests/03-forms-links.spec.ts,2');
});
