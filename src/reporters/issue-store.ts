import fs from 'node:fs';
import path from 'node:path';
import type { ReportModel, ReportRow } from './report-model';

export type IssueStatus = 'new' | 'active' | 'still_active' | 'resolved';

export type Issue = {
  id: string;
  fingerprint: string;
  site: string;
  title: string;
  file: string;
  severity: string;
  status: IssueStatus;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  modes: string[];
  resolvedInModes: string[];
  examples: string[];
};

export type IssueState = {
  issues: Issue[];
};

export type IssueSnapshot = IssueState & {
  daily: {
    date: string;
    activeIssues: number;
    newIssues: number;
    resolvedIssues: number;
  };
};

const developerDir = path.resolve('reports/developer');
const statePath = path.join(developerDir, 'state/issues.json');

function slugHost(site: string): string {
  return new URL(site).host.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase();
}

function issuePrefix(site: string, date: string): string {
  return `${slugHost(site)}-${date.replace(/-/g, '')}`;
}

function normalizeDetails(details: string): string {
  return details
    .replace(/\bat .*$/gim, '')
    .replace(/\d{4,}/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function issueFingerprint(row: ReportRow): string {
  return [row.site, row.file, row.title, normalizeDetails(row.details)].join('|').toLowerCase();
}

function nextIssueId(issues: Issue[], site: string, date: string): string {
  const prefix = issuePrefix(site, date);
  const count = issues.filter(issue => issue.id.startsWith(prefix)).length + 1;
  return `${prefix}-${String(count).padStart(3, '0')}`;
}

export function buildIssueSnapshot(previous: IssueState, model: ReportModel, date: string): IssueSnapshot {
  const issues = previous.issues.map(issue => ({
    ...issue,
    modes: [...issue.modes],
    resolvedInModes: [...(issue.resolvedInModes || (issue.status === 'resolved' ? issue.modes : []))],
    examples: [...issue.examples]
  }));
  const seen = new Set<string>();
  let newIssues = 0;

  for (const row of model.rows.filter(item => item.status !== 'passed')) {
    const fingerprint = issueFingerprint(row);
    seen.add(fingerprint);
    const existing = issues.find(issue => issue.fingerprint === fingerprint);
    if (existing) {
      existing.resolvedInModes = existing.resolvedInModes.filter(mode => mode !== row.mode);
      existing.status = existing.status === 'new'
        ? 'new'
        : existing.firstSeen.startsWith(date) ? 'active' : 'still_active';
      existing.lastSeen = model.summary.date;
      existing.occurrences += 1;
      if (!existing.modes.includes(row.mode)) existing.modes.push(row.mode);
      if (row.details && !existing.examples.includes(row.details)) {
        existing.examples = [row.details, ...existing.examples].slice(0, 3);
      }
      continue;
    }

    newIssues += 1;
    issues.push({
      id: nextIssueId(issues, row.site, date),
      fingerprint,
      site: row.site,
      title: row.title,
      file: row.file,
      severity: row.severity,
      status: 'new',
      firstSeen: model.summary.date,
      lastSeen: model.summary.date,
      occurrences: 1,
      modes: [row.mode],
      resolvedInModes: [],
      examples: row.details ? [row.details] : []
    });
  }

  let resolvedIssues = 0;
  for (const issue of issues) {
    if (issue.site !== model.summary.site || seen.has(issue.fingerprint) || issue.status === 'resolved') {
      continue;
    }
    if (issue.modes.includes(model.summary.mode) && !issue.resolvedInModes.includes(model.summary.mode)) {
      issue.resolvedInModes.push(model.summary.mode);
      if (issue.resolvedInModes.length >= issue.modes.length) {
        issue.status = 'resolved';
        resolvedIssues += 1;
      }
    }
  }

  const activeIssues = issues.filter(issue => issue.site === model.summary.site && issue.status !== 'resolved').length;
  return { issues, daily: { date, activeIssues, newIssues, resolvedIssues } };
}

export function readIssueState(): IssueState {
  if (!fs.existsSync(statePath)) return { issues: [] };
  return JSON.parse(fs.readFileSync(statePath, 'utf8')) as IssueState;
}

export function writeIssueState(state: IssueState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ issues: state.issues }, null, 2), 'utf8');
}

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function issuesToCsv(issues: Issue[]): string {
  const header = ['ID', 'Статус', 'Сайт', 'Важность', 'Задача', 'Файл', 'Повторы', 'Первый раз', 'Последний раз', 'Режимы', 'Закрыто в режимах'];
  const lines = issues.map(issue => [
    issue.id,
    issue.status,
    issue.site,
    issue.severity,
    issue.title,
    issue.file,
    issue.occurrences,
    issue.firstSeen,
    issue.lastSeen,
    issue.modes.join(', '),
    issue.resolvedInModes.join(', ')
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\n') + '\n';
}

function issuesToMarkdown(title: string, issues: Issue[], intro: string): string {
  let md = `# ${title}\n\n${intro}\n\n`;
  if (!issues.length) return `${md}Активных проблем нет.\n`;
  for (const issue of issues) {
    md += `## ${issue.id}: ${issue.title}\n\n`;
    md += `- Статус: ${issue.status}\n`;
    md += `- Сайт: ${issue.site}\n`;
    md += `- Важность: ${issue.severity}\n`;
    md += `- Файл теста: ${issue.file}\n`;
    md += `- Повторилась: ${issue.occurrences} раз\n`;
    md += `- Первый раз: ${issue.firstSeen}\n`;
    md += `- Последний раз: ${issue.lastSeen}\n`;
    md += `- Режимы: ${issue.modes.join(', ')}\n`;
    if (issue.resolvedInModes.length) md += `- Закрыто в режимах: ${issue.resolvedInModes.join(', ')}\n`;
    md += `\n`;
    if (issue.examples[0]) md += `Последний пример:\n\n\`\`\`\n${issue.examples[0]}\n\`\`\`\n\n`;
  }
  return md;
}

export function writeDeveloperReports(snapshot: IssueSnapshot, site: string): void {
  const active = snapshot.issues.filter(issue => issue.site === site && issue.status !== 'resolved');
  const today = snapshot.issues.filter(issue => issue.site === site && issue.lastSeen.startsWith(snapshot.daily.date));
  const dailyDir = path.join(developerDir, 'daily', snapshot.daily.date);

  fs.mkdirSync(developerDir, { recursive: true });
  fs.mkdirSync(dailyDir, { recursive: true });

  fs.writeFileSync(path.join(developerDir, 'QA_ACTIVE_ISSUES.md'), issuesToMarkdown('Активные QA проблемы', active, `Сайт: ${site}`), 'utf8');
  fs.writeFileSync(path.join(developerDir, 'QA_ACTIVE_ISSUES.csv'), issuesToCsv(active), 'utf8');
  fs.writeFileSync(path.join(dailyDir, 'QA_DAILY_SUMMARY.md'), issuesToMarkdown(`QA отчёт за ${snapshot.daily.date}`, today, `Сайт: ${site}\n\nАктивных: ${snapshot.daily.activeIssues}. Новых: ${snapshot.daily.newIssues}. Решённых: ${snapshot.daily.resolvedIssues}.`), 'utf8');
  fs.writeFileSync(path.join(dailyDir, 'QA_DAILY_ISSUES.csv'), issuesToCsv(today), 'utf8');
}
