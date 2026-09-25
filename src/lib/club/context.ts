import { getSql } from "@/lib/db";
import type { Actor } from "./actor";
import { clubIdFor, contextClubId } from "./membership";
import { acceptPendingInvitesForEmail } from "./invites";

export type ClubActor = Actor & { clubId: number | null };

/**
 * Resolve the Club for this request, then claim pending invites for that Club only.
 * `clubId` on the result is the resolved Club, including when the user has no Hat there.
 * `requireClub` still rejects that user as uninvited.
 */
export async function loadClub(userId: string, clubId?: number): Promise<ClubActor> {
  const sql = await getSql();
  const requested: Actor = { sql, userId, ...(clubId != null ? { clubId } : {}) };
  const context = await contextClubId(requested);
  if (context != null) await acceptPendingInvitesForEmail(sql, userId, context);
  return { sql, userId, clubId: context };
}

export async function requireClub(userId: string, clubId?: number): Promise<Actor & { clubId: number }> {
  const actor = await loadClub(userId, clubId);
  const membership = await clubIdFor(actor);
  if (membership == null) throw new Error("Akun belum diundang. Hubungi admin.");
  return { ...actor, clubId: membership };
}
