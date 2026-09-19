import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

test("empty list pages keep a single create CTA (#99)", async ({ page, context, baseURL }) => {
  const fixture = await createClubFixture("combined", {
    childCount: 0,
    practice: "none",
    results: false,
  });
  try {
    await fixture.signIn(context, baseURL!);
    await page.goto("/pengumuman");
    await expect(page.getByText("Belum ada pengumuman")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pengumuman baru", exact: true })).toHaveCount(1);

    await page.goto("/event");
    await expect(page.getByText("Belum ada event")).toBeVisible();
    await expect(page.getByRole("button", { name: "Event baru", exact: true })).toHaveCount(1);

    await page.goto("/perenang");
    await expect(page.getByText("Belum ada perenang")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tambah perenang", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Daftarkan anak", exact: true })).toHaveCount(1);
  } finally {
    await fixture.cleanup();
  }
});
