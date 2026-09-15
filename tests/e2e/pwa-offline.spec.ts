import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";
import type { BrowserContext, Page } from "@playwright/test";

const PUBLIC_CACHE_PATHS = [
  "/favicon.svg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/manifest.webmanifest",
  "/offline.html",
];

async function waitForWorkerControl(page: Page) {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)))
    .toBe(true);
}

async function stageWorkerUpdate(context: BrowserContext, page: Page) {
  await context.route("**/sw.js?build=e2e-update", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
self.addEventListener("install", () => {});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
`,
    }),
  );
  await page.evaluate(() =>
    navigator.serviceWorker.register("/sw.js?build=e2e-update", {
      scope: "/",
      updateViaCache: "none",
    }),
  );
}

test("serves a production worker with explicit cache policy", async ({ request }) => {
  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBe(true);
  expect(worker.headers()["content-type"]).toContain("javascript");
  expect(worker.headers()["cache-control"]).toContain("no-cache");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect(worker.headers()["service-worker-allowed"]).toBe("/");

  const login = await request.get("/login");
  const assetPath = (await login.text()).match(/(?:src|href)="(\/assets\/[^"]+\.js)"/)?.[1];
  expect(assetPath).toBeTruthy();
  const asset = await request.get(assetPath!);
  expect(asset.headers()["cache-control"]).toContain("max-age=31536000");
  expect(asset.headers()["cache-control"]).toContain("immutable");
});

test("uses only the public allowlist and serves the standalone offline recovery page", async ({
  page,
}) => {
  await page.goto("/login");
  await waitForWorkerControl(page);
  await page.goto("/terima?token=do-not-cache-this-token");
  await page.goto("/login");

  const cachedUrls = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls = await Promise.all(
      keys.map(async (key) =>
        (await caches.open(key)).keys().then((requests) => requests.map((r) => r.url)),
      ),
    );
    return urls.flat();
  });
  expect(cachedUrls.map((value) => new URL(value).pathname).sort()).toEqual(PUBLIC_CACHE_PATHS);
  expect(cachedUrls.every((value) => new URL(value).search === "")).toBe(true);
  expect(cachedUrls.join(" ")).not.toContain("do-not-cache-this-token");

  await page.goto("/offline.html");
  await expect(page.getByRole("heading", { name: "Tidak ada koneksi" })).toBeVisible();
  await expect(page.getByText("Masuk ke Black Marlins")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
});

test("defers an update when another tab has unsaved training changes", async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = await createClubFixture("coach", { childCount: 0, practice: "none" });
  const dirtyPage = await context.newPage();
  try {
    await fixture.signIn(context, baseURL!);
    await page.goto("/");
    await dirtyPage.goto("/latihan/baru?weekly=true");
    await waitForWorkerControl(page);
    await waitForWorkerControl(dirtyPage);

    const title = dirtyPage.getByLabel("Nama jadwal");
    await title.fill("Perubahan latihan yang belum disimpan");
    await stageWorkerUpdate(context, page);

    const update = page.getByRole("complementary", { name: "Pembaruan aplikasi" });
    await expect(update.getByText("Versi baru tersedia")).toBeVisible();
    await update.getByRole("button", { name: "Perbarui sekarang" }).click();
    await expect(update.getByRole("alert")).toContainText("tab Black Marlins lain");
    await expect(title).toHaveValue("Perubahan latihan yang belum disimpan");

    await dirtyPage
      .getByRole("complementary", { name: "Pembaruan aplikasi" })
      .getByRole("button", { name: "Nanti" })
      .click();
    await expect(title).toHaveValue("Perubahan latihan yang belum disimpan");
  } finally {
    await dirtyPage.close();
    await fixture.cleanup();
  }
});
