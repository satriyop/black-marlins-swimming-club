import { Pool } from "pg";
import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

const LONG_NAME =
  "Perenang Dengan Nama Sangat Panjang Untuk Menguji Tata Letak Kartu Kehadiran Yang Ringkas";

/** Seeds 12 on-roll swimmers across every status plus one off-roll swimmer. */
async function seedRoster(pool: Pool, clubId: number, practiceId: number) {
  const names = [
    "Ahmad Satu",
    "Budi Dua",
    "Citra Tiga",
    "Dewi Empat",
    "Eka Lima",
    "Fajar Enam",
    "Gita Tujuh",
    "Hadi Delapan",
    "Indah Sembilan",
    "Joko Sepuluh",
    "Kartika Sebelas",
    LONG_NAME,
  ];
  const statuses = [
    "hadir",
    "belum",
    "izin",
    "sakit",
    "alfa",
    "belum",
    "belum",
    "belum",
    "belum",
    "belum",
    "belum",
    "belum",
  ];
  const ids: number[] = [];
  for (let i = 0; i < names.length; i += 1) {
    const row = await pool.query(
      "insert into swimmers (club_id, full_name, date_of_birth, gender, status) values ($1,$2,'2013-01-01','putra','aktif') returning id",
      [clubId, names[i]],
    );
    const swimmerId = row.rows[0].id as number;
    ids.push(swimmerId);
    await pool.query(
      "insert into practice_attendance (club_id, practice_id, swimmer_id, status, on_roll) values ($1,$2,$3,$4,true)",
      [clubId, practiceId, swimmerId, statuses[i]],
    );
  }
  const offRoll = await pool.query(
    "insert into swimmers (club_id, full_name, date_of_birth, gender, status) values ($1,'Lepas Dari Sesi',date '2013-01-01','putra','aktif') returning id",
    [clubId],
  );
  await pool.query(
    "insert into practice_attendance (club_id, practice_id, swimmer_id, status, on_roll) values ($1,$2,$3,'hadir',false)",
    [clubId, practiceId, offRoll.rows[0].id],
  );
  return ids;
}

test.describe("compact coach attendance (#51)", () => {
  test("coach can one-tap Hadir, switch status via Ubah status, and an unsaved distance draft survives filter changes and other rows saving", async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = await createClubFixture("coach", { childCount: 0 });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const practiceId = fixture.practiceId!;
      const clubRow = await pool.query("select club_id from practices where id=$1", [practiceId]);
      const clubId = clubRow.rows[0].club_id as number;
      await seedRoster(pool, clubId, practiceId);

      await fixture.signIn(context, baseURL!);
      await page.goto(`/latihan/${practiceId}`);
      await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible();

      // Off-roll swimmer stays out of the on-roll filters/list entirely.
      const offRollSection = page.locator("section", { hasText: "Tidak ikut sesi ini" });
      await expect(offRollSection).toBeVisible();
      await expect(offRollSection.getByText("Lepas Dari Sesi")).toBeVisible();

      const belumRow = page.locator("article", { hasText: "Budi Dua" });
      await expect(belumRow.locator("span", { hasText: "Belum dicatat" })).toBeVisible();

      // One-tap Hadir.
      await belumRow.getByRole("button", { name: /^Hadir: Budi Dua$/ }).click();
      await expect(belumRow.locator("span", { hasText: "Hadir" })).toBeVisible();
      await expect(belumRow.getByRole("button", { name: /^Hadir: Budi Dua$/ })).toHaveCount(0);

      // Ubah status select carries every permitted status and switches the record.
      const izinRow = page.locator("article", { hasText: "Citra Tiga" });
      const izinSelect = izinRow.getByLabel("Ubah status: Citra Tiga");
      await expect(izinSelect).toHaveValue("izin");
      await izinSelect.selectOption("alfa");
      await expect(izinRow.locator("span", { hasText: "Alfa" })).toBeVisible();

      // Start an unsaved distance draft on the swimmer already marked hadir.
      const hadirRow = page.locator("article", { hasText: "Ahmad Satu" });
      const metersInput = hadirRow.getByLabel("Jarak selesai (m)");
      await expect(metersInput).toBeVisible();
      await metersInput.fill("850");

      // Saving a different row must not clear that draft.
      await belumRow.getByLabel("Ubah status: Budi Dua").selectOption("belum");
      await expect(metersInput).toHaveValue("850");

      // Changing filters must not clear it either.
      await page.getByRole("button", { name: /^Belum dicatat/ }).click();
      await page.getByRole("button", { name: /^Semua/ }).click();
      await expect(metersInput).toHaveValue("850");

      // Saving the draft collapses it behind the "saved" disclosure.
      await hadirRow.getByRole("button", { name: "Simpan jarak" }).click();
      await expect(hadirRow.getByText("Jarak selesai: 850 m")).toBeVisible();
      await expect(hadirRow.getByRole("button", { name: "Ubah jarak" })).toBeVisible();

      // Long name renders without breaking the row's controls.
      const longRow = page.locator("article", { hasText: LONG_NAME });
      await expect(longRow.getByRole("button", { name: `Hadir: ${LONG_NAME}` })).toBeVisible();

      // The overflow status filter reaches statuses not covered by the two primary buttons,
      // and rows that no longer match stay mounted (hidden) rather than unmounting.
      await page.getByLabel("Filter status lain").selectOption("alfa");
      await expect(page.getByRole("article")).toHaveCount(2);
      await expect(page.getByText("Citra Tiga")).toBeVisible();
      await expect(page.getByText("Eka Lima")).toBeVisible();
      await expect(page.getByText("Ahmad Satu")).toBeHidden();
    } finally {
      await pool.end();
      await fixture.cleanup();
    }
  });
});
