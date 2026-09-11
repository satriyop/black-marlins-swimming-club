import type { Actor } from "./actor";

export async function clubIdFor(actor: Actor): Promise<number | null> {
  const staff = await actor.sql<{ club_id: number }>`
    select club_id from club_staff where user_id = ${actor.userId} limit 1
  `;
  if (staff[0]) return staff[0].club_id;
  const guardian = await actor.sql<{ club_id: number }>`
    select s.club_id
    from guardians g
    join swimmers s on s.id = g.swimmer_id
    where g.user_id = ${actor.userId}
    limit 1
  `;
  if (guardian[0]) return guardian[0].club_id;
  const self = await actor.sql<{ club_id: number }>`
    select club_id from swimmers where user_id = ${actor.userId} limit 1
  `;
  return self[0]?.club_id ?? null;
}

export async function requireClubId(actor: Actor): Promise<number> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Akun belum diundang. Hubungi admin.");
  return clubId;
}
