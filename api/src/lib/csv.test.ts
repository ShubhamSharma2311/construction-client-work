import { describe, expect, it } from "vitest";
import { toCsv, type CsvColumn } from "./csv.ts";

interface Row {
  name: string;
  amount: number;
  note: string | null;
}

const columns: CsvColumn<Row>[] = [
  { header: "Name", value: (row) => row.name },
  { header: "Amount", value: (row) => row.amount },
  { header: "Note", value: (row) => row.note },
];

const BOM = "﻿";

describe("toCsv", () => {
  it("writes a header and one CRLF-terminated line per row", () => {
    expect(toCsv(columns, [{ name: "Ramesh", amount: 1500, note: null }])).toBe(
      `${BOM}Name,Amount,Note\r\nRamesh,1500,\r\n`,
    );
  });

  it("starts with a UTF-8 BOM so Excel shows ₹ and Hindi names correctly", () => {
    expect(toCsv(columns, [{ name: "रमेश", amount: 1, note: "₹" }]).startsWith(BOM)).toBe(true);
  });

  it("writes only the header for no rows", () => {
    expect(toCsv(columns, [])).toBe(`${BOM}Name,Amount,Note\r\n`);
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    const csv = toCsv(columns, [{ name: 'Ram "Bhai", Jodhpur', amount: 1, note: "line1\nline2" }]);
    expect(csv).toBe(`${BOM}Name,Amount,Note\r\n"Ram ""Bhai"", Jodhpur",1,"line1\nline2"\r\n`);
  });

  it.each(["=SUM(A1)", "+91 98", "-cmd", "@x", "\tTab"])(
    "neutralises spreadsheet formula text %j",
    (name) => {
      const line = toCsv(columns, [{ name, amount: 1, note: null }]).split("\r\n")[1];
      expect(line?.startsWith("'") || line?.startsWith(`"'`)).toBe(true);
    },
  );

  it("keeps negative numbers numeric", () => {
    expect(toCsv(columns, [{ name: "x", amount: -250, note: null }])).toContain("x,-250,");
  });
});
