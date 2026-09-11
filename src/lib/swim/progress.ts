import type { Result } from "./types";

/** Compare like-for-like completed swims, in event chronology, excluding DQ/DNS/DNF. */
export function progressSeries(
  results: Result[],
  selected: Pick<Result, "stroke" | "distanceM" | "course" | "kind">,
) {
  return results
    .filter(
      (r) =>
        r.status === "selesai" &&
        r.timeMs != null &&
        r.timeMs > 0 &&
        r.stroke === selected.stroke &&
        r.distanceM === selected.distanceM &&
        r.course === selected.course &&
        r.kind === selected.kind,
    )
    .sort((a, b) => a.resultDate.localeCompare(b.resultDate) || a.id - b.id);
}

export function progressDescription(series: Result[]): string {
  if (series.length < 2)
    return "Tambahkan dua catatan selesai pada nomor, panjang kolam, dan sumber yang sama untuk melihat perubahan.";
  const delta = series[series.length - 1]!.timeMs! - series[series.length - 2]!.timeMs!;
  if (delta === 0) return "Waktu terakhir sama dengan catatan sebelumnya.";
  const seconds = (Math.abs(delta) / 1000).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${seconds} detik lebih ${delta < 0 ? "cepat" : "lambat"} dari catatan sebelumnya.`;
}
