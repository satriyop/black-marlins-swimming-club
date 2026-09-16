import { z } from "zod";
import type { Actor } from "./actor";
import { canSeeSwimmer, hatsFor } from "./hats";
import { requireClubId } from "./membership";
import type { RegistrationStatus } from "@/lib/swim/registration";

const id = z.number().int().positive();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal lapor tidak valid")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Tanggal lapor tidak valid");

export const saveHeatSheetSchema = z
  .object({
    meetId: id,
    entryId: id,
    expectedRevision: id,
    heat: z.string().trim().max(60, "Seri terlalu panjang").nullable(),
    lane: z
      .number()
      .int()
      .min(1, "Lintasan tidak valid")
      .max(30, "Lintasan tidak valid")
      .nullable(),
    reportDate: date.nullable(),
    reportTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam lapor tidak valid")
      .nullable(),
    warmupNote: z.string().trim().max(1000, "Catatan pemanasan terlalu panjang").nullable(),
  })
  .refine((value) => (value.reportDate == null) === (value.reportTime == null), {
    message: "Isi tanggal dan jam lapor bersama-sama",
  });
export type SaveHeatSheetInput = z.input<typeof saveHeatSheetSchema>;

type RaceResult = {
  id: number;
  resultDate: string;
  round: string | null;
  status: string;
  timeMs: number | null;
  place: number | null;
};

export type RaceDay = {
  meet: {
    id: number;
    name: string;
    course: string;
    startDate: string;
    endDate: string | null;
    venue: string | null;
    city: string | null;
    status: string;
  };
  swimmer: { id: number; name: string };
  canEditHeatSheet: boolean;
  races: Array<{
    id: number;
    stroke: string;
    distanceM: number;
    registrationStatus: RegistrationStatus;
    heat: string | null;
    lane: number | null;
    reportDate: string | null;
    reportTime: string | null;
    warmupNote: string | null;
    heatSheetRevision: number;
    officialResults: RaceResult[];
  }>;
};

const inactiveStates = ["rejected", "declined", "withdrawn"];

export async function getRaceDay(
  actor: Actor,
  meetId: number,
  swimmerId: number,
): Promise<RaceDay> {
  if (![meetId, swimmerId].every((value) => Number.isSafeInteger(value) && value > 0))
    throw new Error("Kejuaraan atau perenang tidak ditemukan");
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  const [meets, swimmers] = await Promise.all([
    actor.sql<{
      id: number;
      name: string;
      course: string;
      start_date: string;
      end_date: string | null;
      venue: string | null;
      city: string | null;
      status: string;
    }>`
      select id,name,course,start_date::text,end_date::text,venue,city,status
      from meets where id=${meetId} and club_id=${clubId} limit 1
    `,
    actor.sql<{ id: number; full_name: string }>`
      select id,full_name from swimmers where id=${swimmerId} and club_id=${clubId} limit 1
    `,
  ]);
  const meet = meets[0];
  const swimmer = swimmers[0];
  if (!meet || !swimmer || !canSeeSwimmer(hats, swimmerId))
    throw new Error("Kejuaraan atau perenang tidak ditemukan");

  const [entries, results] = await Promise.all([
    actor.sql<{
      id: number;
      stroke: string;
      distance_m: number;
      registration_status: RegistrationStatus;
      heat: string | null;
      lane: number | null;
      report_date: string | null;
      report_time: string | null;
      warmup_note: string | null;
      heat_sheet_revision: number;
    }>`
      select e.id,e.stroke,e.distance_m,e.registration_status,e.heat,e.lane,
        e.report_date::text,e.report_time::text,e.warmup_note,e.heat_sheet_revision
      from meet_entries e
      left join meet_eligibility c on c.meet_id=e.meet_id and c.swimmer_id=e.swimmer_id and c.club_id=e.club_id
      where e.club_id=${clubId} and e.meet_id=${meetId} and e.swimmer_id=${swimmerId}
        and e.registration_status not in ('rejected','declined','withdrawn')
        and (c.response is null or c.response not in ('no','withdrawn'))
      order by e.report_date nulls last,e.report_time nulls last,e.distance_m,e.stroke,e.id
    `,
    actor.sql<{
      id: number;
      stroke: string;
      distance_m: number;
      course: string;
      result_date: string;
      round: string | null;
      status: string;
      time_ms: number | null;
      place: number | null;
    }>`
      select id,stroke,distance_m,course,result_date::text,round,status,time_ms,place
      from results where club_id=${clubId} and meet_id=${meetId} and swimmer_id=${swimmerId} and kind='official'
        and result_date >= ${meet.start_date.slice(0, 10)}
        and result_date <= ${meet.end_date?.slice(0, 10) ?? meet.start_date.slice(0, 10)}
      order by result_date,id
    `,
  ]);
  const byEvent = new Map<string, RaceResult[]>();
  for (const result of results) {
    if (result.course !== meet.course) continue;
    const key = `${result.stroke}:${result.distance_m}`;
    const list = byEvent.get(key) ?? [];
    list.push({
      id: result.id,
      resultDate: result.result_date.slice(0, 10),
      round: result.round,
      status: result.status,
      timeMs: result.status === "selesai" ? result.time_ms : null,
      place: result.place,
    });
    byEvent.set(key, list);
  }
  return {
    meet: {
      id: meet.id,
      name: meet.name,
      course: meet.course,
      startDate: meet.start_date.slice(0, 10),
      endDate: meet.end_date?.slice(0, 10) ?? null,
      venue: meet.venue,
      city: meet.city,
      status: meet.status,
    },
    swimmer: { id: swimmer.id, name: swimmer.full_name },
    canEditHeatSheet: hats.staff != null && meet.status !== "batal",
    races: entries
      .filter((entry) => !inactiveStates.includes(entry.registration_status))
      .map((entry) => ({
        id: entry.id,
        stroke: entry.stroke,
        distanceM: entry.distance_m,
        registrationStatus: entry.registration_status,
        heat: entry.heat,
        lane: entry.lane,
        reportDate: entry.report_date?.slice(0, 10) ?? null,
        reportTime: entry.report_time?.slice(0, 5) ?? null,
        warmupNote: entry.warmup_note,
        heatSheetRevision: entry.heat_sheet_revision,
        officialResults: byEvent.get(`${entry.stroke}:${entry.distance_m}`) ?? [],
      })),
  };
}

export async function saveHeatSheet(actor: Actor, input: SaveHeatSheetInput) {
  const data = saveHeatSheetSchema.parse(input);
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  if (!hats.staff) throw new Error("Hanya pelatih atau admin yang dapat mengubah bagan seri");
  return actor.sql.transaction(async (sql) => {
    const meets = await sql<{ start_date: string; end_date: string | null; status: string }>`
      select start_date::text,end_date::text,status from meets
      where id=${data.meetId} and club_id=${clubId} for share
    `;
    const meet = meets[0];
    if (!meet) throw new Error("Kejuaraan tidak ditemukan");
    if (meet.status === "batal") throw new Error("Kejuaraan dibatalkan");
    const entries = await sql<{ registration_status: RegistrationStatus; response: string | null }>`
      select e.registration_status,c.response from meet_entries e
      left join meet_eligibility c on c.meet_id=e.meet_id and c.swimmer_id=e.swimmer_id and c.club_id=e.club_id
      where e.id=${data.entryId} and e.meet_id=${data.meetId} and e.club_id=${clubId}
      for update of e
    `;
    if (
      !entries[0] ||
      inactiveStates.includes(entries[0].registration_status) ||
      ["no", "withdrawn"].includes(entries[0].response ?? "")
    )
      throw new Error("Nomor tidak ditemukan");
    if (
      data.reportDate &&
      (data.reportDate < meet.start_date.slice(0, 10) ||
        data.reportDate > (meet.end_date?.slice(0, 10) ?? meet.start_date.slice(0, 10)))
    )
      throw new Error("Tanggal lapor harus pada hari kejuaraan");
    const updated = await sql<{ heat_sheet_revision: number }>`
      update meet_entries set heat=${data.heat || null},lane=${data.lane},
        report_date=${data.reportDate},report_time=${data.reportTime},
        warmup_note=${data.warmupNote || null},heat_sheet_revision=heat_sheet_revision+1
      where id=${data.entryId} and club_id=${clubId} and heat_sheet_revision=${data.expectedRevision}
      returning heat_sheet_revision
    `;
    if (!updated[0]) throw new Error("Bagan seri sudah berubah. Muat ulang sebelum menyimpan.");
    return { heatSheetRevision: updated[0].heat_sheet_revision };
  });
}
