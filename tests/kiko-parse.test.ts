import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { applyMedalPlaces, parseEvents, parseMedals, parseTimeToMs, syncEventDates } from "../scripts/kiko-parse.mjs";
import { seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";
import { importKikoResults } from "../scripts/import-kiko-results.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("syncs placeholder event dates to medal and real meet days", () => {
  const events = parseEvents(readFileSync(join(root, "data/kiko/renang_events.csv"), "utf8"));
  const medals = parseMedals(readFileSync(join(root, "data/kiko/renang_medal.csv"), "utf8"));
  const synced = syncEventDates(events, medals);
  const kras = synced.find((r) => r.meetCode === "KRAS2025" && r.fullName.startsWith("Luigi") && r.distanceM === 25 && r.stroke === "kupu");
  expect(kras?.date).toBe("2025-09-21");
  const jatidiriPb = synced.find(
    (r) => r.fullName.startsWith("Luigi") && r.distanceM === 50 && r.stroke === "bebas" && r.meetCode === "JATIDIRI2026",
  );
  expect(jatidiriPb?.date).toBe("2026-09-03");
  const kejurprov = synced.filter((r) => r.meetCode === "KEJURPROVJTG2026");
  expect(kejurprov.every((r) => r.date === "2026-04-10")).toBe(true);
  const danlanal = synced.filter((r) => r.meetCode === "DANLANALSMG2026");
  expect(danlanal.every((r) => r.date === "2026-02-14")).toBe(true);
  const kapolresBack = synced.find(
    (r) => r.fullName.startsWith("Luigi") && r.distanceM === 50 && r.stroke === "punggung" && r.meetCode === "KAPOLRESMGL2025",
  );
  expect(kapolresBack?.course).toBe("50");
  expect(kapolresBack?.timeMs).toBe(43770);
  const unknown = synced.filter((r) => r.meetCode === "KRAPPROVBYL2026");
  expect(unknown.every((r) => r.date === "2026-01-01")).toBe(true);
});

test("parses Luigi 50 free Popda bronze as 30530 ms official LCM", () => {
  const csv = readFileSync(join(root, "data/kiko/renang_events.csv"), "utf8");
  const medals = parseMedals(readFileSync(join(root, "data/kiko/renang_medal.csv"), "utf8"));
  const rows = applyMedalPlaces(parseEvents(csv), medals);
  const hit = rows.find(
    (r) => r.fullName.startsWith("Luigi") && r.distanceM === 50 && r.stroke === "bebas" && r.meetCode === "JATIDIRI2026",
  );
  expect(hit?.timeMs).toBe(parseTimeToMs("30.53"));
  expect(hit?.timeMs).toBe(30530);
  expect(hit?.course).toBe("50");
  expect(hit?.place).toBe(3);
});

test("import writes Ken, Luigi, and Kun official times into the club", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const query = async (text: string, params: unknown[] = []) => h.sql.query(text, params);
  const stats = await importKikoResults(query);
  expect(stats.inserted).toBeGreaterThan(50);
  const luigi = await h.sql<{ n: number }>`
    select count(*)::int as n
    from results r join swimmers s on s.id = r.swimmer_id
    where s.full_name like 'Luigi%' and r.time_ms = 30530 and r.kind = 'official'
  `;
  expect(luigi[0]?.n).toBeGreaterThan(0);
  const ken = await h.sql<{ n: number }>`
    select count(*)::int as n
    from results r join swimmers s on s.id = r.swimmer_id
    where s.full_name like 'Ken%' and r.kind = 'official'
  `;
  const kun = await h.sql<{ n: number }>`
    select count(*)::int as n
    from results r join swimmers s on s.id = r.swimmer_id
    where s.full_name like 'Kun%' and r.kind = 'official'
  `;
  expect(ken[0]?.n).toBeGreaterThan(0);
  expect(kun[0]?.n).toBeGreaterThan(0);
  const again = await importKikoResults(query);
  expect(again.inserted).toBe(0);
  const popda = await h.sql<{ name: string; start_date: string; end_date: string }>`
    select name, start_date::text as start_date, end_date::text as end_date
    from meets where notes = 'JATIDIRI2026' or name like 'Popda%'
  `;
  expect(popda[0]?.name).toBe("Popda Jateng 2026");
  expect(popda[0]?.start_date.slice(0, 10)).toBe("2026-09-02");
  const luigiBack = await h.sql<{ time_ms: number; result_date: string; course: string; meet: string }>`
    select r.time_ms, r.result_date::text as result_date, r.course, m.name as meet
    from results r
    join swimmers s on s.id = r.swimmer_id
    join meets m on m.id = r.meet_id
    where s.full_name like 'Luigi%' and r.stroke = 'punggung' and r.distance_m = 50 and r.course = '50'
    order by r.time_ms asc limit 1
  `;
  expect(luigiBack[0]?.time_ms).toBe(43770);
  expect(luigiBack[0]?.result_date.slice(0, 10)).toBe("2025-06-22");
  const kejurprov = await h.sql<{ start_date: string }>`
    select start_date::text as start_date from meets where notes = 'KEJURPROVJTG2026'
  `;
  expect(kejurprov[0]?.start_date.slice(0, 10)).toBe("2026-04-10");
});
