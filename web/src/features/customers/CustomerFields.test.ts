import { describe, expect, it } from "vitest";
import { customerChanges, newCustomerBody } from "./CustomerFields.tsx";

const before = { name: "Ramesh Bishnoi", phone: "9829041733", village: "Jaswantgarh", notes: "" };

describe("customer fields", () => {
  it("sends only filled-in fields for a new customer, trimmed", () => {
    expect(
      newCustomerBody({ name: " Gopal Ram ", phone: " ", village: "Nimbi", notes: "" }),
    ).toEqual({
      name: "Gopal Ram",
      village: "Nimbi",
    });
  });

  it("sends only what changed, clearing a phone with null and text with an empty string", () => {
    expect(
      customerChanges(before, { ...before, phone: "", village: "", notes: "pays monthly" }),
    ).toEqual({
      phone: null,
      village: "",
      notes: "pays monthly",
    });
  });

  it("sends nothing when nothing changed", () => {
    expect(customerChanges(before, { ...before, name: "Ramesh Bishnoi " })).toEqual({});
  });
});
