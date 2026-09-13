import { expect, test } from "./helpers/browser-test";

test("login page loads", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res?.ok()).toBe(true);
  await expect(page.locator("body")).toBeVisible();
  await expect(page).toHaveTitle(/Black Marlins/i);
});

test("guarded latihan sends signed-out users to login with next", async ({ page }) => {
  await page.goto("/latihan/1");
  await expect(page).toHaveURL(/\/login/);
  expect(page.url()).toMatch(/next=/);
  expect(page.url()).not.toMatch(/next=https?:/);
});

test("login rejects an external next without looping", async ({ page }) => {
  await page.goto("/login?next=https://evil.example/phish");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /Black Marlins/i })).toBeVisible();
});
