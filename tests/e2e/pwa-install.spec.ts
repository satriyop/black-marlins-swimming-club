import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

test("serves public install identity with the expected production MIME types", async ({
  request,
}) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  await expect(manifestResponse.json()).resolves.toMatchObject({
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });

  for (const path of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
    "/icons/apple-touch-icon.png",
  ]) {
    const response = await request.get(path);
    expect(response.ok(), path).toBe(true);
    expect(response.headers()["content-type"], path).toContain("image/png");
  }
});

test("uses each supported browser install prompt once and explains dismissal", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Pasang aplikasi" })).toBeVisible();
  await page.evaluate(() => {
    const state = window as typeof window & { installPromptCalls?: number };
    state.installPromptCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        state.installPromptCalls = (state.installPromptCalls ?? 0) + 1;
      },
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
    });
    window.dispatchEvent(event);
  });

  await page.getByRole("button", { name: "Pasang aplikasi" }).click();
  const dialog = page.getByRole("dialog", { name: "Pasang Black Marlins" });
  await expect(dialog.getByText("Browser siap memasang Black Marlins")).toBeVisible();
  await dialog.getByRole("button", { name: "Pasang sekarang" }).click();
  await expect(dialog.getByRole("status")).toContainText("Pemasangan dibatalkan");
  await expect(dialog.getByText("Pasang lewat menu browser:")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Pasang sekarang" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as typeof window & { installPromptCalls?: number }).installPromptCalls,
    ),
  ).toBe(1);
});

test("reports an accepted browser install request", async ({ page }) => {
  await page.goto("/login");
  const installAccess = page.getByRole("button", { name: "Pasang aplikasi" });
  await expect(installAccess).toBeVisible();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(event);
  });
  await installAccess.click();
  const dialog = page.getByRole("dialog", { name: "Pasang Black Marlins" });
  await dialog.getByRole("button", { name: "Pasang sekarang" }).click();
  await expect(dialog.getByRole("status")).toContainText("Permintaan pemasangan diterima");
});

test("keeps install help reachable from authenticated mobile and desktop navigation", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("coach");
  try {
    await fixture.signIn(context, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const mobileNav = page.getByRole("navigation", { name: "Navigasi seluler" });
    await mobileNav.getByRole("button", { name: "Lainnya" }).click();
    const more = page.getByRole("navigation", { name: "Menu lainnya" });
    await more.getByRole("button", { name: "Pasang aplikasi" }).click();
    let dialog = page.getByRole("dialog", { name: "Pasang Black Marlins" });
    await expect(dialog).toBeVisible();
    let bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await dialog.getByRole("button", { name: "Tutup dialog" }).click();

    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole("button", { name: "Pasang aplikasi" }).click();
    dialog = page.getByRole("dialog", { name: "Pasang Black Marlins" });
    await dialog.getByRole("button", { name: "Tutup dialog" }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Tutup dialog" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog.getByRole("button", { name: "Tutup dialog" }).click();

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByRole("button", { name: "Pasang aplikasi" }).click();
    dialog = page.getByRole("dialog", { name: "Pasang Black Marlins" });
    await expect(dialog).toBeVisible();
    bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1024);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("shows iPhone Safari instructions when a programmatic prompt is unavailable", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/login`);
    await page.getByRole("button", { name: "Pasang aplikasi" }).click();
    const dialog = page.getByRole("dialog", { name: "Pasang Black Marlins" });
    await expect(dialog.getByText("Di iPhone atau iPad dengan Safari:")).toBeVisible();
    await expect(dialog.getByText(/Tambahkan ke Layar Utama/)).toBeVisible();
    await expect(dialog.getByText(/Open as Web App/)).toBeVisible();
  } finally {
    await context.close();
  }
});

test("hides installation access when already running as an installed app", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
  });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Pasang aplikasi" })).toHaveCount(0);
});
