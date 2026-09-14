import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader, EmptyState } from "@/components/layout/app-shell";
import { PracticeEditor } from "@/components/swim/practice-editor";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";

export const Route = createFileRoute("/latihan_/baru")({
  validateSearch: (search: Record<string, unknown>): { weekly?: boolean } => ({
    weekly: search.weekly === true || search.weekly === "true",
  }),
  component: Page,
});
function Page() {
  const { weekly } = Route.useSearch();
  const { hats, isPending } = useAccess();
  return (
    <AppShell>
      <Link to="/latihan" className="mb-4 inline-flex min-h-11 items-center text-sm">
        ← Latihan
      </Link>
      <PageHeader
        title="Jadwal latihan baru"
        description="Tentukan hari, jam, dan lokasi latihan klub."
      />
      {isPending ? (
        <p role="status">Memuat akses…</p>
      ) : !canWritePractice(hats) ? (
        <EmptyState
          title="Khusus staf klub"
          description="Pelatih dan admin mengelola program latihan."
        />
      ) : !weekly ? (
        <EmptyState
          title="Buat latihan dari jadwal"
          description="Setiap latihan klub dimulai dari hari latihan yang dijadwalkan."
          action={<Button asChild><Link to="/latihan/jadwal">Buka jadwal</Link></Button>}
        />
      ) : (
        <PracticeEditor creationMode="schedule" />
      )}
    </AppShell>
  );
}
