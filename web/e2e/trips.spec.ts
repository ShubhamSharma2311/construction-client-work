import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("a trip entered on the form shows in the list and opens", async ({ page }, info) => {
  await signIn(page);
  await expect(page.getByText("Cash in hand")).toBeVisible();

  await page.goto("/new/trip");
  const customer = page.getByRole("combobox", { name: "Customer" });
  await customer.click();
  await customer.fill("Customer");
  await page.getByRole("option").first().click();
  await page.getByLabel("Driver").selectOption({ index: 1 });
  await page.getByLabel("Khet").selectOption({ index: 1 });
  await page.getByLabel("Trip amount").fill("3500");
  // Tap the visible label, as a person would; the radio itself is see-through.
  await page.getByRole("group", { name: "How it was paid" }).getByText("Due", { exact: true }).click();
  await expect(page.getByText("All ₹3,500 will be added to the customer's dues.")).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/evidence/${info.project.name}-new-trip.png`, fullPage: true });
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page.getByText(/^Trip saved\./)).toBeVisible();

  await page.goto("/trips");
  const table = page.getByRole("table", { name: "Trips" });
  await expect(table).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/evidence/${info.project.name}-trips.png`, fullPage: true });
  await table.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: /^Trip on / })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/evidence/${info.project.name}-trip.png`, fullPage: true });
});
