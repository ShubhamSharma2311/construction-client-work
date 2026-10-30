import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("a driver's account takes an advance and shows the month to close", async ({ page }, info) => {
  await signIn(page);
  await expect(page.getByText("Cash in hand")).toBeVisible();

  await page.goto("/drivers");
  const drivers = page.getByRole("list", { name: "Drivers" });
  await expect(drivers.getByRole("link").first()).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-drivers.png`,
    fullPage: true,
  });

  await drivers.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await page.getByRole("link", { name: /^Pay / }).click();
  await page.getByLabel("Amount").fill("100");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText(/^₹100 paid\./)).toBeVisible();

  await expect(page.getByRole("table", { name: "Every entry" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-driver.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Close a month" }).click();
  await expect(page.getByRole("dialog", { name: "Close a month" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/evidence/${info.project.name}-close-month.png` });
});
