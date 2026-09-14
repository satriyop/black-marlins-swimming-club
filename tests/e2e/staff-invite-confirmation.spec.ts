import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

test("admin reviews and repeats a staff email before creating privileged access", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("combined", {
    childCount: 0,
    practice: "none",
    results: false,
  });
  try {
    await fixture.signIn(context, baseURL!);
    await page.goto("/undangan");

    const form = page.locator("form", { has: page.getByLabel("Jenis") });
    const email = "pelatih.baru@example.test";
    await form.getByLabel("Jenis").selectOption("staff");
    await form.getByLabel("Email", { exact: true }).fill(email);
    await form.getByRole("button", { name: "Periksa undangan" }).click();

    const review = page.locator("section", {
      has: page.getByRole("heading", { name: "Periksa akses staf" }),
    });
    await expect(review).toBeVisible();
    await expect(review.getByText(email, { exact: true })).toBeVisible();
    await expect(review).toContainText(fixture.email);

    const create = page.getByRole("button", { name: "Konfirmasi & buat" });
    await page.getByLabel("Ketik ulang email staf").fill("alamat.salah@example.test");
    await expect(create).toBeDisabled();
    await page.getByLabel("Ketik ulang email staf").fill(email);
    await expect(create).toBeEnabled();
    await create.click();

    await expect(page.getByRole("heading", { name: "Tautan siap dibagikan" })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
