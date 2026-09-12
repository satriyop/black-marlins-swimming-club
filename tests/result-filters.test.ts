import { expect, test } from "vitest";
import {
  activeFilter,
  emptyResultsMessage,
  filterResults,
  groupResultsByNomor,
  kindFromSumber,
  meetFilterOptions,
  nomorFilterOptions,
  previewRows,
  resultSourceLabel,
  showMeetFilter,
  sumberValue,
} from "../src/lib/swim/result-filters";

const smg = {
  id: 1,
  meetId: 10,
  meetName: "SMG Open",
  kind: "official" as const,
  stroke: "bebas",
  distanceM: 50,
  resultDate: "2025-10-03",
};
const boyolali = {
  id: 2,
  meetId: 11,
  meetName: "Boyolali",
  kind: "official" as const,
  stroke: "punggung",
  distanceM: 50,
  resultDate: "2025-08-23",
};
const tes = {
  id: 3,
  meetId: null,
  meetName: null,
  kind: "test" as const,
  stroke: "bebas",
  distanceM: 50,
  resultDate: "2026-01-10",
};
const smg100 = {
  id: 4,
  meetId: 10,
  meetName: "SMG Open",
  kind: "official" as const,
  stroke: "bebas",
  distanceM: 100,
  resultDate: "2025-10-04",
};

test("meet options are semua, tes, then named kejuaraan", () => {
  const options = meetFilterOptions([smg, tes, boyolali]);
  expect(options.map((o) => o.value)).toEqual(["all", "test", "11", "10"]);
  expect(options.map((o) => o.label)).toEqual([
    "Semua catatan",
    "Tes latihan",
    "Boyolali",
    "SMG Open",
  ]);
});

test("meet options omit tes when every row is a kejuaraan", () => {
  expect(meetFilterOptions([smg, boyolali]).map((o) => o.value)).toEqual(["all", "11", "10"]);
});

test("nomor options are semua then spoken event codes without kolam", () => {
  const options = nomorFilterOptions([smg, boyolali, smg100, tes]);
  expect(options.map((o) => ({ value: o.value, label: o.label }))).toEqual([
    { value: "all", label: "Semua nomor" },
    { value: "50-bebas", label: "50 Bebas" },
    { value: "50-punggung", label: "50 Punggung" },
    { value: "100-bebas", label: "100 Bebas" },
  ]);
});

test("filters combine kejuaraan and nomor", () => {
  const rows = [smg, boyolali, tes, smg100];
  expect(filterResults(rows, "10", "all").map((r) => r.id)).toEqual([1, 4]);
  expect(filterResults(rows, "test", "all").map((r) => r.id)).toEqual([3]);
  expect(filterResults(rows, "all", "50-bebas").map((r) => r.id)).toEqual([1, 3]);
  expect(filterResults(rows, "10", "50-bebas").map((r) => r.id)).toEqual([1]);
  expect(filterResults(rows, "all", "all")).toHaveLength(4);
});

test("kejuaraan filter is hidden when every row is the same meet", () => {
  expect(showMeetFilter([smg, smg100])).toBe(false);
  expect(showMeetFilter([smg, tes])).toBe(true);
  expect(showMeetFilter([smg, boyolali])).toBe(true);
});

const orphan = {
  id: 5,
  meetId: null,
  meetName: null,
  kind: "official" as const,
  stroke: "bebas",
  distanceM: 50,
  resultDate: "2025-08-23",
};

test("official times whose meet was deleted are not tes latihan", () => {
  expect(meetFilterOptions([orphan, smg]).map((o) => o.value)).toEqual(["all", "10"]);
  expect(filterResults([orphan, tes, smg], "test", "all").map((r) => r.id)).toEqual([3]);
  expect(filterResults([orphan, tes, smg], "all", "all").map((r) => r.id)).toEqual([5, 3, 1]);
  expect(showMeetFilter([orphan, tes])).toBe(true);
  expect(showMeetFilter([orphan])).toBe(false);
});

test("stale filter values fall back to all", () => {
  expect(activeFilter("10", [{ value: "all" }, { value: "10" }])).toBe("10");
  expect(activeFilter("10", [{ value: "all" }, { value: "11" }])).toBe("all");
});

test("empty copy distinguishes no times from a filter miss", () => {
  expect(emptyResultsMessage(false)).toBe("Belum ada catatan waktu.");
  expect(emptyResultsMessage(true)).toBe("Belum ada catatan untuk pilihan ini.");
});

test("groups by nomor and kolam, newest first, PB is fastest selesai", () => {
  const groups = groupResultsByNomor([
    {
      ...smg,
      id: 1,
      resultDate: "2026-09-03",
      timeMs: 30530,
      meetName: "Popda",
      course: "50",
      status: "selesai",
    },
    {
      ...smg,
      id: 2,
      resultDate: "2026-07-05",
      timeMs: 31760,
      meetName: "Didik Melon",
      course: "50",
      status: "selesai",
    },
    {
      ...boyolali,
      id: 3,
      resultDate: "2026-09-03",
      timeMs: 92460,
      meetName: "Popda",
      course: "50",
      status: "selesai",
    },
    {
      ...tes,
      id: 4,
      resultDate: "2026-01-10",
      timeMs: 30000,
      course: "25",
      status: "selesai",
    },
  ]);
  expect(groups.map((g) => g.label)).toEqual([
    "50 Bebas · kolam 50 m",
    "50 Punggung · kolam 50 m",
    "50 Bebas · kolam 25 m",
  ]);
  expect(groups[0]!.rows.map((r) => r.id)).toEqual([1, 2]);
  expect(groups[0]!.pbTimeMs).toBe(30530);
  expect(groups[0]!.pbResultId).toBe(1);
});

test("preview keeps 8 rows until expanded", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));
  expect(previewRows(rows, false)).toHaveLength(8);
  expect(previewRows(rows, true)).toHaveLength(12);
});

test("PB for a group comes from the unfiltered set", () => {
  const popda = {
    ...smg,
    id: 1,
    resultDate: "2026-09-03",
    timeMs: 31760,
    meetName: "Popda",
    course: "50",
    status: "selesai",
  };
  const faster = {
    ...smg,
    id: 2,
    resultDate: "2026-07-05",
    timeMs: 30530,
    meetName: "Didik Melon",
    course: "50",
    status: "selesai",
  };
  const groups = groupResultsByNomor([popda], { pbFrom: [popda, faster] });
  expect(groups[0]!.pbTimeMs).toBe(30530);
  expect(groups[0]!.pbResultId).toBe(2);
  expect(groups[0]!.rows.map((r) => r.id)).toEqual([1]);
});

test("source label uses kind when the meet name is gone", () => {
  expect(resultSourceLabel({ meetName: "Popda", kind: "official" })).toBe("Popda");
  expect(resultSourceLabel({ meetName: null, kind: "official" })).toBe("Hasil resmi");
  expect(resultSourceLabel({ meetName: null, kind: "test" })).toBe("Tes latihan");
});

test("sumber value keeps official rows without a meet distinct from tes", () => {
  expect(sumberValue(null, "official")).toBe("official");
  expect(sumberValue(null, "test")).toBe("");
  expect(sumberValue(10, "official")).toBe("10");
  expect(kindFromSumber("")).toEqual({ kind: "test", meetId: null });
  expect(kindFromSumber("official")).toEqual({ kind: "official", meetId: null });
  expect(kindFromSumber("10")).toEqual({ kind: "official", meetId: 10 });
});
