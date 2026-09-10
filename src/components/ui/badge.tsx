import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  children,
}: {
  className?: string;
  tone?: "muted" | "pool" | "ok" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    pool: "bg-primary/15 text-primary",
    ok: "bg-primary/15 text-primary",
    warn: "bg-secondary text-secondary-foreground",
    danger: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide", tones[tone], className)}>
      {children}
    </span>
  );
}
