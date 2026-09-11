/** Parse kiko-web renang CSVs into BMSC meets/results. */

export const ATHLETE_NAMES = {
  ken: "Ken Athaya Nirwasita",
  bumi: "Kun Bumi Pamungkas",
  banyu: "Luigi Banyu Pamungkas",
};

export const NICKNAMES = {
  ken: "Kak Ken",
  bumi: "Mas Bumi",
  banyu: "Mas Banyu",
};

export const STROKE = {
  BEBAS: "bebas",
  PUNGGUNG: "punggung",
  DADA: "dada",
  KUPU: "kupu",
  GANTI: "ganti",
};

export const MEET_META = {
  SMGOPEN2025: { name: "Semarang Open 2025", level: "pengprov", city: "Semarang" },
  BOYOLALI2025: { name: "Boyolali 2025", level: "pengcab", city: "Boyolali" },
  KAPOLRESMGL2025: { name: "Piala Kapolres Magelang Kota Open 2025", level: "pengcab", city: "Magelang" },
  ANTARPELAJARJTG2025: { name: "Antar Pelajar Jateng 2025", level: "sekolah", city: "Magelang" },
  KRAS2025: { name: "Piala Bupati Sukoharjo (KRAS) 2025", level: "pengcab", city: "Sukoharjo" },
  BUPATICUP2024: { name: "Bupati Cup 2024", level: "pengcab", city: "Klaten" },
  BUPATICUP2025: { name: "Bupati Cup 2025", level: "pengcab", city: "Klaten" },
  KEJURPROVJTG2026: { name: "Kejurprov Jateng 2026", level: "pengprov", city: "Semarang" },
  KRAPPROVBYL2026: { name: "KRA Provinsi Boyolali 2026", level: "pengprov", city: "Boyolali" },
  DANLANALSMG2026: { name: "Danlanal Semarang 2026", level: "pengprov", city: "Semarang" },
  O2SNJATENG2026: { name: "O2SN Jawa Tengah 2026", level: "sekolah", city: "Jawa Tengah" },
  JATIDIRI2026: { name: "Popda Jateng 2026", level: "sekolah", city: "Semarang" },
};

/** Independently sourced meet windows. Omit a code when the day is still unknown. */
export const MEET_CALENDAR = {
  KAPOLRESMGL2025: { start: "2025-06-22", end: "2025-06-22" },
  ANTARPELAJARJTG2025: { start: "2025-08-09", end: "2025-08-09" },
  KRAS2025: { start: "2025-09-21", end: "2025-09-21" },
  SMGOPEN2025: { start: "2025-10-03", end: "2025-10-03" },
  BUPATICUP2025: { start: "2025-12-17", end: "2025-12-17" },
  DANLANALSMG2026: { start: "2026-02-14", end: "2026-02-14" },
  KEJURPROVJTG2026: { start: "2026-04-10", end: "2026-04-12" },
  JATIDIRI2026: { start: "2026-09-02", end: "2026-09-03" },
};

/** Pool length: "50" LCM, "25" SCM. Kapolres Magelang is Samapta 50 m. */
export const MEET_COURSE = {
  SMGOPEN2025: "50",
  BOYOLALI2025: "50",
  KAPOLRESMGL2025: "50",
  ANTARPELAJARJTG2025: "50",
  KRAS2025: "25",
  BUPATICUP2025: "50",
  KEJURPROVJTG2026: "50",
  KRAPPROVBYL2026: "50",
  DANLANALSMG2026: "50",
  O2SNJATENG2026: "50",
  JATIDIRI2026: "50",
};

export function splitSemi(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ";" && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseTimeToMs(raw) {
  const v = String(raw ?? "").trim().replace(",", ".");
  if (!v) return null;
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

function courseOf(kolam, distance, meetCode) {
  const k = String(kolam ?? "").toUpperCase();
  if (k === "SCM" || k === "SC") return "25";
  if (k === "LCM" || k === "LC") return "50";
  if (MEET_COURSE[meetCode]) return MEET_COURSE[meetCode];
  return Number(distance) <= 25 ? "25" : "50";
}

export function parseEvents(csvText) {
  const lines = csvText.trim().split(/\r?\n/).slice(1);
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const [tanggal, atlet, jarak, gaya, waktu, pb, jenis, kolam, meet, rank, group, catatan] = splitSemi(line);
    const fullName = ATHLETE_NAMES[atlet];
    const stroke = STROKE[String(gaya ?? "").toUpperCase()];
    const distanceM = Number(jarak);
    const timeMs = parseTimeToMs(waktu);
    if (!fullName || !stroke || !Number.isFinite(distanceM) || timeMs == null || !meet) continue;
    const place = rank && /^\d+$/.test(rank.trim()) ? Number(rank) : null;
    rows.push({
      date: tanggal,
      athlete: atlet,
      fullName,
      distanceM,
      stroke,
      timeMs,
      course: courseOf(kolam, distanceM, meet),
      meetCode: meet,
      place,
      notes: [pb === "PB" ? "PB" : "", catatan].filter(Boolean).join(" · ") || null,
    });
  }
  return rows;
}

export function parseMedals(csvText) {
  const lines = csvText.trim().split(/\r?\n/).slice(1);
  const medals = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const [tanggal, atlet, meet, event, medali, catatan] = splitSemi(line);
    if (/estafet/i.test(event ?? "")) continue;
    const m = String(event ?? "").match(/(\d+)\s+(BEBAS|PUNGGUNG|DADA|KUPU|GANTI)/i);
    if (!m) continue;
    const place = medali === "emas" ? 1 : medali === "perak" ? 2 : medali === "perunggu" ? 3 : null;
    medals.push({
      date: tanggal,
      athlete: atlet,
      meetCode: meet,
      distanceM: Number(m[1]),
      stroke: STROKE[m[2].toUpperCase()],
      place,
      notes: catatan || null,
    });
  }
  return medals;
}

export function applyMedalPlaces(events, medals) {
  return events.map((ev) => {
    const hit = medals.find(
      (m) =>
        m.athlete === ev.athlete &&
        m.meetCode === ev.meetCode &&
        m.distanceM === ev.distanceM &&
        m.stroke === ev.stroke,
    );
    if (!hit) return ev;
    const notes = [ev.notes, hit.notes].filter(Boolean).join(" · ");
    return { ...ev, place: hit.place ?? ev.place, notes: notes || ev.notes };
  });
}

export function isPlaceholderDate(date) {
  return /^\d{4}-01-01$/.test(String(date ?? ""));
}

export function meetDateRange(events, medals) {
  /** @type {Record<string, string[]>} */
  const byMeet = {};
  const push = (code, date) => {
    if (!code || !date || isPlaceholderDate(date)) return;
    (byMeet[code] ??= []).push(date);
  };
  for (const ev of events) push(ev.meetCode, ev.date);
  for (const m of medals) push(m.meetCode, m.date);
  /** @type {Record<string, { start: string, end: string }>} */
  const range = { ...MEET_CALENDAR };
  for (const [code, dates] of Object.entries(byMeet)) {
    const sorted = [...dates].sort();
    const sourced = MEET_CALENDAR[code];
    range[code] = {
      start: sourced?.start ?? sorted[0],
      end: sourced?.end ?? sorted[sorted.length - 1],
    };
  }
  return range;
}

export function syncEventDates(events, medals) {
  const range = meetDateRange(events, medals);
  return events.map((ev) => {
    const hit = medals.find(
      (m) =>
        m.athlete === ev.athlete &&
        m.meetCode === ev.meetCode &&
        m.distanceM === ev.distanceM &&
        m.stroke === ev.stroke &&
        m.date &&
        !isPlaceholderDate(m.date),
    );
    let date = ev.date;
    if (isPlaceholderDate(date) && hit) date = hit.date;
    if (isPlaceholderDate(date) && range[ev.meetCode]) date = range[ev.meetCode].start;
    if (isPlaceholderDate(date) && MEET_CALENDAR[ev.meetCode]) date = MEET_CALENDAR[ev.meetCode].start;
    return { ...ev, date };
  });
}
