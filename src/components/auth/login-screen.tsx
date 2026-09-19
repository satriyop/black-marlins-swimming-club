import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ADULT_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { getPublicClubContact } from "@/lib/server/fns";
import { Button } from "@/components/ui/button";
import { MarlinMark } from "@/components/swim/mark";

import { InstallAppButton, InstallAppDialog } from "@/components/pwa/install-app";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.2 2.8-2.5 3.6v3h4c2.4-2.2 3.5-5.4 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1 7.9-2.9l-4-3c-1.1.8-2.5 1.2-3.9 1.2-3 0-5.6-2-6.5-4.8H1.3v3.1C3.3 21.4 7.4 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.5 14.5c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V7H1.3C.5 8.6 0 10.3 0 12.3c0 2 .5 3.7 1.3 5.3l4.2-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.5 1.7l3.4-3.4C17.9 1.1 15.2 0 12 0 7.4 0 3.3 2.6 1.3 6.5l4.2 3.1C6.4 6.8 9 4.8 12 4.8z"
      />
    </svg>
  );
}

export function Splash({ label = "Memuat klub…" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <div className="flex flex-col items-center text-center">
        <img
          src="/images/crest.jpg"
          alt="Black Marlins Swimming Club"
          className="mb-4 size-20 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/15"
        />
        <p className="font-display text-4xl">BMSC</p>
        <p className="mt-2 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function LoginScreen({
  next = null,
  errorCode,
}: {
  next?: string | null;
  errorCode?: string;
}) {
  const google = ADULT_PROVIDERS.find((p) => p.idp === "google");
  const [error, setError] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <img
        src="/images/pool.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover opacity-40"
      />
      <div className="absolute inset-0 login-overlay" />
      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
        <div className="rise-in mb-8 flex flex-col items-center text-center">
          <img
            src="/images/crest.jpg"
            alt="Lambang Black Marlins Swimming Club"
            className="mb-5 size-28 rounded-full object-cover shadow-elevated outline outline-1 -outline-offset-1 outline-white/15"
          />
          <p className="text-xs font-semibold tracking-[0.28em] text-primary uppercase">
            Klaten · Jawa Tengah
          </p>
          <h1 className="font-display mt-2 text-5xl leading-none md:text-6xl">Black Marlins</h1>
          <p className="font-display mt-1 text-2xl text-foam">Swimming Club</p>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Kelola perenang, sesi latihan, tes waktu, dan kejuaraan klub dalam satu tempat.
          </p>
        </div>
        <div className="rise-in rise-in-2 rounded-2xl border border-border bg-card/90 p-5 shadow-elevated backdrop-blur-sm">
          {authEnabled ? (
            <div className="grid gap-3">
              {google ? (
                <Button
                  type="button"
                  size="lg"
                  className="w-full bg-foreground text-background hover:opacity-90"
                  onClick={() => {
                    const dest = next ?? "/";
                    const errUrl = next
                      ? `/login?error=auth&next=${encodeURIComponent(next)}`
                      : "/login?error=auth";
                    void signIn(google.providerId, {
                      callbackURL: dest,
                      errorCallbackURL: errUrl,
                    }).catch((err) => setError(err.message));
                  }}
                >
                  <GoogleGlyph />
                  Masuk dengan Google
                </Button>
              ) : null}
              <p className="text-center text-xs text-muted-foreground">
                Staf, wali, dan perenang masuk dengan akun Google.
              </p>
              {(error || errorCode) && (
                <p role="alert" className="text-sm text-destructive">
                  {error ??
                    (errorCode === "auth"
                      ? "Masuk dibatalkan atau gagal. Silakan coba lagi."
                      : "Masuk gagal. Silakan coba lagi.")}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Masuk belum diaktifkan.</p>
          )}
        </div>
        <div className="rise-in mt-3 flex justify-center">
          <InstallAppButton surface="login" onOpen={() => setInstallOpen(true)} />
        </div>
        <LoginPublicContact />
        <p className="rise-in rise-in-3 mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <MarlinMark className="size-4" />
          Pelatih Hardiyanto Wibowo
        </p>
        <InstallAppDialog open={installOpen} onOpenChange={setInstallOpen} />
      </div>
    </main>
  );
}

function LoginPublicContact() {
  const q = useQuery({ queryKey: ["public-contact"], queryFn: () => getPublicClubContact() });
  const info = q.data;
  if (!info?.supportEmail && !info?.supportPhone && !info?.supportUrl) return null;
  return (
    <p className="rise-in mt-4 text-center text-xs text-muted-foreground">
      Bantuan
      {info.supportEmail ? ` · ${info.supportEmail}` : ""}
      {info.supportPhone ? ` · ${info.supportPhone}` : ""}
      {info.supportUrl ? ` · ${info.supportUrl}` : ""}
    </p>
  );
}
