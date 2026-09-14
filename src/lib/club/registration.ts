import type { z } from "zod";
import type { Actor } from "./actor";
import { hatsFor, canSeeSwimmer } from "./hats";
import { requireClubId } from "./membership";
import { ageGroupForDob } from "../swim/age";
import { formatTime } from "../swim/time";
import {
  openRegistrationSchema,
  proposeEntrySchema,
  respondRegistrationSchema,
  decideEntrySchema,
  lockRegistrationSchema,
  reopenRegistrationSchema,
  exportRegistrationSchema,
  registrationLabels,
  type RegistrationStatus,
  type RegistrationView,
} from "../swim/registration";

type MeetRow = {
  id: number;
  club_id: number;
  name: string;
  status: string;
  start_date: string;
  course: string;
  registration_state: RegistrationView["state"];
  registration_deadline: Date | null;
  registration_revision: number;
  before_deadline: boolean;
  current_meet: boolean;
};
async function meetFor(actor: Actor, meetId: number, lock = false) {
  const clubId = await requireClubId(actor);
  const rows = await actor.sql.query<MeetRow>(
    `select *, coalesce(registration_deadline > clock_timestamp(), false) as before_deadline,
     coalesce(end_date,start_date) >= (clock_timestamp() at time zone 'Asia/Jakarta')::date as current_meet
     from meets where id=$1 and club_id=$2 ${lock ? "for update" : ""}`,
    [meetId, clubId],
  );
  if (!rows[0]) throw new Error("Kejuaraan tidak ditemukan");
  return rows[0];
}
function active(m: MeetRow) {
  if (m.status === "batal" || m.status === "selesai" || !m.current_meet)
    throw new Error("Kejuaraan dibatalkan atau sudah ditutup");
}
function editable(m: MeetRow) {
  active(m);
  if (m.registration_state !== "open" || !m.before_deadline)
    throw new Error("Pendaftaran ditutup atau tenggat terlewati. Minta pelatih membuka kembali.");
}
async function staffFor(actor: Actor) {
  const hats = await hatsFor(actor);
  if (!hats.staff) throw new Error("Hanya pelatih atau admin yang diizinkan");
  return hats;
}
async function mutate<T>(
  actor: Actor,
  input: { meetId: number; expectedRevision: number },
  fn: (a: Actor, m: MeetRow) => Promise<T>,
) {
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    const m = await meetFor(a, input.meetId, true);
    active(m);
    if (m.registration_revision !== input.expectedRevision)
      throw new Error("Data berubah. Muat ulang sebelum melanjutkan.");
    const result = await fn(a, m);
    await sql`update meets set registration_revision = registration_revision + 1 where id = ${m.id}`;
    return result;
  });
}
async function audit(
  a: Actor,
  m: MeetRow,
  action: string,
  note?: string | null,
  swimmerId?: number,
  entryId?: number,
) {
  await a.sql`insert into meet_registration_history (meet_id,club_id,swimmer_id,entry_id,revision,action,actor_id,note)
    values (${m.id},${m.club_id},${swimmerId ?? null},${entryId ?? null},${m.registration_revision + 1},${action},${a.userId},${note ?? null})`;
}
function reason(value?: string) {
  if (!value?.trim()) throw new Error("Alasan atau bukti wajib diisi");
  return value.trim();
}
async function candidate(a: Actor, m: MeetRow, swimmerId: number) {
  const rows = await a.sql<{ date_of_birth: string; response: string }>`
    select s.date_of_birth, c.response from meet_eligibility c join swimmers s on s.id=c.swimmer_id
    where c.meet_id=${m.id} and c.club_id=${m.club_id} and s.club_id=${m.club_id} and s.id=${swimmerId} and s.status='aktif'`;
  if (!rows[0]) throw new Error("Perenang tidak memenuhi daftar peserta yang diizinkan");
  return rows[0];
}
async function eventAllowed(a: Actor, m: MeetRow, stroke: string, distanceM: number) {
  const rows =
    await a.sql`select 1 from meet_event_choices where meet_id=${m.id} and stroke=${stroke} and distance_m=${distanceM}`;
  if (!rows.length) throw new Error("Nomor tidak tersedia pada kejuaraan ini");
}

export async function openRegistration(
  actor: Actor,
  input: z.input<typeof openRegistrationSchema>,
) {
  const d = openRegistrationSchema.parse(input);
  return mutate(actor, d, async (a, m) => {
    await staffFor(a);
    if (m.registration_state !== "draft")
      throw new Error("Pendaftaran sudah dibuka. Gunakan buka kembali untuk koreksi.");
    await validateDeadline(a, m, d.deadline);
    if (
      new Set(d.swimmers.map((s) => s.swimmerId)).size !== d.swimmers.length ||
      new Set(d.events.map((e) => `${e.stroke}:${e.distanceM}`)).size !== d.events.length
    )
      throw new Error("Peserta atau nomor tidak boleh duplikat");
    for (const s of d.swimmers) {
      const rows =
        await a.sql`select 1 from swimmers where id=${s.swimmerId} and club_id=${m.club_id} and status='aktif'`;
      if (!rows.length) throw new Error("Perenang tidak valid untuk klub ini");
      await a.sql`insert into meet_eligibility (meet_id,swimmer_id,club_id,group_name) values (${m.id},${s.swimmerId},${m.club_id},${s.groupName})`;
    }
    for (const e of d.events)
      await a.sql`insert into meet_event_choices (meet_id,stroke,distance_m) values (${m.id},${e.stroke},${e.distanceM})`;
    await a.sql`update meets set registration_state='open',registration_deadline=${d.deadline} where id=${m.id}`;
    await audit(
      a,
      m,
      "Pendaftaran dibuka",
      `Tenggat ${d.deadline}; ${d.swimmers.length} peserta memenuhi syarat`,
    );
    return { ok: true };
  });
}
async function validateDeadline(a: Actor, m: MeetRow, deadline: string) {
  const rows = await a.sql<{ valid: boolean }>`select ${deadline}::timestamptz > clock_timestamp()
    and (${deadline}::timestamptz at time zone 'Asia/Jakarta')::date <= coalesce(end_date,start_date) as valid from meets where id=${m.id}`;
  if (!rows[0]?.valid)
    throw new Error("Tenggat harus di masa depan dan paling lambat hari terakhir kejuaraan");
}

export async function proposeEntry(actor: Actor, input: z.input<typeof proposeEntrySchema>) {
  const d = proposeEntrySchema.parse(input);
  return mutate(actor, d, async (a, m) => {
    editable(m);
    const hats = await hatsFor(a);
    const guardian = hats.guardianSwimmerIds.includes(d.swimmerId);
    if (!hats.staff && !guardian) throw new Error("Tidak diizinkan");
    const c = await candidate(a, m, d.swimmerId);
    await eventAllowed(a, m, d.stroke, d.distanceM);
    if (!hats.staff && c.response !== "yes")
      throw new Error("Konfirmasikan bersedia ikut sebelum mengajukan nomor");
    if (hats.staff && (c.response === "no" || c.response === "withdrawn"))
      throw new Error("Wali perlu mengonfirmasi ikut kembali");
    const duplicate = await a.sql<{
      id: number;
    }>`select id from meet_entries where meet_id=${m.id} and swimmer_id=${d.swimmerId}
      and stroke=${d.stroke} and distance_m=${d.distanceM} and id <> ${d.entryId ?? 0}`;
    if (duplicate.length) throw new Error("Nomor ini sudah ada. Koreksi nomor yang tersedia.");
    const ageGroup = ageGroupForDob(c.date_of_birth, Number(m.start_date.slice(0, 4))).id;
    // Staff proposals always need a fresh guardian response for that event, even in a dual-role account.
    const state = hats.staff ? "proposed" : "requested";
    let id: number;
    if (d.entryId) {
      const rows = await a.sql<{
        registration_status: RegistrationStatus;
      }>`select registration_status from meet_entries
        where id=${d.entryId} and meet_id=${m.id} and swimmer_id=${d.swimmerId} and club_id=${m.club_id}`;
      if (!rows[0]) throw new Error("Nomor tidak ditemukan");
      if (["submitted", "confirmed"].includes(rows[0].registration_status))
        throw new Error("Pelatih perlu membuka kembali daftar untuk koreksi");
      await a.sql`update meet_entries set stroke=${d.stroke},distance_m=${d.distanceM},seed_time_ms=${d.seedTimeMs ?? null},
        age_group=${ageGroup},registration_status=${state},registration_reason=null where id=${d.entryId}`;
      id = d.entryId;
    } else {
      const rows = await a.sql<{ id: number }>`insert into meet_entries
        (club_id,meet_id,swimmer_id,stroke,distance_m,age_group,seed_time_ms,status,registration_status)
        values (${m.club_id},${m.id},${d.swimmerId},${d.stroke},${d.distanceM},${ageGroup},${d.seedTimeMs ?? null},'terdaftar',${state}) returning id`;
      id = rows[0]!.id;
    }
    if (hats.staff)
      await a.sql`update meet_eligibility set response='pending',reason=null where meet_id=${m.id} and swimmer_id=${d.swimmerId}`;
    await audit(
      a,
      m,
      d.entryId ? "Nomor dikoreksi; persetujuan perlu diperbarui" : "Nomor diusulkan",
      `${d.distanceM} m ${d.stroke}; seed ${formatTime(d.seedTimeMs ?? null)}`,
      d.swimmerId,
      id,
    );
    return { id };
  });
}

export async function respondRegistration(
  actor: Actor,
  input: z.input<typeof respondRegistrationSchema>,
) {
  const d = respondRegistrationSchema.parse(input);
  return mutate(actor, d, async (a, m) => {
    editable(m);
    const hats = await hatsFor(a);
    if (!hats.guardianSwimmerIds.includes(d.swimmerId))
      throw new Error("Hanya wali perenang ini yang dapat merespons");
    await candidate(a, m, d.swimmerId);
    const note = d.response === "yes" ? null : reason(d.reason);
    await a.sql`update meet_eligibility set response=${d.response},reason=${note} where meet_id=${m.id} and swimmer_id=${d.swimmerId}`;
    if (d.response === "yes") {
      await a.sql`update meet_entries set registration_status='requested',registration_reason=null where meet_id=${m.id} and swimmer_id=${d.swimmerId}
        and registration_status in ('proposed','declined')`;
    } else {
      await a.sql`update meet_entries set registration_status=${d.response === "no" ? "declined" : "withdrawn"},registration_reason=${note}
        where meet_id=${m.id} and swimmer_id=${d.swimmerId} and registration_status <> 'legacy'`;
    }
    await audit(
      a,
      m,
      d.response === "yes"
        ? "Wali bersedia ikut"
        : d.response === "no"
          ? "Wali tidak ikut"
          : "Wali mengundurkan diri",
      note,
      d.swimmerId,
    );
    return { ok: true };
  });
}

export async function decideEntry(actor: Actor, input: z.input<typeof decideEntrySchema>) {
  const d = decideEntrySchema.parse(input);
  return mutate(actor, d, async (a, m) => {
    const rows = await a.sql<{
      swimmer_id: number;
      stroke: string;
      distance_m: number;
      registration_status: RegistrationStatus;
    }>`
      select swimmer_id,stroke,distance_m,registration_status from meet_entries where id=${d.entryId} and meet_id=${m.id} and club_id=${m.club_id}`;
    const e = rows[0];
    if (!e) throw new Error("Nomor tidak ditemukan");
    const hats = await hatsFor(a);
    if (d.action === "withdraw") {
      editable(m);
      if (!hats.staff && !hats.guardianSwimmerIds.includes(e.swimmer_id))
        throw new Error("Tidak diizinkan");
    } else {
      await staffFor(a);
      // Coaches may finish reviewing received requests after the family deadline, until locking.
      if (["approve", "reject"].includes(d.action) && m.registration_state !== "open")
        throw new Error("Buka kembali daftar sebelum mengambil keputusan");
      if (["submit", "confirm"].includes(d.action) && m.registration_state !== "locked")
        throw new Error("Kunci daftar sebelum mencatat pengajuan panitia");
    }
    const c = await candidate(a, m, e.swimmer_id);
    await eventAllowed(a, m, e.stroke, e.distance_m);
    const allowed: Record<typeof d.action, RegistrationStatus[]> = {
      approve: ["requested"],
      reject: ["requested"],
      withdraw: ["proposed", "requested", "approved", "rejected", "declined", "legacy"],
      submit: ["approved"],
      confirm: ["submitted"],
    };
    if (!allowed[d.action].includes(e.registration_status))
      throw new Error("Status nomor berubah atau tindakan tidak berlaku");
    if (["approve", "submit", "confirm"].includes(d.action) && c.response !== "yes")
      throw new Error("Wali belum menyetujui partisipasi");
    const states: Record<typeof d.action, RegistrationStatus> = {
      approve: "approved",
      reject: "rejected",
      withdraw: "withdrawn",
      submit: "submitted",
      confirm: "confirmed",
    };
    const note = d.action === "approve" ? (d.note ?? null) : reason(d.note);
    const ageGroup = ageGroupForDob(c.date_of_birth, Number(m.start_date.slice(0, 4))).id;
    await a.sql`update meet_entries set registration_status=${states[d.action]},registration_reason=${note},age_group=${ageGroup} where id=${d.entryId}`;
    const labels = {
      approve: "Pelatih menyetujui",
      reject: "Pelatih menolak",
      withdraw: "Nomor ditarik",
      submit: "Pengajuan panitia dicatat",
      confirm: "Konfirmasi panitia dicatat",
    };
    await audit(a, m, labels[d.action], note, e.swimmer_id, d.entryId);
    return { ok: true };
  });
}

export async function lockRegistration(
  actor: Actor,
  input: z.input<typeof lockRegistrationSchema>,
) {
  const d = lockRegistrationSchema.parse(input);
  return mutate(actor, d, async (a, m) => {
    await staffFor(a);
    if (m.registration_state !== "open") throw new Error("Daftar tidak sedang terbuka");
    const pending =
      await a.sql`select 1 from meet_entries where meet_id=${m.id} and registration_status='requested' limit 1`;
    if (pending.length) throw new Error("Putuskan seluruh pengajuan wali sebelum mengunci daftar");
    const invalid =
      await a.sql`select 1 from meet_entries e join meet_eligibility c on c.meet_id=e.meet_id and c.swimmer_id=e.swimmer_id
      join swimmers s on s.id=e.swimmer_id where e.meet_id=${m.id} and e.registration_status='approved' and (c.response <> 'yes' or s.status <> 'aktif') limit 1`;
    if (invalid.length)
      throw new Error("Peserta yang disetujui belum memenuhi syarat atau menunggu wali");
    await a.sql`update meets set registration_state='locked' where id=${m.id}`;
    await audit(
      a,
      m,
      "Daftar dikunci",
      "Hanya nomor disetujui masuk ekspor; belum merespons tidak disertakan",
    );
    return { ok: true };
  });
}

export async function reopenRegistration(
  actor: Actor,
  input: z.input<typeof reopenRegistrationSchema>,
) {
  const d = reopenRegistrationSchema.parse(input);
  return mutate(actor, d, async (a, m) => {
    await staffFor(a);
    if (m.registration_state === "draft") throw new Error("Buka pendaftaran terlebih dahulu");
    await validateDeadline(a, m, d.deadline);
    // Every earlier export becomes obsolete; new staff approval and organizer evidence are required.
    await a.sql`update meet_entries set registration_status='requested',registration_reason=${d.reason}
      where meet_id=${m.id} and registration_status in ('approved','submitted','confirmed')`;
    await a.sql`update meets set registration_state='open',registration_deadline=${d.deadline} where id=${m.id}`;
    await audit(a, m, "Daftar dibuka kembali; ekspor sebelumnya kedaluwarsa", d.reason);
    return { ok: true };
  });
}

export async function loadRegistration(actor: Actor, meetId: number): Promise<RegistrationView> {
  const m = await meetFor(actor, meetId);
  const hats = await hatsFor(actor);
  const candidates = await actor.sql<{
    swimmer_id: number;
    full_name: string;
    group_name: string;
    response: RegistrationView["candidates"][number]["response"];
    reason: string | null;
  }>`
    select c.*,s.full_name from meet_eligibility c join swimmers s on s.id=c.swimmer_id
    where c.meet_id=${m.id} and c.club_id=${m.club_id} and s.club_id=${m.club_id} order by s.full_name`;
  const events = await actor.sql<{
    stroke: string;
    distance_m: number;
  }>`select stroke,distance_m from meet_event_choices where meet_id=${m.id} order by distance_m,stroke`;
  const history = await actor.sql<{
    id: number;
    swimmer_id: number | null;
    entry_id: number | null;
    revision: number;
    action: string;
    actor_name: string;
    note: string | null;
    created_at: Date;
  }>`
    select h.*,coalesce(u.name,'Anggota klub') as actor_name from meet_registration_history h left join "user" u on u.id=h.actor_id
    where h.meet_id=${m.id} and h.club_id=${m.club_id} order by h.id desc`;
  return {
    state: m.registration_state,
    deadline: m.registration_deadline?.toISOString() ?? null,
    revision: m.registration_revision,
    editable:
      m.registration_state === "open" &&
      m.before_deadline &&
      m.current_meet &&
      !["batal", "selesai"].includes(m.status),
    staff: !!hats.staff,
    candidates: candidates
      .filter((c) => canSeeSwimmer(hats, c.swimmer_id))
      .map((c) => ({
        swimmerId: c.swimmer_id,
        name: c.full_name,
        groupName: c.group_name,
        response: c.response,
        reason: c.reason,
        canRespond: hats.guardianSwimmerIds.includes(c.swimmer_id),
      })),
    events: events.map((e) => ({ stroke: e.stroke, distanceM: e.distance_m })),
    history: history
      .filter((h) => hats.staff || (h.swimmer_id !== null && canSeeSwimmer(hats, h.swimmer_id)))
      .map((h) => ({
        id: h.id,
        swimmerId: h.swimmer_id,
        entryId: h.entry_id,
        revision: h.revision,
        action: h.action,
        actorName: h.actor_name,
        note: h.note,
        at: h.created_at.toISOString(),
      })),
  };
}

function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
export async function exportRegistration(
  actor: Actor,
  input: z.input<typeof exportRegistrationSchema>,
) {
  const d = exportRegistrationSchema.parse(input);
  // Serialize export with mutations so its revision and rows describe the same roster.
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    await staffFor(a);
    const m = await meetFor(a, d.meetId, true);
    active(m);
    if (m.registration_state !== "locked" || m.registration_revision !== d.expectedRevision)
      throw new Error("Kunci daftar dan muat ulang sebelum ekspor");
    const rows = await sql<{
      full_name: string;
      group_name: string;
      club_name: string;
      stroke: string;
      distance_m: number;
      age_group: string;
      seed_time_ms: number | null;
      registration_status: string;
    }>`
      select s.full_name,c.group_name,cl.name as club_name,e.stroke,e.distance_m,e.age_group,e.seed_time_ms,e.registration_status
      from meet_entries e join swimmers s on s.id=e.swimmer_id and s.club_id=e.club_id
      join meet_eligibility c on c.meet_id=e.meet_id and c.swimmer_id=e.swimmer_id and c.club_id=e.club_id
      join clubs cl on cl.id=e.club_id where e.meet_id=${m.id} and e.club_id=${m.club_id}
      and e.registration_status in ('approved','submitted','confirmed') and c.response='yes' and s.status='aktif'
      order by s.full_name,e.distance_m,e.stroke`;
    const exportedAt = new Date().toISOString();
    const header = [
      "Kejuaraan",
      "Revisi",
      "Diekspor pada",
      "Klub",
      "Perenang",
      "Kelompok",
      "KU",
      "Gaya",
      "Jarak (m)",
      "Kolam (m)",
      "Seed",
      "Status pendaftaran",
    ];
    const csv = [
      header,
      ...rows.map((r) => [
        m.name,
        m.registration_revision,
        exportedAt,
        r.club_name,
        r.full_name,
        r.group_name,
        r.age_group,
        r.stroke,
        r.distance_m,
        m.course,
        formatTime(r.seed_time_ms),
        registrationLabels[r.registration_status as RegistrationStatus],
      ]),
    ]
      .map((r) => r.map(csvCell).join(","))
      .join("\r\n");
    await sql`insert into meet_registration_history (meet_id,club_id,revision,action,actor_id,note)
      values (${m.id},${m.club_id},${m.registration_revision},'CSV dibuat; belum berarti diajukan ke panitia',${a.userId},${exportedAt})`;
    return {
      csv,
      filename: `pendaftaran-${m.id}-r${m.registration_revision}-${exportedAt.replace(/[:.]/g, "-")}.csv`,
      revision: m.registration_revision,
      exportedAt,
    };
  });
}
