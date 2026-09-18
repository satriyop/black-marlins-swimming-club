import { expect, test, vi } from "vitest";
import { fetchEventsList } from "../scripts/spectra-client.mjs";

test("an empty first catalog page is an upstream failure, not a successful empty sync", async () => {
  const fetchImpl = vi.fn(async () => new Response("[]", { status: 200 }));

  await expect(fetchEventsList({ maxPages: 1, retries: 0, delayMs: 0, fetchImpl })).rejects.toThrow(
    "Spectra SwimPro sedang tidak mengirim data",
  );
});

test("a failed first catalog request is not mistaken for the end of pagination", async () => {
  const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));

  await expect(fetchEventsList({ maxPages: 1, retries: 0, delayMs: 0, fetchImpl })).rejects.toThrow(
    "Spectra SwimPro sedang tidak mengirim data",
  );
});

test("an empty page after catalog data ends pagination normally", async () => {
  const event = { kode: "MEET_2026" };
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([event]), { status: 200 }))
    .mockResolvedValueOnce(new Response("[]", { status: 200 }));

  await expect(
    fetchEventsList({ maxPages: 2, retries: 0, delayMs: 0, fetchImpl }),
  ).resolves.toEqual([event]);
});

test("configured API key is sent with every Spectra request", async () => {
  const event = { kode: "MEET_2026" };
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("x-api-key")).toBe("test-api-key");
    return new Response(JSON.stringify([event]), { status: 200 });
  });

  await expect(
    fetchEventsList({ maxPages: 1, retries: 0, delayMs: 0, apiKey: "test-api-key", fetchImpl }),
  ).resolves.toEqual([event]);
  expect(fetchImpl).toHaveBeenCalledOnce();
});
