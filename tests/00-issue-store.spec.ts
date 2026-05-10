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

test('clean smoke run does not resolve a problem seen only in critical mode', () => {
  const failedCritical: ReportModel = {
    summary: {
      date: '2026-05-10T10:00:00.000Z',
      site: 'https://example.com/',
      mode: 'critical',
      total: 1,
      passed: 0,
      failed: 1
    },
    rows: [
      {
        date: '2026-05-10T10:00:00.000Z',
        site: 'https://example.com/',
        mode: 'critical',
        status: 'failed',
        severity: 'High',
        title: 'checkout request works',
        file: 'tests/checkout.spec.ts',
        details: 'Submit button is not clickable'
      }
    ]
  };

  const cleanSmoke: ReportModel = {
    summary: {
      date: '2026-05-10T11:00:00.000Z',
      site: 'https://example.com/',
      mode: 'smoke',
      total: 1,
      passed: 1,
      failed: 0
    },
    rows: [
      {
        date: '2026-05-10T11:00:00.000Z',
        site: 'https://example.com/',
        mode: 'smoke',
        status: 'passed',
        severity: 'Medium',
        title: 'home page opens',
        file: 'tests/smoke.spec.ts',
        details: ''
      }
    ]
  };

  const first = buildIssueSnapshot({ issues: [] }, failedCritical, '2026-05-10');
  const second = buildIssueSnapshot(first, cleanSmoke, '2026-05-10');

  expect(second.issues[0]).toMatchObject({
    status: 'new',
    modes: ['critical'],
    resolvedInModes: []
  });
  expect(second.daily.activeIssues).toBe(1);
  expect(second.daily.resolvedIssues).toBe(0);
});

test('clean rerun of the same mode resolves the problem for that mode', () => {
  const failedCritical: ReportModel = {
    summary: {
      date: '2026-05-10T10:00:00.000Z',
      site: 'https://example.com/',
      mode: 'critical',
      total: 1,
      passed: 0,
      failed: 1
    },
    rows: [
      {
        date: '2026-05-10T10:00:00.000Z',
        site: 'https://example.com/',
        mode: 'critical',
        status: 'failed',
        severity: 'High',
        title: 'checkout request works',
        file: 'tests/checkout.spec.ts',
        details: 'Submit button is not clickable'
      }
    ]
  };

  const cleanCritical: ReportModel = {
    summary: {
      date: '2026-05-10T12:00:00.000Z',
      site: 'https://example.com/',
      mode: 'critical',
      total: 1,
      passed: 1,
      failed: 0
    },
    rows: [
      {
        date: '2026-05-10T12:00:00.000Z',
        site: 'https://example.com/',
        mode: 'critical',
        status: 'passed',
        severity: 'High',
        title: 'checkout request works',
        file: 'tests/checkout.spec.ts',
        details: ''
      }
    ]
  };

  const first = buildIssueSnapshot({ issues: [] }, failedCritical, '2026-05-10');
  const second = buildIssueSnapshot(first, cleanCritical, '2026-05-10');

  expect(second.issues[0]).toMatchObject({
    status: 'resolved',
    modes: ['critical'],
    resolvedInModes: ['critical']
  });
  expect(second.daily.activeIssues).toBe(0);
  expect(second.daily.resolvedIssues).toBe(1);
});
