import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { deletePractice, getPractice, updateAttendance } from "@/lib/server/fns";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectNative } from "@/components/ui/input";
import { ATTENDANCE, PRACTICE_KINDS, SET_BLOCKS, labelOf, strokeLabel } from "@/lib/swim/constants";
import { formatInterval } from "@/lib/swim/time";
import { formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/latihan/$id")({ component: Page });

function Page() {
  const id = Number(Route.useParams().id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["practice", id],
    queryFn: () => getPractice({ data: { id } }),
    enabled: Number.isFinite(id),
  });
  const del = useMutation({
    mutationFn: () => deletePractice({ data: { id } }),
    onSuccess: async () => { toast.success("Sesi dihapus"); await qc.invalidateQueries(); void nav({ to: "/latihan" }); },
  });
  const att = useMutation({
    mutationFn: (input: { id: number; status: "hadir" | "izin" | "sakit" | "alfa"; meters: number }) =>
      updateAttendance({ data: { id: input.id, status: input.status, metersCompleted: input.status === "hadir" ? input.meters : 0 } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["practice", id] });
      await qc.invalidateQueries({ queryKey: ["practices"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (isPending) return <AppShell><div className="h-64 animate-pulse rounded-2xl bg-muted" /></AppShell>;
  if (error || !data) return <AppShell><p className="text-sm text-destructive">Sesi tidak ditemukan.</p></AppShell>;

  const grouped = new Map<string, typeof data.sets>();
  for (const s of data.sets) {
    const key = s.block ?? "lain";
    grouped.set(key, [...(grouped.get(key) ?? []), s]);
  }

  return (
    <AppShell>
      <Link to="/latihan" className="mb-4 inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Latihan</Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{labelOf(PRACTICE_KINDS, data.kind)}</p>
          <h1 className="font-display text-4xl">{data.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{formatDateId(data.sessionDate, "EEEE, d MMMM yyyy")}{data.startTime ? ` · ${data.startTime}` : ""}{data.durationMin ? ` · ${data.durationMin} menit` : ""}{data.location ? ` · ${data.location}` : ""}</p>
          {data.focus ? <p className="mt-2 text-sm">{data.focus}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <p className="font-display text-3xl tabular-nums text-primary">{data.totalMeters.toLocaleString("id-ID")}<span className="ml-1 text-base text-muted-foreground">m</span></p>
          <Button variant="outline" onClick={() => { if (confirm("Hapus sesi ini?")) del.mutate(); }}><Trash2 className="size-4" /></Button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="font-display mb-3 text-2xl">Program set</h2>
          <div className="rounded-2xl bg-card p-4 shadow-border">
            {data.sets.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada set.</p> : [...grouped.entries()].map(([block, sets]) => (
              <div key={block} className="mb-4 last:mb-0">
                <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">{labelOf(SET_BLOCKS, block)}</p>
                <ul className="grid gap-2">
                  {sets.map((s) => (
                    <li key={s.id} className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2 last:border-0">
                      <div>
                        <p className="font-medium">{s.reps} × {s.distanceM} {strokeLabel(s.stroke)}</p>
                        {s.description ? <p className="text-xs text-muted-foreground">{s.description}</p> : null}
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatInterval(s.intervalSec)} · {(s.reps * s.distanceM).toLocaleString("id-ID")} m</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {data.notes ? <p className="mt-3 text-sm text-muted-foreground">{data.notes}</p> : null}
          </div>
        </section>
        <section className="lg:col-span-2">
          <h2 className="font-display mb-3 text-2xl">Kehadiran</h2>
          <div className="grid gap-2">
            {data.attendance.map((a) => (
              <div key={a.id} className="rounded-2xl bg-card p-3 shadow-border">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium">{a.swimmerName}</p>
                  <Badge tone={a.status === "hadir" ? "pool" : "muted"}>{labelOf(ATTENDANCE, a.status)}</Badge>
                </div>
                <SelectNative value={a.status} onChange={(e) => att.mutate({ id: a.id, status: e.target.value as typeof a.status, meters: data.totalMeters })}>
                  {ATTENDANCE.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
                </SelectNative>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
