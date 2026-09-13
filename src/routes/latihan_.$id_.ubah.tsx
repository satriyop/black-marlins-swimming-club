import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { PracticeEditor } from "@/components/swim/practice-editor";
import { QueryError } from "@/components/ui/query-error";
import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { getPractice } from "@/lib/server/fns";

export const Route = createFileRoute("/latihan_/$id_/ubah")({ component: Page });

function Page() {
  const id = Number(Route.useParams().id);
  const { hats, isPending } = useAccess();
  const query = useQuery({
    queryKey: ["practice", id],
    queryFn: () => getPractice({ data: { id } }),
    enabled: Number.isSafeInteger(id) && id > 0 && canWritePractice(hats),
  });
  const closed = query.data && (query.data.status === "completed" || query.data.status === "cancelled");
  return (
    <AppShell>
      <Link to="/latihan/$id" params={{ id: String(id) }} className="mb-4 inline-flex min-h-11 items-center text-sm">
        ← Sesi
      </Link>
      <PageHeader
        title="Ubah sesi latihan"
        description="Jadwal dan program. Kehadiran yang sudah dicatat tidak diganti."
      />
      {isPending || query.isPending ? (
        <p role="status">Memuat sesi…</p>
      ) : !canWritePractice(hats) ? (
        <EmptyState title="Khusus staf klub" description="Pelatih dan admin mengelola program latihan." />
      ) : query.isError || !query.data ? (
        <QueryError retry={() => query.refetch()} />
      ) : closed ? (
        <EmptyState
          title={query.data.status === "cancelled" ? "Sesi dibatalkan" : "Sesi sudah selesai"}
          description="Buka kembali sesi dari halaman latihan untuk mengubahnya."
        />
      ) : (
        <PracticeEditor key={query.data.revision} source={query.data} mode="edit" />
      )}
    </AppShell>
  );
}
