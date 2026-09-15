import { Pool } from "pg";
import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

function localPool() {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
    throw new Error("Report browser fixtures require an explicit local DATABASE_URL");
  return new Pool({ connectionString: url });
}

test("guardian opens a linked swimmer's monthly report and private notes stay hidden", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("guardian", { practice: "none", results: false });
  const pool = localPool();
  try {
    const practice = await pool.query<{ id: number }>(
      "insert into practices (club_id,session_date,kind,title,status) values ($1,'2026-09-10','renang','Latihan September','completed') returning id",
      [fixture.clubId],
    );
    await pool.query(
      "insert into practice_attendance (club_id,practice_id,swimmer_id,status,meters_completed) values ($1,$2,$3,'hadir',1400)",
      [fixture.clubId, practice.rows[0]!.id, fixture.swimmerId],
    );
    await pool.query(
      "insert into results (club_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,kind) values ($1,$2,'2026-08-10','bebas',50,'25',35000,'official'),($1,$2,'2026-09-10','bebas',50,'25',34000,'official')",
      [fixture.clubId, fixture.swimmerId],
    );
    await pool.query(
      "insert into coach_feedback (club_id,swimmer_id,practice_title,practice_date,focus,status,created_by) values ($1,$2,'Latihan September','2026-09-10','Catatan untuk wali','shared',$3),($1,$2,'Latihan September','2026-09-10','Catatan rahasia','private',$3)",
      [fixture.clubId, fixture.swimmerId, fixture.userId],
    );
    const other = await pool.query<{ id: number }>(
      "insert into swimmers (club_id,full_name,date_of_birth,gender) values ($1,'Anak Tidak Terhubung','2015-01-01','putra') returning id",
      [fixture.clubId],
    );
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/perenang/${fixture.swimmerId}`);
    await page.getByRole("link", { name: "Laporan bulanan" }).click();
    await page.getByLabel("Bulan").fill("2026-09");
    await page.getByRole("button", { name: "Tampilkan" }).click();
    await expect(page.getByText("1 sesi", { exact: true })).toBeVisible();
    await expect(page.getByText("1.400 m")).toBeVisible();
    await expect(page.getByText("Catatan untuk wali")).toBeVisible();
    await expect(page.getByText("Catatan rahasia")).toHaveCount(0);
    await page.getByLabel("Bulan").fill("2026-07");
    await page.getByRole("button", { name: "Tampilkan" }).click();
    await expect(page.getByText("0 sesi", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Belum ada waktu resmi selesai pada bulan ini.")).toBeVisible();
    await page.goto(`/perenang/${other.rows[0]!.id}/laporan?bulan=2026-09`);
    await expect(page.getByText("Catatan untuk wali")).toHaveCount(0);
    await expect(page.getByText("Anak Tidak Terhubung")).toHaveCount(0);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});
