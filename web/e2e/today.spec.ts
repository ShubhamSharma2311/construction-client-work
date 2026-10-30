import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("Today shows the money in hand and the day's entries", async ({ page }, info) => {
  await signIn(page);

  await expect(page.getByText("Cash in hand")).toBeVisible();
  await expect(page.getByRole("list", { name: "The day's entries" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Customers who owe the most" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-today.png`,
    fullPage: true,
  });
});
