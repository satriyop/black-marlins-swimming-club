import { Toaster } from "sonner";
import { useResolvedAppearance } from "@/lib/appearance";

export function AppToaster() {
  const theme = useResolvedAppearance();
  return (
    <Toaster
      theme={theme}
      position="top-center"
      toastOptions={{
        style: {
          background: "var(--color-popover)",
          border: "1px solid var(--color-input)",
          color: "var(--color-popover-foreground)",
        },
      }}
    />
  );
}
