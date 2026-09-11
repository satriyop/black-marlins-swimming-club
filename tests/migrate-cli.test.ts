import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { pendingMigrations } from "../scripts/migration-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("schema migrate does not seed accounts or import kiko times", () => {
  const src = readFileSync(join(root, "scripts/migrate.mjs"), "utf8");
  expect(src).not.toMatch("import-kiko");
  expect(src).not.toMatch("importKikoResults");
  expect(src).not.toMatch("seedClub");
  expect(src).not.toMatch("SEED_ADULTS");
});

test("pending migrations stay ordered and skip applied names", () => {
  const pending = pendingMigrations(
    ["0002_bmsc.sql", "0001_auth.sql", "readme.md"],
    ["0001_auth.sql"],
  );
  expect(pending.map((m) => m.name)).toEqual(["0002_bmsc.sql"]);
});
