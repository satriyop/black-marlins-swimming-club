import { AnnouncementComposer } from "@/components/announcements/composer";
import { RegistrationPanel } from "@/components/swim/registration-panel";
import { useAccess } from "@/lib/club/use-access";
import { canWriteMeet, canWriteOfficialResult } from "@/lib/club/permissions";
import { ResourceQueryError } from "@/components/ui/query-error";
import { DeleteButton } from "@/components/ui/delete-button";
import { ResultList } from "@/components/swim/result-list";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { deleteMeet, getMeet, saveResult } from "@/lib/server/fns";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { MeetDialog } from "./event";
import { MEET_LEVELS, MEET_STATUSES, eventCode, labelOf } from "@/lib/swim/constants";
import { parseTimeToMs } from "@/lib/swim/time";
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
        <ResourceQueryError error={error} retry={() => refetch()} />
      </AppShell>
    );
  const { meet, entries, results } = data;
  const raceDaySwimmers = [...new Map<number, string>(
    entries
      .filter((entry) => !["rejected", "declined", "withdrawn"].includes(entry.registrationStatus ?? "legacy"))
      .map((entry) => [entry.swimmerId, entry.swimmerName]),
  ).entries()];
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
          {canWriteMeet(hats) && (
            <AnnouncementComposer
              label="Tulis pengumuman kejuaraan"
              prefill={{
                meetId: meet.id,
                title: `Informasi kejuaraan: ${meet.name}`,
                body: `${meet.name}\nMulai: ${meet.startDate}${meet.endDate ? ` sampai ${meet.endDate}` : ""}\nLokasi: ${meet.venue ?? "Belum ditentukan"}`,
              }}
            />
          )}
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
      <RegistrationPanel
        meet={meet}
        view={data.registration}
        entries={entries}
        resultAction={(entry) => <EntryActions entry={entry} meet={meet} />}
      />
      {raceDaySwimmers.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display mb-3 text-2xl">Hari lomba perenang</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Lihat seri, lintasan, waktu lapor, pemanasan, dan hasil resmi di satu halaman.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {raceDaySwimmers.map(([swimmerId, name]) => (
              <li key={swimmerId}>
                <Link
                  to="/event/$id/harilomba/$swimmerId"
                  params={{ id: String(meet.id), swimmerId: String(swimmerId) }}
                  className="flex min-h-11 items-center rounded-2xl bg-card px-4 py-3 text-sm font-medium shadow-border hover:bg-muted"
                >
                  Hari lomba · {name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
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
    </div>
  );
}
