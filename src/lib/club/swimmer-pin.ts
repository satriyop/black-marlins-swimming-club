import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Hats } from "./hats";
import { hatsFor } from "./hats";
import type { Actor } from "./actor";
import { requireClubId } from "./membership";

const scryptAsync = promisify(scrypt);
const KEY_LEN = 32;

export function canManageSwimmerPin(hats: Hats, swimmerId: number, hasGuardian: boolean): boolean {
  if (hats.guardianSwimmerIds.includes(swimmerId)) return true;
  if ((hats.staff === "superadmin" || hats.staff === "club_admin") && !hasGuardian) return true;
  return false;
}

export function assertPinShape(pin: string): void {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN harus 4 angka.");
}

export async function hashPin(pin: string): Promise<string> {
  assertPinShape(pin);
  const salt = randomBytes(16);
  const hash = (await scryptAsync(pin, salt, KEY_LEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = (await scryptAsync(pin, Buffer.from(saltHex, "hex"), KEY_LEN)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

export type SwimmerPinStatus = {
  canManage: boolean;
  hasPin: boolean;
};

export async function swimmerPinStatus(actor: Actor, swimmerId: number): Promise<SwimmerPinStatus> {
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  const guardians = await actor.sql<{ n: number }>`
    select count(*)::int as n from guardians where swimmer_id = ${swimmerId}
  `;
  const creds = await actor.sql<{ n: number }>`
    select count(*)::int as n from swimmer_credentials
    where swimmer_id = ${swimmerId} and club_id = ${clubId}
  `;
  return {
    canManage: canManageSwimmerPin(hats, swimmerId, (guardians[0]?.n ?? 0) > 0),
    hasPin: (creds[0]?.n ?? 0) > 0,
  };
}

export async function setSwimmerPin(actor: Actor, input: { swimmerId: number; pin: string }): Promise<void> {
  assertPinShape(input.pin);
  const clubId = await requireClubId(actor);
  const hats = await hatsFor(actor);
  const swimmers = await actor.sql<{ id: number }>`
    select id from swimmers where id = ${input.swimmerId} and club_id = ${clubId} limit 1
  `;
  if (!swimmers[0]) throw new Error("Perenang tidak ditemukan");
  const guardians = await actor.sql<{ n: number }>`
    select count(*)::int as n from guardians where swimmer_id = ${input.swimmerId}
  `;
  if (!canManageSwimmerPin(hats, input.swimmerId, (guardians[0]?.n ?? 0) > 0)) {
    throw new Error("Tidak diizinkan");
  }
  const pinHash = await hashPin(input.pin);
  await actor.sql.transaction(async (sql) => {
    const existing = await sql<{ swimmer_id: number }>`
      select swimmer_id from swimmer_credentials where swimmer_id = ${input.swimmerId} limit 1
    `;
    const action = existing[0] ? "reset" : "set";
    await sql`
      insert into swimmer_credentials (swimmer_id, club_id, pin_hash, failed_attempts, locked_until, updated_at, updated_by)
      values (${input.swimmerId}, ${clubId}, ${pinHash}, 0, null, now(), ${actor.userId})
      on conflict (swimmer_id) do update set
        pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now(),
        updated_by = excluded.updated_by
    `;
    await sql`
      insert into swimmer_credential_events (club_id, swimmer_id, actor_id, action)
      values (${clubId}, ${input.swimmerId}, ${actor.userId}, ${action})
    `;
  });
}
