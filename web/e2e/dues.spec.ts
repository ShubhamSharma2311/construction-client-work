import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("dues lead to a customer's account, where a payment is recorded", async ({ page }, info) => {
  await signIn(page);
  await expect(page.getByText("Cash in hand")).toBeVisible();

  await page.goto("/dues");
  const owing = page.getByRole("list", { name: "Customers who owe" });
  await expect(owing).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-dues.png`,
    fullPage: true,
  });

  await owing.getByRole("link").first().click();
  await expect(page.getByRole("table", { name: "Account entries" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-account.png`,
    fullPage: true,
  });

  await page.getByRole("link", { name: "Payment received" }).click();
  await page.getByLabel("Amount received").fill("100");
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-payment.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText(/^Payment saved\./)).toBeVisible();
  await expect(page.getByRole("table", { name: "Account entries" })).toBeVisible();
});
