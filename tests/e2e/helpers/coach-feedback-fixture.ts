import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { BrowserContext } from "@playwright/test";

export async function createCoachFeedbackFixture() {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("Browser fixtures require an explicit local DATABASE_URL");
  }
  const pool = new Pool({ connectionString: url });
  const token = randomUUID();
  const coachId = `feedback-coach-${token}`;
  const guardianId = `feedback-guardian-${token}`;
  let clubId: number | undefined;
  try {
    await pool.query(
      'insert into "user" (id,name,email,"emailVerified") values ($1,$2,$3,true),($4,$5,$6,true)',
      [
        coachId,
        "Pelatih Catatan",
        `${coachId}@example.test`,
        guardianId,
        "Wali Catatan",
        `${guardianId}@example.test`,
      ],
    );
    clubId = (
      await pool.query(
        "insert into clubs(name,short_name,city,province,coach_name) values ('Klub Catatan','KC','Klaten','Jawa Tengah','Pelatih') returning id",
      )
    ).rows[0].id;
    await pool.query("insert into club_staff(club_id,user_id,role) values ($1,$2,'coach')", [
      clubId,
      coachId,
    ]);
    await pool.query("insert into club_family(club_id,user_id) values ($1,$2)", [
      clubId,
      guardianId,
    ]);
    const swimmerId = (
      await pool.query(
        "insert into swimmers(club_id,full_name,date_of_birth,gender) values ($1,'Perenang Catatan','2012-01-01','putra') returning id",
        [clubId],
      )
    ).rows[0].id as number;
    await pool.query("insert into guardians(user_id,swimmer_id) values ($1,$2)", [
      guardianId,
      swimmerId,
    ]);
    const practiceId = (
      await pool.query(
        "insert into practices(club_id,session_date,kind,title,status) values ($1,'2026-09-10','renang','Latihan Teknik Selesai','completed') returning id",
        [clubId],
      )
    ).rows[0].id as number;
    await pool.query(
      "insert into practice_attendance(club_id,practice_id,swimmer_id,status) values ($1,$2,$3,'hadir')",
      [clubId, practiceId, swimmerId],
    );

    return {
      swimmerId,
      async signIn(context: BrowserContext, role: "coach" | "guardian") {
        const bearer = randomUUID();
        await pool.query(
          'insert into session(id,token,"userId","expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'1 hour\',now())',
          [randomUUID(), bearer, role === "coach" ? coachId : guardianId],
        );
        await context.addInitScript(
          (value) => sessionStorage.setItem("bmsc.auth.bearer-token", value),
          bearer,
        );
      },
      async cleanup() {
        await pool.query("delete from clubs where id=$1", [clubId]);
        await pool.query('delete from "user" where id=any($1)', [[coachId, guardianId]]);
        await pool.end();
      },
    };
  } catch (error) {
    if (clubId) await pool.query("delete from clubs where id=$1", [clubId]);
    await pool.query('delete from "user" where id=any($1)', [[coachId, guardianId]]);
    await pool.end();
    throw error;
  }
}
