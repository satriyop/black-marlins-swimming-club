import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";
import { changeAppAppearance } from "./helpers/appearance-control";

test("guardian home shows child identity and next-practice action without scrolling", async ({
  page,
  context,
  baseURL,
}, info) => {
  const fixture = await createClubFixture("guardian");
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hari ini" })).toBeVisible();
    const child = page.getByRole("region", { name: "Anak saya" }).getByRole("link", {
      name: /Perenang Contoh/,
    });
    const cta = page.getByRole("link", { name: "Kehadiran & izin anak" });
    await expect(child).toBeVisible();
    await expect(cta).toBeVisible();
    expect(await child.evaluate((el) => el.getBoundingClientRect().bottom < innerHeight)).toBe(
      true,
    );
    expect(await cta.evaluate((el) => el.getBoundingClientRect().bottom < innerHeight)).toBe(true);
    await expect(page.getByRole("heading", { name: /Selamat/ })).toHaveCount(0);
    for (const theme of ["dark", "light"] as const) {
      await changeAppAppearance(page, theme);
      await page.keyboard.press("Escape");
      await page.screenshot({
        path: info.outputPath(`guardian-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  } finally {
    await fixture.cleanup();
  }
});

test("invited guardian with no child sees enroll first", async ({
  page,
  context,
  baseURL,
}, info) => {
  const fixture = await createClubFixture("guardian", { childCount: 0, results: false });
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const enroll = page.getByRole("link", { name: "Daftarkan anak" }).first();
    await expect(page.getByText("Belum ada anak terhubung")).toBeVisible();
    await expect(enroll).toBeVisible();
    expect(await enroll.evaluate((el) => el.getBoundingClientRect().bottom < innerHeight)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath("zero-children.png"), animations: "disabled" });
  } finally {
    await fixture.cleanup();
  }
});

test("all linked children are listed even when they sit outside the first six squad records", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("guardian", { childCount: 3, extraSquad: 6 });
  try {
    await fixture.signIn(context, baseURL!);
    await page.goto("/");
    const family = page.getByRole("region", { name: "Anak saya" });
    await expect(family.getByRole("link", { name: /Perenang Contoh/ })).toBeVisible();
    await expect(family.getByRole("link", { name: /Niko 2/ })).toBeVisible();
    await expect(family.getByRole("link", { name: /Niko 3/ })).toBeVisible();
    await expect(page.getByText("Skuad Lebih Awal")).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test("cancelled session stays visible and empty practice/results do not look like zero scores", async ({
  page,
  context,
  baseURL,
}, info) => {
  const fixture = await createClubFixture("guardian", {
    practice: "cancelled",
    results: false,
    importantNotices: 5,
  });
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByText("Latihan hari ini dibatalkan")).toBeVisible();
    await expect(page.getByText("Hujan petir di kolam")).toBeVisible();
    await expect(page.getByText("5 pengumuman belum dibuka")).toBeVisible();
    await expect(
      page.getByLabel("5 pengumuman belum dibuka").getByRole("link", { name: "Lihat semua" }),
    ).toBeVisible();
    await expect(page.getByText("Belum ada catatan waktu")).toBeVisible();
    await expect(page.getByText("0 km")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath("notices.png"),
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await fixture.cleanup();
  }
});

test("staff home keeps labelled club statistics and operational practice action", async ({
  page,
  context,
  baseURL,
}, info) => {
  const fixture = await createClubFixture("coach");
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Catat kehadiran" })).toBeVisible();
    await expect(page.getByLabel("Statistik klub")).toBeVisible();
    await expect(page.getByText("Perenang aktif klub")).toBeVisible();
    await expect(page.getByText("Sesi terlaksana bulan ini")).toBeVisible();
    await expect(page.getByText("Volume program bulan ini")).toBeVisible();
    await expect(page.getByText("Kehadiran bulan ini")).toBeVisible();
    await changeAppAppearance(page, "dark");
    await page.screenshot({
      path: info.outputPath("staff-desktop.png"),
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await fixture.cleanup();
  }
});

test("staff home prioritizes today's training when an older session is unfinished", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("coach", { overduePractice: true });
  try {
    await fixture.signIn(context, baseURL!);
    await page.goto("/");

    await expect(page.getByText("Latihan hari ini")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Latihan Contoh Visual" })).toBeVisible();
    await expect(page.getByText("Latihan perlu dituntaskan")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Perlu dituntaskan" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Latihan lama belum selesai" })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test("staff home keeps unfinished older sessions off the primary slot", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("coach", { practice: "none", overduePractice: true });
  try {
    await fixture.signIn(context, baseURL!);
    await page.goto("/");
    await expect(page.getByText("Belum ada latihan terjadwal")).toBeVisible();
    await expect(page.getByText("Latihan perlu dituntaskan")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Perlu dituntaskan" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Latihan lama belum selesai" })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test("staff home replaces yesterday's open sessions with a reopen line", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("coach", {
    overduePractice: true,
    yesterdayPractice: true,
  });
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const closed = page.getByRole("region", { name: "Ditutup otomatis" });
    await expect(closed.getByRole("link", { name: /Latihan kemarin tercatat/ })).toBeVisible();
    await expect(closed.getByRole("link", { name: /Latihan kemarin kosong/ })).toBeVisible();
    await expect(closed.getByText("Buka kembali")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Perlu dituntaskan" })).toHaveCount(0);
    await expect(page.getByText("Latihan lama belum selesai")).toHaveCount(0);
    await expect(page.getByText("Latihan hari ini")).toBeVisible();
    const overflowing = await closed.evaluate((el) => el.getBoundingClientRect().right > innerWidth);
    expect(overflowing).toBe(false);

    await closed.getByRole("link", { name: /Latihan kemarin tercatat/ }).click();
    await expect(page.getByText("Ditutup otomatis.")).toBeVisible();
    await page.getByRole("tab", { name: "Kehadiran" }).click();
    await expect(page.getByRole("combobox", { name: "Ubah status: Perenang Hadir" })).toHaveValue(
      "hadir",
    );
    await expect(page.getByRole("combobox", { name: "Ubah status: Perenang Kosong" })).toHaveValue(
      "alfa",
    );

    await page.getByRole("button", { name: "Buka kembali", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Alasan").fill("Catatan salah");
    await dialog.getByRole("button", { name: "Buka kembali" }).click();
    await expect(page.getByText("Sesi dibuka kembali")).toBeVisible();
    await expect(page.getByText("Ditutup otomatis.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tandai selesai" })).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const stillClosed = page.getByRole("region", { name: "Ditutup otomatis" });
    await expect(stillClosed.getByRole("link", { name: /Latihan kemarin kosong/ })).toBeVisible();
    await expect(stillClosed.getByText("Latihan kemarin tercatat")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Perlu dituntaskan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Latihan kemarin tercatat" })).toBeVisible();

    await stillClosed.getByRole("link", { name: /Latihan kemarin kosong/ }).click();
    await expect(page.getByText("Ditutup otomatis.")).toBeVisible();
    await expect(
      page.getByText("Dibatalkan: Tanggal lewat tanpa catatan kehadiran"),
    ).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("family home does not list sessions the club closed overnight", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("guardian", { yesterdayPractice: true });
  try {
    await fixture.signIn(context, baseURL!);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hari ini" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ditutup otomatis" })).toHaveCount(0);
    await expect(page.getByText("Latihan kemarin tercatat")).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test("home reflows at 320px with enlarged text", async ({ page, context, baseURL }, info) => {
  const fixture = await createClubFixture("guardian", { childCount: 3 });
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/");
    await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
    await expect(
      page
        .getByRole("region", { name: "Anak saya" })
        .getByRole("link", { name: /Perenang Contoh/ }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Kehadiran & izin anak" })).toBeVisible();
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter(
          (el) =>
            el.getBoundingClientRect().right > innerWidth && el.getBoundingClientRect().width > 0,
        )
        .map((el) => ({
          tag: el.tagName,
          text: el.textContent?.slice(0, 40),
          right: Math.round(el.getBoundingClientRect().right),
        })),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      JSON.stringify(overflowing),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("reflow.png"),
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    await fixture.cleanup();
  }
});
