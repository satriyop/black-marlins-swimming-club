import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sql } from "@/lib/db";
import { jakartaNowParts } from "@/lib/utils";
import { ageGroupForDob } from "@/lib/swim/age";
import { formatTime } from "@/lib/swim/time";
import { strokeShort } from "@/lib/swim/constants";
import { isoWeekday } from "./series";
import { verifyPin } from "./swimmer-pin";

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const SESSION_MS = 8 * 60 * 60 * 1000;

export type KioskMatch = { id: number; label: string };

function kioskSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Masuk tablet belum siap.");
  return secret;
}

export function signKioskToken(clubId: number, swimmerId: number, exp: number, issuedAt: number): string {
  const body = `${clubId}.${swimmerId}.${exp}.${issuedAt}`;
  const sig = createHmac("sha256", kioskSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function readKioskToken(token: string): { clubId: number; swimmerId: number; issuedAt: number } | null {
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [clubIdRaw, swimmerIdRaw, expRaw, issuedRaw, sig] = parts;
  const clubId = Number(clubIdRaw);
  const swimmerId = Number(swimmerIdRaw);
  const exp = Number(expRaw);
  const issuedAt = Number(issuedRaw);
  if (!Number.isInteger(clubId) || !Number.isInteger(swimmerId) || !Number.isFinite(exp) || !Number.isFinite(issuedAt)) {
    return null;
  }
  if (exp < Date.now()) return null;
  const expected = createHmac("sha256", kioskSecret()).update(`${clubId}.${swimmerId}.${exp}.${issuedAt}`).digest("hex");
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { clubId, swimmerId, issuedAt };
}

function labelOf(row: { nickname: string | null; full_name: string }): string {
  const nick = row.nickname?.trim();
  return nick || row.full_name;
}

export async function lookupKioskSwimmers(sql: Sql, clubId: number, ddmm: string): Promise<KioskMatch[]> {
  if (typeof ddmm !== "string" || !/^\d{4}$/.test(ddmm)) {
    throw new Error("Tanggal lahir harus 4 angka, tanggal lalu bulan.");
  }
  const rows = await sql<{ id: number; full_name: string; nickname: string | null }>`
    select id, full_name, nickname
    from swimmers
    where club_id = ${clubId}
      and status = 'aktif'
      and lpad(extract(day from date_of_birth)::int::text, 2, '0')
        || lpad(extract(month from date_of_birth)::int::text, 2, '0') = ${ddmm}
    order by full_name
  `;
  return rows.map((row) => ({ id: row.id, label: labelOf(row) }));
}

export async function unlockKiosk(
  sql: Sql,
  clubId: number,
  swimmerId: number,
  pin: string,
): Promise<{ token: string; fullName: string }> {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) throw new Error("PIN harus 4 angka.");
  const result = await sql.transaction(async (tx) => {
    const rows = await tx<{
      full_name: string;
      pin_hash: string | null;
      failed_attempts: number | null;
      locked_until: string | null;
      updated_at: string | null;
    }>`
      select s.full_name, c.pin_hash, c.failed_attempts, c.locked_until, c.updated_at
      from swimmers s
      left join swimmer_credentials c on c.swimmer_id = s.id and c.club_id = s.club_id
      where s.id = ${swimmerId} and s.club_id = ${clubId} and s.status = 'aktif'
      for update of s
    `;
    const row = rows[0];
    if (!row?.pin_hash) return { error: "PIN belum diatur. Minta wali." };
    const lockUntil = row.locked_until ? new Date(row.locked_until).getTime() : 0;
    if (lockUntil > Date.now()) {
      return { error: "PIN terkunci. Coba lagi beberapa menit, atau minta wali mengatur ulang." };
    }
    const ok = await verifyPin(pin, row.pin_hash);
    if (!ok) {
      const prior = lockUntil > 0 ? 0 : Number(row.failed_attempts ?? 0);
      const fails = prior + 1;
      const locked = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS).toISOString() : null;
      await tx`
        update swimmer_credentials
        set failed_attempts = ${fails}, locked_until = ${locked}
        where swimmer_id = ${swimmerId} and club_id = ${clubId}
      `;
      return {
        error: locked
          ? "PIN terkunci. Coba lagi beberapa menit, atau minta wali mengatur ulang."
          : "PIN salah.",
      };
    }
    await tx`
      update swimmer_credentials
      set failed_attempts = 0, locked_until = null
      where swimmer_id = ${swimmerId} and club_id = ${clubId}
    `;
    const now = Date.now();
    const credentialAt = row.updated_at ? new Date(row.updated_at).getTime() : now;
    const exp = now + SESSION_MS;
    return {
      token: signKioskToken(clubId, swimmerId, exp, Math.max(now, credentialAt)),
      fullName: row.full_name,
    };
  });
  if ("error" in result) throw new Error(result.error);
  return result;
}

export async function kioskGreeting(sql: Sql, token: string): Promise<{ fullName: string }> {
  const parsed = readKioskToken(token);
  if (!parsed) throw new Error("Sesi tablet habis. Masuk lagi.");
  const rows = await sql<{ full_name: string; updated_at: string | null }>`
    select s.full_name, c.updated_at
    from swimmers s
    left join swimmer_credentials c on c.swimmer_id = s.id and c.club_id = s.club_id
    where s.id = ${parsed.swimmerId} and s.club_id = ${parsed.clubId} and s.status = 'aktif'
    limit 1
  `;
  const row = rows[0];
  if (!row?.updated_at || new Date(row.updated_at).getTime() > parsed.issuedAt) {
    throw new Error("Sesi tablet habis. Masuk lagi.");
  }
  return { fullName: row.full_name };
}

export type KioskHome = {
  fullName: string;
  ageGroup: string;
  today: { seriesId: number; title: string; startTime: string | null; location: string | null; checkedIn: boolean }[];
  upcoming: { date: string; title: string; startTime: string | null; location: string | null }[];
  pbs: { label: string; time: string }[];
};

export async function kioskHome(sql: Sql, token: string): Promise<KioskHome> {
  const parsed = readKioskToken(token);
  if (!parsed) throw new Error("Sesi tablet habis. Masuk lagi.");
  const swimmer = await sql<{ full_name: string; date_of_birth: string; updated_at: string | null }>`
    select s.full_name, s.date_of_birth::text as date_of_birth, c.updated_at
    from swimmers s
    left join swimmer_credentials c on c.swimmer_id = s.id and c.club_id = s.club_id
    where s.id = ${parsed.swimmerId} and s.club_id = ${parsed.clubId} and s.status = 'aktif'
    limit 1
  `;
  const who = swimmer[0];
  if (!who?.updated_at || new Date(who.updated_at).getTime() > parsed.issuedAt) {
    throw new Error("Sesi tablet habis. Masuk lagi.");
  }
  const today = jakartaNowParts().date;
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const toDate = end.toISOString().slice(0, 10);
  const schedules = await sql<{
    id: number;
    title: string;
    weekday: number;
    start_time: string | null;
    location: string | null;
    start_date: string;
    until_date: string | null;
  }>`
    select id, title, weekday, start_time::text as start_time, location,
           start_date::text as start_date, until_date::text as until_date
    from practice_series
    where club_id = ${parsed.clubId} and active = true and start_date <= ${toDate}::date
      and (until_date is null or until_date >= ${today}::date)
  `;
  const skips = await sql<{ series_id: number; skip_date: string }>`
    select series_id, skip_date::text as skip_date from practice_series_skips
    where skip_date between ${today}::date and ${toDate}::date
  `;
  const skipped = new Set(skips.map((row) => `${row.series_id}:${row.skip_date.slice(0, 10)}`));
  const opened = await sql<{ series_id: number | null; occurrence_date: string; status: string }>`
    select series_id, occurrence_date::text as occurrence_date, status
    from practices
    where club_id = ${parsed.clubId} and series_id is not null
      and occurrence_date between ${today}::date and ${toDate}::date
  `;
  const openedStatus = new Map(
    opened.map((row) => [`${row.series_id}:${row.occurrence_date.slice(0, 10)}`, row.status]),
  );
  const days: { seriesId: number; date: string; title: string; startTime: string | null; location: string | null }[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.toISOString().slice(0, 10);
    for (const schedule of schedules) {
      if (day < schedule.start_date.slice(0, 10)) continue;
      if (schedule.until_date && day > schedule.until_date.slice(0, 10)) continue;
      if (isoWeekday(day) !== Number(schedule.weekday)) continue;
      if (skipped.has(`${schedule.id}:${day}`)) continue;
      if (openedStatus.get(`${schedule.id}:${day}`) === "cancelled") continue;
      days.push({
        seriesId: schedule.id,
        date: day,
        title: schedule.title,
        startTime: schedule.start_time?.slice(0, 5) ?? null,
        location: schedule.location,
      });
    }
  }
  days.sort((a, b) => `${a.date}T${a.startTime ?? ""}`.localeCompare(`${b.date}T${b.startTime ?? ""}`));
  const checkins = await sql<{ series_id: number }>`
    select series_id from swimmer_checkins
    where club_id = ${parsed.clubId} and swimmer_id = ${parsed.swimmerId} and session_date = ${today}::date
  `;
  const checked = new Set(checkins.map((row) => row.series_id));
  const pbs = await sql<{ stroke: string; distance_m: number; time_ms: number }>`
    select stroke, distance_m, time_ms from results
    where club_id = ${parsed.clubId} and swimmer_id = ${parsed.swimmerId}
      and is_pb = true and time_ms is not null
    order by stroke, distance_m
  `;
  return {
    fullName: who.full_name,
    ageGroup: ageGroupForDob(who.date_of_birth.slice(0, 10)).label,
    today: days
      .filter((day) => day.date === today)
      .map(({ seriesId, title, startTime, location }) => ({
        seriesId,
        title,
        startTime,
        location,
        checkedIn: checked.has(seriesId),
      })),
    upcoming: days.filter((day) => day.date !== today).map(({ date, title, startTime, location }) => ({
      date,
      title,
      startTime,
      location,
    })),
    pbs: pbs.map((row) => ({
      label: `${row.distance_m} ${strokeShort(row.stroke)}`,
      time: formatTime(Number(row.time_ms)),
    })),
  };
}

export async function checkInKiosk(sql: Sql, token: string, seriesId: number): Promise<{ checkedIn: true }> {
  if (!Number.isInteger(seriesId)) throw new Error("Bukan latihan hari ini.");
  const parsed = readKioskToken(token);
  if (!parsed) throw new Error("Sesi tablet habis. Masuk lagi.");
  const home = await kioskHome(sql, token);
  if (!home.today.some((item) => item.seriesId === seriesId)) {
    throw new Error("Bukan latihan hari ini.");
  }
  await sql`
    insert into swimmer_checkins (club_id, swimmer_id, series_id, session_date)
    values (${parsed.clubId}, ${parsed.swimmerId}, ${seriesId}, ${jakartaNowParts().date}::date)
    on conflict (swimmer_id, series_id, session_date) do nothing
  `;
  return { checkedIn: true };
}
