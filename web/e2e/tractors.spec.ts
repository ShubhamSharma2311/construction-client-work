import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("tractors lead to a tractor's loans and a loan's EMI schedule", async ({ page }, info) => {
  await signIn(page);
  await expect(page.getByText("Cash in hand")).toBeVisible();

  await page.goto("/tractors");
  await expect(page.getByRole("list", { name: "EMIs due" })).toBeVisible();
  const tractors = page.getByRole("list", { name: "Tractors" });
  await expect(tractors.getByRole("link").first()).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-tractors.png`,
    fullPage: true,
  });

  // A tractor whose line shows a loan running; the dev data has one from the smoke scripts.
  const withLoan = tractors.getByRole("link").filter({ hasText: "EMIs paid" }).first();
  test.skip((await withLoan.count()) === 0, "no tractor with a loan in the dev data");
  await withLoan.click();
  await expect(page.getByRole("list", { name: "Loans" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-tractor.png`,
    fullPage: true,
  });

  await page.getByRole("list", { name: "Loans" }).getByRole("link").first().click();
  await expect(page.getByRole("table", { name: "EMI schedule" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-loan.png`,
    fullPage: true,
  });
});
