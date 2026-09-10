/** Swim time stored as integer milliseconds. Displayed as M:SS.hh or SS.hh */

export function parseTimeToMs(raw: string): number | null {
  const v = raw.trim().replace(",", ".");
  if (!v) return null;
  const parts = v.split(":");
  if (parts.length === 1) {
    const sec = Number(parts[0]);
    if (!Number.isFinite(sec) || sec < 0) return null;
    return Math.round(sec * 1000);
  }
  if (parts.length === 2) {
    const min = Number(parts[0]);
    const sec = Number(parts[1]);
    if (!Number.isFinite(min) || !Number.isFinite(sec) || min < 0 || sec < 0) return null;
    return Math.round(min * 60_000 + sec * 1000);
  }
  if (parts.length === 3) {
    const hr = Number(parts[0]);
    const min = Number(parts[1]);
    const sec = Number(parts[2]);
    if (![hr, min, sec].every(Number.isFinite)) return null;
    return Math.round(hr * 3_600_000 + min * 60_000 + sec * 1000);
  }
  return null;
}

export function formatTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const hundredths = Math.round(ms / 10);
  const cs = hundredths % 100;
  let totalSec = Math.floor(hundredths / 100);
  const sec = totalSec % 60;
  totalSec = Math.floor(totalSec / 60);
  const min = totalSec % 60;
  const hr = Math.floor(totalSec / 60);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  if (hr > 0) return `${hr}:${pad(min)}:${pad(sec)}.${pad(cs)}`;
  if (min > 0) return `${min}:${pad(sec)}.${pad(cs)}`;
  return `${sec}.${pad(cs)}`;
}

export function formatInterval(sec: number | null | undefined): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `@ ${s} dtk`;
  return `@ ${m}:${String(s).padStart(2, "0")}`;
}

export function deltaMs(current: number, previous: number) {
  return current - previous;
}

export function formatDelta(ms: number) {
  const sign = ms < 0 ? "−" : "+";
  return `${sign}${formatTime(Math.abs(ms))}`;
}
