import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import { createInvite, listInvites, type InviteInput } from "@/lib/club/invites";

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
