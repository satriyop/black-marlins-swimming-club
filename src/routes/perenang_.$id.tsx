import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { deleteResult, deleteSwimmer, getSwimmer, listMeets, saveResult } from "@/lib/server/fns";
import { AppShell } from "@/components/layout/app-shell";
import { SwimmerAvatar } from "@/components/swim/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, SelectNative } from "@/components/ui/input";
import { SwimmerDialog } from "./perenang";
import { COMPETITION_STROKES, COURSES, DISTANCES, RESULT_ROUNDS, RESULT_STATUSES, eventCode, strokeLabel } from "@/lib/swim/constants";
import { formatTime, parseTimeToMs } from "@/lib/swim/time";
import { formatDateId, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/perenang_/$id")({ component: Page });

function Page() {
  const swimmerId = Number(Route.useParams().id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({ queryKey: ["swimmer", swimmerId], queryFn: () => getSwimmer({ data: { id: swimmerId } }), enabled: Number.isFinite(swimmerId) });
  const del = useMutation({
    mutationFn: () => deleteSwimmer({ data: { id: swimmerId } }),
    onSuccess: async () => { toast.success("Perenang dihapus"); await qc.invalidateQueries(); void nav({ to: "/perenang" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isPending) return <AppShell><div className="h-64 animate-pulse rounded-2xl bg-muted" /></AppShell>;
  if (error || !data) return <AppShell><p className="text-sm text-destructive">Perenang tidak ditemukan.</p></AppShell>;
  const { swimmer, results, pbs, attendance, totalMeters, upcomingEntries } = data;
  return (
    <AppShell>
      <Link to="/perenang" className="mb-4 inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Skuad</Link>
      <div className="mb-6 flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-border sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <SwimmerAvatar name={swimmer.fullName} size="lg" />
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{swimmer.ageGroupLabel} · {swimmer.gender}</p>
            <h1 className="font-display text-4xl leading-none">{swimmer.fullName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{formatDateId(swimmer.dateOfBirth, "d MMMM yyyy")} · {swimmer.age} tahun · KU {swimmer.ageYearEnd} th di {new Date().getFullYear()}</p>
            {swimmer.notes ? <p className="mt-3 max-w-xl text-sm">{swimmer.notes}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ResultDialog swimmerId={swimmer.id} />
          <SwimmerDialog initial={swimmer} />
          <Button variant="outline" onClick={() => { if (confirm(`Hapus ${swimmer.fullName}?`)) del.mutate(); }}><Trash2 className="size-4" /></Button>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <MiniStat label="Kehadiran" value={`${attendance.rate}%`} hint={`${attendance.present}/${attendance.total} sesi`} />
        <MiniStat label="Volume" value={`${(totalMeters / 1000).toFixed(1)} km`} hint="Akumulasi latihan" />
        <MiniStat label="PB tercatat" value={String(pbs.length)} hint="Semua nomor & lintasan" />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-2">
          <h2 className="font-display mb-3 text-2xl">Rekor pribadi</h2>
          <div className="overflow-hidden rounded-2xl bg-card shadow-border">
            {pbs.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Belum ada waktu resmi.</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Nomor</th><th className="px-4 py-2 font-medium">Waktu</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {pbs.map((p) => (
                    <tr key={`${p.stroke}-${p.distanceM}-${p.course}`}>
                      <td className="px-4 py-2.5">{eventCode(p.distanceM, p.stroke, p.course)}<div className="text-xs text-muted-foreground">{formatDateId(p.resultDate)}</div></td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-primary">{formatTime(p.timeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <section className="lg:col-span-3"><ProgressChart results={results} /></section>
      </div>
      {upcomingEntries.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display mb-3 text-2xl">Nomor terdaftar</h2>
          <ul className="grid gap-2">
            {upcomingEntries.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-border">
                <div><p className="font-medium">{e.meetName}</p><p className="text-xs text-muted-foreground">{eventCode(e.distanceM, e.stroke)} · {e.ageGroup} · seed {formatTime(e.seedTimeMs)}</p></div>
                <Badge>{formatDateId(e.startDate, "d MMM")}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mt-6"><h2 className="font-display mb-3 text-2xl">Riwayat waktu</h2><ResultTable results={results} /></section>
    </AppShell>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (<div className="rounded-2xl bg-card p-4 shadow-border"><p className="text-xs text-muted-foreground">{label}</p><p className="font-display mt-1 text-3xl tabular-nums leading-none">{value}</p><p className="mt-2 text-xs text-muted-foreground">{hint}</p></div>);
}

function ProgressChart({ results }: { results: Awaited<ReturnType<typeof getSwimmer>>["results"] }) {
  const options = useMemo(() => {
    const map = new Map<string, { stroke: string; distanceM: number; course: string; n: number }>();
    for (const r of results) {
      if (r.timeMs == null) continue;
      const k = `${r.stroke}-${r.distanceM}-${r.course}`;
      map.set(k, { stroke: r.stroke, distanceM: r.distanceM, course: r.course, n: (map.get(k)?.n ?? 0) + 1 });
    }
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [results]);
  const [key, setKey] = useState(() => options[0] ? `${options[0].stroke}-${options[0].distanceM}-${options[0].course}` : "");
  const selected = options.find((o) => `${o.stroke}-${o.distanceM}-${o.course}` === key) ?? options[0];
  const series = selected ? results.filter((r) => r.stroke === selected.stroke && r.distanceM === selected.distanceM && r.course === selected.course && r.timeMs != null).slice().reverse().map((r) => ({ date: formatDateId(r.resultDate, "d MMM"), sec: (r.timeMs ?? 0) / 1000 })) : [];
  return (
    <div className="rounded-2xl bg-card p-4 shadow-border">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-2xl">Tren prestasi</h2>
        {options.length > 0 ? (
          <SelectNative className="sm:w-56" value={selected ? `${selected.stroke}-${selected.distanceM}-${selected.course}` : ""} onChange={(e) => setKey(e.target.value)}>
            {options.map((o) => (<option key={`${o.stroke}-${o.distanceM}-${o.course}`} value={`${o.stroke}-${o.distanceM}-${o.course}`}>{eventCode(o.distanceM, o.stroke, o.course)}</option>))}
          </SelectNative>
        ) : null}
      </div>
      {series.length < 2 ? <p className="py-10 text-center text-sm text-muted-foreground">Minimal dua catatan waktu pada nomor yang sama untuk grafik.</p> : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(232,241,244,0.06)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#8aa0aa", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis reversed domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: "#8aa0aa", fontSize: 11 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => formatTime(Math.round(v * 1000))} />
              <Tooltip contentStyle={{ background: "#0c1c26", border: "1px solid #1c333e", borderRadius: 12 }} formatter={(v: number) => [formatTime(Math.round(v * 1000)), "Waktu"]} />
              <Line type="monotone" dataKey="sec" stroke="#2ec4b6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ResultTable({ results }: { results: Awaited<ReturnType<typeof getSwimmer>>["results"] }) {
  const qc = useQueryClient();
  const del = useMutation({ mutationFn: (id: number) => deleteResult({ data: { id } }), onSuccess: async () => { toast.success("Hasil dihapus"); await qc.invalidateQueries(); } });
  if (results.length === 0) return <p className="text-sm text-muted-foreground">Belum ada hasil.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl bg-card shadow-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Tanggal</th><th className="px-4 py-2 font-medium">Nomor</th><th className="px-4 py-2 font-medium">Waktu</th><th className="px-4 py-2 font-medium">Event</th><th className="px-4 py-2 font-medium">Pos</th><th className="px-4 py-2" /></tr></thead>
        <tbody className="divide-y divide-border">
          {results.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5">{formatDateId(r.resultDate, "d MMM yyyy")}</td>
              <td className="px-4 py-2.5">{eventCode(r.distanceM, r.stroke, r.course)}</td>
              <td className="px-4 py-2.5 font-mono tabular-nums">{formatTime(r.timeMs)} {r.isPb ? <span className="ml-1 text-xs text-primary">PB</span> : null}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{r.meetName ?? "Tes"}</td>
              <td className="px-4 py-2.5 tabular-nums">{r.place ?? "—"}</td>
              <td className="px-4 py-2.5 text-right"><button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => del.mutate(r.id)}><Trash2 className="size-4" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultDialog({ swimmerId }: { swimmerId: number }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const meets = useQuery({ queryKey: ["meets"], queryFn: () => listMeets() });
  const [form, setForm] = useState({ meetId: "", resultDate: todayIso(), stroke: "bebas", distanceM: "50", course: "50" as "25" | "50", time: "", place: "", round: "tes", status: "selesai" });
  const mut = useMutation({
    mutationFn: () => {
      const timeMs = form.time ? parseTimeToMs(form.time) : null;
      if (form.status === "selesai" && form.time && timeMs == null) throw new Error("Format waktu: 32.18 atau 1:05.72");
      return saveResult({ data: { swimmerId, meetId: form.meetId ? Number(form.meetId) : null, resultDate: form.resultDate, stroke: form.stroke, distanceM: Number(form.distanceM), course: form.course, timeMs, place: form.place ? Number(form.place) : null, round: form.round, status: form.status, kind: form.meetId ? "official" : "test" } });
    },
    onSuccess: async (res) => { toast.success(res.isPb ? "Tersimpan — rekor pribadi baru" : "Hasil tersimpan"); setOpen(false); setForm((f) => ({ ...f, time: "", place: "" })); await qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> Catat waktu</Button></DialogTrigger>
      <DialogContent title="Catat hasil" description="Waktu resmi, tes klub, atau kejuaraan.">
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <Field label="Tanggal"><Input type="date" required value={form.resultDate} onChange={(e) => setForm({ ...form, resultDate: e.target.value })} /></Field>
          <Field label="Event (opsional)"><SelectNative value={form.meetId} onChange={(e) => setForm({ ...form, meetId: e.target.value })}><option value="">Tes / time trial</option>{(meets.data ?? []).map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}</SelectNative></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gaya"><SelectNative value={form.stroke} onChange={(e) => setForm({ ...form, stroke: e.target.value })}>{COMPETITION_STROKES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}</SelectNative></Field>
            <Field label="Jarak"><SelectNative value={form.distanceM} onChange={(e) => setForm({ ...form, distanceM: e.target.value })}>{DISTANCES.map((d) => (<option key={d} value={d}>{d} m</option>))}</SelectNative></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lintasan"><SelectNative value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value as "25" | "50" })}>{COURSES.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}</SelectNative></Field>
            <Field label="Waktu" hint="Contoh 32.18 atau 1:05.72"><Input className="font-mono" placeholder="1:05.72" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Babak"><SelectNative value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })}>{RESULT_ROUNDS.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}</SelectNative></Field>
            <Field label="Status"><SelectNative value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{RESULT_STATUSES.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}</SelectNative></Field>
            <Field label="Peringkat"><Input type="number" min={1} value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-muted-foreground">Nomor: {eventCode(Number(form.distanceM), form.stroke, form.course)} · {strokeLabel(form.stroke)}</p>
          <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Menyimpan…" : "Simpan hasil"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
