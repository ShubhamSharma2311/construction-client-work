import { screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { CUSTOMERS, NO_DUES } from "../../test/fixtures.ts";
import { renderPart, signedInRoutes } from "../../test/render.tsx";
import { CustomerPicker, type PickedCustomer } from "./CustomerPicker.tsx";

const [ramesh, sunil] = CUSTOMERS.items;

/** Answers searches by name, like the API; slow answers can be held back. */
function searchApi() {
  const seen: string[] = [];
  const api = fakeApi({
    ...signedInRoutes,
    "GET /dues": () => json(NO_DUES),
    "GET /customers": (request) => {
      const term = new URL(request.url).searchParams.get("search") ?? "";
      seen.push(term);
      const items = CUSTOMERS.items.filter((customer) =>
        customer.name.toLowerCase().includes(term.toLowerCase()),
      );
      return json({ ...CUSTOMERS, items });
    },
    "POST /customers": async (request) => {
      const body = (await request.json()) as { name: string };
      return json({ customer: { ...ramesh, id: 9, name: body.name }, possibleDuplicates: [] }, 201);
    },
  });
  return { api, seen };
}

function Picker({ onSubmit }: { onSubmit?: () => void }) {
  const [value, setValue] = useState<PickedCustomer | null>(null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <CustomerPicker value={value} onChange={setValue} />
      <button type="submit">Save trip</button>
    </form>
  );
}

describe("CustomerPicker", () => {
  it("picks the customer matching what was typed, even when Enter beats the search", async () => {
    const { api } = searchApi();
    const { user } = await renderPart(<Picker />, api);
    const box = screen.getByRole("combobox", { name: "Customer" });
    await user.click(box);
    await screen.findByRole("option", { name: new RegExp(ramesh?.name ?? "") });

    // Typed and entered at once: the list on screen still holds the earlier matches.
    await user.type(box, "Sunil{Enter}");

    expect(await screen.findByText(sunil?.name ?? "")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("moves focus to Change after a pick, and back to the search after Change", async () => {
    const { api } = searchApi();
    const { user } = await renderPart(<Picker />, api);

    await user.click(screen.getByRole("combobox", { name: "Customer" }));
    await user.click(await screen.findByRole("option", { name: new RegExp(sunil?.name ?? "") }));

    expect(screen.getByRole("button", { name: /Change customer/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("combobox", { name: "Customer" })).toHaveFocus();
  });

  it("adds a new customer on Enter in its fields, without submitting the entry", async () => {
    const { api } = searchApi();
    const submitted = vi.fn();
    const { user } = await renderPart(<Picker onSubmit={submitted} />, api);

    await user.type(screen.getByRole("combobox", { name: "Customer" }), "Gopal Ram");
    await user.click(
      await screen.findByRole("option", { name: "+ Add “Gopal Ram” as a new customer" }),
    );
    const panel = screen.getByRole("group", { name: "New customer" });
    expect(within(panel).getByLabelText("Name")).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Gopal Ram added.")).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("offers to add only once the search for the name has come back", async () => {
    const { api } = searchApi();
    const { user } = await renderPart(<Picker />, api);

    await user.type(screen.getByRole("combobox", { name: "Customer" }), "Ram");

    expect(screen.queryByRole("option", { name: /Add “Ram”/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /Add “Ram”/ })).toBeInTheDocument();
  });

  it("closes the list when the person moves on", async () => {
    const { api } = searchApi();
    const { user } = await renderPart(<Picker />, api);

    await user.click(screen.getByRole("combobox", { name: "Customer" }));
    await screen.findByRole("listbox");
    await user.tab();

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
