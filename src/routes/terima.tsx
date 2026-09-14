import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { acceptClubInvite, getInvitePreview, getPublicClubContact } from "@/lib/server/fns";
import { ADULT_PROVIDERS, signIn, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { cn, formatDateId } from "@/lib/utils";

import { AppearanceSelect } from "@/components/settings/appearance-select";

function StatusCard({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "info";
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  const surface = {
    ok: "bg-success-surface",
    warn: "bg-warning-surface",
    danger: "bg-danger-surface",
    info: "bg-info-surface",
  }[tone];
  const fg = {
    ok: "text-success",
    warn: "text-warning",
    danger: "text-destructive",
    info: "text-info",
  }[tone];
  const role = tone === "warn" || tone === "danger" ? "alert" : "status";
  return (
    <div role={role} className={cn("grid gap-3 rounded-2xl p-5", surface)}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 size-5 shrink-0", fg)} aria-hidden="true" />
        <h2 className="text-card-title">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export const Route = createFileRoute("/terima")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: Page,
});
function Page() {
  const { token } = Route.useSearch();
  const { user, isPending: sessionPending } = useCurrentUserState();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signInError, setSignInError] = useState("");
  const preview = useQuery({
    queryKey: ["invite-preview", token],
    queryFn: () => getInvitePreview({ data: { token } }),
    enabled: /^[a-f0-9]{48}$/.test(token),
    retry: false,
  });
  const mut = useMutation({
    mutationFn: (input: { password?: string }) =>
      acceptClubInvite({ data: { token, password: input.password } }),
  });
  const google = ADULT_PROVIDERS.find((p) => p.idp === "google");
  const data = preview.data;
  const role =
    data?.state === "pending"
      ? data.kind === "guardian"
        ? "Wali perenang"
        : data.kind === "swimmer_account"
          ? "Akun perenang"
          : data.role === "coach"
            ? "Pelatih"
            : data.role === "superadmin"
              ? "Superadmin"
              : "Admin klub"
      : "";
  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-12">
      <div className="justify-self-end">
        <AppearanceSelect />
      </div>
      <img
        src="/images/crest.jpg"
        alt="Black Marlins Swimming Club"
        className="size-16 rounded-full"
      />
      <h1 className="text-page-title">Terima undangan</h1>
      {mut.isSuccess ? (
        <StatusCard
          tone="ok"
          icon={CheckCircle2}
          title={
            data?.state === "pending" && data.kind === "swimmer_account"
              ? "Akun perenang siap digunakan"
              : "Undangan diterima"
          }
        >
          <p className="text-sm text-muted-foreground">
            {mut.variables?.password
              ? "Masuk dengan email pada undangan dan password yang baru Anda buat."
              : data?.state === "pending" && data.kind === "guardian"
                ? "Anda sudah bergabung sebagai wali. Hari Ini menampilkan anak terhubung, atau Daftarkan anak jika belum ada di skuad."
                : data?.state === "pending" && data.kind === "staff"
                  ? "Anda sudah bergabung sebagai staf. Buka klub untuk melihat peran dan latihan berikutnya."
                  : "Anda sudah dapat membuka klub. Peran dan anak terhubung tampil di Hari Ini."}
          </p>
          <Button asChild>
            <Link to={mut.variables?.password ? "/login" : "/"}>
              {mut.variables?.password ? "Masuk ke akun perenang" : "Buka klub"}
            </Link>
          </Button>
        </StatusCard>
      ) : !/^[a-f0-9]{48}$/.test(token) ||
        data?.state === "invalid" ||
        data?.state === "expired" ||
        data?.state === "revoked" ? (
        <StatusCard
          tone={data?.state === "expired" ? "warn" : "danger"}
          icon={AlertTriangle}
          title={
            data?.state === "expired"
              ? "Undangan sudah kedaluwarsa"
              : data?.state === "revoked"
                ? "Undangan ini sudah dicabut"
                : "Tautan undangan tidak berlaku"
          }
        >
          <p className="text-sm text-muted-foreground">
            Minta pengundang membuat tautan baru, atau hubungi admin klub.
          </p>
          <InviteContact />
          {user ? (
            <Button
              variant="outline"
              onClick={() => void signOut("/login").catch((err) => setSignInError(err.message))}
            >
              Ganti akun
            </Button>
          ) : (
            <Link to="/login" search={{ next: undefined, error: undefined }} className="inline-flex min-h-11 items-center underline">
              Ke halaman masuk
            </Link>
          )}
        </StatusCard>
      ) : preview.isError ? (
        <QueryError retry={() => preview.refetch()} />
      ) : preview.isPending || sessionPending ? (
        <p role="status">Memeriksa undangan…</p>
      ) : data?.state === "accepted" ? (
        <StatusCard tone="info" icon={Info} title="Undangan ini sudah diterima">
          <Button asChild>
            <Link to={user ? "/" : "/login"}>{user ? "Buka klub" : "Masuk ke klub"}</Link>
          </Button>
        </StatusCard>
      ) : data?.state === "pending" ? (
        <>
          <div className="rounded-2xl bg-card p-5">
            <p className="text-card-title">{data.clubName}</p>
            <p className="mt-1 text-sm font-semibold text-primary">{role}</p>
          </div>
          {data.kind === "swimmer_account" ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                mut.mutate({ password });
              }}
            >
              <p className="text-sm text-muted-foreground">
                Buat password untuk akun perenang pada undangan ini.
              </p>
              <Field label="Password baru" hint="Minimal 8 karakter.">
                <Input
                  autoComplete="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                />
              </Field>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                />
                Tampilkan password
              </label>
              <Button disabled={mut.isPending}>
                {mut.isPending ? "Membuat akun…" : "Buat akun perenang"}
              </Button>
            </form>
          ) : user ? (
            <>
              <p className="text-sm">
                Anda masuk sebagai <strong>{user.primaryEmail}</strong>. Gunakan akun Google yang
                menerima undangan.
              </p>
              <Button disabled={mut.isPending} onClick={() => mut.mutate({})}>
                {mut.isPending ? "Memproses…" : `Terima sebagai ${role.toLowerCase()}`}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void signOut(`/terima?token=${encodeURIComponent(token)}`).catch((err) =>
                    setSignInError(err.message),
                  )
                }
              >
                Gunakan akun Google lain
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Masuk dengan akun Google yang menerima undangan.
              </p>
              {google && (
                <Button
                  onClick={() =>
                    void signIn(google.providerId, {
                      callbackURL: `/terima?token=${encodeURIComponent(token)}`,
                      errorCallbackURL: `/terima?token=${encodeURIComponent(token)}`,
                    }).catch((err) => setSignInError(err.message))
                  }
                >
                  Masuk dengan Google
                </Button>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Untuk {data.emailHint} · Berlaku sampai {formatDateId(data.expiresAt)}
          </p>
        </>
      ) : null}
      {mut.isError && (
        <StatusCard
          tone="warn"
          icon={AlertTriangle}
          title={
            mut.error.message.includes("tidak berlaku") && user
              ? "Akun ini tidak cocok dengan undangan. Keluar, lalu masuk dengan akun Google yang diundang."
              : mut.error.message
          }
        />
      )}
      {signInError && (
        <p role="alert" className="text-sm text-destructive">
          {signInError}
        </p>
      )}
    </main>
  );
}

function InviteContact() {
  const q = useQuery({ queryKey: ["public-contact"], queryFn: () => getPublicClubContact() });
  const info = q.data;
  if (!info?.supportEmail && !info?.supportPhone && !info?.supportUrl) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Kontak klub
      {info.supportEmail ? ` · ${info.supportEmail}` : ""}
      {info.supportPhone ? ` · ${info.supportPhone}` : ""}
      {info.supportUrl ? (
        <>
          {" · "}
          <a href={info.supportUrl} className="text-primary hover:underline">
            {info.supportUrl}
          </a>
        </>
      ) : null}
    </p>
  );
}
