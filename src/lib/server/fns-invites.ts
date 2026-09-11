import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireClub } from "@/lib/club/context";
import { getSql } from "@/lib/db";
import { acceptInvite, acceptSwimmerInvite, createInvite, listInvites, type InviteInput } from "@/lib/club/invites";
import { seedClub } from "@/lib/club/seed";

export const listClubInvites = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const actor = await requireClub(context.userId);
  return listInvites(actor);
});

export const createClubInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: InviteInput) => {
    if (!input.email?.trim()) throw new Error("Email wajib diisi");
    return { ...input, email: input.email.trim() };
  })
  .handler(async ({ context, data }) => {
    const actor = await requireClub(context.userId);
    return createInvite(actor, data);
  });

export const acceptClubInvite = createServerFn({ method: "POST" })
  .validator((input: { token: string; password?: string }) => {
    if (!input.token?.trim()) throw new Error("Undangan tidak berlaku.");
    return input;
  })
  .handler(async ({ data }) => {
    const sql = await getSql();
    await seedClub(sql);
    if (data.password) {
      return acceptSwimmerInvite(sql, { token: data.token, password: data.password });
    }
    const session = await getSessionUser();
    if (!session?.email) throw new Error("Masuk dengan Google dulu");
    await acceptInvite(sql, { token: data.token, userId: session.id, email: session.email });
    return { ok: true as const };
  });
