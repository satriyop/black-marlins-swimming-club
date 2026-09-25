/**
 * Sync the public Spectra SwimPro event catalog into every swim Club's
 * `meets` table -- one fetch, then a copy per Club whose sport is `renang`.
 * A non-swim Club gets nothing. Pass `club` (slug or hostname) to write
 * one Club only. Safe to re-run: matches by spectra_event_code,
 * only auto-applies a field when the local row still agrees with what we
 * last synced (see diffAgainstSnapshot in spectra-parse.mjs), and never
 * overwrites a field a coach has hand-edited since -- that goes to
 * sync_conflicts for review instead.
 *
 * `course` is deliberately NOT synced and always defaults to '50' (long
 * course) on insert: events_list.php carries no pool-length field at the
 * meet level (only individual events' free-text descriptions do), so there
 * is no reliable per-meet source for it. A genuinely short-course (25m)
 * meet will show the wrong badge on Kejuaraan until a coach corrects it by
 * hand -- which sticks, since course isn't in SYNCED_FIELDS and future
 * syncs never touch it.
 */
import { fetchEventsList } from "./spectra-client.mjs";
import { diffAgainstSnapshot, inRegion, meetFieldsFromEvent, normalizeEventRow } from "./spectra-parse.mjs";

const SYNCED_FIELDS = ["name", "level", "venue", "startDate", "endDate", "status"];
const COLUMN_BY_FIELD = {
  name: "name",
  level: "level",
  venue: "venue",
  startDate: "start_date",
  endDate: "end_date",
  status: "status",
};

/** True when a coach already reviewed and dismissed ("kept_local") this
 *  exact incoming value for this field -- re-raising it every sync would
 *  just be nagging about something already decided. A *different* incoming
 *  value (Spectra's data changed again) is new information and still
 *  surfaces normally. */
async function alreadyDismissed(query, clubId, meetId, field, incomingValue) {
  const rows = await query(
    `select id from sync_conflicts
     where club_id = $1 and entity_type = 'meet' and entity_id = $2 and field_name = $3
       and resolution = 'kept_local' and incoming_value = $4 and resolved_at is not null
     order by resolved_at desc limit 1`,
    [clubId, meetId, field, String(incomingValue ?? "")],
  );
  return Boolean(rows[0]);
}

async function upsertConflict(query, clubId, meetId, field, localValue, incomingValue) {
  const existing = await query(
    `select id from sync_conflicts
     where club_id = $1 and entity_type = 'meet' and entity_id = $2 and field_name = $3 and resolved_at is null
     limit 1`,
    [clubId, meetId, field],
  );
  if (existing[0]) {
    await query(
      `update sync_conflicts set local_value = $1, incoming_value = $2, detected_at = now() where id = $3`,
      [String(localValue ?? ""), String(incomingValue ?? ""), existing[0].id],
    );
    return;
  }
  await query(
    `insert into sync_conflicts (club_id, entity_type, entity_id, field_name, local_value, incoming_value)
     values ($1, 'meet', $2, $3, $4, $5)`,
    [clubId, meetId, field, String(localValue ?? ""), String(incomingValue ?? "")],
  );
}

export function parseSyncArgs(argv) {
  const clubFlag = argv.indexOf("--club");
  const club = clubFlag === -1 ? null : argv[clubFlag + 1];
  const allRenang = argv.includes("--all-renang");
  if (allRenang && club) throw new Error("Pass --club or --all-renang, not both");
  if (!allRenang && !club) throw new Error("Pass --club <slug-or-hostname> or --all-renang");
  return { club: club || null, allRenang };
}

async function targetClubs(query, club) {
  if (club) {
    const rows = await query(
      `select id, sport from clubs where lower(slug) = lower($1) or lower(hostname) = lower($1)`,
      [club],
    );
    if (!rows[0]) throw new Error(`No club matches ${club}`);
    return rows.filter((row) => row.sport === "renang");
  }
  const rows = await query(`select id, sport from clubs where sport = 'renang' order by id`);
  if (!rows.length) {
    const any = await query("select id from clubs");
    if (!any.length) throw new Error("No club row -- seed the club first");
  }
  return rows;
}

async function applyCatalog(query, clubId, events) {
  let inserted = 0;
  let updated = 0;
  let conflicted = 0;
  let unchanged = 0;

  for (const event of events) {
    const incoming = meetFieldsFromEvent(event);

    // start_date/end_date are cast to text explicitly -- node-postgres parses
    // `date` columns into JS Date objects by default, and diffAgainstSnapshot
    // does a strict `!==` against the plain ISO strings in spectra_snapshot
    // and the incoming Spectra data. Without the cast, every meet would
    // falsely look "changed" on every run regardless of the caller's pool
    // configuration (the app's own pool overrides this globally via
    // setTypeParser, but this script's pool -- see
    // run-sync-spectra-meets.mjs -- does not, and shouldn't have to).
    const existing = await query(
      `select id, name, level, venue,
              start_date::text as "startDate", end_date::text as "endDate", status,
              spectra_snapshot as "spectraSnapshot"
       from meets where club_id = $1 and spectra_event_code = $2 limit 1`,
      [clubId, event.code],
    );

    if (!existing[0]) {
      // ON CONFLICT DO NOTHING guards against a concurrent overlapping run
      // (a run can take several minutes -- see run-sync-spectra-meets.mjs --
      // so a manual re-run while one is still in flight, or an overlapping
      // cron tick, can otherwise race two inserts on the same event code).
      const insertedRows = await query(
        `insert into meets (club_id, name, level, course, venue, start_date, end_date, status, organizer,
                             spectra_event_code, spectra_synced_at, spectra_snapshot)
         values ($1,$2,$3,'50',$4,$5,$6,$7,'Spectra SwimPro',$8, now(), $9)
         on conflict (club_id, spectra_event_code) where spectra_event_code is not null do nothing
         returning id`,
        [
          clubId,
          incoming.name,
          incoming.level,
          incoming.venue,
          incoming.startDate,
          incoming.endDate,
          incoming.status,
          event.code,
          JSON.stringify(incoming),
        ],
      );
      if (insertedRows.length) inserted += 1;
      continue;
    }

    const row = existing[0];
    const snapshot = row.spectraSnapshot;
    const { autoApply, conflicts } = diffAgainstSnapshot(row, snapshot, incoming, SYNCED_FIELDS);

    let raised = 0;
    for (const c of conflicts) {
      if (await alreadyDismissed(query, clubId, row.id, c.field, c.incomingValue)) continue;
      await upsertConflict(query, clubId, row.id, c.field, c.localValue, c.incomingValue);
      raised += 1;
    }
    if (raised) conflicted += 1;

    const applyFields = Object.keys(autoApply);
    if (applyFields.length) {
      const setSql = applyFields.map((f, i) => `${COLUMN_BY_FIELD[f]} = $${i + 3}`).join(", ");
      const newSnapshot = { ...(snapshot ?? {}) };
      for (const f of applyFields) newSnapshot[f] = autoApply[f];
      await query(
        `update meets set ${setSql}, spectra_synced_at = now(), spectra_snapshot = $1 where id = $2`,
        [JSON.stringify(newSnapshot), row.id, ...applyFields.map((f) => autoApply[f])],
      );
      updated += 1;
    } else if (!raised) {
      unchanged += 1;
    }
  }

  return { inserted, updated, conflicted, unchanged };
}

/** One catalog fetch, then a Meet copy on every `renang` Club. `club` limits that to one slug or hostname. */
export async function syncSpectraMeets(query, { fetchEvents = fetchEventsList, club = null } = {}) {
  const targets = await targetClubs(query, club);
  const rawRows = await fetchEvents();
  const events = rawRows.map(normalizeEventRow).filter(inRegion);
  const totals = { total: events.length, inserted: 0, updated: 0, conflicted: 0, unchanged: 0 };
  for (const target of targets) {
    const stats = await applyCatalog(query, target.id, events);
    totals.inserted += stats.inserted;
    totals.updated += stats.updated;
    totals.conflicted += stats.conflicted;
    totals.unchanged += stats.unchanged;
  }
  return totals;
}
