import { randomBytes } from "node:crypto";
import type { Actor } from "./actor";
import { hatsFor, type StaffRole } from "./hats";
import { clubIdFor } from "./membership";
import { hashPassword } from "better-auth/crypto";
import { canInviteStaff, staffRoleAtLeast } from "./permissions";

export type InviteInput = {
  kind: "staff" | "guardian" | "swimmer_account";
  email: string;
  role?: StaffRole;
  swimmerIds?: number[];
};

function token(): string {
  return randomBytes(24).toString("hex");
}

export type InviteRow = {
  id: number;
  email: string | null;
  kind: string;
  payload: { role?: StaffRole | null; swimmerIds?: number[] };
  expiresAt: string;
  token: string;
  acceptPath: string;
};

function acceptPathFor(token: string): string {
  return `/terima?token=${token}`;
}

function sameAthleteSet(a: number[], b: number[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const left = new Set(a);
  return b.some((id) => left.has(id));
}

export async function listInvites(actor: Actor): Promise<InviteRow[]> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const staffOk = hats.staff === "superadmin" || hats.staff === "club_admin";
  const familyOk = hats.guardianSwimmerIds.length > 0;
  if (!staffOk && !familyOk) throw new Error("Tidak diizinkan");
  const rows = await actor.sql<{
    id: number;
    email: string | null;
    kind: string;
    payload: InviteRow["payload"] | string;
    expires_at: string;
    token: string;
  }>`
    select id, email, kind, payload, expires_at, token
    from invites
    where club_id = ${clubId} and accepted_at is null
    order by id desc
  `;
  const mapped = rows.map((r) => {
    const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    return {
      id: r.id,
      email: r.email,
      kind: r.kind,
      payload,
      expiresAt: r.expires_at,
      token: r.token,
      acceptPath: acceptPathFor(r.token),
    };
  });
  if (staffOk) return mapped;
  return mapped.filter((r) => {
    if (r.kind !== "guardian" && r.kind !== "swimmer_account") return false;
    const ids = r.payload.swimmerIds ?? [];
    return ids.length > 0 && ids.every((id: number) => hats.guardianSwimmerIds.includes(id));
  });
}

export async function createInvite(actor: Actor, input: InviteInput): Promise<{ token: string; id: number; acceptPath: string }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const email = input.email.toLowerCase().trim();
  const swimmerIds = input.swimmerIds ?? [];
  if (input.kind === "staff") {
    const role = input.role;
    if (!role || !canInviteStaff(hats, role)) throw new Error("Tidak diizinkan");
  } else if (input.kind === "guardian" || input.kind === "swimmer_account") {
    if (swimmerIds.length === 0) throw new Error("Pilih perenang");
    const staffOk = hats.staff === "superadmin" || hats.staff === "club_admin";
    const familyOk = hats.guardianSwimmerIds.length > 0;
    if (!staffOk && !familyOk) throw new Error("Tidak diizinkan");
    if (!staffOk && swimmerIds.some((id) => !hats.guardianSwimmerIds.includes(id))) {
      throw new Error("Tidak diizinkan");
    }
  }

  if (input.kind === "guardian" || input.kind === "swimmer_account") {
    for (const swimmerId of swimmerIds) {
      const linked = await actor.sql<{ n: number }>`
        select count(*)::int as n
        from guardians g
        join "user" u on u.id = g.user_id
        where g.swimmer_id = ${swimmerId} and lower(u.email) = ${email}
      `;
      if ((linked[0]?.n ?? 0) > 0) {
        throw new Error("Email ini sudah wali perenang tersebut.");
      }
    }
  }
  if (input.kind === "staff") {
    const already = await actor.sql<{ n: number }>`
      select count(*)::int as n
      from club_staff s
      join "user" u on u.id = s.user_id
      where s.club_id = ${clubId} and lower(u.email) = ${email}
    `;
    if ((already[0]?.n ?? 0) > 0) {
      throw new Error("Email ini sudah staf klub.");
    }
  }

  const pending = await actor.sql<{
    kind: string;
    payload: { role?: StaffRole | null; swimmerIds?: number[] } | string;
  }>`
    select kind, payload from invites
    where club_id = ${clubId}
      and accepted_at is null
      and expires_at > now()
      and lower(email) = ${email}
  `;
  for (const row of pending) {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    if (input.kind === "staff" && row.kind === "staff") {
      throw new Error("Undangan untuk email ini sudah ada.");
    }
    if (
      (input.kind === "guardian" || input.kind === "swimmer_account") &&
      row.kind === input.kind &&
      sameAthleteSet(swimmerIds, payload.swimmerIds ?? [])
    ) {
      throw new Error("Undangan untuk wali dan perenang ini sudah ada.");
    }
  }

  const payload = { role: input.role ?? null, swimmerIds };
  const t = token();
  const rows = await actor.sql<{ id: number }>`
    insert into invites (club_id, email, kind, payload, token, invited_by, expires_at)
    values (
      ${clubId},
      ${email},
      ${input.kind},
      ${JSON.stringify(payload)}::jsonb,
      ${t},
      ${actor.userId},
      now() + interval '14 days'
    )
    returning id
  `;
  return { id: rows[0]!.id, token: t, acceptPath: acceptPathFor(t) };
}

export async function acceptInvite(
  sql: Actor["sql"],
  input: { token: string; userId: string; email: string },
): Promise<void> {
  const rows = await sql<{
    id: number;
    club_id: number;
    email: string | null;
    kind: string;
    payload: { role?: StaffRole | null; swimmerIds?: number[] } | string;
    expires_at: string;
    accepted_at: string | null;
  }>`select * from invites where token = ${input.token} limit 1`;
  const invite = rows[0];
  if (!invite || invite.accepted_at) throw new Error("Undangan tidak berlaku.");
  if (new Date(invite.expires_at).getTime() < Date.now()) throw new Error("Undangan tidak berlaku.");
  if (invite.email && invite.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new Error("Undangan tidak berlaku.");
  }
  const payload = typeof invite.payload === "string" ? JSON.parse(invite.payload) : invite.payload;
  if (invite.kind === "staff") {
    const role = payload.role as StaffRole;
    const existing = await sql<{ role: StaffRole }>`
      select role from club_staff where club_id = ${invite.club_id} and user_id = ${input.userId} limit 1
    `;
    if (existing[0]) {
      const kept = staffRoleAtLeast(existing[0].role, role);
      if (kept !== existing[0].role) {
        await sql`update club_staff set role = ${kept} where club_id = ${invite.club_id} and user_id = ${input.userId}`;
      }
    } else {
      await sql`
        insert into club_staff (club_id, user_id, role)
        values (${invite.club_id}, ${input.userId}, ${role})
      `;
    }
  } else if (invite.kind === "guardian") {
    for (const swimmerId of payload.swimmerIds ?? []) {
      await sql`
        insert into guardians (user_id, swimmer_id)
        values (${input.userId}, ${swimmerId})
        on conflict (user_id, swimmer_id) do nothing
      `;
    }
  } else if (invite.kind === "swimmer_account") {
    const swimmerId = payload.swimmerIds?.[0];
    if (swimmerId) {
      await sql`update swimmers set user_id = ${input.userId} where id = ${swimmerId} and club_id = ${invite.club_id}`;
    }
  }
  await sql`update invites set accepted_at = now() where id = ${invite.id}`;
}

export async function acceptSwimmerInvite(
  sql: Actor["sql"],
  input: { token: string; password: string },
): Promise<{ userId: string }> {
  const rows = await sql<{
    email: string | null;
    kind: string;
    accepted_at: string | null;
    expires_at: string;
  }>`select email, kind, accepted_at, expires_at from invites where token = ${input.token} limit 1`;
  const invite = rows[0];
  if (!invite || invite.kind !== "swimmer_account") throw new Error("Undangan tidak berlaku.");
  if (!invite.email) throw new Error("Undangan tidak berlaku.");
  if (!input.password || input.password.length < 8) throw new Error("Password minimal 8 karakter");
  const existing = await sql<{ id: string }>`select id from "user" where email = ${invite.email} limit 1`;
  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
  } else {
    userId = `usr_${randomBytes(8).toString("hex")}`;
    await sql`
      insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      values (${userId}, ${invite.email}, ${invite.email}, true, now(), now())
    `;
  }
  const hashed = await hashPassword(input.password);
  const accountId = `acc_${randomBytes(8).toString("hex")}`;
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${accountId}, ${userId}, 'credential', ${userId}, ${hashed}, now(), now())
  `;
  await acceptInvite(sql, { token: input.token, userId, email: invite.email });
  return { userId };
}

export async function acceptPendingInvitesForEmail(sql: Actor["sql"], userId: string): Promise<void> {
  const users = await sql<{ email: string }>`select email from "user" where id = ${userId} limit 1`;
  const email = users[0]?.email;
  if (!email) return;
  const pending = await sql<{ token: string }>`
    select token from invites
    where lower(email) = ${email.toLowerCase()}
      and accepted_at is null
      and expires_at > now()
      and kind in ('staff', 'guardian')
  `;
  for (const row of pending) {
    await acceptInvite(sql, { token: row.token, userId, email });
  }
}

