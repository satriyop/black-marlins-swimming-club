import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LoginScreen, Splash } from "@/components/auth/login-screen";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <Splash label="Menyiapkan masuk…" />;
  if (user) return <Navigate to="/" />;
  return <LoginScreen />;
}
