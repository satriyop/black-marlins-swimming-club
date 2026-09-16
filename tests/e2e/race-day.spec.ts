import { Pool } from "pg";
import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

function localPool() {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
    throw new Error("Race-day browser fixtures require an explicit local DATABASE_URL");
  return new Pool({ connectionString: url });
}

async function seedMeet(pool: Pool, clubId: number, swimmerId: number) {
  const meet = await pool.query<{ id: number }>(
    "insert into meets (club_id,name,level,course,start_date,end_date,status) values ($1,'Kejuaraan Contoh','regional','25','2026-09-10','2026-09-11','rencana') returning id",
    [clubId],
  );
  const meetId = meet.rows[0]!.id;
  const entry = await pool.query<{ id: number }>(
    "insert into meet_entries (club_id,meet_id,swimmer_id,stroke,distance_m,registration_status) values ($1,$2,$3,'bebas',50,'confirmed') returning id",
    [clubId, meetId, swimmerId],
  );
  return { meetId, entryId: entry.rows[0]!.id };
}

test("guardian sees only a linked swimmer's race and the stored official result", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("guardian", { practice: "none", results: false });
  const pool = localPool();
  try {
    const { meetId } = await seedMeet(pool, fixture.clubId, fixture.swimmerId!);
    await pool.query(
      "insert into results (club_id,meet_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,kind,round) values ($1,$2,$3,'2026-09-10','bebas',50,'25',34000,'official','heat'),($1,$2,$3,'2026-09-10','bebas',50,'25',30000,'test','tes')",
      [fixture.clubId, meetId, fixture.swimmerId],
    );
    const other = await pool.query<{ id: number }>(
      "insert into swimmers (club_id,full_name,date_of_birth,gender) values ($1,'Anak Tidak Terhubung','2015-01-01','putra') returning id",
      [fixture.clubId],
    );
    await pool.query(
      "insert into meet_entries (club_id,meet_id,swimmer_id,stroke,distance_m,registration_status) values ($1,$2,$3,'bebas',50,'confirmed')",
      [fixture.clubId, meetId, other.rows[0]!.id],
    );
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/event/${meetId}`);
    await page.getByRole("link", { name: "Hari lomba · Perenang Contoh" }).click();
    await expect(page.getByText("Belum ada bagan seri")).toBeVisible();
    await expect(page.getByText("Belum ditentukan")).toBeVisible();
    await expect(page.getByText("Belum diumumkan")).toBeVisible();
    await expect(page.getByText("34.00")).toBeVisible();
    await expect(page.getByText("30.00")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ubah bagan seri" })).toHaveCount(0);
    await page.goto(`/event/${meetId}/harilomba/${other.rows[0]!.id}`);
    await expect(page.getByText("Anak Tidak Terhubung")).toHaveCount(0);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});

test("coach enters a heat sheet and sees reporting and warm-up details on mobile", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("coach", {
    childCount: 1,
    practice: "none",
    results: false,
  });
  const pool = localPool();
  try {
    const { meetId } = await seedMeet(pool, fixture.clubId, fixture.swimmerId!);
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/event/${meetId}/harilomba/${fixture.swimmerId}`);
    await page.getByRole("button", { name: "Ubah bagan seri" }).click();
    const dialog = page.getByRole("dialog", { name: /Bagan seri/ });
    await dialog.getByLabel("Seri").fill("Seri 3");
    await dialog.getByLabel("Lintasan").fill("4");
    await dialog.getByLabel("Tanggal lapor").fill("2026-09-10");
    await dialog.getByLabel("Jam lapor (waktu setempat)").fill("07:45");
    await dialog.getByLabel("Instruksi pemanasan").fill("Pemanasan di kolam latihan");
    await dialog.getByRole("button", { name: "Simpan bagan seri" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Seri 3")).toBeVisible();
    await expect(page.getByText("07:45", { exact: false })).toBeVisible();
    await expect(page.getByText("Pemanasan di kolam latihan")).toBeVisible();
    const saved = await pool.query<{
      heat: string;
      lane: number;
      report_time: string;
      warmup_note: string;
    }>(
      "select heat,lane,report_time::text,warmup_note from meet_entries where meet_id=$1 and swimmer_id=$2",
      [meetId, fixture.swimmerId],
    );
    expect(saved.rows[0]).toMatchObject({
      heat: "Seri 3",
      lane: 4,
      warmup_note: "Pemanasan di kolam latihan",
    });
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});
