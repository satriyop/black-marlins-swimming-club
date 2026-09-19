import { Pool } from "pg";
import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

function jakartaDateAfter(days: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("club week list does not show izin on unopened schedule days", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("combined", { practice: "none", results: false });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tomorrow = jakartaDateAfter(1);
    const weekday = new Date(`${tomorrow}T00:00:00Z`).getUTCDay() || 7;
    const club = await pool.query<{ club_id: number }>(
      'select club_id from club_staff where user_id=(select id from "user" where email=$1)',
      [fixture.email],
    );
    await pool.query(
      "insert into practice_series (club_id,title,weekday,start_time,duration_min,location,kind,start_date) values ($1,'Latihan Pagi Depo Uji',$2,'05:00',90,'Kolam Renang Depo','renang',$3::date)",
      [club.rows[0]!.club_id, weekday, tomorrow],
    );
    await fixture.signIn(context, baseURL!);
    await page.goto("/latihan");
    await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible({
      timeout: 15_000,
    });
    const day = page.locator("li", { hasText: "Latihan Pagi Depo Uji" });
    await expect(day).toBeVisible();
    await expect(day.getByText("Terjadwal")).toBeVisible();
    await expect(day.getByRole("button", { name: "Izin", exact: true })).toHaveCount(0);
    await expect(day.getByText("Laporkan izin anak")).toHaveCount(0);
  } finally {
    await pool.end();
    await fixture.cleanup();
  }
});
