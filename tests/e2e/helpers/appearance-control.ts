import { expect, type Page } from "@playwright/test";

const LABELS: Record<string, string> = {
  dark: "Gelap",
  light: "Terang",
  system: "Ikuti perangkat",
};

export async function changeAppAppearance(page: Page, theme: string) {
  const header = page.getByRole("button", { name: "Tampilan", exact: true });
  if (await header.count()) {
    await header.scrollIntoViewIfNeeded();
    await header.click();
  } else {
    await page.getByRole("button", { name: "Buka menu akun" }).click();
  }
  await page.getByRole("menuitemradio", { name: LABELS[theme] }).click();
  if (theme === "dark" || theme === "light") {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  } else {
    await expect(page.locator("html")).toHaveAttribute("data-appearance", "system");
  }
}

export async function expectAppearanceChoice(page: Page, theme: string) {
  const header = page.getByRole("button", { name: "Tampilan", exact: true });
  if (await header.count()) await header.click();
  else await page.getByRole("button", { name: "Buka menu akun" }).click();
  await expect(page.getByRole("menuitemradio", { name: LABELS[theme] })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
}
