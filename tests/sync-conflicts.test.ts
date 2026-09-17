import { expect, test } from "vitest";
import { createClubHarness } from "./harness";
import { listSyncConflicts, resolveSyncConflict } from "../src/lib/club/sync-conflicts";

async function seedClubWithStaff(sql: Awaited<ReturnType<typeof createClubHarness>>["sql"], userId: string) {
  await sql.query(`insert into "user" (id, name, email, "emailVerified") values ($1, 'Coach', $2, true)`, [
    userId,
    `${userId}@example.test`,
  ]);
  const club = await sql.query<{ id: number }>(
    `insert into clubs (name, short_name, city, province, coach_name)
     values ('Black Marlins Swimming Club', 'BMSC', 'Klaten', 'Jawa Tengah', 'Coach')
     returning id`,
  );
  const clubId = club[0].id;
  await sql.query(`insert into club_staff (club_id, user_id, role) values ($1, $2, 'coach')`, [clubId, userId]);
  return clubId;
}

async function seedMeetConflict(sql: Awaited<ReturnType<typeof createClubHarness>>["sql"], clubId: number) {
  const meet = await sql.query<{ id: number }>(
    `insert into meets (club_id, name, level, course, start_date, status, spectra_event_code)
     values ($1, 'KRAS Piala Bupati Banyumas Tahun 2026', 'pengcab', '50', '2026-08-28', 'batal', 'KRASBMSV2026')
     returning id`,
    [clubId],
  );
  const conflict = await sql.query<{ id: number }>(
    `insert into sync_conflicts (club_id, entity_type, entity_id, field_name, local_value, incoming_value)
     values ($1, 'meet', $2, 'status', 'batal', 'berlangsung') returning id`,
    [clubId, meet[0].id],
  );
  return { meetId: meet[0].id, conflictId: conflict[0].id };
}

test("resolving a meet conflict with used_incoming applies the field and updates the snapshot", async () => {
  const { sql, actor } = await createClubHarness();
  const clubId = await seedClubWithStaff(sql, "usr_coach");
  const { meetId, conflictId } = await seedMeetConflict(sql, clubId);

  const result = await resolveSyncConflict({ ...actor("usr_coach"), clubId }, { id: conflictId, resolution: "used_incoming" });
  expect(result).toEqual({ ok: true });

  const meet = await sql.query<{ status: string; spectra_snapshot: Record<string, unknown> }>(
    "select status, spectra_snapshot from meets where id = $1",
    [meetId],
  );
  expect(meet[0].status).toBe("berlangsung");
  expect(meet[0].spectra_snapshot).toMatchObject({ status: "berlangsung" });

  const open = await listSyncConflicts({ ...actor("usr_coach"), clubId });
  expect(open).toHaveLength(0);
});

test("resolving a meet conflict with kept_local leaves the meet row untouched", async () => {
  const { sql, actor } = await createClubHarness();
  const clubId = await seedClubWithStaff(sql, "usr_coach");
  const { meetId, conflictId } = await seedMeetConflict(sql, clubId);

  await resolveSyncConflict({ ...actor("usr_coach"), clubId }, { id: conflictId, resolution: "kept_local" });

  const meet = await sql.query<{ status: string }>("select status from meets where id = $1", [meetId]);
  expect(meet[0].status).toBe("batal");

  const resolved = await sql.query<{ resolution: string; resolved_at: string | null }>(
    "select resolution, resolved_at from sync_conflicts where id = $1",
    [conflictId],
  );
  expect(resolved[0].resolution).toBe("kept_local");
  expect(resolved[0].resolved_at).not.toBeNull();
});

test("resolving a swimmer conflict with used_incoming errors instead of silently discarding the choice", async () => {
  const { sql, actor } = await createClubHarness();
  const clubId = await seedClubWithStaff(sql, "usr_coach");
  const swimmer = await sql.query<{ id: number }>(
    `insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, status)
     values ($1, 'Test Swimmer', '2013-01-01', 'putra', 'Indonesia', 'aktif') returning id`,
    [clubId],
  );
  const conflict = await sql.query<{ id: number }>(
    `insert into sync_conflicts (club_id, entity_type, entity_id, field_name, local_value, incoming_value)
     values ($1, 'swimmer', $2, 'city', 'Klaten', 'Solo') returning id`,
    [clubId, swimmer[0].id],
  );

  await expect(
    resolveSyncConflict({ ...actor("usr_coach"), clubId }, { id: conflict[0].id, resolution: "used_incoming" }),
  ).rejects.toThrow(/belum didukung/);

  // Not silently marked resolved -- the coach's choice wasn't discarded, it's still pending.
  const open = await listSyncConflicts({ ...actor("usr_coach"), clubId });
  expect(open).toHaveLength(1);
});

test("resolving an already-resolved conflict fails rather than double-applying it", async () => {
  const { sql, actor } = await createClubHarness();
  const clubId = await seedClubWithStaff(sql, "usr_coach");
  const { conflictId } = await seedMeetConflict(sql, clubId);
  const bound = { ...actor("usr_coach"), clubId };

  await resolveSyncConflict(bound, { id: conflictId, resolution: "kept_local" });
  await expect(resolveSyncConflict(bound, { id: conflictId, resolution: "used_incoming" })).rejects.toThrow(
    /tidak ditemukan|sudah diselesaikan/,
  );
});
