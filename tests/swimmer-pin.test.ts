import { expect, test } from "vitest";
import { createClubHarness } from "./harness";
import { AZKIYA_ID, RATIH_ID, seedClub } from "../src/lib/club/seed";
import { hashPin, setSwimmerPin, swimmerPinStatus, verifyPin } from "../src/lib/club/swimmer-pin";

async function swimmerId(sql: Awaited<ReturnType<typeof createClubHarness>>["sql"], name: string) {
  const rows = await sql<{ id: number }>`select id from swimmers where full_name = ${name} limit 1`;
  return rows[0]!.id;
}

test("pin hash does not store the digits", async () => {
  const stored = await hashPin("4821");
  expect(stored.startsWith("scrypt$")).toBe(true);
  expect(stored.split("$").slice(1)).not.toContain("4821");
  expect(await verifyPin("4821", stored)).toBe(true);
  expect(await verifyPin("0000", stored)).toBe(false);
});

test("linked guardian can set and replace a locker pin", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const id = await swimmerId(h.sql, "Perenang Satu");
  const before = await swimmerPinStatus(h.actor(RATIH_ID), id);
  expect(before).toEqual({ canManage: true, hasPin: false });
  await setSwimmerPin(h.actor(RATIH_ID), { swimmerId: id, pin: "1357" });
  const after = await swimmerPinStatus(h.actor(RATIH_ID), id);
  expect(after.hasPin).toBe(true);
  const rows = await h.sql<{ pin_hash: string; failed_attempts: number }>`
    select pin_hash, failed_attempts from swimmer_credentials where swimmer_id = ${id}
  `;
  expect(rows[0]?.pin_hash.split("$").slice(1)).not.toContain("1357");
  expect(await verifyPin("1357", rows[0]!.pin_hash)).toBe(true);
  await h.sql`update swimmer_credentials set failed_attempts = 4, locked_until = now() + interval '5 minutes' where swimmer_id = ${id}`;
  await setSwimmerPin(h.actor(RATIH_ID), { swimmerId: id, pin: "2468" });
  const reset = await h.sql<{ failed_attempts: number; locked_until: string | null }>`
    select failed_attempts, locked_until from swimmer_credentials where swimmer_id = ${id}
  `;
  expect(reset[0]?.failed_attempts).toBe(0);
  expect(reset[0]?.locked_until).toBeNull();
  const events = await h.sql<{ action: string }>`
    select action from swimmer_credential_events where swimmer_id = ${id} order by id
  `;
  expect(events.map((row) => row.action)).toEqual(["set", "reset"]);
});

test("club admin cannot set a pin when a guardian exists", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const id = await swimmerId(h.sql, "Perenang Satu");
  await expect(setSwimmerPin(h.actor(AZKIYA_ID), { swimmerId: id, pin: "1111" })).rejects.toThrow(
    /tidak ditemukan/,
  );
});

test("club admin can set a pin for a swimmer with no guardian", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  const created = await h.sql<{ id: number }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, status)
    values (${clubId}, 'Tanpa Wali', '2015-01-01', 'putri', 'aktif')
    returning id
  `;
  await setSwimmerPin(h.actor(AZKIYA_ID), { swimmerId: created[0]!.id, pin: "9090" });
  expect((await swimmerPinStatus(h.actor(AZKIYA_ID), created[0]!.id)).hasPin).toBe(true);
});

test("a coach cannot set another family's pin", async () => {
  const h = await createClubHarness();
  const clubId = await seedClub(h.sql);
  await h.sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('usr_coach', 'Pelatih', 'coach@example.com', true, now(), now())
  `;
  await h.sql`insert into club_staff (club_id, user_id, role) values (${clubId}, 'usr_coach', 'coach')`;
  const id = await swimmerId(h.sql, "Perenang Satu");
  await expect(setSwimmerPin(h.actor("usr_coach"), { swimmerId: id, pin: "2222" })).rejects.toThrow(
    /tidak ditemukan/,
  );
});

test("pin must be four digits", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const id = await swimmerId(h.sql, "Perenang Satu");
  await expect(setSwimmerPin(h.actor(RATIH_ID), { swimmerId: id, pin: "12" })).rejects.toThrow(
    /4 angka/,
  );
  await expect(
    setSwimmerPin(h.actor(RATIH_ID), { swimmerId: id, pin: 1234 as unknown as string }),
  ).rejects.toThrow(/4 angka/);
});
