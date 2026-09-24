import { expect, test } from "vitest";
import { createClubHarness } from "./harness";
import { seedClub } from "../src/lib/club/seed";
import { setSwimmerPin } from "../src/lib/club/swimmer-pin";
import { checkInKiosk, kioskGreeting, kioskHome, lookupKioskSwimmers, pbShareText, unlockKiosk } from "../src/lib/club/swimmer-kiosk";
import { isoWeekday } from "../src/lib/club/series";
import { jakartaNowParts } from "../src/lib/utils";

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

test("the kid home shows this swimmer's session and personal best only", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const ken = await idOf(h.sql, "Perenang Satu");
  const other = await idOf(h.sql, "Perenang Dua");
  const today = jakartaNowParts().date;
  await h.sql`
    insert into practice_series (club_id, title, weekday, start_time, location, kind, start_date, active)
    values (${clubId}, 'Latihan Tablet', ${isoWeekday(today)}, '16:00', 'Umbul', 'renang', ${today}::date, true)
  `;
  await h.sql`
    insert into results (club_id, swimmer_id, result_date, stroke, distance_m, course, time_ms, status, kind, is_pb)
    values (${clubId}, ${ken}, ${today}::date, 'bebas', 50, '50', 32100, 'selesai', 'official', true)
  `;
  await h.sql`
    insert into results (club_id, swimmer_id, result_date, stroke, distance_m, course, time_ms, status, kind, is_pb)
    values (${clubId}, ${other}, ${today}::date, 'dada', 100, '50', 90000, 'selesai', 'official', true)
  `;
  await setSwimmerPin(h.actor("usr_satriyo"), { swimmerId: ken, pin: "1357" });
  const session = await unlockKiosk(h.sql, clubId, ken, "1357");
  const home = await kioskHome(h.sql, session.token);
  expect(home.fullName).toBe("Perenang Satu");
  expect(home.today.some((item) => item.title === "Latihan Tablet" && item.location === "Umbul")).toBe(true);
  expect(home.clubName.length).toBeGreaterThan(0);
  expect(home.pbs.map((item) => item.label)).toEqual(["50 Bebas"]);
  expect(pbShareText({ name: home.fullName, club: home.clubName, label: "50 Bebas", time: home.pbs[0]!.time })).toContain(
    "50 Bebas",
  );
  expect(pbShareText({ name: home.fullName, club: home.clubName, label: "50 Bebas", time: home.pbs[0]!.time })).not.toContain(
    "Dada",
  );
  expect(home.pbs.some((item) => item.label.includes("Dada"))).toBe(false);
  const before = await h.sql<{ n: number }>`
    select count(*)::int as n from practice_attendance where swimmer_id = ${ken}
  `;
  const todaySession = home.today.find((item) => item.title === "Latihan Tablet");
  expect(todaySession?.checkedIn).toBe(false);
  await checkInKiosk(h.sql, session.token, todaySession!.seriesId);
  await checkInKiosk(h.sql, session.token, todaySession!.seriesId);
  const again = await kioskHome(h.sql, session.token);
  expect(again.today.find((item) => item.seriesId === todaySession!.seriesId)?.checkedIn).toBe(true);
  const rows = await h.sql<{ n: number }>`select count(*)::int as n from swimmer_checkins where swimmer_id = ${ken}`;
  expect(rows[0]?.n).toBe(1);
  const attendance = await h.sql<{ n: number }>`
    select count(*)::int as n from practice_attendance where swimmer_id = ${ken}
  `;
  expect(attendance[0]?.n).toBe(before[0]?.n);
  const otherDay = isoWeekday(today) === 7 ? 1 : isoWeekday(today) + 1;
  const later = await h.sql<{ id: number }>`
    insert into practice_series (club_id, title, weekday, start_time, location, kind, start_date, active)
    values (${clubId}, 'Bukan Hari Ini', ${otherDay}, '16:00', 'Umbul', 'renang', ${today}::date, true)
    returning id
  `;
  await expect(checkInKiosk(h.sql, session.token, later[0]!.id)).rejects.toThrow(/hari ini/);
});

test("a swimmer with no pin cannot enter the tablet", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const id = await idOf(h.sql, "Perenang Tiga");
  const matches = await lookupKioskSwimmers(h.sql, clubId, "1009");
  expect(matches.some((match) => match.id === id)).toBe(true);
  await expect(unlockKiosk(h.sql, clubId, id, "1234")).rejects.toThrow(/belum diatur/);
});
