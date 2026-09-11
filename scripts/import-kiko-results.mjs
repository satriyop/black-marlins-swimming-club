#!/usr/bin/env node
/**
 * Upsert kiko-web race times and medals for Ken, Luigi, and Kun.
 * Uses DATABASE_URL. Safe to re-run (skips existing result rows).
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATHLETE_NAMES,
  MEET_META,
  NICKNAMES,
  applyMedalPlaces,
  meetDateRange,
  parseEvents,
  parseMedals,
  syncEventDates,
} from "./kiko-parse.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function importKikoResults(query) {
  const eventsCsv = await readFile(join(root, "data/kiko/renang_events.csv"), "utf8");
  const medalsCsv = await readFile(join(root, "data/kiko/renang_medal.csv"), "utf8");
  const medals = parseMedals(medalsCsv);
  const events = syncEventDates(applyMedalPlaces(parseEvents(eventsCsv), medals), medals);
  const ranges = meetDateRange(events, medals);
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
    const start = ranges[code]?.start ?? dates[0];
    const end = ranges[code]?.end ?? dates[dates.length - 1] ?? start;
    const existing = await query(
      "select id from meets where club_id = $1 and (name = $2 or notes = $3) limit 1",
      [clubId, meta.name, code],
    );
    if (existing[0]) {
      meetIds[code] = existing[0].id;
      await query(
        "update meets set name = $1, start_date = $2, end_date = $3, city = $4, level = $5 where id = $6",
        [meta.name, start, end, meta.city, meta.level, existing[0].id],
      );
      continue;
    }
    const course = events.find((e) => e.meetCode === code)?.course ?? "50";
    const inserted = await query(
      `insert into meets (club_id, name, level, course, city, start_date, end_date, organizer, status, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'selesai', $9)
       returning id`,
      [clubId, meta.name, meta.level, course, meta.city, start, end, code, code],
    );
    meetIds[code] = inserted[0].id;
  }

  let inserted = 0;
  let skipped = 0;
  let updated = 0;
  for (const ev of events) {
    const swimmerId = byName[ev.fullName];
    const meetId = meetIds[ev.meetCode];
    if (!swimmerId || !meetId) {
      skipped += 1;
      continue;
    }
    const dup = await query(
      `select id, result_date, course, place, notes from results
       where club_id = $1 and swimmer_id = $2 and meet_id = $3
         and stroke = $4 and distance_m = $5 and time_ms = $6
       limit 1`,
      [clubId, swimmerId, meetId, ev.stroke, ev.distanceM, ev.timeMs],
    );
    if (dup[0]) {
      const sameDate = String(dup[0].result_date).slice(0, 10) === ev.date;
      const sameCourse = String(dup[0].course) === String(ev.course);
      const samePlace = (dup[0].place ?? null) === (ev.place ?? null);
      const sameNotes = (dup[0].notes ?? null) === (ev.notes ?? null);
      if (!sameDate || !sameCourse || !samePlace || !sameNotes) {
        await query("update results set result_date = $1, course = $2, place = $3, notes = $4 where id = $5", [
          ev.date,
          ev.course,
          ev.place,
          ev.notes,
          dup[0].id,
        ]);
        updated += 1;
      } else {
        skipped += 1;
      }
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
  return { inserted, skipped, updated, total: events.length };
}


