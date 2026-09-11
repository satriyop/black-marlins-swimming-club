import { expect, test } from "vitest";
import { accessFor, UNINVITED_MESSAGE } from "../src/lib/club/access";
import { listSwimmers } from "../src/lib/club/swimmers";
import { seedClub } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";

test("uninvited signed-in user sees empty roster and the uninvited copy", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const actor = h.actor("stranger");
  const access = await accessFor(actor);
  expect(access.invited).toBe(false);
  expect(access.message).toBe("Akun belum diundang. Hubungi admin.");
  expect(access.message).toBe(UNINVITED_MESSAGE);
  expect(await listSwimmers(actor)).toEqual([]);
});
