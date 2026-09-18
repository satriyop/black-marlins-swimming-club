import { readFileSync } from "node:fs";

/**
 * Resolve the Spectra API key for the long-running web app.
 *
 * systemd hands us `.env` through `EnvironmentFile=`, which is a snapshot
 * taken once at service start. The nightly sync can rewrite SPECTRA_API_KEY
 * in that same file when Spectra rotate their key (see
 * scripts/diagnose-spectra.mjs), and the running process would otherwise keep
 * serving the stale value from its environment until someone restarted it --
 * leaving the interactive "Add Swimmer" search broken while the sync was
 * already healthy again. So we re-read the file behind a short TTL instead.
 *
 * Kept out of scripts/spectra-client.mjs on purpose: that module is reachable
 * from the client bundle (fns-spectra.ts imports SPECTRA_EMPTY_MESSAGE from
 * it), and `node:fs` must not follow it there. Hence the `.server` suffix and
 * the injection at the two call sites in src/lib/club/.
 */

/** How long a resolved key is trusted before `.env` is consulted again. One
 *  minute bounds post-rotation staleness without making this a hot path: the
 *  file is read at most once a minute, and only on Spectra requests. */
export const KEY_TTL_MS = 60_000;

let cache: { value: string | undefined; readAt: number } | null = null;

/**
 * Read one `KEY=value` out of .env text. Mirrors bmsc.sh's `env_get`: first
 * matching line wins, surrounding quotes are stripped, an empty value counts
 * as absent so a blank placeholder never shadows a real environment value.
 */
export function parseEnvValue(text: string, key: string): string | undefined {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.startsWith(`${key}=`)) continue;
    const value = trimmed
      .slice(key.length + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  return undefined;
}

type ResolveOptions = {
  now?: number;
  envFile?: string;
  read?: (path: string, encoding: "utf8") => string;
};

/**
 * The file wins over the environment when it holds a value, because the file
 * is what a rotation updates and the environment is the boot-time snapshot.
 * Any read failure falls back to that snapshot rather than throwing -- a
 * missing or unreadable .env must degrade to today's behaviour, never take
 * the search down.
 */
export function resolveSpectraKey({
  now = Date.now(),
  envFile = process.env.SPECTRA_ENV_FILE,
  read = readFileSync as ResolveOptions["read"],
}: ResolveOptions = {}): string | undefined {
  if (cache && now - cache.readAt < KEY_TTL_MS) return cache.value;

  let value = process.env.SPECTRA_API_KEY?.trim() || undefined;
  if (envFile && read) {
    try {
      value = parseEnvValue(read(envFile, "utf8"), "SPECTRA_API_KEY") ?? value;
    } catch {
      // Keep the boot-time value; .env may be unreadable in dev or mid-rename.
    }
  }

  cache = { value, readAt: now };
  return value;
}

/** Drop the memoised key. Exists for tests and for a future "force refresh"
 *  on an empty Spectra response, which is the other rotation symptom. */
export function resetSpectraKeyCache(): void {
  cache = null;
}
