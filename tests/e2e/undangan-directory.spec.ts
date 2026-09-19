import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

test("admin keeps revoke in a per-row menu on Anggota (#100)", async ({ page, context, baseURL }) => {
  const fixture = await createClubFixture("combined");
  try {
    await fixture.signIn(context, baseURL!);
    await page.goto("/undangan");
    await expect(page.getByRole("heading", { name: "Anggota aktif" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cabut staf" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Putuskan / })).toHaveCount(0);
    await page.getByRole("button", { name: `Aksi untuk ${fixture.name}` }).click();
    await expect(page.getByRole("button", { name: "Cabut staf" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Putuskan / }).first()).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
