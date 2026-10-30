import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("a khet is added and taken out of use, and the lists fit the screen", async ({
  page,
}, info) => {
  await signIn(page);
  await expect(page.getByText("Cash in hand")).toBeVisible();
  await page.goto("/setup");
  const khets = page.getByRole("list", { name: "Khets" });
  await expect(khets).toBeVisible();
  await expect(page.getByRole("list", { name: "Labour" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-setup.png`,
    fullPage: true,
  });

  const name = `Test khet ${info.project.name} ${String(Date.now())}`;
  await page.getByRole("button", { name: "Add khet" }).click();
  const add = page.getByRole("dialog", { name: "Add khet" });
  await add.getByLabel("Name").fill(name);
  await add.getByRole("button", { name: "Add khet" }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();
  await expect(khets.getByText(name, { exact: true })).toBeVisible();

  // Leave the pickers as they were: the test khet stays listed, but not in use.
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  const edit = page.getByRole("dialog", { name: `Edit ${name}` });
  await expectNoSidewaysScroll(page);
  await page.screenshot({
    path: `test-results/evidence/${info.project.name}-setup-edit.png`,
  });
  await edit.getByText("In use (shown when entering trips)").click();
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(khets.getByText(`${name} (inactive)`)).toBeVisible();
});
