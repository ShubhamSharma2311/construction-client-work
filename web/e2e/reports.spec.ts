import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

type Page = import("@playwright/test").Page;

const REPORTS = [
  { button: "Profit", shows: (page: Page) => page.getByRole("list", { name: "Came in" }) },
  { button: "Cash book", shows: (page: Page) => page.getByRole("table", { name: "Cash book" }) },
  { button: "Day by day", shows: (page: Page) => page.getByRole("table", { name: "Day by day" }) },
  { button: "Tractors", shows: (page: Page) => page.getByRole("table", { name: "By tractor" }) },
  { button: "Khets", shows: (page: Page) => page.getByRole("table", { name: "By khet" }) },
  { button: "Drivers", shows: (page: Page) => page.getByRole("table", { name: "By driver" }) },
] as const;

test("every report opens for this month, fits the screen, and downloads", async ({
  page,
}, info) => {
  await signIn(page);
  await expect(page.getByText("Cash in hand")).toBeVisible();
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

  for (const report of REPORTS) {
    await page
      .getByRole("group", { name: "Show" })
      .getByRole("button", { name: report.button })
      .click();
    await expect(report.shows(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    const name = report.button.toLowerCase().replaceAll(" ", "-");
    await page.screenshot({
      path: `test-results/evidence/${info.project.name}-report-${name}.png`,
      fullPage: true,
    });
  }

  await page
    .getByRole("group", { name: "Show" })
    .getByRole("button", { name: "Cash book" })
    .click();
  await page.getByText("Online", { exact: true }).click();
  await expect(page).toHaveURL(/mode=ONLINE/);
  await expect(page.getByLabel("Cash book totals")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/cashbook.*\.csv$/);
});
