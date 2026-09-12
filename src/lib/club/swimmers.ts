import { mapSwimmer, type SwimmerRow } from "@/lib/server/fns-shared";
import type { Swimmer } from "@/lib/swim/types";
import type { Actor } from "./actor";
import { canSeeAllSwimmers, hatsFor } from "./hats";
import { clubIdFor } from "./membership";
import { canCreateClubSwimmer, canEnrollOwnChild, canWriteRoster } from "./permissions";

export type SaveSwimmerInput = {
  id?: number;
  fullName: string;
  nickname?: string;
  dateOfBirth: string;
  gender: "putra" | "putri";
  city?: string;
  status: "aktif" | "cuti" | "alumni";
  joinDate?: string;
  notes?: string;
  asChild?: boolean;
  confirmSimilar?: boolean;
};

export async function listSwimmers(actor: Actor): Promise<Swimmer[]> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) return [];
  const hats = await hatsFor(actor);
  if (canSeeAllSwimmers(hats)) {
    const rows = await actor.sql<SwimmerRow>`
      select * from swimmers where club_id = ${clubId} order by date_of_birth, full_name
    `;
    return rows.map(mapSwimmer);
  }
  const allowed = new Set([
    ...hats.guardianSwimmerIds,
    ...(hats.selfSwimmerId != null ? [hats.selfSwimmerId] : []),
  ]);
  if (allowed.size === 0) return [];
  const rows = await actor.sql<SwimmerRow>`
    select * from swimmers where club_id = ${clubId} order by date_of_birth, full_name
  `;
  return rows.filter((r) => allowed.has(r.id)).map(mapSwimmer);
}

export async function saveSwimmer(actor: Actor, data: SaveSwimmerInput): Promise<{ id: number }> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) throw new Error("Tidak diizinkan");
  const hats = await hatsFor(actor);
  if (data.id) {
    if (!canWriteRoster(hats, data.id)) throw new Error("Tidak diizinkan");
    await actor.sql`update swimmers set full_name = ${data.fullName}, nickname = ${data.nickname?.trim() || null}, date_of_birth = ${data.dateOfBirth}, gender = ${data.gender}, city = ${data.city?.trim() || null}, status = ${data.status}, join_date = ${data.joinDate || null}, notes = ${data.notes?.trim() || null} where id = ${data.id} and club_id = ${clubId}`;
    return { id: data.id };
  }
  const asChild = data.asChild === true;
  if (asChild) {
    if (!canEnrollOwnChild(hats)) throw new Error("Tidak diizinkan");
  } else if (!canCreateClubSwimmer(hats)) {
    throw new Error("Tidak diizinkan");
  }
  const similar = await actor.sql<{ n: number }>`
    select count(*)::int as n from swimmers
    where club_id = ${clubId}
      and lower(full_name) = ${data.fullName.toLowerCase()}
      and date_of_birth = ${data.dateOfBirth}
  `;
  if ((similar[0]?.n ?? 0) > 0) {
    if (!canCreateClubSwimmer(hats)) {
      throw new Error("Ada perenang dengan nama dan tanggal lahir mirip. Hubungi admin.");
    }
    if (!data.confirmSimilar) {
      throw new Error("Ada perenang dengan nama dan tanggal lahir mirip. Simpan lagi untuk tetap menambahkan.");
    }
  }
  const insertSwimmer = () =>
    actor.sql<{ id: number }>`
      insert into swimmers (club_id, full_name, nickname, date_of_birth, gender, nationality, city, status, join_date, notes)
      values (
        ${clubId},
        ${data.fullName},
        ${data.nickname?.trim() || null},
        ${data.dateOfBirth},
        ${data.gender},
        'Indonesia',
        ${data.city?.trim() || null},
        ${data.status},
        ${data.joinDate || null},
        ${data.notes?.trim() || null}
      )
      returning id
    `;
  if (!asChild) {
    const rows = await insertSwimmer();
    return { id: rows[0]!.id };
  }
  await actor.sql.query("begin");
  try {
    const rows = await insertSwimmer();
    const id = rows[0]!.id;
    await actor.sql`
      insert into club_family (club_id, user_id)
      values (${clubId}, ${actor.userId})
      on conflict (club_id, user_id) do nothing
    `;
    await actor.sql`
      insert into guardians (user_id, swimmer_id)
      values (${actor.userId}, ${id})
      on conflict (user_id, swimmer_id) do nothing
    `;
    await actor.sql.query("commit");
    return { id };
  } catch (err) {
    try {
      await actor.sql.query("rollback");
    } catch {
      /* keep */
    }
    throw err;
  }
}
