import { AccountMenu } from "@/components/auth/account-menu";
import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
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
  const path = typeof window !== "undefined" ? window.location.pathname : pathname;
  const search = typeof window !== "undefined" ? window.location.search : searchStr;
  const next = returnPathForLocation(path, search);
  const href =
    to !== SIGN_IN_PATH ? to : next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  useLayoutEffect(() => {
    const here = `${window.location.pathname}${window.location.search}`;
    if (here !== href) window.location.replace(href);
  }, [href]);
  return <p role="status">Membuka masuk…</p>;
}

export function SignInGate({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
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
        <button
          key={p.providerId}
          type="button"
          onClick={() => signIn(p.providerId, { callbackURL: "/" })}
          className="w-full cursor-pointer rounded-md border border-neutral-300 px-4 py-2 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Lanjutkan dengan {p.label}
        </button>
      ))}
    </div>
  );
}

export function UserButton({ roles = [], children }: { roles?: string[]; children?: ReactNode }) {
  const user = useCurrentUser();
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );
  if (!user) return null;
  return (
    <AccountMenu
      key={user.id}
      user={user}
      roles={roles}
      onSignOut={authEnabled && !gateSession ? () => signOut() : undefined}
    >
      {children}
    </AccountMenu>
  );
}
