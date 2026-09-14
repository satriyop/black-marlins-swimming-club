import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { listClubPracticeSeries, setClubPracticeSeriesActive } from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { WEEKDAYS } from "@/lib/swim/constants";

export const Route = createFileRoute("/latihan_/jadwal")({ component: Page });

type SeriesRow = Awaited<ReturnType<typeof listClubPracticeSeries>>[number];

function groupKey(s: SeriesRow) {
  return `${s.title}|${s.start_time ?? ""}|${s.location ?? ""}`;
}

function groupSeries(rows: SeriesRow[]) {
  const map = new Map<string, SeriesRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return [...map.entries()]
    .map(([key, members]) => ({
      key,
      title: members[0]!.title,
      startTime: members[0]!.start_time,
      location: members[0]!.location,
      members: members.sort((a, b) => a.weekday - b.weekday),
    }))
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title, "id") || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
    );
}

function Page() {
  const { hats, isPending: accessPending } = useAccess();
  const canManage = canWritePractice(hats);
  const qc = useQueryClient();
  const series = useQuery({ queryKey: ["practice-series"], queryFn: () => listClubPracticeSeries() });
  const toggle = useMutation({
    mutationFn: (input: { id: number; active: boolean }) => setClubPracticeSeriesActive({ data: input }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["practice-series"] }),
        qc.invalidateQueries({ queryKey: ["practices"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const groups = groupSeries(series.data ?? []);
  return (
    <AppShell>
      <Link to="/latihan" className="mb-4 inline-flex min-h-11 items-center text-sm">
        ← Latihan
      </Link>
      <PageHeader
        kicker="Program"
        title="Jadwal berulang"
        description="Aktifkan atau nonaktifkan jadwal mingguan tanpa menghapusnya. Menonaktifkan menghentikan sesi baru; sesi yang sudah dijadwalkan tidak otomatis dibatalkan."
        action={
          canManage ? (
            <Button asChild>
              <Link to="/latihan/baru" search={{ copy: undefined, weekly: true }}>
                <Plus />
                Jadwal baru
              </Link>
            </Button>
          ) : undefined
        }
      />
      {accessPending || series.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : !canManage ? (
        <EmptyState title="Khusus staf klub" description="Pelatih dan admin mengelola jadwal berulang." />
      ) : !groups.length ? (
        <EmptyState
          title="Belum ada jadwal berulang"
          description="Buat jadwal mingguan pertama, misalnya latihan sore setiap hari kerja."
          action={
            <Button asChild>
              <Link to="/latihan/baru" search={{ copy: undefined, weekly: true }}>
                <Plus />
                Jadwal baru
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {groups.map((g) => (
            <li key={g.key} className="rounded-2xl bg-card p-4 shadow-border">
              <p className="text-card-title">{g.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {g.startTime ? g.startTime : "Jam belum ditentukan"}
                {g.location ? ` · ${g.location}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Hari untuk ${g.title}`}>
                {g.members.map((m) => {
                  const label = WEEKDAYS.find((d) => d.id === m.weekday)?.label ?? String(m.weekday);
                  return (
                    <Button
                      key={m.id}
                      type="button"
                      size="sm"
                      variant={m.active ? "default" : "outline"}
                      aria-pressed={m.active}
                      aria-label={`${label}: ${m.active ? "Aktif" : "Nonaktif"}, ketuk untuk mengubah`}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: m.id, active: !m.active })}
                    >
                      {label.slice(0, 3)}
                    </Button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
