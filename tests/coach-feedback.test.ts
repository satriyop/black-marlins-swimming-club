import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createClubHarness } from "./harness";
import {
  createCoachFeedback,
  listFeedbackPracticeOptions,
  listRecentSharedFeedback,
  listSwimmerFeedback,
  retractCoachFeedback,
  updateCoachFeedback,
} from "../src/lib/club/feedback";
import { listSwimmers, saveSwimmer } from "../src/lib/club/swimmers";
import { getDashboardData } from "../src/lib/club/dashboard";

describe("coach feedback privacy and history", () => {
  let harness: Awaited<ReturnType<typeof createClubHarness>>;
  let swimmerId: number;
  let otherSwimmerId: number;
  let practiceId: number;
  let scheduledPracticeId: number;
  let otherClubPracticeId: number;

  beforeEach(async () => {
    harness = await createClubHarness();
    await harness.sql`
      insert into "user"(id,name,email,"emailVerified") values
        ('coach-a','Pelatih A','coach-a@example.test',true),
        ('coach-b','Pelatih B','coach-b@example.test',true),
        ('guardian-a','Wali A','guardian-a@example.test',true),
        ('guardian-b','Wali B','guardian-b@example.test',true),
        ('athlete-account','Akun Atlet','athlete@example.test',true)
    `;
    const clubs = await harness.sql<{ id: number }>`
      insert into clubs(name,short_name,city,province,coach_name) values
        ('Klub Satu','K1','Klaten','Jawa Tengah','Pelatih'),
        ('Klub Dua','K2','Solo','Jawa Tengah','Pelatih') returning id
    `;
    const clubId = clubs[0]!.id;
    const otherClubId = clubs[1]!.id;
    await harness.sql`
      insert into club_staff(club_id,user_id,role) values
        (${clubId},'coach-a','coach'),(${clubId},'coach-b','coach')
    `;
    await harness.sql`
      insert into club_family(club_id,user_id) values
        (${clubId},'guardian-a'),(${clubId},'guardian-b')
    `;
    const swimmers = await harness.sql<{ id: number }>`
      insert into swimmers(club_id,user_id,full_name,date_of_birth,gender) values
        (${clubId},'athlete-account','Perenang Satu','2012-01-01','putra'),
        (${clubId},null,'Perenang Dua','2013-01-01','putri') returning id
    `;
    swimmerId = swimmers[0]!.id;
    otherSwimmerId = swimmers[1]!.id;
    await harness.sql`
      insert into guardians(user_id,swimmer_id) values
        ('guardian-a',${swimmerId}),('guardian-b',${otherSwimmerId})
    `;
    const practices = await harness.sql<{ id: number }>`
      insert into practices(club_id,session_date,kind,title,status) values
        (${clubId},'2026-09-10','renang','Latihan selesai','completed'),
        (${clubId},'2026-09-11','renang','Latihan belum selesai','scheduled'),
        (${otherClubId},'2026-09-10','renang','Latihan klub lain','completed') returning id
    `;
    practiceId = practices[0]!.id;
    scheduledPracticeId = practices[1]!.id;
    otherClubPracticeId = practices[2]!.id;
    await harness.sql`
      insert into practice_attendance(club_id,practice_id,swimmer_id,status) values
        (${clubId},${practiceId},${swimmerId},'hadir'),
        (${clubId},${scheduledPracticeId},${swimmerId},'hadir'),
        (${otherClubId},${otherClubPracticeId},${swimmerId},'hadir')
    `;
  });

  afterEach(async () => {
    await harness.sql.end?.();
  });

  test("draft, private, and shared states enforce distinct audiences", async () => {
    const created = await createCoachFeedback(harness.actor("coach-a"), {
      swimmerId,
      practiceId,
      focus: "Posisi kepala",
      improvement: "Napas lebih tenang",
      nextStep: "Jaga ritme enam kayuhan",
      status: "draft",
    });

    expect((await listSwimmerFeedback(harness.actor("coach-a"), swimmerId))[0]).toMatchObject({
      id: created.id,
      status: "draft",
      canEdit: true,
    });
    expect(await listSwimmerFeedback(harness.actor("coach-b"), swimmerId)).toEqual([]);
    expect(await listSwimmerFeedback(harness.actor("guardian-a"), swimmerId)).toEqual([]);
    expect(await listSwimmerFeedback(harness.actor("athlete-account"), swimmerId)).toEqual([]);

    const privateNote = await updateCoachFeedback(harness.actor("coach-a"), {
      id: created.id,
      expectedRevision: 1,
      focus: "Posisi kepala",
      improvement: "Napas lebih tenang",
      nextStep: "Jaga ritme enam kayuhan",
      status: "private",
    });
    expect((await listSwimmerFeedback(harness.actor("coach-b"), swimmerId))[0]).toMatchObject({
      status: "private",
      canEdit: false,
    });
    expect(await listSwimmerFeedback(harness.actor("guardian-a"), swimmerId)).toEqual([]);

    const shared = await updateCoachFeedback(harness.actor("coach-a"), {
      id: created.id,
      expectedRevision: privateNote.revision,
      focus: "Posisi kepala",
      improvement: "Napas lebih tenang",
      nextStep: "Jaga ritme enam kayuhan",
      status: "shared",
    });
    expect((await listSwimmerFeedback(harness.actor("guardian-a"), swimmerId))[0]).toMatchObject({
      id: shared.id,
      status: "shared",
      nextStep: "Jaga ritme enam kayuhan",
      canEdit: false,
    });
    await expect(listSwimmerFeedback(harness.actor("guardian-b"), swimmerId)).rejects.toThrow(
      "Perenang tidak ditemukan",
    );
  });

  test("only the author can edit or retract and every revision is retained", async () => {
    const created = await createCoachFeedback(harness.actor("coach-a"), {
      swimmerId,
      practiceId,
      focus: "Start",
      status: "shared",
    });
    await expect(
      updateCoachFeedback(harness.actor("coach-b"), {
        id: created.id,
        expectedRevision: 1,
        focus: "Diubah orang lain",
        status: "shared",
      }),
    ).rejects.toThrow("Hanya penulis");
    const updated = await updateCoachFeedback(harness.actor("coach-a"), {
      id: created.id,
      expectedRevision: 1,
      focus: "Start dan streamline",
      status: "shared",
    });
    await expect(
      retractCoachFeedback(harness.actor("coach-a"), {
        id: created.id,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("Catatan sudah berubah");
    const retracted = await retractCoachFeedback(harness.actor("coach-a"), {
      id: created.id,
      expectedRevision: updated.revision,
    });
    expect(retracted.status).toBe("retracted");
    expect(await listSwimmerFeedback(harness.actor("guardian-a"), swimmerId)).toEqual([]);
    const history = await harness.sql<{ revision: number; status: string }>`
      select revision,status from coach_feedback_revisions
      where feedback_id=${created.id} order by revision
    `;
    expect(history).toEqual([
      { revision: 1, status: "shared" },
      { revision: 2, status: "shared" },
      { revision: 3, status: "retracted" },
    ]);
  });

  test("creation requires staff, a same-club completed practice, and roster membership", async () => {
    const content = { focus: "Teknik", status: "private" as const };
    await expect(
      createCoachFeedback(harness.actor("guardian-a"), { swimmerId, practiceId, ...content }),
    ).rejects.toThrow("Hanya staf klub");
    await expect(
      createCoachFeedback(harness.actor("coach-a"), {
        swimmerId,
        practiceId: scheduledPracticeId,
        ...content,
      }),
    ).rejects.toThrow("latihan selesai");
    await expect(
      createCoachFeedback(harness.actor("coach-a"), {
        swimmerId: otherSwimmerId,
        practiceId,
        ...content,
      }),
    ).rejects.toThrow("latihan selesai");
    await expect(
      createCoachFeedback(harness.actor("coach-a"), {
        swimmerId,
        practiceId: otherClubPracticeId,
        ...content,
      }),
    ).rejects.toThrow("latihan selesai");
    expect(await listFeedbackPracticeOptions(harness.actor("coach-a"), swimmerId)).toEqual([
      { id: practiceId, title: "Latihan selesai", sessionDate: "2026-09-10" },
    ]);
  });

  test("guardian revocation removes access and the family feed contains shared notes only", async () => {
    await createCoachFeedback(harness.actor("coach-a"), {
      swimmerId,
      practiceId,
      focus: "Rahasia staf",
      status: "private",
    });
    const shared = await createCoachFeedback(harness.actor("coach-b"), {
      swimmerId,
      practiceId,
      nextStep: "Latihan streamline di rumah",
      status: "shared",
    });
    expect(await listRecentSharedFeedback(harness.actor("guardian-a"), [swimmerId])).toEqual([
      expect.objectContaining({ id: shared.id, nextStep: "Latihan streamline di rumah" }),
    ]);
    expect(
      JSON.stringify(await listRecentSharedFeedback(harness.actor("guardian-a"), [swimmerId])),
    ).not.toContain("Rahasia staf");

    await harness.sql`delete from guardians where user_id='guardian-a' and swimmer_id=${swimmerId}`;
    expect(await listRecentSharedFeedback(harness.actor("guardian-a"), [swimmerId])).toEqual([]);
    await expect(listSwimmerFeedback(harness.actor("guardian-a"), swimmerId)).rejects.toThrow(
      "Perenang tidak ditemukan",
    );
  });

  test("dual-role staff sees only shared notes while using the family dashboard", async () => {
    await harness.sql`
      insert into club_family(club_id,user_id)
      select club_id,'coach-a' from club_staff where user_id='coach-a'
    `;
    await harness.sql`insert into guardians(user_id,swimmer_id) values ('coach-a',${swimmerId})`;
    await harness.sql`insert into user_club_prefs(user_id,task_view) values ('coach-a','family')`;
    await createCoachFeedback(harness.actor("coach-a"), {
      swimmerId,
      practiceId,
      focus: "Catatan privat pelatih",
      status: "private",
    });
    const shared = await createCoachFeedback(harness.actor("coach-b"), {
      swimmerId,
      practiceId,
      nextStep: "Arahan yang boleh dibaca wali",
      status: "shared",
    });

    const dashboard = await getDashboardData(harness.actor("coach-a"));
    expect(dashboard.recentFeedback).toEqual([
      expect.objectContaining({ id: shared.id, nextStep: "Arahan yang boleh dibaca wali" }),
    ]);
    expect(JSON.stringify(dashboard.recentFeedback)).not.toContain("Catatan privat pelatih");
    const familyHistory = await listSwimmerFeedback(
      harness.actor("coach-a"),
      swimmerId,
      "family",
    );
    expect(familyHistory).toEqual([
      expect.objectContaining({ id: shared.id, nextStep: "Arahan yang boleh dibaca wali" }),
    ]);
    expect(JSON.stringify(familyHistory)).not.toContain("Catatan privat pelatih");
  });

  test("legacy internal roster notes are neither returned to nor overwritten by guardians", async () => {
    await harness.sql`update swimmers set notes='Evaluasi internal lama' where id=${swimmerId}`;
    const guardianRows = await listSwimmers(harness.actor("guardian-a"));
    expect(guardianRows[0]?.notes).toBeNull();

    await saveSwimmer(harness.actor("guardian-a"), {
      id: swimmerId,
      fullName: "Perenang Satu",
      dateOfBirth: "2012-01-01",
      gender: "putra",
      status: "aktif",
      notes: "Tidak boleh mengganti catatan staf",
    });
    const stored = await harness.sql<{
      notes: string;
    }>`select notes from swimmers where id=${swimmerId}`;
    expect(stored[0]?.notes).toBe("Evaluasi internal lama");
  });
});
