import { test, expect } from "./helpers/browser-test";
import { createAnnouncementFixture } from "./helpers/announcement-fixture";

test("publish linked schedule notice, open, acknowledge, correct and archive with accurate follow-up", async ({
  page,
  context,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(90000);
  const f = await createAnnouncementFixture();
  const parentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const parent = await parentContext.newPage();
  await parent.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  try {
    await f.signIn(context, "author");
    await f.signIn(parentContext, "parent");
    await page.goto(`/latihan/${f.practiceId}`);
    await page.getByRole("button", { name: "Tulis pengumuman perubahan", exact: true }).click();
    const compose = page.getByRole("dialog");
    await expect(compose.getByLabel("Judul", { exact: true })).toHaveValue(
      "Perubahan latihan: Latihan Pagi Uji",
    );
    await expect(compose.getByLabel("Isi", { exact: true })).toHaveValue(/Kolam ditutup/);
    await expect(compose.getByLabel("Latihan terkait (opsional)")).toHaveValue(
      String(f.practiceId),
    );
    expect(
      (
        await f.pool.query("select count(*)::int as n from announcements where club_id=$1", [
          f.clubId,
        ])
      ).rows[0].n,
    ).toBe(0);
    await compose.getByLabel("Kejuaraan terkait (opsional)").selectOption(String(f.meetId));
    await compose.getByRole("checkbox", { name: "Penting — minta konfirmasi penerima" }).check();
    await compose.getByRole("button", { name: "Terbitkan", exact: true }).click();
    await expect(compose).not.toBeVisible();
    await expect(page.getByText("Pengumuman diterbitkan", { exact: true })).toBeVisible();
    const id = await f.post();
    await parent.goto(`${baseURL}/pengumuman/${id}`);
    await expect(parent.getByRole("link", { name: "Latihan: Latihan Pagi Uji" })).toHaveAttribute(
      "href",
      `/latihan/${f.practiceId}`,
    );
    await expect(parent.getByRole("link", { name: "Kejuaraan: Kejuaraan Uji" })).toHaveAttribute(
      "href",
      `/event/${f.meetId}`,
    );
    await expect(parent.getByRole("button", { name: "Saya sudah membaca/memahami" })).toBeVisible();
    await expect(parent.getByRole("region", { name: "Tindak lanjut penerima" })).toHaveCount(0);
    await expect(
      parent.getByRole("button", { name: "Koreksi pengumuman", exact: true }),
    ).toHaveCount(0);
    await parent.goto(`${baseURL}/`);
    await expect(parent.getByRole("region", { name: "Pengumuman perlu konfirmasi" })).toContainText(
      "1 pengumuman perlu konfirmasi",
    );
    await parent
      .getByRole("region", { name: "Pengumuman perlu konfirmasi" })
      .getByRole("link", { name: "Perubahan latihan: Latihan Pagi Uji" })
      .click();
    await parent.getByRole("button", { name: "Saya sudah membaca/memahami" }).click();
    await expect(
      parent.getByRole("status").filter({ hasText: "Konfirmasi Anda untuk revisi 1 tersimpan" }),
    ).toBeVisible();
    await page.goto(`/pengumuman/${id}`);
    await expect(page.getByRole("region", { name: "Tindak lanjut penerima" })).toContainText(
      "1 dari 3 penerima aktif sudah mengonfirmasi",
    );
    await page.getByRole("button", { name: "Koreksi pengumuman", exact: true }).click();
    const edit = page.getByRole("dialog");
    await edit
      .getByLabel("Isi", { exact: true })
      .fill("Kolam dibuka kembali. Latihan dipindah ke pukul 08.00.");
    await edit.getByLabel("Alasan koreksi").fill("Jadwal pengelola kolam diperbarui");
    await edit.getByRole("button", { name: "Terbitkan koreksi", exact: true }).click();
    await expect(edit).not.toBeVisible();
    await expect(page.getByRole("region", { name: "Tindak lanjut penerima" })).toContainText(
      "0 dari 3 penerima aktif sudah mengonfirmasi",
    );
    await parent.getByRole("button", { name: "Muat ulang pengumuman" }).click();
    await expect(parent.getByText(/Dikoreksi.*Jadwal pengelola/)).toBeVisible();
    await parent.getByRole("button", { name: "Saya sudah membaca/memahami" }).click();
    await expect(
      parent.getByRole("status").filter({ hasText: "Konfirmasi Anda untuk revisi 2 tersimpan" }),
    ).toBeVisible();
    await parent.getByText("Riwayat koreksi dan konfirmasi Anda", { exact: true }).click();
    await expect(parent.getByText("Anda mengonfirmasi pada", { exact: false })).toHaveCount(2);
    await expect(parent.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10000 });
    await parent.screenshot({
      path: testInfo.outputPath("guardian-revised-acknowledgement.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Arsipkan pengumuman", exact: true }).click();
    const archive = page.getByRole("dialog");
    await archive.getByLabel("Alasan pengarsipan").fill("Sesi telah selesai");
    await archive.getByRole("button", { name: "Arsipkan", exact: true }).click();
    await expect(archive).not.toBeVisible();
    await parent.getByRole("button", { name: "Muat ulang pengumuman" }).click();
    await expect(parent.getByText(/Diarsipkan oleh.*Sesi telah selesai/)).toBeVisible();
    await expect(parent.getByRole("button", { name: "Saya sudah membaca/memahami" })).toHaveCount(
      0,
    );
    await parent.goto(`${baseURL}/pengumuman`);
    await expect(
      parent.getByRole("link", { name: /Perubahan latihan: Latihan Pagi Uji/ }),
    ).toHaveCount(0);
    await parent.getByRole("button", { name: "Lihat arsip" }).click();
    await parent.getByRole("link", { name: /Perubahan latihan: Latihan Pagi Uji/ }).click();
    await expect(parent).toHaveURL(new RegExp(`/pengumuman/${id}$`));
  } finally {
    await parentContext.close();
    await f.cleanup();
  }
});

test("two tabs acknowledge once and a stale acknowledgement cannot acknowledge a corrected revision", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.setTimeout(60000);
  const f = await createAnnouncementFixture();
  const parentContext = await browser.newContext();
  const one = await parentContext.newPage();
  const two = await parentContext.newPage();
  for (const p of [one, two])
    await p.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  try {
    await f.signIn(context, "author");
    await f.signIn(parentContext, "parent");
    await page.goto("/pengumuman");
    await page.getByRole("button", { name: "Pengumuman baru", exact: true }).first().click();
    const compose = page.getByRole("dialog");
    await compose.getByLabel("Judul", { exact: true }).fill("Informasi penting");
    await compose.getByLabel("Isi", { exact: true }).fill("Bawa perlengkapan.");
    await compose.getByRole("checkbox", { name: "Penting — minta konfirmasi penerima" }).check();
    await compose.getByRole("button", { name: "Terbitkan", exact: true }).click();
    await expect(compose).not.toBeVisible();
    const id = await f.post();
    await Promise.all([
      one.goto(`${baseURL}/pengumuman/${id}`),
      two.goto(`${baseURL}/pengumuman/${id}`),
    ]);
    await expect(one.getByRole("button", { name: "Saya sudah membaca/memahami" })).toBeVisible();
    await expect(two.getByRole("button", { name: "Saya sudah membaca/memahami" })).toBeVisible();
    await Promise.all([
      one.getByRole("button", { name: "Saya sudah membaca/memahami" }).click(),
      two.getByRole("button", { name: "Saya sudah membaca/memahami" }).click(),
    ]);
    await expect(
      one.getByRole("status").filter({ hasText: "Konfirmasi Anda untuk revisi 1 tersimpan" }),
    ).toBeVisible();
    await expect(
      two.getByRole("status").filter({ hasText: "Konfirmasi Anda untuk revisi 1 tersimpan" }),
    ).toBeVisible();
    expect(
      (
        await f.pool.query(
          "select count(*)::int as n from announcement_acknowledgements where announcement_id=$1 and user_id=$2",
          [id, f.parent],
        )
      ).rows[0].n,
    ).toBe(1);
    await page.goto(`/pengumuman/${id}`);
    await page.getByRole("button", { name: "Koreksi pengumuman", exact: true }).click();
    let edit = page.getByRole("dialog");
    await edit.getByLabel("Isi", { exact: true }).fill("Bawa topi.");
    await edit.getByLabel("Alasan koreksi").fill("Perlengkapan berubah");
    await edit.getByRole("button", { name: "Terbitkan koreksi", exact: true }).click();
    await expect(edit).not.toBeVisible();
    await one.getByRole("button", { name: "Muat ulang pengumuman" }).click();
    await expect(one.getByRole("button", { name: "Saya sudah membaca/memahami" })).toBeVisible();
    await page.getByRole("button", { name: "Koreksi pengumuman", exact: true }).click();
    edit = page.getByRole("dialog");
    await edit.getByLabel("Isi", { exact: true }).fill("Bawa topi dan kacamata.");
    await edit.getByLabel("Alasan koreksi").fill("Daftar lengkap");
    await edit.getByRole("button", { name: "Terbitkan koreksi", exact: true }).click();
    await expect(edit).not.toBeVisible();
    await one.getByRole("button", { name: "Saya sudah membaca/memahami" }).click();
    await expect(one.getByRole("alert").filter({ hasText: "Pengumuman berubah" })).toBeVisible();
    expect(
      (
        await f.pool.query(
          "select count(*)::int as n from announcement_acknowledgements where announcement_id=$1 and revision=3",
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await parentContext.close();
    await f.cleanup();
  }
});

test("concurrent corrections keep one revision and preserve the losing editor's draft", async ({
  page,
  context,
}) => {
  const f = await createAnnouncementFixture();
  const second = await context.newPage();
  await second.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  try {
    await f.signIn(context, "author");
    await page.goto("/pengumuman");
    await page.getByRole("button", { name: "Pengumuman baru", exact: true }).first().click();
    const compose = page.getByRole("dialog");
    await compose.getByLabel("Judul", { exact: true }).fill("Koreksi bersama");
    await compose.getByLabel("Isi", { exact: true }).fill("Isi awal");
    await compose.getByRole("button", { name: "Terbitkan", exact: true }).click();
    await expect(compose).not.toBeVisible();
    const id = await f.post();
    await Promise.all([page.goto(`/pengumuman/${id}`), second.goto(`/pengumuman/${id}`)]);
    for (const p of [page, second])
      await p.getByRole("button", { name: "Koreksi pengumuman", exact: true }).click();
    const firstDialog = page.getByRole("dialog"),
      secondDialog = second.getByRole("dialog");
    await firstDialog.getByLabel("Isi", { exact: true }).fill("Draf pertama");
    await firstDialog.getByLabel("Alasan koreksi").fill("Koreksi pertama");
    await secondDialog.getByLabel("Isi", { exact: true }).fill("Draf kedua");
    await secondDialog.getByLabel("Alasan koreksi").fill("Koreksi kedua");
    await Promise.all([
      firstDialog.getByRole("button", { name: "Terbitkan koreksi", exact: true }).click(),
      secondDialog.getByRole("button", { name: "Terbitkan koreksi", exact: true }).click(),
    ]);
    await expect
      .poll(
        async () =>
          (await page.getByRole("alert").filter({ hasText: "Pengumuman berubah" }).count()) +
          (await second.getByRole("alert").filter({ hasText: "Pengumuman berubah" }).count()),
      )
      .toBe(1);
    const loser = (await page.getByRole("alert").filter({ hasText: "Pengumuman berubah" }).count())
      ? page
      : second;
    await expect(loser.getByRole("dialog").getByLabel("Isi", { exact: true })).toHaveValue(
      loser === page ? "Draf pertama" : "Draf kedua",
    );
    expect(
      (await f.pool.query("select revision from announcements where id=$1", [id])).rows[0].revision,
    ).toBe(2);
    expect(
      (
        await f.pool.query(
          "select count(*)::int as n from announcement_revisions where announcement_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(2);
  } finally {
    await second.close();
    await f.cleanup();
  }
});
