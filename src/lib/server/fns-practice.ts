import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import {
  requestAttendanceCorrection,
  resolveAttendanceCorrection,
  saveAbsenceNotice,
  updateAttendanceStatus,
  withdrawAbsenceNotice,
} from "@/lib/club/attendance";
import {
  addPracticeParticipant,
  cancelPractice,
  completePractice,
  loadPractice,
  mapPractice,
  removePracticeParticipant,
  reopenPractice,
  savePracticeRecord,
  type PracticeRow,
} from "@/lib/club/practice";
import {
  createPracticeSeriesBatch,
  createPracticeSeries,
  listPracticeIcs,
  listPracticeSeries,
  materializePracticeSeries,
  refreshActivePracticeSeries,
  setSeriesActive,
  skipSeriesRange,
} from "@/lib/club/series";
import { hatsFor } from "@/lib/club/hats";
import { canWritePractice } from "@/lib/club/permissions";
import { deletePractice as deletePracticeFor } from "@/lib/club/writes";
import type { Practice } from "@/lib/swim/types";
import type { WeekdayId } from "@/lib/swim/constants";

export type SetInput = {
  block: string; reps: number; distanceM: number; stroke: string; intervalSec?: number | null; description?: string;
};

export const listPractices = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const actor = await requireClub(context.userId);
  const { sql, clubId } = actor;
  if (canWritePractice(await hatsFor(actor))) await refreshActivePracticeSeries(actor);
  const rows = await sql<PracticeRow & { present_count: number; roster_count: number }>`
    select p.id, p.session_date::text as session_date, p.start_time, p.duration_min, p.location, p.kind, p.title, p.focus,
           p.total_meters, p.notes, p.status, p.cancel_reason, p.reopen_reason,
           p.original_session_date::text as original_session_date, p.original_start_time, p.original_location,
           p.revision, p.incomplete_ack, p.series_id, p.occurrence_date::text as occurrence_date,
           coalesce(sum(case when a.on_roll and a.status = 'hadir' then 1 else 0 end), 0)::int as present_count,
           coalesce(sum(case when a.on_roll then 1 else 0 end), 0)::int as roster_count
    from practices p
    left join practice_attendance a on a.practice_id = p.id
    where p.club_id = ${clubId}
    group by p.id
    order by p.session_date desc, p.start_time desc
  `;
  return rows.map((p): Practice => ({
    ...mapPractice(p),
    presentCount: p.present_count,
    rosterCount: p.roster_count,
  }));
});

export const getPractice = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return loadPractice(actor, data.id);
});

export const savePractice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  id?: number; sessionDate: string; startTime?: string; durationMin?: number; location?: string;
  kind: string; title: string; focus?: string; notes?: string; sets: SetInput[]; expectedRevision?: number; scope?: "this" | "future";
}) => {
  if (!input.title.trim()) throw new Error("Judul wajib diisi");
  if (!input.sessionDate) throw new Error("Tanggal wajib diisi");
  return input;
}).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return savePracticeRecord(actor, data);
});

export const deletePractice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return deletePracticeFor(actor, data.id);
});

export const updateAttendance = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number; status: "belum" | "hadir" | "izin" | "sakit" | "alfa"; metersCompleted?: number | null }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return updateAttendanceStatus(actor, data);
});

export const cancelClubPractice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number; reason: string; expectedRevision: number; scope?: "this" | "future" }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return cancelPractice(actor, data);
});

export const completeClubPractice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number; acknowledgeIncomplete?: boolean; expectedRevision: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return completePractice(actor, data);
});

export const reopenClubPractice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number; reason: string; expectedRevision: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return reopenPractice(actor, data);
});

export const addClubPracticeParticipant = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { practiceId: number; swimmerId: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return addPracticeParticipant(actor, data);
});

export const createClubPracticeSeries = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  title: string; weekday: WeekdayId; startTime?: string; durationMin?: number; location?: string;
  kind: string; focus?: string; notes?: string; weeks?: number; fromDate?: string; active?: boolean; sets: SetInput[];
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return createPracticeSeries(actor, data);
});

export const createClubPracticeSeriesBatch = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  title: string; weekdays: WeekdayId[]; startTime?: string; durationMin?: number; location?: string;
  kind: string; focus?: string; notes?: string; weeks?: number; fromDate?: string; active?: boolean; sets: SetInput[];
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return createPracticeSeriesBatch(actor, data);
});

export const setClubPracticeSeriesActive = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number; active: boolean }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return setSeriesActive(actor, data);
});

export const listClubPracticeSeries = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const actor = await requireClub(context.userId);
  return listPracticeSeries(actor);
});

export const skipClubSeriesRange = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  id: number; fromDate: string; toDate: string; reason: string;
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return skipSeriesRange(actor, data);
});

export const refreshClubPracticeSeries = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return materializePracticeSeries(actor, data);
});

export const getPracticeIcs = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const actor = await requireClub(context.userId);
  return listPracticeIcs(actor);
});

export const removeClubPracticeParticipant = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { practiceId: number; swimmerId: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return removePracticeParticipant(actor, data);
});

export const saveClubAbsenceNotice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  practiceId: number; swimmerId: number; kind: "izin" | "sakit"; reason?: string;
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return saveAbsenceNotice(actor, data);
});

export const withdrawClubAbsenceNotice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  practiceId: number; swimmerId: number;
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return withdrawAbsenceNotice(actor, data);
});

export const requestClubAttendanceCorrection = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  attendanceId: number; message: string;
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return requestAttendanceCorrection(actor, data);
});

export const resolveClubAttendanceCorrection = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  id: number; status: "resolved" | "rejected"; resolution: string;
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return resolveAttendanceCorrection(actor, data);
});
