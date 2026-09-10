import { cn } from "@/lib/utils";

export function MarlinMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("text-primary", className)} fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
      <path
        d="M8 34c8-2 14-10 22-14 6-3 12-3 18-1-4 3-6 6-5 10 6-1 12 2 17 7-7 1-13 0-18-3-2 5-6 9-12 11l-3-7c-6 2-12 3-19 1 4-2 7-4 10-7-4 0-8 1-10 3z"
        fill="currentColor"
      />
      <path d="M46 22l10-8-4 12" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function SwimmerAvatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const sizes = {
    sm: "size-9 text-xs",
    md: "size-12 text-sm",
    lg: "size-16 text-lg",
  };
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-secondary font-semibold text-primary", sizes[size])}>
      {letters}
    </span>
  );
}
