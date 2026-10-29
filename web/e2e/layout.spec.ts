import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
});

test("phones get bottom tabs, larger screens get the side menu", async ({ page }, info) => {
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  const menu = page.getByRole("navigation", { name: "Main" });

  if (info.project.name.startsWith("phone")) {
    await expect(tabs).toBeVisible();
    await expect(menu).toBeHidden();
    await tabs.getByText("Trips").click();
  } else {
    await expect(menu).toBeVisible();
    await expect(tabs).toBeHidden();
    await menu.getByRole("link", { name: "Trips" }).click();
  }

  await expect(page.getByRole("heading", { name: "Trips", level: 1 })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("New entry lists every kind of entry and opens the one picked", async ({ page }, info) => {
  const phone = info.project.name.startsWith("phone");
  await page.getByRole("button", { name: phone ? "+ New" : "+ New entry" }).click();

  const dialog = page.getByRole("dialog", { name: "New entry" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link")).toHaveCount(8);
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/evidence/${info.project.name}-new-entry.png` });

  await dialog.getByRole("link", { name: /Diesel/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Diesel", level: 1 })).toBeVisible();
});

test("every menu screen opens and fits the screen", async ({ page }, info) => {
  const paths = [
    "/trips",
    "/dues",
    "/expenses",
    "/tractors",
    "/drivers",
    "/partner",
    "/reports",
    "/setup",
    "/settings",
    "/more",
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSidewaysScroll(page);
  }
  await page.goto("/more");
  await page.screenshot({ path: `test-results/evidence/${info.project.name}-more.png` });
});
