import type { Actor } from "./actor";
import { hatsFor } from "./hats";
import { canWriteMeet } from "./permissions";

export type SyncConflict = {
  id: number;
  entityType: "swimmer" | "meet";
  entityId: number;
  entityLabel: string;
  fieldName: string;
  localValue: string | null;
  incomingValue: string | null;
  detectedAt: string;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nama",
  level: "Tingkat",
  venue: "Venue",
  startDate: "Tanggal mulai",
  endDate: "Tanggal selesai",
  status: "Status",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

// Whitelist -- field_name only ever comes from scripts/sync-spectra-meets.mjs's
// fixed SYNCED_FIELDS list, but this is what makes it safe to interpolate as a
// raw column name below rather than a bound parameter.
const MEET_COLUMN_BY_FIELD: Record<string, string> = {
  name: "name",
  level: "level",
  venue: "venue",
  startDate: "start_date",
  endDate: "end_date",
  status: "status",
};

export async function listSyncConflicts(actor: Actor & { clubId: number }): Promise<SyncConflict[]> {
  const hats = await hatsFor(actor);
  if (!canWriteMeet(hats)) return [];
  const rows = await actor.sql<{
    id: number;
    entity_type: "swimmer" | "meet";
    entity_id: number;
    field_name: string;
    local_value: string | null;
    incoming_value: string | null;
    detected_at: string;
    meet_name: string | null;
  }>`
    select c.id, c.entity_type, c.entity_id, c.field_name, c.local_value, c.incoming_value, c.detected_at,
           m.name as meet_name
    from sync_conflicts c
    left join meets m on c.entity_type = 'meet' and m.id = c.entity_id
    where c.club_id = ${actor.clubId} and c.resolved_at is null
    order by c.detected_at asc
  `;
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityLabel: r.meet_name ?? `#${r.entity_id}`,
    fieldName: r.field_name,
    localValue: r.local_value,
    incomingValue: r.incoming_value,
    detectedAt: r.detected_at,
  }));
}

export async function resolveSyncConflict(
  actor: Actor & { clubId: number },
  input: { id: number; resolution: "kept_local" | "used_incoming" },
): Promise<{ ok: true }> {
  const hats = await hatsFor(actor);
  if (!canWriteMeet(hats)) throw new Error("Tidak diizinkan");
  return actor.sql.transaction(async (sql) => {
    const rows = await sql<{
      entity_type: "swimmer" | "meet";
      entity_id: number;
      field_name: string;
      incoming_value: string | null;
    }>`
      select entity_type, entity_id, field_name, incoming_value from sync_conflicts
      where id = ${input.id} and club_id = ${actor.clubId} and resolved_at is null
      for update
    `;
    const conflict = rows[0];
    if (!conflict) throw new Error("Konflik tidak ditemukan atau sudah diselesaikan");

    if (input.resolution === "used_incoming" && conflict.entity_type === "meet") {
      const column = MEET_COLUMN_BY_FIELD[conflict.field_name];
      if (!column) throw new Error(`Kolom tidak dikenal: ${conflict.field_name}`);
      await sql.query(
        `update meets set ${column} = $1,
           spectra_snapshot = coalesce(spectra_snapshot, '{}'::jsonb) || jsonb_build_object($2::text, $1::text)
         where id = $3 and club_id = $4`,
        [conflict.incoming_value, conflict.field_name, conflict.entity_id, actor.clubId],
      );
    }
    // "kept_local" intentionally leaves the meet row and its spectra_snapshot
    // untouched -- the snapshot still reflects the last *applied* sync value,
    // so a future sync correctly sees local as diverged again. The sync
    // script itself is what recognizes "this exact incoming value was
    // already dismissed" and skips re-raising it (see sync-spectra-meets.mjs).

    await sql`
      update sync_conflicts
      set resolved_at = now(), resolution = ${input.resolution}, resolved_by = ${actor.userId}
      where id = ${input.id}
    `;
    return { ok: true as const };
  });
}
