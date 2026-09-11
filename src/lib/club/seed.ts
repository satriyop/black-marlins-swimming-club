import type { Sql } from "@/lib/db";

export const SATRIYO_ID = "usr_satriyo";
export const AZKIYA_ID = "usr_azkiya";
export const RATIH_ID = "usr_ratih";

export const SATRIYO_EMAIL = "satriyopamungkas@gmail.com";
export const AZKIYA_EMAIL = "azkiyakhayladwrd04@gmail.com";
export const RATIH_EMAIL = "ratihsasminta@gmail.com";

export async function seedClub(sql: Sql): Promise<number> {
  const existing = await sql<{ id: number }>`select id from clubs limit 1`;
  if (existing[0]) return existing[0].id;

  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values
      (${SATRIYO_ID}, 'Satriyo', ${SATRIYO_EMAIL}, true, now(), now()),
      (${AZKIYA_ID}, 'Azkiya', ${AZKIYA_EMAIL}, true, now(), now()),
      (${RATIH_ID}, 'Ratih', ${RATIH_EMAIL}, true, now(), now())
  `;

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
      (${clubId}, ${SATRIYO_ID}, 'superadmin'),
      (${clubId}, ${AZKIYA_ID}, 'club_admin')
  `;

  const swimmers = await sql<{ id: number; full_name: string }>`
    insert into swimmers (club_id, full_name, date_of_birth, gender, nationality, city, status)
    values
      (${clubId}, 'Ken Athaya Nirwasita', '2012-06-30', 'putri', 'Indonesia', 'Klaten', 'aktif'),
      (${clubId}, 'Luigi Banyu Pamungkas', '2014-06-05', 'putra', 'Indonesia', 'Klaten', 'aktif'),
      (${clubId}, 'Kun Bumi Pamungkas', '2014-06-05', 'putra', 'Indonesia', 'Klaten', 'aktif')
    returning id, full_name
  `;

  for (const s of swimmers) {
    await sql`
      insert into guardians (user_id, swimmer_id) values
        (${SATRIYO_ID}, ${s.id}),
        (${RATIH_ID}, ${s.id})
    `;
  }

  return clubId;
}
