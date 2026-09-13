import { expect, test } from "./helpers/browser-test";
import { changeAppAppearance } from "./helpers/appearance-control";
import { createClubFixture } from "./helpers/club-fixture";

for (const width of [390, 1440]) {
  test(`signed-in screen evidence and unsaved attendance survive appearance at ${width}`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    const fixture = await createClubFixture();
    try {
      await fixture.signIn(context, baseURL!);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const [name, path] of [
        ["dashboard", "/"],
        ["practice", `/latihan/${fixture.practiceId}`],
        ["profile", `/perenang/${fixture.swimmerId}`],
      ]) {
        await page.goto(path);
        await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible();
        await expect(page.locator("#main-content")).not.toContainText("Memuat");
        for (const theme of ["dark", "light"]) {
          await changeAppAppearance(page, theme);
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({
            path: info.outputPath(`${name}-${theme}.png`),
            fullPage: true,
            animations: "disabled",
          });
        }
      }
      await page.goto(`/latihan/${fixture.practiceId}`);
      const meters = page.getByRole("spinbutton").first();
      await expect(meters).toBeVisible();
      await meters.fill("1250");
      await changeAppAppearance(page, "dark");
      await expect(meters).toHaveValue("1250");
    } finally {
      await fixture.cleanup();
    }
  });
}
