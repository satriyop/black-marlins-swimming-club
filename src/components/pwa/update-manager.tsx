import { useEffect, useRef, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearReloadBlocker, hasReloadBlockers, setReloadBlocker } from "@/lib/pwa/reload-safety";

const CHANNEL_NAME = "bmsc-pwa-update";
const MUTATION_BLOCKER = "react-query-mutations";

type SafetyMessage =
  | { type: "CHECK_RELOAD_SAFETY"; requestId: string }
  | { type: "RELOAD_SAFETY"; requestId: string; blocked: boolean };

export function PwaUpdateManager() {
  const activeMutations = useIsMutating();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [controllerChanged, setControllerChanged] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [checking, setChecking] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const reloadRequested = useRef(false);
  const hadController = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    setReloadBlocker(MUTATION_BLOCKER, activeMutations > 0);
    return () => clearReloadBlocker(MUTATION_BLOCKER);
  }, [activeMutations]);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

    hadController.current = Boolean(navigator.serviceWorker.controller);
    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;

    const watchInstalling = (worker: ServiceWorker) => {
      const stateChanged = () => {
        if (!disposed && worker.state === "installed" && navigator.serviceWorker.controller) {
          setWaitingWorker(registration?.waiting ?? worker);
          setDeferred(false);
        }
      };
      worker.addEventListener("statechange", stateChanged);
    };

    const controllerChangedNow = () => {
      if (!hadController.current) {
        hadController.current = true;
        return;
      }
      setWaitingWorker(null);
      setControllerChanged(true);
      if (reloadRequested.current && !hasReloadBlockers()) {
        window.location.reload();
        return;
      }
      reloadRequested.current = false;
      setBlockedMessage(
        hasReloadBlockers()
          ? "Versi baru siap. Simpan perubahan yang sedang dikerjakan sebelum memuat ulang."
          : null,
      );
    };

    navigator.serviceWorker.addEventListener("controllerchange", controllerChangedNow);
    void navigator.serviceWorker
      .register(`/sw.js?build=${encodeURIComponent(__BMSC_BUILD_ID__)}`, {
        scope: "/",
        updateViaCache: "none",
      })
      .then((nextRegistration) => {
        if (disposed) return;
        registration = nextRegistration;
        if (nextRegistration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(nextRegistration.waiting);
        }
        nextRegistration.addEventListener("updatefound", () => {
          if (nextRegistration.installing) watchInstalling(nextRegistration.installing);
        });
        void nextRegistration.update().catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChangedNow);
    };
  }, []);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const nextChannel = new BroadcastChannel(CHANNEL_NAME);
    channel.current = nextChannel;
    const respondToSafetyCheck = (event: MessageEvent<SafetyMessage>) => {
      if (event.data?.type !== "CHECK_RELOAD_SAFETY") return;
      nextChannel.postMessage({
        type: "RELOAD_SAFETY",
        requestId: event.data.requestId,
        blocked: hasReloadBlockers(),
      } satisfies SafetyMessage);
    };
    nextChannel.addEventListener("message", respondToSafetyCheck);
    return () => {
      nextChannel.close();
      channel.current = null;
    };
  }, []);

  async function anotherTabIsBlocked() {
    const current = channel.current;
    if (!current) return false;
    const requestId = crypto.randomUUID();
    return new Promise<boolean>((resolve) => {
      let blocked = false;
      const receive = (event: MessageEvent<SafetyMessage>) => {
        if (event.data?.type === "RELOAD_SAFETY" && event.data.requestId === requestId) {
          blocked ||= event.data.blocked;
        }
      };
      current.addEventListener("message", receive);
      current.postMessage({ type: "CHECK_RELOAD_SAFETY", requestId } satisfies SafetyMessage);
      window.setTimeout(() => {
        current.removeEventListener("message", receive);
        resolve(blocked);
      }, 300);
    });
  }

  async function applyUpdate() {
    setChecking(true);
    setBlockedMessage(null);
    try {
      if (hasReloadBlockers()) {
        setBlockedMessage(
          "Simpan perubahan atau tunggu proses penyimpanan selesai terlebih dahulu.",
        );
        return;
      }
      if (await anotherTabIsBlocked()) {
        setBlockedMessage("Ada perubahan yang belum disimpan di tab Black Marlins lain.");
        return;
      }
      if (controllerChanged) {
        window.location.reload();
        return;
      }
      if (waitingWorker) {
        reloadRequested.current = true;
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
      }
    } finally {
      setChecking(false);
    }
  }

  if ((!waitingWorker && !controllerChanged) || deferred) return null;

  return (
    <aside
      aria-label="Pembaruan aplikasi"
      className="fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 z-50 mx-auto grid max-w-md gap-3 rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-elevated md:right-4 md:bottom-4 md:left-auto"
    >
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h2 className="font-semibold">Versi baru tersedia</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Muat setelah pekerjaan tersimpan agar perubahan di halaman ini tidak hilang.
          </p>
        </div>
      </div>
      {blockedMessage ? (
        <p role="alert" className="rounded-lg bg-warning-surface p-3 text-sm text-warning">
          {blockedMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setDeferred(true)}>
          Nanti
        </Button>
        <Button type="button" disabled={checking} onClick={() => void applyUpdate()}>
          {checking ? "Memeriksa…" : "Perbarui sekarang"}
        </Button>
      </div>
    </aside>
  );
}
