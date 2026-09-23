import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { lookupKiosk, readKioskGreeting, unlockKioskSession } from "@/lib/server/fns";
import type { KioskMatch } from "@/lib/club/swimmer-kiosk";
import { Button } from "@/components/ui/button";

const TOKEN_KEY = "bmsc.kiosk";

export const Route = createFileRoute("/arena")({ component: Page });

function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY));
    setReady(true);
  }, []);
  if (!ready) return <Shell>Menyiapkan tablet…</Shell>;
  if (token) {
    return (
      <Hello
        token={token}
        onLeave={() => {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }}
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
          <Keypad value={pin} onChange={setPin} max={4} label="PIN" />
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
          <Keypad value={ddmm} onChange={setDdmm} max={4} label="Tanggal dan bulan, contoh 1505" />
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
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    readKioskGreeting({ data: { token } })
      .then((greeting) => {
        if (!cancelled) setName(greeting.fullName);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Sesi habis.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  return (
    <Shell>
      {error ? <p role="alert">{error}</p> : <h1 className="font-display text-4xl">Halo, {name ?? "…"}</h1>}
      <p className="mt-2 text-sm text-muted-foreground">Kamu sudah masuk di tablet kolam.</p>
      <Button type="button" className="mt-8" variant="outline" onClick={onLeave}>
        Keluar
      </Button>
    </Shell>
  );
}

function Keypad({
  value,
  onChange,
  max,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  max: number;
  label: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <p className="mb-3 font-mono text-3xl tracking-[0.3em]" aria-live="polite">
        {"•".repeat(value.length)}
        <span className="text-muted-foreground">{"•".repeat(Math.max(0, max - value.length))}</span>
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
