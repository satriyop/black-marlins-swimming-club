import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canWriteSwimmerGoal } from "./permissions";
import { COMPETITION_STROKES, DISTANCES } from "@/lib/swim/constants";
import { todayIso } from "@/lib/utils";

export type SwimmerGoalStatus = "open" | "hit" | "missed";

export type SwimmerGoal = {
  id: number;
  swimmerId: number;
  stroke: string;
  distanceM: number;
  course: "25" | "50";
  targetTimeMs: number;
  startedOn: string;
  deadline: string;
  notes: string | null;
  bestTimeMs: number | null;
  hitOn: string | null;
  deltaMs: number | null;
  status: SwimmerGoalStatus;
  revision: number;
};

export type SaveSwimmerGoalInput = {
  id?: number;
  expectedRevision?: number;
  swimmerId: number;
  stroke: string;
  distanceM: number;
  course: "25" | "50";
  targetTimeMs: number;
  deadline: string;
  notes?: string;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validate(input: SaveSwimmerGoalInput, startedOn: string) {
  if (!Number.isSafeInteger(input.swimmerId) || input.swimmerId <= 0)
    throw new Error("Perenang tidak valid");
  if (!COMPETITION_STROKES.some((stroke) => stroke.id === input.stroke))
    throw new Error("Gaya tidak valid");
  if (!DISTANCES.some((distance) => distance === input.distanceM))
    throw new Error("Jarak tidak valid");
  if (input.course !== "25" && input.course !== "50") throw new Error("Panjang kolam tidak valid");
  if (
    !Number.isSafeInteger(input.targetTimeMs) ||
    input.targetTimeMs <= 0 ||
    input.targetTimeMs > 3_600_000
  )
    throw new Error("Waktu target tidak valid");
  if (!validDate(input.deadline) || input.deadline < startedOn)
    throw new Error("Batas waktu harus pada atau setelah tanggal target dibuat");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 500) throw new Error("Catatan maksimal 500 karakter");
  return notes;
}

async function requireVisibleSwimmer(actor: Actor, swimmerId: number) {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Perenang tidak ditemukan");
  const hats = await hatsFor(actor);
  const rows = await actor.sql<{ id: number }>`
    select id from swimmers where id = ${swimmerId} and club_id = ${clubId} limit 1
  `;
  if (!rows[0] || !canSeeSwimmer(hats, swimmerId)) throw new Error("Perenang tidak ditemukan");
  return { clubId, hats };
}

type GoalRow = {
  id: number;
  swimmer_id: number;
  stroke: string;
  distance_m: number;
  course: "25" | "50";
  target_time_ms: number;
  started_on: string;
  deadline: string;
  notes: string | null;
  best_time_ms: number | null;
  hit_on: string | null;
  revision: number;
};

export async function listSwimmerGoals(actor: Actor, swimmerId: number): Promise<SwimmerGoal[]> {
  const { clubId } = await requireVisibleSwimmer(actor, swimmerId);
  const rows = await actor.sql<GoalRow>`
    select g.id, g.swimmer_id, g.stroke, g.distance_m, g.course,
      g.target_time_ms, g.started_on::text as started_on,
      g.deadline::text as deadline, g.notes, g.revision,
      progress.best_time_ms, progress.hit_on
    from swimmer_goals g
    left join lateral (
      select min(r.time_ms)::int as best_time_ms,
        min(r.result_date) filter (
          where r.time_ms <= g.target_time_ms
            and r.result_date >= g.started_on and r.result_date <= g.deadline
        )::text as hit_on
      from results r
      where r.club_id = g.club_id and r.swimmer_id = g.swimmer_id
        and r.stroke = g.stroke and r.distance_m = g.distance_m and r.course = g.course
        and r.kind in ('official','test') and r.status = 'selesai' and r.time_ms is not null
    ) progress on true
    where g.club_id = ${clubId} and g.swimmer_id = ${swimmerId}
    order by g.deadline desc, g.id desc
  `;
  const today = todayIso();
  return rows.map((row) => {
    const best = row.best_time_ms;
    const status: SwimmerGoalStatus =
      row.hit_on != null ? "hit" : row.deadline < today ? "missed" : "open";
    return {
      id: row.id,
      swimmerId: row.swimmer_id,
      stroke: row.stroke,
      distanceM: row.distance_m,
      course: row.course,
      targetTimeMs: row.target_time_ms,
      startedOn: row.started_on,
      deadline: row.deadline,
      notes: row.notes,
      bestTimeMs: best,
      hitOn: row.hit_on,
      deltaMs: best == null ? null : best - row.target_time_ms,
      status,
      revision: row.revision,
    };
  });
}

type EditableGoalRow = {
  id: number;
  stroke: string;
  distance_m: number;
  course: "25" | "50";
  target_time_ms: number;
  started_on: string;
  deadline: string;
  notes: string | null;
  revision: number;
  hit_on: string | null;
};

async function saveGoalRevision(actor: Actor, goal: EditableGoalRow) {
  await actor.sql`
    insert into swimmer_goal_revisions
      (goal_id,revision,stroke,distance_m,course,target_time_ms,started_on,deadline,notes,changed_by)
    values (${goal.id},${goal.revision},${goal.stroke},${goal.distance_m},${goal.course},
      ${goal.target_time_ms},${goal.started_on},${goal.deadline},${goal.notes},${actor.userId})
  `;
}

export async function saveSwimmerGoal(
  actor: Actor,
  input: SaveSwimmerGoalInput,
): Promise<{ id: number }> {
  const { clubId, hats } = await requireVisibleSwimmer(actor, input.swimmerId);
  if (!canWriteSwimmerGoal(hats)) throw new Error("Tidak diizinkan");
  if (input.id != null) {
    if (!Number.isSafeInteger(input.id) || input.id <= 0) throw new Error("Target tidak ditemukan");
    return actor.sql.transaction(async (sql) => {
      const scoped = { ...actor, sql };
      const rows = await sql<EditableGoalRow>`
        select g.id,g.stroke,g.distance_m,g.course,g.target_time_ms,
          g.started_on::text as started_on,g.deadline::text as deadline,g.notes,g.revision,
          (select min(r.result_date)::text from results r
           where r.club_id=g.club_id and r.swimmer_id=g.swimmer_id
             and r.stroke=g.stroke and r.distance_m=g.distance_m and r.course=g.course
             and r.kind in ('official','test') and r.status='selesai' and r.time_ms is not null
             and r.time_ms <= g.target_time_ms
             and r.result_date >= g.started_on and r.result_date <= g.deadline) as hit_on
        from swimmer_goals g
        where g.id=${input.id} and g.club_id=${clubId} and g.swimmer_id=${input.swimmerId}
        for update of g
      `;
      const existing = rows[0];
      if (!existing) throw new Error("Target tidak ditemukan");
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision! <= 0)
        throw new Error("Versi target tidak valid");
      if (existing.revision !== input.expectedRevision)
        throw new Error("Target sudah berubah. Muat ulang sebelum menyimpan.");
      if (existing.hit_on || existing.deadline < todayIso())
        throw new Error("Target yang sudah selesai tidak dapat diubah");
      const materialChange =
        existing.stroke !== input.stroke ||
        existing.distance_m !== input.distanceM ||
        existing.course !== input.course ||
        existing.target_time_ms !== input.targetTimeMs;
      const startedOn = materialChange ? todayIso() : existing.started_on;
      const notes = validate(input, startedOn);
      const revision = existing.revision + 1;
      await sql`
        update swimmer_goals set stroke=${input.stroke},distance_m=${input.distanceM},
          course=${input.course},target_time_ms=${input.targetTimeMs},started_on=${startedOn},
          deadline=${input.deadline},notes=${notes},revision=${revision},updated_at=now(),
          updated_by=${actor.userId}
        where id=${existing.id} and revision=${existing.revision}
      `;
      await saveGoalRevision(scoped, {
        id: existing.id,
        stroke: input.stroke,
        distance_m: input.distanceM,
        course: input.course,
        target_time_ms: input.targetTimeMs,
        started_on: startedOn,
        deadline: input.deadline,
        notes,
        revision,
        hit_on: null,
      });
      return { id: existing.id };
    });
  }
  const startedOn = todayIso();
  const notes = validate(input, startedOn);
  return actor.sql.transaction(async (sql) => {
    const rows = await sql<{ id: number }>`
      insert into swimmer_goals (club_id, swimmer_id, created_by, stroke, distance_m,
        course, target_time_ms, started_on, deadline, notes)
      values (${clubId}, ${input.swimmerId}, ${actor.userId}, ${input.stroke}, ${input.distanceM},
        ${input.course}, ${input.targetTimeMs}, ${startedOn}, ${input.deadline}, ${notes})
      returning id
    `;
    await saveGoalRevision(
      { ...actor, sql },
      {
        id: rows[0]!.id,
        stroke: input.stroke,
        distance_m: input.distanceM,
        course: input.course,
        target_time_ms: input.targetTimeMs,
        started_on: startedOn,
        deadline: input.deadline,
        notes,
        revision: 1,
        hit_on: null,
      },
    );
    return { id: rows[0]!.id };
  });
}
