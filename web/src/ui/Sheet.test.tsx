import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi } from "../test/fake-api.ts";
import { renderPart } from "../test/render.tsx";
import { Sheet } from "./Sheet.tsx";

async function openSheet() {
  const onClose = vi.fn();
  const { user } = await renderPart(
    <Sheet open title="Edit khet" onClose={onClose}>
      <button type="button">Save</button>
    </Sheet>,
    fakeApi({}),
  );
  return { user, onClose };
}

describe("a sheet", () => {
  it("names itself by its title and puts focus there", async () => {
    await openSheet();

    const dialog = screen.getByRole("dialog", { name: "Edit khet" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit khet" })).toHaveFocus();
  });

  it("closes on Escape and on Close", async () => {
    const { user, onClose } = await openSheet();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
