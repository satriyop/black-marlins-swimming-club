#!/usr/bin/env node
// @ts-check
/**
 * Diagnostic for the Spectra SwimPro integration -- answers "is our API key
 * still the one their app uses?" without a browser or any devDependency, so
 * it can run on the server straight from a release or a systemd timer.
 *
 *   node scripts/diagnose-spectra.mjs            # report only, writes nothing
 *   node scripts/diagnose-spectra.mjs --json     # one JSON object, for alerts
 *   node scripts/diagnose-spectra.mjs --rotate   # self-heal: write the new key
 *   node scripts/diagnose-spectra.mjs --rotate --env-file /var/www/bmsc/.env
 *
 * Reporting is the default and --rotate is opt-in, because rotating edits the
 * file that also holds DATABASE_URL and BETTER_AUTH_SECRET. A rotation only
 * happens when all of these hold: their bundle yields exactly one well-formed
 * key, it differs from ours, and it has been proven to return catalog rows.
 * We never write a key we have not just watched work.
 *
 * Why this exists: every php/ endpoint is gated on an `x-api-key` header and
 * answers a keyless request with HTTP 200 and an empty [] instead of a 401.
 * That failure is indistinguishable from "their backend is having a bad day"
 * at the status-code level, so a rotated key would otherwise surface only as
 * a sync that quietly retries for ~9 minutes and then blames the provider.
 *
 * Their viewer is a Flutter web app that ships the live key as a string
 * literal in main.dart.js, so the current key can be read straight out of the
 * bundle and compared with ours. If they ever stop shipping it in the clear,
 * KEY_PATTERN stops matching and this reports the bundle as unreadable rather
 * than silently passing. The fallback in that case is to capture a real
 * request: load https://globiesoft.com/rlist_off/ in a browser (or Playwright)
 * and read the `x-api-key` request header off any php/ call in DevTools.
 *
 * Exit codes (chosen so a timer can alert on "not 0"):
 *   0 ok          configured key matches the bundle and returns data
 *   2 unset       SPECTRA_API_KEY is not configured
 *   3 rotated     our key no longer matches the one their app ships
 *   4 rejected    our key is configured but returns an empty catalog
 *   5 unreachable their host did not answer well enough to judge
 *
 * A successful --rotate exits 0: the condition healed itself and should not
 * page anyone. Nothing needs restarting -- the sync is a fresh process that
 * sources .env every run, and the web app re-reads the file behind a short TTL
 * (src/lib/server/spectra-key.server.ts) rather than trusting the snapshot
 * systemd handed it through EnvironmentFile= at start.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { SPECTRA_BASE } from "./spectra-client.mjs";
import { isMainModule } from "./with-app-env.mjs";

export const BUNDLE_URL = "https://globiesoft.com/rlist_off/main.dart.js";
const CATALOG_URL = `${SPECTRA_BASE}/events_list.php?csearch=&page=1`;

/** Their keys are `sk_live_` + an alphanumeric body; anchored loosely so a
 *  length change on their side still matches rather than reading as rotation. */
export const KEY_PATTERN = /sk_live_[A-Za-z0-9_-]{8,}/g;

/** Anchored twin of KEY_PATTERN. A value is only written to .env if it matches
 *  this whole-string form -- we are ingesting a literal scraped out of someone
 *  else's JS bundle, so "it looks like a key" is the minimum bar. */
export const STRICT_KEY = /^sk_live_[A-Za-z0-9_-]{8,}$/;

export const EXIT = { ok: 0, unset: 2, rotated: 3, rejected: 4, unreachable: 5 };

/**
 * Set one key in .env text, mirroring bmsc.sh's `upsert_env` (replace every
 * `KEY=` line, else append) so a rotation and a hand-edit cannot drift into
 * two different shapes of the same file.
 * @param {string} text
 * @param {string} key
 * @param {string} value
 */
export function updateEnvContent(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`, "gm");
  if (pattern.test(text)) return text.replace(pattern, line);
  return (text.trimEnd() ? `${text.trimEnd()}\n` : "") + `${line}\n`;
}

/**
 * Write the key into .env atomically, leaving a single .env.bak behind.
 * Atomic because this file also holds DATABASE_URL and BETTER_AUTH_SECRET: a
 * torn write takes the whole site down, so we build a temp file and rename it
 * into place rather than truncating the live one. The mode is copied from the
 * existing file (bmsc.sh installs it 640) instead of assumed.
 * @param {{envFile: string, key?: string, value: string}} options
 */
export function rotateEnvFile({ envFile, key = "SPECTRA_API_KEY", value }) {
  if (!STRICT_KEY.test(value))
    throw new Error("refusing to write a value that is not a well-formed key");
  const existed = existsSync(envFile);
  const text = existed ? readFileSync(envFile, "utf8") : "";
  const mode = existed ? statSync(envFile).mode & 0o777 : 0o640;
  if (existed) copyFileSync(envFile, `${envFile}.bak`);
  const tmp = `${envFile}.tmp-${process.pid}`;
  writeFileSync(tmp, updateEnvContent(text, key, value), { mode });
  chmodSync(tmp, mode);
  renameSync(tmp, envFile);
  return { envFile, backup: existed ? `${envFile}.bak` : null, mode };
}

/**
 * Show enough of a key to compare two by eye, never enough to reuse one --
 * this output lands in journalctl and CI logs.
 * @param {string | undefined | null} key
 */
export function redact(key) {
  if (!key) return "(none)";
  return key.length <= 12 ? "(too short to redact safely)" : `${key.slice(0, 11)}…${key.slice(-4)}`;
}

/**
 * Pull the single live key out of their JS bundle. More than one distinct
 * match means we can no longer say which is in use, so report none.
 * @param {string} bundle
 * @returns {string | null}
 */
export function extractKeyFromBundle(bundle) {
  const found = [...new Set(bundle.match(KEY_PATTERN) ?? [])];
  return found.length === 1 ? found[0] : null;
}

/**
 * Decide the verdict from the three facts we gather. Pure, so the interesting
 * branches are unit-testable without touching the network.
 * @param {{configured?: string | null, discovered?: string | null, keyedRows?: number | null, keylessRows?: number | null}} facts
 * @returns {{status: keyof typeof EXIT, summary: string}}
 */
export function classify({ configured, discovered, keyedRows, keylessRows }) {
  if (!configured) {
    return {
      status: "unset",
      summary: "SPECTRA_API_KEY is not set; every sync will return an empty catalog.",
    };
  }
  if (keyedRows === null || keyedRows === undefined) {
    return {
      status: "unreachable",
      summary: "Could not reach the catalog endpoint; cannot judge the key.",
    };
  }
  if (discovered && discovered !== configured) {
    return {
      status: "rotated",
      summary: `Their app now ships ${redact(discovered)} but we are configured with ${redact(configured)}.`,
    };
  }
  if (keyedRows === 0) {
    return {
      status: "rejected",
      summary: "Our key returned an empty catalog -- revoked, or their backend is down.",
    };
  }
  if (keylessRows !== null && keylessRows !== undefined && keylessRows > 0) {
    return {
      status: "ok",
      summary: `Catalog returned ${keyedRows} rows. Note: a keyless request also returned data, so the key gate may have been lifted.`,
    };
  }
  return {
    status: "ok",
    summary: `Catalog returned ${keyedRows} rows with our key, and 0 without it.`,
  };
}

/**
 * Count catalog rows for one request. Returns null when the host could not be
 * reached or answered with something that is not a JSON array; returns 0 for a
 * well-formed empty catalog, which is the signal we actually care about.
 * @param {{apiKey?: string | null, fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<number | null>}
 */
export async function countCatalogRows({ apiKey = null, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(
      CATALOG_URL,
      apiKey ? { headers: { "x-api-key": apiKey } } : undefined,
    );
    if (!res.ok) return null;
    const data = JSON.parse(await res.text());
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

/**
 * Read the live key out of their bundle. Null on any failure -- a diagnostic
 * must never throw where it could instead report "unknown".
 * @param {{fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<string | null>}
 */
export async function discoverLiveKey({ fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(BUNDLE_URL);
    if (!res.ok) return null;
    return extractKeyFromBundle(await res.text());
  } catch {
    return null;
  }
}

/**
 * Is this candidate safe to write into production config? Deliberately strict:
 * the value came from a third party's bundle, so shape alone is not enough --
 * it must also have just returned rows. `discoveredRows > 0` is the proof.
 * @param {{configured?: string | null, discovered?: string | null, discoveredRows?: number | null}} facts
 * @returns {{ok: boolean, reason: string}}
 */
export function rotationDecision({ configured, discovered, discoveredRows }) {
  if (!discovered) return { ok: false, reason: "no key could be read from their bundle" };
  if (!STRICT_KEY.test(discovered))
    return { ok: false, reason: "the key in their bundle is malformed" };
  if (discovered === configured)
    return { ok: false, reason: "our key already matches their bundle" };
  if (!discoveredRows)
    return { ok: false, reason: "the new key did not return catalog rows, so it was not trusted" };
  return { ok: true, reason: `the new key returned ${discoveredRows} rows` };
}

/** Gather every fact, then classify. @param {{fetchImpl?: typeof fetch}} [options] */
export async function runDiagnostic({ fetchImpl = fetch } = {}) {
  const configured = process.env.SPECTRA_API_KEY?.trim() || null;
  const discovered = await discoverLiveKey({ fetchImpl });
  const keyedRows = configured ? await countCatalogRows({ apiKey: configured, fetchImpl }) : null;
  const keylessRows = await countCatalogRows({ apiKey: null, fetchImpl });
  // Only probe the bundle key when it is actually a candidate -- no need for a
  // third request on the healthy path, which is every run but one.
  const discoveredRows =
    discovered && discovered !== configured
      ? await countCatalogRows({ apiKey: discovered, fetchImpl })
      : null;
  const verdict = classify({ configured, discovered, keyedRows, keylessRows });
  return { ...verdict, configured, discovered, keyedRows, keylessRows, discoveredRows };
}

/** @param {Awaited<ReturnType<typeof runDiagnostic>>} r */
function report(r) {
  const lines = [
    `[spectra-diagnose] ${r.status.toUpperCase()}: ${r.summary}`,
    `  configured key : ${redact(r.configured)}`,
    `  key in bundle  : ${r.discovered ? redact(r.discovered) : "(unreadable -- their build may have changed)"}`,
    `  rows with key  : ${r.keyedRows ?? "(unreachable)"}`,
    `  rows without   : ${r.keylessRows ?? "(unreachable)"}`,
  ];
  if (r.status === "rotated" && !r.rotated) {
    lines.push("", `  Fix: node scripts/diagnose-spectra.mjs --rotate   (${r.rotationReason})`);
  }
  if (r.rotated) {
    lines.push(
      "",
      `  Rotated: ${r.rotationReason}. Wrote ${r.envFile} (backup at ${r.envFile}.bak).`,
      "  No restart needed: the sync uses this on its next run, and the web app",
      "  re-reads the file within a minute (see spectra-key.server.ts). On a",
      "  release older than that change, `sudo systemctl restart bmsc` is still",
      "  what refreshes the interactive search.",
    );
  }
  return lines.join("\n");
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const at = argv.indexOf("--env-file");
  return {
    asJson: argv.includes("--json"),
    rotate: argv.includes("--rotate"),
    envFile: at !== -1 && argv[at + 1] ? argv[at + 1] : process.env.SPECTRA_ENV_FILE || ".env",
  };
}

if (isMainModule(import.meta.url)) {
  const { asJson, rotate, envFile } = parseArgs(process.argv.slice(2));
  const result = await runDiagnostic();
  /** @type {Record<string, unknown>} */
  const extra = { rotated: false, envFile, rotationReason: "" };

  if (result.status === "rotated") {
    const decision = rotationDecision(result);
    extra.rotationReason = decision.reason;
    if (rotate && decision.ok) {
      try {
        rotateEnvFile({ envFile, value: /** @type {string} */ (result.discovered) });
        extra.rotated = true;
        // The condition healed itself; do not page anyone for it.
        result.status = "ok";
        result.summary = `Key rotated and written to ${envFile}.`;
      } catch (err) {
        extra.rotationReason = `write failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  const out = { ...result, ...extra };
  console.log(
    asJson
      ? JSON.stringify({
          ...out,
          configured: redact(out.configured),
          discovered: redact(out.discovered),
        })
      : report(/** @type {any} */ (out)),
  );
  process.exit(EXIT[result.status]);
}
