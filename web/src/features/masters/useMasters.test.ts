import { describe, expect, it } from "vitest";
import { filterOptions, pickerOptions } from "./useMasters.ts";

const khets = [
  { id: 1, name: "Ladnun road", isActive: true },
  { id: 2, name: "Old river bed", isActive: false },
  { id: 3, name: "Didwana", isActive: true },
];

describe("master options", () => {
  it("offers only active entries for a new entry", () => {
    expect(pickerOptions(khets, "", (khet) => khet.name).map((option) => option.label)).toEqual([
      "Ladnun road",
      "Didwana",
    ]);
  });

  it("keeps the inactive one an older entry already uses", () => {
    expect(pickerOptions(khets, "2", (khet) => khet.name).map((option) => option.value)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("lists every entry in filters, marking inactive ones", () => {
    expect(filterOptions(khets, (khet) => khet.name)[1]).toEqual({
      value: "2",
      label: "Old river bed (inactive)",
    });
  });

  it("gives no options while the list is loading", () => {
    expect(pickerOptions(undefined, "", () => "")).toEqual([]);
  });
});
