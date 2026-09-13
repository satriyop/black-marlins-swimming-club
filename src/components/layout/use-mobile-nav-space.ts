import { useEffect, useState } from "react";

/** Reserve measured space, including safe-area padding and labels enlarged by text zoom. */
export function useMobileNavSpace() {
  const [nav, setNav] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!nav) return;
    const shell = nav.closest<HTMLElement>(".app-shell");
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--mobile-nav-height");
    let frame = 0;
    const measure = () => {
      const value = `${nav.getBoundingClientRect().height}px`;
      shell?.style.setProperty("--mobile-nav-height", value);
      root.style.setProperty("--mobile-nav-height", value);
    };
    const revealInput = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const input = document.activeElement;
          if (
            !(input instanceof HTMLElement) ||
            !input.matches("input,textarea,select") ||
            input.closest('[role="dialog"]') ||
            nav.getBoundingClientRect().height === 0
          )
            return;
          const gap = 16;
          const overflow =
            input.getBoundingClientRect().bottom - (nav.getBoundingClientRect().top - gap);
          if (overflow > 0) window.scrollBy(0, overflow);
        });
      });
    };
    const onChange = () => {
      measure();
      revealInput();
    };
    const observer = new ResizeObserver(onChange);
    observer.observe(nav);
    onChange();
    document.addEventListener("focusin", revealInput);
    window.addEventListener("resize", onChange);
    window.visualViewport?.addEventListener("resize", revealInput);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", revealInput);
      window.removeEventListener("resize", onChange);
      window.visualViewport?.removeEventListener("resize", revealInput);
      shell?.style.removeProperty("--mobile-nav-height");
      if (previous) root.style.setProperty("--mobile-nav-height", previous);
      else root.style.removeProperty("--mobile-nav-height");
    };
  }, [nav]);
  return setNav;
}
