import type { Sql } from "@/lib/db";

export type Actor = {
  sql: Sql;
  userId: string;
};
