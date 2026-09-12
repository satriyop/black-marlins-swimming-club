import { useAccess } from "@/lib/club/use-access";
import { canWriteMeet, canWriteMeetEntry, canWriteOfficialResult } from "@/lib/club/permissions";
import { QueryError } from "@/components/ui/query-error";
import { DeleteButton } from "@/components/ui/delete-button";
import { ResultList } from "@/components/swim/result-list";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import {
  deleteEntry,
  deleteMeet,
  getMeet,
  listSwimmers,
  saveEntry,
  saveResult,
} from "@/lib/server/fns";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, SelectNative } from "@/components/ui/input";
import { MeetDialog } from "./event";
import {
  COMPETITION_STROKES,
  DISTANCES,
  MEET_LEVELS,
  MEET_STATUSES,
  eventCode,
  labelOf,
} from "@/lib/swim/constants";
import { formatTime, parseTimeToMs } from "@/lib/swim/time";
import { formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/event_/$id")({ component: Page });

function Page() {
  const { hats } = useAccess();
  const id = Number(Route.useParams().id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["meet", id],
    queryFn: () => getMeet({ data: { id } }),
    enabled: Number.isFinite(id),
  });
  const del = useMutation({
    mutationFn: () => deleteMeet({ data: { id } }),
    onSuccess: async () => {
      toast.success("Event dihapus");
      await qc.invalidateQueries();
      void nav({ to: "/event" });
    },
  });
  if (!Number.isSafeInteger(id) || id < 1)
    return (
      <AppShell>
        <p>Kejuaraan tidak ditemukan.</p>
      </AppShell>
    );
  if (isPending)
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell>
        <QueryError retry={() => refetch()} />
      </AppShell>
    );
  const { meet, entries, results } = data;
  return (
    <AppShell>
      <Link
        to="/event"
        className="mb-4 inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Kejuaraan
      </Link>
      <div className="mb-6 flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-border lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            {labelOf(MEET_LEVELS, meet.level)} ·{" "}
            {meet.course === "50" ? "Kolam 50 m" : "Kolam 25 m"}
          </p>
          <h1 className="font-display text-4xl">{meet.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatDateId(meet.startDate, "d MMMM yyyy")}
            {meet.endDate && meet.endDate !== meet.startDate
              ? ` – ${formatDateId(meet.endDate, "d MMMM yyyy")}`
              : ""}
            {meet.city ? ` · ${meet.city}` : ""}
          </p>
          {meet.venue ? <p className="text-sm text-muted-foreground">{meet.venue}</p> : null}
          {meet.organizer ? (
            <p className="mt-1 text-xs text-muted-foreground">{meet.organizer}</p>
          ) : null}
          {meet.notes ? <p className="mt-3 max-w-2xl text-sm">{meet.notes}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{labelOf(MEET_STATUSES, meet.status)}</Badge>
          <EntryDialog meetId={meet.id} />
          {canWriteMeet(hats) && <MeetDialog initial={meet} />}
          {canWriteMeet(hats) && (
            <DeleteButton
              label="Hapus kejuaraan"
              description="Kejuaraan dan pendaftaran nomor akan dihapus."
              onDelete={() => del.mutateAsync()}
            />
          )}
        </div>
      </div>
      <section className="mb-8">
        <h2 className="font-display mb-3 text-2xl">Nomor terdaftar</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada nomor. Daftarkan perenang ke gaya dan jarak.
          </p>
        ) : (
          <div className="hidden overflow-x-auto rounded-2xl bg-card shadow-border md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Perenang</th>
                  <th className="px-4 py-2 font-medium">Nomor</th>
                  <th className="px-4 py-2 font-medium">KU</th>
                  <th className="px-4 py-2 font-medium">Waktu pendaftaran</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5">{e.swimmerName}</td>
                    <td className="px-4 py-2.5">{eventCode(e.distanceM, e.stroke, meet.course)}</td>
                    <td className="px-4 py-2.5">{e.ageGroup ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">
                      {formatTime(e.seedTimeMs)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <EntryActions entry={e} meet={meet} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ul className="grid gap-3 md:hidden">
          {entries.map((e) => (
            <li key={e.id} className="rounded-2xl bg-card p-4 shadow-border">
              <p className="font-semibold">{e.swimmerName}</p>
              <p className="mt-1 text-sm">{eventCode(e.distanceM, e.stroke, meet.course)}</p>
              <p className="my-3 text-sm text-muted-foreground">
                {e.ageGroup} · Waktu pendaftaran {formatTime(e.seedTimeMs)}
              </p>
              <EntryActions entry={e} meet={meet} />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display mb-3 text-2xl">Hasil</h2>
        <ResultList results={results} showSwimmer variant="meet" />
      </section>
    </AppShell>
  );
}

function EntryActions({
  entry,
  meet,
}: {
  entry: Awaited<ReturnType<typeof getMeet>>["entries"][number];
  meet: Awaited<ReturnType<typeof getMeet>>["meet"];
}) {
  const { hats } = useAccess();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const timeMs = parseTimeToMs(time);
      if (timeMs == null) throw new Error("Format waktu: 32.18 atau 1:05.72");
      return saveResult({
        data: {
          swimmerId: entry.swimmerId,
          meetId: meet.id,
          resultDate: meet.startDate,
          stroke: entry.stroke,
          distanceM: entry.distanceM,
          course: meet.course as "25" | "50",
          timeMs,
          place: place ? Number(place) : null,
          round: "timed_final",
          status: "selesai",
        },
      });
    },
    onSuccess: async (res) => {
      toast.success(res.isPb ? "PB baru tercatat" : "Hasil tersimpan");
      setOpen(false);
      await qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteEntry({ data: { id: entry.id } }),
    onSuccess: async () => {
      await qc.invalidateQueries();
    },
  });
  return (
    <div className="flex justify-end gap-1">
      {canWriteOfficialResult(hats, entry.swimmerId) && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary">Catat hasil</Button>
          </DialogTrigger>
          <DialogContent
            title={`Hasil ${entry.swimmerName}`}
            description={eventCode(entry.distanceM, entry.stroke, meet.course)}
          >
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <Field label="Waktu resmi">
                <Input
                  className="font-mono"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="1:05.72"
                />
              </Field>
              <Field label="Peringkat">
                <Input
                  type="number"
                  min={1}
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                />
              </Field>
              {save.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {save.error.message}
                </p>
              )}
              <Button type="submit" disabled={save.isPending}>
                Simpan
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {canWriteMeetEntry(hats, entry.swimmerId) && (
        <DeleteButton
          label="Batalkan pendaftaran nomor"
          description={`Pendaftaran ${entry.swimmerName} pada nomor ini akan dihapus.`}
          onDelete={() => remove.mutateAsync()}
        />
      )}
    </div>
  );
}

function EntryDialog({ meetId }: { meetId: number }) {
  const { hats } = useAccess();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const swimmers = useQuery({ queryKey: ["swimmers"], queryFn: () => listSwimmers() });
  const [form, setForm] = useState({ swimmerId: "", stroke: "bebas", distanceM: "50", seed: "" });
  const mut = useMutation({
    mutationFn: () =>
      saveEntry({
        data: {
          meetId,
          swimmerId: Number(form.swimmerId),
          stroke: form.stroke,
          distanceM: Number(form.distanceM),
          seedTimeMs: form.seed ? parseTimeToMs(form.seed) : null,
        },
      }),
    onSuccess: async () => {
      toast.success("Nomor didaftarkan");
      setOpen(false);
      await qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!hats.staff && !hats.guardianSwimmerIds.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Daftar nomor
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Daftarkan nomor"
        description="Kelompok umur dihitung otomatis dari tanggal lahir vs tahun event."
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Perenang">
            <SelectNative
              required
              value={form.swimmerId}
              onChange={(e) => setForm({ ...form, swimmerId: e.target.value })}
            >
              <option value="">Pilih perenang</option>
              {(swimmers.data ?? [])
                .filter((s) => canWriteMeetEntry(hats, s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} · {s.ageGroupLabel}
                  </option>
                ))}
            </SelectNative>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gaya">
              <SelectNative
                value={form.stroke}
                onChange={(e) => setForm({ ...form, stroke: e.target.value })}
              >
                {COMPETITION_STROKES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Jarak">
              <SelectNative
                value={form.distanceM}
                onChange={(e) => setForm({ ...form, distanceM: e.target.value })}
              >
                {DISTANCES.map((d) => (
                  <option key={d} value={d}>
                    {d} m
                  </option>
                ))}
              </SelectNative>
            </Field>
          </div>
          <Field
            label="Waktu pendaftaran (seed)"
            hint="Catatan acuan untuk pengelompokan peserta. Opsional, contoh 36.82."
          >
            <Input
              className="font-mono"
              value={form.seed}
              onChange={(e) => setForm({ ...form, seed: e.target.value })}
            />
          </Field>
          {mut.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mut.error.message}
            </p>
          )}
          <Button type="submit" disabled={mut.isPending || !form.swimmerId}>
            Daftarkan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
