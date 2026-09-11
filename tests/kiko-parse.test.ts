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
  const danlanal = synced.filter((r) => r.meetCode === "DANLANALSMG2026");
  expect(danlanal.every((r) => r.date === "2026-02-14")).toBe(true);
  const kapolresBack = synced.find(
    (r) => r.fullName.startsWith("Luigi") && r.distanceM === 50 && r.stroke === "punggung" && r.meetCode === "KAPOLRESMGL2025",
  );
  expect(kapolresBack?.course).toBe("50");
  expect(kapolresBack?.timeMs).toBe(43770);
  const boyolali = synced.find(
    (r) => r.fullName.startsWith("Luigi") && r.meetCode === "BOYOLALI2025" && r.distanceM === 50 && r.stroke === "bebas",
  );
  expect(boyolali?.date).toBe("2025-08-24");
  const krapFly = synced.find(
    (r) => r.fullName.startsWith("Luigi") && r.meetCode === "KRAPPROVBYL2026" && r.stroke === "kupu" && r.distanceM === 50,
  );
  const krapFree = synced.find(
    (r) => r.fullName.startsWith("Luigi") && r.meetCode === "KRAPPROVBYL2026" && r.stroke === "bebas" && r.distanceM === 50,
  );
  expect(krapFly?.date).toBe("2026-07-04");
  expect(krapFree?.date).toBe("2026-07-05");
  const smgBack = synced.find(
    (r) => r.fullName.startsWith("Luigi") && r.meetCode === "SMGOPEN2025" && r.stroke === "punggung" && r.distanceM === 50,
  );
  expect(smgBack?.date).toBe("2025-10-05");
  const o2snFly = synced.find((r) => r.meetCode === "O2SNJATENG2026" && r.stroke === "kupu");
  const o2snFree = synced.find((r) => r.meetCode === "O2SNJATENG2026" && r.stroke === "bebas");
  expect(o2snFly?.date).toBe("2026-07-01");
  expect(o2snFree?.date).toBe("2026-07-02");
  const kejur400 = synced.find(
    (r) => r.fullName.startsWith("Luigi") && r.meetCode === "KEJURPROVJTG2026" && r.distanceM === 400,
  );
  expect(kejur400?.date).toBe("2026-04-12");
  const kunBoyolaliFree = synced.find(
    (r) => r.fullName.startsWith("Kun") && r.meetCode === "BOYOLALI2025" && r.distanceM === 50 && r.stroke === "bebas",
  );
  expect(kunBoyolaliFree?.date).toBe("2025-08-24");
  expect(kunBoyolaliFree?.timeMs).toBe(36780);
  const kunBoyolaliFly = synced.find(
    (r) => r.fullName.startsWith("Kun") && r.meetCode === "BOYOLALI2025" && r.stroke === "kupu" && r.distanceM === 50,
  );
  expect(kunBoyolaliFly?.date).toBe("2025-08-24");
  expect(kunBoyolaliFly?.timeMs).toBe(40920);
  const kunSmgBack = synced.find(
    (r) => r.fullName.startsWith("Kun") && r.meetCode === "SMGOPEN2025" && r.stroke === "punggung" && r.distanceM === 50,
  );
  expect(kunSmgBack?.date).toBe("2025-10-05");
  const kunKrapFree = synced.find(
    (r) => r.fullName.startsWith("Kun") && r.meetCode === "KRAPPROVBYL2026" && r.stroke === "bebas" && r.distanceM === 50,
  );
  const kunKrapBack = synced.find(
    (r) => r.fullName.startsWith("Kun") && r.meetCode === "KRAPPROVBYL2026" && r.stroke === "punggung" && r.distanceM === 50,
  );
  expect(kunKrapBack?.date).toBe("2026-07-04");
  expect(kunKrapFree?.date).toBe("2026-07-05");
  const kunKejur100Back = synced.find(
    (r) => r.fullName.startsWith("Kun") && r.meetCode === "KEJURPROVJTG2026" && r.stroke === "punggung" && r.distanceM === 100,
  );
  expect(kunKejur100Back?.date).toBe("2026-04-12");
  const kenBoyolaliFree = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "BOYOLALI2025" && r.distanceM === 50 && r.stroke === "bebas",
  );
  const kenBoyolaliBack = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "BOYOLALI2025" && r.distanceM === 50 && r.stroke === "punggung",
  );
  const kenBoyolali100Breast = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "BOYOLALI2025" && r.distanceM === 100 && r.stroke === "dada",
  );
  expect(kenBoyolaliFree?.date).toBe("2025-08-24");
  expect(kenBoyolaliBack?.date).toBe("2025-08-23");
  expect(kenBoyolali100Breast?.date).toBe("2025-08-24");
  const kenSmgBack = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "SMGOPEN2025" && r.stroke === "punggung" && r.distanceM === 50,
  );
  const kenSmgFly = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "SMGOPEN2025" && r.stroke === "kupu" && r.distanceM === 50,
  );
  const kenSmg100Free = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "SMGOPEN2025" && r.stroke === "bebas" && r.distanceM === 100,
  );
  expect(kenSmgBack?.date).toBe("2025-10-03");
  expect(kenSmgBack?.timeMs).toBe(45130);
  expect(kenSmgFly?.date).toBe("2025-10-04");
  expect(kenSmg100Free?.date).toBe("2025-10-05");
  const kenKrapFree = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "KRAPPROVBYL2026" && r.stroke === "bebas" && r.distanceM === 50,
  );
  const kenKrap100Back = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "KRAPPROVBYL2026" && r.stroke === "punggung" && r.distanceM === 100,
  );
  expect(kenKrapFree?.date).toBe("2026-07-05");
  expect(kenKrap100Back?.date).toBe("2026-07-05");
  const kenKejurFree = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "KEJURPROVJTG2026" && r.stroke === "bebas" && r.distanceM === 50,
  );
  const kenKejur100Back = synced.find(
    (r) => r.fullName.startsWith("Ken") && r.meetCode === "KEJURPROVJTG2026" && r.stroke === "punggung" && r.distanceM === 100,
  );
  expect(kenKejurFree?.date).toBe("2026-04-11");
  expect(kenKejur100Back?.date).toBe("2026-04-12");
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
  const kunBoyolali = await h.sql<{ time_ms: number; result_date: string }>`
    select r.time_ms, r.result_date::text as result_date
    from results r
    join swimmers s on s.id = r.swimmer_id
    join meets m on m.id = r.meet_id
    where s.full_name like 'Kun%' and m.notes = 'BOYOLALI2025' and r.stroke = 'bebas' and r.distance_m = 50
  `;
  expect(kunBoyolali[0]?.time_ms).toBe(36780);
  expect(kunBoyolali[0]?.result_date.slice(0, 10)).toBe("2025-08-24");
  const kenSmgBack = await h.sql<{ time_ms: number; result_date: string }>`
    select r.time_ms, r.result_date::text as result_date
    from results r
    join swimmers s on s.id = r.swimmer_id
    join meets m on m.id = r.meet_id
    where s.full_name like 'Ken%' and m.notes = 'SMGOPEN2025' and r.stroke = 'punggung' and r.distance_m = 50
  `;
  expect(kenSmgBack[0]?.time_ms).toBe(45130);
  expect(kenSmgBack[0]?.result_date.slice(0, 10)).toBe("2025-10-03");
});
