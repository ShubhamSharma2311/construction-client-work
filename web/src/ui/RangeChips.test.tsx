import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { DateRange } from "../lib/ranges.ts";
import { RangeChips } from "./RangeChips.tsx";

function Harness({ start }: { start: DateRange | null }) {
  const [range, setRange] = useState(start);
  return (
    <>
      <RangeChips value={range} onChange={setRange} today="2026-10-28" startDate="2026-04-01" />
      <output>{range ? `${range.from} to ${range.to}` : "all time"}</output>
    </>
  );
}

describe("RangeChips", () => {
  it("picks a common period in one tap", async () => {
    const user = userEvent.setup();
    render(<Harness start={null} />);

    await user.click(screen.getByRole("button", { name: "Last month" }));

    expect(screen.getByRole("status")).toHaveTextContent("2026-09-01 to 2026-09-30");
    expect(screen.getByRole("button", { name: "Last month" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("takes any two dates, and shows them for a range that is no preset", async () => {
    const user = userEvent.setup();
    render(<Harness start={{ from: "2026-10-03", to: "2026-10-09" }} />);

    expect(screen.getByRole("button", { name: "Pick dates" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // jsdom cannot type a date key by key; set the value as the browser picker would.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-15" } });

    expect(screen.getByRole("status")).toHaveTextContent("2026-10-01 to 2026-10-15");
    await user.click(screen.getByRole("button", { name: "All time" }));
    expect(screen.getByRole("status")).toHaveTextContent("all time");
  });
});
