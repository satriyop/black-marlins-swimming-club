import { expect, type Page } from "@playwright/test";

const LABELS: Record<string, string> = {
  dark: "Gelap",
  light: "Terang",
  system: "Ikuti perangkat",
};

export async function changeAppAppearance(page: Page, theme: string) {
  await page.getByRole("button", { name: "Tampilan", exact: true }).click();
  await page.getByRole("menuitemradio", { name: LABELS[theme] }).click();
}

export async function expectAppearanceChoice(page: Page, theme: string) {
  await page.getByRole("button", { name: "Tampilan", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: LABELS[theme] })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
}
