import { Pool } from "pg";
import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

const LONG_MEET_NAME =
  "Kejuaraan Renang Antar Klub Se-Provinsi Jawa Tengah Dengan Nama Sangat Panjang";

test.describe("swimmer profile hierarchy (#52)", () => {
  test("identity header stays inside a phone viewport (#94)", async ({ page, context, baseURL }) => {
    const fixture = await createClubFixture("guardian", {
      childCount: 1,
      results: false,
      practice: "none",
      primaryChildName: "Kun Bumi Pamungkas",
    });
    try {
      await fixture.signIn(context, baseURL!);
      await page.goto(`/perenang/${fixture.swimmerId}`);
      const heading = page.getByRole("heading", { name: "Kun Bumi Pamungkas", exact: true });
      await expect(heading).toBeVisible();
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(heading).toBeVisible();
        const box = await heading.boundingBox();
        expect(box, `${width}px heading box`).toBeTruthy();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${width}px page overflow`,
        ).toBe(true);
      }
    } finally {
      await fixture.cleanup();
    }
  });

  test("empty profile shows unrecorded states, not zeros dressed up as data", async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await createClubFixture("guardian", { childCount: 1, results: false, practice: "none" });
    try {
      await fixture.signIn(context, baseURL!);
      await page.goto(`/perenang/${fixture.swimmerId}`);
      await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible();
      await expect(page.getByText("Kehadiran", { exact: true })).toBeVisible();
      await expect(page.locator("p", { hasText: "Kehadiran" }).getByText("—")).toBeVisible();
      await expect(page.getByText("Belum ada catatan waktu selesai.")).toBeVisible();
      await expect(page.getByText("Belum ada catatan waktu.")).toBeVisible();
      await expect(page.getByText("Pendaftaran kejuaraan")).toHaveCount(0);
    } finally {
      await fixture.cleanup();
    }
  });

  test("progress summary, next event and records lead the detailed history; PB and DQ are clearly marked", async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await createClubFixture("guardian", { childCount: 1, results: false });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const swimmerId = fixture.swimmerId!;
      const clubRow = await pool.query("select club_id from swimmers where id=$1", [swimmerId]);
      const clubId = clubRow.rows[0].club_id as number;

      const meet = await pool.query(
        "insert into meets (club_id, name, level, course, start_date) values ($1,$2,'klub','50', current_date + 30) returning id",
        [clubId, LONG_MEET_NAME],
      );
      const meetId = meet.rows[0].id as number;
      await pool.query(
        "insert into meet_entries (club_id, meet_id, swimmer_id, stroke, distance_m, seed_time_ms) values ($1,$2,$3,'bebas',50,38000)",
        [clubId, meetId, swimmerId],
      );

      // 9 same-nomor results to trigger "Lihat semua", including the PB and a DQ.
      const dates = Array.from({ length: 9 }, (_, i) => `2026-0${(i % 9) + 1}-0${(i % 8) + 1}`);
      for (let i = 0; i < 9; i += 1) {
        const status = i === 4 ? "dq" : "selesai";
        const timeMs = status === "selesai" ? 38000 - i * 50 : null;
        await pool.query(
          `insert into results (club_id, swimmer_id, result_date, stroke, distance_m, course, time_ms, status, kind, meet_id)
           values ($1,$2,$3,'bebas',50,'50',$4,$5,'official',$6)`,
          [clubId, swimmerId, dates[i], timeMs, status, i === 0 ? meetId : null],
        );
      }

      await fixture.signIn(context, baseURL!);
      await page.goto(`/perenang/${swimmerId}`);
      await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible();

      // Order: progress summary -> next event -> records/chart -> detailed history.
      const summaryY = await page.getByText("PB tercatat").boundingBox().then((b) => b!.y);
      const nextEventY = await page.getByText("Pendaftaran kejuaraan").boundingBox().then((b) => b!.y);
      const recordsY = await page.getByText("Rekor pribadi").boundingBox().then((b) => b!.y);
      const historyY = await page.getByText("Riwayat waktu").boundingBox().then((b) => b!.y);
      expect(summaryY).toBeLessThan(nextEventY);
      expect(nextEventY).toBeLessThan(recordsY);
      expect(recordsY).toBeLessThan(historyY);
      await expect(page.getByRole("link", { name: LONG_MEET_NAME })).toBeVisible();

      // Attendance history detail is present but collapsed by default.
      const attendanceDetails = page.locator("details", { hasText: "Riwayat kehadiran" });
      await expect(attendanceDetails).toBeVisible();
      await expect(attendanceDetails).not.toHaveJSProperty("open", true);

      // Long list of same-nomor results collapses behind "Lihat semua".
      await expect(page.getByRole("button", { name: /Lihat semua \(9\)/ })).toBeVisible();

      // PB is badged, not just a muted text suffix.
      const pbBadge = page.locator("span.rounded-full", { hasText: "PB" }).first();
      await expect(pbBadge).toBeVisible();

      // DQ shows a labelled outcome badge, never 0.00 or a fabricated time.
      await expect(page.getByText("DQ", { exact: true })).toBeVisible();
      await expect(page.getByText("0.00")).toHaveCount(0);
    } finally {
      await pool.end();
      await fixture.cleanup();
    }
  });

  test("filter miss offers a reset path instead of claiming no records ever existed", async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await createClubFixture("guardian", { childCount: 1, results: false });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const swimmerId = fixture.swimmerId!;
      const clubRow = await pool.query("select club_id from swimmers where id=$1", [swimmerId]);
      const clubId = clubRow.rows[0].club_id as number;
      const meet = await pool.query(
        "insert into meets (club_id, name, level, course, start_date) values ($1,'Meet X','klub','50','2026-08-01') returning id",
        [clubId],
      );
      const meetId = meet.rows[0].id as number;
      await pool.query(
        `insert into results (club_id, swimmer_id, result_date, stroke, distance_m, course, time_ms, status, kind, meet_id)
         values ($1,$2,'2026-08-01','bebas',50,'50',38000,'selesai','official',$3)`,
        [clubId, swimmerId, meetId],
      );
      await pool.query(
        `insert into results (club_id, swimmer_id, result_date, stroke, distance_m, course, time_ms, status, kind)
         values ($1,$2,'2026-08-02','bebas',100,'50',90000,'selesai','test')`,
        [clubId, swimmerId],
      );

      await fixture.signIn(context, baseURL!);
      await page.goto(`/perenang/${swimmerId}`);
      await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible();
      await page.getByLabel("Kejuaraan").selectOption({ label: "Meet X" });
      await page.getByLabel("Nomor", { exact: true }).selectOption({ label: "100 Bebas" });
      await expect(page.getByText("Belum ada catatan untuk pilihan ini.")).toBeVisible();
      await expect(page.getByText("Belum ada catatan waktu.", { exact: true })).toHaveCount(0);
    } finally {
      await pool.end();
      await fixture.cleanup();
    }
  });
});
