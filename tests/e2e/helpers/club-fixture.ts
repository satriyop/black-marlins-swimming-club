import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";
import type { BrowserContext } from "@playwright/test";

/** Only synthetic rows in a local test database; cleanup never touches pre-existing records. */
export async function createClubFixture(role: "guardian" | "coach" | "combined" = "combined") {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("Browser fixtures require an explicit local DATABASE_URL");
  }
  const pool = new Pool({ connectionString: url });
  const userId = `visual-${randomUUID()}`;
  const email = `${userId}@example.test`;
  const name = "Pengguna Contoh Dengan Nama Panjang Untuk Pemeriksaan Antarmuka";
  const password = randomUUID();
  let clubId: number | undefined;
  try {
    const club = await pool.query(
      `insert into clubs (name, short_name, city, province, coach_name) values ('Klub Contoh Visual', 'BMSC', 'Klaten', 'Jateng', 'Pelatih Contoh') returning id`,
    );
    clubId = club.rows[0].id;
    await pool.query(
      'insert into "user" (id,name,email,"emailVerified",image) values ($1,$2,$3,true,$4)',
      [userId, name, email, "/missing-visual-avatar.jpg"],
    );
    await pool.query(
      'insert into account (id,"accountId","providerId","userId",password,"updatedAt") values ($1,$1,\'credential\',$1,$2,now())',
      [userId, await hashPassword(password)],
    );
    if (role !== "guardian")
      await pool.query("insert into club_staff (club_id,user_id,role) values ($1,$2,$3)", [
        clubId,
        userId,
        role === "coach" ? "coach" : "club_admin",
      ]);
    if (role !== "coach")
      await pool.query("insert into club_family (club_id,user_id) values ($1,$2)", [
        clubId,
        userId,
      ]);
    await pool.query(
      "insert into user_club_prefs (user_id,task_view,welcome_dismissed_at,grants_acked_at) values ($1,$2,now(),now())",
      [userId, role === "guardian" ? "family" : "club"],
    );
    const swimmer = await pool.query(
      "insert into swimmers (club_id, full_name, date_of_birth, gender) values ($1,'Perenang Contoh','2014-06-01','putra') returning id",
      [clubId],
    );
    const swimmerId = swimmer.rows[0].id as number;
    if (role !== "coach")
      await pool.query("insert into guardians (user_id,swimmer_id) values ($1,$2)", [
        userId,
        swimmerId,
      ]);
    const practice = await pool.query(
      "insert into practices (club_id, session_date, start_time, location, kind, title, status) values ($1,current_date,'16:00','Kolam contoh','renang','Latihan Contoh Visual','in_progress') returning id",
      [clubId],
    );
    const practiceId = practice.rows[0].id as number;
    await pool.query(
      "insert into practice_attendance (club_id,practice_id,swimmer_id,status) values ($1,$2,$3,'hadir')",
      [clubId, practiceId, swimmerId],
    );
    for (const [date, time] of [
      ["2026-08-01", 38000],
      ["2026-09-01", 37000],
    ]) {
      await pool.query(
        "insert into results (club_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,kind) values ($1,$2,$3,'bebas',50,'50',$4,'test')",
        [clubId, swimmerId, date, time],
      );
    }
    return {
      name,
      email,
      swimmerId,
      practiceId,
      async signIn(context: BrowserContext, baseURL: string) {
        const response = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
          data: { email, password },
          headers: { Origin: baseURL },
        });
        if (!response.ok())
          throw new Error(`Fixture sign-in failed: ${response.status()} ${await response.text()}`);
        const token = response.headers()["set-auth-token"];
        if (!token) throw new Error("Fixture sign-in did not return a bearer session");
        await context.addInitScript(
          (value) => sessionStorage.setItem("bmsc.auth.bearer-token", value),
          token,
        );
      },
      async cleanup() {
        await pool.query("delete from clubs where id=$1", [clubId]);
        await pool.query('delete from "user" where id=$1', [userId]);
        await pool.end();
      },
    };
  } catch (error) {
    if (clubId) await pool.query("delete from clubs where id=$1", [clubId]);
    await pool.query('delete from "user" where id=$1', [userId]);
    await pool.end();
    throw error;
  }
}
