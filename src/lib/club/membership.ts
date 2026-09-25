import type { Sql } from "@/lib/db";
import type { Actor } from "./actor";

export const CLUB_NOT_CHOSEN = "Klub belum dipilih.";

/** The only Club in the database. Zero clubs is null. More than one, without an explicit id, refuses to guess. */
export async function soleClubId(sql: Sql): Promise<number | null> {
  const rows = await sql<{ id: number }>`select id from clubs`;
  if (rows.length === 1) return rows[0]!.id;
  if (rows.length === 0) return null;
  throw new Error(CLUB_NOT_CHOSEN);
}

async function membershipClubIds(actor: Actor): Promise<number[]> {
  const rows = await actor.sql<{ club_id: number }>`
    select club_id from club_staff where user_id = ${actor.userId}
    union
    select club_id from club_family where user_id = ${actor.userId}
    union
    select s.club_id
    from guardians g
    join swimmers s on s.id = g.swimmer_id
    where g.user_id = ${actor.userId}
    union
    select club_id from swimmers where user_id = ${actor.userId}
  `;
  return rows.map((row) => row.club_id);
}

/**
 * Club this request is about.
 * An explicit `actor.clubId` wins. Otherwise the user's only Club.
 * Hats on several Clubs and no explicit id throws, instead of taking the first hat.
 * No Hat at all is uninvited (null), unless the database itself has exactly one Club
 * so a pending invite can still be claimed.
 */
export async function contextClubId(actor: Actor): Promise<number | null> {
  if (actor.clubId != null) return actor.clubId;
  const mine = await membershipClubIds(actor);
  if (mine.length === 1) return mine[0]!;
  if (mine.length > 1) throw new Error(CLUB_NOT_CHOSEN);
  const rows = await actor.sql<{ id: number }>`select id from clubs`;
  return rows.length === 1 ? rows[0]!.id : null;
}

async function hasHat(actor: Actor, clubId: number): Promise<boolean> {
  const rows = await actor.sql<{ ok: boolean }>`
    select (
      exists(select 1 from club_staff where user_id = ${actor.userId} and club_id = ${clubId})
      or exists(select 1 from club_family where user_id = ${actor.userId} and club_id = ${clubId})
      or exists(
        select 1 from guardians g
        join swimmers s on s.id = g.swimmer_id
        where g.user_id = ${actor.userId} and s.club_id = ${clubId}
      )
      or exists(select 1 from swimmers where user_id = ${actor.userId} and club_id = ${clubId})
    ) as ok
  `;
  return rows[0]?.ok === true;
}

/** Club the user has a Hat on, within the resolved context. No Hat there is uninvited, not another Club. */
export async function clubIdFor(actor: Actor): Promise<number | null> {
  const clubId = await contextClubId(actor);
  if (clubId == null) return null;
  return (await hasHat(actor, clubId)) ? clubId : null;
}

export async function requireClubId(actor: Actor): Promise<number> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Akun belum diundang. Hubungi admin.");
  return clubId;
}
