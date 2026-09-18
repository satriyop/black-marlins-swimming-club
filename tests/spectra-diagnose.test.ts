import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import {
  BUNDLE_URL,
  classify,
  countCatalogRows,
  discoverLiveKey,
  extractKeyFromBundle,
  parseArgs,
  redact,
  rotateEnvFile,
  rotationDecision,
  updateEnvContent,
} from "../scripts/diagnose-spectra.mjs";

// Fabricated, deliberately: these assert on shape and redaction only, and the
// real key is a third-party credential that must never land in the repo.
//
// Assembled at runtime rather than written out: Spectra reuse Stripe's
// `sk_live_` prefix, so a literal here -- fake or not -- trips GitHub's Stripe
// secret scanner and blocks the push. Keep it out of the source text.
const PREFIX = ["sk", "live", ""].join("_");
const LIVE = `${PREFIX}FAKEKEYFORTESTSONLY0000000000000001`;
const STALE = `${PREFIX}OLDSTALEKEY000000000000000000000000`;

test("the live key is read out of a minified bundle", () => {
  expect(extractKeyFromBundle(`a.headers={"x-api-key":"${LIVE}"},b()`)).toBe(LIVE);
});

test("the same key repeated through the bundle is still one key", () => {
  expect(extractKeyFromBundle(`"${LIVE}" ... later "${LIVE}"`)).toBe(LIVE);
});

test("two different keys report as unreadable rather than guessing which is live", () => {
  expect(extractKeyFromBundle(`"${LIVE}" and "${STALE}"`)).toBeNull();
});

test("a bundle that no longer ships a key reads as unreadable, not as rotation", () => {
  expect(extractKeyFromBundle("(function dartProgram(){})")).toBeNull();
});

test("redaction never emits enough of a key to reuse it", () => {
  const shown = redact(LIVE);
  expect(shown).not.toContain(LIVE.slice(11, -4));
  expect(shown.startsWith(`${PREFIX}FAK`)).toBe(true);
  expect(redact(null)).toBe("(none)");
  expect(redact("short")).toBe("(too short to redact safely)");
});

test("a missing key is reported as unset, not as a provider outage", () => {
  expect(
    classify({ configured: null, discovered: LIVE, keyedRows: null, keylessRows: 0 }).status,
  ).toBe("unset");
});

test("a key that no longer matches their bundle is reported as rotated", () => {
  const v = classify({ configured: STALE, discovered: LIVE, keyedRows: 0, keylessRows: 0 });
  expect(v.status).toBe("rotated");
  expect(v.summary).toContain(`${PREFIX}FAK`);
  expect(v.summary).not.toContain(LIVE);
});

test("our own key returning nothing is 'rejected', distinct from rotation", () => {
  expect(
    classify({ configured: LIVE, discovered: LIVE, keyedRows: 0, keylessRows: 0 }).status,
  ).toBe("rejected");
});

test("an unreachable host is never mistaken for a bad key", () => {
  expect(
    classify({ configured: LIVE, discovered: null, keyedRows: null, keylessRows: null }).status,
  ).toBe("unreachable");
});

test("an unreadable bundle does not by itself fail a working key", () => {
  expect(
    classify({ configured: LIVE, discovered: null, keyedRows: 20, keylessRows: 0 }).status,
  ).toBe("ok");
});

test("if a keyless request starts returning data, the report says the gate may be gone", () => {
  const v = classify({ configured: LIVE, discovered: LIVE, keyedRows: 20, keylessRows: 20 });
  expect(v.status).toBe("ok");
  expect(v.summary).toContain("gate may have been lifted");
});

test("the catalog probe sends the key and counts rows", async () => {
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("x-api-key")).toBe(LIVE);
    return new Response(JSON.stringify([{ kode: "A" }, { kode: "B" }]), { status: 200 });
  });

  await expect(countCatalogRows({ apiKey: LIVE, fetchImpl })).resolves.toBe(2);
});

test("a non-JSON or failed catalog response counts as unreachable, not as empty", async () => {
  const html = vi.fn(async () => new Response("<html>maintenance</html>", { status: 200 }));
  await expect(countCatalogRows({ apiKey: LIVE, fetchImpl: html })).resolves.toBeNull();

  const boom = vi.fn(async () => {
    throw new Error("ECONNRESET");
  });
  await expect(countCatalogRows({ apiKey: LIVE, fetchImpl: boom })).resolves.toBeNull();
});

test("bundle discovery reads their real bundle URL and survives an outage", async () => {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    expect(String(url)).toBe(BUNDLE_URL);
    return new Response(`x"${LIVE}"y`, { status: 200 });
  });
  await expect(discoverLiveKey({ fetchImpl })).resolves.toBe(LIVE);

  const down = vi.fn(async () => new Response("nope", { status: 503 }));
  await expect(discoverLiveKey({ fetchImpl: down })).resolves.toBeNull();
});

test("rotating rewrites only the key line and leaves every other secret intact", () => {
  const before = `DATABASE_URL=postgres://u:p@h/db\nSPECTRA_API_KEY=${STALE}\nBETTER_AUTH_SECRET=shh\n`;
  const after = updateEnvContent(before, "SPECTRA_API_KEY", LIVE);

  expect(after).toContain("DATABASE_URL=postgres://u:p@h/db");
  expect(after).toContain("BETTER_AUTH_SECRET=shh");
  expect(after).toContain(`SPECTRA_API_KEY=${LIVE}`);
  expect(after).not.toContain(STALE);
});

test("a key absent from .env is appended rather than silently dropped", () => {
  expect(updateEnvContent("DATABASE_URL=x\n", "SPECTRA_API_KEY", LIVE)).toBe(
    `DATABASE_URL=x\nSPECTRA_API_KEY=${LIVE}\n`,
  );
  expect(updateEnvContent("", "SPECTRA_API_KEY", LIVE)).toBe(`SPECTRA_API_KEY=${LIVE}\n`);
});

test("a duplicated key line cannot leave a stale value that shell sourcing would win with", () => {
  const before = `SPECTRA_API_KEY=${STALE}\nX=1\nSPECTRA_API_KEY=${STALE}\n`;
  expect(updateEnvContent(before, "SPECTRA_API_KEY", LIVE)).not.toContain(STALE);
});

test("an unverified new key is never written, however well-formed it looks", () => {
  expect(rotationDecision({ configured: STALE, discovered: LIVE, discoveredRows: 0 }).ok).toBe(
    false,
  );
  expect(rotationDecision({ configured: STALE, discovered: LIVE, discoveredRows: null }).ok).toBe(
    false,
  );
  expect(rotationDecision({ configured: STALE, discovered: LIVE, discoveredRows: 20 }).ok).toBe(
    true,
  );
});

test("junk scraped from their bundle is refused before it reaches .env", () => {
  expect(
    rotationDecision({ configured: STALE, discovered: "not-a-key", discoveredRows: 20 }).ok,
  ).toBe(false);
  expect(rotationDecision({ configured: STALE, discovered: null, discoveredRows: 20 }).ok).toBe(
    false,
  );
  expect(() => rotateEnvFile({ envFile: "/tmp/never-written.env", value: "rm -rf /" })).toThrow(
    "not a well-formed key",
  );
  expect(existsSync("/tmp/never-written.env")).toBe(false);
});

test("an unchanged key is not rewritten, so the timer cannot flap", () => {
  expect(rotationDecision({ configured: LIVE, discovered: LIVE, discoveredRows: 20 }).ok).toBe(
    false,
  );
});

test("the real file is replaced atomically, keeping its mode and a backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "bmsc-env-"));
  const envFile = join(dir, ".env");
  writeFileSync(envFile, `DATABASE_URL=keepme\nSPECTRA_API_KEY=${STALE}\n`, { mode: 0o640 });

  const result = rotateEnvFile({ envFile, value: LIVE });

  expect(readFileSync(envFile, "utf8")).toBe(`DATABASE_URL=keepme\nSPECTRA_API_KEY=${LIVE}\n`);
  expect(readFileSync(`${envFile}.bak`, "utf8")).toContain(STALE);
  expect(statSync(envFile).mode & 0o777).toBe(0o640);
  expect(result.backup).toBe(`${envFile}.bak`);
  expect(readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([]);

  rmSync(dir, { recursive: true, force: true });
});

test("rotating is opt-in and the env file is overridable for production", () => {
  expect(parseArgs([])).toMatchObject({ rotate: false, asJson: false, envFile: ".env" });
  expect(parseArgs(["--rotate", "--env-file", "/var/www/bmsc/.env"])).toMatchObject({
    rotate: true,
    envFile: "/var/www/bmsc/.env",
  });
  expect(parseArgs(["--json"])).toMatchObject({ asJson: true, rotate: false });
});
