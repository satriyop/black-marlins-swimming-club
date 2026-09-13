import type { Actor } from "./actor";
import { hatsFor, type StaffRole } from "./hats";
import { clubIdFor } from "./membership";
import { canInviteStaff, canRevokeStaff } from "./permissions";

export type MemberRow = {
  userId: string;
  name: string;
  email: string | null;
  staffRole: StaffRole | null;
  family: boolean;
  swimmerIds: number[];
  swimmerNames: string[];
};

async function requireAdmin(actor: Actor): Promise<{ clubId: number; hats: Awaited<ReturnType<typeof hatsFor>> }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (hats.staff !== "superadmin" && hats.staff !== "club_admin") throw new Error("Tidak diizinkan");
  return { clubId, hats };
}

async function logEvent(
  actor: Actor,
  clubId: number,
  action: string,
  targetUserId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await actor.sql`
    insert into membership_events (club_id, actor_id, target_user_id, action, detail)
    values (${clubId}, ${actor.userId}, ${targetUserId}, ${action}, ${JSON.stringify(detail)}::jsonb)
  `;
}

async function superadminCount(actor: Actor, clubId: number): Promise<number> {
  const rows = await actor.sql<{ n: number }>`
    select count(*)::int as n from club_staff where club_id = ${clubId} and role = 'superadmin'
  `;
  return rows[0]?.n ?? 0;
}

export async function listMembers(actor: Actor): Promise<MemberRow[]> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const staffOk = hats.staff === "superadmin" || hats.staff === "club_admin";
  const familyOk = hats.guardianSwimmerIds.length > 0 || hats.family === true;
  if (!staffOk && !familyOk) throw new Error("Tidak diizinkan");
  const rows = await actor.sql<{
    user_id: string;
    name: string;
    email: string | null;
    staff_role: StaffRole | null;
    family: boolean;
    swimmer_ids: number[] | null;
    swimmer_names: string[] | null;
  }>`
    with people as (
      select user_id from club_staff where club_id = ${clubId}
      union
      select user_id from club_family where club_id = ${clubId}
      union
      select g.user_id
      from guardians g
      join swimmers sw on sw.id = g.swimmer_id
      where sw.club_id = ${clubId}
    )
    select u.id as user_id, u.name, u.email,
           s.role as staff_role,
           (f.user_id is not null) as family,
           coalesce(array_agg(sw.id order by sw.full_name) filter (where sw.id is not null), '{}') as swimmer_ids,
           coalesce(array_agg(sw.full_name order by sw.full_name) filter (where sw.full_name is not null), '{}') as swimmer_names
    from people p
    join "user" u on u.id = p.user_id
    left join club_staff s on s.user_id = u.id and s.club_id = ${clubId}
    left join club_family f on f.user_id = u.id and f.club_id = ${clubId}
    left join guardians g on g.user_id = u.id
    left join swimmers sw on sw.id = g.swimmer_id and sw.club_id = ${clubId}
    group by u.id, u.name, u.email, s.role, f.user_id
    order by u.name
  `;
  const mapped = rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    staffRole: r.staff_role,
    family: r.family,
    swimmerIds: r.swimmer_ids ?? [],
    swimmerNames: r.swimmer_names ?? [],
  }));
  if (staffOk) return mapped.filter((m) => m.staffRole || m.family || m.swimmerIds.length);
  return mapped.filter((m) => m.userId === actor.userId);
}

export async function setStaffRole(
  actor: Actor,
  input: { userId: string; role: StaffRole },
): Promise<{ ok: true }> {
  const { clubId, hats } = await requireAdmin(actor);
  if (!canInviteStaff(hats, input.role)) throw new Error("Tidak diizinkan");
  return actor.sql.transaction(async (sql) => {
    const tx = { sql, userId: actor.userId };
    await sql`select user_id from club_staff where club_id = ${clubId} and role = 'superadmin' for update`;
    const current = await sql<{ role: StaffRole }>`
      select role from club_staff where club_id = ${clubId} and user_id = ${input.userId} limit 1
    `;
    const n = await superadminCount(tx, clubId);
    if (current[0] && !canRevokeStaff(hats, current[0].role, n)) {
      throw new Error(
        current[0].role === "superadmin" ? "Tidak dapat menurunkan superadmin terakhir." : "Tidak diizinkan",
      );
    }
    if (current[0]?.role === "superadmin" && input.role !== "superadmin" && n <= 1) {
      throw new Error("Tidak dapat menurunkan superadmin terakhir.");
    }
    if (current[0]) {
      await sql`
        update club_staff set role = ${input.role}
        where club_id = ${clubId} and user_id = ${input.userId}
      `;
    } else {
      await sql`
        insert into club_staff (club_id, user_id, role)
        values (${clubId}, ${input.userId}, ${input.role})
      `;
    }
    await logEvent(tx, clubId, "staff_role", input.userId, { role: input.role });
    return { ok: true as const };
  });
}

export async function revokeStaffRole(actor: Actor, input: { userId: string }): Promise<{ ok: true }> {
  const { clubId, hats } = await requireAdmin(actor);
  return actor.sql.transaction(async (sql) => {
    const tx = { sql, userId: actor.userId };
    await sql`select user_id from club_staff where club_id = ${clubId} and role = 'superadmin' for update`;
    const current = await sql<{ role: StaffRole }>`
      select role from club_staff where club_id = ${clubId} and user_id = ${input.userId} limit 1
    `;
    if (!current[0]) throw new Error("Bukan staf klub.");
    const n = await superadminCount(tx, clubId);
    if (!canRevokeStaff(hats, current[0].role, n)) {
      throw new Error(
        current[0].role === "superadmin" ? "Tidak dapat menurunkan superadmin terakhir." : "Tidak diizinkan",
      );
    }
    await sql`delete from club_staff where club_id = ${clubId} and user_id = ${input.userId}`;
    await logEvent(tx, clubId, "staff_revoke", input.userId, { role: current[0].role });
    return { ok: true as const };
  });
}

export async function unlinkGuardian(
  actor: Actor,
  input: { userId: string; swimmerId: number },
): Promise<{ ok: true }> {
  const { clubId } = await requireAdmin(actor);
  const swimmer = await actor.sql<{ id: number }>`
    select id from swimmers where id = ${input.swimmerId} and club_id = ${clubId} limit 1
  `;
  if (!swimmer[0]) throw new Error("Perenang tidak ditemukan");
  await actor.sql`
    delete from guardians
    where user_id = ${input.userId} and swimmer_id = ${input.swimmerId}
  `;
  await logEvent(actor, clubId, "guardian_unlink", input.userId, { swimmerId: input.swimmerId });
  return { ok: true };
}

export async function linkGuardian(
  actor: Actor,
  input: { userId: string; swimmerId: number },
): Promise<{ ok: true }> {
  const { clubId } = await requireAdmin(actor);
  const swimmer = await actor.sql<{ id: number }>`
    select id from swimmers where id = ${input.swimmerId} and club_id = ${clubId} limit 1
  `;
  if (!swimmer[0]) throw new Error("Perenang tidak ditemukan");
  await actor.sql`
    insert into club_family (club_id, user_id)
    values (${clubId}, ${input.userId})
    on conflict (club_id, user_id) do nothing
  `;
  await actor.sql`
    insert into guardians (user_id, swimmer_id)
    values (${input.userId}, ${input.swimmerId})
    on conflict (user_id, swimmer_id) do nothing
  `;
  await logEvent(actor, clubId, "guardian_link", input.userId, { swimmerId: input.swimmerId });
  return { ok: true };
}

export async function listAdminHandoff(actor: Actor): Promise<{ name: string; email: string | null }[]> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (hats.staff !== "coach") throw new Error("Tidak diizinkan");
  return actor.sql<{ name: string; email: string | null }>`
    select u.name, u.email
    from club_staff s join "user" u on u.id = s.user_id
    where s.club_id = ${clubId} and s.role in ('superadmin', 'club_admin')
    order by s.role desc, u.name
  `;
}

export async function submitAccessHelp(
  actor: Actor,
  input: { kind: "missing_child" | "wrong_link"; message: string },
): Promise<{ ok: true }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (!hats.family && hats.guardianSwimmerIds.length === 0) throw new Error("Tidak diizinkan");
  const message = input.message.trim();
  if (!message) throw new Error("Pesan wajib diisi");
  await actor.sql`
    insert into access_help_requests (club_id, user_id, kind, message)
    values (${clubId}, ${actor.userId}, ${input.kind}, ${message})
  `;
  return { ok: true };
}

export async function listAccessHelp(actor: Actor) {
  const { clubId } = await requireAdmin(actor);
  return actor.sql<{
    id: number;
    user_id: string;
    name: string;
    email: string | null;
    kind: string;
    message: string;
    created_at: string;
    resolved_at: string | null;
  }>`
    select r.id, r.user_id, u.name, u.email, r.kind, r.message, r.created_at::text, r.resolved_at::text
    from access_help_requests r
    join "user" u on u.id = r.user_id
    where r.club_id = ${clubId} and r.resolved_at is null
    order by r.created_at desc
  `;
}

export async function resolveAccessHelp(actor: Actor, input: { id: number }): Promise<{ ok: true }> {
  const { clubId } = await requireAdmin(actor);
  const rows = await actor.sql<{ id: number }>`
    update access_help_requests
    set resolved_at = now()
    where id = ${input.id} and club_id = ${clubId} and resolved_at is null
    returning id
  `;
  if (!rows[0]) throw new Error("Permintaan tidak ditemukan");
  return { ok: true };
}
