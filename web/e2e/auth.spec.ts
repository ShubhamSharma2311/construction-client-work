import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, signIn } from "./owner.ts";

test("a wrong password is refused with a clear message", async ({ page }, info) => {
  // Each failure counts toward the 5-per-15-minutes lockout, so one screen size is enough.
  test.skip(info.project.name !== "desktop", "checked once per run");
  await signIn(page, "not-the-password");

  await expect(page.getByRole("alert")).toHaveText("Wrong username or password.");
});

test("signs in, stays signed in across a reload, and signs out", async ({ page }, info) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/evidence/${info.project.name}-today.png` });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

  const phone = info.project.name.startsWith("phone");
  if (phone) await page.getByRole("navigation", { name: "Tabs" }).getByText("More").click();
  const signOutArea = phone ? page.getByRole("main") : page.getByRole("complementary");
  await signOutArea.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the sign in page fits the screen", async ({ page }, info) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await expectNoSidewaysScroll(page);
  await page.screenshot({ path: `test-results/evidence/${info.project.name}-login.png` });
});
