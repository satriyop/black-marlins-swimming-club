import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { kioskGreeting, lookupKioskSwimmers, unlockKiosk } from "@/lib/club/swimmer-kiosk";

async function clubId(sql: Sql): Promise<number> {
  const rows = await sql<{ id: number }>`select id from clubs order by id limit 1`;
  if (!rows[0]) throw new Error("Klub belum siap.");
  return rows[0].id;
}

export const lookupKiosk = createServerFn({ method: "POST" })
  .validator((input: { ddmm: string }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    return lookupKioskSwimmers(sql, await clubId(sql), data.ddmm);
  });

export const unlockKioskSession = createServerFn({ method: "POST" })
  .validator((input: { swimmerId: number; pin: string }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    return unlockKiosk(sql, await clubId(sql), data.swimmerId, data.pin);
  });

export const readKioskGreeting = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => kioskGreeting(await getSql(), data.token));
