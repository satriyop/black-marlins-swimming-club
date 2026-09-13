import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { QueryError } from "@/components/ui/query-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { listPractices } from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRACTICE_KINDS, PRACTICE_STATUSES, labelOf } from "@/lib/swim/constants";
import { formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/latihan")({ component: Page });

function Page() {
  const { hats } = useAccess();
  const canCreate = canWritePractice(hats);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["practices"],
    queryFn: () => listPractices(),
  });
  return (
    <AppShell>
      <PageHeader
        kicker="Program"
        title="Latihan"
        description="Jadwal, program, dan kehadiran latihan klub."
        action={canCreate ? <NewPracticeButton /> : undefined}
      />
      {isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <QueryError retry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState
          title="Belum ada sesi"
          description={
            canCreate
              ? "Buat sesi pertama beserta program latihan."
              : "Sesi akan tampil setelah dijadwalkan pelatih."
          }
          action={canCreate ? <NewPracticeButton /> : undefined}
        />
      ) : (
        <div className="grid gap-2">
          {data.map((p) => (
            <Link
              key={p.id}
              to="/latihan/$id"
              params={{ id: String(p.id) }}
              className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-4 shadow-border"
            >
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateId(p.sessionDate, "EEEE, d MMM yyyy")}
                  {p.startTime ? ` · ${p.startTime}` : ""} · {labelOf(PRACTICE_KINDS, p.kind)}
                  {p.rosterCount ? ` · ${p.presentCount}/${p.rosterCount} hadir` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm tabular-nums text-primary">
                  {p.totalMeters.toLocaleString("id-ID")} m
                </p>
                <div className="mt-1 flex flex-wrap justify-end gap-1">
                  {p.status && p.status !== "scheduled" ? (
                    <Badge tone={p.status === "cancelled" ? "warn" : p.status === "in_progress" ? "pool" : "muted"}>
                      {labelOf(PRACTICE_STATUSES, p.status)}
                    </Badge>
                  ) : (
                    <Badge>{labelOf(PRACTICE_KINDS, p.kind)}</Badge>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function NewPracticeButton() {
  return (
    <Button asChild>
      <Link to="/latihan/baru">
        <Plus />
        Sesi baru
      </Link>
    </Button>
  );
}
