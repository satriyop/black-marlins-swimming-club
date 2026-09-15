import { useEffect, useId } from "react";
import { clearReloadBlocker, hasReloadBlockers, setReloadBlocker } from "@/lib/pwa/reload-safety";

export function useReloadGuard(blocked: boolean) {
  const id = useId();

  useEffect(() => {
    setReloadBlocker(id, blocked);
    return () => clearReloadBlocker(id);
  }, [blocked, id]);

  useEffect(() => {
    const warnBeforeReload = (event: BeforeUnloadEvent) => {
      if (!hasReloadBlockers()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeReload);
    return () => window.removeEventListener("beforeunload", warnBeforeReload);
  }, []);
}
