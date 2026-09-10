import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { listPractices, savePractice, type SetInput } from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, SelectNative, Textarea } from "@/components/ui/input";
import { PRACTICE_KINDS, SET_BLOCKS, STROKES, WEEKLY_PLAN, labelOf } from "@/lib/swim/constants";
import { formatDateId, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/latihan")({ component: Page });

function Page() {
  const { data, isPending } = useQuery({ queryKey: ["practices"], queryFn: () => listPractices() });
  return (
    <AppShell>
      <PageHeader kicker="Program" title="Latihan" description="Rencana mingguan BMSC dan tracker kehadiran per sesi. Volume dihitung dari set." action={<PracticeDialog />} />
      <section className="mb-6 rounded-2xl bg-card p-5 shadow-border">
        <h2 className="font-display text-2xl">Rencana mingguan</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pola klub: teknik, sprint, daya tahan, lalu tes. Disesuaikan pelatih Hardiyanto Wibowo.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {WEEKLY_PLAN.map((w) => (
            <div key={w.day} className="rounded-xl bg-muted/70 p-3">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">{w.day}</p>
              <p className="mt-1 font-medium">{labelOf(PRACTICE_KINDS, w.kind)}</p>
              <p className="text-xs text-muted-foreground">{w.focus}</p>
            </div>
          ))}
        </div>
      </section>
      {isPending ? (
        <div className="grid gap-2">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />))}</div>
      ) : !data?.length ? (
        <EmptyState title="Belum ada sesi" description="Buat sesi pertama beserta set pemanasan sampai pendinginan." action={<PracticeDialog />} />
      ) : (
        <div className="grid gap-2">
          {data.map((p) => (
            <Link key={p.id} to="/latihan/$id" params={{ id: String(p.id) }} className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-4 shadow-border">
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">{formatDateId(p.sessionDate, "EEEE, d MMM yyyy")}{p.startTime ? ` · ${p.startTime}` : ""} · {labelOf(PRACTICE_KINDS, p.kind)}{p.rosterCount ? ` · ${p.presentCount}/${p.rosterCount} hadir` : ""}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm tabular-nums text-primary">{p.totalMeters.toLocaleString("id-ID")} m</p>
                <Badge className="mt-1">{labelOf(PRACTICE_KINDS, p.kind)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

const emptySet = (): SetInput => ({ block: "utama", reps: 4, distanceM: 50, stroke: "bebas", intervalSec: 70, description: "" });

export function PracticeDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({ sessionDate: todayIso(), startTime: "15:30", durationMin: "90", location: "Kolam Renang BMSC, Klaten", kind: "teknik", title: "", focus: "", notes: "" });
  const [sets, setSets] = useState<SetInput[]>([emptySet()]);
  const mut = useMutation({
    mutationFn: () => savePractice({ data: { sessionDate: form.sessionDate, startTime: form.startTime, durationMin: Number(form.durationMin) || undefined, location: form.location, kind: form.kind, title: form.title, focus: form.focus, notes: form.notes, sets } }),
    onSuccess: async () => { toast.success("Sesi latihan tersimpan"); setOpen(false); setForm((f) => ({ ...f, title: "", focus: "", notes: "" })); setSets([emptySet()]); await qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const volume = sets.reduce((a, s) => a + s.reps * s.distanceM, 0);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> Sesi baru</Button></DialogTrigger>
      <DialogContent className="max-w-2xl" title="Sesi latihan" description="Set akan menjumlahkan volume. Perenang aktif otomatis masuk daftar hadir.">
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <Field label="Judul"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Teknik gaya bebas" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal"><Input type="date" required value={form.sessionDate} onChange={(e) => setForm({ ...form, sessionDate: e.target.value })} /></Field>
            <Field label="Jam mulai"><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jenis"><SelectNative value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{PRACTICE_KINDS.map((k) => (<option key={k.id} value={k.id}>{k.label}</option>))}</SelectNative></Field>
            <Field label="Durasi (menit)"><Input type="number" min={20} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} /></Field>
          </div>
          <Field label="Fokus"><Input value={form.focus} onChange={(e) => setForm({ ...form, focus: e.target.value })} /></Field>
          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Set</p><p className="font-mono text-xs tabular-nums text-primary">{volume.toLocaleString("id-ID")} m</p></div>
            <div className="grid gap-2">
              {sets.map((s, i) => (
                <div key={i} className="grid gap-2 rounded-xl bg-muted/60 p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <SelectNative value={s.block} onChange={(e) => { const next = [...sets]; next[i] = { ...s, block: e.target.value }; setSets(next); }}>{SET_BLOCKS.map((b) => (<option key={b.id} value={b.id}>{b.label}</option>))}</SelectNative>
                    <SelectNative value={s.stroke} onChange={(e) => { const next = [...sets]; next[i] = { ...s, stroke: e.target.value }; setSets(next); }}>{STROKES.map((b) => (<option key={b.id} value={b.id}>{b.short}</option>))}</SelectNative>
                    <Input type="number" min={1} value={s.reps} onChange={(e) => { const next = [...sets]; next[i] = { ...s, reps: Number(e.target.value) }; setSets(next); }} />
                    <Input type="number" min={25} step={25} value={s.distanceM} onChange={(e) => { const next = [...sets]; next[i] = { ...s, distanceM: Number(e.target.value) }; setSets(next); }} />
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Keterangan set" value={s.description ?? ""} onChange={(e) => { const next = [...sets]; next[i] = { ...s, description: e.target.value }; setSets(next); }} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setSets(sets.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="mt-2" onClick={() => setSets([...sets, emptySet()])}>Tambah set</Button>
          </div>
          <Field label="Catatan"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Menyimpan…" : "Simpan sesi"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
