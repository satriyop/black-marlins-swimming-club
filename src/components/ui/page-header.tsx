import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 [overflow-wrap:anywhere]">
        {kicker ? (
          <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            {kicker}
          </p>
        ) : null}
        <h1 className="text-page-title break-words text-foreground md:text-[2rem] md:leading-10">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] place-items-center [overflow-wrap:anywhere] rounded-2xl border border-dashed border-border px-4 py-8 text-center">
      <p className="text-section-title">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5 min-w-0 max-w-full">{action}</div> : null}
    </div>
  );
}
