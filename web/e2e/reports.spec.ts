import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

type Page = import("@playwright/test").Page;

const REPORTS = [
  { button: "Profit & loss", shows: (page: Page) => page.getByRole("list", { name: "Income" }) },
  {
    button: "Money in & out",
    shows: (page: Page) => page.getByRole("table", { name: "Money in & out" }),
  },
  {
    button: "Daily summary",
    shows: (page: Page) => page.getByRole("table", { name: "Daily summary" }),
  },
  { button: "By tractor", shows: (page: Page) => page.getByRole("table", { name: "By tractor" }) },
  { button: "By khet", shows: (page: Page) => page.getByRole("table", { name: "By khet" }) },
  { button: "By driver", shows: (page: Page) => page.getByRole("table", { name: "By driver" }) },
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
    const name = report.button.toLowerCase().replace(/[^a-z]+/g, "-");
    await page.screenshot({
      path: `test-results/evidence/${info.project.name}-report-${name}.png`,
      fullPage: true,
    });
  }

  await page
    .getByRole("group", { name: "Show" })
    .getByRole("button", { name: "Money in & out" })
    .click();
  await page.getByText("Online", { exact: true }).click();
  await expect(page).toHaveURL(/mode=ONLINE/);
  await expect(page.getByLabel("Money in & out totals")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/cashbook.*\.csv$/);
});
