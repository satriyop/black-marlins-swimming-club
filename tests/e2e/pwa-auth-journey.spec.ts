import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/browser-test";
import { createClubFixture } from "./helpers/club-fixture";

function localPool() {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("PWA auth fixtures require an explicit local DATABASE_URL");
  }
  return new Pool({ connectionString: url });
}

type CredentialAccount = { email: string; password: string; userId: string };

async function createSwimmerPasswordAccount(
  page: Page,
  pool: Pool,
  fixture: { clubId: number; swimmerId: number; userId: string },
): Promise<CredentialAccount> {
  const token = randomBytes(24).toString("hex");
  const email = `swimmer-${randomUUID()}@example.test`;
  const password = `swimmer-${randomUUID()}`;
  await pool.query(
    `insert into invites (club_id,email,kind,payload,token,invited_by,expires_at)
     values ($1,$2,'swimmer_account',$3::jsonb,$4,$5,now()+interval '1 day')`,
    [
      fixture.clubId,
      email,
      JSON.stringify({ swimmerIds: [fixture.swimmerId] }),
      token,
      fixture.userId,
    ],
  );
  await page.goto(`/terima?token=${token}`);
  await expect(page.getByText("Akun perenang", { exact: true })).toBeVisible();
  await page.getByLabel("Password baru").fill(password);
  await page.getByRole("button", { name: "Buat akun perenang" }).click();
  await expect(page.getByText("Akun perenang siap digunakan")).toBeVisible();
  const row = await pool.query<{ id: string }>('select id from "user" where email=$1', [email]);
  return { email, password, userId: row.rows[0]!.id };
}

async function issueSessionFor(pool: Pool, userId: string): Promise<string> {
  const token = randomUUID();
  await pool.query(
    'insert into session (id,token,"userId","expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'1 hour\',now())',
    [randomUUID(), token, userId],
  );
  return token;
}

async function signInWithPassword(page: Page, account: CredentialAccount) {
  await page.getByLabel("Email akun perenang").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Masuk dengan password" }).click();
  await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible();
}

test("logout, browser back, and account switching never restore the previous swimmer page", async ({
  page,
}) => {
  const first = await createClubFixture("guardian", { primaryChildName: "Perenang Pertama" });
  const second = await createClubFixture("guardian", { primaryChildName: "Perenang Kedua" });
  const pool = localPool();
  let secondAccount: CredentialAccount | undefined;
  try {
    secondAccount = await createSwimmerPasswordAccount(page, pool, second);
    const firstToken = await first.issueSession();
    await page.goto("/login");
    await page.evaluate(
      (token) => sessionStorage.setItem("bmsc.auth.bearer-token", token),
      firstToken,
    );
    await page.goto(`/perenang/${first.swimmerId}`);
    await expect(page.getByRole("heading", { name: "Perenang Pertama" })).toBeVisible();
    await page.getByRole("button", { name: "Buka menu akun" }).click();
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page.getByLabel("Email akun perenang")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("bmsc.auth.bearer-token")))
      .toBeNull();
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Perenang Pertama" })).toHaveCount(0);

    await signInWithPassword(page, secondAccount);
    await page.goto(`/perenang/${second.swimmerId}`);
    await expect(page.getByRole("heading", { name: "Perenang Kedua" })).toBeVisible();
    await page.getByRole("button", { name: "Buka menu akun" }).click();
    await expect(page.getByRole("dialog", { name: "Akun" })).toContainText(secondAccount.email);
    await expect(page.getByRole("dialog", { name: "Akun" })).not.toContainText(first.email);
    await page.goto(`/perenang/${first.swimmerId}`);
    await expect(page.getByRole("heading", { name: "Perenang Pertama" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buka menu akun" })).toBeVisible();
  } finally {
    await first.cleanup();
    await second.cleanup();
    if (secondAccount) await pool.query('delete from "user" where id=$1', [secondAccount.userId]);
    await pool.end();
  }
});

test("swimmer invite and expired-session login return to the protected deep link", async ({
  page,
}) => {
  const fixture = await createClubFixture("guardian");
  const pool = localPool();
  let account: CredentialAccount | undefined;
  try {
    account = await createSwimmerPasswordAccount(page, pool, fixture);
    const token = await issueSessionFor(pool, account.userId);
    await page.goto("/login");
    await page.evaluate((value) => sessionStorage.setItem("bmsc.auth.bearer-token", value), token);
    await page.goto(`/perenang/${fixture.swimmerId}`);
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toBeVisible();
    await fixture.expireSession(token);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fperenang%2F${fixture.swimmerId}`));
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toHaveCount(0);
    await signInWithPassword(page, account);
    await expect(page).toHaveURL(new RegExp(`/perenang/${fixture.swimmerId}$`));
    await expect(page.getByRole("heading", { name: "Perenang Contoh" })).toBeVisible();
  } finally {
    await fixture.cleanup();
    if (account) await pool.query('delete from "user" where id=$1', [account.userId]);
    await pool.end();
  }
});

test("invalid invitation link explains the problem without querying private data", async ({
  page,
}) => {
  await page.goto("/terima?token=not-a-valid-token");
  await expect(page.getByText("Tautan undangan tidak berlaku")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ke halaman masuk" })).toBeVisible();
});
