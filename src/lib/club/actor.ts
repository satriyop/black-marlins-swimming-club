import type { Sql } from "@/lib/db";

export type Actor = {
  sql: Sql;
  userId: string;
  /** Club this request is resolved to. Omit when the user, or the database, has exactly one Club. */
  clubId?: number | null;
};
