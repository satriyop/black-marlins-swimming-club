import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

function localPool() {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("PWA auth fixtures require an explicit local DATABASE_URL");
  }
  return new Pool({ connectionString: url });
}

test("swimmer accepts an invite, signs in with password, and reopens their deep link", async ({
  page,
}) => {
  const fixture = await createClubFixture("combined");
  const pool = localPool();
  const token = randomBytes(24).toString("hex");
  const email = `swimmer-${randomUUID()}@example.test`;
  const password = `swimmer-${randomUUID()}`;
  let swimmerUserId: string | undefined;
  try {
    await pool.query(
      `insert into invites (club_id,email,kind,payload,token,invited_by,expires_at)
       values ($1,$2,'swimmer_account',$3::jsonb,$4,$5,now()+interval '1 day')`,
      [fixture.clubId, email, JSON.stringify({ swimmerIds: [fixture.swimmerId] }), token, fixture.userId],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/terima?token=${token}`);
    await expect(page.getByText("Akun perenang", { exact: true })).toBeVisible();
    await page.getByLabel("Password baru").fill(password);
    await page.getByRole("button", { name: "Buat akun perenang" }).click();
    await expect(page.getByText("Akun perenang siap digunakan")).toBeVisible();
    await page.getByRole("link", { name: "Masuk ke akun perenang" }).click();
    await page.getByLabel("Email akun perenang").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Masuk dengan password" }).click();
    await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible();
    await page.goto(`/perenang/${fixture.swimmerId}`);
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toBeVisible();
    await page.getByRole("button", { name: "Buka menu akun" }).click();
    await expect(page.getByRole("dialog", { name: "Akun" })).toContainText(email);
  } finally {
    const row = await pool.query<{ id: string }>('select id from "user" where email=$1', [email]);
    swimmerUserId = row.rows[0]?.id;
    await fixture.cleanup();
    if (swimmerUserId) await pool.query('delete from "user" where id=$1', [swimmerUserId]);
    await pool.end();
  }
});

test("logout, browser back, and account switching never restore the previous swimmer page", async ({
  page,
}) => {
  const first = await createClubFixture("guardian");
  const second = await createClubFixture("guardian");
  try {
    const firstToken = await first.issueSession();
    await page.goto("/login");
    await page.evaluate((token) => sessionStorage.setItem("bmsc.auth.bearer-token", token), firstToken);
    await page.goto(`/perenang/${first.swimmerId}`);
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toBeVisible();
    await page.getByRole("button", { name: "Buka menu akun" }).click();
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page.getByLabel("Email akun perenang")).toBeVisible();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("bmsc.auth.bearer-token"))).toBeNull();
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toHaveCount(0);

    const secondToken = await second.issueSession();
    await page.evaluate((token) => sessionStorage.setItem("bmsc.auth.bearer-token", token), secondToken);
    await page.goto(`/perenang/${second.swimmerId}`);
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toBeVisible();
    await page.getByRole("button", { name: "Buka menu akun" }).click();
    await expect(page.getByRole("dialog", { name: "Akun" })).toContainText(second.email);
    await expect(page.getByRole("dialog", { name: "Akun" })).not.toContainText(first.email);
    await page.goto(`/perenang/${first.swimmerId}`);
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible();
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

test("expired session sends a reopened protected link to sign-in with a safe return path", async ({
  page,
}) => {
  const fixture = await createClubFixture("guardian");
  try {
    const token = await fixture.issueSession();
    await page.goto("/login");
    await page.evaluate((value) => sessionStorage.setItem("bmsc.auth.bearer-token", value), token);
    await page.goto(`/perenang/${fixture.swimmerId}`);
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toBeVisible();
    await fixture.expireSession(token);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fperenang%2F${fixture.swimmerId}`));
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
