import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";
import { changeAppAppearance } from "./helpers/appearance-control";

for (const role of ["guardian", "coach", "combined"] as const) {
  test(`${role} navigation, account and effective task view`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    const fixture = await createClubFixture(role);
    try {
      await fixture.signIn(context, baseURL!);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Navigasi seluler", exact: true });
      await expect(nav.getByRole("link", { name: "Hari Ini" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      for (const name of ["Latihan", role === "guardian" ? "Anak saya" : "Skuad", "Kejuaraan"]) {
        const link = nav.getByRole("link", { name, exact: true });
        await link.click();
        await expect(link).toHaveAttribute("aria-current", "page");
      }
      const more = nav.getByRole("button", { name: "Lainnya" });
      await more.click();
      const menu = page.getByRole("navigation", { name: "Menu lainnya" });
      await expect(
        menu.getByRole("link", {
          name: role === "coach" ? "Akses" : role === "guardian" ? "Undangan" : "Anggota",
        }),
      ).toBeVisible();
      await menu.getByRole("link", { name: "Pengumuman" }).click();
      await expect(more).toHaveAttribute("aria-current", "true");
      await more.click();
      await expect(menu.getByRole("link", { name: "Pengumuman" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await page.keyboard.press("Escape");
      await expect(more).toBeFocused();
      await expect(menu).toHaveCount(0);
      const account = page.getByRole("button", { name: "Buka menu akun" });
      const box = await account.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await account.focus();
      await page.keyboard.press("Enter");
      const popover = page.getByRole("dialog", { name: "Akun", exact: true });
      await expect(popover.getByRole("heading", { name: fixture.name, exact: true })).toBeVisible();
      const email = popover.getByText(fixture.email, { exact: true });
      await expect(email).toBeVisible();
      const emailBox = await email.boundingBox();
      expect(emailBox, "email box").toBeTruthy();
      expect(emailBox!.width, "email uses the sheet width (#95)").toBeGreaterThan(200);
      expect(emailBox!.height, "email is not letter-wrapped (#95)").toBeLessThan(64);
      await expect(account.locator("img")).toHaveCount(0); // Failed avatar falls back to initials.
      const roles = popover.getByLabel("Peran akun");
      for (const label of role === "combined"
        ? ["Admin klub", "Wali"]
        : role === "guardian"
          ? ["Wali"]
          : ["Pelatih"])
        await expect(roles.getByText(label, { exact: true })).toBeVisible();
      if (role === "combined") {
        await popover.getByRole("button", { name: "Anak saya", exact: true }).click();
        await expect(nav.getByRole("link", { name: "Anak saya", exact: true })).toBeVisible();
        await expect(
          popover.getByRole("button", { name: "Anak saya", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await popover.getByRole("button", { name: "Urus klub", exact: true }).click();
        await expect(nav.getByRole("link", { name: "Skuad", exact: true })).toBeVisible();
      } else await expect(popover.getByRole("group", { name: "Tampilan tugas" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      for (const theme of ["dark", "light"]) {
        await changeAppAppearance(page, theme);
        await expect(popover).toBeVisible();
        await page.screenshot({
          path: info.outputPath(`account-${theme}.png`),
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
      }
      await expect(account).toBeFocused();
      await expect(popover).toHaveCount(0);
      await nav.getByRole("link", { name: "Hari Ini" }).click();
      await expect(nav.getByRole("link", { name: "Hari Ini" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    } finally {
      await fixture.cleanup();
    }
  });
}

test("desktop shell shows the signed-in account and dual-role task switch (#96)", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("combined");
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Pelatih Hardiyanto Wibowo")).toHaveCount(0);
    const account = page.getByLabel("Akun masuk");
    await expect(account.getByText(fixture.name)).toBeVisible();
    await expect(account.getByText(fixture.email, { exact: true })).toBeVisible();
    const headerSwitch = page.getByRole("banner").getByRole("group", { name: "Tampilan tugas" });
    await expect(headerSwitch).toBeVisible();
    await expect(headerSwitch.getByRole("button", { name: "Urus klub", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await headerSwitch.getByRole("button", { name: "Anak saya", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Anak saya" }),
    ).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("sign-out exposes pending and retryable failure, then signs out", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture();
  try {
    await fixture.signIn(context, baseURL!);
    await page.goto("/");
    await page.getByRole("button", { name: "Buka menu akun" }).click();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/auth/sign-out", async (route) => {
      await waiting;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fixture network failure" }),
      });
    });
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Keluar…", exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("alert")).toContainText("Belum berhasil keluar");
    await expect(page.getByRole("button", { name: "Keluar", exact: true })).toBeEnabled();
    await page.unroute("**/api/auth/sign-out");
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page.getByLabel("Email akun perenang")).toBeVisible();
    await expect(page.getByRole("button", { name: "Buka menu akun" })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test("gate marker keeps sign-out unavailable", async ({ page, context, baseURL }) => {
  const fixture = await createClubFixture();
  try {
    await fixture.signIn(context, baseURL!);
    // Local HTTP cannot expose a Secure __Host cookie. Simulate only the cookie
    // reader; identity and effective permissions still come from the real server.
    await page.addInitScript(() => {
      const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
      Object.defineProperty(document, "cookie", {
        get() {
          return `${cookie.get!.call(document)}; __Host-grok_gate_session=visual-marker`;
        },
        set(value) {
          cookie.set!.call(document, value);
        },
      });
    });
    await page.goto("/");
    expect(await page.evaluate(() => document.cookie)).toContain("__Host-grok_gate_session=");
    await page.getByRole("button", { name: "Buka menu akun" }).click();
    await expect(page.getByRole("button", { name: "Keluar", exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Tampilan", exact: true })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("navigation and account reflow with enlarged text and reserve bottom space", async ({
  page,
  context,
  baseURL,
}, info) => {
  const fixture = await createClubFixture();
  try {
    await fixture.signIn(context, baseURL!);
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await page.goto("/aktivitas");
    for (const [width, height] of [
      [320, 844],
      [844, 390],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
      for (const theme of ["dark", "light"]) {
        await changeAppAppearance(page, theme);
        const menu = page.getByRole("dialog", { name: "Akun", exact: true });
        await expect(menu.getByText(fixture.email, { exact: true })).toBeVisible();
        const overflowing = await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter(
              (el) =>
                el.getBoundingClientRect().right > innerWidth &&
                el.getBoundingClientRect().width > 0,
            )
            .map((el) => ({
              tag: el.tagName,
              text: el.textContent?.slice(0, 50),
              right: el.getBoundingClientRect().right,
            })),
        );
        await page.screenshot({
          path: info.outputPath(`menu-${width}-${theme}.png`),
          animations: "disabled",
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          JSON.stringify(overflowing),
        ).toBe(true);
        const rect = await menu.boundingBox();
        expect(rect!.x).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
        await menu.getByRole("button", { name: "Keluar", exact: true }).scrollIntoViewIfNeeded();
        await expect(menu.getByRole("button", { name: "Keluar", exact: true })).toBeInViewport();
        await page.keyboard.press("Escape");
        await page.screenshot({
          path: info.outputPath(`${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
        const sizes = await page.evaluate(() => ({
          padding: parseFloat(
            getComputedStyle(document.querySelector(".app-shell-content")!).paddingBottom,
          ),
          nav: document.querySelector('[aria-label="Navigasi seluler"]')!.getBoundingClientRect()
            .height,
        }));
        if (width < 768) expect(sizes.padding).toBeGreaterThan(sizes.nav);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => (document.documentElement.style.fontSize = "100%"));
    await page.goto(`/latihan/${fixture.practiceId}`);
    await page.getByRole("button", { name: /^Tampilkan detail/ }).first().click();
    const field = page.getByLabel("Jarak selesai (m)");
    await field.fill("1250");
    const nav = page.getByRole("navigation", { name: "Navigasi seluler", exact: true });
    await page.setViewportSize({ width: 390, height: 390 });
    await nav.evaluate((el) => ((el as HTMLElement).style.paddingBottom = "34px"));
    await field.evaluate((el) => {
      (el as HTMLElement).focus();
      el.scrollIntoView({ block: "center", inline: "nearest" });
    });
    await expect
      .poll(async () => {
        const inputBox = await field.boundingBox();
        const navBox = await nav.boundingBox();
        return Boolean(inputBox && navBox && inputBox.y + inputBox.height <= navBox.y);
      }, { timeout: 10_000 })
      .toBe(true);
    const save = page.getByRole("button", { name: "Simpan jarak", exact: true }).last();
    await save.scrollIntoViewIfNeeded();
    await save.click();
    await expect(page.getByText("Tersimpan.", { exact: true })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
