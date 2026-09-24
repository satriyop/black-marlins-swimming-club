import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { checkInKioskSession, lookupKiosk, readKioskHome, unlockKioskSession } from "@/lib/server/fns";
import { pbShareText, type KioskHome, type KioskMatch } from "@/lib/club/swimmer-kiosk";
import { Button } from "@/components/ui/button";

const TOKEN_KEY = "bmsc.kiosk";

export const Route = createFileRoute("/arena")({ component: Page });

function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const leave = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);
  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY));
    setReady(true);
  }, []);
  if (!ready) return <Shell>Menyiapkan tablet…</Shell>;
  if (token) {
    return (
      <Hello
        token={token}
        onLeave={leave}
      />
    );
  }
  return (
    <Login
      onUnlock={(next) => {
        sessionStorage.setItem(TOKEN_KEY, next);
        setToken(next);
      }}
    />
  );
}

function Login({ onUnlock }: { onUnlock: (token: string) => void }) {
  const [ddmm, setDdmm] = useState("");
  const [matches, setMatches] = useState<KioskMatch[] | null>(null);
  const [chosen, setChosen] = useState<KioskMatch | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function find() {
    setError(null);
    setPending(true);
    try {
      const found = await lookupKiosk({ data: { ddmm } });
      if (found.length === 0) {
        setMatches(null);
        setError("Tidak ada perenang dengan tanggal itu.");
        return;
      }
      setMatches(found);
      setChosen(found.length === 1 ? found[0]! : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencari.");
    } finally {
      setPending(false);
    }
  }

  async function unlock() {
    if (!chosen) return;
    setError(null);
    setPending(true);
    try {
      const session = await unlockKioskSession({ data: { swimmerId: chosen.id, pin } });
      onUnlock(session.token);
    } catch (err) {
      setPin("");
      setError(err instanceof Error ? err.message : "PIN salah.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <h1 className="font-display text-4xl">Tablet kolam</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tanggal lahir, lalu PIN dari wali. Bukan masuk Google.
      </p>
      {chosen ? (
        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void unlock();
          }}
        >
          <p className="text-lg font-semibold">{chosen.label}</p>
          <Keypad value={pin} onChange={setPin} max={4} mask label="PIN" />
          <Button type="submit" disabled={pending || pin.length !== 4}>
            {pending ? "Memeriksa…" : "Masuk"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setChosen(null);
              setMatches(null);
              setPin("");
              setDdmm("");
            }}
          >
            Bukan saya
          </Button>
        </form>
      ) : matches && matches.length > 1 ? (
        <div className="mt-6 grid gap-2">
          <p className="text-sm text-muted-foreground">Pilih nama.</p>
          {matches.map((match) => (
            <Button key={match.id} type="button" variant="outline" onClick={() => setChosen(match)}>
              {match.label}
            </Button>
          ))}
        </div>
      ) : (
        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void find();
          }}
        >
          <Keypad value={ddmm} onChange={setDdmm} max={4} mask={false} label="Tanggal dan bulan, contoh 1505" />
          <Button type="submit" disabled={pending || ddmm.length !== 4}>
            {pending ? "Mencari…" : "Lanjut"}
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="mt-8 text-center text-sm">
        <Link to="/login" search={{ next: undefined, error: undefined }} className="text-muted-foreground underline">
          Masuk staf atau wali
        </Link>
      </p>
    </Shell>
  );
}

function Hello({ token, onLeave }: { token: string; onLeave: () => void }) {
  const [home, setHome] = useState<KioskHome | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  function load() {
    return readKioskHome({ data: { token } })
      .then(setHome)
      .catch(() => onLeave());
  }
  useEffect(() => {
    let cancelled = false;
    readKioskHome({ data: { token } })
      .then((next) => {
        if (!cancelled) setHome(next);
      })
      .catch(() => {
        if (!cancelled) onLeave();
      });
    return () => {
      cancelled = true;
    };
  }, [token, onLeave]);
  return (
    <Shell>
      <h1 className="font-display text-4xl">Halo, {home?.fullName ?? "…"}</h1>
      {home ? <p className="mt-1 text-sm font-semibold text-primary">{home.ageGroup}</p> : null}
      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Hari ini</h2>
        {home && home.today.length === 0 ? (
          <p className="mt-2 text-sm">Tidak ada latihan hari ini.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {home?.today.map((item) => (
              <li key={item.seriesId} className="rounded-xl bg-card p-3 shadow-border">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">
                  {item.startTime ?? "Jam belum ditentukan"}
                  {item.location ? ` · ${item.location}` : ""}
                </p>
                <Button
                  type="button"
                  className="mt-3"
                  disabled={item.checkedIn || busy === item.seriesId}
                  onClick={() => {
                    setBusy(item.seriesId);
                    setCheckError(null);
                    checkInKioskSession({ data: { token, seriesId: item.seriesId } })
                      .then(() => load())
                      .catch((err: unknown) => {
                        setCheckError(err instanceof Error ? err.message : "Gagal lapor hadir.");
                      })
                      .finally(() => setBusy(null));
                  }}
                >
                  {item.checkedIn ? "Sudah lapor hadir" : "Saya hadir"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {checkError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {checkError}
          </p>
        ) : null}
      </section>
      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tujuh hari</h2>
        {home && home.upcoming.length === 0 ? (
          <p className="mt-2 text-sm">Tidak ada latihan lain minggu ini.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {home?.upcoming.map((item) => (
              <li key={`${item.date}-${item.title}-${item.startTime}`} className="text-sm">
                <span className="font-medium">{item.title}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {item.date.slice(8, 10)}/{item.date.slice(5, 7)} · {item.startTime ?? "—"}
                  {item.location ? ` · ${item.location}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Rekor pribadi</h2>
        {home && home.pbs.length === 0 ? (
          <p className="mt-2 text-sm">Belum ada rekor.</p>
        ) : (
          <ul className="mt-2 grid gap-1">
            {home?.pbs.map((item) => (
              <li key={`${item.label}-${item.time}`} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {item.label} <span className="font-semibold">{item.time}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!home) return;
                    void sharePbCard({
                      name: home.fullName,
                      club: home.clubName,
                      label: item.label,
                      time: item.time,
                    }).catch(() => undefined);
                  }}
                >
                  Bagikan
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Button type="button" className="mt-8" variant="outline" onClick={onLeave}>
        Keluar
      </Button>
    </Shell>
  );
}

async function sharePbCard(input: { name: string; club: string; label: string; time: string }) {
  const text = pbShareText(input);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#061018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#5eead4";
  ctx.font = "600 42px sans-serif";
  ctx.fillText("REKOR PRIBADI", 80, 160);
  ctx.fillStyle = "#f4f7f6";
  ctx.font = "700 72px sans-serif";
  ctx.fillText(input.name, 80, 320);
  ctx.font = "700 140px sans-serif";
  ctx.fillText(input.time, 80, 560);
  ctx.font = "500 56px sans-serif";
  ctx.fillText(input.label, 80, 680);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 40px sans-serif";
  ctx.fillText(input.club, 80, 1200);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const file = new File([blob], "rekor-pribadi.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: input.label, text });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "rekor-pribadi.png";
  link.click();
  URL.revokeObjectURL(url);
}

function Keypad({
  value,
  onChange,
  max,
  label,
  mask,
}: {
  value: string;
  onChange: (next: string) => void;
  max: number;
  label: string;
  mask: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <p className="mb-3 font-mono text-3xl tracking-[0.3em]" aria-live="polite">
        {mask ? (
          <>
            {"•".repeat(value.length)}
            <span className="text-muted-foreground">{"•".repeat(Math.max(0, max - value.length))}</span>
          </>
        ) : (
          value.padEnd(max, "·")
        )}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "hapus", "0", "kosong"].map((key) =>
          key === "kosong" ? (
            <span key={key} />
          ) : (
            <Button
              key={key}
              type="button"
              variant="outline"
              className="min-h-14 text-lg"
              onClick={() => {
                if (key === "hapus") onChange(value.slice(0, -1));
                else if (value.length < max) onChange(value + key);
              }}
            >
              {key === "hapus" ? "Hapus" : key}
            </Button>
          ),
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">{children}</main>
  );
}
