import { createAuthClient } from "better-auth/react";
import { ADULT_PROVIDERS } from "./providers";

export const authClient = createAuthClient({
  fetchOptions: {
    onRequest(ctx) {
      const token = getBearerToken();
      if (token) ctx.headers.set("Authorization", `Bearer ${token}`);
      return ctx;
    },
  },
});

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";
export { ADULT_PROVIDERS };

const BEARER_KEY = "bmsc.auth.bearer-token";

export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

function setBearerToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(BEARER_KEY, token);
    else window.sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* ignore */
  }
}

export async function signIn(
  providerId: string,
  opts: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<void> {
  const callbackURL = opts.callbackURL ?? "/";
  const errorCallbackURL = opts.errorCallbackURL ?? "/login?error=auth";
  const { data, error } = await authClient.signIn.social({
    provider: providerId as "google",
    callbackURL,
    errorCallbackURL,
  });
  if (error) throw new Error(error.message ?? "Masuk gagal");
  if (data?.url) window.location.href = data.url;
}

export async function signInWithPassword(
  email: string,
  password: string,
  opts: { callbackURL?: string } = {},
): Promise<void> {
  const { error } = await authClient.signIn.email({
    email: email.trim(),
    password,
    callbackURL: opts.callbackURL ?? "/",
  });
  if (error) throw new Error(error.message ?? "Masuk gagal");
}

export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Gagal keluar");
  setBearerToken(null);
  window.location.href = redirectTo;
}
