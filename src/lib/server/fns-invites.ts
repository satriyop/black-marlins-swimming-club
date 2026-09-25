import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSessionUser } from "@/lib/auth/verify.server";
import { loadClub, requireClub } from "@/lib/club/context";
import { UnknownClubHostError } from "@/lib/club/hostname";
import { resolveRequestClub } from "@/lib/club/request-club.server";
import { getSql } from "@/lib/db";
import {
  acceptInvite,
  acceptSwimmerInvite,
  createInvite,
  listInvites,
  previewInvite,
  recreateInvite,
  revokeInvite,
  type InviteInput,
} from "@/lib/club/invites";
import {
  linkGuardian,
  listAccessHelp,
  listMyAccessHelp,
  listAdminHandoff,
  getPublicClubContact as loadPublicClubContact,
  listMembers,
  resolveAccessHelp,
  saveClubSupport,
  revokeStaffRole,
  setStaffRole,
  submitAccessHelp,
  unlinkGuardian,
} from "@/lib/club/members";
import type { StaffRole } from "@/lib/club/hats";

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
    if (input.kind === "swimmer_account" && !input.swimmerIds?.length) {
      throw new Error("Pilih perenang");
    }
    return { ...input, email: input.email.trim(), confirmedEmail: input.confirmedEmail?.trim() };
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

export const listClubMembers = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const actor = await requireClub(context.userId);
  return listMembers(actor);
});

export const setClubStaffRole = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { userId: string; role: StaffRole }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return setStaffRole(actor, data);
});

export const revokeClubStaffRole = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { userId: string }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return revokeStaffRole(actor, data);
});

export const unlinkClubGuardian = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { userId: string; swimmerId: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return unlinkGuardian(actor, data);
});

export const linkClubGuardian = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { userId: string; swimmerId: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return linkGuardian(actor, data);
});

export const revokeClubInvite = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return revokeInvite(actor, data);
});

export const recreateClubInvite = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return recreateInvite(actor, data);
});

export const listClubAdminHandoff = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const actor = await requireClub(context.userId);
  return listAdminHandoff(actor);
});

export const getPublicClubContact = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  try {
    const id = await resolveRequestClub(sql);
    return loadPublicClubContact(sql, id ?? undefined);
  } catch (err) {
    if (err instanceof UnknownClubHostError) return null;
    throw err;
  }
});

export const saveClubSupportContact = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { email?: string; phone?: string; url?: string }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return saveClubSupport(actor, data);
});

export const submitClubAccessHelp = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { kind: "missing_child" | "wrong_link" | "access"; message: string }) => input).handler(async ({ context, data }) => {
  const actor = data.kind === "access" ? await loadClub(context.userId) : await requireClub(context.userId);
  return submitAccessHelp(actor, data);
});

export const listMyClubAccessHelp = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const actor = await loadClub(context.userId);
  return listMyAccessHelp(actor);
});

export const listClubAccessHelp = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const actor = await requireClub(context.userId);
  return listAccessHelp(actor);
});

export const resolveClubAccessHelp = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return resolveAccessHelp(actor, data);
});
