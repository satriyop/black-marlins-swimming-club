import { expect, test } from "vitest";
import { createClubHarness } from "./harness";
import {
  createAnnouncement,
  getAnnouncement,
  listAnnouncements,
  acknowledgeAnnouncement,
  editAnnouncement,
  archiveAnnouncement,
  announcementContexts,
} from "../src/lib/club/announcements";
import { getDashboardData } from "../src/lib/club/dashboard";

async function fixture() {
  const h = await createClubHarness();
  const clubs = await h.sql<{
    id: number;
  }>`insert into clubs(name,short_name,city,province,coach_name) values ('Klub Uji','UJI','Klaten','Jateng','Pelatih'),('Klub Lain','LAIN','Solo','Jateng','Pelatih Lain') returning id`;
  const clubId = clubs[0]!.id,
    otherClub = clubs[1]!.id;
  for (const user of ["author", "coach", "admin", "parent", "late", "outsider"])
    await h.sql`insert into "user"(id,name,email,"emailVerified") values (${user},${user},${`${user}@example.test`},true)`;
  await h.sql`insert into club_staff(club_id,user_id,role) values (${clubId},'author','coach'),(${clubId},'coach','coach'),(${clubId},'admin','club_admin'),(${otherClub},'outsider','club_admin')`;
  await h.sql`insert into club_family(club_id,user_id) values (${clubId},'parent')`;
  const p = await h.sql<{
    id: number;
  }>`insert into practices(club_id,session_date,title,kind) values (${clubId},'2099-12-01','Latihan Uji','renang'),(${otherClub},'2099-12-01','Latihan Rahasia','renang') returning id`;
  const m = await h.sql<{
    id: number;
  }>`insert into meets(club_id,name,level,course,start_date) values (${clubId},'Kejuaraan Uji','klub','50','2099-12-01'),(${otherClub},'Kejuaraan Rahasia','klub','50','2099-12-01') returning id`;
  const content = {
    title: "Perubahan jadwal",
    body: "Mulai jam 16.00.",
    important: true,
    practiceId: p[0]!.id,
    meetId: m[0]!.id,
  };
  const post = await createAnnouncement(h.actor("author"), content);
  return {
    ...h,
    clubId,
    otherClub,
    content,
    id: post.id,
    otherPractice: p[1]!.id,
    otherMeet: m[1]!.id,
  };
}

test("opening never acknowledges; explicit acknowledgement is revision-specific and idempotent", async () => {
  const f = await fixture();
  const opened = await getAnnouncement(f.actor("parent"), f.id);
  expect(opened.openedAt).toBeTruthy();
  expect(opened.acknowledgedAt).toBeNull();
  expect(opened.canAcknowledge).toBe(true);
  let staff = await getAnnouncement(f.actor("author"), f.id);
  expect(staff.receipts?.opened).toBe(2);
  expect(staff.receipts?.acknowledged).toBe(0);
  expect(staff.receipts?.outstanding).toContain("parent");
  const first = await acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 1 });
  const retry = await acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 1 });
  expect(retry).toEqual(first);
  const rows =
    await f.sql`select * from announcement_acknowledgements where announcement_id=${f.id}`;
  expect(rows).toHaveLength(1);
  staff = await getAnnouncement(f.actor("author"), f.id);
  expect(staff.receipts?.acknowledged).toBe(1);
  expect(staff.receipts?.outstanding).not.toContain("parent");
});

test("correction requires a reason and re-acknowledgement while preserving old text and evidence", async () => {
  const f = await fixture();
  await getAnnouncement(f.actor("parent"), f.id);
  const first = await acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 1 });
  await expect(
    editAnnouncement(f.actor("author"), {
      ...f.content,
      id: f.id,
      expectedRevision: 1,
      body: "Jam 17.00.",
      reason: "",
    }),
  ).rejects.toThrow();
  await editAnnouncement(f.actor("author"), {
    ...f.content,
    id: f.id,
    expectedRevision: 1,
    body: "Mulai jam 17.00.",
    reason: "Kolam tersedia lebih lambat",
  });
  const listed = await listAnnouncements(f.actor("parent"));
  expect(listed[0]?.unread).toBe(true);
  expect(listed[0]?.needsAcknowledgement).toBe(true);
  await expect(
    acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 1 }),
  ).rejects.toThrow(/berubah/);
  await expect(
    acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 2 }),
  ).rejects.toThrow(/Buka/);
  const current = await getAnnouncement(f.actor("parent"), f.id);
  expect(current.revision).toBe(2);
  expect(current.acknowledgedAt).toBeNull();
  expect(current.revisions[1]?.body).toBe(f.content.body);
  expect(current.revisions[1]?.acknowledgedAt).toBe(first.acknowledgedAt);
  await acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 2 });
  expect(
    (await f.sql`select * from announcement_acknowledgements where announcement_id=${f.id}`).length,
  ).toBe(2);
});

test("author or admin can correct and archive; other coaches and recipients cannot", async () => {
  const f = await fixture();
  for (const user of ["coach", "parent"]) {
    expect((await getAnnouncement(f.actor(user), f.id)).canEdit).toBe(false);
    await expect(
      editAnnouncement(f.actor(user), {
        ...f.content,
        id: f.id,
        expectedRevision: 1,
        body: "Ubah",
        reason: "Alasan",
      }),
    ).rejects.toThrow(/penulis atau admin/);
    await expect(
      archiveAnnouncement(f.actor(user), { id: f.id, expectedRevision: 1, reason: "Alasan" }),
    ).rejects.toThrow(/penulis atau admin/);
  }
  await editAnnouncement(f.actor("admin"), {
    ...f.content,
    id: f.id,
    expectedRevision: 1,
    title: "Judul dikoreksi",
    reason: "Koreksi admin",
  });
  await archiveAnnouncement(f.actor("admin"), {
    id: f.id,
    expectedRevision: 2,
    reason: "Jadwal sudah lewat",
  });
  const post = await getAnnouncement(f.actor("parent"), f.id);
  expect(post.archivedAt).toBeTruthy();
  expect(post.archiveNote).toBe("Jadwal sudah lewat");
  expect(post.canAcknowledge).toBe(false);
  expect(post.canEdit).toBe(false);
  expect(post.receipts).toBeNull();
  await expect(
    acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 2 }),
  ).rejects.toThrow(/diarsipkan/);
  await expect(
    editAnnouncement(f.actor("author"), {
      ...f.content,
      id: f.id,
      expectedRevision: 2,
      title: "Ubah lagi",
      reason: "Koreksi",
    }),
  ).rejects.toThrow(/diarsipkan/);
  const staff = await getAnnouncement(f.actor("author"), f.id);
  expect(staff.receipts?.outstanding).toEqual([]);
  expect((await getDashboardData(f.actor("parent"))).pendingAcknowledgementCount).toBe(0);
});

test("new members can read but do not become historical nonresponders, even after revision", async () => {
  const f = await fixture();
  const initial = (await getAnnouncement(f.actor("author"), f.id)).receipts!.expected;
  await f.sql`insert into club_family(club_id,user_id) values (${f.clubId},'late')`;
  const late = await getAnnouncement(f.actor("late"), f.id);
  expect(late.inAudience).toBe(false);
  expect(late.canAcknowledge).toBe(false);
  await expect(
    acknowledgeAnnouncement(f.actor("late"), { id: f.id, expectedRevision: 1 }),
  ).rejects.toThrow(/penerima/);
  await editAnnouncement(f.actor("author"), {
    ...f.content,
    id: f.id,
    expectedRevision: 1,
    body: "Isi baru",
    reason: "Perubahan",
  });
  const staff = await getAnnouncement(f.actor("author"), f.id);
  expect(staff.receipts?.expected).toBe(initial);
  expect(staff.receipts?.outstanding).not.toContain("late");
  expect((await getDashboardData(f.actor("late"))).pendingAcknowledgementCount).toBe(0);
});

test("revoked access removes pending tasks without erasing audience, opens or acknowledgements", async () => {
  const f = await fixture();
  await getAnnouncement(f.actor("parent"), f.id);
  await acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 1 });
  await editAnnouncement(f.actor("author"), {
    ...f.content,
    id: f.id,
    expectedRevision: 1,
    body: "Isi baru",
    reason: "Perubahan",
  });
  await f.sql`delete from club_family where user_id='parent'`;
  await expect(getAnnouncement(f.actor("parent"), f.id)).rejects.toThrow(/belum diundang/);
  await expect(
    acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 2 }),
  ).rejects.toThrow(/belum diundang/);
  const staff = await getAnnouncement(f.actor("author"), f.id);
  expect(staff.receipts?.expected).toBe(3);
  expect(staff.receipts?.outstanding).not.toContain("parent");
  expect(
    await f.sql`select user_id from announcement_audience where announcement_id=${f.id} and user_id='parent'`,
  ).toHaveLength(1);
  expect(
    await f.sql`select user_id from announcement_acknowledgements where announcement_id=${f.id} and user_id='parent'`,
  ).toHaveLength(1);
});

test("dual-role members are counted once and retain eligibility through another active membership", async () => {
  const f = await fixture();
  await f.sql`insert into club_family(club_id,user_id) values (${f.clubId},'author')`;
  const post = await createAnnouncement(f.actor("author"), f.content);
  expect((await getAnnouncement(f.actor("author"), post.id)).receipts?.expected).toBe(4);
  await f.sql`delete from club_staff where user_id='author'`;
  const author = await getAnnouncement(f.actor("author"), post.id);
  expect(author.canEdit).toBe(false);
  expect(author.canAcknowledge).toBe(true);
  expect(author.receipts).toBeNull();
  await acknowledgeAnnouncement(f.actor("author"), { id: post.id, expectedRevision: 1 });
});

test("wrong-club links are rejected on create and correction without partial effects", async () => {
  const f = await fixture();
  await expect(
    createAnnouncement(f.actor("author"), { ...f.content, practiceId: f.otherPractice }),
  ).rejects.toThrow(/Latihan terkait/);
  await expect(
    createAnnouncement(f.actor("author"), { ...f.content, meetId: f.otherMeet }),
  ).rejects.toThrow(/Kejuaraan terkait/);
  await expect(
    editAnnouncement(f.actor("author"), {
      ...f.content,
      id: f.id,
      expectedRevision: 1,
      meetId: f.otherMeet,
      reason: "Ganti",
    }),
  ).rejects.toThrow(/Kejuaraan terkait/);
  const current = await getAnnouncement(f.actor("parent"), f.id);
  expect(current.revision).toBe(1);
  expect(current.meetName).toBe("Kejuaraan Uji");
  expect(await f.sql`select id from announcements where club_id=${f.clubId}`).toHaveLength(1);
  const options = await announcementContexts(f.actor("author"));
  expect(JSON.stringify(options)).not.toContain("Rahasia");
  await expect(announcementContexts(f.actor("parent"))).rejects.toThrow(/diizinkan/);
});

test("cross-club viewers cannot read, acknowledge, correct, archive or inspect recipient data", async () => {
  const f = await fixture();
  expect(await listAnnouncements(f.actor("outsider"))).toHaveLength(0);
  await expect(getAnnouncement(f.actor("outsider"), f.id)).rejects.toThrow(/tidak ditemukan/);
  await expect(
    acknowledgeAnnouncement(f.actor("outsider"), { id: f.id, expectedRevision: 1 }),
  ).rejects.toThrow(/tidak ditemukan/);
  await expect(
    editAnnouncement(f.actor("outsider"), {
      ...f.content,
      id: f.id,
      expectedRevision: 1,
      body: "Bocor",
      reason: "Tidak",
    }),
  ).rejects.toThrow(/tidak ditemukan/);
  await expect(
    archiveAnnouncement(f.actor("outsider"), { id: f.id, expectedRevision: 1, reason: "Tidak" }),
  ).rejects.toThrow(/tidak ditemukan/);
  const family = await getAnnouncement(f.actor("parent"), f.id);
  expect(family.receipts).toBeNull();
  expect(JSON.stringify(family)).not.toContain('"outstanding"');
  expect(JSON.stringify(family)).not.toContain('"coach"');
});

test("stale corrections and archives cannot overwrite newer content or reset evidence", async () => {
  const f = await fixture();
  await editAnnouncement(f.actor("author"), {
    ...f.content,
    id: f.id,
    expectedRevision: 1,
    body: "Terbaru",
    reason: "Koreksi",
  });
  await expect(
    editAnnouncement(f.actor("admin"), {
      ...f.content,
      id: f.id,
      expectedRevision: 1,
      body: "Lama",
      reason: "Stale",
    }),
  ).rejects.toThrow(/berubah/);
  await expect(
    archiveAnnouncement(f.actor("author"), { id: f.id, expectedRevision: 1, reason: "Stale" }),
  ).rejects.toThrow(/berubah/);
  const current = await getAnnouncement(f.actor("parent"), f.id);
  expect(current.body).toBe("Terbaru");
  expect(current.revisions).toHaveLength(2);
  await expect(
    editAnnouncement(f.actor("author"), {
      ...f.content,
      id: f.id,
      expectedRevision: 2,
      body: "Terbaru",
      reason: "Tidak berubah",
    }),
  ).rejects.toThrow(/Belum ada/);
});

test("dashboard distinguishes unopened notices and pending acknowledgements", async () => {
  const f = await fixture();
  let dash = await getDashboardData(f.actor("parent"));
  expect(dash.unreadCount).toBe(1);
  expect(dash.pendingAcknowledgementCount).toBe(1);
  await getAnnouncement(f.actor("parent"), f.id);
  dash = await getDashboardData(f.actor("parent"));
  expect(dash.unreadCount).toBe(0);
  expect(dash.pendingAcknowledgements[0]?.id).toBe(f.id);
  await acknowledgeAnnouncement(f.actor("parent"), { id: f.id, expectedRevision: 1 });
  expect((await getDashboardData(f.actor("parent"))).pendingAcknowledgementCount).toBe(0);
  await editAnnouncement(f.actor("author"), {
    ...f.content,
    id: f.id,
    expectedRevision: 1,
    important: false,
    reason: "Informasi biasa",
  });
  dash = await getDashboardData(f.actor("parent"));
  expect(dash.unreadCount).toBe(1);
  expect(dash.pendingAcknowledgementCount).toBe(0);
  await archiveAnnouncement(f.actor("author"), {
    id: f.id,
    expectedRevision: 2,
    reason: "Selesai",
  });
  expect((await getDashboardData(f.actor("parent"))).unreadCount).toBe(0);
});

test("all published content fields make a new revision and ordinary notices cannot be acknowledged", async () => {
  const f = await fixture();
  await editAnnouncement(f.actor("author"), {
    ...f.content,
    id: f.id,
    expectedRevision: 1,
    dueOn: "2099-11-30",
    reason: "Tenggat baru",
  });
  await editAnnouncement(f.actor("author"), {
    ...f.content,
    id: f.id,
    expectedRevision: 2,
    practiceId: null,
    dueOn: "2099-11-30",
    reason: "Tautan dikoreksi",
  });
  const ordinary = await createAnnouncement(f.actor("author"), {
    title: "Biasa",
    body: "Informasi",
    important: false,
  });
  await getAnnouncement(f.actor("parent"), ordinary.id);
  await expect(
    acknowledgeAnnouncement(f.actor("parent"), { id: ordinary.id, expectedRevision: 1 }),
  ).rejects.toThrow(/penerima/);
  expect((await getAnnouncement(f.actor("author"), f.id)).revisions).toHaveLength(3);
});
