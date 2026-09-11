import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { parseSetCookieHeader, setRequestCookie, setSessionCookie } from "better-auth/cookies";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import {
  GATE_IDENTITY_HEADER, gateIdentityEnabled, gateIdentityFromHeaders,
  gateIdentityUserInfo, sessionBoundToGateIdentity,
} from "./gate-identity.server";
import { GATE_SESSION_MARKER_COOKIE } from "./gate-session-marker";

export const GATE_PROVIDER_ID = "grok-gate";
const GATE_ACCOUNT_ISSUER = "https://grok.com";
const LOG = "[gate-identity]";
type GateAccount = Parameters<typeof handleOAuthUserInfo>[1]["account"];
type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

async function emitSessionCookie(ctx: Ctx, sessionTokenName: string, sessionToken: string): Promise<string | null> {
  const attributes = ctx.context.authCookies.sessionToken.attributes;
  const maxAge = ctx.context.sessionConfig.expiresIn;
  const cookieOptions = { ...attributes, maxAge };
  let signedCookie: string;
  try {
    signedCookie = await ctx.setSignedCookie(sessionTokenName, sessionToken, ctx.context.secret, cookieOptions);
  } catch (err) {
    console.error(`${LOG} setSignedCookie failed`, err);
    return null;
  }
  const sessionValue = parseSetCookieHeader(signedCookie).get(sessionTokenName)?.value;
  if (!sessionValue) {
    console.error(`${LOG} signed Set-Cookie missing session token value`);
    return null;
  }
  try {
    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(sessionTokenName, sessionValue, {
      path: cookieOptions.path ?? "/",
      httpOnly: cookieOptions.httpOnly ?? true,
      secure: cookieOptions.secure ?? true,
      sameSite: (cookieOptions.sameSite as "lax" | "strict" | "none") ?? "lax",
      maxAge: typeof maxAge === "number" ? maxAge : undefined,
      domain: cookieOptions.domain,
    });
  } catch (err) {
    console.error(`${LOG} TanStack setCookie failed`, err);
  }
  try {
    ctx.context.responseHeaders?.append("set-cookie", signedCookie);
  } catch (err) {
    console.error(`${LOG} responseHeaders.append(set-cookie) failed`, err);
  }
  return sessionValue;
}

async function expireSessionDataCookie(ctx: Ctx, cookie: { name: string; attributes: { path?: string; secure?: boolean } }): Promise<void> {
  const path = cookie.attributes.path ?? "/";
  const secure = cookie.attributes.secure ?? true;
  try {
    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(cookie.name, "", { path, httpOnly: true, secure, sameSite: "lax", maxAge: 0 });
  } catch (err) {
    console.error(`${LOG} TanStack setCookie (expire session_data) failed`, err);
  }
  try {
    ctx.context.responseHeaders?.append("set-cookie", `${cookie.name}=; Path=${path}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=0`);
  } catch (err) {
    console.error(`${LOG} responseHeaders.append (expire session_data) failed`, err);
  }
}

async function writeGateMarkerCookie(ctx: Ctx, clear: boolean): Promise<void> {
  const sessionMaxAge = ctx.context.sessionConfig.expiresIn;
  const maxAge = clear ? 0 : typeof sessionMaxAge === "number" ? sessionMaxAge : undefined;
  const value = clear ? "" : "1";
  try {
    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(GATE_SESSION_MARKER_COOKIE, value, { path: "/", httpOnly: false, secure: true, sameSite: "lax", maxAge });
  } catch (err) {
    console.error(`${LOG} TanStack setCookie (gate marker) failed`, err);
  }
  try {
    ctx.context.responseHeaders?.append("set-cookie", `${GATE_SESSION_MARKER_COOKIE}=${value}; Path=/; Secure; SameSite=Lax${maxAge === undefined ? "" : `; Max-Age=${maxAge}`}`);
  } catch (err) {
    console.error(`${LOG} responseHeaders.append (gate marker) failed`, err);
  }
}

async function clearGateMarkerIfPresent(ctx: Ctx, inbound: Headers): Promise<void> {
  const cookieHeader = inbound.get("cookie") ?? "";
  if (!cookieHeader.includes(`${GATE_SESSION_MARKER_COOKIE}=`)) return;
  await writeGateMarkerCookie(ctx, true);
}

function removeRequestCookie(headers: Headers, name: string): void {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return;
  const kept = cookieHeader.split(";").map((pair) => pair.trim()).filter((pair) => pair && !pair.startsWith(`${name}=`));
  if (kept.length > 0) headers.set("cookie", kept.join("; "));
  else headers.delete("cookie");
}

export function gateIdentitySessions() {
  return {
    id: "grok-gate-identity",
    hooks: {
      before: [{
        matcher: (ctx: { path?: string }) => ctx.path === "/get-session",
        handler: createAuthMiddleware(async (ctx) => {
          if (!gateIdentityEnabled()) return;
          const inbound = ctx.request?.headers ?? ctx.headers;
          if (!inbound) return;
          if (inbound.get("authorization")) return;
          if (!inbound.get(GATE_IDENTITY_HEADER)) {
            await clearGateMarkerIfPresent(ctx, inbound);
            return;
          }
          const identity = await gateIdentityFromHeaders(inbound);
          if (!identity) return;
          const sessionCookieName = ctx.context.authCookies.sessionToken.name;
          const cookieHeader = inbound.get("cookie") ?? "";
          if (cookieHeader.includes(`${sessionCookieName}=`)) {
            const existing = await getSessionFromCtx(ctx).catch(() => null);
            if (existing?.session && existing.user) {
              const accounts = await ctx.context.internalAdapter.findAccounts(existing.user.id).catch(() => null);
              if (!accounts) return;
              if (sessionBoundToGateIdentity(accounts, identity.sub, GATE_PROVIDER_ID)) {
                await writeGateMarkerCookie(ctx, false);
                return;
              }
              await ctx.context.internalAdapter.deleteSession(existing.session.token).catch(() => null);
            }
          }
          try {
            const result = await handleOAuthUserInfo(ctx, {
              userInfo: gateIdentityUserInfo(identity),
              account: { providerId: GATE_PROVIDER_ID, issuer: GATE_ACCOUNT_ISSUER, accountId: identity.sub } as GateAccount,
            });
            if (result.error || !result.data) return;
            await setSessionCookie(ctx, result.data);
            const sessionValue = await emitSessionCookie(ctx, sessionCookieName, result.data.session.token);
            if (!sessionValue) return;
            await writeGateMarkerCookie(ctx, false);
            const sessionDataCookie = ctx.context.authCookies.sessionData;
            await expireSessionDataCookie(ctx, sessionDataCookie);
            const headers = new Headers(Object.fromEntries(inbound.entries()));
            setRequestCookie(headers, sessionCookieName, sessionValue);
            removeRequestCookie(headers, sessionDataCookie.name);
            return { context: { headers } };
          } catch (err) {
            console.error(`${LOG} gate identity session hook threw`, err);
          }
        }),
      }],
    },
  } satisfies BetterAuthPlugin;
}
