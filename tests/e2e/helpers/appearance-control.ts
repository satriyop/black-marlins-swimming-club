import { expect, type Page } from "@playwright/test";

const LABELS: Record<string, string> = {
  dark: "Gelap",
  light: "Terang",
  system: "Ikuti perangkat",
};

async function openAppearanceMenu(page: Page) {
  const radio = page.getByRole("menuitemradio", { name: LABELS.dark });
  if (await radio.isVisible().catch(() => false)) return;
  const header = page.getByRole("button", { name: "Tampilan", exact: true });
  if (await header.isVisible().catch(() => false)) {
    await header.click();
    return;
  }
  await page.getByRole("button", { name: "Buka menu akun" }).click();
}

export async function changeAppAppearance(page: Page, theme: string) {
  await openAppearanceMenu(page);
  await page.getByRole("menuitemradio", { name: LABELS[theme] }).click();
  await page.keyboard.press("Escape");
  if (theme === "dark" || theme === "light") {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  } else {
    await expect(page.locator("html")).toHaveAttribute("data-appearance", "system");
  }
}

export async function expectAppearanceChoice(page: Page, theme: string) {
  await openAppearanceMenu(page);
  await expect(page.getByRole("menuitemradio", { name: LABELS[theme] })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
}
