import { expect, test } from "./helpers/browser-test";

test("login page loads", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res?.ok()).toBe(true);
  await expect(page.locator("body")).toBeVisible();
  await expect(page).toHaveTitle(/Black Marlins/i);
});
