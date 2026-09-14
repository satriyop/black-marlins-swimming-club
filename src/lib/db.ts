import { pendingMigrations } from "../../scripts/migration-plan.mjs";

export type DbSource = "neon" | "pglite";

const rawDatabaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl = rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : undefined;
export const dbSource: DbSource = databaseUrl ? "neon" : "pglite";

export interface Sql {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
}

const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
};

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;
type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

function toSql(run: Run, beginTransaction: (fn: (sql: Sql) => Promise<unknown>) => Promise<unknown>): Sql {
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) => run<T>(text, params);
  sql.transaction = <T>(fn: (sql: Sql) => Promise<T>) => beginTransaction(fn) as Promise<T>;
  return sql;
}

function createNeonSql(): Promise<Sql> {
  globalRef.__pgSqlPromise__ ??= (async () => {
    const { Pool, types } = await import("pg");
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    const pool = new Pool({ connectionString: databaseUrl });
    const beginTransaction = async (fn: (sql: Sql) => Promise<unknown>) => {
      const client = await pool.connect();
      const inner = toSql(
        async <T>(text: string, params: unknown[]) => {
          const res = await client.query(text, params);
          return res.rows as T[];
        },
        async (nested) => nested(inner),
      );
      try {
        await client.query("begin");
        const result = await fn(inner);
        await client.query("commit");
        return result;
      } catch (err) {
        try {
          await client.query("rollback");
        } catch {
          /* keep */
        }
        throw err;
      } finally {
        client.release();
      }
    };
    return toSql(async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    }, beginTransaction);
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

async function createPgliteSql(): Promise<Sql> {
  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      parsers: { [OID_INT8]: Number, [OID_DATE]: identity, [OID_INTERVAL]: identity },
    });
    await pg.waitReady;
    await pg.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
    return pg;
  })().catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  const pg = await globalRef.__pgliteInstance__;
  const migrate = async (): Promise<void> => {
    const migrations = import.meta.glob("/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const doneRows = await pg.query<{ name: string }>("select name from _migrations");
    const done = doneRows.rows.map((r) => r.name);
    for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
      await pg.transaction(async (tx) => {
        await tx.exec(migrations[path]);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
  };
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve()).catch(() => undefined).then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;
  const sql = toSql(
    async <T>(text: string, params: unknown[]) => {
      const result = await pg.query<T>(text, params);
      return result.rows;
    },
    async (fn) =>
      pg.transaction(async (tx) => {
        const inner = toSql(
          async <T>(text: string, params: unknown[]) => {
            const result = await tx.query<T>(text, params);
            return result.rows;
          },
          async (nested) => nested(inner),
        );
        return fn(inner);
      }),
  );
  const { seedClub } = await import("@/lib/club/seed");
  const { ensureDefaultTrainingSchedules } =
    await import("../../scripts/default-training-schedules.mjs");
  const clubId = await seedClub(sql);
  await ensureDefaultTrainingSchedules(
    async (text, params = []) => ({ rows: await sql.query(text, params) }),
    clubId,
  );
  return sql;
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error("@/lib/db is server-only — call getSql() from a createServerFn handler or a server route loader, never from client code.");
  }
  return dbSource === "neon" ? createNeonSql() : createPgliteSql();
}

export function getSql(): Promise<Sql> {
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null;
    throw err;
  });
  return sqlPromise;
}

export async function getPglite(): Promise<import("@electric-sql/pglite").PGlite> {
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

export function ensureDbReady(): Promise<void> {
  if (dbSource !== "pglite") return Promise.resolve();
  return getSql().then(() => undefined);
}

const globalBoot = globalThis as typeof globalThis & { __pgBootstrapPromise__?: Promise<void> };
if (typeof window === "undefined" && dbSource === "pglite") {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] PGLite bootstrap failed:", err);
    throw err;
  });
}
