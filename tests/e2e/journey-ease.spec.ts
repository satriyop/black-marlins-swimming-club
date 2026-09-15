import { Pool } from "pg";
import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

function jakartaDateAfter(days: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("guardian finds tomorrow's recurring practice from home and sends an early notice", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("guardian", { practice: "none", results: false });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tomorrow = jakartaDateAfter(1);
    const weekday = new Date(`${tomorrow}T00:00:00Z`).getUTCDay() || 7;
    const club = await pool.query<{ club_id: number }>(
      'select club_id from club_family where user_id=(select id from "user" where email=$1)',
      [fixture.email],
    );
    await pool.query(
      "insert into practice_series (club_id,title,weekday,start_time,duration_min,location,kind,start_date) values ($1,'Latihan Besok Uji',$2,'18:00',90,'Kolam Uji','renang',$3::date)",
      [club.rows[0]!.club_id, weekday, tomorrow],
    );
    await pool.query(
      "insert into practices (club_id,session_date,kind,title,status) values ($1,'2020-01-01','teknik','Sesi Lama Uji','scheduled')",
      [club.rows[0]!.club_id],
    );
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Latihan Besok Uji" })).toBeVisible();
    await expect(page.getByText("Belum ada latihan terjadwal")).toHaveCount(0);
    await page.getByRole("link", { name: "Lihat jadwal" }).click();
    const day = page.locator("li", { hasText: "Latihan Besok Uji" });
    await day.locator("summary", { hasText: "Laporkan izin anak" }).click();
    await day.getByLabel("Alasan untuk Perenang Contoh (opsional)").fill("Demam");
    await day.getByRole("button", { name: "Sakit" }).click();
    await expect(day.getByText("Izin terkirim: sakit · Demam")).toBeVisible();
  } finally {
    await pool.end();
    await fixture.cleanup();
  }
});
