import { getSql } from "@/lib/db";
import type { Actor } from "./actor";
import { clubIdFor } from "./membership";
import { acceptPendingInvitesForEmail } from "./invites";

export type ClubActor = Actor & { clubId: number | null };

export async function loadClub(userId: string): Promise<ClubActor> {
  const sql = await getSql();
  await acceptPendingInvitesForEmail(sql, userId);
  const actor: Actor = { sql, userId };
  return { ...actor, clubId: await clubIdFor(actor) };
}

export async function requireClub(userId: string): Promise<Actor & { clubId: number }> {
  const actor = await loadClub(userId);
  if (actor.clubId == null) throw new Error("Akun belum diundang. Hubungi admin.");
  return { ...actor, clubId: actor.clubId };
}
