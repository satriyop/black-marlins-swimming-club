/**
 * Sync the public Spectra SwimPro event catalog into this club's `meets`
 * table -- the daily/server-side half of the Spectra integration (see
 * docs discussion: swimmer bio sync is client-triggered on add, this is
 * scheduled and unattended). Safe to re-run: matches by spectra_event_code,
 * only auto-applies a field when the local row still agrees with what we
 * last synced (see diffAgainstSnapshot in spectra-parse.mjs), and never
 * overwrites a field a coach has hand-edited since -- that goes to
 * sync_conflicts for review instead.
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

export async function syncSpectraMeets(query, { fetchEvents = fetchEventsList } = {}) {
  const club = await query("select id from clubs limit 1");
  if (!club[0]) throw new Error("No club row -- seed the club first");
  const clubId = club[0].id;

  const rawRows = await fetchEvents();
  const events = rawRows.map(normalizeEventRow).filter(inRegion);

  let inserted = 0;
  let updated = 0;
  let conflicted = 0;
  let unchanged = 0;

  for (const event of events) {
    const incoming = meetFieldsFromEvent(event);

    const existing = await query(
      `select id, name, level, venue,
              start_date as "startDate", end_date as "endDate", status,
              spectra_snapshot as "spectraSnapshot"
       from meets where club_id = $1 and spectra_event_code = $2 limit 1`,
      [clubId, event.code],
    );

    if (!existing[0]) {
      await query(
        `insert into meets (club_id, name, level, course, venue, start_date, end_date, status, organizer,
                             spectra_event_code, spectra_synced_at, spectra_snapshot)
         values ($1,$2,$3,'50',$4,$5,$6,$7,'Spectra SwimPro',$8, now(), $9)`,
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
      inserted += 1;
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

  return { total: events.length, inserted, updated, conflicted, unchanged };
}
