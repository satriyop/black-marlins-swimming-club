import { z } from "zod";
import { COMPETITION_STROKES, DISTANCES } from "./constants";

export const registrationLabels = {
  legacy: "Catatan lama — persetujuan belum diverifikasi",
  proposed: "Usulan pelatih — menunggu wali",
  requested: "Menunggu keputusan pelatih",
  approved: "Disetujui pelatih — belum diajukan ke panitia",
  rejected: "Ditolak pelatih",
  submitted: "Pengajuan ke panitia dicatat — menunggu konfirmasi",
  confirmed: "Konfirmasi panitia dicatat",
  declined: "Wali tidak ikut",
  withdrawn: "Ditarik",
} as const;
export type RegistrationStatus = keyof typeof registrationLabels;
export const responseLabels = {
  pending: "Belum merespons",
  yes: "Bersedia ikut",
  no: "Tidak ikut",
  withdrawn: "Mengundurkan diri",
} as const;
const id = z.number().int().positive();
const note = z.string().trim().min(1, "Alasan atau bukti wajib diisi").max(2000);
export const eventChoiceSchema = z.object({
  stroke: z.string().refine((s) => COMPETITION_STROKES.some((v) => v.id === s), "Gaya tidak valid"),
  distanceM: z
    .number()
    .refine((d) => (DISTANCES as readonly number[]).includes(d), "Jarak tidak valid"),
});
const base = z.object({ meetId: id, expectedRevision: id });
export const openRegistrationSchema = base.extend({
  deadline: z.string().datetime({ offset: true }),
  swimmers: z
    .array(z.object({ swimmerId: id, groupName: z.string().trim().min(1).max(100) }))
    .min(1)
    .max(1000),
  events: z.array(eventChoiceSchema).min(1).max(100),
});
export const proposeEntrySchema = base.extend({
  entryId: id.optional(),
  swimmerId: id,
  stroke: eventChoiceSchema.shape.stroke,
  distanceM: eventChoiceSchema.shape.distanceM,
  seedTimeMs: z.number().int().positive().max(86400000).nullable().optional(),
});
export const respondRegistrationSchema = base.extend({
  swimmerId: id,
  response: z.enum(["yes", "no", "withdrawn"]),
  reason: z.string().trim().max(2000).optional(),
});
export const decideEntrySchema = base.extend({
  entryId: id,
  action: z.enum(["approve", "reject", "withdraw", "submit", "confirm"]),
  note: z.string().trim().max(2000).optional(),
});
export const lockRegistrationSchema = base;
export const reopenRegistrationSchema = base.extend({
  deadline: z.string().datetime({ offset: true }),
  reason: note,
});
export const exportRegistrationSchema = base;
export type RegistrationView = {
  state: "draft" | "open" | "locked";
  deadline: string | null;
  revision: number;
  editable: boolean;
  staff: boolean;
  candidates: {
    swimmerId: number;
    name: string;
    groupName: string;
    response: keyof typeof responseLabels;
    reason: string | null;
    canRespond: boolean;
  }[];
  events: { stroke: string; distanceM: number }[];
  history: {
    id: number;
    swimmerId: number | null;
    entryId: number | null;
    revision: number;
    action: string;
    actorName: string;
    note: string | null;
    at: string;
  }[];
};
