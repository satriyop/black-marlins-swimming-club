import type { Actor } from "./actor";
import { hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canWritePractice } from "./permissions";

export type PracticeSetInput = {
  block: string;
  reps: number;
  distanceM: number;
  stroke: string;
  intervalSec?: number | null;
  description?: string;
};

export async function savePracticeRecord(
  actor: Actor,
  data: {
    id?: number;
    sessionDate: string;
    startTime?: string;
    durationMin?: number;
    location?: string;
    kind: string;
    title: string;
    focus?: string;
    notes?: string;
    sets: PracticeSetInput[];
  },
): Promise<{ id: number }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (!canWritePractice(hats)) throw new Error("Tidak diizinkan");
  for (const s of data.sets) {
    if (s.distanceM <= 0 || s.reps <= 0) throw new Error("Set tidak valid");
  }
  const total = data.sets.reduce((acc, s) => acc + s.reps * s.distanceM, 0);
  await actor.sql.query("begin");
  try {
    let practiceId = data.id;
    if (practiceId) {
      await actor.sql`update practices set session_date = ${data.sessionDate}, start_time = ${data.startTime || null}, duration_min = ${data.durationMin ?? null}, location = ${data.location?.trim() || null}, kind = ${data.kind}, title = ${data.title.trim()}, focus = ${data.focus?.trim() || null}, total_meters = ${total}, notes = ${data.notes?.trim() || null} where id = ${practiceId} and club_id = ${clubId}`;
      await actor.sql`delete from practice_sets where practice_id = ${practiceId} and club_id = ${clubId}`;
    } else {
      const rows = await actor.sql<{ id: number }>`insert into practices (club_id, session_date, start_time, duration_min, location, kind, title, focus, total_meters, notes) values (${clubId}, ${data.sessionDate}, ${data.startTime || null}, ${data.durationMin ?? null}, ${data.location?.trim() || null}, ${data.kind}, ${data.title.trim()}, ${data.focus?.trim() || null}, ${total}, ${data.notes?.trim() || null}) returning id`;
      practiceId = rows[0]!.id;
      const roster = await actor.sql<{ id: number }>`select id from swimmers where club_id = ${clubId} and status = 'aktif'`;
      for (const s of roster) {
        await actor.sql`insert into practice_attendance (club_id, practice_id, swimmer_id, status, meters_completed) values (${clubId}, ${practiceId}, ${s.id}, 'belum', null)`;
      }
    }
    for (let i = 0; i < data.sets.length; i++) {
      const s = data.sets[i]!;
      await actor.sql`insert into practice_sets (club_id, practice_id, sort_order, block, reps, distance_m, stroke, interval_sec, description) values (${clubId}, ${practiceId}, ${i}, ${s.block}, ${s.reps}, ${s.distanceM}, ${s.stroke}, ${s.intervalSec ?? null}, ${s.description?.trim() || null})`;
    }
    await actor.sql.query("commit");
    return { id: practiceId! };
  } catch (err) {
    try {
      await actor.sql.query("rollback");
    } catch {
      /* keep */
    }
    throw err;
  }
}
