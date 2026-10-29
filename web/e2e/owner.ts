import { expect, type Page } from "@playwright/test";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} to the dev owner's credentials before running e2e`);
  return value;
}

export const owner = {
  username: required("E2E_USERNAME"),
  password: required("E2E_PASSWORD"),
};

export async function signIn(page: Page, password = owner.password): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(owner.username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** The page must never scroll sideways, at any screen size. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
