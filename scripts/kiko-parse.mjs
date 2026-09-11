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
  KEJURPROVJTG2026: { name: "Kejurprov Jateng 2026", level: "pengprov", city: "Jawa Tengah" },
  KRAPPROVBYL2026: { name: "KRA Provinsi Boyolali 2026", level: "pengprov", city: "Boyolali" },
  DANLANALSMG2026: { name: "Danlanal Semarang 2026", level: "pengprov", city: "Semarang" },
  O2SNJATENG2026: { name: "O2SN Jawa Tengah 2026", level: "sekolah", city: "Jawa Tengah" },
  JATIDIRI2026: { name: "Jatidiri Semarang 2026", level: "pengprov", city: "Semarang" },
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

function courseOf(kolam, distance) {
  const k = String(kolam ?? "").toUpperCase();
  if (k === "SCM" || k === "SC") return "25";
  if (k === "LCM" || k === "LC") return "50";
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
      course: courseOf(kolam, distanceM),
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
