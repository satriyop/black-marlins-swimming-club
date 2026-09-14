import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { BrowserContext } from "@playwright/test";

export type ClubFixtureOptions = {
  childCount?: number;
  extraSquad?: number;
  practice?: "scheduled" | "none" | "cancelled" | "completed";
  importantNotices?: number;
  results?: boolean;
};

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

/** Only synthetic rows in a local test database; cleanup never touches pre-existing records. */
export async function createClubFixture(
  role: "guardian" | "coach" | "combined" = "combined",
  options: ClubFixtureOptions = {},
) {
  const url = process.env.DATABASE_URL;
  if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("Browser fixtures require an explicit local DATABASE_URL");
  }
  const pool = new Pool({ connectionString: url });
  const userId = `visual-${randomUUID()}`;
  const email = `${userId}@example.test`;
  const name = "Pengguna Contoh Dengan Nama Panjang Untuk Pemeriksaan Antarmuka";
  let clubId: number | undefined;
  try {
    const club = await pool.query(
      `insert into clubs (name, short_name, city, province, coach_name) values ('Klub Contoh Visual', 'BMSC', 'Klaten', 'Jateng', 'Pelatih Contoh') returning id`,
    );
    clubId = club.rows[0].id;
    await pool.query(
      'insert into "user" (id,name,email,"emailVerified",image) values ($1,$2,$3,true,$4)',
      [userId, name, email, role === "guardian" ? null : "/missing-visual-avatar.jpg"],
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
    const extraSquad = options.extraSquad ?? 0;
    for (let i = 0; i < extraSquad; i += 1) {
      await pool.query(
        "insert into swimmers (club_id, full_name, date_of_birth, gender) values ($1,$2,'2008-01-01','putra')",
        [clubId, `Skuad Lebih Awal ${String(i + 1).padStart(2, "0")}`],
      );
    }
    const childCount = options.childCount ?? (role === "coach" ? 0 : 1);
    const childIds: number[] = [];
    for (let i = 0; i < childCount; i += 1) {
      const child = await pool.query(
        "insert into swimmers (club_id, full_name, nickname, date_of_birth, gender) values ($1,$2,$3,'2014-06-01','putra') returning id",
        [
          clubId,
          i === 0 ? "Perenang Contoh" : `Anak Tambahan ${i + 1} Dengan Nama Panjang`,
          i === 0 ? null : `Niko ${i + 1}`,
        ],
      );
      childIds.push(child.rows[0].id as number);
      if (role !== "coach")
        await pool.query("insert into guardians (user_id,swimmer_id) values ($1,$2)", [
          userId,
          childIds[i],
        ]);
    }
    const swimmerId = childIds[0];
    const practiceKind = options.practice ?? "scheduled";
    let practiceId: number | undefined;
    if (practiceKind !== "none") {
      const practiceDate = jakartaToday();
      const weekday = new Date(`${practiceDate}T00:00:00Z`).getUTCDay() || 7;
      const series = await pool.query(
        "insert into practice_series (club_id,title,weekday,start_time,duration_min,location,kind,start_date) values ($1,'Latihan Contoh Visual',$2,'16:00',90,'Kolam contoh dengan nama lokasi yang panjang untuk pemeriksaan antarmuka','renang',$3::date) returning id",
        [clubId, weekday, practiceDate],
      );
      const status =
        practiceKind === "cancelled"
          ? "cancelled"
          : practiceKind === "completed"
            ? "completed"
            : "in_progress";
      const practice = await pool.query(
        "insert into practices (club_id, session_date, start_time, location, kind, title, status, cancel_reason, series_id, occurrence_date) values ($1,$2::date,'16:00','Kolam contoh dengan nama lokasi yang panjang untuk pemeriksaan antarmuka','renang','Latihan Contoh Visual',$3,$4,$5,$2::date) returning id",
        [
          clubId,
          practiceDate,
          status,
          practiceKind === "cancelled" ? "Hujan petir di kolam" : null,
          series.rows[0].id,
        ],
      );
      practiceId = practice.rows[0].id as number;
      if (swimmerId)
        await pool.query(
          "insert into practice_attendance (club_id,practice_id,swimmer_id,status) values ($1,$2,$3,'hadir')",
          [clubId, practiceId, swimmerId],
        );
    }
    if (options.results !== false && swimmerId) {
      for (const [date, time] of [
        ["2026-08-01", 38000],
        ["2026-09-01", 37000],
      ]) {
        await pool.query(
          "insert into results (club_id,swimmer_id,result_date,stroke,distance_m,course,time_ms,kind) values ($1,$2,$3,'bebas',50,'50',$4,'test')",
          [clubId, swimmerId, date, time],
        );
      }
    }
    const importantNotices = options.importantNotices ?? 0;
    for (let i = 0; i < importantNotices; i += 1) {
      await pool.query(
        "insert into announcements (club_id, title, body, important, created_by) values ($1,$2,$3,true,$4)",
        [clubId, `Pengumuman penting ${i + 1}`, "Isi pengumuman contoh.", userId],
      );
    }
    return {
      name,
      email,
      swimmerId,
      practiceId,
      async signIn(context: BrowserContext, _baseURL: string) {
        // Authenticate through the real bearer/session reader without flooding the password
        // endpoint shared by parallel UI tests. This code is never included in the app build.
        const token = randomUUID();
        await pool.query(
          'insert into session (id,token,"userId","expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'1 hour\',now())',
          [randomUUID(), token, userId],
        );
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
