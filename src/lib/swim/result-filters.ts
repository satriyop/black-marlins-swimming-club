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
