import { expect, test } from "@playwright/test";

const fixture = "http://127.0.0.1:3012/tests/fixtures/visual.html";
test("shared controls keep usable actions, labels and dialog focus", async ({ page }) => {
  await page.goto(fixture);
  const name = page.getByLabel("Nama perenang", { exact: true });
  await name.fill("Perenang contoh");
  await expect(name).toHaveValue("Perenang contoh");
  const open = page.getByRole("button", { name: "Buka konfirmasi", exact: true });
  await open.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Lokasi baru").fill("Kolam kedua");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.getByRole("status")).toContainText("Permintaan dicoba kembali");
});

for (const width of [320, 390, 1440]) {
  test(`shared controls reflow at ${width}px with enlarged text and blocked fonts`, async ({
    page,
  }, info) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await page.goto(fixture);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath("default.png"), fullPage: true });
    await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const control of await page.locator("button,input,select").all()) {
      if (!(await control.isVisible())) continue;
      const box = await control.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "Buka konfirmasi", exact: true }).click();
    await expect(page.getByLabel("Lokasi baru")).toBeVisible();
    await page.getByRole("button", { name: "Tutup dialog" }).click();
    await page.screenshot({ path: info.outputPath("enlarged.png"), fullPage: true });
  });
}

test("semantic status and control text have measured contrast", async ({ page }) => {
  await page.goto(fixture);
  const ratios = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const lum = (rgb: number[]) =>
      rgb
        .slice(0, 3)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [...document.querySelectorAll("span,button,label,input,select")]
      .filter(
        (el) =>
          el.getClientRects().length &&
          !el.matches(":disabled") &&
          (el.textContent?.trim() || el.matches("input")),
      )
      .map((el) => {
        const chain: Element[] = [];
        for (let node: Element | null = el; node; node = node.parentElement) chain.unshift(node);
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#061018";
        ctx.fillRect(0, 0, 1, 1);
        for (const node of chain) {
          ctx.fillStyle = getComputedStyle(node).backgroundColor;
          ctx.fillRect(0, 0, 1, 1);
        }
        const bg = lum([...ctx.getImageData(0, 0, 1, 1).data]);
        ctx.fillStyle = getComputedStyle(el).color;
        ctx.fillRect(0, 0, 1, 1);
        const fg = lum([...ctx.getImageData(0, 0, 1, 1).data]);
        return {
          text: el.textContent?.trim().slice(0, 50),
          ratio: (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05),
        };
      });
  });
  for (const item of ratios) expect(item.ratio, JSON.stringify(item)).toBeGreaterThanOrEqual(4.5);
});
