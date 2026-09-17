/**
 * Pure parsing/mapping helpers for the Spectra SwimPro public event catalog
 * (globiesoft.com/rlist_off/php/events_list.php). No I/O here -- scripts/
 * sync-spectra-meets.mjs does the fetch + DB work and stays thin.
 *
 * events_list.php row shape (confirmed via DevTools against a real response,
 * 2026-09-17): {kode, nama, awal, akhir, periode, tempat, lokasi, status,
 * pakaidata, sport, register}. "awal"/"akhir" are already ISO yyyy-mm-dd.
 * "pakaidata" is an organizer-chosen scope tag ("NATIONAL", "NATIONAL -
 * UNOFFICIAL", "JAWA TENGAH", ...) -- not a reliable province classifier on
 * its own (plenty of genuinely-Jateng meets are tagged NATIONAL), so it's
 * used only as one signal alongside a city/venue keyword match.
 */

export function normalizeEventRow(raw) {
  if (!raw || typeof raw.kode !== "string" || typeof raw.nama !== "string") {
    throw new Error(`spectra-parse: unexpected events_list.php row shape: ${JSON.stringify(raw)}`);
  }
  return {
    code: raw.kode,
    name: raw.nama,
    startDate: raw.awal,
    endDate: raw.akhir || raw.awal,
    venue: raw.lokasi || null,
    cityHint: raw.tempat || null,
    status: raw.status,
    scope: raw.pakaidata || null,
    registeredOnly: raw.register === "YES",
  };
}

const REGION_KEYWORDS = [
  "jawa tengah", "klaten", "semarang", "boyolali", "solo", "surakarta",
  "sukoharjo", "magelang", "salatiga", "kudus", "purwokerto", "yogyakarta",
  "jogja", "sleman", "bantul", "wonosobo", "wonogiri", "karanganyar",
  "sragen", "temanggung", "pekalongan", "tegal", "banyumas", "kebumen",
  "purworejo", "kulon progo", "gunungkidul", "demak", "kendal", "batang",
  "pemalang", "brebes", "jepara", "pati", "rembang", "blora", "grobogan",
  "purbalingga", "cilacap", "banjarnegara", "wonosari",
];

/** True when the event's scope tag or any location text hints at Central
 *  Java / DIY -- the region this club actually competes in. */
export function inRegion(event) {
  if (event.scope && event.scope.toLowerCase() === "jawa tengah") return true;
  const haystack = [event.name, event.cityHint, event.venue].filter(Boolean).join(" ").toLowerCase();
  return REGION_KEYWORDS.some((k) => haystack.includes(k));
}

const LEVEL_RULES = [
  { test: /porprov|pekan olahraga provinsi/i, level: "pengprov" },
  { test: /krapprov|kejurprov|kejuaraan.*provinsi/i, level: "pengprov" },
  { test: /krapda|\bkrap\b|walikota|bupati|piala kapolres|kras\b/i, level: "pengcab" },
  { test: /o2sn|popda|antar pelajar|pekan olahraga pelajar/i, level: "sekolah" },
  { test: /piala gubernur|kejurnas|kejuaraan nasional/i, level: "nasional" },
];

/** Best-effort level guess from the event name -- events_list.php carries no
 *  explicit level field. Defaults to "pengcab" (this club's typical scope)
 *  when no keyword matches; a coach can always correct it, and per the
 *  snapshot-diff design that correction is never silently overwritten. */
export function mapLevel(name) {
  for (const rule of LEVEL_RULES) if (rule.test.test(name)) return rule.level;
  return "pengcab";
}

const STATUS_MAP = {
  REGISTRATION: "rencana",
  RUNNING: "berlangsung",
  CLOSED: "selesai",
  CANCELLED: "batal",
};

export function mapStatus(spectraStatus) {
  return STATUS_MAP[String(spectraStatus ?? "").toUpperCase()] ?? "rencana";
}

/** Compare last-synced values (snapshot) against fresh incoming values.
 *  A field only becomes a conflict when the local row has drifted from the
 *  snapshot (a human edited it since the last sync) AND the incoming value
 *  disagrees too. If local still matches the snapshot, the incoming value
 *  applies automatically -- that's the sync just doing its job, not an
 *  override. `snapshot == null` means this is the first sync: never a
 *  conflict, everything auto-applies. */
export function diffAgainstSnapshot(local, snapshot, incoming, fields) {
  const autoApply = {};
  const conflicts = [];
  for (const field of fields) {
    const incomingVal = incoming[field];
    if (incomingVal === undefined) continue;
    const localVal = local[field];
    const localMatchesSnapshot = snapshot == null || localVal === snapshot[field];
    if (localVal === incomingVal) continue;
    if (localMatchesSnapshot) {
      autoApply[field] = incomingVal;
    } else {
      conflicts.push({ field, localValue: localVal, incomingValue: incomingVal });
    }
  }
  return { autoApply, conflicts };
}

export function meetFieldsFromEvent(event) {
  return {
    name: event.name,
    level: mapLevel(event.name),
    venue: event.venue,
    startDate: event.startDate,
    endDate: event.endDate,
    status: mapStatus(event.status),
  };
}
