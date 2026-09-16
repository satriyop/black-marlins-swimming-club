import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ResourceQueryError } from "@/components/ui/query-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getSwimmerRaceDay, saveRaceDayHeatSheet } from "@/lib/server/fns";
import type { RaceDay } from "@/lib/club/race-day";
import { registrationLabels } from "@/lib/swim/registration";
import {
  eventCode,
  RESULT_ROUNDS,
  RESULT_STATUSES,
  labelOf,
  MEET_STATUSES,
} from "@/lib/swim/constants";
import { formatTime } from "@/lib/swim/time";
import { formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/event_/$id_/harilomba_/$swimmerId")({
  component: RaceDayPage,
});

function RaceDayPage() {
  const { id, swimmerId: swimmerParam } = Route.useParams();
  const meetId = Number(id);
  const swimmerId = Number(swimmerParam);
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["race-day", meetId, swimmerId],
    queryFn: () => getSwimmerRaceDay({ data: { meetId, swimmerId } }),
    enabled:
      Number.isSafeInteger(meetId) &&
      meetId > 0 &&
      Number.isSafeInteger(swimmerId) &&
      swimmerId > 0,
  });

  return (
    <AppShell>
      <Link
        to="/event/$id"
        params={{ id }}
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Kejuaraan
      </Link>
      {isPending ? (
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      ) : error || !data ? (
        <ResourceQueryError error={error} retry={() => refetch()} />
      ) : (
        <>
          <header className="mb-6 rounded-2xl bg-card p-5 shadow-border">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Hari lomba · {data.swimmer.name}
            </p>
            <h1 className="font-display mt-2 text-3xl sm:text-4xl">{data.meet.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatDateId(data.meet.startDate, "d MMMM yyyy")}
              {data.meet.endDate && data.meet.endDate !== data.meet.startDate
                ? ` – ${formatDateId(data.meet.endDate, "d MMMM yyyy")}`
                : ""}
              {data.meet.venue ? ` · ${data.meet.venue}` : ""}
              {data.meet.city ? `, ${data.meet.city}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Badge>{labelOf(MEET_STATUSES, data.meet.status)}</Badge>
              <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
                <RefreshCw className="size-4" /> Muat ulang
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Bagan seri dapat berubah. Muat ulang untuk melihat catatan terbaru dari klub; hasil
              hanya tampil setelah dicatat sebagai hasil resmi.
            </p>
            {data.meet.status === "batal" && (
              <p className="mt-3 rounded-xl bg-muted p-3 text-sm font-medium">
                Kejuaraan dibatalkan. Bagan seri berikut hanya arsip, bukan jadwal untuk berangkat.
              </p>
            )}
          </header>
          {data.races.length === 0 ? (
            <section className="rounded-2xl bg-card p-5 shadow-border">
              <h2 className="font-display text-2xl">Nomor lomba</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Belum ada nomor aktif untuk perenang ini di kejuaraan tersebut.
              </p>
            </section>
          ) : (
            <section className="grid gap-4">
              <h2 className="font-display text-2xl">Nomor lomba ({data.races.length})</h2>
              {data.races.map((race) => (
                <RaceCard
                  key={race.id}
                  race={race}
                  meet={data.meet}
                  canEdit={data.canEditHeatSheet}
                />
              ))}
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}

function RaceCard({
  race,
  meet,
  canEdit,
}: {
  race: RaceDay["races"][number];
  meet: RaceDay["meet"];
  canEdit: boolean;
}) {
  return (
    <article className="rounded-2xl bg-card p-5 shadow-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl">
            {eventCode(race.distanceM, race.stroke, meet.course)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {registrationLabels[race.registrationStatus]}
          </p>
        </div>
        {canEdit && <HeatSheetDialog race={race} meet={meet} />}
      </div>
      {race.registrationStatus !== "confirmed" && (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm">
          Keikutsertaan nomor ini belum dikonfirmasi panitia. Periksa status pendaftaran sebelum
          berangkat.
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Detail label="Seri" value={race.heat || "Belum ada bagan seri"} />
        <Detail
          label="Lintasan"
          value={race.lane == null ? "Belum ditentukan" : String(race.lane)}
        />
        <Detail
          label="Waktu lapor"
          value={
            race.reportDate && race.reportTime
              ? `${formatDateId(race.reportDate, "d MMM yyyy")} · ${race.reportTime}`
              : "Belum diumumkan"
          }
        />
      </div>
      <div className="mt-4 rounded-xl border border-border p-4">
        <h4 className="font-semibold">Pemanasan</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {race.warmupNote || "Belum ada instruksi pemanasan dari pelatih."}
        </p>
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <h4 className="font-semibold">Hasil resmi</h4>
        {race.officialResults.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Belum ada hasil resmi yang tercatat.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {race.officialResults.map((result) => (
              <li
                key={result.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  {labelOf(RESULT_ROUNDS, result.round ?? "timed_final")} ·{" "}
                  {formatDateId(result.resultDate)} · {labelOf(RESULT_STATUSES, result.status)}
                </span>
                <strong className="font-mono tabular-nums">
                  {result.status === "selesai" && result.timeMs != null
                    ? formatTime(result.timeMs)
                    : "—"}
                  {result.place != null ? ` · #${result.place}` : ""}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function HeatSheetDialog({
  race,
  meet,
}: {
  race: RaceDay["races"][number];
  meet: RaceDay["meet"];
}) {
  const [open, setOpen] = useState(false);
  const [heat, setHeat] = useState(race.heat ?? "");
  const [lane, setLane] = useState(race.lane == null ? "" : String(race.lane));
  const [reportDate, setReportDate] = useState(race.reportDate ?? "");
  const [reportTime, setReportTime] = useState(race.reportTime ?? "");
  const [warmupNote, setWarmupNote] = useState(race.warmupNote ?? "");
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      saveRaceDayHeatSheet({
        data: {
          meetId: meet.id,
          entryId: race.id,
          expectedRevision: race.heatSheetRevision,
          heat: heat.trim() || null,
          lane: lane ? Number(lane) : null,
          reportDate: reportDate || null,
          reportTime: reportTime || null,
          warmupNote: warmupNote.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Bagan seri tersimpan");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["race-day", meet.id] });
      await qc.invalidateQueries({ queryKey: ["meet", meet.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setHeat(race.heat ?? "");
          setLane(race.lane == null ? "" : String(race.lane));
          setReportDate(race.reportDate ?? "");
          setReportTime(race.reportTime ?? "");
          setWarmupNote(race.warmupNote ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Ubah bagan seri</Button>
      </DialogTrigger>
      <DialogContent
        title={`Bagan seri ${eventCode(race.distanceM, race.stroke, meet.course)}`}
        description="Isi dari bagan resmi panitia. Wali hanya dapat melihat hasilnya."
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Seri">
            <Input
              value={heat}
              maxLength={60}
              onChange={(event) => setHeat(event.target.value)}
              placeholder="Contoh: Seri 3"
            />
          </Field>
          <Field label="Lintasan">
            <Input
              type="number"
              min={1}
              max={30}
              value={lane}
              onChange={(event) => setLane(event.target.value)}
            />
          </Field>
          <Field label="Tanggal lapor">
            <Input
              type="date"
              min={meet.startDate}
              max={meet.endDate ?? meet.startDate}
              value={reportDate}
              onChange={(event) => setReportDate(event.target.value)}
            />
          </Field>
          <Field label="Jam lapor (waktu setempat)">
            <Input
              type="time"
              value={reportTime}
              onChange={(event) => setReportTime(event.target.value)}
            />
          </Field>
          <Field label="Instruksi pemanasan">
            <Textarea
              value={warmupNote}
              maxLength={1000}
              onChange={(event) => setWarmupNote(event.target.value)}
              placeholder="Contoh: Pemanasan di kolam latihan pukul 07.00"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Tanggal dan jam lapor harus diisi bersama. Kosongkan keduanya jika panitia belum
            mengumumkan waktu.
          </p>
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <Button type="submit" disabled={save.isPending}>
            Simpan bagan seri
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
