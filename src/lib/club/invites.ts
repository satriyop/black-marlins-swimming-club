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
  status?: "pending" | "accepted" | "expired" | "revoked";
  invitedBy?: string | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
};

function acceptPathFor(token: string): string {
  return `/terima?token=${token}`;
}

/** A bearer link exposes only the information needed to choose the acceptance flow. */
export async function previewInvite(sql: Actor["sql"], token: string) {
  const rows = await sql<{
    kind: "staff" | "guardian" | "swimmer_account";
    payload: { role?: StaffRole } | string;
    email: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
    club_name: string;
  }>`
    select i.kind, i.payload, i.email, i.expires_at, i.accepted_at, i.revoked_at, c.name as club_name
    from invites i join clubs c on c.id = i.club_id where i.token = ${token} limit 1
  `;
  const invite = rows[0];
  if (!invite) return { state: "invalid" as const };
  if (invite.accepted_at) return { state: "accepted" as const };
  if (invite.revoked_at) return { state: "revoked" as const };
  if (new Date(invite.expires_at).getTime() <= Date.now()) return { state: "expired" as const };
  const payload = typeof invite.payload === "string" ? JSON.parse(invite.payload) : invite.payload;
  const [local, domain] = invite.email.split("@");
  return {
    state: "pending" as const,
    kind: invite.kind,
    role: payload.role as StaffRole | undefined,
    clubName: invite.club_name,
    emailHint: `${local.slice(0, 1)}***@${domain}`,
    expiresAt: new Date(invite.expires_at).toISOString(),
  };
}

function sameAthleteSet(a: number[], b: number[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const left = new Set(a);
  return b.some((id) => left.has(id));
}

function sameGuardianTarget(a: number[], b: number[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  return sameAthleteSet(a, b);
}

export async function listInvites(actor: Actor): Promise<InviteRow[]> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const staffOk = hats.staff === "superadmin" || hats.staff === "club_admin";
  const familyOk = hats.guardianSwimmerIds.length > 0 || hats.family === true;
  if (hats.staff === "coach" && !staffOk && !familyOk) return [];
  if (!staffOk && !familyOk) throw new Error("Tidak diizinkan");
  const rows = await actor.sql<{
    id: number;
    email: string | null;
    kind: string;
    payload: InviteRow["payload"] | string;
    expires_at: string;
    token: string;
    accepted_at: string | null;
    revoked_at: string | null;
    invited_by: string | null;
    revoked_by: string | null;
  }>`
    select id, email, kind, payload, expires_at, token, accepted_at, revoked_at, invited_by, revoked_by
    from invites
    where club_id = ${clubId}
    order by id desc
  `;
  const mapped = rows.map((r) => {
    const payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
    const expired = new Date(r.expires_at).getTime() <= Date.now();
    const status: InviteRow["status"] = r.revoked_at
      ? "revoked"
      : r.accepted_at
        ? "accepted"
        : expired
          ? "expired"
          : "pending";
    return {
      id: r.id,
      email: r.email,
      kind: r.kind,
      payload,
      expiresAt: new Date(r.expires_at).toISOString(),
      token: r.token,
      acceptPath: acceptPathFor(r.token),
      status,
      invitedBy: r.invited_by,
      acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
      revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      revokedBy: r.revoked_by,
    };
  });
  if (staffOk) return mapped;
  return mapped.filter((r) => {
    if (r.status !== "pending") return false;
    if (r.kind !== "guardian" && r.kind !== "swimmer_account") return false;
    const ids = r.payload.swimmerIds ?? [];
    return ids.length > 0 && ids.every((id: number) => hats.guardianSwimmerIds.includes(id));
  });
}

export async function createInvite(
  actor: Actor,
  input: InviteInput,
): Promise<{ token: string; id: number; acceptPath: string }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const email = input.email.toLowerCase().trim();
  const swimmerIds = input.swimmerIds ?? [];
  if (input.kind === "staff") {
    const role = input.role;
    if (!role || !canInviteStaff(hats, role)) throw new Error("Tidak diizinkan");
  } else if (input.kind === "guardian" || input.kind === "swimmer_account") {
    const staffOk = hats.staff === "superadmin" || hats.staff === "club_admin";
    const familyOk = hats.guardianSwimmerIds.length > 0;
    if (input.kind === "swimmer_account" || swimmerIds.length > 0) {
      if (swimmerIds.length === 0) throw new Error("Pilih perenang");
      if (!staffOk && !familyOk) throw new Error("Tidak diizinkan");
      if (!staffOk && swimmerIds.some((id) => !hats.guardianSwimmerIds.includes(id))) {
        throw new Error("Tidak diizinkan");
      }
    } else if (!staffOk) {
      throw new Error("Tidak diizinkan");
    } else {
      const alreadyFamily = await actor.sql<{ n: number }>`
        select count(*)::int as n
        from club_family f
        join "user" u on u.id = f.user_id
        where f.club_id = ${clubId} and lower(u.email) = ${email}
      `;
      if ((alreadyFamily[0]?.n ?? 0) > 0) {
        throw new Error("Email ini sudah wali klub.");
      }
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
  if (input.kind === "swimmer_account") {
    const taken = await actor.sql<{
      n: number;
    }>`select count(*)::int as n from "user" where lower(email) = ${email}`;
    if ((taken[0]?.n ?? 0) > 0) throw new Error("Email ini sudah terpakai.");
  }

  const pending = await actor.sql<{
    kind: string;
    payload: { role?: StaffRole | null; swimmerIds?: number[] } | string;
  }>`
    select kind, payload from invites
    where club_id = ${clubId}
      and accepted_at is null
      and revoked_at is null
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
      sameGuardianTarget(swimmerIds, payload.swimmerIds ?? [])
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
  await sql.transaction((tx) => claimInvite(tx, input));
}

async function claimInvite(
  tx: Actor["sql"],
  input: { token: string; userId: string; email: string },
): Promise<void> {
    const claimed = await tx<{
      id: number;
      club_id: number;
      kind: string;
      payload: { role?: StaffRole | null; swimmerIds?: number[] } | string;
    }>`
      update invites
      set accepted_at = now()
      where token = ${input.token}
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
        and (email is null or lower(email) = ${input.email.toLowerCase()})
      returning id, club_id, kind, payload
    `;
    const invite = claimed[0];
    if (!invite) throw new Error("Undangan tidak berlaku.");
    const payload = typeof invite.payload === "string" ? JSON.parse(invite.payload) : invite.payload;
    if (invite.kind === "staff") {
      const role = payload.role as StaffRole;
      if (role !== "superadmin" && role !== "club_admin" && role !== "coach") {
        throw new Error("Undangan tidak berlaku.");
      }
      const existing = await tx<{ role: StaffRole }>`
        select role from club_staff where club_id = ${invite.club_id} and user_id = ${input.userId} limit 1
      `;
      if (existing[0]) {
        const kept = staffRoleAtLeast(existing[0].role, role);
        if (kept !== existing[0].role) {
          await tx`update club_staff set role = ${kept} where club_id = ${invite.club_id} and user_id = ${input.userId}`;
        }
      } else {
        await tx`
          insert into club_staff (club_id, user_id, role)
          values (${invite.club_id}, ${input.userId}, ${role})
        `;
      }
    } else if (invite.kind === "guardian") {
      await tx`
        insert into club_family (club_id, user_id)
        values (${invite.club_id}, ${input.userId})
        on conflict (club_id, user_id) do nothing
      `;
      for (const swimmerId of payload.swimmerIds ?? []) {
        const swimmer = await tx<{ id: number }>`
          select id from swimmers where id = ${swimmerId} and club_id = ${invite.club_id} limit 1
        `;
        if (!swimmer[0]) throw new Error("Undangan tidak berlaku.");
        await tx`
          insert into guardians (user_id, swimmer_id)
          values (${input.userId}, ${swimmerId})
          on conflict (user_id, swimmer_id) do nothing
        `;
      }
    } else if (invite.kind === "swimmer_account") {
      const swimmerId = payload.swimmerIds?.[0];
      if (swimmerId) {
        await tx`update swimmers set user_id = ${input.userId} where id = ${swimmerId} and club_id = ${invite.club_id}`;
      }
    }
}

export async function acceptSwimmerInvite(
  sql: Actor["sql"],
  input: { token: string; password: string },
): Promise<{ userId: string }> {
  const rows = await sql<{
    email: string | null;
    kind: string;
    accepted_at: string | null;
    revoked_at: string | null;
    expires_at: string;
  }>`select email, kind, accepted_at, revoked_at, expires_at from invites where token = ${input.token} limit 1`;
  const invite = rows[0];
  if (!invite || invite.kind !== "swimmer_account") throw new Error("Undangan tidak berlaku.");
  const email = invite.email;
  if (!email) throw new Error("Undangan tidak berlaku.");
  if (invite.accepted_at || invite.revoked_at || new Date(invite.expires_at).getTime() < Date.now()) {
    throw new Error("Undangan tidak berlaku.");
  }
  if (!input.password || input.password.length < 8) throw new Error("Password minimal 8 karakter");
  const existing = await sql<{
    id: string;
  }>`select id from "user" where lower(email) = ${email.toLowerCase()} limit 1`;
  if (existing[0]) throw new Error("Email ini sudah terpakai.");
  const userId = `usr_${randomBytes(8).toString("hex")}`;
  const hashed = await hashPassword(input.password);
  const accountId = `acc_${randomBytes(8).toString("hex")}`;
  await sql.transaction(async (tx) => {
    await tx`
      insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      values (${userId}, ${email}, ${email}, true, now(), now())
    `;
    await tx`
      insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values (${accountId}, ${userId}, 'credential', ${userId}, ${hashed}, now(), now())
    `;
    await claimInvite(tx, { token: input.token, userId, email });
  });
  return { userId };
}

export async function acceptPendingInvitesForEmail(
  sql: Actor["sql"],
  userId: string,
): Promise<void> {
  const users = await sql<{ email: string }>`select email from "user" where id = ${userId} limit 1`;
  const email = users[0]?.email;
  if (!email) return;
  const pending = await sql<{ token: string }>`
    select token from invites
    where lower(email) = ${email.toLowerCase()}
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
      and kind in ('staff', 'guardian')
  `;
  for (const row of pending) {
    await acceptInvite(sql, { token: row.token, userId, email });
  }
}

async function requireInviteAdmin(actor: Actor) {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (hats.staff !== "superadmin" && hats.staff !== "club_admin") throw new Error("Tidak diizinkan");
  return clubId;
}

export async function revokeInvite(actor: Actor, input: { id: number }): Promise<{ ok: true }> {
  const clubId = await requireInviteAdmin(actor);
  const rows = await actor.sql<{ id: number; accepted_at: string | null }>`
    select id, accepted_at from invites where id = ${input.id} and club_id = ${clubId} limit 1
  `;
  if (!rows[0]) throw new Error("Undangan tidak ditemukan");
  if (rows[0].accepted_at) throw new Error("Undangan yang sudah diterima tidak dapat dibatalkan.");
  await actor.sql`
    update invites set revoked_at = now(), revoked_by = ${actor.userId}
    where id = ${input.id} and club_id = ${clubId} and accepted_at is null
  `;
  return { ok: true };
}

export async function recreateInvite(
  actor: Actor,
  input: { id: number },
): Promise<{ token: string; id: number; acceptPath: string }> {
  const clubId = await requireInviteAdmin(actor);
  const rows = await actor.sql<{
    email: string | null;
    kind: InviteInput["kind"];
    payload: { role?: StaffRole | null; swimmerIds?: number[] } | string;
    accepted_at: string | null;
  }>`
    select email, kind, payload, accepted_at from invites where id = ${input.id} and club_id = ${clubId} limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Undangan tidak ditemukan");
  if (row.accepted_at) throw new Error("Undangan yang sudah diterima tidak dapat dipakai ulang.");
  if (!row.email) throw new Error("Undangan tidak berlaku.");
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return actor.sql.transaction(async (sql) => {
    const tx = { sql, userId: actor.userId };
    await revokeInvite(tx, { id: input.id });
    const created = await createInvite(tx, {
      kind: row.kind,
      email: row.email!,
      role: payload.role ?? undefined,
      swimmerIds: payload.swimmerIds ?? [],
    });
    await sql`
      update invites set superseded_by = ${created.id} where id = ${input.id} and club_id = ${clubId}
    `;
    return created;
  });
}
