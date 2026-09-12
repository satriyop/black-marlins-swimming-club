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

function renderList(results: Result[]) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, {
      client,
      children: createElement(ResultList, { results }),
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
