import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { listSwimmers, saveSwimmer } from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { SwimmerAvatar } from "@/components/swim/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, SelectNative, Textarea } from "@/components/ui/input";
import { GENDERS, SWIMMER_STATUSES } from "@/lib/swim/constants";
import { formatDateId, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/perenang")({ component: Page });

function Page() {
  const { data, isPending } = useQuery({ queryKey: ["swimmers"], queryFn: () => listSwimmers() });

  return (
    <AppShell>
      <PageHeader kicker="Skuad" title="Perenang" description="Anggota Black Marlins Swimming Club. Kelompok umur mengikuti aturan PRSI (usia per 31 Desember)." action={<SwimmerDialog />} />
      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />))}
        </div>
      ) : !data?.length ? (
        <EmptyState title="Belum ada perenang" description="Tambahkan anggota klub untuk mulai mencatat latihan dan prestasi." action={<SwimmerDialog />} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <Link key={s.id} to="/perenang/$id" params={{ id: String(s.id) }} className="rounded-2xl bg-card p-5 shadow-border transition-transform duration-150 hover:-translate-y-0.5">
              <div className="flex items-start gap-3">
                <SwimmerAvatar name={s.fullName} size="lg" />
                <div className="min-w-0">
                  <p className="font-semibold">{s.fullName}</p>
                  <p className="text-sm text-muted-foreground">{s.nickname ?? "—"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="pool">{s.ageGroupLabel}</Badge>
                    <Badge>{s.gender}</Badge>
                    <Badge tone={s.status === "aktif" ? "ok" : "muted"}>{s.status}</Badge>
                  </div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div><dt>Lahir</dt><dd className="text-foreground">{formatDateId(s.dateOfBirth, "d MMM yyyy")}</dd></div>
                <div><dt>Usia / KU {new Date().getFullYear()}</dt><dd className="text-foreground">{s.age} th · {s.ageGroupRange}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function SwimmerDialog({
  initial,
}: {
  initial?: {
    id: number; fullName: string; nickname: string | null; dateOfBirth: string;
    gender: "putra" | "putri"; city: string | null; status: "aktif" | "cuti" | "alumni";
    joinDate: string | null; notes: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fullName: initial?.fullName ?? "",
    nickname: initial?.nickname ?? "",
    dateOfBirth: initial?.dateOfBirth ?? "",
    gender: initial?.gender ?? "putra",
    city: initial?.city ?? "Klaten",
    status: initial?.status ?? "aktif",
    joinDate: initial?.joinDate ?? todayIso(),
    notes: initial?.notes ?? "",
  });
  const mut = useMutation({
    mutationFn: () => saveSwimmer({
      data: {
        id: initial?.id, fullName: form.fullName, nickname: form.nickname,
        dateOfBirth: form.dateOfBirth, gender: form.gender as "putra" | "putri",
        city: form.city, status: form.status as "aktif" | "cuti" | "alumni",
        joinDate: form.joinDate, notes: form.notes,
      },
    }),
    onSuccess: async () => {
      toast.success(initial ? "Data perenang diperbarui" : "Perenang ditambahkan");
      setOpen(false);
      await qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" />{initial ? "Ubah data" : "Tambah perenang"}</Button>
      </DialogTrigger>
      <DialogContent title={initial ? "Ubah perenang" : "Perenang baru"} description="Data anggota untuk kelompok umur PRSI dan laporan prestasi.">
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <Field label="Nama lengkap"><Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama panggilan"><Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></Field>
            <Field label="Tanggal lahir"><Input required type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Putra / putri">
              <SelectNative value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as "putra" | "putri" })}>
                {GENDERS.map((g) => (<option key={g.id} value={g.id}>{g.label}</option>))}
              </SelectNative>
            </Field>
            <Field label="Status">
              <SelectNative value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
                {SWIMMER_STATUSES.map((g) => (<option key={g.id} value={g.id}>{g.label}</option>))}
              </SelectNative>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kota"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Bergabung"><Input type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} /></Field>
          </div>
          <Field label="Catatan pelatih"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Menyimpan…" : "Simpan"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
