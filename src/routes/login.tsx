import { createFileRoute, getRouteApi, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { safeReturnPath } from "@/lib/auth/return-path";
import { LoginScreen, Splash } from "@/components/auth/login-screen";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: Login,
});

const rootRoute = getRouteApi("__root__");

function Login() {
  const chrome = rootRoute.useLoaderData();
  const { next, error } = Route.useSearch();
  const dest = safeReturnPath(next) ?? "/";
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <Splash chrome={chrome} label="Menyiapkan masuk…" />;
  if (user) {
    if (dest === "/") return <Navigate to="/" />;
    if (typeof window !== "undefined") {
      window.location.replace(dest);
    }
    return <Splash chrome={chrome} label="Membuka halaman…" />;
  }
  return <LoginScreen next={dest === "/" ? null : dest} errorCode={error} />;
}
