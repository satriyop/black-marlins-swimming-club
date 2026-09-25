import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingMigrations } from "../scripts/migration-plan.mjs";
import type { Sql } from "../src/lib/db";

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "migrations");

function toSql(pg: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[]): Promise<T[]> => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  };
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) => run<T>(text, params);
  sql.transaction = (fn) =>
    pg.transaction(async (tx) => {
      const inner = (async <T = Record<string, unknown>>(
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<T[]> => {
        let text = strings[0];
        for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
        const result = await tx.query<T>(text, values);
        return result.rows;
      }) as unknown as Sql;
      inner.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => {
        const result = await tx.query<T>(text, params);
        return result.rows;
      };
      inner.transaction = (nested) => nested(inner);
      return fn(inner);
    });
  return sql;
}

async function applyMigrations(pg: PGlite): Promise<void> {
  await pg.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => join(migrationsDir, name));
  const byPath: Record<string, string> = {};
  for (const path of files) byPath[path] = readFileSync(path, "utf8");
  const doneRows = await pg.query<{ name: string }>("select name from _migrations");
  const done = doneRows.rows.map((r) => r.name);
  for (const { name, path } of pendingMigrations(Object.keys(byPath), done)) {
    await pg.transaction(async (tx) => {
      await tx.exec(byPath[path]!);
      await tx.query("insert into _migrations (name) values ($1)", [name]);
    });
  }
}

export async function createClubHarness() {
  const pg = new PGlite({
    parsers: { [OID_INT8]: Number, [OID_DATE]: identity, [OID_INTERVAL]: identity },
  });
  await pg.waitReady;
  await applyMigrations(pg);
  const sql = toSql(pg);

  return {
    sql,
    actor(userId: string, clubId?: number) {
      return clubId == null ? { sql, userId } : { sql, userId, clubId };
    },
    async insertSwimmer(input: {
      userId: string;
      fullName: string;
      dateOfBirth: string;
      gender: "putra" | "putri";
    }) {
      await sql`
        insert into swimmers (user_id, full_name, date_of_birth, gender, nationality, status)
        values (${input.userId}, ${input.fullName}, ${input.dateOfBirth}, ${input.gender}, 'Indonesia', 'aktif')
      `;
    },
  };
}
