import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";
import type { Page } from "@playwright/test";

const weekdayLabels = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

async function selectOnlyWeekdays(page: Page, wanted: string[]) {
  for (const label of wanted) {
    const button = page.getByRole("button", { name: label, exact: true });
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  }
  for (const label of weekdayLabels.filter((day) => !wanted.includes(day))) {
    const button = page.getByRole("button", { name: label, exact: true });
    if ((await button.getAttribute("aria-pressed")) === "true") await button.click();
  }
}

test.describe("flexible recurring schedule (jadwal berulang)", () => {
  test("multi-day creation produces one independently toggleable schedule per day", async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await createClubFixture("coach", { childCount: 0, practice: "none" });
    try {
      await fixture.signIn(context, baseURL!);

      // Empty state before any recurring schedule exists.
      await page.goto("/latihan/jadwal");
      await expect(page.getByText("Belum ada jadwal berulang")).toBeVisible();

      // "+ Jadwal baru" pre-checks the weekly option.
      await page.getByRole("link", { name: "Jadwal baru" }).first().click();
      await expect(page).toHaveURL(/\/latihan\/baru/);
      const weeklyCheckbox = page.getByLabel("Jadwal berulang setiap minggu");
      await expect(weeklyCheckbox).toBeChecked();

      await page.getByLabel("Judul sesi").fill("Latihan Sore");
      await selectOnlyWeekdays(page, ["Sel", "Rab"]);
      await page.getByLabel("Lokasi").fill("Umbul Tirtomulyono Pluneng");
      await page.getByRole("button", { name: "Simpan sesi" }).click();

      // More than one day selected -> lands on the management list, not a single session.
      await expect(page).toHaveURL(/\/latihan\/jadwal/);
      const card = page.locator("li", { hasText: "Latihan Sore" });
      await expect(card).toBeVisible();
      await expect(card.getByText("Umbul Tirtomulyono Pluneng")).toBeVisible();

      // Each day chip's accessible name is "<Hari>: <status>, ketuk untuk mengubah",
      // not the visible 3-letter label -- match on the day name prefix instead.
      const selasa = card.getByRole("button", { name: /^Selasa:/ });
      const rabu = card.getByRole("button", { name: /^Rabu:/ });
      await expect(selasa).toHaveAttribute("aria-pressed", "true");
      await expect(rabu).toHaveAttribute("aria-pressed", "true");

      // Turn Wednesday off; Tuesday stays on -- independent toggles.
      await rabu.click();
      await expect(rabu).toHaveAttribute("aria-pressed", "false");
      await expect(selasa).toHaveAttribute("aria-pressed", "true");

      // Reloading confirms the state persisted server-side, not just client-side.
      await page.reload();
      await expect(card.getByRole("button", { name: /^Rabu:/ })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await expect(card.getByRole("button", { name: /^Selasa:/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // Turn it back on.
      await card.getByRole("button", { name: /^Rabu:/ }).click();
      await expect(card.getByRole("button", { name: /^Rabu:/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      await fixture.cleanup();
    }
  });

  test("an optional schedule can be saved inactive and switched on later", async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await createClubFixture("coach", { childCount: 0, practice: "none" });
    try {
      await fixture.signIn(context, baseURL!);
      await page.goto("/latihan/baru?weekly=true");
      await page.getByLabel("Judul sesi").fill("Latihan Pagi Sabtu");
      await selectOnlyWeekdays(page, ["Sab"]);
      await page.getByLabel("Lokasi").fill("Umbul Brondong");
      await page.getByLabel("Simpan, nonaktif dulu").check();
      await page.getByRole("button", { name: "Simpan sesi" }).click();

      await expect(page).toHaveURL(/\/latihan\/jadwal/);
      const card = page.locator("li", { hasText: "Latihan Pagi Sabtu" });
      await expect(card).toBeVisible();
      const sabtu = card.getByRole("button", { name: /^Sabtu:/ });
      await expect(sabtu).toHaveAttribute("aria-pressed", "false");

      await sabtu.click();
      await expect(sabtu).toHaveAttribute("aria-pressed", "true");
    } finally {
      await fixture.cleanup();
    }
  });
});
