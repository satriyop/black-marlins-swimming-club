import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import {
  createAnnouncement as createAnnouncementFor,
  getAnnouncement as getAnnouncementFor,
  listAnnouncements as listAnnouncementsFor,
  acknowledgeAnnouncement as acknowledgeAnnouncementFor,
  editAnnouncement as editAnnouncementFor,
  archiveAnnouncement as archiveAnnouncementFor,
  announcementContexts,
} from "@/lib/club/announcements";
import {
  announcementContentSchema,
  announcementIdSchema,
  announcementActionSchema,
  editAnnouncementSchema,
  archiveAnnouncementSchema,
} from "@/lib/club/announcement-contract";

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => listAnnouncementsFor(await requireClub(context.userId)));
export const getAnnouncement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => announcementIdSchema.parse(input))
  .handler(async ({ context, data }) =>
    getAnnouncementFor(await requireClub(context.userId), data.id),
  );
export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => announcementContentSchema.parse(input))
  .handler(async ({ context, data }) =>
    createAnnouncementFor(await requireClub(context.userId), data),
  );
export const acknowledgeAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => announcementActionSchema.parse(input))
  .handler(async ({ context, data }) =>
    acknowledgeAnnouncementFor(await requireClub(context.userId), data),
  );
export const editAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => editAnnouncementSchema.parse(input))
  .handler(async ({ context, data }) =>
    editAnnouncementFor(await requireClub(context.userId), data),
  );
export const archiveAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => archiveAnnouncementSchema.parse(input))
  .handler(async ({ context, data }) =>
    archiveAnnouncementFor(await requireClub(context.userId), data),
  );
export const getAnnouncementContexts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => announcementContexts(await requireClub(context.userId)));
