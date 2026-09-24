import { expect, test } from "vitest";
import { createClubHarness } from "./harness";
import { seedClub } from "../src/lib/club/seed";
import { setSwimmerPin } from "../src/lib/club/swimmer-pin";
import { kioskGreeting, lookupKioskSwimmers, unlockKiosk } from "../src/lib/club/swimmer-kiosk";

process.env.BETTER_AUTH_SECRET ??= "kiosk-test-secret";

async function idOf(sql: Awaited<ReturnType<typeof createClubHarness>>["sql"], name: string) {
  const rows = await sql<{ id: number }>`select id from swimmers where full_name = ${name} limit 1`;
  return rows[0]!.id;
}

test("same birthday returns both nicknames, and the other child's pin does not open Ken", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const ken = await idOf(h.sql, "Perenang Satu");
  await h.sql`update swimmers set nickname = 'Ken' where id = ${ken}`;
  const twin = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, nickname, date_of_birth, gender, status)
    values (${clubId}, 'Bukan Ken', 'Luigi', '2012-05-15', 'putra', 'aktif')
    returning id
  `;
  await setSwimmerPin(h.actor("usr_satriyo"), { swimmerId: ken, pin: "1357" });
  await setSwimmerPin(h.actor("usr_satriyo"), { swimmerId: twin[0]!.id, pin: "2468" });
  const matches = await lookupKioskSwimmers(h.sql, clubId, "1505");
  expect(matches.map((match) => match.label).sort()).toEqual(["Ken", "Luigi"]);
  await expect(unlockKiosk(h.sql, clubId, ken, "2468")).rejects.toThrow(/PIN salah/);
  const session = await unlockKiosk(h.sql, clubId, ken, "1357");
  expect((await kioskGreeting(h.sql, session.token)).fullName).toBe("Perenang Satu");
  await setSwimmerPin(h.actor("usr_satriyo"), { swimmerId: ken, pin: "7777" });
  await expect(kioskGreeting(h.sql, session.token)).rejects.toThrow(/habis/);
});

test("five wrong pins lock the locker even if the next pin is right", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const id = await idOf(h.sql, "Perenang Dua");
  await setSwimmerPin(h.actor("usr_satriyo"), { swimmerId: id, pin: "9090" });
  for (let i = 0; i < 4; i += 1) {
    await expect(unlockKiosk(h.sql, clubId, id, "0000")).rejects.toThrow(/PIN salah/);
  }
  await expect(unlockKiosk(h.sql, clubId, id, "0000")).rejects.toThrow(/terkunci/);
  await expect(unlockKiosk(h.sql, clubId, id, "9090")).rejects.toThrow(/terkunci/);
  await h.sql`update swimmer_credentials set locked_until = now() - interval '1 minute' where swimmer_id = ${id}`;
  await expect(unlockKiosk(h.sql, clubId, id, "0000")).rejects.toThrow(/PIN salah/);
  const attempts = await h.sql<{ failed_attempts: number }>`
    select failed_attempts from swimmer_credentials where swimmer_id = ${id}
  `;
  expect(Number(attempts[0]?.failed_attempts)).toBe(1);
});

test("a swimmer with no pin cannot enter the tablet", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const id = await idOf(h.sql, "Perenang Tiga");
  const matches = await lookupKioskSwimmers(h.sql, clubId, "1009");
  expect(matches.some((match) => match.id === id)).toBe(true);
  await expect(unlockKiosk(h.sql, clubId, id, "1234")).rejects.toThrow(/belum diatur/);
});
