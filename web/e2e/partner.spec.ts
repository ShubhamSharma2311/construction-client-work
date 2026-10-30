import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("money paid to the partner shows in the account and the share, and can be undone", async ({
  page,
}, info) => {
  await signIn(page);
  await expect(page.getByText("Cash in hand")).toBeVisible();

  await page.goto("/new/partner");
  const partner = page.getByRole("combobox", { name: "Partner" });
  await expect(partner).toBeVisible();
  if ((await partner.inputValue()) === "") await partner.selectOption({ index: 1 });
  await page.getByLabel("Amount").fill("100");
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-partner-payment.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^₹100 paid to /)).toBeVisible();

  const payments = page.getByRole("list", { name: "Money to and from the partner" });
  await expect(payments).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-partner.png`,
    fullPage: true,
  });

  // Leave the dev data as it was.
  await payments
    .getByRole("button", { name: /^Undo ₹100 on / })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Undo entry" }).click();
  await expect(page.getByText(/^Entry undone\./)).toBeVisible();
});
