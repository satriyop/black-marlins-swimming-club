import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sql } from "@/lib/db";
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

export function signKioskToken(clubId: number, swimmerId: number, exp: number): string {
  const body = `${clubId}.${swimmerId}.${exp}`;
  const sig = createHmac("sha256", kioskSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function readKioskToken(token: string): { clubId: number; swimmerId: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [clubIdRaw, swimmerIdRaw, expRaw, sig] = parts;
  const clubId = Number(clubIdRaw);
  const swimmerId = Number(swimmerIdRaw);
  const exp = Number(expRaw);
  if (!Number.isInteger(clubId) || !Number.isInteger(swimmerId) || !Number.isFinite(exp)) return null;
  if (exp < Date.now()) return null;
  const expected = createHmac("sha256", kioskSecret()).update(`${clubId}.${swimmerId}.${exp}`).digest("hex");
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { clubId, swimmerId };
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
    }>`
      select s.full_name, c.pin_hash, c.failed_attempts, c.locked_until
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
    const exp = Date.now() + SESSION_MS;
    return { token: signKioskToken(clubId, swimmerId, exp), fullName: row.full_name };
  });
  if ("error" in result) throw new Error(result.error);
  return result;
}

export async function kioskGreeting(sql: Sql, token: string): Promise<{ fullName: string }> {
  const parsed = readKioskToken(token);
  if (!parsed) throw new Error("Sesi tablet habis. Masuk lagi.");
  const rows = await sql<{ full_name: string }>`
    select full_name from swimmers
    where id = ${parsed.swimmerId} and club_id = ${parsed.clubId} and status = 'aktif'
    limit 1
  `;
  if (!rows[0]) throw new Error("Sesi tablet habis. Masuk lagi.");
  return { fullName: rows[0].full_name };
}
