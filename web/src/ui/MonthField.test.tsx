import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MonthField } from "./MonthField.tsx";

describe("MonthField", () => {
  it("follows a new value from outside and shows a year outside its range", () => {
    const { rerender } = render(
      <MonthField label="Month" value="2026-09" onChange={vi.fn()} fromYear={2026} toYear={2026} />,
    );

    rerender(
      <MonthField label="Month" value="2025-12" onChange={vi.fn()} fromYear={2026} toYear={2026} />,
    );

    expect(screen.getByLabelText("Month: month")).toHaveValue("12");
    expect(screen.getByLabelText("Month: year")).toHaveValue("2025");
  });

  it("ties its error to both dropdowns", () => {
    render(
      <MonthField
        label="Month"
        value=""
        onChange={vi.fn()}
        fromYear={2026}
        toYear={2026}
        error="Pick a month"
      />,
    );

    expect(screen.getByLabelText("Month: month")).toHaveAccessibleDescription("Pick a month");
    expect(screen.getByLabelText("Month: year")).toHaveAccessibleDescription("Pick a month");
  });

  it("gives a month only once both parts are picked", async () => {
    const changed = vi.fn();
    const user = userEvent.setup();
    render(
      <MonthField
        label="First EMI month"
        value=""
        onChange={changed}
        fromYear={2024}
        toYear={2027}
      />,
    );

    await user.selectOptions(screen.getByLabelText("First EMI month: month"), "Apr");
    expect(changed).toHaveBeenLastCalledWith("");
    await user.selectOptions(screen.getByLabelText("First EMI month: year"), "2026");

    expect(changed).toHaveBeenLastCalledWith("2026-04");
  });

  it("starts from a month already set, newest years first", () => {
    render(
      <MonthField label="Month" value="2026-09" onChange={vi.fn()} fromYear={2025} toYear={2026} />,
    );

    expect(screen.getByLabelText("Month: month")).toHaveValue("09");
    expect(screen.getByLabelText("Month: year")).toHaveValue("2026");
    expect(
      screen
        .getAllByRole("option")
        .map((option) => option.textContent)
        .slice(-2),
    ).toEqual(["2026", "2025"]);
  });
});
