import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import { canSeeSwimmer, hatsFor } from "@/lib/club/hats";
import { saveResult as saveClubResult } from "@/lib/club/results";
import {
  deleteEntry as deleteEntryFor,
  deleteMeet as deleteMeetFor,
  deleteResult as deleteResultFor,
  saveMeetRecord,
} from "@/lib/club/writes";
import {
  loadRegistration,
  openRegistration,
  proposeEntry,
  respondRegistration,
  decideEntry,
  lockRegistration,
  reopenRegistration,
  exportRegistration,
} from "@/lib/club/registration";
import {
  openRegistrationSchema,
  proposeEntrySchema,
  respondRegistrationSchema,
  decideEntrySchema,
  lockRegistrationSchema,
  reopenRegistrationSchema,
  exportRegistrationSchema,
  type RegistrationStatus,
} from "@/lib/swim/registration";
import type { Meet, MeetEntry, Result } from "@/lib/swim/types";

export const listMeets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, clubId } = await requireClub(context.userId);
    const rows = await sql<{
      id: number;
      name: string;
      level: string;
      course: string;
      venue: string | null;
      city: string | null;
      start_date: string;
      end_date: string | null;
      organizer: string | null;
      status: string;
      notes: string | null;
      entry_count: number;
    }>`select m.*, count(e.id)::int as entry_count from meets m left join meet_entries e on e.meet_id = m.id where m.club_id = ${clubId} group by m.id order by m.start_date desc`;
    return rows.map((m): Meet => ({
      id: m.id,
      name: m.name,
      level: m.level,
      course: m.course,
      venue: m.venue,
      city: m.city,
      startDate: m.start_date,
      endDate: m.end_date,
      organizer: m.organizer,
      status: m.status,
      notes: m.notes,
      entryCount: m.entry_count,
    }));
  });

export const getMeet = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ context, data }) => {
    const { sql: connection, clubId, userId } = await requireClub(context.userId);
    return connection.transaction(async (sql) => {
      const hats = await hatsFor({ sql, userId });
      const rows = await sql<{
        id: number;
        name: string;
        level: string;
        course: string;
        venue: string | null;
        city: string | null;
        start_date: string;
        end_date: string | null;
        organizer: string | null;
        status: string;
        notes: string | null;
      }>`select * from meets where id = ${data.id} and club_id = ${clubId} limit 1 for share`;
      const m = rows[0];
      if (!m) throw new Error("Event tidak ditemukan");
      const entries = await sql<{
        id: number;
        meet_id: number;
        swimmer_id: number;
        swimmer_name: string;
        stroke: string;
        distance_m: number;
        age_group: string | null;
        seed_time_ms: number | null;
        registration_status: RegistrationStatus;
        registration_reason: string | null;
        status: string;
        lane: number | null;
        heat: string | null;
      }>`select e.*, s.full_name as swimmer_name from meet_entries e join swimmers s on s.id = e.swimmer_id where e.meet_id = ${data.id} and e.club_id = ${clubId} order by s.full_name, e.distance_m, e.stroke`;
      const results = await sql<{
        id: number;
        swimmer_id: number;
        swimmer_name: string;
        meet_id: number | null;
        meet_name: string | null;
        result_date: string;
        stroke: string;
        distance_m: number;
        course: string;
        time_ms: number | null;
        place: number | null;
        round: string | null;
        status: string;
        kind: "official" | "test";
        is_pb: boolean;
        notes: string | null;
      }>`select r.*, s.full_name as swimmer_name, ${m.name} as meet_name from results r join swimmers s on s.id = r.swimmer_id where r.meet_id = ${data.id} and r.club_id = ${clubId} order by r.place nulls last, r.stroke, r.distance_m`;
      const meet: Meet = {
        id: m.id,
        name: m.name,
        level: m.level,
        course: m.course,
        venue: m.venue,
        city: m.city,
        startDate: m.start_date,
        endDate: m.end_date,
        organizer: m.organizer,
        status: m.status,
        notes: m.notes,
      };
      return {
        meet,
        registration: await loadRegistration({ sql, userId }, data.id),
        entries: entries
          .filter((e) => canSeeSwimmer(hats, e.swimmer_id))
          .map((e): MeetEntry => ({
            id: e.id,
            meetId: e.meet_id,
            swimmerId: e.swimmer_id,
            swimmerName: e.swimmer_name,
            stroke: e.stroke,
            distanceM: e.distance_m,
            ageGroup: e.age_group,
            seedTimeMs: e.seed_time_ms,
            status: e.status,
            registrationStatus: e.registration_status,
            registrationReason: e.registration_reason,
            lane: e.lane,
            heat: e.heat,
          })),
        results: results
          .filter((r) => canSeeSwimmer(hats, r.swimmer_id))
          .map((r): Result => ({
            id: r.id,
            swimmerId: r.swimmer_id,
            swimmerName: r.swimmer_name,
            meetId: r.meet_id,
            meetName: r.meet_name,
            resultDate: r.result_date,
            stroke: r.stroke,
            distanceM: r.distance_m,
            course: r.course,
            timeMs: r.time_ms,
            place: r.place,
            round: r.round,
            status: r.status,
            kind: r.kind,
            isPb: r.is_pb,
            notes: r.notes,
          })),
      };
    });
  });

export const saveMeet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
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
    }) => {
      if (!input.name.trim()) throw new Error("Nama event wajib diisi");
      if (!input.startDate) throw new Error("Tanggal mulai wajib diisi");
      return input;
    },
  )
  .handler(async ({ context, data }) => {
    const actor = await requireClub(context.userId);
    return saveMeetRecord(actor, data);
  });

export const deleteMeet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireClub(context.userId);
    return deleteMeetFor(actor, data.id);
  });

export const saveEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => proposeEntrySchema.parse(input))
  .handler(async ({ context, data }) => proposeEntry(await requireClub(context.userId), data));
export const openMeetRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => openRegistrationSchema.parse(input))
  .handler(async ({ context, data }) => openRegistration(await requireClub(context.userId), data));
export const respondMeetRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => respondRegistrationSchema.parse(input))
  .handler(async ({ context, data }) =>
    respondRegistration(await requireClub(context.userId), data),
  );
export const decideMeetEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => decideEntrySchema.parse(input))
  .handler(async ({ context, data }) => decideEntry(await requireClub(context.userId), data));
export const lockMeetRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => lockRegistrationSchema.parse(input))
  .handler(async ({ context, data }) => lockRegistration(await requireClub(context.userId), data));
export const reopenMeetRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => reopenRegistrationSchema.parse(input))
  .handler(async ({ context, data }) =>
    reopenRegistration(await requireClub(context.userId), data),
  );
export const exportMeetRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => exportRegistrationSchema.parse(input))
  .handler(async ({ context, data }) =>
    exportRegistration(await requireClub(context.userId), data),
  );

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireClub(context.userId);
    return deleteEntryFor(actor, data.id);
  });

export const saveResult = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
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
      notes?: string;
      kind?: "official" | "test";
    }) => {
      if (!input.resultDate) throw new Error("Tanggal wajib diisi");
      return input;
    },
  )
  .handler(async ({ context, data }) => {
    const actor = await requireClub(context.userId);
    const kind = data.kind ?? (data.meetId ? "official" : "test");
    const saved = await saveClubResult(actor, {
      id: data.id,
      swimmerId: data.swimmerId,
      meetId: data.meetId,
      resultDate: data.resultDate,
      stroke: data.stroke,
      distanceM: data.distanceM,
      course: data.course,
      timeMs: data.timeMs,
      place: data.place,
      round: data.round,
      status: data.status,
      kind,
      notes: data.notes,
    });
    return { id: saved.id, isPb: saved.isPb };
  });

export const deleteResult = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireClub(context.userId);
    return deleteResultFor(actor, data.id);
  });
