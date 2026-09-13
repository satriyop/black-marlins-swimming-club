import type { Page } from "@playwright/test";

export async function changeAppAppearance(page: Page, theme: string) {
  await page.getByRole("button", { name: "Buka menu akun" }).click();
  await page.getByLabel("Tampilan", { exact: true }).selectOption(theme);
  await page.keyboard.press("Escape");
}
