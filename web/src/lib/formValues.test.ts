import { describe, expect, it } from "vitest";
import { edited, filled } from "./formValues.ts";

describe("form values for the API", () => {
  it("leaves out an empty field when adding", () => {
    expect(filled("  ")).toBeUndefined();
    expect(filled(" Ladnun road ")).toBe("Ladnun road");
  });

  it("sends a field on edit only when it changed, and null when it was cleared", () => {
    expect(edited("Mangilal", " Mangilal ")).toBeUndefined();
    expect(edited("9876543210", "")).toBeNull();
    expect(edited("", "Loader")).toBe("Loader");
    expect(edited("", "  ")).toBeUndefined();
  });
});
