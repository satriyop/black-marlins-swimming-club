import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "./helpers/browser-test";

function inviteToken() {
  return randomBytes(24).toString("hex");
}

async function seedClubAndInvite(
  pool: Pool,
  userIds: string[],
  overrides: {
    email?: string;
    expiresInHours?: number;
    revoked?: boolean;
    accepted?: boolean;
  } = {},
) {
  const inviterId = `inviter-${randomUUID()}`;
  userIds.push(inviterId);
  const club = await pool.query(
    "insert into clubs (name, short_name, city, province, coach_name) values ('Klub Undangan Uji','BMSC','Klaten','Jateng','Pelatih Contoh') returning id",
  );
  const clubId = club.rows[0].id as number;
  await pool.query('insert into "user" (id,name,email,"emailVerified") values ($1,$2,$3,true)', [
    inviterId,
    "Admin Klub",
    `${inviterId}@example.test`,
  ]);
  const token = inviteToken();
  const email = overrides.email ?? `wali-${randomUUID()}@example.test`;
  const hours = overrides.expiresInHours ?? 72;
  await pool.query(
    `insert into invites (club_id, email, kind, payload, token, invited_by, expires_at, accepted_at, revoked_at)
     values ($1,$2,'guardian','{}'::jsonb,$3,$4, now() + ($5 || ' hours')::interval, $6, $7)`,
    [
      clubId,
      email,
      token,
      inviterId,
      hours,
      overrides.accepted ? new Date().toISOString() : null,
      overrides.revoked ? new Date().toISOString() : null,
    ],
  );
  return { clubId, token, email };
}

async function signInAs(
  pool: Pool,
  userIds: string[],
  context: import("@playwright/test").BrowserContext,
  email: string,
) {
  const userId = `visual-${randomUUID()}`;
  userIds.push(userId);
  await pool.query('insert into "user" (id,name,email,"emailVerified") values ($1,$2,$3,true)', [
    userId,
    "Pengguna Uji",
    email,
  ]);
  const sessionToken = randomUUID();
  await pool.query(
    'insert into session (id,token,"userId","expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'1 hour\',now())',
    [randomUUID(), sessionToken, userId],
  );
  await context.addInitScript(
    (t) => sessionStorage.setItem("bmsc.auth.bearer-token", t),
    sessionToken,
  );
  return userId;
}

async function cleanup(pool: Pool, clubId: number, userIds: string[]) {
  await pool.query("delete from clubs where id=$1", [clubId]);
  for (const id of userIds) {
    await pool.query('delete from "user" where id=$1', [id]);
  }
}

test.describe("invitation screen states (#53)", () => {
  test("expired invite shows a warn-toned status card with a way back to login", async ({ page }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const userIds: string[] = [];
    try {
      const { clubId, token } = await seedClubAndInvite(pool, userIds, { expiresInHours: -1 });
      try {
        await page.goto(`/terima?token=${token}`);
        await expect(page.getByText("Undangan sudah kedaluwarsa")).toBeVisible();
        await expect(page.getByRole("link", { name: "Ke halaman masuk" })).toBeVisible();
      } finally {
        await cleanup(pool, clubId, userIds);
      }
    } finally {
      await pool.end();
    }
  });

  test("revoked invite is distinguished from a merely expired one", async ({ page }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const userIds: string[] = [];
    try {
      const { clubId, token } = await seedClubAndInvite(pool, userIds, { revoked: true });
      try {
        await page.goto(`/terima?token=${token}`);
        await expect(page.getByText("Undangan ini sudah dicabut")).toBeVisible();
      } finally {
        await cleanup(pool, clubId, userIds);
      }
    } finally {
      await pool.end();
    }
  });

  test("already-accepted invite is informational, not an error", async ({ page }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const userIds: string[] = [];
    try {
      const { clubId, token } = await seedClubAndInvite(pool, userIds, { accepted: true });
      try {
        await page.goto(`/terima?token=${token}`);
        await expect(page.getByText("Undangan ini sudah diterima")).toBeVisible();
        await expect(page.getByRole("link", { name: "Masuk ke klub" })).toBeVisible();
      } finally {
        await cleanup(pool, clubId, userIds);
      }
    } finally {
      await pool.end();
    }
  });

  test("a mismatched signed-in account gets a distinct warning instead of a generic error", async ({
    page,
    context,
  }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const userIds: string[] = [];
    try {
      const invitedEmail = `wali-${randomUUID()}@example.test`;
      const { clubId, token } = await seedClubAndInvite(pool, userIds, { email: invitedEmail });
      try {
        await signInAs(pool, userIds, context, `someone-else-${randomUUID()}@example.test`);
        await page.goto(`/terima?token=${token}`);
        await expect(page.getByText("Wali perenang", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: /^Terima sebagai/ }).click();
        await expect(
          page.getByText(
            "Akun ini tidak cocok dengan undangan. Keluar, lalu masuk dengan akun Google yang diundang.",
          ),
        ).toBeVisible();
      } finally {
        await cleanup(pool, clubId, userIds);
      }
    } finally {
      await pool.end();
    }
  });

  test("a matching signed-in account can accept and sees a success status card", async ({
    page,
    context,
  }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const userIds: string[] = [];
    try {
      const invitedEmail = `wali-${randomUUID()}@example.test`;
      const { clubId, token } = await seedClubAndInvite(pool, userIds, { email: invitedEmail });
      try {
        await signInAs(pool, userIds, context, invitedEmail);
        await page.goto(`/terima?token=${token}`);
        await expect(page.getByText("Wali perenang", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: /^Terima sebagai/ }).click();
        await expect(page.getByText("Undangan diterima")).toBeVisible();
        await expect(page.getByRole("link", { name: "Buka klub" })).toBeVisible();
      } finally {
        await cleanup(pool, clubId, userIds);
      }
    } finally {
      await pool.end();
    }
  });
});
