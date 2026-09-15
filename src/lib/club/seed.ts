import type { Sql } from "@/lib/db";

export const SATRIYO_ID = "usr_satriyo";
export const AZKIYA_ID = "usr_azkiya";
export const RATIH_ID = "usr_ratih";

// Synthetic fixture data only -- used for the in-memory PGLite demo preview and the test
// harness, never for real production seeding. See scripts/seed-club.mjs for that.
export const SATRIYO_EMAIL = "superadmin@example.com";
export const AZKIYA_EMAIL = "admin.klub@example.com";
export const RATIH_EMAIL = "wali@example.com";

type SeedSwimmer = {
  fullName: string;
  nickname: string;
  dateOfBirth: string;
  gender: "putra" | "putri";
  status: "aktif" | "cuti" | "alumni";
  joinDate: string;
  notes: string;
};

const BASE_SWIMMERS: SeedSwimmer[] = [
  {
    fullName: "Perenang Satu",
    nickname: "Kak Satu",
    dateOfBirth: "2012-05-15",
    gender: "putri",
    status: "aktif",
    joinDate: "2022-01-10",
    notes: "Bebas & punggung · contoh",
  },
  {
    fullName: "Perenang Dua",
    nickname: "Kak Dua",
    dateOfBirth: "2014-03-20",
    gender: "putra",
    status: "aktif",
    joinDate: "2023-02-06",
    notes: "Bebas & kupu · contoh",
  },
  {
    fullName: "Perenang Tiga",
    nickname: "Kak Tiga",
    dateOfBirth: "2014-09-10",
    gender: "putra",
    status: "aktif",
    joinDate: "2023-07-17",
    notes: "Punggung · contoh",
  },
];

function configuredDemoSwimmerCount(): number {
  if (typeof process === "undefined") return BASE_SWIMMERS.length;
  const parsed = Number.parseInt(process.env.VITE_DEMO_SWIMMER_COUNT ?? "", 10);
  if (!Number.isFinite(parsed)) return BASE_SWIMMERS.length;
  return Math.min(200, Math.max(BASE_SWIMMERS.length, parsed));
}

function seedSwimmers(): SeedSwimmer[] {
  return Array.from({ length: configuredDemoSwimmerCount() }, (_, index) => {
    if (index < BASE_SWIMMERS.length) return BASE_SWIMMERS[index]!;
    const number = index + 1;
    const month = (index % 12) + 1;
    const day = (index % 27) + 1;
    const year = 2007 + (index % 12);
    const status: SeedSwimmer["status"] =
      number % 17 === 0 ? "alumni" : number % 11 === 0 ? "cuti" : "aktif";
    return {
      fullName: `Perenang Demo ${String(number).padStart(2, "0")}`,
      nickname: `Demo ${String(number).padStart(2, "0")}`,
      dateOfBirth: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      gender: number % 2 === 0 ? "putri" : "putra",
      status,
      joinDate: `${2021 + (index % 5)}-${String(month).padStart(2, "0")}-01`,
      notes: "Data sintetis untuk uji tampilan roster besar",
    };
  });
}

async function ensureUser(
  sql: Sql,
  fallbackId: string,
  name: string,
  email: string,
): Promise<string> {
  const existing = await sql<{ id: string }>`select id from "user" where email = ${email} limit 1`;
  if (existing[0]) return existing[0].id;
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${fallbackId}, ${name}, ${email}, true, now(), now())
  `;
  return fallbackId;
}

export async function seedClub(sql: Sql): Promise<number> {
  const existing = await sql<{ id: number }>`select id from clubs limit 1`;
  if (existing[0]) return existing[0].id;

  const satriyoId = await ensureUser(sql, SATRIYO_ID, "Admin Utama", SATRIYO_EMAIL);
  const azkiyaId = await ensureUser(sql, AZKIYA_ID, "Admin Klub", AZKIYA_EMAIL);
  const ratihId = await ensureUser(sql, RATIH_ID, "Wali Contoh", RATIH_EMAIL);

  const clubs = await sql<{ id: number }>`
    insert into clubs (name, short_name, city, province, country, coach_name, venue, motto)
    values (
      'Black Marlins Swimming Club Klaten',
      'BMSC',
      'Klaten',
      'Jawa Tengah',
      'Indonesia',
      'Hardiyanto Wibowo',
      null,
      null
    )
    returning id
  `;
  const clubId = clubs[0]!.id;

  await sql`
    insert into club_staff (club_id, user_id, role) values
      (${clubId}, ${satriyoId}, 'superadmin'),
      (${clubId}, ${azkiyaId}, 'club_admin')
  `;

  const haveSwimmers = await sql<{
    n: number;
  }>`select count(*)::int as n from swimmers where club_id = ${clubId}`;
  if ((haveSwimmers[0]?.n ?? 0) === 0) {
    const params: unknown[] = [clubId];
    const values = seedSwimmers().map((swimmer) => {
      const first = params.length + 1;
      params.push(
        swimmer.fullName,
        swimmer.nickname,
        swimmer.dateOfBirth,
        swimmer.gender,
        swimmer.status,
        swimmer.joinDate,
        swimmer.notes,
      );
      return `($1, $${first}, $${first + 1}, $${first + 2}, $${first + 3}, 'Indonesia', 'Klaten', $${first + 4}, $${first + 5}, $${first + 6})`;
    });
    const swimmers = await sql.query<{ id: number; full_name: string }>(
      `insert into swimmers (club_id, full_name, nickname, date_of_birth, gender, nationality, city, status, join_date, notes)
       values ${values.join(", ")}
       returning id, full_name`,
      params,
    );
    for (const s of swimmers.filter((swimmer) =>
      BASE_SWIMMERS.some((base) => base.fullName === swimmer.full_name),
    )) {
      await sql`
        insert into guardians (user_id, swimmer_id) values
          (${satriyoId}, ${s.id}),
          (${ratihId}, ${s.id})
        on conflict (user_id, swimmer_id) do nothing
      `;
    }
  }

  await sql`
    insert into club_family (club_id, user_id) values
      (${clubId}, ${satriyoId}),
      (${clubId}, ${ratihId})
    on conflict do nothing
  `;

  return clubId;
}
