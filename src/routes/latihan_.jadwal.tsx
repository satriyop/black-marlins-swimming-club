import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { listClubPracticeSeries, setClubPracticeSeriesActive, skipClubSeriesRange } from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-error";
import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { SET_BLOCKS, WEEKDAYS, labelOf, strokeLabel } from "@/lib/swim/constants";
import { Field, Input, SelectNative } from "@/components/ui/input";
import { PracticeNavigation } from "@/components/practice/practice-navigation";

export const Route = createFileRoute("/latihan_/jadwal")({ component: Page });

type SeriesRow = Awaited<ReturnType<typeof listClubPracticeSeries>>[number];
type SeriesGroup = {
  key: string;
  title: string;
  startTime: string | null;
  location: string | null;
  focus: string | null;
  notes: string | null;
  sets: SeriesRow["sets"];
  totalMeters: number;
  members: SeriesRow[];
};

function groupKey(s: SeriesRow) {
  return JSON.stringify([s.title, s.start_time, s.location, s.focus, s.notes, s.sets]);
}

function groupSeries(rows: SeriesRow[]): SeriesGroup[] {
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
      focus: members[0]!.focus,
      notes: members[0]!.notes,
      sets: members[0]!.sets,
      totalMeters: members[0]!.total_meters,
      members: members.sort((a, b) => a.weekday - b.weekday),
    }))
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title, "id") || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
    );
}

function NewScheduleButton() {
  return (
    <Button asChild>
      <Link to="/latihan/baru" search={{ weekly: true }}>
        <Plus />
        Jadwal baru
      </Link>
    </Button>
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
      <PageHeader
        kicker="Program"
        title="Atur jadwal rutin"
        description="Kelola hari latihan mingguan. Gunakan sesi khusus untuk latihan yang hanya berlangsung sekali."
        action={
          canManage ? <NewScheduleButton /> : undefined
        }
      />
      <PracticeNavigation active="schedule" canManage={canManage} />
      {canManage ? <SeriesSkipBar series={series.data ?? []} /> : null}
      {accessPending || series.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : !canManage ? (
        <EmptyState title="Khusus staf klub" description="Pelatih dan admin mengelola jadwal berulang." />
      ) : series.isError ? (
        <QueryError retry={() => series.refetch()} />
      ) : !groups.length ? (
        <EmptyState
          title="Belum ada jadwal berulang"
          description="Buat jadwal mingguan pertama, misalnya latihan sore setiap hari kerja."
          action={<NewScheduleButton />}
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
              {g.focus || g.totalMeters ? (
                <p className="mt-2 text-sm">
                  {g.focus ? `Fokus: ${g.focus}` : "Program latihan"}
                  {g.totalMeters ? ` · ${g.totalMeters.toLocaleString("id-ID")} m` : ""}
                </p>
              ) : null}
              {g.sets.length || g.notes ? (
                <details className="mt-3 rounded-xl border border-border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Lihat panduan latihan{g.sets.length ? ` · ${g.sets.length} set` : ""}
                  </summary>
                  {g.sets.length ? (
                    <ol className="mt-3 grid gap-2 text-sm">
                      {g.sets.map((set) => (
                        <li key={`${set.sort_order}:${set.block}:${set.stroke}`}>
                          <span className="font-medium">{labelOf(SET_BLOCKS, set.block ?? "utama")}</span>
                          {` · ${set.reps} × ${set.distance_m} m ${strokeLabel(set.stroke).toLowerCase()}`}
                          {set.description ? ` · ${set.description}` : ""}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {g.notes ? <p className="mt-3 text-sm text-muted-foreground">Catatan: {g.notes}</p> : null}
                </details>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Hari untuk ${g.title}`}>
                {g.members.map((m) => {
                  const label = WEEKDAYS.find((d) => d.id === m.weekday)?.label ?? String(m.weekday);
                  const ended = m.until_date != null;
                  return (
                    <Button
                      key={m.id}
                      type="button"
                      size="sm"
                      variant={m.active && !ended ? "default" : "outline"}
                      aria-pressed={m.active}
                      aria-label={ended ? `${label}: Berakhir` : `${label}: ${m.active ? "Aktif" : "Nonaktif"}, ketuk untuk mengubah`}
                      disabled={toggle.isPending || ended}
                      onClick={() => toggle.mutate({ id: m.id, active: !m.active })}
                    >
                      {label.slice(0, 3)}
                      {ended ? " · Berakhir" : ""}
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

function SeriesSkipBar({ series }: { series: SeriesRow[] }) {
  const qc = useQueryClient();
  const [id, setId] = useState<number | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("Libur");
  const active = series.filter((item) => item.active && item.until_date == null);
  if (!active.length) return null;
  return (
    <form
      className="mb-6 grid gap-3 rounded-2xl bg-card p-4 shadow-border md:grid-cols-[minmax(12rem,2fr)_1fr_1fr_minmax(8rem,1fr)_auto] md:items-end"
      onSubmit={async (event) => {
        event.preventDefault();
        if (id === "") return;
        try {
          await skipClubSeriesRange({ data: { id: Number(id), fromDate, toDate, reason } });
          toast.success("Rentang libur diterapkan");
          await qc.invalidateQueries({ queryKey: ["practices"] });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Gagal menerapkan libur");
        }
      }}
    >
      <Field label="Liburkan jadwal">
        <SelectNative value={id === "" ? "" : String(id)} onChange={(event) => setId(event.target.value ? Number(event.target.value) : "")} required>
          <option value="">Pilih jadwal</option>
          {active.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {WEEKDAYS.find((day) => day.id === item.weekday)?.label}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Dari"><Input type="date" required value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></Field>
      <Field label="Sampai"><Input type="date" required value={toDate} onChange={(event) => setToDate(event.target.value)} /></Field>
      <Field label="Alasan"><Input value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <Button type="submit" variant="outline">Terapkan</Button>
    </form>
  );
}
