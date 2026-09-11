import { expect, test } from "vitest";
import {
  previewInvite,
  createInvite,
  acceptSwimmerInvite,
  listInvites,
} from "../src/lib/club/invites";
import { seedClub, RATIH_ID } from "../src/lib/club/seed";
import { createClubHarness } from "./harness";
import { progressDescription, progressSeries } from "../src/lib/swim/progress";
import type { Result } from "../src/lib/swim/types";

const result = (overrides: Partial<Result> = {}): Result => ({
  id: 1,
  swimmerId: 1,
  swimmerName: "Perenang",
  meetId: 1,
  meetName: "Lomba",
  resultDate: "2026-09-01",
  stroke: "bebas",
  distanceM: 50,
  course: "50",
  timeMs: 38000,
  place: null,
  round: null,
  status: "selesai",
  kind: "official",
  isPb: false,
  notes: null,
  ...overrides,
});

test("progress compares completed results from the same source and pool in date order", () => {
  const selected = result();
  const series = progressSeries(
    [
      result({ id: 2, resultDate: "2026-09-11", timeMs: 37160 }),
      result({ id: 3, kind: "test", timeMs: 30000 }),
      result({ id: 4, status: "dq", timeMs: 20000 }),
      result({ id: 5, course: "25", timeMs: 25000 }),
      result(),
    ],
    selected,
  );
  expect(series.map((r) => r.id)).toEqual([1, 2]);
  expect(progressDescription(series)).toBe("0,84 detik lebih cepat dari catatan sebelumnya.");
  expect(progressDescription([result()])).toContain("Tambahkan dua catatan");
  expect(progressDescription([result(), result({ timeMs: 40000 })])).toContain("lebih lambat");
});

test("invitation preview selects the right flow without exposing email or child payload", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const [kid] = await h.sql<{ id: number }>`select id from swimmers limit 1`;
  const invite = await createInvite(h.actor(RATIH_ID), {
    kind: "swimmer_account",
    email: "preview-child@example.invalid",
    swimmerIds: [kid.id],
  });
  const preview = await previewInvite(h.sql, invite.token);
  expect(preview).toMatchObject({
    state: "pending",
    kind: "swimmer_account",
    emailHint: "p***@example.invalid",
  });
  expect(JSON.stringify(preview)).not.toContain("preview-child");
  expect(preview).not.toHaveProperty("payload");
  const listed = await listInvites(h.actor(RATIH_ID));
  expect(typeof listed[0].expiresAt).toBe("string");
  if (preview.state === "pending") expect(typeof preview.expiresAt).toBe("string");
  await acceptSwimmerInvite(h.sql, { token: invite.token, password: "local-password-123" });
  expect(await previewInvite(h.sql, invite.token)).toEqual({ state: "accepted" });
});

test("invitation preview distinguishes expired links from missing links", async () => {
  const h = await createClubHarness();
  await seedClub(h.sql);
  const [kid] = await h.sql<{ id: number }>`select id from swimmers limit 1`;
  const invite = await createInvite(h.actor(RATIH_ID), {
    kind: "guardian",
    email: "preview-parent@example.invalid",
    swimmerIds: [kid.id],
  });
  await h.sql`update invites set expires_at = now() - interval '1 day' where token = ${invite.token}`;
  expect(await previewInvite(h.sql, invite.token)).toEqual({ state: "expired" });
  expect(await previewInvite(h.sql, "missing")).toEqual({ state: "invalid" });
});
