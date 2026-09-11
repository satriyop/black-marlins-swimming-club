#!/usr/bin/env node
/**
 * Upsert kiko-web race times and medals for Ken, Luigi, and Kun.
 * Uses DATABASE_URL. Safe to re-run (skips existing result rows).
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ATHLETE_NAMES, MEET_META, NICKNAMES, applyMedalPlaces, parseEvents, parseMedals } from "./kiko-parse.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function importKikoResults(query) {
  const eventsCsv = await readFile(join(root, "data/kiko/renang_events.csv"), "utf8");
  const medalsCsv = await readFile(join(root, "data/kiko/renang_medal.csv"), "utf8");
  const events = applyMedalPlaces(parseEvents(eventsCsv), parseMedals(medalsCsv));
  const club = await query("select id from clubs limit 1");
  if (!club[0]) throw new Error("No club row — seed the club first");
  const clubId = club[0].id;

  const swimmers = await query("select id, full_name from swimmers where club_id = $1", [clubId]);
  const byName = Object.fromEntries(swimmers.map((s) => [s.full_name, s.id]));
  for (const [id, name] of Object.entries(ATHLETE_NAMES)) {
    const nick = NICKNAMES[id];
    if (byName[name] && nick) {
      await query("update swimmers set nickname = $1 where id = $2 and (nickname is null or nickname = '')", [
        nick,
        byName[name],
      ]);
    }
  }

  const meetIds = {};
  const codes = [...new Set(events.map((e) => e.meetCode))];
  for (const code of codes) {
    const meta = MEET_META[code] ?? { name: code, level: "pengcab", city: null };
    const dates = events.filter((e) => e.meetCode === code).map((e) => e.date).sort();
    const start = dates[0];
    const existing = await query("select id from meets where club_id = $1 and name = $2 limit 1", [clubId, meta.name]);
    if (existing[0]) {
      meetIds[code] = existing[0].id;
      continue;
    }
    const course = events.find((e) => e.meetCode === code)?.course ?? "50";
    const inserted = await query(
      `insert into meets (club_id, name, level, course, city, start_date, end_date, organizer, status, notes)
       values ($1, $2, $3, $4, $5, $6, $6, $7, 'selesai', $8)
       returning id`,
      [clubId, meta.name, meta.level, course, meta.city, start, code, code],
    );
    meetIds[code] = inserted[0].id;
  }

  let inserted = 0;
  let skipped = 0;
  for (const ev of events) {
    const swimmerId = byName[ev.fullName];
    const meetId = meetIds[ev.meetCode];
    if (!swimmerId || !meetId) {
      skipped += 1;
      continue;
    }
    const dup = await query(
      `select 1 from results
       where club_id = $1 and swimmer_id = $2 and meet_id = $3
         and stroke = $4 and distance_m = $5 and time_ms = $6 and result_date = $7
       limit 1`,
      [clubId, swimmerId, meetId, ev.stroke, ev.distanceM, ev.timeMs, ev.date],
    );
    if (dup[0]) {
      skipped += 1;
      continue;
    }
    await query(
      `insert into results (
         club_id, swimmer_id, meet_id, result_date, stroke, distance_m, course,
         time_ms, place, round, status, kind, is_pb, notes
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'final','selesai','official', false, $10)`,
      [clubId, swimmerId, meetId, ev.date, ev.stroke, ev.distanceM, ev.course, ev.timeMs, ev.place, ev.notes],
    );
    inserted += 1;
  }
  return { inserted, skipped, total: events.length };
}


