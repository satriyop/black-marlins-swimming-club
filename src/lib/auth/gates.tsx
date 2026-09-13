import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { returnPathForLocation } from "./return-path";
import { ADULT_PROVIDERS, authEnabled, signIn, signOut } from "./client";
import { hasGateSessionMarker } from "./gate-session-marker";
import { resolveSignInGateState } from "./sign-in-gate";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

export const SIGN_IN_PATH = "/login";

export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr ?? "" });
  if (to !== SIGN_IN_PATH) return <Navigate to={to} />;
  const path = typeof window !== "undefined" ? window.location.pathname : pathname;
  const search = typeof window !== "undefined" ? window.location.search : searchStr;
  const next = returnPathForLocation(path, search);
  const href = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  if (typeof window !== "undefined") {
    const here = `${window.location.pathname}${window.location.search}`;
    if (here !== href) window.location.replace(href);
  }
  return <Navigate to="/login" search={next ? { next } : {}} />;
}

export function SignInGate({
  children, fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, isPending } = useCurrentUserState();
  const state = resolveSignInGateState({ isPending, hasUser: user !== null });
  if (state === "pending") return null;
  if (state === "signed_in") return <>{children}</>;
  return <>{fallback ?? <SignInButtons />}</>;
}

export function SignInButtons() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {ADULT_PROVIDERS.map((p) => (
        <button key={p.providerId} type="button" onClick={() => signIn(p.providerId, { callbackURL: "/" })} className="w-full cursor-pointer rounded-md border border-neutral-300 px-4 py-2 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
          Lanjutkan dengan {p.label}
        </button>
      ))}
    </div>
  );
}

export function UserButton() {
  const user = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);
  const gateSession = useSyncExternalStore(subscribeToNothing, hasGateSessionMarker, noGateSessionOnServer);
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/20">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-medium">{label}</span>
      {authEnabled && !gateSession && (
        <button type="button" disabled={signingOut} onClick={() => { setSigningOut(true); void signOut().catch(() => setSigningOut(false)); }} className="cursor-pointer text-sm underline-offset-4 opacity-70 hover:underline disabled:cursor-wait disabled:no-underline">
          {signingOut ? "Keluar…" : "Keluar"}
        </button>
      )}
    </div>
  );
}
