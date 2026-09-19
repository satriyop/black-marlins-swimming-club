import type { InviteRow } from "./invites";

export function isLiveInvite(status: InviteRow["status"]): boolean {
  return status === "pending" || status === "expired" || status == null;
}

export function isHistoryInvite(status: InviteRow["status"]): boolean {
  return status === "accepted" || status === "revoked";
}

export type InviteHistoryItem =
  | { key: string; kind: "single"; invite: InviteRow }
  | { key: string; kind: "guardian-group"; email: string; invites: InviteRow[] };

function stamp(invite: InviteRow): string {
  return invite.acceptedAt || invite.revokedAt || invite.expiresAt;
}

export function liveInvites(invites: InviteRow[]): InviteRow[] {
  return invites.filter((invite) => isLiveInvite(invite.status));
}

export function groupedSwimmerIds(invites: InviteRow[]): number[] {
  const ids = new Set<number>();
  for (const invite of invites) {
    for (const id of invite.payload.swimmerIds ?? []) ids.add(id);
  }
  return [...ids];
}

export function groupInviteHistory(invites: InviteRow[]): InviteHistoryItem[] {
  const history = invites.filter((invite) => isHistoryInvite(invite.status));
  const guardianAccepted = new Map<string, InviteRow[]>();
  const rest: InviteRow[] = [];
  for (const invite of history) {
    if (invite.status === "accepted" && invite.kind === "guardian") {
      const email = invite.email?.trim().toLowerCase() || `id-${invite.id}`;
      const group = guardianAccepted.get(email) ?? [];
      group.push(invite);
      guardianAccepted.set(email, group);
    } else rest.push(invite);
  }
  const items: InviteHistoryItem[] = [];
  for (const [email, group] of guardianAccepted) {
    if (group.length === 1) items.push({ key: `invite-${group[0]!.id}`, kind: "single", invite: group[0]! });
    else items.push({ key: `guardian-${email}`, kind: "guardian-group", email, invites: group });
  }
  for (const invite of rest) items.push({ key: `invite-${invite.id}`, kind: "single", invite });
  return items.sort((left, right) => {
    const leftStamp = left.kind === "single" ? stamp(left.invite) : left.invites.map(stamp).sort().at(-1)!;
    const rightStamp = right.kind === "single" ? stamp(right.invite) : right.invites.map(stamp).sort().at(-1)!;
    return rightStamp.localeCompare(leftStamp);
  });
}
