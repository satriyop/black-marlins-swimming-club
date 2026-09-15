import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerEvent = "activate" | "fetch" | "install" | "message";
type Listener = (event: Record<string, unknown>) => void;

function loadWorker() {
  const listeners = new Map<WorkerEvent, Listener>();
  const cached = new Map<string, { url: string }>();
  const addAll = vi.fn(async (paths: string[]) => {
    for (const path of paths) cached.set(path, { url: path });
  });
  const cache = { addAll };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    match: vi.fn(async (request: { url?: string } | string) => {
      const value = typeof request === "string" ? request : new URL(request.url!).pathname;
      return cached.get(value);
    }),
  };
  const fetch = vi.fn();
  const self = {
    location: {
      href: "https://club.example/sw.js?build=test-build",
      origin: "https://club.example",
    },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: (type: WorkerEvent, listener: Listener) => listeners.set(type, listener),
  };

  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL,
    Set,
    Promise,
    caches,
    fetch,
    self,
  });
  return { addAll, cached, caches, fetch, listeners };
}

async function installWorker(worker: ReturnType<typeof loadWorker>) {
  let completion: Promise<unknown> | undefined;
  worker.listeners.get("install")!({
    waitUntil: (value: Promise<unknown>) => {
      completion = value;
    },
  });
  await completion;
}

function dispatchNavigation(worker: ReturnType<typeof loadWorker>, path: string) {
  let response: Promise<unknown> | undefined;
  worker.listeners.get("fetch")!({
    request: { method: "GET", mode: "navigate", url: `https://club.example${path}` },
    respondWith: (value: Promise<unknown>) => {
      response = value;
    },
  });
  return response;
}

describe("service worker privacy and failure policy", () => {
  it("precaches only the explicit public allowlist", async () => {
    const worker = loadWorker();
    await installWorker(worker);

    expect(worker.addAll).toHaveBeenCalledWith([
      "/offline.html",
      "/favicon.svg",
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
      "/icons/apple-touch-icon.png",
    ]);
    expect([...worker.cached.keys()].some((path) => path.includes("api"))).toBe(false);
  });

  it("uses the offline page only for a failed public navigation", async () => {
    const worker = loadWorker();
    await installWorker(worker);
    worker.fetch.mockRejectedValueOnce(new Error("network unavailable"));

    await expect(dispatchNavigation(worker, "/latihan")).resolves.toEqual({
      url: "/offline.html",
    });
  });

  it("preserves HTTP errors and bypasses invite and API requests", async () => {
    const worker = loadWorker();
    const unavailable = { status: 503 };
    worker.fetch.mockResolvedValueOnce(unavailable);

    await expect(dispatchNavigation(worker, "/latihan")).resolves.toBe(unavailable);
    expect(dispatchNavigation(worker, "/terima?token=private-token")).toBeUndefined();
    expect(dispatchNavigation(worker, "/api/auth/session")).toBeUndefined();
  });
});
