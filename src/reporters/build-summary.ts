import fs from 'node:fs';
import path from 'node:path';
import { config } from '../utils/config';

const jsonPath = path.resolve('reports/json/results.json');
const mdDir = path.resolve('reports/markdown');
fs.mkdirSync(mdDir, { recursive: true });

function severity(title: string): string {
  if (/checkout|корзин|заказ|заяв|форм|оплат/i.test(title)) return 'Critical/High';
  if (/catalog|карточ|фильтр|поиск|товар/i.test(title)) return 'High';
  if (/seo|description|h1|robots|sitemap/i.test(title)) return 'Medium';
  return 'Medium';
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

if (!fs.existsSync(jsonPath)) {
  fs.writeFileSync(path.join(mdDir, 'summary.md'), `# QA отчёт

Файл результатов не найден: ${jsonPath}
`, 'utf8');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const stats = data.stats || {};
const suites = data.suites || [];
const failed: any[] = [];
const passed: any[] = [];
function walk(specs: any[]) {
  for (const s of specs || []) {
    for (const spec of s.specs || []) {
      for (const test of spec.tests || []) {
        const status = test.results?.at(-1)?.status || 'unknown';
        const item = { title: spec.title, status, file: s.file, errors: test.results?.flatMap((r: any) => r.errors || []) || [] };
        if (status === 'passed') passed.push(item); else failed.push(item);
      }
    }
    walk(s.suites || []);
  }
}
walk(suites);

const now = new Date().toISOString();
const total = passed.length + failed.length || stats.expected + stats.unexpected + stats.flaky + stats.skipped || 0;
let md = `# QA отчёт по сайту ${config.baseUrl}

`;
md += `Дата: ${now}

`;
md += `## Сводка

`;
md += `- Всего тестов: ${total}
`;
md += `- Успешно: ${passed.length}
`;
md += `- Ошибки: ${failed.length}
`;
md += `- Режим: ${process.env.QA_MODE || 'manual'}

`;

if (failed.length) {
  md += `## Ошибки и задачи разработчику

`;
  failed.forEach((f, idx) => {
    md += `### ${idx + 1}. [${severity(f.title)}] ${f.title}

`;
    md += `Файл теста: ${f.file || 'не определён'}

`;
    md += `Фактический результат: сценарий завершился ошибкой.

`;
    md += `Ожидаемый результат: сценарий должен проходить без ошибок, без 4xx/5xx, без некликабельных элементов и без нарушения пользовательского пути.

`;
    if (f.errors.length) md += `Технические детали:

\`\`\`
${f.errors.map((e: any) => stripAnsi(e.message || JSON.stringify(e))).join('\n\n')}
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
console.log(md);
