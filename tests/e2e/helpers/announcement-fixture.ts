import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { BrowserContext } from "@playwright/test";

export async function createAnnouncementFixture() {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
    throw new Error("Announcement fixtures require local PostgreSQL");
  const pool = new Pool({ connectionString: url });
  const token = randomUUID();
  const author = `author-${token}`,
    parent = `parent-${token}`,
    coach = `coach-${token}`;
  const club = await pool.query(
    "insert into clubs(name,short_name,city,province,coach_name) values ('Klub Pengumuman Uji','UJI','Klaten','Jateng','Pelatih') returning id",
  );
  const clubId = club.rows[0].id as number;
  for (const [id, name, view] of [
    [author, "Pelatih Penulis", "club"],
    [parent, "Wali Contoh", "family"],
    [coach, "Pelatih Lain", "club"],
  ]) {
    await pool.query('insert into "user"(id,name,email,"emailVerified") values ($1,$2,$3,true)', [
      id,
      name,
      `${id}@example.test`,
    ]);
    await pool.query(
      "insert into user_club_prefs(user_id,task_view,welcome_dismissed_at,grants_acked_at) values ($1,$2,now(),now())",
      [id, view],
    );
  }
  await pool.query(
    "insert into club_staff(club_id,user_id,role) values ($1,$2,'coach'),($1,$3,'coach')",
    [clubId, author, coach],
  );
  await pool.query("insert into club_family(club_id,user_id) values ($1,$2)", [clubId, parent]);
  const child = await pool.query(
    "insert into swimmers(club_id,full_name,date_of_birth,gender) values ($1,'Anak Contoh','2014-01-01','putra') returning id",
    [clubId],
  );
  await pool.query("insert into guardians(user_id,swimmer_id) values ($1,$2)", [
    parent,
    child.rows[0].id,
  ]);
  const practice = await pool.query(
    "insert into practices(club_id,title,session_date,start_time,kind,location,status,cancel_reason) values ($1,'Latihan Pagi Uji','2099-01-01','06:30','renang','Kolam Uji','cancelled','Kolam ditutup') returning id",
    [clubId],
  );
  const meet = await pool.query(
    "insert into meets(club_id,name,level,course,start_date) values ($1,'Kejuaraan Uji','klub','50','2099-01-02') returning id",
    [clubId],
  );
  return {
    pool,
    clubId,
    author,
    parent,
    practiceId: practice.rows[0].id as number,
    meetId: meet.rows[0].id as number,
    async signIn(context: BrowserContext, role: "author" | "parent" | "coach") {
      const bearer = randomUUID();
      await pool.query(
        'insert into session(id,token,"userId","expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'1 hour\',now())',
        [randomUUID(), bearer, role === "author" ? author : role === "parent" ? parent : coach],
      );
      await context.addInitScript(
        (value) => sessionStorage.setItem("bmsc.auth.bearer-token", value),
        bearer,
      );
    },
    async post() {
      return (
        await pool.query("select id from announcements where club_id=$1 order by id desc limit 1", [
          clubId,
        ])
      ).rows[0].id as number;
    },
    async cleanup() {
      await pool.query("delete from clubs where id=$1", [clubId]);
      await pool.query('delete from "user" where id=any($1)', [[author, parent, coach]]);
      await pool.end();
    },
  };
}
