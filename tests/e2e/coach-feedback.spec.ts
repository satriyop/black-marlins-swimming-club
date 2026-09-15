import { expect, test } from "./helpers/browser-test";
import { createCoachFeedbackFixture } from "./helpers/coach-feedback-fixture";

test("coach shares session feedback, guardian reads it, and retraction removes it", async ({
  browser,
  baseURL,
}) => {
  const fixture = await createCoachFeedbackFixture();
  const coachContext = await browser.newContext();
  const guardianContext = await browser.newContext();
  try {
    await fixture.signIn(coachContext, "coach");
    const coachPage = await coachContext.newPage();
    await coachPage.goto(`${baseURL}/perenang/${fixture.swimmerId}`);
    await coachPage.getByRole("button", { name: "Tambah catatan" }).click();
    const editor = coachPage.getByRole("dialog", { name: "Catatan setelah latihan" });
    await expect(editor.getByLabel("Akses catatan")).toHaveValue("draft");
    await editor.getByLabel("Fokus teknik").fill("Posisi kepala saat gaya bebas");
    await editor.getByLabel("Perkembangan yang terlihat").fill("Pernapasan lebih tenang");
    await editor.getByLabel("Langkah berikutnya").fill("Pertahankan ritme enam kayuhan");
    await editor.getByLabel("Akses catatan").selectOption("shared");
    await editor.getByRole("button", { name: "Simpan catatan" }).click();
    await expect(coachPage.getByText("Dibagikan ke wali")).toBeVisible();

    await fixture.signIn(guardianContext, "guardian");
    const guardianPage = await guardianContext.newPage();
    await guardianPage.goto(`${baseURL}/`);
    const latest = guardianPage.getByRole("region", { name: "Catatan terbaru dari pelatih" });
    await expect(latest.getByText("Pertahankan ritme enam kayuhan")).toBeVisible();
    await latest.getByText("Perenang Catatan").click();
    const journal = guardianPage.getByRole("region", { name: "Catatan perkembangan" });
    await expect(journal.getByText("Posisi kepala saat gaya bebas")).toBeVisible();
    await expect(journal.getByRole("button", { name: "Ubah" })).toHaveCount(0);

    await coachPage.getByRole("button", { name: "Tarik kembali" }).click();
    await coachPage.getByRole("button", { name: "Ya, tarik kembali" }).click();
    await expect(coachPage.getByText("Ditarik kembali", { exact: true })).toBeVisible();
    await guardianPage.reload();
    await expect(guardianPage.getByText("Posisi kepala saat gaya bebas")).toHaveCount(0);
    await expect(
      guardianPage.getByText("Belum ada catatan perkembangan yang dapat dilihat"),
    ).toBeVisible();
  } finally {
    await coachContext.close();
    await guardianContext.close();
    await fixture.cleanup();
  }
});
