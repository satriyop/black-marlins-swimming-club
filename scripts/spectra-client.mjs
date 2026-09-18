// @ts-check
/**
 * HTTP client for the Spectra SwimPro public event catalog.
 *
 * An empty [] with HTTP 200 is their "not authorized" answer: every php/
 * endpoint is gated on an `x-api-key` header, and omitting it returns 200 []
 * rather than a 401. Their viewer has no user login -- it is a Flutter web
 * app that ships the key inside main.dart.js and attaches it to every call --
 * so the gate is invisible until you capture a real request. That is why this
 * was long mistaken for load-related flakiness: a fetch() typed into their
 * console inherits no headers, and so reproduces the keyless case, not a blip.
 * Verified 2026-09-18: 5/5 keyed requests returned data, 3/3 keyless returned
 * [], with Referer and a browser User-Agent making no difference.
 *
 * Retries are kept -- and stay patient (minutes, not seconds) -- because a
 * genuine outage on their shared hosting is still possible and indistinguish-
 * able by status code. But note the cost: with no key configured, the empty []
 * never resolves, so the full budget is burned before failing.
 */

export const SPECTRA_BASE = "https://globiesoft.com/rlist_off/php";
export const SPECTRA_EMPTY_MESSAGE =
  "Spectra SwimPro sedang tidak mengirim data. Coba sinkronkan lagi nanti.";
const BASE = SPECTRA_BASE;

/** Retry budget for the interactive path (a coach/parent waiting on a
 *  synchronous "Add Swimmer" search) -- short, not the multi-minute
 *  patience fetchEventsList uses for the unattended daily job. */
export const INTERACTIVE_RETRY = { retries: 2, delayMs: 1500 };

/** @param {number} ms */
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch one URL, retrying on network error, non-200, or an empty [] body
 * (their flakiness signature) up to `retries` times with linear backoff.
 * @param {string} url
 * @param {{retries?: number, delayMs?: number, retryEmpty?: boolean, apiKey?: string, fetchImpl?: typeof fetch}} [options]
 */
export async function fetchJsonPatient(
  url,
  {
    retries = 8,
    delayMs = 15_000,
    retryEmpty = true,
    apiKey = process.env.SPECTRA_API_KEY,
    fetchImpl = fetch,
  } = {},
) {
  /** @type {unknown} */
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, apiKey ? { headers: { "x-api-key": apiKey } } : undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      /** @type {unknown} */
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`non-JSON response: ${text.slice(0, 200)}`);
      }
      if (retryEmpty && Array.isArray(data) && data.length === 0 && attempt < retries) {
        throw new Error(
          "empty response (missing/invalid SPECTRA_API_KEY, or their backend under load)",
        );
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(delayMs * (attempt + 1));
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`spectra-client: giving up on ${url} after ${retries + 1} attempts: ${message}`);
}

/**
 * Page through the full public event catalog. A page that comes back empty
 * after exhausting retries is treated as "no more pages" -- see the note in
 * fetchJsonPatient about what an empty array actually means.
 * @param {{maxPages?: number, retries?: number, delayMs?: number, apiKey?: string, fetchImpl?: typeof fetch}} [options]
 */
export async function fetchEventsList({ maxPages = 30, ...retryOpts } = {}) {
  /** @type {unknown[]} */
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${BASE}/events_list.php?csearch=&page=${page}`;
    /** @type {unknown} */
    let rows;
    try {
      rows = await fetchJsonPatient(url, retryOpts);
    } catch (cause) {
      // A catalog cannot legitimately have no first page. Keep later-page
      // failures as pagination termination, but make a failed bootstrap run
      // visible to systemd and operators.
      if (page === 1) throw new Error(SPECTRA_EMPTY_MESSAGE, { cause });
      break;
    }
    if (!Array.isArray(rows)) {
      throw new Error("Spectra SwimPro mengirim format data yang tidak dikenali.");
    }
    if (rows.length === 0) {
      // The catalog always has historical meets. An empty first page means a
      // missing/invalid SPECTRA_API_KEY (the common case) or a provider
      // outage -- never a legitimately empty catalog. Later empty pages
      // simply mark the end of pagination.
      if (page === 1) throw new Error(SPECTRA_EMPTY_MESSAGE);
      break;
    }
    all.push(...rows);
  }
  return all;
}
