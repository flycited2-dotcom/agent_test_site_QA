import { test, expect } from '@playwright/test';
import { buildIssueSnapshot } from '../src/reporters/issue-store';
import type { ReportModel } from '../src/reporters/report-model';

test('issue snapshot deduplicates repeated failures and keeps counters', () => {
  const model: ReportModel = {
    summary: {
      date: '2026-05-10T10:00:00.000Z',
      site: 'https://example.com/',
      mode: 'smoke',
      total: 2,
      passed: 0,
      failed: 2
    },
    rows: [
      {
        date: '2026-05-10T10:00:00.000Z',
        site: 'https://example.com/',
        mode: 'smoke',
        status: 'failed',
        severity: 'High',
        title: 'catalog opens',
        file: 'tests/catalog.spec.ts',
        details: 'https://example.com/catalog — Timeout 15000ms exceeded'
      },
      {
        date: '2026-05-10T10:00:00.000Z',
        site: 'https://example.com/',
        mode: 'smoke',
        status: 'failed',
        severity: 'High',
        title: 'catalog opens',
        file: 'tests/catalog.spec.ts',
        details: 'https://example.com/catalog — Timeout 15000ms exceeded'
      }
    ]
  };

  const snapshot = buildIssueSnapshot({ issues: [] }, model, '2026-05-10');

  expect(snapshot.issues).toHaveLength(1);
  expect(snapshot.issues[0]).toMatchObject({
    id: 'EXAMPLE-COM-20260510-001',
    occurrences: 2,
    status: 'new',
    site: 'https://example.com/'
  });
  expect(snapshot.daily.newIssues).toBe(1);
  expect(snapshot.daily.activeIssues).toBe(1);
});
