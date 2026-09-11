import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireClub } from "@/lib/club/context";
import { getSql } from "@/lib/db";
import {
  acceptInvite,
  acceptSwimmerInvite,
  createInvite,
  listInvites,
  previewInvite,
  type InviteInput,
} from "@/lib/club/invites";

export const getInvitePreview = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => {
    if (typeof input?.token !== "string" || !/^[a-f0-9]{48}$/.test(input.token))
      throw new Error("Undangan tidak berlaku.");
    return { token: input.token };
  })
  .handler(async ({ data }) => previewInvite(await getSql(), data.token));

export const listClubInvites = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireClub(context.userId);
    return listInvites(actor);
  });

export const createClubInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: InviteInput) => {
    if (!input.email?.trim()) throw new Error("Email wajib diisi");
    if (
      (input.kind === "guardian" || input.kind === "swimmer_account") &&
      !input.swimmerIds?.length
    ) {
      throw new Error("Pilih perenang");
    }
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
    if (data.password) {
      return acceptSwimmerInvite(sql, { token: data.token, password: data.password });
    }
    const session = await getSessionUser();
    if (!session?.email) throw new Error("Masuk dengan Google dulu");
    await acceptInvite(sql, { token: data.token, userId: session.id, email: session.email });
    return { ok: true as const };
  });
