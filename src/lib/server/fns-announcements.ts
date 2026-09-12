import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import {
  createAnnouncement as createAnnouncementFor,
  getAnnouncement as getAnnouncementFor,
  listAnnouncements as listAnnouncementsFor,
} from "@/lib/club/announcements";

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireClub(context.userId);
    return listAnnouncementsFor(actor);
  });

export const getAnnouncement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ context, data }) => {
    const actor = await requireClub(context.userId);
    return getAnnouncementFor(actor, data.id);
  });

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    title: string;
    body: string;
    important?: boolean;
    practiceId?: number | null;
    meetId?: number | null;
    dueOn?: string | null;
  }) => {
    if (!input.title.trim()) throw new Error("Judul wajib diisi");
    if (!input.body.trim()) throw new Error("Isi wajib diisi");
    return input;
  })
  .handler(async ({ context, data }) => {
    const actor = await requireClub(context.userId);
    return createAnnouncementFor(actor, data);
  });
