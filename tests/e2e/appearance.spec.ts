import { expect, test } from "./helpers/browser-test";

for (const path of ["/login", "/terima"]) {
  test(`appearance persists on ${path} without hydration errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const choice = page.getByLabel("Tampilan", { exact: true });
    await expect(choice).toHaveValue("dark");
    if (path === "/login") await page.getByLabel("Email akun perenang").fill("draft@example.test");
    await choice.focus();
    await choice.selectOption("light");
    await expect(choice).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    if (path === "/login")
      await expect(page.getByLabel("Email akun perenang")).toHaveValue("draft@example.test");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f4f7f6");
    // Inspect the page before React can execute: the head script must apply the stored mode.
    await page.route(/\/assets\/.*\.js(?:\?.*)?$/, (route) => route.abort());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.unroute(/\/assets\/.*\.js(?:\?.*)?$/);
    await page.reload();
    await expect(choice).toHaveValue("light");
    expect(errors.filter((message) => /hydrat|Minified React|didn't match/i.test(message))).toEqual(
      [],
    );
  });
}

test("system follows device changes, explicit choice overrides and storage syncs", async ({
  page,
}) => {
  await page.goto("/login");
  const choice = page.getByLabel("Tampilan");
  await choice.selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await choice.selectOption("light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() =>
    window.dispatchEvent(new StorageEvent("storage", { key: "bmsc.appearance", newValue: "dark" })),
  );
  await expect(choice).toHaveValue("dark");
});

test("denied storage keeps a working appearance control", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email akun perenang").fill("unsaved@example.test");
  await page.getByLabel("Tampilan").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByLabel("Email akun perenang")).toHaveValue("unsaved@example.test");
  await page.reload();
  await expect(page.getByLabel("Tampilan")).toHaveValue("dark");
});

for (const theme of ["dark", "light"]) {
  test(`modal and toast use the ${theme} appearance`, async ({ page }, info) => {
    await page.goto("http://127.0.0.1:3012/tests/fixtures/visual.html");
    await page.getByLabel("Tampilan").selectOption(theme);
    await page.getByRole("button", { name: "Buka konfirmasi", exact: true }).click();
    await page.getByLabel("Lokasi baru").fill("Kolam kedua");
    await page.screenshot({ path: info.outputPath("modal.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tampilkan notifikasi" }).click();
    await expect(page.getByText("Contoh notifikasi tersimpan.")).toBeVisible();
    await page.screenshot({ path: info.outputPath("toast.png"), animations: "disabled" });
  });
}

test("invalid stored choice falls back to dark", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("bmsc.appearance", "invalid"));
  await page.goto("/login");
  await expect(page.getByLabel("Tampilan")).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
