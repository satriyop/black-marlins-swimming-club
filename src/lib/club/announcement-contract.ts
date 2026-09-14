import { z } from "zod";
const id = z.number().int().positive();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid")
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }, "Tanggal tidak valid");
export const announcementContentSchema = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi").max(200, "Judul maksimal 200 karakter"),
  body: z.string().trim().min(1, "Isi wajib diisi").max(20000, "Isi terlalu panjang"),
  important: z.boolean().optional().default(false),
  practiceId: id.nullable().optional().default(null),
  meetId: id.nullable().optional().default(null),
  dueOn: date.nullable().optional().default(null),
});
export const announcementActionSchema = z.object({ id, expectedRevision: id });
export const editAnnouncementSchema = announcementContentSchema.extend({
  id,
  expectedRevision: id,
  reason: z.string().trim().min(1, "Alasan koreksi wajib diisi").max(2000),
});
export const archiveAnnouncementSchema = announcementActionSchema.extend({
  reason: z.string().trim().min(1, "Alasan pengarsipan wajib diisi").max(2000),
});
export const announcementIdSchema = z.object({ id });
export type AnnouncementContent = z.input<typeof announcementContentSchema>;
export type AnnouncementListItem = {
  id: number;
  title: string;
  important: boolean;
  dueOn: string | null;
  practiceId: number | null;
  meetId: number | null;
  createdAt: string;
  createdByName: string;
  unread: boolean;
  revision: number;
  updatedAt: string;
  archivedAt: string | null;
  needsAcknowledgement: boolean;
  acknowledgedAt: string | null;
};
export type AnnouncementReceipts = {
  expected: number;
  opened: number;
  acknowledged: number;
  notOpened: string[];
  outstanding: string[];
};
export type AnnouncementDetail = AnnouncementListItem & {
  body: string;
  practiceTitle: string | null;
  meetName: string | null;
  receipts: AnnouncementReceipts | null;
  openedAt: string | null;
  canAcknowledge: boolean;
  inAudience: boolean;
  canEdit: boolean;
  archiveNote: string | null;
  archivedByName: string | null;
  audienceCapturedAt: string;
  audienceOrigin: string;
  revisions: {
    revision: number;
    title: string;
    body: string;
    important: boolean;
    dueOn: string | null;
    practiceId: number | null;
    meetId: number | null;
    reason: string;
    changedByName: string;
    createdAt: string;
    acknowledgedAt: string | null;
  }[];
};
