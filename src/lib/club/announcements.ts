import type { Actor } from "./actor";
import { isInvited } from "./access";
import { hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canPostAnnouncement } from "./permissions";

export type AnnouncementListItem = {
  id: number;
  title: string;
  important: boolean;
  dueOn: string | null;
  practiceId: number | null;
  meetId: number | null;
  createdAt: string;
  createdByName: string;
  unread: boolean;
};

export type AnnouncementReceipts = {
  expected: number;
  read: number;
  outstanding: string[];
};

export type AnnouncementDetail = AnnouncementListItem & {
  body: string;
  practiceTitle: string | null;
  meetName: string | null;
  receipts: AnnouncementReceipts | null;
};

type Row = {
  id: number;
  title: string;
  important: boolean;
  due_on: string | null;
  practice_id: number | null;
  meet_id: number | null;
  created_at: string;
  created_by_name: string;
  unread: boolean;
};

async function requireInvitedClub(actor: Actor): Promise<number> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Akun belum diundang. Hubungi admin.");
  const hats = await hatsFor(actor);
  if (!isInvited(hats)) throw new Error("Akun belum diundang. Hubungi admin.");
  return clubId;
}

function mapList(row: Row): AnnouncementListItem {
  return {
    id: row.id,
    title: row.title,
    important: row.important,
    dueOn: row.due_on,
    practiceId: row.practice_id,
    meetId: row.meet_id,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    unread: row.unread,
  };
}

export async function createAnnouncement(
  actor: Actor,
  input: {
    title: string;
    body: string;
    important?: boolean;
    practiceId?: number | null;
    meetId?: number | null;
    dueOn?: string | null;
  },
): Promise<{ id: number }> {
  const clubId = await requireInvitedClub(actor);
  const hats = await hatsFor(actor);
  if (!canPostAnnouncement(hats)) throw new Error("Tidak diizinkan");
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Judul wajib diisi");
  if (!body) throw new Error("Isi wajib diisi");
  const rows = await actor.sql<{ id: number }>`
    insert into announcements (club_id, title, body, important, practice_id, meet_id, due_on, created_by)
    values (
      ${clubId},
      ${title},
      ${body},
      ${input.important ?? false},
      ${input.practiceId ?? null},
      ${input.meetId ?? null},
      ${input.dueOn || null},
      ${actor.userId}
    )
    returning id
  `;
  const id = rows[0]!.id;
  await actor.sql`
    insert into announcement_reads (announcement_id, user_id)
    values (${id}, ${actor.userId})
    on conflict do nothing
  `;
  return { id };
}

export async function listAnnouncements(actor: Actor): Promise<AnnouncementListItem[]> {
  const clubId = await requireInvitedClub(actor);
  const rows = await actor.sql<Row>`
    select
      a.id,
      a.title,
      a.important,
      a.due_on::text as due_on,
      a.practice_id,
      a.meet_id,
      a.created_at::text as created_at,
      coalesce(u.name, 'Staf') as created_by_name,
      (r.user_id is null) as unread
    from announcements a
    left join "user" u on u.id = a.created_by
    left join announcement_reads r
      on r.announcement_id = a.id and r.user_id = ${actor.userId}
    where a.club_id = ${clubId}
    order by (r.user_id is null) desc, a.important desc, a.created_at desc
  `;
  return rows.map(mapList);
}

async function expectedReaders(
  actor: Actor,
  clubId: number,
): Promise<{ userId: string; label: string }[]> {
  const rows = await actor.sql<{ user_id: string; label: string }>`
    select distinct on (x.user_id) x.user_id, x.label
    from (
      select g.user_id, coalesce(u.name, u.email, 'Wali') as label
      from guardians g
      join swimmers s on s.id = g.swimmer_id
      join "user" u on u.id = g.user_id
      where s.club_id = ${clubId}
      union all
      select s.user_id, s.full_name as label
      from swimmers s
      where s.club_id = ${clubId} and s.user_id is not null
    ) x
    order by x.user_id, x.label
  `;
  return rows.map((r) => ({ userId: r.user_id, label: r.label }));
}

export async function getAnnouncement(actor: Actor, id: number): Promise<AnnouncementDetail> {
  const clubId = await requireInvitedClub(actor);
  const rows = await actor.sql<
    Row & { body: string; practice_title: string | null; meet_name: string | null }
  >`
    select
      a.id,
      a.title,
      a.body,
      a.important,
      a.due_on::text as due_on,
      a.practice_id,
      a.meet_id,
      a.created_at::text as created_at,
      coalesce(u.name, 'Staf') as created_by_name,
      (r.user_id is null) as unread,
      p.title as practice_title,
      m.name as meet_name
    from announcements a
    left join "user" u on u.id = a.created_by
    left join announcement_reads r
      on r.announcement_id = a.id and r.user_id = ${actor.userId}
    left join practices p on p.id = a.practice_id
    left join meets m on m.id = a.meet_id
    where a.id = ${id} and a.club_id = ${clubId}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Pengumuman tidak ditemukan");

  await actor.sql`
    insert into announcement_reads (announcement_id, user_id)
    values (${id}, ${actor.userId})
    on conflict do nothing
  `;

  const hats = await hatsFor(actor);
  let receipts: AnnouncementReceipts | null = null;
  if (hats.staff != null) {
    const expected = await expectedReaders(actor, clubId);
    const readRows = await actor.sql<{ user_id: string }>`
      select user_id from announcement_reads where announcement_id = ${id}
    `;
    const readIds = new Set(readRows.map((r) => r.user_id));
    const outstanding = expected.filter((e) => !readIds.has(e.userId)).map((e) => e.label);
    receipts = {
      expected: expected.length,
      read: expected.filter((e) => readIds.has(e.userId)).length,
      outstanding,
    };
  }

  return {
    ...mapList({ ...row, unread: false }),
    body: row.body,
    practiceTitle: row.practice_title,
    meetName: row.meet_name,
    receipts,
  };
}
