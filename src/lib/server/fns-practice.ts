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
  listPracticeSummaries,
  removePracticeParticipant,
  reopenPractice,
  savePracticeRecord,
} from "@/lib/club/practice";
import {
  createPracticeSeriesBatch,
  createPracticeSeries,
  listPracticeIcs,
  listPracticeSeries,
  listScheduledTrainingDays,
  openScheduledTrainingDay,
  savePlannedAbsenceNotice,
  withdrawPlannedAbsenceNotice,
  setSeriesActive,
  skipSeriesRange,
} from "@/lib/club/series";
import { deletePractice as deletePracticeFor } from "@/lib/club/writes";
import type { WeekdayId } from "@/lib/swim/constants";

export type SetInput = {
  block: string; reps: number; distanceM: number; stroke: string; intervalSec?: number | null; description?: string;
};

export const listPractices = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input?: {
  view?: "overview" | "history"; page?: number;
}) => input ?? {}).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return listPracticeSummaries(actor, { view: data.view ?? "overview", page: data.page });
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

export const listClubScheduledTrainingDays = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((input?: {
  fromDate?: string; days?: number;
}) => input ?? {}).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return listScheduledTrainingDays(actor, data);
});

export const openClubScheduledTrainingDay = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  scheduleId: number; date: string;
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return openScheduledTrainingDay(actor, data);
});

export const saveClubPlannedAbsenceNotice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  scheduleId: number; date: string; swimmerId: number; kind: "izin" | "sakit"; reason?: string;
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return savePlannedAbsenceNotice(actor, data);
});

export const withdrawClubPlannedAbsenceNotice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  scheduleId: number; date: string; swimmerId: number;
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return withdrawPlannedAbsenceNotice(actor, data);
});

export const skipClubSeriesRange = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  id: number; fromDate: string; toDate: string; reason: string;
}) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return skipSeriesRange(actor, data);
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
