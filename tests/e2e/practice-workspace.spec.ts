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
    const todayTab = tabs.getByRole("link", { name: "Hari ini" });
    const scheduleTab = tabs.getByRole("link", { name: "Jadwal" });
    const historyTab = tabs.getByRole("link", { name: "Riwayat" });
    await expect(todayTab).toHaveAttribute("aria-current", "page");
    await expect(scheduleTab).toBeVisible();
    await expect(historyTab).toBeVisible();
    const todayBox = await todayTab.boundingBox();
    const scheduleBox = await scheduleTab.boundingBox();
    const historyBox = await historyTab.boundingBox();
    expect(todayBox && scheduleBox && historyBox).toBeTruthy();
    expect(Math.abs(todayBox!.y - scheduleBox!.y), "tabs stay on one row (#98)").toBeLessThan(4);
    expect(Math.abs(todayBox!.y - historyBox!.y), "tabs stay on one row (#98)").toBeLessThan(4);
    const calendar = page.getByRole("button", { name: "Unduh kalender" });
    const calendarBox = await calendar.boundingBox();
    expect(calendarBox, "calendar download").toBeTruthy();
    expect(calendarBox!.y, "calendar sits below the tabs on a phone (#98)").toBeGreaterThan(
      todayBox!.y + todayBox!.height - 2,
    );
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
