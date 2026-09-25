import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { Pool } from "pg";
import { hostnameFromHost, isLocalDevHost } from "../club/hostname";
import { ensureDbReady, getPglite, getSql } from "../db";
import { env } from "../env.server";
import { emailAndPasswordEnabled } from "./email-password";
import { GATE_PROVIDER_ID, gateIdentitySessions } from "./gate-session.server";
import { pgliteDialect } from "./pglite-dialect";
import { assertProductionAuthEnv } from "./production";

void ensureDbReady();
assertProductionAuthEnv(process.env);

const authDisabled = env("VITE_AUTH_ENABLED") === "false";
const googleClientId = env("GOOGLE_CLIENT_ID");
const googleClientSecret = env("GOOGLE_CLIENT_SECRET");
const isProd = env("NODE_ENV") === "production";

export const authConfigured = !authDisabled && Boolean(googleClientId && googleClientSecret);

const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://[::1]:8080",
];

/** Hosts whose login may stay on the request host. No fallback: an unknown host must not bounce to BMSC. */
export const authBaseURL = {
  allowedHosts: [
    "localhost",
    "localhost:8080",
    "localhost:3000",
    "localhost:4173",
    "127.0.0.1",
    "127.0.0.1:8080",
    "127.0.0.1:3000",
    "127.0.0.1:4173",
    "[::1]",
    "[::1]:8080",
    "bmsc.klaten.org",
  ],
  protocol: (isProd ? "https" : "auto") as "https" | "auto",
};

/** Add this request's host only when a Club row owns it, so Apta login stays on Apta. */
export async function allowRequestHost(request: Request): Promise<void> {
  const raw = request.headers.get("host");
  const name = hostnameFromHost(raw);
  if (!raw || !name || isLocalDevHost(name)) return;
  const sql = await getSql();
  const rows = await sql<{ id: number }>`select id from clubs where lower(hostname) = ${name}`;
  if (!rows[0]) return;
  const headerHost = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  const configured = auth.options.baseURL;
  const list =
    configured && typeof configured === "object" && "allowedHosts" in configured
      ? configured.allowedHosts
      : authBaseURL.allowedHosts;
  for (const host of [name, headerHost]) {
    if (host && !list.includes(host)) list.push(host);
  }
}

async function trustedOriginsForClubs(): Promise<string[]> {
  const origins = [...LOCAL_DEV_ORIGINS];
  const configured = env("BETTER_AUTH_URL");
  if (configured) origins.push(configured);
  try {
    const sql = await getSql();
    const rows = await sql<{ hostname: string }>`select hostname from clubs where hostname is not null`;
    for (const row of rows) {
      origins.push(`https://${row.hostname}`);
      origins.push(`http://${row.hostname}`);
    }
  } catch {
    /* the process can boot before the database is open */
  }
  return origins;
}

const databaseUrl = env("DATABASE_URL");
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

export const SESSION_TOKEN_COOKIE = "bmsc.session_token";

export const auth = betterAuth({
  baseURL: authBaseURL,
  secret: env("BETTER_AUTH_SECRET") ?? (isProd ? undefined : "dev-only-not-for-production"),
  database,
  trustedOrigins: trustedOriginsForClubs,
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", GATE_PROVIDER_ID],
      requireLocalEmailVerified: false,
    },
  },
  // Private pages must stop resolving as soon as a session expires or is revoked.
  session: { cookieCache: { enabled: false } },
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true, disableSignUp: true } } : {}),
  ...(authConfigured && googleClientId && googleClientSecret
    ? { socialProviders: { google: { clientId: googleClientId, clientSecret: googleClientSecret } } }
    : {}),
  advanced: {
    useSecureCookies: isProd,
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: { secure: isProd, sameSite: "lax" as const, path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
    },
  },
  plugins: [gateIdentitySessions(), bearer(), tanstackStartCookies()],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}
