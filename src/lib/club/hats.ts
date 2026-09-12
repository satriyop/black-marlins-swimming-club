import type { Actor } from "./actor";

export type StaffRole = "superadmin" | "club_admin" | "coach";

export type Hats = {
  staff: StaffRole | null;
  family?: boolean;
  guardianSwimmerIds: number[];
  selfSwimmerId: number | null;
};

export async function hatsFor(actor: Actor): Promise<Hats> {
  const staffRows = await actor.sql<{ role: StaffRole }>`
    select role from club_staff where user_id = ${actor.userId} limit 1
  `;
  const familyRows = await actor.sql<{ n: number }>`
    select 1 as n from club_family where user_id = ${actor.userId} limit 1
  `;
  const guardianRows = await actor.sql<{ swimmer_id: number }>`
    select swimmer_id from guardians where user_id = ${actor.userId}
  `;
  const selfRows = await actor.sql<{ id: number }>`
    select id from swimmers where user_id = ${actor.userId} limit 1
  `;
  return {
    staff: staffRows[0]?.role ?? null,
    family: familyRows.length > 0,
    guardianSwimmerIds: guardianRows.map((r) => r.swimmer_id),
    selfSwimmerId: selfRows[0]?.id ?? null,
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
