import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("settings save as they are, history lists changes, deleted entries open", async ({
  page,
}, info) => {
  await signIn(page);
  await expect(page.getByText("Cash in hand")).toBeVisible();
  await page.goto("/settings");

  // Saving the settings unchanged proves the round trip without altering the dev business.
  await expect(page.getByLabel("Business name")).not.toHaveValue("");
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-settings.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page
    .getByRole("group", { name: "Show" })
    .getByRole("button", { name: "Change history" })
    .click();
  const history = page.getByRole("list", { name: "History of trips" });
  await expect(history.getByRole("link").first()).toBeVisible();
  await page.getByLabel("Show changes to").selectOption("Setting");
  await expect(
    page
      .getByRole("list", { name: "History of business settings" })
      .getByText(/Changed settings/)
      .first(),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-settings-history.png`,
    fullPage: true,
  });

  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Password" }).click();
  await expect(page.getByLabel("Current password")).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-settings-password.png`,
  });

  await page
    .getByRole("group", { name: "Show" })
    .getByRole("button", { name: "Deleted entries" })
    .click();
  await page.getByRole("link", { name: "Deleted trips" }).click();
  await expect(page.getByRole("heading", { name: "Deleted trips" })).toBeVisible();
});
