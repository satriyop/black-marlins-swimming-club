#!/usr/bin/env node
/**
 * Start the production server and GET /login. Used in CI after `npm run build`.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(root, ".output/server/index.mjs");
const port = process.env.SMOKE_PORT || "3010";
const host = "127.0.0.1";
const url = `http://${host}:${port}/login`;

if (!existsSync(server)) {
  console.error("[smoke] missing .output/server/index.mjs — run npm run build first");
  process.exit(1);
}

const child = spawn(process.execPath, [server], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOST: host,
    PORT: port,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "ci-smoke-secret-not-for-prod",
    BETTER_AUTH_URL: `http://${host}:${port}`,
    VITE_AUTH_ENABLED: "true",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "ci.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "ci-not-real",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (buf) => {
  output += buf.toString();
});
child.stderr.on("data", (buf) => {
  output += buf.toString();
});

function stop(code) {
  child.kill("SIGTERM");
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      // already gone
    }
    process.exit(code);
  }, 1500).unref();
}

async function waitForLogin() {
  const deadline = Date.now() + 20_000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      last = `${res.status}`;
      if (res.status >= 200 && res.status < 400) return res.status;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`login not ready: ${last}\n${output.slice(-2000)}`);
}

child.on("exit", (code, signal) => {
  if (code || signal) {
    console.error(`[smoke] server exited early code=${code} signal=${signal}\n${output.slice(-2000)}`);
  }
});

try {
  const status = await waitForLogin();
  console.log(`[smoke] GET ${url} → ${status}`);
  stop(0);
} catch (err) {
  console.error("[smoke] failed:", err?.message || err);
  stop(1);
}
