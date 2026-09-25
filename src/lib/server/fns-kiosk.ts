import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { soleClubId } from "@/lib/club/membership";
import { resolveRequestClub } from "@/lib/club/request-club.server";
import { checkInKiosk, kioskGreeting, kioskHome, lookupKioskSwimmers, unlockKiosk } from "@/lib/club/swimmer-kiosk";

async function clubId(sql: Sql): Promise<number> {
  const fromHost = await resolveRequestClub(sql);
  if (fromHost != null) return fromHost;
  const id = await soleClubId(sql);
  if (id == null) throw new Error("Klub belum siap.");
  return id;
}

export const lookupKiosk = createServerFn({ method: "POST" })
  .validator((input: { ddmm: string }) => {
    if (!input || typeof input.ddmm !== "string") throw new Error("Tanggal lahir harus 4 angka, tanggal lalu bulan.");
    return input;
  })
  .handler(async ({ data }) => {
    const sql = await getSql();
    return lookupKioskSwimmers(sql, await clubId(sql), data.ddmm);
  });

export const unlockKioskSession = createServerFn({ method: "POST" })
  .validator((input: { swimmerId: number; pin: string }) => {
    if (!input || !Number.isInteger(input.swimmerId) || typeof input.pin !== "string") {
      throw new Error("PIN harus 4 angka.");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const sql = await getSql();
    return unlockKiosk(sql, await clubId(sql), data.swimmerId, data.pin);
  });

export const readKioskGreeting = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => kioskGreeting(await getSql(), data.token));

export const readKioskHome = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => {
    if (!input || typeof input.token !== "string") throw new Error("Sesi tablet habis. Masuk lagi.");
    return input;
  })
  .handler(async ({ data }) => kioskHome(await getSql(), data.token));

export const checkInKioskSession = createServerFn({ method: "POST" })
  .validator((input: { token: string; seriesId: number }) => {
    if (!input || typeof input.token !== "string" || !Number.isInteger(input.seriesId)) {
      throw new Error("Bukan latihan hari ini.");
    }
    return input;
  })
  .handler(async ({ data }) => checkInKiosk(await getSql(), data.token, data.seriesId));
