import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, fakeApi, json } from "../../test/fake-api.ts";
import { KHETS, LABOURERS } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

type Handler = (request: Request) => Response | Promise<Response>;

function setupApi(extra: Record<string, Handler> = {}) {
  return fakeApi({
    ...signedInRoutes,
    "GET /khets": () => json(KHETS),
    "GET /labourers": () => json(LABOURERS),
    ...extra,
  });
}

describe("Khets and labour", () => {
  it("lists khets and labourers, with any not in use marked", async () => {
    const api = setupApi({
      "GET /khets": () =>
        json({
          ...KHETS,
          items: [
            { ...KHETS.items[0], location: "Near the canal" },
            { id: 6, name: "Didwana", location: null, isActive: false },
          ],
        }),
    });

    await renderApp(api, { path: "/setup" });

    const khets = await screen.findByRole("list", { name: "Khets" });
    expect(khets).toHaveTextContent("Ladnun roadNear the canal");
    expect(khets).toHaveTextContent("Didwana (not in use)");
    expect(await screen.findByRole("list", { name: "Labour" })).toHaveTextContent("Mangilal");
  });

  it("adds a khet, leaving out an empty location", async () => {
    const sent: unknown[] = [];
    const api = setupApi({
      "POST /khets": async (request) => {
        sent.push(await request.json());
        return json({ id: 9, name: "Kuchaman", location: null, isActive: true }, 201);
      },
    });
    const { user } = await renderApp(api, { path: "/setup" });

    await user.click(await screen.findByRole("button", { name: "Add khet" }));
    const sheet = screen.getByRole("dialog", { name: "Add khet" });
    expect(within(sheet).getByRole("button", { name: "Add khet" })).toBeDisabled();
    await user.type(within(sheet).getByLabelText("Name"), " Kuchaman ");
    await user.click(within(sheet).getByRole("button", { name: "Add khet" }));

    expect(await screen.findByText("Kuchaman added.")).toBeInTheDocument();
    expect(sent).toEqual([{ name: "Kuchaman" }]);
  });

  it("shows the API's refusal of a khet name already used", async () => {
    const api = setupApi({
      "POST /khets": () => apiError(409, "CONFLICT", "A khet named Didwana already exists"),
    });
    const { user } = await renderApp(api, { path: "/setup" });

    await user.click(await screen.findByRole("button", { name: "Add khet" }));
    const sheet = screen.getByRole("dialog", { name: "Add khet" });
    await user.type(within(sheet).getByLabelText("Name"), "didwana");
    await user.click(within(sheet).getByRole("button", { name: "Add khet" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "A khet named Didwana already exists.",
    );
  });

  it("stops using a khet, sending only that change", async () => {
    const sent: unknown[] = [];
    const api = setupApi({
      "PATCH /khets/4": async (request) => {
        sent.push(await request.json());
        return json({ ...KHETS.items[0], isActive: false });
      },
    });
    const { user } = await renderApp(api, { path: "/setup" });

    await user.click(await screen.findByRole("button", { name: "Edit Ladnun road" }));
    const sheet = screen.getByRole("dialog", { name: "Edit Ladnun road" });
    await user.click(within(sheet).getByLabelText("In use (shown when entering trips)"));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Ladnun road saved.")).toBeInTheDocument();
    expect(sent).toEqual([{ isActive: false }]);
  });

  it("adds a labourer with a phone, and clears it again on edit", async () => {
    const sent: unknown[] = [];
    const withPhone = { ...LABOURERS.items[0], phone: "9876543210" };
    const api = setupApi({
      "GET /labourers": () => json({ ...LABOURERS, items: [withPhone] }),
      "POST /labourers": async (request) => {
        sent.push(await request.json());
        return json(
          { id: 12, name: "Ramlal", phone: "9812345678", notes: null, isActive: true },
          201,
        );
      },
      "PATCH /labourers/11": async (request) => {
        sent.push(await request.json());
        return json({ ...withPhone, phone: null });
      },
    });
    const { user } = await renderApp(api, { path: "/setup" });

    await user.click(await screen.findByRole("button", { name: "Add labourer" }));
    let sheet = screen.getByRole("dialog", { name: "Add labourer" });
    await user.type(within(sheet).getByLabelText("Name"), "Ramlal");
    await user.type(within(sheet).getByLabelText("Phone"), "9812345678");
    await user.click(within(sheet).getByRole("button", { name: "Add labourer" }));
    expect(await screen.findByText("Ramlal added.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Mangilal" }));
    sheet = screen.getByRole("dialog", { name: "Edit Mangilal" });
    await user.clear(within(sheet).getByLabelText("Phone"));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Mangilal saved.")).toBeInTheDocument();
    expect(sent).toEqual([{ name: "Ramlal", phone: "9812345678" }, { phone: null }]);
  });

  it("closes an edit with nothing changed without asking the API", async () => {
    const { user } = await renderApp(setupApi(), { path: "/setup" });

    await user.click(await screen.findByRole("button", { name: "Edit Mangilal" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Edit Mangilal" })).getByRole("button", {
        name: "Save",
      }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
