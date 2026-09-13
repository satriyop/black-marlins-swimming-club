import { expect, test } from "vitest";
import { createClubHarness } from "./harness";
import {
  openRegistration,
  proposeEntry,
  respondRegistration,
  decideEntry,
  lockRegistration,
  reopenRegistration,
  exportRegistration,
  loadRegistration,
} from "../src/lib/club/registration";
import { saveMeetEntry, deleteEntry, deleteMeet, saveMeetRecord } from "../src/lib/club/writes";
import { getDashboardData } from "../src/lib/club/dashboard";

async function fixture() {
  const h = await createClubHarness();
  const clubs = await h.sql<{
    id: number;
  }>`insert into clubs(name,short_name,city,province,coach_name) values ('Klub Uji','UJI','Klaten','Jateng','Pelatih') returning id`;
  const clubId = clubs[0]!.id;
  for (const user of ["coach", "parent", "other"])
    await h.sql`insert into "user"(id,name,email,"emailVerified") values (${user},${user},${`${user}@example.test`},true)`;
  await h.sql`insert into club_staff(club_id,user_id,role) values (${clubId},'coach','coach')`;
  await h.sql`insert into club_family(club_id,user_id) values (${clubId},'parent'),(${clubId},'other')`;
  const kids = await h.sql<{
    id: number;
  }>`insert into swimmers(club_id,full_name,date_of_birth,gender) values (${clubId},'Anak Uji','2014-01-01','putra'),(${clubId},'Anak Rahasia','2013-01-01','putri') returning id`;
  const child = kids[0]!.id,
    other = kids[1]!.id;
  await h.sql`insert into guardians(user_id,swimmer_id) values ('parent',${child}),('other',${other})`;
  const meet = await saveMeetRecord(h.actor("coach"), {
    name: "Kejuaraan Uji",
    level: "klub",
    course: "50",
    startDate: "2099-12-30",
    endDate: "2099-12-31",
    status: "rencana",
  });
  const base = async () => ({
    meetId: meet.id,
    expectedRevision: (await loadRegistration(h.actor("coach"), meet.id)).revision,
  });
  const open = () =>
    openRegistration(h.actor("coach"), {
      meetId: meet.id,
      expectedRevision: 1,
      deadline: "2099-12-29T17:00:00Z",
      swimmers: [
        { swimmerId: child, groupName: "Kelompok A" },
        { swimmerId: other, groupName: "Kelompok B" },
      ],
      events: [
        { stroke: "bebas", distanceM: 50 },
        { stroke: "dada", distanceM: 100 },
      ],
    });
  const propose = async () =>
    proposeEntry(h.actor("coach"), {
      ...(await base()),
      swimmerId: child,
      stroke: "bebas",
      distanceM: 50,
    });
  const yes = async () =>
    respondRegistration(h.actor("parent"), {
      ...(await base()),
      swimmerId: child,
      response: "yes",
    });
  const state = async (id: number) =>
    (
      await h.sql<{
        registration_status: string;
        status: string;
      }>`select registration_status,status from meet_entries where id=${id}`
    )[0]!;
  return { ...h, clubId, child, other, meetId: meet.id, base, open, propose, yes, state };
}

test("proposal, guardian response, approval, locked export, submission and confirmation are distinct", async () => {
  const f = await fixture();
  await f.open();
  const e = await f.propose();
  expect((await f.state(e.id)).registration_status).toBe("proposed");
  await expect(
    decideEntry(f.actor("coach"), { ...(await f.base()), entryId: e.id, action: "approve" }),
  ).rejects.toThrow(/Status/);
  await f.yes();
  await decideEntry(f.actor("coach"), { ...(await f.base()), entryId: e.id, action: "approve" });
  await expect(exportRegistration(f.actor("coach"), await f.base())).rejects.toThrow(/Kunci/);
  await lockRegistration(f.actor("coach"), await f.base());
  const csv = await exportRegistration(f.actor("coach"), await f.base());
  expect(csv.csv).toContain('"Klub Uji","Anak Uji","Kelompok A"');
  expect(csv.csv).not.toContain("Anak Rahasia");
  expect((await f.state(e.id)).registration_status).toBe("approved");
  await decideEntry(f.actor("coach"), {
    ...(await f.base()),
    entryId: e.id,
    action: "submit",
    note: "Dikirim manual 29 Des, ref A",
  });
  expect((await f.state(e.id)).registration_status).toBe("submitted");
  await decideEntry(f.actor("coach"), {
    ...(await f.base()),
    entryId: e.id,
    action: "confirm",
    note: "Panitia mengonfirmasi, ref B",
  });
  expect(await f.state(e.id)).toEqual({ registration_status: "confirmed", status: "terdaftar" });
  const history = (await loadRegistration(f.actor("parent"), f.meetId)).history;
  expect(
    history.some(
      (h) =>
        h.action === "Konfirmasi panitia dicatat" &&
        h.actorName === "coach" &&
        h.note?.includes("ref B"),
    ),
  ).toBe(true);
});

test("guardian proposals and corrections require eligibility, consent and allowed events", async () => {
  const f = await fixture();
  await f.open();
  await expect(
    proposeEntry(f.actor("parent"), {
      ...(await f.base()),
      swimmerId: f.child,
      stroke: "bebas",
      distanceM: 50,
    }),
  ).rejects.toThrow(/Konfirmasikan/);
  await f.yes();
  const e = await saveMeetEntry(f.actor("parent"), {
    ...(await f.base()),
    swimmerId: f.child,
    stroke: "bebas",
    distanceM: 50,
    seedTimeMs: 38000,
  });
  expect((await f.state(e.id)).registration_status).toBe("requested");
  await decideEntry(f.actor("coach"), { ...(await f.base()), entryId: e.id, action: "approve" });
  await proposeEntry(f.actor("parent"), {
    ...(await f.base()),
    entryId: e.id,
    swimmerId: f.child,
    stroke: "dada",
    distanceM: 100,
  });
  expect((await f.state(e.id)).registration_status).toBe("requested");
  await expect(
    proposeEntry(f.actor("parent"), {
      ...(await f.base()),
      swimmerId: f.child,
      stroke: "bebas",
      distanceM: 200,
    }),
  ).rejects.toThrow(/tidak tersedia/);
  await expect(
    proposeEntry(f.actor("parent"), {
      ...(await f.base()),
      swimmerId: f.child,
      stroke: "bebas",
      distanceM: 50,
      seedTimeMs: -1,
    }),
  ).rejects.toThrow();
});

test("no, withdrawal, rejection reasons and explicit resubmission preserve history", async () => {
  const f = await fixture();
  await f.open();
  const e = await f.propose();
  await expect(
    respondRegistration(f.actor("parent"), {
      ...(await f.base()),
      swimmerId: f.child,
      response: "no",
    }),
  ).rejects.toThrow(/Alasan/);
  await respondRegistration(f.actor("parent"), {
    ...(await f.base()),
    swimmerId: f.child,
    response: "no",
    reason: "Bentrok jadwal",
  });
  expect((await f.state(e.id)).registration_status).toBe("declined");
  await f.yes();
  await decideEntry(f.actor("coach"), {
    ...(await f.base()),
    entryId: e.id,
    action: "reject",
    note: "Nomor terlalu berat",
  });
  expect((await f.state(e.id)).registration_status).toBe("rejected");
  await proposeEntry(f.actor("parent"), {
    ...(await f.base()),
    entryId: e.id,
    swimmerId: f.child,
    stroke: "dada",
    distanceM: 100,
  });
  await respondRegistration(f.actor("parent"), {
    ...(await f.base()),
    swimmerId: f.child,
    response: "withdrawn",
    reason: "Sakit",
  });
  expect((await f.state(e.id)).registration_status).toBe("withdrawn");
  const view = await loadRegistration(f.actor("parent"), f.meetId);
  expect(view.candidates[0]?.reason).toBe("Sakit");
  expect(view.history.some((h) => h.note === "Nomor terlalu berat")).toBe(true);
  await expect(deleteEntry(f.actor("parent"), e.id)).rejects.toThrow(/tarik/);
  await expect(deleteMeet(f.actor("coach"), f.meetId)).rejects.toThrow(/riwayat/);
});

test("deadline blocks every family mutation; staff can review then explicitly reopen", async () => {
  const f = await fixture();
  await f.open();
  const e = await f.propose();
  await f.yes();
  await f.sql`update meets set registration_deadline=now()-interval '1 second' where id=${f.meetId}`;
  await expect(f.yes()).rejects.toThrow(/tenggat/);
  await expect(
    proposeEntry(f.actor("parent"), {
      ...(await f.base()),
      entryId: e.id,
      swimmerId: f.child,
      stroke: "dada",
      distanceM: 100,
    }),
  ).rejects.toThrow(/tenggat/);
  await expect(
    decideEntry(f.actor("parent"), {
      ...(await f.base()),
      entryId: e.id,
      action: "withdraw",
      note: "Tidak ikut",
    }),
  ).rejects.toThrow(/tenggat/);
  await decideEntry(f.actor("coach"), { ...(await f.base()), entryId: e.id, action: "approve" });
  await lockRegistration(f.actor("coach"), await f.base());
  await reopenRegistration(f.actor("coach"), {
    ...(await f.base()),
    deadline: "2099-12-30T10:00:00Z",
    reason: "Koreksi daftar",
  });
  expect((await f.state(e.id)).registration_status).toBe("requested");
  await f.yes();
});

test("reopening confirmed entries invalidates approval and exports without erasing evidence", async () => {
  const f = await fixture();
  await f.open();
  const e = await f.propose();
  await f.yes();
  await decideEntry(f.actor("coach"), { ...(await f.base()), entryId: e.id, action: "approve" });
  await lockRegistration(f.actor("coach"), await f.base());
  const old = await exportRegistration(f.actor("coach"), await f.base());
  await decideEntry(f.actor("coach"), {
    ...(await f.base()),
    entryId: e.id,
    action: "submit",
    note: "Bukti kirim",
  });
  await decideEntry(f.actor("coach"), {
    ...(await f.base()),
    entryId: e.id,
    action: "confirm",
    note: "Bukti konfirmasi",
  });
  await reopenRegistration(f.actor("coach"), {
    ...(await f.base()),
    deadline: "2099-12-30T10:00:00Z",
    reason: "Ganti nomor",
  });
  expect((await f.state(e.id)).registration_status).toBe("requested");
  await expect(
    exportRegistration(f.actor("coach"), { meetId: f.meetId, expectedRevision: old.revision }),
  ).rejects.toThrow();
  await expect(lockRegistration(f.actor("coach"), await f.base())).rejects.toThrow(/Putuskan/);
  await decideEntry(f.actor("coach"), { ...(await f.base()), entryId: e.id, action: "approve" });
  await lockRegistration(f.actor("coach"), await f.base());
  const latest = await exportRegistration(f.actor("coach"), await f.base());
  expect(latest.revision).toBeGreaterThan(old.revision);
  expect(
    (await loadRegistration(f.actor("parent"), f.meetId)).history.some(
      (h) => h.note === "Bukti konfirmasi",
    ),
  ).toBe(true);
});

test.each(["batal", "selesai"])(
  "%s meet rejects direct writes, decisions and reopen",
  async (status) => {
    const f = await fixture();
    await f.open();
    const e = await f.propose();
    await f.yes();
    await f.sql`update meets set status=${status} where id=${f.meetId}`;
    await expect(f.propose()).rejects.toThrow(/ditutup/);
    await expect(f.yes()).rejects.toThrow(/ditutup/);
    await expect(
      decideEntry(f.actor("coach"), { ...(await f.base()), entryId: e.id, action: "approve" }),
    ).rejects.toThrow(/ditutup/);
    await expect(
      reopenRegistration(f.actor("coach"), {
        ...(await f.base()),
        deadline: "2099-12-30T10:00:00Z",
        reason: "Koreksi",
      }),
    ).rejects.toThrow(/ditutup/);
  },
);

test("family cannot see or mutate another child, export squad, or act as coach", async () => {
  const f = await fixture();
  await f.open();
  const e = await proposeEntry(f.actor("coach"), {
    ...(await f.base()),
    swimmerId: f.other,
    stroke: "bebas",
    distanceM: 50,
  });
  const view = await loadRegistration(f.actor("parent"), f.meetId);
  expect(JSON.stringify(view)).not.toContain("Anak Rahasia");
  expect(view.history).toHaveLength(0);
  await expect(
    respondRegistration(f.actor("parent"), {
      ...(await f.base()),
      swimmerId: f.other,
      response: "yes",
    }),
  ).rejects.toThrow(/Hanya wali/);
  await expect(
    proposeEntry(f.actor("parent"), {
      ...(await f.base()),
      swimmerId: f.other,
      stroke: "dada",
      distanceM: 100,
    }),
  ).rejects.toThrow(/diizinkan/);
  await expect(
    decideEntry(f.actor("parent"), { ...(await f.base()), entryId: e.id, action: "approve" }),
  ).rejects.toThrow(/Hanya pelatih/);
  await expect(exportRegistration(f.actor("parent"), await f.base())).rejects.toThrow(
    /Hanya pelatih/,
  );
  await expect(lockRegistration(f.actor("parent"), await f.base())).rejects.toThrow(
    /Hanya pelatih/,
  );
});

test("wrong-club eligibility fails atomically and a revoked guardian cannot respond", async () => {
  const f = await fixture();
  const clubs = await f.sql<{
    id: number;
  }>`insert into clubs(name,short_name,city,province,coach_name) values ('Lain','L','L','L','L') returning id`;
  const kids = await f.sql<{
    id: number;
  }>`insert into swimmers(club_id,full_name,date_of_birth,gender) values (${clubs[0]!.id},'Lintas klub','2014-01-01','putra') returning id`;
  await expect(
    openRegistration(f.actor("coach"), {
      ...(await f.base()),
      deadline: "2099-12-29T17:00:00Z",
      swimmers: [
        { swimmerId: f.child, groupName: "A" },
        { swimmerId: kids[0]!.id, groupName: "B" },
      ],
      events: [{ stroke: "bebas", distanceM: 50 }],
    }),
  ).rejects.toThrow(/klub/);
  expect((await loadRegistration(f.actor("coach"), f.meetId)).candidates).toHaveLength(0);
  await f.open();
  await f.sql`delete from guardians where user_id='parent'`;
  await expect(f.yes()).rejects.toThrow(/Hanya wali/);
  expect((await loadRegistration(f.actor("parent"), f.meetId)).candidates).toHaveLength(0);
});

test("duplicate and stale requests cannot create duplicate races or repeat transitions", async () => {
  const f = await fixture();
  await f.open();
  const base = await f.base();
  const e = await f.propose();
  await expect(
    proposeEntry(f.actor("coach"), { ...base, swimmerId: f.child, stroke: "bebas", distanceM: 50 }),
  ).rejects.toThrow(/Muat ulang/);
  await expect(f.propose()).rejects.toThrow(/sudah ada/);
  await f.yes();
  const decision = { ...(await f.base()), entryId: e.id, action: "approve" as const };
  await decideEntry(f.actor("coach"), decision);
  await expect(decideEntry(f.actor("coach"), decision)).rejects.toThrow(/Muat ulang/);
  const rows = await f.sql`select id from meet_entries where meet_id=${f.meetId}`;
  expect(rows).toHaveLength(1);
});

test("ongoing multi-day meet remains visible and eligible for actions through end date", async () => {
  const f = await fixture();
  await f.open();
  await f.sql`update meets set start_date=current_date-1,end_date=current_date+1,registration_deadline=now()+interval '2 hours' where id=${f.meetId}`;
  const dashboard = await getDashboardData(f.actor("parent"));
  expect(dashboard.upcomingMeets.some((m) => m.id === f.meetId)).toBe(true);
  await f.yes();
  expect((await loadRegistration(f.actor("parent"), f.meetId)).editable).toBe(true);
});

test("legacy race data stays unverified until explicit correction; CSV neutralizes formula names", async () => {
  const f = await fixture();
  const legacy = await f.sql<{
    id: number;
  }>`insert into meet_entries(club_id,meet_id,swimmer_id,stroke,distance_m,status,lane,heat) values (${f.clubId},${f.meetId},${f.child},'bebas',50,'dq',3,'A') returning id`;
  const id = legacy[0]!.id;
  expect(await f.state(id)).toEqual({ registration_status: "legacy", status: "dq" });
  await f.open();
  await f.yes();
  await proposeEntry(f.actor("parent"), {
    ...(await f.base()),
    entryId: id,
    swimmerId: f.child,
    stroke: "bebas",
    distanceM: 50,
  });
  expect((await f.state(id)).status).toBe("dq");
  await decideEntry(f.actor("coach"), { ...(await f.base()), entryId: id, action: "approve" });
  await lockRegistration(f.actor("coach"), await f.base());
  await f.sql`update swimmers set full_name='=HYPERLINK("example")' where id=${f.child}`;
  expect((await exportRegistration(f.actor("coach"), await f.base())).csv).toContain("'=HYPERLINK");
});

test("a fresh participation response never silently restores an individually withdrawn race", async () => {
  const f = await fixture();
  await f.open();
  const e = await f.propose();
  await f.yes();
  await decideEntry(f.actor("parent"), {
    ...(await f.base()),
    entryId: e.id,
    action: "withdraw",
    note: "Fokus nomor lain",
  });
  await f.yes();
  expect((await f.state(e.id)).registration_status).toBe("withdrawn");
});

test("changing a meet's course invalidates approvals and requires an explicit new deadline", async () => {
  const f = await fixture();
  await f.sql`update swimmers set date_of_birth='2090-01-01' where id=${f.child}`;
  await f.open();
  const e = await f.propose();
  await f.yes();
  await decideEntry(f.actor("coach"), { ...(await f.base()), entryId: e.id, action: "approve" });
  await lockRegistration(f.actor("coach"), await f.base());
  await saveMeetRecord(f.actor("coach"), {
    id: f.meetId,
    name: "Kejuaraan Uji",
    level: "klub",
    course: "25",
    startDate: "2100-12-30",
    endDate: "2100-12-31",
    status: "rencana",
  });
  expect((await f.state(e.id)).registration_status).toBe("requested");
  expect((await loadRegistration(f.actor("parent"), f.meetId)).editable).toBe(false);
  await expect(f.yes()).rejects.toThrow(/tenggat/);
  await reopenRegistration(f.actor("coach"), {
    ...(await f.base()),
    deadline: "2099-12-30T10:00:00Z",
    reason: "Kolam berubah",
  });
  await f.yes();
  await decideEntry(f.actor("coach"), { ...(await f.base()), entryId: e.id, action: "approve" });
  expect(
    (await f.sql<{ age_group: string }>`select age_group from meet_entries where id=${e.id}`)[0]!
      .age_group,
  ).toBe("KU-IV");
});
