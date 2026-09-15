import { Pool } from "pg";
import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

function localPool() {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("Goal browser fixtures require an explicit local DATABASE_URL");
  }
  return new Pool({ connectionString: url });
}

function dayOffset(days: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
    .toISOString().slice(0, 10);
}

test("coach sets a swimmer goal and only a comparable pool time completes it", async ({
  page,
  context,
  baseURL,
}, info) => {
  const fixture = await createClubFixture("coach", { childCount: 1, results: false });
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/perenang/${fixture.swimmerId}`);
    const section = page.getByRole("region", { name: "Target perenang" });
    await expect(section.getByText("Belum ada target waktu untuk perenang ini.")).toBeVisible();
    await section.getByRole("button", { name: "Tambah target" }).click();
    const goalForm = page.getByRole("dialog", { name: "Target baru perenang" });
    await goalForm.getByLabel("Waktu target").fill("35.00");
    await goalForm.getByLabel("Catatan").fill("Fokus start dan putaran.");
    await goalForm.getByRole("button", { name: "Simpan target" }).click();
    await expect(section.getByText("Berjalan", { exact: true })).toBeVisible();
    await expect(section.getByText("Belum ada hasil sebanding")).toBeVisible();
    await expect(section.getByText("Fokus start dan putaran.")).toBeVisible();

    async function record(course: "25" | "50", time: string) {
      await page.getByRole("button", { name: "Catat waktu" }).click();
      const resultForm = page.getByRole("dialog", { name: "Catat hasil" });
      await resultForm.getByLabel("Panjang kolam").selectOption(course);
      await resultForm.getByLabel("Waktu", { exact: true }).fill(time);
      await resultForm.getByRole("button", { name: "Simpan hasil" }).click();
      await expect(resultForm).toHaveCount(0);
    }

    await record("25", "34.00");
    await expect(section.getByText("Berjalan", { exact: true })).toBeVisible();
    await expect(section.getByText("Belum ada hasil sebanding")).toBeVisible();
    await record("50", "34.50");
    await expect(section.getByText("Tercapai", { exact: true })).toBeVisible();
    await expect(section.getByText("Tercapai pada", { exact: false })).toBeVisible();
    await page.reload();
    await expect(section.getByText("Tercapai", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("goal-hit-mobile.png"), fullPage: true, animations: "disabled" });

    await section.getByRole("button", { name: "Ubah target" }).click();
    const editForm = page.getByRole("dialog", { name: "Ubah target perenang" });
    await editForm.getByLabel("Waktu target").fill("33.00");
    await editForm.getByRole("button", { name: "Simpan target" }).click();
    await expect(section.getByText("Berjalan", { exact: true })).toBeVisible();
    await expect(section.getByText("Perlu 1.50 lebih cepat")).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("guardian sees a linked child's goal but cannot see another child's goal or edit controls", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("guardian", { results: false });
  const pool = localPool();
  try {
    const swimmer = await pool.query<{ club_id: number }>(
      "select club_id from swimmers where id=$1", [fixture.swimmerId],
    );
    const clubId = swimmer.rows[0]!.club_id;
    await pool.query(
      `insert into swimmer_goals (club_id,swimmer_id,stroke,distance_m,course,target_time_ms,started_on,deadline,notes)
       values ($1,$2,'bebas',50,'50',35000,$3,$4,'Target bersama wali')`,
      [clubId, fixture.swimmerId, dayOffset(0), dayOffset(30)],
    );
    const other = await pool.query<{ id: number }>(
      "insert into swimmers (club_id,full_name,date_of_birth,gender) values ($1,'Anak Tidak Terhubung','2015-01-01','putra') returning id",
      [clubId],
    );
    await pool.query(
      `insert into swimmer_goals (club_id,swimmer_id,stroke,distance_m,course,target_time_ms,started_on,deadline,notes)
       values ($1,$2,'bebas',50,'50',35000,$3,$4,'Catatan anak lain')`,
      [clubId, other.rows[0]!.id, dayOffset(0), dayOffset(30)],
    );
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/perenang/${fixture.swimmerId}`);
    const section = page.getByRole("region", { name: "Target perenang" });
    await expect(section.getByText("Target bersama wali")).toBeVisible();
    await expect(section.getByRole("button", { name: /target/i })).toHaveCount(0);
    await page.goto(`/perenang/${other.rows[0]!.id}`);
    await expect(page.getByText("Catatan anak lain")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Target perenang" })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
    await pool.end();
  }
});
