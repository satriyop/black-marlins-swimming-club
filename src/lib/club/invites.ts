import { randomBytes } from "node:crypto";
import type { Actor } from "./actor";
import { hatsFor, type StaffRole } from "./hats";
import { clubIdFor } from "./membership";
import { canInviteStaff } from "./permissions";

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
};

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
  }>`
    select id, email, kind, payload, expires_at
    from invites
    where club_id = ${clubId} and accepted_at is null
    order by id desc
  `;
  const mapped = rows.map((r) => ({
    id: r.id,
    email: r.email,
    kind: r.kind,
    payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
    expiresAt: r.expires_at,
  }));
  if (staffOk) return mapped;
  return mapped.filter((r) => r.kind === "guardian" || r.kind === "swimmer_account");
}

export async function createInvite(actor: Actor, input: InviteInput): Promise<{ token: string; id: number }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (input.kind === "staff") {
    const role = input.role;
    if (!role || !canInviteStaff(hats, role)) throw new Error("Tidak diizinkan");
  } else if (input.kind === "guardian" || input.kind === "swimmer_account") {
    const staffOk = hats.staff === "superadmin" || hats.staff === "club_admin";
    const familyOk = hats.guardianSwimmerIds.length > 0;
    if (!staffOk && !familyOk) throw new Error("Tidak diizinkan");
    if (!staffOk && input.swimmerIds?.some((id) => !hats.guardianSwimmerIds.includes(id))) {
      throw new Error("Tidak diizinkan");
    }
  }
  const payload = { role: input.role ?? null, swimmerIds: input.swimmerIds ?? [] };
  const t = token();
  const rows = await actor.sql<{ id: number }>`
    insert into invites (club_id, email, kind, payload, token, invited_by, expires_at)
    values (
      ${clubId},
      ${input.email.toLowerCase().trim()},
      ${input.kind},
      ${JSON.stringify(payload)}::jsonb,
      ${t},
      ${actor.userId},
      now() + interval '14 days'
    )
    returning id
  `;
  return { id: rows[0]!.id, token: t };
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
    await sql`
      insert into club_staff (club_id, user_id, role)
      values (${invite.club_id}, ${input.userId}, ${role})
      on conflict (club_id, user_id) do update set role = excluded.role
    `;
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
