import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader, EmptyState } from "@/components/layout/app-shell";
import { PracticeEditor } from "@/components/swim/practice-editor";
import { QueryError } from "@/components/ui/query-error";
import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { getPractice } from "@/lib/server/fns";

export const Route = createFileRoute("/latihan_/baru")({
  validateSearch: (search: Record<string, unknown>): { copy?: number; weekly?: boolean } => ({
    copy:
      Number.isSafeInteger(Number(search.copy)) && Number(search.copy) > 0
        ? Number(search.copy)
        : undefined,
    weekly: search.weekly === true || search.weekly === "true",
  }),
  component: Page,
});
function Page() {
  const { copy, weekly } = Route.useSearch();
  const { hats, isPending } = useAccess();
  const source = useQuery({
    queryKey: ["practice", copy],
    queryFn: () => getPractice({ data: { id: copy! } }),
    enabled: Boolean(copy) && canWritePractice(hats),
  });
  return (
    <AppShell>
      <Link to="/latihan" className="mb-4 inline-flex min-h-11 items-center text-sm">
        ← Latihan
      </Link>
      <PageHeader
        title={copy ? "Salin sesi latihan" : "Sesi latihan baru"}
        description="Atur jadwal dan program. Kehadiran dicatat saat sesi berlangsung."
      />
      {isPending ? (
        <p role="status">Memuat akses…</p>
      ) : !canWritePractice(hats) ? (
        <EmptyState
          title="Khusus staf klub"
          description="Pelatih dan admin mengelola program latihan."
        />
      ) : copy && source.isError ? (
        <QueryError retry={() => source.refetch()} />
      ) : copy && source.isPending ? (
        <p role="status">Memuat program…</p>
      ) : (
        <PracticeEditor key={copy ?? "new"} source={source.data} defaultWeekly={weekly} />
      )}
    </AppShell>
  );
}
