import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

test("coach lands on today's attendance workspace with schedule and history separated", async ({
  page,
  context,
  baseURL,
}, info) => {
  const fixture = await createClubFixture("coach");
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/latihan");

    const tabs = page.getByRole("navigation", { name: "Tampilan latihan" });
    await expect(tabs.getByRole("link", { name: "Hari ini" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(tabs.getByRole("link", { name: "Jadwal" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Riwayat" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tambah sesi khusus" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka absensi" })).toBeVisible();
    await expect(page.getByText("0 m")).toHaveCount(0);

    await page.screenshot({
      path: info.outputPath("practice-workspace-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await fixture.cleanup();
  }
});
