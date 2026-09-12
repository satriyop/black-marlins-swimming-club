import type { Actor } from "./actor";
import { hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { refreshPbFlag } from "./results";
import {
  canDeleteResult,
  canDeleteSwimmer,
  canWriteActivity,
  canWriteMeet,
  canWriteMeetEntry,
  canWritePractice,
} from "./permissions";

async function requireClubId(actor: Actor): Promise<number> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  return clubId;
}

export async function deleteSwimmer(actor: Actor, id: number): Promise<{ ok: true }> {
  const hats = await hatsFor(actor);
  if (!canDeleteSwimmer(hats)) throw new Error("Tidak diizinkan");
  const clubId = await requireClubId(actor);
  await actor.sql`delete from swimmers where id = ${id} and club_id = ${clubId}`;
  return { ok: true };
}

export async function deletePractice(actor: Actor, id: number): Promise<{ ok: true }> {
  const hats = await hatsFor(actor);
  if (!canWritePractice(hats)) throw new Error("Tidak diizinkan");
  const clubId = await requireClubId(actor);
  await actor.sql`delete from practices where id = ${id} and club_id = ${clubId}`;
  return { ok: true };
}

export async function deleteMeet(actor: Actor, id: number): Promise<{ ok: true }> {
  const hats = await hatsFor(actor);
  if (!canWriteMeet(hats)) throw new Error("Tidak diizinkan");
  const clubId = await requireClubId(actor);
  await actor.sql`delete from meets where id = ${id} and club_id = ${clubId}`;
  return { ok: true };
}

export async function deleteActivity(actor: Actor, id: number): Promise<{ ok: true }> {
  const hats = await hatsFor(actor);
  if (!canWriteActivity(hats)) throw new Error("Tidak diizinkan");
  const clubId = await requireClubId(actor);
  await actor.sql`delete from activities where id = ${id} and club_id = ${clubId}`;
  return { ok: true };
}

export async function deleteResult(actor: Actor, id: number): Promise<{ ok: true }> {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  const rows = await actor.sql<{
    swimmer_id: number;
    stroke: string;
    distance_m: number;
    course: string;
  }>`
    select swimmer_id, stroke, distance_m, course from results where id = ${id} and club_id = ${clubId} limit 1
  `;
  if (!rows[0] || !canDeleteResult(hats, rows[0].swimmer_id)) throw new Error("Tidak diizinkan");
  const row = rows[0];
  await actor.sql`delete from results where id = ${id} and club_id = ${clubId}`;
  await refreshPbFlag(actor, clubId, row.swimmer_id, row.stroke, row.distance_m, row.course);
  return { ok: true };
}

export async function deleteEntry(actor: Actor, id: number): Promise<{ ok: true }> {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  const rows = await actor.sql<{ swimmer_id: number }>`
    select swimmer_id from meet_entries where id = ${id} and club_id = ${clubId} limit 1
  `;
  if (!rows[0] || !canWriteMeetEntry(hats, rows[0].swimmer_id)) throw new Error("Tidak diizinkan");
  await actor.sql`delete from meet_entries where id = ${id} and club_id = ${clubId}`;
  return { ok: true };
}

export async function saveMeetRecord(
  actor: Actor,
  data: {
    id?: number;
    name: string;
    level: string;
    course: "25" | "50";
    venue?: string;
    city?: string;
    startDate: string;
    endDate?: string;
    organizer?: string;
    status: string;
    notes?: string;
  },
): Promise<{ id: number }> {
  const hats = await hatsFor(actor);
  if (!canWriteMeet(hats)) throw new Error("Tidak diizinkan");
  const clubId = await requireClubId(actor);
  if (data.id) {
    await actor.sql`update meets set name = ${data.name.trim()}, level = ${data.level}, course = ${data.course}, venue = ${data.venue?.trim() || null}, city = ${data.city?.trim() || null}, start_date = ${data.startDate}, end_date = ${data.endDate || null}, organizer = ${data.organizer?.trim() || null}, status = ${data.status}, notes = ${data.notes?.trim() || null} where id = ${data.id} and club_id = ${clubId}`;
    return { id: data.id };
  }
  const rows = await actor.sql<{
    id: number;
  }>`insert into meets (club_id, name, level, course, venue, city, start_date, end_date, organizer, status, notes) values (${clubId}, ${data.name.trim()}, ${data.level}, ${data.course}, ${data.venue?.trim() || null}, ${data.city?.trim() || null}, ${data.startDate}, ${data.endDate || null}, ${data.organizer?.trim() || null}, ${data.status}, ${data.notes?.trim() || null}) returning id`;
  return { id: rows[0]!.id };
}

export async function saveMeetEntry(
  actor: Actor,
  data: {
    meetId: number;
    swimmerId: number;
    stroke: string;
    distanceM: number;
    seedTimeMs?: number | null;
    ageGroup: string;
  },
): Promise<{ id: number }> {
  const hats = await hatsFor(actor);
  if (!canWriteMeetEntry(hats, data.swimmerId)) throw new Error("Tidak diizinkan");
  const clubId = await requireClubId(actor);
  const rows = await actor.sql<{
    id: number;
  }>`insert into meet_entries (club_id, meet_id, swimmer_id, stroke, distance_m, age_group, seed_time_ms, status) values (${clubId}, ${data.meetId}, ${data.swimmerId}, ${data.stroke}, ${data.distanceM}, ${data.ageGroup}, ${data.seedTimeMs ?? null}, 'terdaftar') returning id`;
  return { id: rows[0]!.id };
}
