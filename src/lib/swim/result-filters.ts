import { eventCode } from "./constants";

type MeetRow = {
  meetId: number | null;
  meetName: string | null;
  kind: "official" | "test";
};

type NomorRow = {
  stroke: string;
  distanceM: number;
};

export function meetFilterOptions(results: MeetRow[]): { value: string; label: string }[] {
  const meets = new Map<number, string>();
  let hasTest = false;
  for (const r of results) {
    if (r.kind === "test") {
      hasTest = true;
      continue;
    }
    if (r.meetId == null) continue;
    meets.set(r.meetId, r.meetName ?? `Kejuaraan ${r.meetId}`);
  }
  const named = [...meets.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "id"))
    .map(([id, name]) => ({ value: String(id), label: name }));
  return [
    { value: "all", label: "Semua catatan" },
    ...(hasTest ? [{ value: "test", label: "Tes latihan" }] : []),
    ...named,
  ];
}

export function nomorFilterOptions(results: NomorRow[]): { value: string; label: string }[] {
  const seen = new Map<string, NomorRow>();
  for (const r of results) {
    const key = `${r.distanceM}-${r.stroke}`;
    if (!seen.has(key)) seen.set(key, { stroke: r.stroke, distanceM: r.distanceM });
  }
  const numbered = [...seen.values()]
    .sort((a, b) => a.distanceM - b.distanceM || a.stroke.localeCompare(b.stroke, "id"))
    .map((n) => ({
      value: `${n.distanceM}-${n.stroke}`,
      label: eventCode(n.distanceM, n.stroke),
    }));
  return [{ value: "all", label: "Semua nomor" }, ...numbered];
}

export function filterResults<T extends MeetRow & NomorRow>(
  results: T[],
  meet: string,
  nomor: string,
): T[] {
  return results.filter((r) => {
    const meetOk =
      meet === "all" ||
      (meet === "test" && r.kind === "test") ||
      (r.meetId != null && String(r.meetId) === meet);
    const nomorOk = nomor === "all" || `${r.distanceM}-${r.stroke}` === nomor;
    return meetOk && nomorOk;
  });
}

export function showMeetFilter(results: MeetRow[]): boolean {
  const keys = new Set(
    results.map((r) =>
      r.kind === "test" ? "test" : r.meetId != null ? String(r.meetId) : "orphan",
    ),
  );
  return keys.size > 1;
}

export function activeFilter(value: string, options: { value: string }[]): string {
  return options.some((o) => o.value === value) ? value : "all";
}

export function emptyResultsMessage(filterMiss: boolean): string {
  return filterMiss ? "Belum ada catatan untuk pilihan ini." : "Belum ada catatan waktu.";
}

export const NOMOR_PREVIEW_LIMIT = 8;

type GroupRow = MeetRow &
  NomorRow & {
    id: number;
    resultDate: string;
    course: string;
    timeMs: number | null;
    status: string;
  };

export type NomorGroup<T extends GroupRow = GroupRow> = {
  key: string;
  stroke: string;
  distanceM: number;
  course: string;
  label: string;
  pbTimeMs: number | null;
  pbResultId: number | null;
  rows: T[];
};

function nomorKey(r: { distanceM: number; stroke: string; course: string }) {
  return `${r.distanceM}-${r.stroke}-${r.course}`;
}

function fastestSelesai<T extends GroupRow>(rows: T[]): T | null {
  const finished = rows.filter((r) => r.status === "selesai" && r.timeMs != null && r.timeMs > 0);
  return finished.reduce<T | null>((best, r) => {
    if (!best || r.timeMs! < best.timeMs!) return r;
    return best;
  }, null);
}

export function groupResultsByNomor<T extends GroupRow>(
  results: T[],
  opts: { pbFrom?: T[] } = {},
): NomorGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of results) {
    const key = nomorKey(r);
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  const pbPool = opts.pbFrom ?? results;
  const groups: NomorGroup<T>[] = [...map.entries()].map(([key, rows]) => {
    const sorted = [...rows].sort(
      (a, b) => b.resultDate.localeCompare(a.resultDate) || b.id - a.id,
    );
    const pb = fastestSelesai(pbPool.filter((r) => nomorKey(r) === key));
    const sample = sorted[0]!;
    return {
      key,
      stroke: sample.stroke,
      distanceM: sample.distanceM,
      course: sample.course,
      label: eventCode(sample.distanceM, sample.stroke, sample.course),
      pbTimeMs: pb?.timeMs ?? null,
      pbResultId: pb?.id ?? null,
      rows: sorted,
    };
  });
  return groups.sort((a, b) => {
    const da = a.rows[0]!.resultDate;
    const db = b.rows[0]!.resultDate;
    return (
      db.localeCompare(da) || a.distanceM - b.distanceM || a.stroke.localeCompare(b.stroke, "id")
    );
  });
}

export function previewRows<T>(rows: T[], expanded: boolean): T[] {
  if (expanded || rows.length <= NOMOR_PREVIEW_LIMIT) return rows;
  return rows.slice(0, NOMOR_PREVIEW_LIMIT);
}

export function resultSourceLabel(r: {
  meetName: string | null;
  kind: "official" | "test";
}): string {
  if (r.meetName) return r.meetName;
  return r.kind === "official" ? "Hasil resmi" : "Tes latihan";
}

export function sumberValue(meetId: number | null | undefined, kind: "official" | "test"): string {
  if (meetId != null) return String(meetId);
  return kind === "official" ? "official" : "";
}

export function kindFromSumber(value: string): {
  kind: "official" | "test";
  meetId: number | null;
} {
  if (value === "official") return { kind: "official", meetId: null };
  if (value === "") return { kind: "test", meetId: null };
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) return { kind: "test", meetId: null };
  return { kind: "official", meetId: id };
}
