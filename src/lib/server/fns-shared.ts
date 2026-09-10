import { getSql } from "@/lib/db";
import { ageAtYearEnd, ageGroupForDob, calendarAge } from "@/lib/swim/age";
import type { Club, Swimmer } from "@/lib/swim/types";

export type Sql = Awaited<ReturnType<typeof getSql>>;

export type SwimmerRow = {
  id: number;
  full_name: string;
  nickname: string | null;
  date_of_birth: string;
  gender: "putra" | "putri";
  nationality: string;
  city: string | null;
  status: "aktif" | "cuti" | "alumni";
  join_date: string | null;
  notes: string | null;
};

export function mapSwimmer(r: SwimmerRow): Swimmer {
  const ag = ageGroupForDob(r.date_of_birth);
  return {
    id: r.id,
    fullName: r.full_name,
    nickname: r.nickname,
    dateOfBirth: r.date_of_birth,
    gender: r.gender,
    nationality: r.nationality,
    city: r.city,
    status: r.status,
    joinDate: r.join_date,
    notes: r.notes,
    age: calendarAge(r.date_of_birth),
    ageYearEnd: ageAtYearEnd(r.date_of_birth),
    ageGroupId: ag.id,
    ageGroupLabel: ag.label,
    ageGroupRange: ag.range,
  };
}

export async function clubOf(sql: Sql, userId: string): Promise<Club> {
  const rows = await sql<{
    id: number; user_id: string; name: string; short_name: string; city: string;
    province: string; country: string; coach_name: string; venue: string | null; motto: string | null;
  }>`select * from clubs where user_id = ${userId} limit 1`;
  const c = rows[0];
  if (!c) throw new Error("Klub tidak ditemukan");
  return {
    id: c.id, userId: c.user_id, name: c.name, shortName: c.short_name,
    city: c.city, province: c.province, country: c.country,
    coachName: c.coach_name, venue: c.venue, motto: c.motto,
  };
}

export async function swimmersOf(sql: Sql, userId: string): Promise<Swimmer[]> {
  const rows = await sql<SwimmerRow>`
    select * from swimmers where user_id = ${userId} order by date_of_birth, full_name
  `;
  return rows.map(mapSwimmer);
}
