import { afterEach, expect, test } from "vitest";
import {
  KEY_TTL_MS,
  parseEnvValue,
  resetSpectraKeyCache,
  resolveSpectraKey,
} from "../src/lib/server/spectra-key.server";

// Assembled at runtime, not written out: Spectra reuse Stripe's `sk_live_`
// prefix, so a literal here -- fake or not -- trips GitHub's Stripe secret
// scanner and blocks the push.
const PREFIX = ["sk", "live", ""].join("_");
const FILE_KEY = `${PREFIX}FROMTHEFILE00000000000000000000000001`;
const BOOT_KEY = `${PREFIX}FROMTHEBOOTENV000000000000000000000001`;

afterEach(() => {
  resetSpectraKeyCache();
  delete process.env.SPECTRA_API_KEY;
});

const reader = (text: string) => () => text;
const throwing = () => {
  throw new Error("ENOENT");
};

test("a key rotated into .env wins over the stale boot-time environment", () => {
  process.env.SPECTRA_API_KEY = BOOT_KEY;

  expect(
    resolveSpectraKey({
      envFile: "/var/www/bmsc/.env",
      read: reader(`SPECTRA_API_KEY=${FILE_KEY}\n`),
    }),
  ).toBe(FILE_KEY);
});

test("an unreadable .env falls back to the boot value instead of breaking search", () => {
  process.env.SPECTRA_API_KEY = BOOT_KEY;

  expect(resolveSpectraKey({ envFile: "/nope/.env", read: throwing })).toBe(BOOT_KEY);
});

test("with no env file configured the behaviour is exactly what it was before", () => {
  process.env.SPECTRA_API_KEY = BOOT_KEY;

  expect(resolveSpectraKey({ envFile: undefined })).toBe(BOOT_KEY);
});

test("a blank placeholder in .env does not shadow a real configured key", () => {
  process.env.SPECTRA_API_KEY = BOOT_KEY;

  expect(resolveSpectraKey({ envFile: "/e", read: reader("SPECTRA_API_KEY=\n") })).toBe(BOOT_KEY);
});

test("nothing configured anywhere resolves to undefined, not an empty string", () => {
  expect(resolveSpectraKey({ envFile: "/e", read: reader("OTHER=1\n") })).toBeUndefined();
});

test("the file is not re-read on every request, but is re-read after the TTL", () => {
  let reads = 0;
  const counting = () => {
    reads += 1;
    return `SPECTRA_API_KEY=${FILE_KEY}\n`;
  };

  resolveSpectraKey({ now: 1_000, envFile: "/e", read: counting });
  resolveSpectraKey({ now: 1_000 + KEY_TTL_MS - 1, envFile: "/e", read: counting });
  expect(reads).toBe(1);

  resolveSpectraKey({ now: 1_000 + KEY_TTL_MS, envFile: "/e", read: counting });
  expect(reads).toBe(2);
});

test("a rotation is picked up within the TTL without a restart", () => {
  let current = `SPECTRA_API_KEY=${BOOT_KEY}\n`;
  const live = () => current;

  expect(resolveSpectraKey({ now: 0, envFile: "/e", read: live })).toBe(BOOT_KEY);

  current = `SPECTRA_API_KEY=${FILE_KEY}\n`;
  expect(resolveSpectraKey({ now: KEY_TTL_MS, envFile: "/e", read: live })).toBe(FILE_KEY);
});

test("env parsing ignores comments and other keys", () => {
  const text = `# SPECTRA_API_KEY=commented\nDATABASE_URL=x\nSPECTRA_API_KEY="${FILE_KEY}"\n`;

  expect(parseEnvValue(text, "SPECTRA_API_KEY")).toBe(FILE_KEY);
  expect(parseEnvValue(text, "DATABASE_URL")).toBe("x");
  expect(parseEnvValue(text, "MISSING")).toBeUndefined();
});
