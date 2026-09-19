import { expect, test } from "vitest";
import {
  groupInviteHistory,
  groupedSwimmerIds,
  liveInvites,
} from "../src/lib/club/invite-list";
import type { InviteRow } from "../src/lib/club/invites";

function invite(partial: Partial<InviteRow> & Pick<InviteRow, "id" | "status">): InviteRow {
  return {
    email: "ratih@example.test",
    kind: "guardian",
    payload: {},
    expiresAt: "2026-10-01T00:00:00.000Z",
    token: `t${partial.id}`,
    acceptPath: `/terima?token=t${partial.id}`,
    ...partial,
  };
}

test("live list is pending and expired only", () => {
  const rows = [
    invite({ id: 1, status: "accepted" }),
    invite({ id: 2, status: "pending" }),
    invite({ id: 3, status: "expired" }),
    invite({ id: 4, status: "revoked" }),
  ];
  expect(liveInvites(rows).map((row) => row.id)).toEqual([2, 3]);
});

test("accepted guardian invites for one email collapse to one history card", () => {
  const rows = [
    invite({
      id: 1,
      status: "accepted",
      payload: { swimmerIds: [11] },
      acceptedAt: "2026-09-12T00:00:00.000Z",
    }),
    invite({
      id: 2,
      status: "accepted",
      payload: { swimmerIds: [12, 13] },
      acceptedAt: "2026-09-15T00:00:00.000Z",
    }),
    invite({ id: 3, status: "accepted", kind: "staff", email: "coach@example.test" }),
  ];
  const history = groupInviteHistory(rows);
  expect(history).toHaveLength(2);
  const group = history.find((item) => item.kind === "guardian-group");
  expect(group?.kind === "guardian-group" && group.email).toBe("ratih@example.test");
  expect(group?.kind === "guardian-group" && groupedSwimmerIds(group.invites)).toEqual([11, 12, 13]);
});
