import fs from 'node:fs';
import path from 'node:path';
import { config } from '../utils/config';
import { buildReportModel, toCsv } from './report-model';
import { buildIssueSnapshot, readIssueState, writeDeveloperReports, writeIssueState } from './issue-store';
import { writeCoverageReports } from './coverage-report';

const jsonPath = path.resolve('reports/json/results.json');
const mdDir = path.resolve('reports/markdown');
const spreadsheetDir = path.resolve('reports/spreadsheet');
fs.mkdirSync(mdDir, { recursive: true });
fs.mkdirSync(spreadsheetDir, { recursive: true });

if (!fs.existsSync(jsonPath)) {
  fs.writeFileSync(path.join(mdDir, 'summary.md'), `# QA отчёт

Файл результатов не найден: ${jsonPath}
`, 'utf8');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const model = buildReportModel(data, config.baseUrl, process.env.QA_MODE || 'manual');
const day = model.summary.date.slice(0, 10);
const issueSnapshot = buildIssueSnapshot(readIssueState(), model, day);
writeIssueState(issueSnapshot);
writeDeveloperReports(issueSnapshot, model.summary.site);
writeCoverageReports(model, day);

let md = `# QA отчёт по сайту ${model.summary.site}

`;
md += `Дата: ${model.summary.date}

`;
md += `## Сводка

`;
md += `- Всего тестов: ${model.summary.total}
`;
md += `- Успешно: ${model.summary.passed}
`;
md += `- Ошибки: ${model.summary.failed}
`;
md += `- Режим: ${model.summary.mode}

`;

md += `Покрытие запуска: reports/developer/QA_COVERAGE.md

`;

const failed = model.rows.filter(row => row.status !== 'passed');
if (failed.length) {
  md += `## Ошибки и задачи разработчику

`;
  failed.forEach((f, idx) => {
    md += `### ${idx + 1}. [${f.severity}] ${f.title}

`;
    md += `Файл теста: ${f.file || 'не определён'}

`;
    md += `Фактический результат: сценарий завершился ошибкой.

`;
    md += `Ожидаемый результат: сценарий должен проходить без ошибок, без 4xx/5xx, без некликабельных элементов и без нарушения пользовательского пути.

`;
    if (f.details) md += `Технические детали:

\`\`\`
${f.details}
\`\`\`

`;
    md += `Рекомендация: открыть HTML-отчёт и trace/video в папке reports/test-results, воспроизвести сценарий, исправить причину, затем запустить retest по соответствующему spec-файлу.

`;
  });
} else {
  md += `## Критических ошибок не обнаружено

Все запущенные сценарии прошли успешно.
`;
}

fs.writeFileSync(path.join(mdDir, 'summary.md'), md, 'utf8');
fs.writeFileSync(path.join(spreadsheetDir, 'summary.csv'), toCsv(model), 'utf8');
console.log(md);
