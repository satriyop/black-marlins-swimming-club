import { expect, test } from "vitest";
import { returnPathForLocation, safeReturnPath } from "../src/lib/auth/return-path";

test("allows same-origin app paths with search", () => {
  expect(safeReturnPath("/latihan/12")).toBe("/latihan/12");
  expect(safeReturnPath("/pengumuman/3?from=home")).toBe("/pengumuman/3?from=home");
  expect(safeReturnPath("/event/1")).toBe("/event/1");
});

test("rejects external, protocol-relative, recursive login, and unsafe schemes", () => {
  expect(safeReturnPath("https://evil.example/phish")).toBeNull();
  expect(safeReturnPath("//evil.example/x")).toBeNull();
  expect(safeReturnPath("/\\evil.example")).toBeNull();
  expect(safeReturnPath("/login")).toBeNull();
  expect(safeReturnPath("/login?next=/latihan")).toBeNull();
  expect(safeReturnPath("javascript:alert(1)")).toBeNull();
  expect(safeReturnPath("/latihan/%2f%2fevil.example")).toBeNull();
  expect(safeReturnPath("")).toBeNull();
  expect(safeReturnPath("latihan")).toBeNull();
});

test("guarded location keeps path and omits login/terima", () => {
  expect(returnPathForLocation("/latihan/4", "?tab=hadir")).toBe("/latihan/4?tab=hadir");
  expect(returnPathForLocation("/login", "?next=/latihan")).toBeNull();
  expect(returnPathForLocation("/terima", "?token=abc")).toBeNull();
});
