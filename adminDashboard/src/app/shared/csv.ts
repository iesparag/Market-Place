export interface CsvColumn<T> {
  label: string;
  value: (row: T) => unknown;
}

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV from rows + columns and trigger a browser download. */
export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(',')).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
