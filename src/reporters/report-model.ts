export type ReportRow = {
  date: string;
  site: string;
  mode: string;
  status: string;
  severity: string;
  title: string;
  file: string;
  details: string;
};

export type ReportModel = {
  summary: {
    date: string;
    site: string;
    mode: string;
    total: number;
    passed: number;
    failed: number;
  };
  rows: ReportRow[];
};

type PlaywrightResult = {
  status?: string;
  errors?: Array<{ message?: string } | unknown>;
};

type PlaywrightTest = {
  results?: PlaywrightResult[];
};

type PlaywrightSpec = {
  title?: string;
  tests?: PlaywrightTest[];
};

type PlaywrightSuite = {
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
};

type PlaywrightJson = {
  stats?: {
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
  suites?: PlaywrightSuite[];
};

export function severity(title: string): string {
  if (/checkout|корзин|заказ|заяв|форм|оплат/i.test(title)) return 'Critical/High';
  if (/catalog|карточ|фильтр|поиск|товар/i.test(title)) return 'High';
  if (/seo|description|h1|robots|sitemap/i.test(title)) return 'Medium';
  return 'Medium';
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

export function buildReportModel(data: PlaywrightJson, site: string, mode: string, date = new Date().toISOString()): ReportModel {
  const rows: ReportRow[] = [];

  function walk(suites: PlaywrightSuite[]) {
    for (const suite of suites || []) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const last = test.results?.at(-1);
          const status = last?.status || 'unknown';
          const title = spec.title || 'Без названия';
          const details = (test.results || [])
            .flatMap(result => result.errors || [])
            .map(error => {
              if (error && typeof error === 'object' && 'message' in error) {
                return stripAnsi(String(error.message || ''));
              }
              return stripAnsi(JSON.stringify(error));
            })
            .filter(Boolean)
            .join('\n\n');

          rows.push({
            date,
            site,
            mode,
            status,
            severity: severity(title),
            title,
            file: suite.file || '',
            details
          });
        }
      }
      walk(suite.suites || []);
    }
  }

  walk(data.suites || []);

  const passed = rows.filter(row => row.status === 'passed').length;
  const failed = rows.length - passed;
  const statsTotal = (data.stats?.expected || 0) + (data.stats?.unexpected || 0) + (data.stats?.flaky || 0) + (data.stats?.skipped || 0);

  return {
    summary: {
      date,
      site,
      mode,
      total: rows.length || statsTotal,
      passed,
      failed
    },
    rows
  };
}

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(model: ReportModel): string {
  const header = ['Дата', 'Сайт', 'Режим', 'Статус', 'Важность', 'Тест', 'Файл', 'Детали'];
  const lines = model.rows.map(row => [
    row.date,
    row.site,
    row.mode,
    row.status,
    row.severity,
    row.title,
    row.file,
    row.details
  ].map(csvCell).join(','));

  return [header.join(','), ...lines].join('\n') + '\n';
}
