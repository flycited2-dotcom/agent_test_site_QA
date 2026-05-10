import fs from 'node:fs';
import path from 'node:path';

export type ReportFile = {
  path: string;
  name: string;
  mimeType: string;
  group: 'active' | 'daily' | 'summary';
};

export function siteSlug(site: string): string {
  return new URL(site).host.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function listReportFiles(day = todayIso()): ReportFile[] {
  const files: ReportFile[] = [
    {
      path: path.resolve('reports/developer/QA_ACTIVE_ISSUES.md'),
      name: 'QA_ACTIVE_ISSUES.md',
      mimeType: 'text/markdown',
      group: 'active'
    },
    {
      path: path.resolve('reports/developer/QA_ACTIVE_ISSUES.csv'),
      name: 'QA_ACTIVE_ISSUES.csv',
      mimeType: 'text/csv',
      group: 'active'
    },
    {
      path: path.resolve('reports/developer/QA_COVERAGE.md'),
      name: 'QA_COVERAGE.md',
      mimeType: 'text/markdown',
      group: 'summary'
    },
    {
      path: path.resolve('reports/developer/QA_COVERAGE.csv'),
      name: 'QA_COVERAGE.csv',
      mimeType: 'text/csv',
      group: 'summary'
    },
    {
      path: path.resolve(`reports/developer/daily/${day}/QA_DAILY_SUMMARY.md`),
      name: `QA_DAILY_SUMMARY_${day}.md`,
      mimeType: 'text/markdown',
      group: 'daily'
    },
    {
      path: path.resolve(`reports/developer/daily/${day}/QA_DAILY_ISSUES.csv`),
      name: `QA_DAILY_ISSUES_${day}.csv`,
      mimeType: 'text/csv',
      group: 'daily'
    },
    {
      path: path.resolve(`reports/developer/daily/${day}/QA_COVERAGE.md`),
      name: `QA_COVERAGE_${day}.md`,
      mimeType: 'text/markdown',
      group: 'daily'
    },
    {
      path: path.resolve(`reports/developer/daily/${day}/QA_COVERAGE.csv`),
      name: `QA_COVERAGE_${day}.csv`,
      mimeType: 'text/csv',
      group: 'daily'
    },
    {
      path: path.resolve('reports/markdown/summary.md'),
      name: `QA_RAW_SUMMARY_${day}.md`,
      mimeType: 'text/markdown',
      group: 'summary'
    },
    {
      path: path.resolve('reports/spreadsheet/summary.csv'),
      name: `QA_RAW_SUMMARY_${day}.csv`,
      mimeType: 'text/csv',
      group: 'summary'
    }
  ];

  return files.filter(file => fs.existsSync(file.path));
}
