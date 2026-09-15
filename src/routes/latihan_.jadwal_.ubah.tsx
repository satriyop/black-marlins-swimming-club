import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { PracticeEditor, type ScheduleProgramSource } from "@/components/swim/practice-editor";
import { QueryError } from "@/components/ui/query-error";
import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { listClubPracticeSeries } from "@/lib/server/fns";

export const Route = createFileRoute("/latihan_/jadwal_/ubah")({
  validateSearch: (search: Record<string, unknown>): { ids: string } => ({
    ids: typeof search.ids === "string" ? search.ids : "",
  }),
  component: Page,
});

function Page() {
  const { ids } = Route.useSearch();
  const seriesIds = ids
    .split(",")
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  const { hats, isPending } = useAccess();
  const canManage = canWritePractice(hats);
  const series = useQuery({
    queryKey: ["practice-series"],
    queryFn: () => listClubPracticeSeries(),
    enabled: canManage,
  });
  const members = (series.data ?? []).filter((row) => seriesIds.includes(row.id));
  const scheduleSource: ScheduleProgramSource | null = members.length
    ? {
        seriesIds: members.map((m) => m.id),
        title: members[0]!.title,
        startTime: members[0]!.start_time,
        durationMin: members[0]!.duration_min,
        location: members[0]!.location,
        kind: members[0]!.kind,
        focus: members[0]!.focus,
        notes: members[0]!.notes,
        sets: members[0]!.sets.map((s) => ({
          block: s.block,
          reps: s.reps,
          distanceM: s.distance_m,
          stroke: s.stroke,
          intervalSec: s.interval_sec,
          description: s.description,
        })),
      }
    : null;
  return (
    <AppShell>
      <Link to="/latihan/jadwal" className="mb-4 inline-flex min-h-11 items-center text-sm">
        ← Jadwal
      </Link>
      <PageHeader
        title="Ubah program latihan"
        description="Perubahan berlaku untuk semua hari pada jadwal ini, termasuk latihan yang sudah dibuka dan belum berlalu."
      />
      {isPending || (canManage && series.isPending) ? (
        <p role="status">Memuat jadwal…</p>
      ) : !canManage ? (
        <EmptyState title="Khusus staf klub" description="Pelatih dan admin mengelola program latihan." />
      ) : series.isError ? (
        <QueryError retry={() => series.refetch()} />
      ) : !scheduleSource ? (
        <EmptyState
          title="Jadwal tidak ditemukan"
          description="Jadwal ini mungkin sudah dihapus atau diubah. Kembali ke daftar jadwal."
        />
      ) : (
        <PracticeEditor
          key={seriesIds.join(",")}
          scheduleSource={scheduleSource}
          mode="edit"
          creationMode="schedule"
        />
      )}
    </AppShell>
  );
}
