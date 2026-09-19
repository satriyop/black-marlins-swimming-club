import { useSyncExternalStore } from "react";

export type Appearance = "dark" | "light" | "system";
export type ResolvedAppearance = "dark" | "light";
const KEY = "bmsc.appearance";
const EVENT = "bmsc:appearance";
const MEDIA = "(prefers-color-scheme: light)";

// Self-contained because this function also runs before React in the document head.
export function bootstrapAppearance() {
  let preference = "system";
  try {
    const saved = localStorage.getItem("bmsc.appearance");
    if (saved === "dark" || saved === "light" || saved === "system") preference = saved;
  } catch {
    /* Device storage can be unavailable; follow the OS until a choice can be saved. */
  }
  const resolved =
    preference === "system"
      ? matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : preference;
  document.documentElement.dataset.appearance = preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
    el.setAttribute("content", resolved === "light" ? "#f4f7f6" : "#061018");
  });
}
export const APPEARANCE_SCRIPT = `(${bootstrapAppearance.toString()})()`;

function readPreference(value: string | null | undefined): Appearance {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
function preferenceSnapshot(): Appearance {
  return readPreference(document.documentElement.dataset.appearance);
}
function resolvedSnapshot(): ResolvedAppearance {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function apply(preference: Appearance) {
  const resolved =
    preference === "system" ? (matchMedia(MEDIA).matches ? "light" : "dark") : preference;
  const root = document.documentElement;
  root.dataset.appearance = preference;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
    el.setAttribute("content", resolved === "light" ? "#f4f7f6" : "#061018");
  });
}
export function setAppearance(preference: Appearance) {
  apply(preference);
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    /* The choice still lasts for this page. */
  }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(listener: () => void) {
  const media = matchMedia(MEDIA);
  const onMedia = () => {
    if (preferenceSnapshot() === "system") {
      apply("system");
      listener();
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    const value = event.newValue;
    apply(readPreference(value));
    listener();
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onMedia);
  // Reconcile an OS change that occurred between the head script and hydration.
  onMedia();
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onMedia);
  };
}
const serverSnapshot = () => "system" as const;
const resolvedServerSnapshot = () => "dark" as const;
export function useAppearance() {
  return useSyncExternalStore(subscribe, preferenceSnapshot, serverSnapshot);
}
export function useResolvedAppearance() {
  return useSyncExternalStore(subscribe, resolvedSnapshot, resolvedServerSnapshot);
}
