export const STROKES = [
  { id: "bebas", label: "Gaya Bebas", short: "GB", en: "Freestyle" },
  { id: "punggung", label: "Gaya Punggung", short: "GP", en: "Backstroke" },
  { id: "dada", label: "Gaya Dada", short: "GD", en: "Breaststroke" },
  { id: "kupu", label: "Gaya Kupu-kupu", short: "GK", en: "Butterfly" },
  { id: "ganti", label: "Gaya Ganti", short: "GG", en: "Individual Medley" },
  { id: "campuran", label: "Campuran", short: "Mix", en: "Mixed" },
] as const;

export type StrokeId = (typeof STROKES)[number]["id"];

export const COMPETITION_STROKES = STROKES.filter((s) => s.id !== "campuran");

export const DISTANCES = [25, 50, 100, 200, 400, 800, 1500] as const;

export const COURSES = [
  { id: "50", label: "Kolam 50 m", short: "LP" },
  { id: "25", label: "Kolam 25 m", short: "SC" },
] as const;

export type CourseId = (typeof COURSES)[number]["id"];

/** PRSI kelompok umur — usia per 31 Desember tahun kompetisi. */
export const AGE_GROUPS = [
  { id: "KU-V", label: "KU V", range: "di bawah 10 tahun", min: 0, max: 9 },
  { id: "KU-IV", label: "KU IV", range: "10–11 tahun", min: 10, max: 11 },
  { id: "KU-III", label: "KU III", range: "12–13 tahun", min: 12, max: 13 },
  { id: "KU-II", label: "KU II", range: "14–15 tahun", min: 14, max: 15 },
  { id: "KU-I", label: "KU I", range: "16–18 tahun", min: 16, max: 18 },
  { id: "Senior", label: "KU Senior", range: "19 tahun ke atas", min: 19, max: 120 },
] as const;

export type AgeGroupId = (typeof AGE_GROUPS)[number]["id"];

export const MEET_LEVELS = [
  { id: "klub", label: "Klub / internal" },
  { id: "pengcab", label: "Pengcab / kabupaten" },
  { id: "pengprov", label: "Pengprov / provinsi" },
  { id: "sekolah", label: "Sekolah (O2SN / POPDA)" },
  { id: "nasional", label: "Nasional" },
  { id: "internasional", label: "Internasional" },
] as const;

export const MEET_STATUSES = [
  { id: "rencana", label: "Rencana" },
  { id: "berlangsung", label: "Berlangsung" },
  { id: "selesai", label: "Selesai" },
  { id: "batal", label: "Batal" },
] as const;

export const PRACTICE_KINDS = [
  { id: "teknik", label: "Teknik" },
  { id: "daya_tahan", label: "Daya tahan" },
  { id: "sprint", label: "Sprint" },
  { id: "gaya_ganti", label: "Gaya ganti" },
  { id: "kaki", label: "Kaki" },
  { id: "darat", label: "Latihan darat" },
  { id: "pemulihan", label: "Pemulihan" },
  { id: "tes", label: "Tes waktu" },
] as const;

export const SET_BLOCKS = [
  { id: "pemanasan", label: "Pemanasan" },
  { id: "kaki", label: "Kaki" },
  { id: "teknik", label: "Teknik" },
  { id: "utama", label: "Set utama" },
  { id: "sprint", label: "Sprint" },
  { id: "pendinginan", label: "Pendinginan" },
] as const;

export const ATTENDANCE = [
  { id: "belum", label: "Belum dicatat" },
  { id: "hadir", label: "Hadir" },
  { id: "izin", label: "Izin" },
  { id: "sakit", label: "Sakit" },
  { id: "alfa", label: "Alfa" },
] as const;

export const ACTIVITY_KINDS = [
  { id: "latihan", label: "Latihan" },
  { id: "event", label: "Event / kejuaraan" },
  { id: "rapat", label: "Rapat" },
  { id: "darat", label: "Latihan darat" },
  { id: "sosial", label: "Kegiatan klub" },
  { id: "tes", label: "Tes" },
  { id: "lainnya", label: "Lainnya" },
] as const;

export const GENDERS = [
  { id: "putra", label: "Putra" },
  { id: "putri", label: "Putri" },
] as const;

export const SWIMMER_STATUSES = [
  { id: "aktif", label: "Aktif" },
  { id: "cuti", label: "Cuti" },
  { id: "alumni", label: "Alumni" },
] as const;

export const RESULT_ROUNDS = [
  { id: "tes", label: "Tes waktu" },
  { id: "heat", label: "Penyisihan" },
  { id: "final", label: "Final" },
  { id: "timed_final", label: "Timed final" },
] as const;

export const RESULT_STATUSES = [
  { id: "selesai", label: "Selesai" },
  { id: "dns", label: "DNS" },
  { id: "dq", label: "DQ" },
  { id: "dnf", label: "DNF" },
] as const;

export const WEEKLY_PLAN = [
  { day: "Senin", kind: "teknik", focus: "Teknik gaya & drill" },
  { day: "Rabu", kind: "sprint", focus: "Kecepatan & start" },
  { day: "Jumat", kind: "daya_tahan", focus: "Volume & aerobik" },
  { day: "Sabtu", kind: "tes", focus: "Tes waktu / race pace" },
] as const;

export function labelOf<T extends { id: string; label: string }>(list: readonly T[], id: string) {
  return list.find((x) => x.id === id)?.label ?? id;
}

export function strokeLabel(id: string) {
  return labelOf(STROKES, id);
}

export function strokeShort(id: string) {
  return STROKES.find((s) => s.id === id)?.short ?? id.toUpperCase();
}

export function eventCode(distance: number, stroke: string, course?: string) {
  const s = strokeShort(stroke);
  const c = course === "25" ? " SC" : course === "50" ? " LP" : "";
  return `${distance} ${s}${c}`;
}
