import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test("migration preserves legacy opens and explicitly establishes a rollout-time audience", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  try {
    const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && f < "0014_announcement_followthrough.sql")
      .sort())
      await pg.exec(readFileSync(`${dir}/${file}`, "utf8"));
    await pg.exec(`insert into clubs(id,name,short_name,city,province,coach_name) values (100,'Klub Uji','UJI','Klaten','Jateng','Pelatih');
      insert into "user"(id,name,email,"emailVerified") values ('old-author','Penulis','author@example.test',true),('old-parent','Wali','parent@example.test',true);
      insert into club_staff(club_id,user_id,role) values (100,'old-author','coach');
      insert into club_family(club_id,user_id) values (100,'old-parent');
      insert into announcements(id,club_id,title,body,important,created_by,created_at) values (100,100,'Pengumuman lama','Isi asli',true,'old-author','2026-01-01T00:00:00Z');
      insert into announcement_reads(announcement_id,user_id,read_at) values (100,'old-parent','2026-01-02T00:00:00Z');`);
    await pg.exec(readFileSync(`${dir}/0014_announcement_followthrough.sql`, "utf8"));
    const reads = await pg.query<{ revision: number; read_at: Date }>(
      "select revision,read_at from announcement_reads where announcement_id=100",
    );
    expect(reads.rows[0]?.revision).toBe(1);
    expect(reads.rows[0]?.read_at.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    expect((await pg.query("select * from announcement_acknowledgements")).rows).toHaveLength(0);
    expect(
      (await pg.query("select * from announcement_audience where announcement_id=100")).rows,
    ).toHaveLength(2);
    expect(
      (
        await pg.query<{ audience_origin: string }>(
          "select audience_origin from announcements where id=100",
        )
      ).rows[0]?.audience_origin,
    ).toBe("migration");
    expect(
      (
        await pg.query<{ body: string }>(
          "select body from announcement_revisions where announcement_id=100 and revision=1",
        )
      ).rows[0]?.body,
    ).toBe("Isi asli");
    await pg.exec(`insert into announcements(id,club_id,title,body,important,created_by)
      values (101,100,'Pos dari versi lama','Saat pergantian versi',true,'old-author')`);
    expect(
      (await pg.query("select * from announcement_audience where announcement_id=101")).rows,
    ).toHaveLength(2);
    expect(
      (
        await pg.query(
          "select * from announcement_revisions where announcement_id=101 and revision=1",
        )
      ).rows,
    ).toHaveLength(1);
  } finally {
    await pg.close();
  }
});
