import fs from 'node:fs';
import path from 'node:path';
import type { ReportModel } from './report-model';

export type CoverageArtifacts = {
  deepSteps?: string[];
};

export type CoverageReport = {
  markdown: string;
  csv: string;
};

const developerDir = path.resolve('reports/developer');

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function modeExplanation(mode: string): string {
  if (mode === 'smoke') {
    return 'Smoke проверяет доступность и базовые критичные сигналы. Это не полный обход ассортимента и не проверка всех заявок.';
  }
  if (mode === 'critical') {
    return 'Critical проверяет ключевые пользовательские пути, формы, ссылки и несколько сценариев покупателя. Это не полный обход ассортимента.';
  }
  if (mode === 'full') {
    return 'Full запускает весь набор проверок, включая глубокий commerce-аудит каталога, фильтров, сортировок, карточек, заявок и контактов.';
  }
  if (mode === 'enterprise') {
    return 'Enterprise запускает максимальный аудит: расширенный обход каталога и карточек, больше категорий, товаров, фильтров, сортировок, поисковых запросов, форм, заявок и контактов. Это режим для ночного или ручного тяжёлого запуска.';
  }
  return 'Ручной или служебный запуск. Смотрите список spec-файлов ниже, чтобы понять фактическое покрытие.';
}

function specCounts(model: ReportModel): Array<{ file: string; tests: number }> {
  const counts = new Map<string, number>();
  for (const row of model.rows) {
    const file = row.file || 'unknown';
    counts.set(file, (counts.get(file) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([file, tests]) => ({ file, tests }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function deepActionCounts(lines: string[]): Array<{ action: string; count: number }> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const match = line.match(/^\d+\.\s*([^:]+):/);
    if (!match) continue;
    const action = match[1].trim();
    counts.set(action, (counts.get(action) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => a.action.localeCompare(b.action));
}

export function buildCoverageReport(model: ReportModel, artifacts: CoverageArtifacts = {}): CoverageReport {
  const specs = specCounts(model);
  const deepSteps = artifacts.deepSteps || [];
  const deepCounts = deepActionCounts(deepSteps);

  let markdown = `# QA покрытие\n\n`;
  markdown += `Сайт: ${model.summary.site}\n\n`;
  markdown += `Дата: ${model.summary.date}\n\n`;
  markdown += `Режим: ${model.summary.mode}\n\n`;
  markdown += `${modeExplanation(model.summary.mode)}\n\n`;
  markdown += `## Итог запуска\n\n`;
  markdown += `- Всего проверок: ${model.summary.total}\n`;
  markdown += `- Успешно: ${model.summary.passed}\n`;
  markdown += `- Ошибки: ${model.summary.failed}\n\n`;
  markdown += `- Пропущено: ${model.summary.skipped || 0}\n\n`;

  markdown += `## Запущенные зоны\n\n`;
  if (!specs.length) {
    markdown += `Spec-файлы не найдены в Playwright JSON.\n\n`;
  } else {
    for (const spec of specs) {
      markdown += `- ${spec.file}: ${spec.tests}\n`;
    }
    markdown += `\n`;
  }

  markdown += `## Глубокий commerce-аудит\n\n`;
  if (!deepSteps.length) {
    markdown += ['full', 'enterprise'].includes(model.summary.mode)
      ? `Артефакты deep-аудита не найдены. Это нужно проверить по HTML/trace отчёту: ${model.summary.mode} должен создавать deep-catalog-steps.txt.\n`
      : `Deep-аудит ассортимента не запускался в этом режиме. Для полного обхода нажмите в боте "Full сейчас".\n`;
  } else {
    markdown += `Шагов deep-аудита: ${deepSteps.length}\n\n`;
    for (const item of deepCounts) {
      markdown += `- ${item.action}: ${item.count}\n`;
    }
  }

  const csv = [
    ['Файл', 'Проверок'].map(csvCell).join(','),
    ...specs.map(spec => [spec.file, spec.tests].map(csvCell).join(','))
  ].join('\n') + '\n';

  return { markdown, csv };
}

function findArtifactLines(root: string, fileName: string): string[] {
  if (!fs.existsSync(root)) return [];
  const lines: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === fileName) {
        lines.push(...fs.readFileSync(fullPath, 'utf8').split(/\r?\n/).filter(Boolean));
      }
    }
  }
  return lines;
}

export function writeCoverageReports(model: ReportModel, day: string): CoverageReport {
  const report = buildCoverageReport(model, {
    deepSteps: findArtifactLines(path.resolve('test-results'), 'deep-catalog-steps.txt')
  });
  const dailyDir = path.join(developerDir, 'daily', day);

  fs.mkdirSync(developerDir, { recursive: true });
  fs.mkdirSync(dailyDir, { recursive: true });
  fs.writeFileSync(path.join(developerDir, 'QA_COVERAGE.md'), report.markdown, 'utf8');
  fs.writeFileSync(path.join(developerDir, 'QA_COVERAGE.csv'), report.csv, 'utf8');
  fs.writeFileSync(path.join(dailyDir, 'QA_COVERAGE.md'), report.markdown, 'utf8');
  fs.writeFileSync(path.join(dailyDir, 'QA_COVERAGE.csv'), report.csv, 'utf8');

  return report;
}
