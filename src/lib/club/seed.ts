import type { Sql } from "@/lib/db";

export const SATRIYO_ID = "usr_satriyo";
export const AZKIYA_ID = "usr_azkiya";
export const RATIH_ID = "usr_ratih";

export const SATRIYO_EMAIL = "satriyopamungkas@gmail.com";
export const AZKIYA_EMAIL = "azkiyakhayladwrd04@gmail.com";
export const RATIH_EMAIL = "ratihsasminta@gmail.com";

async function ensureUser(sql: Sql, fallbackId: string, name: string, email: string): Promise<string> {
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

  const satriyoId = await ensureUser(sql, SATRIYO_ID, "Satriyo", SATRIYO_EMAIL);
  const azkiyaId = await ensureUser(sql, AZKIYA_ID, "Azkiya", AZKIYA_EMAIL);
  const ratihId = await ensureUser(sql, RATIH_ID, "Ratih", RATIH_EMAIL);

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

  const haveSwimmers = await sql<{ n: number }>`select count(*)::int as n from swimmers where club_id = ${clubId}`;
  if ((haveSwimmers[0]?.n ?? 0) === 0) {
    const swimmers = await sql<{ id: number }>`
      insert into swimmers (club_id, full_name, nickname, date_of_birth, gender, nationality, city, status, notes)
      values
        (${clubId}, 'Ken Athaya Nirwasita', 'Kak Ken', '2012-06-30', 'putri', 'Indonesia', 'Klaten', 'aktif', 'Bebas & punggung · Popda 2026'),
        (${clubId}, 'Luigi Banyu Pamungkas', 'Mas Banyu', '2014-06-05', 'putra', 'Indonesia', 'Klaten', 'aktif', 'Bebas & kupu · elite youth'),
        (${clubId}, 'Kun Bumi Pamungkas', 'Mas Bumi', '2014-06-05', 'putra', 'Indonesia', 'Klaten', 'aktif', 'Punggung · elite youth')
      returning id
    `;
    for (const s of swimmers) {
      await sql`
        insert into guardians (user_id, swimmer_id) values
          (${satriyoId}, ${s.id}),
          (${ratihId}, ${s.id})
        on conflict (user_id, swimmer_id) do nothing
      `;
    }
  }

  return clubId;
}
