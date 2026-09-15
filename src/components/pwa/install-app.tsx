import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Download, ExternalLink, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  detectInstallPlatform,
  isStandaloneDisplay,
  type InstallPlatform,
} from "@/lib/pwa/install";

type InstallOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

type InstallContextValue = {
  ready: boolean;
  standalone: boolean;
  platform: InstallPlatform;
  promptAvailable: boolean;
  requestInstall: () => Promise<InstallOutcome | null>;
};

const InstallContext = createContext<InstallContextValue | null>(null);

export function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () =>
      setStandalone(
        isStandaloneDisplay({
          displayModeStandalone: displayMode.matches,
          navigatorStandalone: (navigator as NavigatorWithStandalone).standalone,
        }),
      );
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setPromptEvent(null);
      setStandalone(true);
    };

    setPlatform(
      detectInstallPlatform({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
      }),
    );
    updateStandalone();
    setReady(true);
    displayMode.addEventListener("change", updateStandalone);
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      displayMode.removeEventListener("change", updateStandalone);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function requestInstall() {
    const current = promptEvent;
    if (!current) return null;
    // Each browser prompt is single-use. Clear it before awaiting so a second
    // tap cannot invoke the same event while the first prompt is open.
    setPromptEvent(null);
    await current.prompt();
    const choice = await current.userChoice;
    return choice.outcome;
  }

  return (
    <InstallContext.Provider
      value={{
        ready,
        standalone,
        platform,
        promptAvailable: Boolean(promptEvent),
        requestInstall,
      }}
    >
      {children}
    </InstallContext.Provider>
  );
}

function useInstallPrompt() {
  const value = useContext(InstallContext);
  if (!value) throw new Error("useInstallPrompt must be used inside InstallPromptProvider");
  return value;
}

export function InstallAppButton({
  onOpen,
  className,
  surface = "menu",
}: {
  onOpen: () => void;
  className?: string;
  surface?: "menu" | "login";
}) {
  const { ready, standalone } = useInstallPrompt();
  if (!ready || standalone) return null;

  if (surface === "login") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-foreground underline-offset-4 hover:bg-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        <Download className="size-4" />
        Pasang aplikasi
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl bg-muted px-4 py-2 text-left font-medium hover:bg-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <Download className="size-5 shrink-0" />
      <span>Pasang aplikasi</span>
    </button>
  );
}

export function InstallAppDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { standalone, platform, promptAvailable, requestInstall } = useInstallPrompt();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null);
  const [failed, setFailed] = useState(false);

  if (standalone) return null;

  async function install() {
    setPending(true);
    setOutcome(null);
    setFailed(false);
    try {
      setOutcome(await requestInstall());
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Pasang Black Marlins"
        description="Buka klub lebih cepat dari layar utama perangkat ini."
      >
        <div className="grid gap-4 text-sm">
          {outcome === "dismissed" ? (
            <p role="status" className="rounded-xl bg-warning-surface p-3 text-warning">
              Pemasangan dibatalkan. Anda tetap bisa mencoba lagi lewat menu browser.
            </p>
          ) : null}
          {outcome === "accepted" ? (
            <p role="status" className="rounded-xl bg-success-surface p-3 text-success">
              Permintaan pemasangan diterima. Ikuti petunjuk perangkat bila masih muncul.
            </p>
          ) : null}
          {failed ? (
            <p role="alert" className="rounded-xl bg-danger-surface p-3 text-destructive">
              Pemasangan belum dapat dibuka. Coba lewat menu browser di bawah ini.
            </p>
          ) : null}

          {promptAvailable ? (
            <>
              <p className="text-muted-foreground">
                Browser siap memasang Black Marlins sebagai aplikasi di perangkat ini.
              </p>
              <Button type="button" size="lg" disabled={pending} onClick={() => void install()}>
                <Download />
                {pending ? "Membuka pemasangan…" : "Pasang sekarang"}
              </Button>
            </>
          ) : platform === "ios" ? (
            <div className="grid gap-3">
              <p className="font-semibold">Di iPhone atau iPad dengan Safari:</p>
              <ol className="grid list-decimal gap-2 pl-5 text-muted-foreground">
                <li>
                  Ketuk tombol <Share className="mx-1 inline size-4" aria-label="Bagikan" />{" "}
                  Bagikan.
                </li>
                <li>Pilih “Tambahkan ke Layar Utama” atau “Open as Web App”.</li>
                <li>Konfirmasi nama dan ketuk Tambah.</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Nama menu dapat berbeda mengikuti versi dan bahasa perangkat.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="font-semibold">Pasang lewat menu browser:</p>
              <ol className="grid list-decimal gap-2 pl-5 text-muted-foreground">
                <li>Buka menu browser.</li>
                <li>Pilih “Pasang aplikasi” atau “Tambahkan ke layar utama”.</li>
                <li>Ikuti konfirmasi yang ditampilkan browser.</li>
              </ol>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ExternalLink className="mt-0.5 size-4 shrink-0" />
                Jika pilihan belum tersedia, gunakan Black Marlins di browser seperti biasa.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
