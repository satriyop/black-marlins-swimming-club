import { expect, test } from "vitest";
import { compareProgramOrder, preferredEvent, sortEvents } from "../src/lib/swim/event-order";

const rows = [
  { stroke: "bebas", distanceM: 50, course: "25", kind: "official" as const, on: "2025-09-21" },
  { stroke: "bebas", distanceM: 25, course: "50", kind: "official" as const, on: "2025-06-22" },
  { stroke: "bebas", distanceM: 50, course: "50", kind: "official" as const, on: "2026-09-03" },
  { stroke: "dada", distanceM: 50, course: "50", kind: "official" as const, on: "2026-07-04" },
  { stroke: "kupu", distanceM: 25, course: "25", kind: "official" as const, on: "2025-09-21" },
  { stroke: "ganti", distanceM: 200, course: "50", kind: "official" as const, on: "2025-12-17" },
  { stroke: "ganti", distanceM: 100, course: "25", kind: "official" as const, on: "2025-09-21" },
  { stroke: "bebas", distanceM: 50, course: "50", kind: "test" as const, on: "2026-09-27" },
];

function label(row: (typeof rows)[number]) {
  return `${row.distanceM} ${row.stroke} ${row.course} ${row.kind}`;
}

test("program order is pool, then stroke, then distance, with resmi before tes", () => {
  const sorted = sortEvents(rows, "program", (row) => row.on).map(label);
  expect(sorted).toEqual([
    "25 bebas 50 official",
    "50 bebas 50 official",
    "50 bebas 50 test",
    "50 dada 50 official",
    "200 ganti 50 official",
    "50 bebas 25 official",
    "25 kupu 25 official",
    "100 ganti 25 official",
  ]);
  expect(compareProgramOrder(rows[2]!, rows[0]!)).toBeLessThan(0);
});

test("latest puts the newest date first and keeps program order on a tie", () => {
  const sorted = sortEvents(rows, "latest", (row) => row.on).map(label);
  expect(sorted.slice(0, 3)).toEqual([
    "50 bebas 50 test",
    "50 bebas 50 official",
    "50 dada 50 official",
  ]);
  const sameDay = sortEvents(
    rows.filter((row) => row.on === "2025-09-21"),
    "latest",
    (row) => row.on,
  ).map(label);
  expect(sameDay).toEqual(["50 bebas 25 official", "25 kupu 25 official", "100 ganti 25 official"]);
});

test("a missing chart choice stays on the busiest event in either display order", () => {
  const events = [
    { stroke: "bebas", distanceM: 50, course: "50", kind: "official" as const, n: 1, on: "2026-09-27" },
    { stroke: "dada", distanceM: 50, course: "50", kind: "official" as const, n: 3, on: "2026-07-04" },
  ];
  const keyOf = (row: (typeof events)[number]) =>
    `${row.stroke}-${row.distanceM}-${row.course}-${row.kind}`;
  for (const order of ["program", "latest"] as const) {
    const shown = sortEvents(events, order, (row) => row.on);
    expect(keyOf(preferredEvent(shown, "", keyOf)!)).toBe("dada-50-50-official");
    expect(keyOf(preferredEvent(shown, "bebas-50-50-official", keyOf)!)).toBe("bebas-50-50-official");
  }
});

test("a tie for the most swims uses program order", () => {
  const events = [
    { stroke: "dada", distanceM: 50, course: "50", kind: "official" as const, n: 2 },
    { stroke: "bebas", distanceM: 50, course: "50", kind: "official" as const, n: 2 },
  ];
  const keyOf = (row: (typeof events)[number]) =>
    `${row.stroke}-${row.distanceM}-${row.course}-${row.kind}`;
  expect(keyOf(preferredEvent(events, "", keyOf)!)).toBe("bebas-50-50-official");
});
