import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { test, expect } from "./helpers/browser-test";
import type { BrowserContext } from "@playwright/test";

async function fixture() {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
    throw new Error("Registration fixtures require local PostgreSQL");
  const pool = new Pool({ connectionString: url });
  const key = randomUUID();
  const staff = `coach-${key}`,
    parent = `parent-${key}`;
  const club = await pool.query(
    "insert into clubs(name,short_name,city,province,coach_name) values ('Klub Pendaftaran Uji','UJI','Klaten','Jateng','Coach') returning id",
  );
  const clubId = club.rows[0].id;
  for (const user of [staff, parent]) {
    await pool.query('insert into "user"(id,name,email,"emailVerified") values ($1,$2,$3,true)', [
      user,
      user === staff ? "Pelatih Uji" : "Wali Uji",
      `${user}@example.test`,
    ]);
    await pool.query(
      "insert into user_club_prefs(user_id,task_view,welcome_dismissed_at,grants_acked_at) values ($1,$2,now(),now())",
      [user, user === staff ? "club" : "family"],
    );
  }
  await pool.query("insert into club_staff(club_id,user_id,role) values ($1,$2,'coach')", [
    clubId,
    staff,
  ]);
  await pool.query("insert into club_family(club_id,user_id) values ($1,$2)", [clubId, parent]);
  const kids = await pool.query(
    "insert into swimmers(club_id,full_name,date_of_birth,gender) values ($1,'Anak Pendaftaran','2014-01-01','putra'),($1,'Anak Keluarga Lain','2013-01-01','putri') returning id",
    [clubId],
  );
  const childId = kids.rows[0].id,
    otherId = kids.rows[1].id;
  await pool.query("insert into guardians(user_id,swimmer_id) values ($1,$2)", [parent, childId]);
  const meets = await pool.query(
    "insert into meets(club_id,name,level,course,start_date,end_date) values ($1,'Kejuaraan Pendaftaran Uji','klub','50','2099-12-30','2099-12-31') returning id",
    [clubId],
  );
  const meetId = meets.rows[0].id;
  return {
    pool,
    clubId,
    childId,
    otherId,
    meetId,
    async signIn(context: BrowserContext, role: "staff" | "parent") {
      const token = randomUUID();
      await pool.query(
        'insert into session(id,token,"userId","expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'1 hour\',now())',
        [randomUUID(), token, role === "staff" ? staff : parent],
      );
      await context.addInitScript(
        (value) => sessionStorage.setItem("bmsc.auth.bearer-token", value),
        token,
      );
    },
    async cleanup() {
      await pool.query("delete from clubs where id=$1", [clubId]);
      await pool.query('delete from "user" where id=any($1)', [[staff, parent]]);
      await pool.end();
    },
  };
}

test("coach and guardian complete proposal, correction, approval, export and organizer confirmation", async ({
  page,
  context,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(90000);
  const f = await fixture();
  const parentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const parent = await parentContext.newPage();
  await parent.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  try {
    await f.signIn(context, "staff");
    await f.signIn(parentContext, "parent");
    await page.goto(`/event/${f.meetId}`);
    await page.getByRole("button", { name: "Buka pendaftaran", exact: true }).click();
    const setup = page.getByRole("dialog");
    await setup.getByLabel("Tenggat respons wali (waktu perangkat)").fill("2099-12-29T12:00");
    await setup.getByRole("checkbox", { name: "Anak Pendaftaran", exact: true }).check();
    await setup.getByRole("checkbox", { name: "Anak Keluarga Lain", exact: true }).check();
    await setup.getByLabel("Kelompok Anak Pendaftaran", { exact: true }).fill("Kelompok A");
    await setup.getByRole("checkbox", { name: "100 m Dada", exact: true }).check();
    await setup.getByRole("button", { name: "Buka pendaftaran untuk peserta terpilih" }).click();
    await expect(setup).not.toBeVisible();
    await page.getByRole("button", { name: "Usulkan nomor", exact: true }).click();
    const proposal = page.getByRole("dialog");
    await proposal.getByLabel("Perenang peserta").selectOption(String(f.childId));
    await proposal.getByLabel("Nomor yang tersedia").selectOption("bebas:50");
    await proposal.getByRole("button", { name: "Simpan usulan nomor" }).click();
    await expect(proposal).not.toBeVisible();
    await parent.goto(`${baseURL}/event/${f.meetId}`);
    await expect(parent.getByText("Usulan pelatih — menunggu wali", { exact: true })).toBeVisible();
    await expect(parent.getByText("Anak Keluarga Lain", { exact: true })).toHaveCount(0);
    await expect(parent.getByRole("button", { name: "Kunci daftar disetujui" })).toHaveCount(0);
    await parent
      .getByRole("button", { name: "Simpan respons Anak Pendaftaran", exact: true })
      .click();
    await expect(parent.getByText("Menunggu keputusan pelatih", { exact: true })).toBeVisible();
    await parent.getByRole("button", { name: /Koreksi nomor #/ }).click();
    const edit = parent.getByRole("dialog");
    await edit.getByLabel("Nomor yang tersedia").selectOption("dada:100");
    await edit.getByLabel("Waktu seed (opsional)").fill("1:15.00");
    await edit.getByRole("button", { name: "Simpan usulan nomor" }).click();
    await expect(edit).not.toBeVisible();
    await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
    await page.getByRole("button", { name: "Setujui nomor", exact: true }).click();
    await expect(
      page.getByText("Disetujui pelatih — belum diajukan ke panitia", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Kunci daftar disetujui", exact: true }).click();
    await expect(page.getByRole("button", { name: "Unduh CSV daftar disetujui" })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Unduh CSV daftar disetujui" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/pendaftaran-\d+-r\d+/);
    const stream = await download.createReadStream();
    let csv = "";
    for await (const chunk of stream!) csv += chunk.toString();
    expect(csv).toContain("Kelompok A");
    expect(csv).toContain('"dada","100"');
    expect(csv).not.toContain("Anak Keluarga Lain");
    await page.getByLabel(/Alasan \/ bukti nomor #/).fill("Pengajuan manual 29 Des; referensi A");
    await page.getByRole("button", { name: "Catat pengajuan ke panitia", exact: true }).click();
    await expect(
      page.getByText("Pengajuan ke panitia dicatat — menunggu konfirmasi", { exact: true }),
    ).toBeVisible();
    await page.getByLabel(/Alasan \/ bukti nomor #/).fill("Panitia mengonfirmasi; referensi B");
    await page.getByRole("button", { name: "Catat konfirmasi panitia", exact: true }).click();
    await expect(
      page.getByText("Konfirmasi panitia dicatat", { exact: true }).first(),
    ).toBeVisible();
    await parent.getByRole("button", { name: "Muat ulang", exact: true }).click();
    await expect(
      parent.getByText("Konfirmasi panitia dicatat", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      parent.getByRole("button", { name: "Simpan respons Anak Pendaftaran", exact: true }),
    ).toHaveCount(0);
    await expect(parent.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10000 });
    await parent.screenshot({
      path: testInfo.outputPath("guardian-confirmed-mobile.png"),
      fullPage: true,
    });
    await parent.goto(`${baseURL}/perenang/${f.childId}`);
    await expect(parent.getByText("Konfirmasi panitia dicatat", { exact: true })).toBeVisible();
    await parent.getByRole("link", { name: "Kejuaraan Pendaftaran Uji", exact: true }).click();
    await expect(parent).toHaveURL(new RegExp(`/event/${f.meetId}$`));
  } finally {
    await parentContext.close();
    await f.cleanup();
  }
});

test("expired family edits stay blocked until staff reopen; stale form keeps its draft", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const f = await fixture();
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await staffPage.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  try {
    await f.pool.query(
      "update meets set registration_state='open',registration_deadline=now()+interval '1 hour' where id=$1",
      [f.meetId],
    );
    await f.pool.query(
      "insert into meet_eligibility(meet_id,swimmer_id,club_id,group_name) values ($1,$2,$3,'A')",
      [f.meetId, f.childId, f.clubId],
    );
    await f.signIn(context, "parent");
    await page.goto(`/event/${f.meetId}`);
    await page.getByLabel("Respons untuk Anak Pendaftaran").selectOption("no");
    await page.getByLabel("Alasan untuk Anak Pendaftaran").fill("Jadwal sekolah");
    await f.pool.query(
      "update meets set registration_revision=registration_revision+1 where id=$1",
      [f.meetId],
    );
    await page.getByRole("button", { name: "Simpan respons Anak Pendaftaran" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Data berubah" })).toBeVisible();
    await expect(page.getByLabel("Alasan untuk Anak Pendaftaran")).toHaveValue("Jadwal sekolah");
    await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
    await expect(page.getByText(/Revisi 2/)).toBeVisible();
    await f.pool.query(
      "update meets set registration_deadline=now()-interval '1 second' where id=$1",
      [f.meetId],
    );
    await page.getByRole("button", { name: "Simpan respons Anak Pendaftaran" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "tenggat" })).toBeVisible();
    expect(
      (await f.pool.query("select response from meet_eligibility where meet_id=$1", [f.meetId]))
        .rows[0].response,
    ).toBe("pending");
    await f.signIn(staffContext, "staff");
    await staffPage.goto(`${baseURL}/event/${f.meetId}`);
    await staffPage.getByText("Buka kembali untuk koreksi", { exact: true }).click();
    await staffPage.getByLabel("Tenggat baru (waktu perangkat)").fill("2099-12-29T12:00");
    await staffPage.getByLabel("Alasan membuka kembali").fill("Tambahan waktu untuk keluarga");
    await staffPage.getByRole("button", { name: "Buka kembali pendaftaran", exact: true }).click();
    await expect(staffPage.getByText(/Pendaftaran terbuka/)).toBeVisible();
    await page.goto(`/event/${f.meetId}`);
    await page
      .getByRole("button", { name: "Simpan respons Anak Pendaftaran", exact: true })
      .click();
    await expect(page.getByText("Bersedia ikut", { exact: true })).toBeVisible();
  } finally {
    await staffContext.close();
    await f.cleanup();
  }
});

test("two browser tabs cannot apply the same stale guardian response twice", async ({
  page,
  context,
}) => {
  const f = await fixture();
  const second = await context.newPage();
  await second.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  try {
    await f.pool.query(
      "update meets set registration_state='open',registration_deadline=now()+interval '1 hour' where id=$1",
      [f.meetId],
    );
    await f.pool.query(
      "insert into meet_eligibility(meet_id,swimmer_id,club_id,group_name) values ($1,$2,$3,'A')",
      [f.meetId, f.childId, f.clubId],
    );
    await f.signIn(context, "parent");
    // Authenticate and render each tab before racing the writes. Concurrent page
    // bootstraps exercise the auth rate limiter instead of the stale-response guard
    // this test is intended to cover.
    await page.goto(`/event/${f.meetId}`);
    await second.goto(`/event/${f.meetId}`);
    const firstButton = page.getByRole("button", { name: "Simpan respons Anak Pendaftaran" });
    const secondButton = second.getByRole("button", { name: "Simpan respons Anak Pendaftaran" });
    await expect(firstButton).toBeVisible();
    await expect(secondButton).toBeVisible();
    await Promise.all([firstButton.click(), secondButton.click()]);
    await expect
      .poll(
        async () =>
          (await page.getByRole("alert").filter({ hasText: "Data berubah" }).count()) +
          (await second.getByRole("alert").filter({ hasText: "Data berubah" }).count()),
      )
      .toBe(1);
    expect(
      (
        await f.pool.query(
          "select count(*)::int as n from meet_registration_history where meet_id=$1 and action='Wali bersedia ikut'",
          [f.meetId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (await f.pool.query("select registration_revision from meets where id=$1", [f.meetId]))
        .rows[0].registration_revision,
    ).toBe(2);
  } finally {
    await second.close();
    await f.cleanup();
  }
});
