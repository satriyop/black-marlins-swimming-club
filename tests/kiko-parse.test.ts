import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { applyMedalPlaces, parseEvents, parseMedals, parseTimeToMs } from "../scripts/kiko-parse.mjs";
import { seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";
import { importKikoResults } from "../scripts/import-kiko-results.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("parses Luigi 50 free Jatidiri gold as 30530 ms official LCM", () => {
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
});
