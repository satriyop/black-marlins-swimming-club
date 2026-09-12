import { expect, test } from "vitest";
import {
  createAnnouncement,
  getAnnouncement,
  listAnnouncements,
} from "../src/lib/club/announcements";
import { getDashboardData } from "../src/lib/club/dashboard";
import { RATIH_ID, SATRIYO_ID, seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

async function linkLuigiAccount(h: Awaited<ReturnType<typeof createClubHarness>>) {
  const kids = await h.sql<{ id: number; full_name: string }>`select id, full_name from swimmers`;
  const luigi = kids.find((s) => s.full_name.startsWith("Luigi"))!;
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_luigi', 'Luigi', 'luigi@example.com', true, now(), now())
  `;
  await h.sql`update swimmers set user_id = 'usr_luigi' where id = ${luigi.id}`;
  return luigi;
}

test("wali cannot post; staff can", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await expect(
    createAnnouncement(h.actor(RATIH_ID), { title: "Pindah kolam", body: "Sabtu di Tirta." }),
  ).rejects.toThrow(/Tidak diizinkan/);
  const post = await createAnnouncement(h.actor(SATRIYO_ID), {
    title: "Pindah kolam",
    body: "Sabtu di Tirta Kamandanu, 06.30.",
    important: true,
  });
  expect(post.id).toBeGreaterThan(0);
});

test("list shows title without marking read; open marks read", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const post = await createAnnouncement(h.actor(SATRIYO_ID), {
    title: "Pindah kolam",
    body: "Isi lengkap hanya di detail.",
    important: true,
  });
  const listed = await listAnnouncements(h.actor(RATIH_ID));
  expect(listed).toHaveLength(1);
  expect(listed[0]?.title).toBe("Pindah kolam");
  expect(listed[0]?.unread).toBe(true);
  expect(listed[0]).not.toHaveProperty("body");

  const opened = await getAnnouncement(h.actor(RATIH_ID), post.id);
  expect(opened.body).toContain("Isi lengkap");
  expect(opened.unread).toBe(false);

  const after = await listAnnouncements(h.actor(RATIH_ID));
  expect(after[0]?.unread).toBe(false);
});

test("perenang sees posts and is marked read only after open", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await linkLuigiAccount(h);
  const post = await createAnnouncement(h.actor(SATRIYO_ID), {
    title: "Pemusatan",
    body: "Bawa topi cadangan.",
  });
  const listed = await listAnnouncements(h.actor("usr_luigi"));
  expect(listed[0]?.unread).toBe(true);
  await getAnnouncement(h.actor("usr_luigi"), post.id);
  const after = await listAnnouncements(h.actor("usr_luigi"));
  expect(after[0]?.unread).toBe(false);
});

test("author is already read; receipts count wali and perenang", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  await linkLuigiAccount(h);
  const post = await createAnnouncement(h.actor(SATRIYO_ID), {
    title: "Tes",
    body: "Halo.",
    important: true,
  });
  const asAuthor = await listAnnouncements(h.actor(SATRIYO_ID));
  expect(asAuthor[0]?.unread).toBe(false);

  const before = await getAnnouncement(h.actor(SATRIYO_ID), post.id);
  expect(before.receipts).toBeTruthy();
  expect(before.receipts?.expected).toBeGreaterThanOrEqual(3);
  expect(before.receipts?.read).toBe(1);
  expect(before.receipts?.outstanding.some((n) => n.includes("Ratih"))).toBe(true);
  expect(before.receipts?.outstanding.some((n) => n.includes("Luigi"))).toBe(true);

  await getAnnouncement(h.actor(RATIH_ID), post.id);
  await getAnnouncement(h.actor("usr_luigi"), post.id);
  const after = await getAnnouncement(h.actor(SATRIYO_ID), post.id);
  expect(after.receipts?.outstanding.some((n) => n.includes("Ratih"))).toBe(false);
  expect(after.receipts?.outstanding.some((n) => n.includes("Luigi"))).toBe(false);
});

test("uninvited user cannot list or open", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const post = await createAnnouncement(h.actor(SATRIYO_ID), { title: "Rahasia", body: "Jangan bocor." });
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_asing', 'Asing', 'asing@example.com', true, now(), now())
  `;
  await expect(listAnnouncements(h.actor("usr_asing"))).rejects.toThrow(/belum diundang/i);
  await expect(getAnnouncement(h.actor("usr_asing"), post.id)).rejects.toThrow(/belum diundang/i);
});

test("Hari Ini unread count is the full total, not the capped list", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  for (let i = 0; i < 9; i += 1) {
    await createAnnouncement(h.actor(SATRIYO_ID), {
      title: `Pos ${i}`,
      body: `Isi ${i}`,
    });
  }
  const dash = await getDashboardData(h.actor(RATIH_ID));
  expect(dash.unreadCount).toBe(9);
  expect(dash.unreadAnnouncements).toHaveLength(8);
});

test("missing announcement looks like not found and does not leak the title", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  try {
    await getAnnouncement(h.actor(RATIH_ID), 99999);
    throw new Error("expected missing");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    expect(message).toBe("Pengumuman tidak ditemukan");
    expect(message).not.toContain("Rahasia");
  }
});
