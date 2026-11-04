import { readFile, writeFile } from 'node:fs/promises';

export const TABLE_START = '<!-- build-table:start -->';
export const TABLE_END = '<!-- build-table:end -->';

const n = (value) => value.toLocaleString('en-US');

/**
 * @param {Array<{ category: string, source: string, fetched: number, kept: number, added: number, error?: string }>} rows
 * @returns {string} a Markdown table: entries fetched, kept after cleaning, and new beyond earlier sources
 */
export function formatTable(rows) {
  const lines = [
    '| List | Source | Fetched | Kept | New |',
    '| ---- | ------ | ------: | ---: | --: |',
  ];
  for (const row of rows) {
    const note = row.error ? ' (not available)' : '';
    lines.push(
      `| ${row.category} | ${row.source}${note} | ${n(row.fetched)} | ${n(row.kept)} | ${n(row.added)} |`,
    );
  }
  return lines.join('\n');
}

/**
 * Puts the table between the build-table markers of a Markdown file.
 * @param {string} text file contents
 * @param {string} table
 * @param {string} stamp for example "Built 5 Nov 2026"
 * @returns {string}
 */
export function replaceTable(text, table, stamp) {
  const block = `${TABLE_START}\n${stamp}\n\n${table}\n${TABLE_END}`;
  const start = text.indexOf(TABLE_START);
  const end = text.indexOf(TABLE_END);
  if (start === -1 || end === -1 || end < start) return `${text.trimEnd()}\n\n${block}\n`;
  return `${text.slice(0, start)}${block}${text.slice(end + TABLE_END.length)}`;
}

/** Writes the table into a Markdown file. */
export async function writeTable(file, table, stamp) {
  await writeFile(file, replaceTable(await readFile(file, 'utf8'), table, stamp));
}
