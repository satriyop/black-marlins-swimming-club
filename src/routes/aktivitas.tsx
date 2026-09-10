import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { deleteActivity, listActivities, saveActivity } from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, SelectNative, Textarea } from "@/components/ui/input";
import { ACTIVITY_KINDS, labelOf } from "@/lib/swim/constants";
import { formatDateId, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/aktivitas")({ component: Page });

function Page() {
  const { data, isPending } = useQuery({
    queryKey: ["activities"],
    queryFn: () => listActivities(),
  });
  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>>();
    for (const a of data ?? []) {
      const key = a.activityDate.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [data]);

  return (
    <AppShell>
      <PageHeader
        kicker="Kalender klub"
        title="Aktivitas"
        description="Rapat orang tua, latihan darat, tes fisik, keberangkatan event, dan kegiatan BMSC lainnya."
        action={<ActivityDialog />}
      />
      {isPending ? (
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : !data?.length ? (
        <EmptyState title="Belum ada aktivitas" description="Catat rapat, tes, atau kegiatan klub." action={<ActivityDialog />} />
      ) : (
        <div className="grid gap-8">
          {grouped.map(([month, items]) => (
            <section key={month}>
              <h2 className="font-display mb-3 text-2xl">{formatDateId(`${month}-01`, "MMMM yyyy")}</h2>
              <div className="grid gap-2">
                {items.map((a) => (
                  <ActivityRow key={a.id} activity={a} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function ActivityRow({ activity }: { activity: Awaited<ReturnType<typeof listActivities>>[number] }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteActivity({ data: { id: activity.id } }),
    onSuccess: async () => {
      toast.success("Aktivitas dihapus");
      await qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-card p-4 shadow-border">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="pool">{labelOf(ACTIVITY_KINDS, activity.kind)}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatDateId(activity.activityDate, "EEEE, d MMM")}
            {activity.startTime ? ` · ${activity.startTime}` : ""}
            {activity.endTime ? `–${activity.endTime}` : ""}
          </span>
        </div>
        <p className="mt-2 font-semibold">{activity.title}</p>
        {activity.location ? <p className="text-xs text-muted-foreground">{activity.location}</p> : null}
        {activity.description ? <p className="mt-2 text-sm">{activity.description}</p> : null}
      </div>
      <Button variant="ghost" size="icon" onClick={() => del.mutate()}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function ActivityDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "", kind: "rapat", activityDate: todayIso(), startTime: "", endTime: "", location: "", description: "",
  });
  const mut = useMutation({
    mutationFn: () => saveActivity({ data: form }),
    onSuccess: async () => {
      toast.success("Aktivitas ditambahkan");
      setOpen(false);
      setForm((f) => ({ ...f, title: "", description: "" }));
      await qc.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" /> Aktivitas baru</Button>
      </DialogTrigger>
      <DialogContent title="Aktivitas klub">
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <Field label="Judul"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Jenis">
            <SelectNative value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {ACTIVITY_KINDS.map((k) => (<option key={k.id} value={k.id}>{k.label}</option>))}
            </SelectNative>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Tanggal"><Input type="date" required value={form.activityDate} onChange={(e) => setForm({ ...form, activityDate: e.target.value })} /></Field>
            <Field label="Mulai"><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></Field>
            <Field label="Selesai"><Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
          </div>
          <Field label="Lokasi"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Keterangan"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Button type="submit" disabled={mut.isPending}>Simpan</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
