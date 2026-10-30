import { describe, expect, it } from "vitest";
import { sectionOf } from "./nav.ts";

describe("the section a screen belongs to", () => {
  it.each([
    ["/", undefined],
    ["/trips", "Trips"],
    ["/trips/42", "Trips"],
    ["/dues/7", "Customers"],
    ["/new/payment", "Money from customer"],
    ["/more", "More"],
    // A path that only starts with a section's letters is not inside it.
    ["/tripsheet", undefined],
  ])("%s is under %s", (path, label) => {
    expect(sectionOf(path)?.label).toBe(label);
  });
});
