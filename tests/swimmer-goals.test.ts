import { expect, test } from "vitest";
import { createClubHarness } from "./harness";
import { listSwimmerGoals, saveSwimmerGoal } from "../src/lib/club/goals";
import { todayIso } from "../src/lib/utils";

function dayOffset(days: number) {
  return new Date(Date.parse(`${todayIso()}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function fixture() {
  const h = await createClubHarness();
  for (const id of ["goal-coach", "goal-guardian", "goal-other-guardian"]) {
    await h.sql`
      insert into "user" (id,name,email,"emailVerified")
      values (${id},${id},${`${id}@example.test`},true)
    `;
  }
  const club = await h.sql<{ id: number }>`
    insert into clubs (name,short_name,city,province,coach_name)
    values ('Klub Target Uji','KT','Klaten','Jateng','Pelatih Uji') returning id
  `;
  const clubId = club[0]!.id;
  await h.sql`
    insert into club_staff (club_id,user_id,role) values (${clubId},'goal-coach','coach')
  `;
  const children = await h.sql<{ id: number }>`
    insert into swimmers (club_id,full_name,date_of_birth,gender)
    values (${clubId},'Anak A','2014-01-01','putra'),
      (${clubId},'Anak B','2015-01-01','putri') returning id
  `;
  const own = children[0]!.id;
  const other = children[1]!.id;
  await h.sql`insert into guardians (user_id,swimmer_id) values ('goal-guardian',${own})`;
  await h.sql`insert into guardians (user_id,swimmer_id) values ('goal-other-guardian',${other})`;
  return {
    h,
    clubId,
    own,
    other,
    coach: h.actor("goal-coach"),
    guardian: h.actor("goal-guardian"),
    otherGuardian: h.actor("goal-other-guardian"),
  };
}

function goalInput(swimmerId: number) {
  return {
    swimmerId,
    stroke: "bebas",
    distanceM: 50,
    course: "50" as const,
    targetTimeMs: 35_000,
    deadline: dayOffset(7),
    notes: "Fokus start dan putaran.",
  };
}

test("a goal only advances from completed times with the same stroke, distance and pool length", async () => {
  const f = await fixture();
  const { id } = await saveSwimmerGoal(f.coach, goalInput(f.own));
  const addResult = async (
    course: "25" | "50",
    timeMs: number,
    status = "selesai",
    stroke = "bebas",
  ) => {
    await f.h.sql`
      insert into results (club_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,status,kind)
      values (${f.clubId},${f.own},${todayIso()},${stroke},50,${course},${timeMs},${status},'test')
    `;
  };
  await addResult("25", 34_000);
  await addResult("50", 33_000, "dq");
  await addResult("50", 32_000, "selesai", "punggung");
  let [goal] = await listSwimmerGoals(f.guardian, f.own);
  expect(goal).toMatchObject({ id, status: "open", bestTimeMs: null, hitOn: null });
  await addResult("50", 36_000);
  [goal] = await listSwimmerGoals(f.guardian, f.own);
  expect(goal).toMatchObject({ status: "open", bestTimeMs: 36_000, deltaMs: 1_000 });
  await addResult("50", 34_500);
  [goal] = await listSwimmerGoals(f.guardian, f.own);
  expect(goal).toMatchObject({
    status: "hit",
    bestTimeMs: 34_500,
    deltaMs: -500,
    hitOn: todayIso(),
  });
  const result = await f.h.sql<{ n: number }>`
    select count(*)::int as n from results where club_id = ${f.clubId} and swimmer_id = ${f.own}
  `;
  expect(result[0]?.n).toBe(5); // Completion is derived without rewriting result history.
  await expect(
    saveSwimmerGoal(f.coach, {
      ...goalInput(f.own),
      id,
      expectedRevision: goal!.revision,
      targetTimeMs: 33_000,
    }),
  ).rejects.toThrow("sudah selesai");
});

test("current best includes a comparable PB recorded before the goal started", async () => {
  const f = await fixture();
  await f.h.sql`
    insert into results (club_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,status,kind)
    values (${f.clubId},${f.own},${dayOffset(-30)},'bebas',50,'50',36000,'selesai','official')
  `;
  await saveSwimmerGoal(f.coach, goalInput(f.own));
  expect((await listSwimmerGoals(f.coach, f.own))[0]).toMatchObject({
    status: "open",
    bestTimeMs: 36_000,
    deltaMs: 1_000,
    hitOn: null,
  });
});

test("guardians can read only linked children's goals and cannot set or edit them", async () => {
  const f = await fixture();
  const own = await saveSwimmerGoal(f.coach, goalInput(f.own));
  await saveSwimmerGoal(f.coach, { ...goalInput(f.other), notes: "Catatan anak lain" });
  expect((await listSwimmerGoals(f.guardian, f.own)).map((goal) => goal.notes)).toEqual([
    "Fokus start dan putaran.",
  ]);
  await expect(listSwimmerGoals(f.guardian, f.other)).rejects.toThrow("Perenang tidak ditemukan");
  await expect(saveSwimmerGoal(f.guardian, goalInput(f.own))).rejects.toThrow("Tidak diizinkan");
  await expect(
    saveSwimmerGoal(f.otherGuardian, { ...goalInput(f.other), id: own.id }),
  ).rejects.toThrow("Tidak diizinkan");
  await expect(saveSwimmerGoal(f.coach, { ...goalInput(f.other), id: own.id })).rejects.toThrow(
    "Target tidak ditemukan",
  );
});

test("a missed deadline stays missed when a faster result is recorded afterwards", async () => {
  const f = await fixture();
  const startedOn = dayOffset(-14);
  const deadline = dayOffset(-1);
  const rows = await f.h.sql<{ id: number }>`
    insert into swimmer_goals (club_id,swimmer_id,created_by,stroke,distance_m,course,
      target_time_ms,started_on,deadline)
    values (${f.clubId},${f.own},'goal-coach','bebas',50,'50',35000,${startedOn},${deadline})
    returning id
  `;
  await f.h.sql`
    insert into results (club_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,status,kind)
    values (${f.clubId},${f.own},${todayIso()},'bebas',50,'50',34000,'selesai','official')
  `;
  let [goal] = await listSwimmerGoals(f.coach, f.own);
  expect(goal).toMatchObject({
    id: rows[0]!.id,
    status: "missed",
    bestTimeMs: 34_000,
    hitOn: null,
  });
  await f.h.sql`
    insert into results (club_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,status,kind)
    values (${f.clubId},${f.own},${dayOffset(-2)},'bebas',50,'50',34900,'selesai','official')
  `;
  [goal] = await listSwimmerGoals(f.coach, f.own);
  expect(goal).toMatchObject({ status: "hit", bestTimeMs: 34_000, hitOn: dayOffset(-2) });
});

test("coach can correct a goal, but invalid or foreign-club inputs cannot write it", async () => {
  const f = await fixture();
  const { id } = await saveSwimmerGoal(f.coach, goalInput(f.own));
  await saveSwimmerGoal(f.coach, {
    ...goalInput(f.own),
    id,
    expectedRevision: 1,
    targetTimeMs: 34_000,
    notes: "  Lebih cepat  ",
  });
  expect((await listSwimmerGoals(f.coach, f.own))[0]).toMatchObject({
    targetTimeMs: 34_000,
    notes: "Lebih cepat",
    revision: 2,
  });
  await expect(
    saveSwimmerGoal(f.coach, {
      ...goalInput(f.own),
      id,
      expectedRevision: 1,
      targetTimeMs: 33_000,
    }),
  ).rejects.toThrow("Target sudah berubah");
  const revisions = await f.h.sql<{ revision: number; target_time_ms: number }>`
    select revision,target_time_ms from swimmer_goal_revisions
    where goal_id=${id} order by revision
  `;
  expect(revisions).toEqual([
    { revision: 1, target_time_ms: 35_000 },
    { revision: 2, target_time_ms: 34_000 },
  ]);
  await expect(
    saveSwimmerGoal(f.coach, { ...goalInput(f.own), course: "25", deadline: dayOffset(-1) }),
  ).rejects.toThrow("Batas waktu");
  await expect(saveSwimmerGoal(f.coach, { ...goalInput(f.own), targetTimeMs: -1 })).rejects.toThrow(
    "Waktu target",
  );
  await expect(
    saveSwimmerGoal(f.coach, { ...goalInput(f.own), notes: "x".repeat(501) }),
  ).rejects.toThrow("Catatan maksimal");
  const foreign = await f.h.sql<{ id: number }>`
    insert into clubs (name,short_name,city,province,coach_name)
    values ('Klub Lain','KL','Solo','Jateng','Pelatih') returning id
  `;
  const child = await f.h.sql<{ id: number }>`
    insert into swimmers (club_id,full_name,date_of_birth,gender)
    values (${foreign[0]!.id},'Anak Asing','2015-01-01','putra') returning id
  `;
  await expect(saveSwimmerGoal(f.coach, goalInput(child[0]!.id))).rejects.toThrow(
    "Perenang tidak ditemukan",
  );
  expect((await listSwimmerGoals(f.coach, f.own)).length).toBe(1);
});
