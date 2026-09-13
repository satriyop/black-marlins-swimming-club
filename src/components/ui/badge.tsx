import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  children,
}: {
  className?: string;
  tone?: "muted" | "pool" | "ok" | "warn" | "danger" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    pool: "bg-primary/15 text-primary",
    ok: "bg-success-surface text-success",
    warn: "bg-warning-surface text-warning",
    danger: "bg-danger-surface text-destructive",
    info: "bg-info-surface text-info",
  };
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-sm leading-5 font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
