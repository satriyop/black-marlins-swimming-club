import type { Actor } from "./actor";
import { contextClubId } from "./membership";

export type StaffRole = "superadmin" | "club_admin" | "coach";

export type Hats = {
  staff: StaffRole | null;
  family?: boolean;
  guardianSwimmerIds: number[];
  selfSwimmerId: number | null;
};

export async function hatsFor(actor: Actor): Promise<Hats> {
  const clubId = await contextClubId(actor);
  if (clubId == null) {
    return { staff: null, family: false, guardianSwimmerIds: [], selfSwimmerId: null };
  }
  const rows = await actor.sql<{
    staff_role: StaffRole | null;
    is_family: boolean;
    guardian_swimmer_ids: number[] | null;
    self_swimmer_id: number | null;
  }>`
    select
      (select role from club_staff where user_id = ${actor.userId} and club_id = ${clubId}) as staff_role,
      exists(select 1 from club_family where user_id = ${actor.userId} and club_id = ${clubId}) as is_family,
      coalesce((
        select array_agg(g.swimmer_id)
        from guardians g
        join swimmers s on s.id = g.swimmer_id
        where g.user_id = ${actor.userId} and s.club_id = ${clubId}
      ), '{}'::int[]) as guardian_swimmer_ids,
      (
        select id from swimmers
        where user_id = ${actor.userId} and club_id = ${clubId}
        order by id
        limit 1
      ) as self_swimmer_id
  `;
  const row = rows[0];
  return {
    staff: row?.staff_role ?? null,
    family: row?.is_family ?? false,
    guardianSwimmerIds: row?.guardian_swimmer_ids ?? [],
    selfSwimmerId: row?.self_swimmer_id ?? null,
  };
}

export function isFamilyMember(hats: Hats): boolean {
  return hats.family === true || hats.guardianSwimmerIds.length > 0;
}

export function canSeeAllSwimmers(hats: Hats): boolean {
  return hats.staff != null;
}

export function canSeeSwimmer(hats: Hats, swimmerId: number): boolean {
  if (canSeeAllSwimmers(hats)) return true;
  if (hats.selfSwimmerId === swimmerId) return true;
  return hats.guardianSwimmerIds.includes(swimmerId);
}
