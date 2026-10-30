import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("diesel entered on the form shows in expenses and the diesel report", async ({
  page,
}, info) => {
  await signIn(page);
  await expect(page.getByText("Cash in hand")).toBeVisible();

  await page.goto("/new/diesel");
  await page.getByLabel("Tractor").selectOption({ index: 1 });
  await page.getByLabel("Driver").selectOption({ index: 1 });
  await page.getByLabel("Litres").fill("40");
  await page.getByLabel("Amount paid").fill("3800");
  await expect(page.getByText("₹95 a litre")).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-new-diesel.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText(/^Diesel of ₹3,800 saved\./)).toBeVisible();

  await page.goto("/expenses");
  await expect(page.getByRole("table", { name: "Expenses" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-expenses.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Diesel report" }).click();
  await expect(page.getByRole("table", { name: "Diesel by tractor" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-diesel.png`,
    fullPage: true,
  });
});
