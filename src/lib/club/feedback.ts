import { z } from "zod";
import type { CoachFeedback, CoachFeedbackStatus } from "@/lib/swim/types";
import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { requireClubId } from "./membership";

const text = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((value) => value || null);
export const feedbackContentSchema = z
  .object({
    focus: text,
    improvement: text,
    nextStep: text,
    status: z.enum(["draft", "private", "shared"]),
  })
  .refine((value) => value.focus || value.improvement || value.nextStep, {
    message: "Isi setidaknya satu bagian catatan",
  });

export const createFeedbackSchema = feedbackContentSchema.and(
  z.object({
    swimmerId: z.number().int().positive(),
    practiceId: z.number().int().positive(),
  }),
);
export const updateFeedbackSchema = feedbackContentSchema.and(
  z.object({ id: z.number().int().positive(), expectedRevision: z.number().int().positive() }),
);
export const retractFeedbackSchema = z.object({
  id: z.number().int().positive(),
  expectedRevision: z.number().int().positive(),
});

type FeedbackRow = {
  id: number;
  swimmer_id: number;
  swimmer_name: string;
  practice_id: number | null;
  practice_title: string;
  practice_date: string;
  focus: string | null;
  improvement: string | null;
  next_step: string | null;
  status: CoachFeedbackStatus;
  created_by: string;
  author_name: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

const feedbackSelect = `select f.id,f.swimmer_id,s.full_name as swimmer_name,f.practice_id,
  f.practice_title,f.practice_date::text,f.focus,f.improvement,f.next_step,f.status,
  f.created_by,coalesce(u.name,'Pelatih') as author_name,f.revision,
  f.created_at::text,f.updated_at::text
  from coach_feedback f
  join swimmers s on s.id=f.swimmer_id and s.club_id=f.club_id
  left join "user" u on u.id=f.created_by`;

function mapFeedback(row: FeedbackRow, actorId: string): CoachFeedback {
  return {
    id: row.id,
    swimmerId: row.swimmer_id,
    swimmerName: row.swimmer_name,
    practiceId: row.practice_id,
    practiceTitle: row.practice_title,
    practiceDate: row.practice_date.slice(0, 10),
    focus: row.focus,
    improvement: row.improvement,
    nextStep: row.next_step,
    status: row.status,
    authorName: row.author_name,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canEdit: row.created_by === actorId && row.status !== "retracted",
  };
}

async function feedbackFor(actor: Actor, id: number, lock = false) {
  const clubId = await requireClubId(actor);
  const rows = await actor.sql.query<FeedbackRow>(
    `${feedbackSelect} where f.id=$1 and f.club_id=$2 ${lock ? "for update of f" : ""}`,
    [id, clubId],
  );
  if (!rows[0]) throw new Error("Catatan tidak ditemukan");
  return { clubId, row: rows[0] };
}

async function requireStaff(actor: Actor) {
  const hats = await hatsFor(actor);
  if (!hats.staff) throw new Error("Hanya staf klub yang dapat menulis catatan");
  return hats;
}

export async function listSwimmerFeedback(
  actor: Actor,
  swimmerId: number,
  audience: "role" | "family" = "role",
) {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  if (!canSeeSwimmer(hats, swimmerId)) throw new Error("Perenang tidak ditemukan");
  const familyAudience = audience === "family" || !hats.staff;
  if (familyAudience && !hats.guardianSwimmerIds.includes(swimmerId)) return [];
  const visibility = !familyAudience
    ? `(f.status <> 'draft' or f.created_by=$3)`
    : `f.status = 'shared'`;
  const rows = await actor.sql.query<FeedbackRow>(
    `${feedbackSelect} where f.club_id=$1 and f.swimmer_id=$2 and ${visibility}
     order by f.practice_date desc,f.id desc`,
    !familyAudience ? [clubId, swimmerId, actor.userId] : [clubId, swimmerId],
  );
  return rows.map((row) => mapFeedback(row, actor.userId));
}

export async function listFeedbackPracticeOptions(actor: Actor, swimmerId: number) {
  const clubId = await requireClubId(actor);
  await requireStaff(actor);
  const rows = await actor.sql<{
    id: number;
    title: string;
    session_date: string;
  }>`
    select p.id,p.title,p.session_date::text
    from practice_attendance a
    join practices p on p.id=a.practice_id and p.club_id=a.club_id
    join swimmers s on s.id=a.swimmer_id and s.club_id=a.club_id
    left join coach_feedback f on f.practice_id=p.id and f.swimmer_id=a.swimmer_id
      and f.created_by=${actor.userId}
    where a.club_id=${clubId} and a.swimmer_id=${swimmerId} and p.status='completed'
      and f.id is null
    order by p.session_date desc,p.id desc
  `;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sessionDate: row.session_date.slice(0, 10),
  }));
}

async function saveRevision(actor: Actor, row: FeedbackRow) {
  await actor.sql`
    insert into coach_feedback_revisions
      (feedback_id,revision,focus,improvement,next_step,status,changed_by)
    values (${row.id},${row.revision},${row.focus},${row.improvement},${row.next_step},${row.status},${actor.userId})
  `;
}

export async function createCoachFeedback(
  actor: Actor,
  input: z.input<typeof createFeedbackSchema>,
) {
  const data = createFeedbackSchema.parse(input);
  return actor.sql.transaction(async (sql) => {
    const scoped = { ...actor, sql };
    const clubId = await requireClubId(scoped);
    await requireStaff(scoped);
    const context = await sql<{
      title: string;
      session_date: string;
    }>`
      select p.title,p.session_date::text
      from practices p
      join practice_attendance a on a.practice_id=p.id and a.club_id=p.club_id
      join swimmers s on s.id=a.swimmer_id and s.club_id=a.club_id
      where p.id=${data.practiceId} and p.club_id=${clubId} and p.status='completed'
        and a.swimmer_id=${data.swimmerId}
      for share of p,a,s
    `;
    if (!context[0]) throw new Error("Pilih latihan selesai yang diikuti perenang ini");
    let rows: FeedbackRow[];
    try {
      const inserted = await sql<{
        id: number;
      }>`
        insert into coach_feedback
          (club_id,swimmer_id,practice_id,practice_title,practice_date,focus,improvement,next_step,status,created_by)
        values (${clubId},${data.swimmerId},${data.practiceId},${context[0].title},${context[0].session_date},
          ${data.focus},${data.improvement},${data.nextStep},${data.status},${actor.userId})
        returning id
      `;
      rows = await sql.query<FeedbackRow>(`${feedbackSelect} where f.id=$1`, [inserted[0]!.id]);
    } catch (error) {
      if (error instanceof Error && /unique|duplicate/i.test(error.message))
        throw new Error("Anda sudah membuat catatan untuk perenang pada latihan ini");
      throw error;
    }
    await saveRevision(scoped, rows[0]!);
    return mapFeedback(rows[0]!, actor.userId);
  });
}

export async function updateCoachFeedback(
  actor: Actor,
  input: z.input<typeof updateFeedbackSchema>,
) {
  const data = updateFeedbackSchema.parse(input);
  return actor.sql.transaction(async (sql) => {
    const scoped = { ...actor, sql };
    await requireStaff(scoped);
    const { row } = await feedbackFor(scoped, data.id, true);
    if (row.created_by !== actor.userId)
      throw new Error("Hanya penulis yang dapat mengubah catatan ini");
    if (row.status === "retracted") throw new Error("Catatan sudah ditarik kembali");
    if (row.revision !== data.expectedRevision)
      throw new Error("Catatan sudah berubah. Muat ulang sebelum menyimpan.");
    const revision = row.revision + 1;
    await sql`
      update coach_feedback set focus=${data.focus},improvement=${data.improvement},
        next_step=${data.nextStep},status=${data.status},revision=${revision},updated_at=now()
      where id=${row.id} and revision=${row.revision}
    `;
    const next = (await sql.query<FeedbackRow>(`${feedbackSelect} where f.id=$1`, [row.id]))[0]!;
    await saveRevision(scoped, next);
    return mapFeedback(next, actor.userId);
  });
}

export async function retractCoachFeedback(
  actor: Actor,
  input: z.input<typeof retractFeedbackSchema>,
) {
  const data = retractFeedbackSchema.parse(input);
  return actor.sql.transaction(async (sql) => {
    const scoped = { ...actor, sql };
    await requireStaff(scoped);
    const { row } = await feedbackFor(scoped, data.id, true);
    if (row.created_by !== actor.userId)
      throw new Error("Hanya penulis yang dapat menarik catatan ini");
    if (row.status === "retracted") throw new Error("Catatan sudah ditarik kembali");
    if (row.revision !== data.expectedRevision)
      throw new Error("Catatan sudah berubah. Muat ulang sebelum menyimpan.");
    const revision = row.revision + 1;
    await sql`
      update coach_feedback set status='retracted',revision=${revision},updated_at=now(),
        retracted_at=now(),retracted_by=${actor.userId}
      where id=${row.id} and revision=${row.revision}
    `;
    const next = (await sql.query<FeedbackRow>(`${feedbackSelect} where f.id=$1`, [row.id]))[0]!;
    await saveRevision(scoped, next);
    return mapFeedback(next, actor.userId);
  });
}

export async function listRecentSharedFeedback(actor: Actor, swimmerIds: number[], limit = 4) {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  const allowedIds = hats.staff
    ? swimmerIds
    : swimmerIds.filter((id) => hats.guardianSwimmerIds.includes(id));
  if (!allowedIds.length) return [];
  const placeholders = allowedIds.map((_, index) => `$${index + 2}`).join(",");
  const rows = await actor.sql.query<FeedbackRow>(
    `${feedbackSelect} where f.club_id=$1 and f.status='shared'
      and f.swimmer_id in (${placeholders})
     order by f.updated_at desc,f.id desc limit $${allowedIds.length + 2}`,
    [clubId, ...allowedIds, limit],
  );
  return rows.map((row) => mapFeedback(row, actor.userId));
}
