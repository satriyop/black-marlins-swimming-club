import type { z } from "zod";
import type { Actor } from "./actor";
import { hatsFor } from "./hats";
import { requireClubId } from "./membership";
import { canPostAnnouncement } from "./permissions";
import {
  announcementContentSchema,
  announcementActionSchema,
  announcementIdSchema,
  editAnnouncementSchema,
  archiveAnnouncementSchema,
  type AnnouncementContent,
  type AnnouncementListItem,
  type AnnouncementDetail,
  type AnnouncementReceipts,
} from "./announcement-contract";
export type {
  AnnouncementListItem,
  AnnouncementDetail,
  AnnouncementReceipts,
} from "./announcement-contract";

type Row = {
  id: number;
  club_id: number;
  title: string;
  body: string;
  important: boolean;
  due_on: string | null;
  practice_id: number | null;
  meet_id: number | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  revision: number;
  updated_at: string;
  archived_at: string | null;
  archive_note: string | null;
  archived_by_name: string | null;
  audience_captured_at: string;
  audience_origin: string;
  read_at: string | null;
  acknowledged_at: string | null;
  in_audience: boolean;
  practice_title: string | null;
  meet_name: string | null;
};
const selectPost = `select a.id,a.club_id,a.title,a.body,a.important,a.due_on::text,a.practice_id,a.meet_id,a.created_by,
  coalesce(u.name,'Staf') as created_by_name,a.created_at::text,a.revision,a.updated_at::text,a.archived_at::text,
  a.archive_note,au.name as archived_by_name,a.audience_captured_at::text,a.audience_origin,
  r.read_at::text,k.acknowledged_at::text,(aud.user_id is not null) as in_audience,
  p.title as practice_title,m.name as meet_name
  from announcements a left join "user" u on u.id=a.created_by left join "user" au on au.id=a.archived_by
  left join announcement_reads r on r.announcement_id=a.id and r.revision=a.revision and r.user_id=$1
  left join announcement_acknowledgements k on k.announcement_id=a.id and k.revision=a.revision and k.user_id=$1
  left join announcement_audience aud on aud.announcement_id=a.id and aud.user_id=$1
  left join practices p on p.id=a.practice_id and p.club_id=a.club_id
  left join meets m on m.id=a.meet_id and m.club_id=a.club_id`;

async function memberClub(a: Actor) {
  const clubId = await requireClubId(a);
  const member =
    await a.sql`select 1 from announcement_current_members where club_id=${clubId} and user_id=${a.userId}`;
  if (!member.length) throw new Error("Akun belum diundang. Hubungi admin.");
  return clubId;
}
async function postFor(a: Actor, id: number, lock = false): Promise<Row> {
  announcementIdSchema.parse({ id });
  const clubId = await memberClub(a);
  const rows = await a.sql.query<Row>(
    `${selectPost} where a.id=$2 and a.club_id=$3 ${lock ? "for update of a" : ""}`,
    [a.userId, id, clubId],
  );
  if (!rows[0]) throw new Error("Pengumuman tidak ditemukan");
  return rows[0];
}
function listItem(r: Row): AnnouncementListItem {
  return {
    id: r.id,
    title: r.title,
    important: r.important,
    dueOn: r.due_on,
    practiceId: r.practice_id,
    meetId: r.meet_id,
    createdAt: r.created_at,
    createdByName: r.created_by_name,
    unread: !r.read_at,
    revision: r.revision,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
    acknowledgedAt: r.acknowledged_at,
    needsAcknowledgement: r.important && r.in_audience && !r.acknowledged_at && !r.archived_at,
  };
}
async function validateLinks(
  a: Actor,
  clubId: number,
  d: { practiceId: number | null; meetId: number | null },
) {
  if (d.practiceId !== null) {
    const rows =
      await a.sql`select id from practices where id=${d.practiceId} and club_id=${clubId} for share`;
    if (!rows.length) throw new Error("Latihan terkait tidak ditemukan di klub ini");
  }
  if (d.meetId !== null) {
    const rows =
      await a.sql`select id from meets where id=${d.meetId} and club_id=${clubId} for share`;
    if (!rows.length) throw new Error("Kejuaraan terkait tidak ditemukan di klub ini");
  }
}
async function saveRevision(
  a: Actor,
  id: number,
  revision: number,
  d: z.output<typeof announcementContentSchema>,
  reason: string,
) {
  await a.sql`insert into announcement_revisions(announcement_id,revision,title,body,important,practice_id,meet_id,due_on,changed_by,change_note)
    values (${id},${revision},${d.title},${d.body},${d.important},${d.practiceId},${d.meetId},${d.dueOn},${a.userId},${reason})`;
}
function current(r: Row, revision: number) {
  if (r.archived_at) throw new Error("Pengumuman sudah diarsipkan");
  if (r.revision !== revision)
    throw new Error("Pengumuman berubah. Muat ulang dan baca revisi terbaru.");
}
async function editor(a: Actor, r: Row) {
  const hats = await hatsFor(a);
  if (
    !hats.staff ||
    (r.created_by !== a.userId && !["superadmin", "club_admin"].includes(hats.staff))
  )
    throw new Error("Hanya penulis atau admin klub yang boleh mengubah pengumuman");
}

export async function createAnnouncement(
  actor: Actor,
  input: AnnouncementContent,
): Promise<{ id: number }> {
  const d = announcementContentSchema.parse(input);
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    const clubId = await memberClub(a);
    if (!canPostAnnouncement(await hatsFor(a))) throw new Error("Tidak diizinkan");
    await validateLinks(a, clubId, d);
    const rows = await sql<{
      id: number;
    }>`insert into announcements(club_id,title,body,important,practice_id,meet_id,due_on,created_by)
      values (${clubId},${d.title},${d.body},${d.important},${d.practiceId},${d.meetId},${d.dueOn},${a.userId}) returning id`;
    const id = rows[0]!.id;
    // The insertion trigger captures the audience and first revision atomically,
    // including compatibility inserts from the previous application version.
    await sql`insert into announcement_reads(announcement_id,revision,user_id) values (${id},1,${a.userId})`;
    return { id };
  });
}
export async function listAnnouncements(actor: Actor): Promise<AnnouncementListItem[]> {
  const clubId = await memberClub(actor);
  const rows = await actor.sql.query<Row>(
    `${selectPost} where a.club_id=$2
    order by (a.archived_at is not null), (a.important and aud.user_id is not null and k.user_id is null) desc,
      (r.user_id is null) desc,a.important desc,a.updated_at desc,a.id desc`,
    [actor.userId, clubId],
  );
  return rows.map(listItem);
}
export async function getAnnouncement(actor: Actor, id: number): Promise<AnnouncementDetail> {
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    const r = await postFor(a, id, true);
    const opened = await sql<{
      read_at: string;
    }>`insert into announcement_reads(announcement_id,revision,user_id)
      values (${id},${r.revision},${a.userId}) on conflict (announcement_id,revision,user_id)
      do update set user_id=excluded.user_id returning read_at::text`;
    const hats = await hatsFor(a);
    let receipts: AnnouncementReceipts | null = null;
    if (hats.staff) {
      const readers = await sql<{
        label: string;
        read_at: string | null;
        acknowledged_at: string | null;
      }>`
        select m.label,rd.read_at::text,k.acknowledged_at::text from announcement_audience aud
        join announcement_current_members m on m.user_id=aud.user_id and m.club_id=${r.club_id}
        left join announcement_reads rd on rd.announcement_id=aud.announcement_id and rd.user_id=aud.user_id and rd.revision=${r.revision}
        left join announcement_acknowledgements k on k.announcement_id=aud.announcement_id and k.user_id=aud.user_id and k.revision=${r.revision}
        where aud.announcement_id=${id} order by m.label,m.user_id`;
      receipts = {
        expected: readers.length,
        opened: readers.filter((v) => v.read_at).length,
        acknowledged: readers.filter((v) => v.acknowledged_at).length,
        notOpened: readers.filter((v) => !v.read_at).map((v) => v.label),
        outstanding:
          r.important && !r.archived_at
            ? readers.filter((v) => !v.acknowledged_at).map((v) => v.label)
            : [],
      };
    }
    const revisions = await sql<{
      revision: number;
      title: string;
      body: string;
      important: boolean;
      due_on: string | null;
      practice_id: number | null;
      meet_id: number | null;
      change_note: string;
      changed_by_name: string;
      created_at: string;
      acknowledged_at: string | null;
    }>`
      select v.*,v.due_on::text,coalesce(u.name,'Staf') as changed_by_name,v.created_at::text,k.acknowledged_at::text
      from announcement_revisions v left join "user" u on u.id=v.changed_by
      left join announcement_acknowledgements k on k.announcement_id=v.announcement_id and k.revision=v.revision and k.user_id=${a.userId}
      where v.announcement_id=${id} order by v.revision desc`;
    return {
      ...listItem({ ...r, read_at: opened[0]!.read_at }),
      body: r.body,
      practiceTitle: r.practice_title,
      meetName: r.meet_name,
      receipts,
      openedAt: opened[0]!.read_at,
      canAcknowledge: r.important && r.in_audience && !r.archived_at && !r.acknowledged_at,
      inAudience: r.in_audience,
      canEdit:
        !!hats.staff &&
        (r.created_by === a.userId || ["superadmin", "club_admin"].includes(hats.staff)) &&
        !r.archived_at,
      archiveNote: r.archive_note,
      archivedByName: r.archived_by_name,
      audienceCapturedAt: r.audience_captured_at,
      audienceOrigin: r.audience_origin,
      revisions: revisions.map((v) => ({
        revision: v.revision,
        title: v.title,
        body: v.body,
        important: v.important,
        dueOn: v.due_on,
        practiceId: v.practice_id,
        meetId: v.meet_id,
        reason: v.change_note,
        changedByName: v.changed_by_name,
        createdAt: v.created_at,
        acknowledgedAt: v.acknowledged_at,
      })),
    };
  });
}
export async function acknowledgeAnnouncement(
  actor: Actor,
  input: z.input<typeof announcementActionSchema>,
) {
  const d = announcementActionSchema.parse(input);
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    const r = await postFor(a, d.id, true);
    current(r, d.expectedRevision);
    if (!r.important || !r.in_audience)
      throw new Error("Anda tidak termasuk penerima yang diminta konfirmasi");
    if (!r.read_at) throw new Error("Buka dan baca revisi ini sebelum memberi konfirmasi");
    const rows = await sql<{
      acknowledged_at: string;
    }>`insert into announcement_acknowledgements(announcement_id,revision,user_id)
      values (${r.id},${r.revision},${a.userId}) on conflict (announcement_id,revision,user_id)
      do update set user_id=excluded.user_id returning acknowledged_at::text`;
    return { acknowledgedAt: rows[0]!.acknowledged_at, revision: r.revision };
  });
}
export async function editAnnouncement(
  actor: Actor,
  input: z.input<typeof editAnnouncementSchema>,
) {
  const d = editAnnouncementSchema.parse(input);
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    const r = await postFor(a, d.id, true);
    await editor(a, r);
    current(r, d.expectedRevision);
    await validateLinks(a, r.club_id, d);
    if (
      r.title === d.title &&
      r.body === d.body &&
      r.important === d.important &&
      r.practice_id === d.practiceId &&
      r.meet_id === d.meetId &&
      r.due_on === d.dueOn
    )
      throw new Error("Belum ada perubahan isi pengumuman");
    const revision = r.revision + 1;
    await sql`update announcements set title=${d.title},body=${d.body},important=${d.important},practice_id=${d.practiceId},meet_id=${d.meetId},due_on=${d.dueOn},revision=${revision},updated_at=now() where id=${r.id}`;
    await saveRevision(a, r.id, revision, d, d.reason);
    await sql`insert into announcement_reads(announcement_id,revision,user_id) values (${r.id},${revision},${a.userId})`;
    return { id: r.id, revision };
  });
}
export async function archiveAnnouncement(
  actor: Actor,
  input: z.input<typeof archiveAnnouncementSchema>,
) {
  const d = archiveAnnouncementSchema.parse(input);
  return actor.sql.transaction(async (sql) => {
    const a = { ...actor, sql };
    const r = await postFor(a, d.id, true);
    await editor(a, r);
    current(r, d.expectedRevision);
    await sql`update announcements set archived_at=now(),archived_by=${a.userId},archive_note=${d.reason} where id=${r.id}`;
    return { id: r.id };
  });
}

/** Staff-only selection endpoint: callers never receive another club's resource titles. */
export async function announcementContexts(actor: Actor) {
  const clubId = await memberClub(actor);
  if (!canPostAnnouncement(await hatsFor(actor))) throw new Error("Tidak diizinkan");
  const practices = await actor.sql<{
    id: number;
    title: string;
    session_date: string;
    location: string | null;
    start_time: string | null;
    status: string;
    cancel_reason: string | null;
  }>`
    select id,title,session_date::text,location,start_time::text,status,cancel_reason from practices where club_id=${clubId} order by session_date desc,id desc`;
  const meets = await actor.sql<{
    id: number;
    name: string;
    start_date: string;
    status: string;
  }>`select id,name,start_date::text,status from meets where club_id=${clubId} order by start_date desc,id desc`;
  return { practices, meets };
}
