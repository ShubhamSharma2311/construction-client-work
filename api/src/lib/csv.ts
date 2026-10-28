export type CsvCell = string | number | null;

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvCell;
}

// Excel runs a cell starting with these as a formula; exports are opened in Excel.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

// Without a byte-order mark Excel reads the file as ANSI and garbles ₹ and Hindi names.
const UTF8_BOM = "﻿";

function escapeCell(cell: CsvCell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return String(cell);
  const safe = FORMULA_PREFIX.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv<Row>(columns: readonly CsvColumn<Row>[], rows: readonly Row[]): string {
  const lines = [columns.map((column) => escapeCell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(","));
  }
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}
