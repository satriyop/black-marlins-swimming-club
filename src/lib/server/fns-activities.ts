import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import { hatsFor } from "@/lib/club/hats";
import { canWriteActivity } from "@/lib/club/permissions";
import { deleteActivity as deleteActivityFor } from "@/lib/club/writes";
import type { Activity } from "@/lib/swim/types";

export const listActivities = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const { sql, clubId } = await requireClub(context.userId);
  const rows = await sql<{
    id: number; title: string; kind: string; activity_date: string; start_time: string | null;
    end_time: string | null; location: string | null; description: string | null;
  }>`select * from activities where club_id = ${clubId} order by activity_date desc, start_time desc nulls last`;
  return rows.map((a): Activity => ({
    id: a.id, title: a.title, kind: a.kind, activityDate: a.activity_date,
    startTime: a.start_time, endTime: a.end_time, location: a.location, description: a.description,
  }));
});

export const saveActivity = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: {
  id?: number; title: string; kind: string; activityDate: string; startTime?: string; endTime?: string; location?: string; description?: string;
}) => {
  if (!input.title.trim()) throw new Error("Judul wajib diisi");
  if (!input.activityDate) throw new Error("Tanggal wajib diisi");
  return input;
}).handler(async ({ context, data }) => {
  const { sql, clubId, userId } = await requireClub(context.userId);
  const hats = await hatsFor({ sql, userId });
  if (!canWriteActivity(hats)) throw new Error("Tidak diizinkan");
  if (data.id) {
    await sql`update activities set title = ${data.title.trim()}, kind = ${data.kind}, activity_date = ${data.activityDate}, start_time = ${data.startTime || null}, end_time = ${data.endTime || null}, location = ${data.location?.trim() || null}, description = ${data.description?.trim() || null} where id = ${data.id} and club_id = ${clubId}`;
    return { id: data.id };
  }
  const rows = await sql<{ id: number }>`insert into activities (club_id, title, kind, activity_date, start_time, end_time, location, description) values (${clubId}, ${data.title.trim()}, ${data.kind}, ${data.activityDate}, ${data.startTime || null}, ${data.endTime || null}, ${data.location?.trim() || null}, ${data.description?.trim() || null}) returning id`;
  return { id: rows[0]!.id };
});

export const deleteActivity = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input: { id: number }) => input).handler(async ({ context, data }) => {
  const actor = await requireClub(context.userId);
  return deleteActivityFor(actor, data.id);
});
