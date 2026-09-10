import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { listMeets, saveMeet } from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, SelectNative, Textarea } from "@/components/ui/input";
import { COURSES, MEET_LEVELS, MEET_STATUSES, labelOf } from "@/lib/swim/constants";
import { formatDateId, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/event")({ component: Page });

function Page() {
  const { data, isPending } = useQuery({ queryKey: ["meets"], queryFn: () => listMeets() });
  return (
    <AppShell>
      <PageHeader kicker="Kejuaraan" title="Event" description="Meet klub, Pengcab Klaten, Kejurprov Jateng, O2SN, sampai kejuaraan nasional. KU mengikuti tahun kompetisi." action={<MeetDialog />} />
      {isPending ? (
        <div className="grid gap-2">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />))}</div>
      ) : !data?.length ? (
        <EmptyState title="Belum ada event" description="Tambahkan kejuaraan untuk mendaftarkan nomor dan mencatat hasil." action={<MeetDialog />} />
      ) : (
        <div className="grid gap-2">
          {data.map((m) => (
            <Link key={m.id} to="/event/$id" params={{ id: String(m.id) }} className="rounded-2xl bg-card p-4 shadow-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{m.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateId(m.startDate, "d MMM yyyy")}
                    {m.endDate && m.endDate !== m.startDate ? ` – ${formatDateId(m.endDate, "d MMM yyyy")}` : ""}
                    {m.city ? ` · ${m.city}` : ""}{m.venue ? ` · ${m.venue}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone="pool">{labelOf(MEET_LEVELS, m.level)}</Badge>
                  <Badge>{m.course === "50" ? "LP 50 m" : "SC 25 m"}</Badge>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{m.entryCount ?? 0} nomor terdaftar · {labelOf(MEET_STATUSES, m.status)}</p>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function MeetDialog({ initial }: { initial?: { id: number; name: string; level: string; course: string; venue: string | null; city: string | null; startDate: string; endDate: string | null; organizer: string | null; status: string; notes: string | null; }; }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: initial?.name ?? "", level: initial?.level ?? "pengcab",
    course: (initial?.course ?? "50") as "25" | "50", venue: initial?.venue ?? "",
    city: initial?.city ?? "Klaten", startDate: initial?.startDate ?? todayIso(),
    endDate: initial?.endDate ?? "", organizer: initial?.organizer ?? "Pengcab PRSI Klaten",
    status: initial?.status ?? "rencana", notes: initial?.notes ?? "",
  });
  const mut = useMutation({
    mutationFn: () => saveMeet({ data: { id: initial?.id, ...form, endDate: form.endDate || undefined } }),
    onSuccess: async () => { toast.success(initial ? "Event diperbarui" : "Event ditambahkan"); setOpen(false); await qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> {initial ? "Ubah event" : "Event baru"}</Button></DialogTrigger>
      <DialogContent title={initial ? "Ubah event" : "Event baru"}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <Field label="Nama kejuaraan"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tingkat"><SelectNative value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>{MEET_LEVELS.map((l) => (<option key={l.id} value={l.id}>{l.label}</option>))}</SelectNative></Field>
            <Field label="Lintasan"><SelectNative value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value as "25" | "50" })}>{COURSES.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}</SelectNative></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mulai"><Input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="Selesai"><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kota"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Status"><SelectNative value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{MEET_STATUSES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}</SelectNative></Field>
          </div>
          <Field label="Venue"><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></Field>
          <Field label="Penyelenggara"><Input value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} /></Field>
          <Field label="Catatan"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Menyimpan…" : "Simpan"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
