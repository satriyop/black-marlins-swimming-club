import type { Actor } from "./actor";
import { hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { refreshPbFlag } from "./results";
import {
  canDeleteResult,
  canDeleteSwimmer,
  canWriteActivity,
  canWriteMeet,
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
  const practice = await actor.sql<{ status: string }>`
    select status from practices where id = ${id} and club_id = ${clubId} limit 1
  `;
  if (!practice[0]) throw new Error("Sesi latihan tidak ditemukan");
  if (practice[0].status === "completed" || practice[0].status === "cancelled") {
    throw new Error("Batalkan sesi, jangan hapus.");
  }
  const recorded = await actor.sql<{ n: number }>`
    select count(*)::int as n from practice_attendance
    where practice_id = ${id} and club_id = ${clubId}
      and (status <> 'belum' or meters_completed is not null)
  `;
  if ((recorded[0]?.n ?? 0) > 0) {
    throw new Error("Batalkan sesi, jangan hapus.");
  }
  await actor.sql`delete from practices where id = ${id} and club_id = ${clubId}`;
  return { ok: true };
}

export async function deleteMeet(actor: Actor, id: number): Promise<{ ok: true }> {
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    const hats = await hatsFor(a);
    if (!canWriteMeet(hats)) throw new Error("Tidak diizinkan");
    const clubId = await requireClubId(a);
    await sql`select id from meets where id=${id} and club_id=${clubId} for update`;
    const history = await sql`select 1 from meet_entries where meet_id=${id} and club_id=${clubId}
      union all select 1 from meet_registration_history where meet_id=${id} and club_id=${clubId} limit 1`;
    if (history.length)
      throw new Error("Batalkan kejuaraan untuk mempertahankan riwayat pendaftaran");
    await sql`delete from meets where id=${id} and club_id=${clubId}`;
    return { ok: true };
  });
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

// Compatibility entry point cannot erase registration history or bypass the workflow.
export async function deleteEntry(_actor: Actor, _id: number): Promise<{ ok: true }> {
  throw new Error("Gunakan tarik nomor dengan alasan melalui alur pendaftaran");
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
    return actor.sql.transaction(async (sql) => {
      const before = await sql<{
        course: string;
        start_date: string;
        end_date: string | null;
        status: string;
        registration_state: string;
        registration_revision: number;
      }>`
        select course,start_date,end_date,status,registration_state,registration_revision from meets where id=${data.id} and club_id=${clubId} for update`;
      if (!before[0]) throw new Error("Kejuaraan tidak ditemukan");
      await sql`update meets set name = ${data.name.trim()}, level = ${data.level}, course = ${data.course}, venue = ${data.venue?.trim() || null}, city = ${data.city?.trim() || null}, start_date = ${data.startDate}, end_date = ${data.endDate || null}, organizer = ${data.organizer?.trim() || null}, status = ${data.status}, notes = ${data.notes?.trim() || null} where id = ${data.id} and club_id = ${clubId}`;
      const m = before[0];
      const changed =
        m.course !== data.course ||
        m.start_date !== data.startDate ||
        m.end_date !== (data.endDate || null) ||
        (["batal", "selesai"].includes(m.status) && !["batal", "selesai"].includes(data.status));
      if (changed) {
        await sql`update meet_entries set heat=null,lane=null,report_date=null,report_time=null,
          warmup_note=null,heat_sheet_revision=heat_sheet_revision+1 where meet_id=${data.id} and club_id=${clubId}`;
      }
      if (m.registration_state !== "draft") {
        await sql`update meets set registration_revision=registration_revision+1 where id=${data.id}`;
        if (changed) {
          await sql`update meets set registration_state='open',registration_deadline=null where id=${data.id}`;
          await sql`update meet_entries set registration_status='requested',registration_reason='Konteks kejuaraan berubah; perlu persetujuan baru'
            where meet_id=${data.id} and registration_status in ('approved','submitted','confirmed')`;
        }
        await sql`insert into meet_registration_history (meet_id,club_id,revision,action,actor_id,note)
          values (${data.id},${clubId},${m.registration_revision + 1},'Kejuaraan diperbarui',${actor.userId},
            ${changed ? "Tanggal, kolam, atau pembukaan ulang berubah. Buka kembali tenggat; persetujuan dan ekspor perlu diperbarui." : `Status kejuaraan: ${data.status}`})`;
      }
      return { id: data.id! };
    });
  }
  const rows = await actor.sql<{
    id: number;
  }>`insert into meets (club_id, name, level, course, venue, city, start_date, end_date, organizer, status, notes) values (${clubId}, ${data.name.trim()}, ${data.level}, ${data.course}, ${data.venue?.trim() || null}, ${data.city?.trim() || null}, ${data.startDate}, ${data.endDate || null}, ${data.organizer?.trim() || null}, ${data.status}, ${data.notes?.trim() || null}) returning id`;
  return { id: rows[0]!.id };
}

export { proposeEntry as saveMeetEntry } from "./registration";
