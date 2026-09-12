import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canEditResult, canWriteOfficialResult, canWriteTestTime } from "./permissions";

type ResultInput = {
  id?: number;
  swimmerId: number;
  meetId?: number | null;
  resultDate: string;
  stroke: string;
  distanceM: number;
  course: "25" | "50";
  timeMs?: number | null;
  place?: number | null;
  round?: string;
  status: string;
  kind: "official" | "test";
  notes?: string;
};

export async function saveResult(
  actor: Actor,
  input: ResultInput,
): Promise<{ id: number; isPb: boolean }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  const owned = await actor.sql<{ id: number }>`
    select id from swimmers where id = ${input.swimmerId} and club_id = ${clubId} limit 1
  `;
  if (!owned[0] || !canSeeSwimmer(hats, input.swimmerId))
    throw new Error("Perenang tidak ditemukan");
  if (input.distanceM <= 0) throw new Error("Jarak tidak valid");
  if (input.timeMs != null && input.timeMs <= 0) throw new Error("Waktu tidak valid");

  let previous: {
    stroke: string;
    distance_m: number;
    course: string;
    kind: "official" | "test";
    swimmer_id: number;
    notes: string | null;
  } | null = null;
  if (input.id != null) {
    const existing = await actor.sql<{
      swimmer_id: number;
      stroke: string;
      distance_m: number;
      course: string;
      kind: "official" | "test";
      notes: string | null;
    }>`select swimmer_id, stroke, distance_m, course, kind, notes from results where id = ${input.id} and club_id = ${clubId} limit 1`;
    const row = existing[0];
    if (!row || row.swimmer_id !== input.swimmerId) throw new Error("Catatan tidak ditemukan");
    previous = row;
    if (!canEditResult(hats, { kind: row.kind, swimmerId: row.swimmer_id })) {
      throw new Error("Tidak diizinkan");
    }
  }
  if (input.kind === "official" && !canWriteOfficialResult(hats, input.swimmerId)) {
    throw new Error("Tidak diizinkan");
  }
  if (input.kind === "test" && !canWriteTestTime(hats, input.swimmerId)) {
    throw new Error("Tidak diizinkan");
  }

  let isPb = false;
  if (input.status === "selesai" && input.timeMs != null) {
    const best =
      input.id != null
        ? await actor.sql<{ t: number | null }>`
            select min(time_ms) as t from results
            where club_id = ${clubId} and swimmer_id = ${input.swimmerId}
              and stroke = ${input.stroke} and distance_m = ${input.distanceM} and course = ${input.course}
              and status = 'selesai' and time_ms is not null and id <> ${input.id}
          `
        : await actor.sql<{ t: number | null }>`
            select min(time_ms) as t from results
            where club_id = ${clubId} and swimmer_id = ${input.swimmerId}
              and stroke = ${input.stroke} and distance_m = ${input.distanceM} and course = ${input.course}
              and status = 'selesai' and time_ms is not null
          `;
    const prev = best[0]?.t;
    isPb = prev == null || input.timeMs < prev;
  }

  if (input.id != null) {
    await actor.sql`
      update results set
        meet_id = ${input.meetId ?? null},
        result_date = ${input.resultDate},
        stroke = ${input.stroke},
        distance_m = ${input.distanceM},
        course = ${input.course},
        time_ms = ${input.timeMs ?? null},
        place = ${input.place ?? null},
        round = ${input.round || null},
        status = ${input.status},
        kind = ${input.kind},
        is_pb = ${isPb},
        notes = ${input.notes !== undefined ? input.notes.trim() || null : (previous?.notes ?? null)}
      where id = ${input.id} and club_id = ${clubId}
    `;
    if (
      previous &&
      (previous.stroke !== input.stroke ||
        previous.distance_m !== input.distanceM ||
        previous.course !== input.course)
    ) {
      await refreshPbFlag(
        actor,
        clubId,
        input.swimmerId,
        previous.stroke,
        previous.distance_m,
        previous.course,
      );
    }
    await refreshPbFlag(
      actor,
      clubId,
      input.swimmerId,
      input.stroke,
      input.distanceM,
      input.course,
    );
    return { id: input.id, isPb };
  }

  const rows = await actor.sql<{ id: number }>`
    insert into results (
      club_id, created_by, swimmer_id, meet_id, result_date, stroke, distance_m, course,
      time_ms, place, round, status, kind, is_pb, notes
    ) values (
      ${clubId}, ${actor.userId}, ${input.swimmerId}, ${input.meetId ?? null}, ${input.resultDate},
      ${input.stroke}, ${input.distanceM}, ${input.course}, ${input.timeMs ?? null},
      ${input.place ?? null}, ${input.round || null}, ${input.status}, ${input.kind}, ${isPb},
      ${input.notes?.trim() || null}
    ) returning id
  `;
  const id = rows[0]!.id;
  await refreshPbFlag(actor, clubId, input.swimmerId, input.stroke, input.distanceM, input.course);
  return { id, isPb };
}

export async function refreshPbFlag(
  actor: Actor,
  clubId: number,
  swimmerId: number,
  stroke: string,
  distanceM: number,
  course: string,
) {
  await actor.sql`
    update results set is_pb = false
    where club_id = ${clubId} and swimmer_id = ${swimmerId}
      and stroke = ${stroke} and distance_m = ${distanceM} and course = ${course}
  `;
  await actor.sql`
    update results set is_pb = true
    where id = (
      select id from results
      where club_id = ${clubId} and swimmer_id = ${swimmerId}
        and stroke = ${stroke} and distance_m = ${distanceM} and course = ${course}
        and status = 'selesai' and time_ms is not null
      order by time_ms asc, id asc
      limit 1
    )
  `;
}
