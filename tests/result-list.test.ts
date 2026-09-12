import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { ResultList } from "../src/components/swim/result-list";
import type { Result } from "../src/lib/swim/types";

function row(partial: Partial<Result> & Pick<Result, "id">): Result {
  return {
    swimmerId: 1,
    swimmerName: "Luigi",
    meetId: 10,
    meetName: "SMG Open",
    resultDate: "2025-10-03",
    stroke: "bebas",
    distanceM: 50,
    course: "50",
    timeMs: 34670,
    place: null,
    round: "final",
    status: "selesai",
    kind: "official",
    isPb: false,
    notes: null,
    ...partial,
  };
}

function renderList(
  results: Result[],
  props: { variant?: "history" | "meet"; showSwimmer?: boolean } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: createElement(ResultList, { results, ...props }),
    }),
  );
}

test("riwayat filters by kejuaraan and spoken nomor, not letter codes", () => {
  const html = renderList([
    row({ id: 1, meetId: 10, meetName: "SMG Open", stroke: "bebas", distanceM: 50 }),
    row({ id: 2, meetId: 11, meetName: "Boyolali", stroke: "punggung", distanceM: 50 }),
    row({ id: 3, meetId: null, meetName: null, kind: "test", stroke: "bebas", distanceM: 50 }),
  ]);
  expect(html).toContain("Kejuaraan");
  expect(html).toContain("Nomor");
  expect(html).toContain("Semua catatan");
  expect(html).toContain("Tes latihan");
  expect(html).toContain("SMG Open");
  expect(html).toContain("Boyolali");
  expect(html).toContain("50 Bebas");
  expect(html).toContain("50 Punggung");
  expect(html).toContain("kolam 50 m");
  expect(html).not.toContain("Sumber catatan");
  expect(html).not.toContain("50 GB");
  expect(html).not.toContain("Detail catatan");
  expect(html).toContain("PB");
});

test("kejuaraan filter is omitted on a single-meet list", () => {
  const html = renderList([
    row({ id: 1, distanceM: 50, stroke: "bebas" }),
    row({ id: 2, distanceM: 100, stroke: "bebas" }),
  ]);
  expect(html).toContain("Nomor");
  expect(html).toContain("100 Bebas");
  expect(html).not.toContain("Kejuaraan");
});

test("empty list says there are no times yet, not a filter miss", () => {
  const html = renderList([]);
  expect(html).toContain("Belum ada catatan waktu.");
  expect(html).not.toContain("pilihan ini");
});

test("long nomor group offers lihat semua instead of dumping every card", () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    row({
      id: i + 1,
      resultDate: `2026-01-${String(i + 1).padStart(2, "0")}`,
      timeMs: 40000 + i * 10,
    }),
  );
  const html = renderList(rows);
  expect(html).toContain("Lihat semua (12)");
  expect(html).toContain("50 Bebas · kolam 50 m");
});

test("official times without a meet are not labeled tes latihan", () => {
  const html = renderList([
    row({ id: 1, meetId: null, meetName: null, kind: "official", timeMs: 30530 }),
  ]);
  expect(html).toContain("Hasil resmi");
  expect(html).not.toContain("Tes latihan");
});

test("meet hasil lists every athlete and place, without personal-best chrome", () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    row({
      id: i + 1,
      swimmerId: i + 1,
      swimmerName: `Perenang ${i + 1}`,
      place: i + 1,
      timeMs: 40000 + i * 10,
    }),
  );
  const html = renderList(rows, { variant: "meet", showSwimmer: true });
  expect(html).toContain("Perenang 12");
  expect(html).toContain("Peringkat 1");
  expect(html).not.toContain("PB");
  expect(html).not.toContain("Lihat semua");
});
