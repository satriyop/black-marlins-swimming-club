// @ts-check
/**
 * Pure parsing/mapping helpers for Spectra SwimPro's public per-swimmer
 * result data (globiesoft.com/rlist_off/php/events_resultbyevent2.php).
 * No I/O here -- scripts/sync-spectra-meets.mjs and src/lib/club/spectra-match.ts
 * do the fetch + DB work.
 *
 * events_resultbyevent2.php row shape (confirmed via DevTools, 2026-09-17,
 * against ?cevent=KRAPPROVBYL2026&ceventno=108&ckelumur=GROUP+2): {id, nama,
 * lahir, sex, club, kode, nomorkode, nomordescr, jenis, kelumur, note,
 * hasilfinal, urut3, juara, ket1, seri3, lin3, hasilseri, seri1, lin1,
 * urut1, hasiloff, seri2, lin2, urut2}. Note "kode" here is the numeric
 * event/race number (matches the ceventno query param) -- a completely
 * different meaning from "kode" in events_list.php (there it's the meet
 * code). The meet code isn't repeated per-row; it comes from the query
 * context, so normalizeResultRow takes it as a separate argument.
 *
 * "juara" (final placement) uses "1000" as a sentinel for "not placed" --
 * not a top-N finish, not DQ/DNS (those would show in "note"/"ket1").
 */

/** @param {string} raw */
export function parseTimeToMs(raw) {
  const v = String(raw ?? "").trim().replace(",", ".");
  if (!v || v === "_") return null;
  const parts = v.split(":");
  if (parts.length === 1) {
    const sec = Number(parts[0]);
    if (!Number.isFinite(sec) || sec < 0) return null;
    return Math.round(sec * 1000);
  }
  if (parts.length === 2) {
    const min = Number(parts[0]);
    const sec = Number(parts[1]);
    if (!Number.isFinite(min) || !Number.isFinite(sec)) return null;
    return Math.round(min * 60_000 + sec * 1000);
  }
  return null;
}

/** @type {Record<string, number>} */
const MONTHS = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

/** "25 APRIL 2012" -> "2012-04-25". Returns null if unparseable.
 *  @param {string} text @returns {string | null} */
export function parseSpectraDate(text) {
  const m = String(text ?? "").trim().match(/^(\d{1,2})\s+([A-Z]+)\s+(\d{4})$/i);
  if (!m) return null;
  const month = MONTHS[m[2].toUpperCase()];
  if (!month) return null;
  const day = String(m[1]).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${m[3]}-${mm}-${day}`;
}

/** @type {Array<[string, string]>} */
const STROKE_KEYWORDS = [
  ["INDIVIDUAL MEDLEY", "ganti"],
  ["FREESTYLE", "bebas"],
  ["BACKSTROKE", "punggung"],
  ["BREASTSTROKE", "dada"],
  ["BUTTERFLY", "kupu"],
];

/** "200 M BREASTSTROKE WOMEN, LCM" -> {distanceM, stroke, gender, course}.
 *  @param {string} nomordescr
 *  @returns {{distanceM: number | null, stroke: string | null, gender: "putra" | "putri" | null, course: "25" | "50" | null}} */
export function parseEventDescr(nomordescr) {
  const text = String(nomordescr ?? "").toUpperCase();
  const distanceMatch = text.match(/(\d+)\s*M\b/);
  const distanceM = distanceMatch ? Number(distanceMatch[1]) : null;
  const stroke = STROKE_KEYWORDS.find(([kw]) => text.includes(kw))?.[1] ?? null;
  const gender = text.includes("WOMEN") ? "putri" : text.includes("MEN") ? "putra" : null;
  const course = text.includes("LCM") ? "50" : text.includes("SCM") ? "25" : null;
  return { distanceM, stroke, gender, course };
}

/** True for a relay event ("4X100 M FREESTYLE RELAY..."); these are skipped
 *  for individual swimmer sync, same as kiko-parse.mjs does for medals.
 *  @param {{jenis?: string}} row */
export function isRelay(row) {
  return String(row.jenis ?? "").toUpperCase() === "RELAY";
}

/**
 * Normalize one events_resultbyevent2.php row. `meetCode` comes from the
 * query context (cevent=...), not the row itself -- see the header note.
 * @param {{
 *   id?: string, nama?: string, lahir?: string, sex?: string, club?: string,
 *   kode?: string, kelumur?: string, nomordescr?: string, hasilfinal?: string,
 *   juara?: string, seri3?: string, lin3?: string, note?: string
 * }} row
 * @param {string} meetCode
 */
export function normalizeResultRow(row, meetCode) {
  if (!row || typeof row.id !== "string" || typeof row.nama !== "string") {
    throw new Error(`spectra-athlete-parse: unexpected events_resultbyevent2.php row shape: ${JSON.stringify(row)}`);
  }
  const { distanceM, stroke, gender, course } = parseEventDescr(row.nomordescr ?? "");
  const timeMs = row.hasilfinal ? parseTimeToMs(row.hasilfinal) : null;
  const place = row.juara && row.juara !== "1000" ? Number(row.juara) : null;
  const heatMatch = String(row.seri3 ?? "").match(/(\d+)/);
  return {
    athleteId: row.id,
    fullName: row.nama,
    dateOfBirth: parseSpectraDate(row.lahir ?? ""),
    gender,
    club: row.club || null,
    meetCode,
    eventNumber: row.kode ?? "",
    ageGroup: row.kelumur || null,
    distanceM,
    stroke,
    course,
    timeMs,
    place,
    heat: heatMatch ? Number(heatMatch[1]) : null,
    lane: row.lin3 ? Number(row.lin3) : null,
    notes: row.note || null,
  };
}

/**
 * Normalize one athlete_time2.php row -- the authenticated-area "Event
 * History" endpoint, scoped to one already-known athlete (cid=...) across
 * all their meets. Confirmed via DevTools, 2026-09-17, against
 * ?cid=43720&cprovince=: {kode, awal, nomorkode, nomordescr, jenis, note,
 * hasil, pakaidata, urut3, juara, kelumur, team, acara}. Unlike
 * events_resultbyevent2.php, here "kode" IS the meet code and "acara" is
 * the race/event number -- field names are reused with different meanings
 * across Spectra's endpoints, so don't assume consistency between parsers.
 * Per the approved design, this endpoint is only ever called for a swimmer
 * whose athlete ID was already confirmed via the public per-race search
 * (normalizeResultRow above) -- never used to discover new athletes.
 * @param {{
 *   kode?: string, awal?: string, acara?: string, kelumur?: string,
 *   team?: string, nomordescr?: string, hasil?: string, juara?: string,
 *   note?: string, jenis?: string
 * }} row
 */
export function normalizeAthleteHistoryRow(row) {
  if (!row || typeof row.kode !== "string" || typeof row.acara !== "string") {
    throw new Error(`spectra-athlete-parse: unexpected athlete_time2.php row shape: ${JSON.stringify(row)}`);
  }
  const { distanceM, stroke, course } = parseEventDescr(row.nomordescr ?? "");
  const timeMs = row.hasil ? parseTimeToMs(row.hasil) : null;
  const place = row.juara && row.juara !== "1000" ? Number(row.juara) : null;
  return {
    meetCode: row.kode,
    date: parseSpectraDate(row.awal ?? ""),
    eventNumber: row.acara,
    ageGroup: row.kelumur || null,
    club: row.team || null,
    distanceM,
    stroke,
    course,
    timeMs,
    place,
    notes: row.note || null,
  };
}

/** Loose name match: case/diacritic/whitespace-insensitive substring or
 *  equality check, used to find candidate rows for a swimmer being added.
 *  Deliberately permissive -- a human still confirms the match, this is
 *  just the recall step.
 *  @param {string} candidateName @param {string} query */
export function nameMatches(candidateName, query) {
  /** @param {string} s */
  const norm = (s) =>
    String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .replace(/\s+/g, " ");
  const a = norm(candidateName);
  const b = norm(query);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
