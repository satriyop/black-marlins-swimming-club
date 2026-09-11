import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { acceptClubInvite } from "@/lib/server/fns";
import { ADULT_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export const Route = createFileRoute("/terima")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: Page,
});

function Page() {
  const { token } = Route.useSearch();
  const { user } = useCurrentUserState();
  const [password, setPassword] = useState("");
  const google = ADULT_PROVIDERS.find((p) => p.idp === "google");
  const mut = useMutation({
    mutationFn: (input: { password?: string }) => acceptClubInvite({ data: { token, password: input.password } }),
  });

  if (!token) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <p>Undangan tidak berlaku.</p>
        <Link to="/login" className="mt-4 inline-block text-sm text-primary">Masuk</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-16">
      <h1 className="font-display text-4xl">Terima undangan</h1>
      <p className="text-sm text-muted-foreground">Staf dan wali masuk Google, lalu terima. Perenang mengisi password.</p>
      {user ? (
        <Button onClick={() => mut.mutate({})} disabled={mut.isPending}>
          {mut.isPending ? "Memproses…" : "Terima sebagai akun ini"}
        </Button>
      ) : (
        <>
          {google ? (
            <Button type="button" onClick={() => signIn(google.providerId, { callbackURL: `/terima?token=${encodeURIComponent(token)}` })}>
              Masuk dengan Google
            </Button>
          ) : null}
          <form
            className="grid gap-3 rounded-2xl bg-card p-4 shadow-border"
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate({ password });
            }}
          >
            <Field label="Password akun perenang">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </Field>
            <Button type="submit" disabled={mut.isPending}>Buat akun perenang</Button>
          </form>
        </>
      )}
      {mut.isSuccess ? <p className="text-sm text-primary">Undangan diterima. <Link to="/" className="underline">Ke dasbor</Link></p> : null}
      {mut.isError ? <p className="text-sm text-destructive">{(mut.error as Error).message}</p> : null}
    </main>
  );
}
