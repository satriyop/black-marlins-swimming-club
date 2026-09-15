import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { QueryError } from "@/components/ui/query-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import {
  listClubScheduledTrainingDays,
  listPractices,
  openClubScheduledTrainingDay,
  saveClubPlannedAbsenceNotice,
  withdrawClubPlannedAbsenceNotice,
} from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import type { Practice } from "@/lib/swim/types";
import type { ScheduledTrainingDay } from "@/lib/club/series";
import { formatDateId, todayIso } from "@/lib/utils";
import { PracticeNavigation } from "@/components/practice/practice-navigation";
import { absenceCutoffLabel } from "@/lib/club/absence-window";
import { Field, Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";

type PracticeSearch = { view?: "history"; page?: number };

export const Route = createFileRoute("/latihan")({
  validateSearch: (search: Record<string, unknown>): PracticeSearch => ({
    view: search.view === "history" ? "history" : undefined,
    page:
      search.view === "history" && Number.isInteger(Number(search.page)) && Number(search.page) > 1
        ? Number(search.page)
        : undefined,
  }),
  component: Page,
});

function Page() {
  const { hats } = useAccess();
  const canCreate = canWritePractice(hats);
  const { view, page = 1 } = Route.useSearch();
  const history = view === "history";
  const historyQuery = useQuery({
    queryKey: ["practices", "history", page],
    queryFn: () => listPractices({ data: { view: "history", page } }),
    enabled: history,
  });
  const today = todayIso();
  const scheduleQuery = useQuery({
    queryKey: ["scheduled-training-days", today],
    queryFn: () => listClubScheduledTrainingDays({ data: { fromDate: today, days: 8 } }),
    enabled: !history,
  });
  const activeQuery = history ? historyQuery : scheduleQuery;
  const todayRows = history ? [] : (scheduleQuery.data ?? []).filter((row) => row.date === today);
  const upcomingRows = history ? [] : (scheduleQuery.data ?? []).filter((row) => row.date > today);

  return (
    <AppShell>
      <PageHeader
        kicker="Program"
        title="Latihan"
        description={
          history
            ? "Periksa sesi yang sudah berlalu."
            : "Buka sesi hari ini dan catat kehadiran atlet."
        }
      />
      <PracticeNavigation active={history ? "history" : "today"} canManage={canCreate} />
      {activeQuery.isPending ? (
        <LoadingCards />
      ) : activeQuery.isError ? (
        <QueryError retry={() => activeQuery.refetch()} />
      ) : history ? (
        <HistoryList rows={historyQuery.data ?? []} page={page} />
      ) : (
        <Overview
          today={today}
          todayRows={todayRows}
          upcomingRows={upcomingRows}
          canCreate={canCreate}
        />
      )}
    </AppShell>
  );
}

function Overview({
  today,
  todayRows,
  upcomingRows,
  canCreate,
}: {
  today: string;
  todayRows: ScheduledTrainingDay[];
  upcomingRows: ScheduledTrainingDay[];
  canCreate: boolean;
}) {
  return (
    <div className="grid gap-8">
      <section aria-labelledby="today-heading">
        <div className="mb-3">
          <h2 id="today-heading" className="text-section-title">
            Hari ini
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateId(today, "EEEE, d MMMM yyyy")}
          </p>
        </div>
        {todayRows.length ? (
          <div className="grid gap-3">
            {todayRows.map((practice) => (
              <TodayCard
                key={practice.scheduleId}
                trainingDay={practice}
                canRecordAttendance={canCreate}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Tidak ada latihan hari ini"
            description={
              upcomingRows[0]
                ? `Latihan berikutnya ${formatDateId(upcomingRows[0].date, "EEEE, d MMMM")} pukul ${upcomingRows[0].startTime ?? "—"}.`
                : "Belum ada sesi dalam tujuh hari ke depan."
            }
            action={
              canCreate ? (
                <Button asChild variant="outline">
                  <Link to="/latihan/jadwal">Atur jadwal</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </section>
      {upcomingRows.length ? (
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="mb-3 text-section-title">
            Tujuh hari ke depan
          </h2>
          <ul className="overflow-hidden rounded-2xl bg-card shadow-border">
            {upcomingRows.map((practice) => (
              <li
                key={`${practice.scheduleId}:${practice.date}`}
                className="border-b border-border last:border-0"
              >
                <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{practice.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateId(practice.date, "EEEE, d MMM")} ·{" "}
                      {practice.startTime ?? "Jam belum ditentukan"}
                      {practice.location ? ` · ${practice.location}` : ""}
                    </p>
                    {practice.focus || practice.totalMeters ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {practice.focus ? `Fokus: ${practice.focus}` : "Program latihan"}
                        {practice.totalMeters ? ` · ${practice.totalMeters.toLocaleString("id-ID")} m` : ""}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {practice.practiceStatus === "cancelled"
                      ? "Dibatalkan"
                      : practice.practiceStatus === "completed"
                        ? "Selesai"
                        : "Terjadwal"}
                  </span>
                </div>
                <PlannedAbsence trainingDay={practice} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TodayCard({
  trainingDay,
  canRecordAttendance,
}: {
  trainingDay: ScheduledTrainingDay;
  canRecordAttendance: boolean;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const open = useMutation({
    mutationFn: () =>
      openClubScheduledTrainingDay({
        data: { scheduleId: trainingDay.scheduleId, date: trainingDay.date },
      }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ["scheduled-training-days"] });
      await navigate({ to: "/latihan/$id", params: { id: String(id) } });
    },
  });
  return (
    <article className="rounded-2xl bg-card p-5 shadow-border">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-card-title">{trainingDay.title}</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {trainingDay.startTime ?? "Jam belum ditentukan"}
            {trainingDay.durationMin
              ? `–${endTime(trainingDay.startTime, trainingDay.durationMin)}`
              : ""}
          </p>
          {trainingDay.location ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{trainingDay.location}</span>
            </p>
          ) : null}
          {trainingDay.focus || trainingDay.totalMeters ? (
            <p className="mt-2 text-sm">
              {trainingDay.focus ? `Fokus: ${trainingDay.focus}` : "Program latihan"}
              {trainingDay.totalMeters ? ` · ${trainingDay.totalMeters.toLocaleString("id-ID")} m` : ""}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">
            {trainingDay.practiceStatus === "completed"
              ? "Latihan selesai"
              : trainingDay.practiceStatus === "cancelled"
                ? "Latihan dibatalkan"
                : trainingDay.practiceId
                  ? "Absensi sudah dibuka"
                  : "Absensi belum dibuka"}
          </p>
        </div>
        {trainingDay.practiceId ? (
          <Button asChild className="w-full sm:w-auto">
            <Link to="/latihan/$id" params={{ id: String(trainingDay.practiceId) }}>
              {trainingDay.practiceStatus === "completed" ||
              trainingDay.practiceStatus === "cancelled"
                ? "Lihat sesi"
                : canRecordAttendance
                  ? "Buka absensi"
                  : "Lihat kehadiran"}
            </Link>
          </Button>
        ) : canRecordAttendance ? (
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={open.isPending}
            onClick={() => open.mutate()}
          >
            {open.isPending ? "Membuka…" : "Buka absensi"}
          </Button>
        ) : null}
        {open.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {open.error.message}
          </p>
        ) : null}
      </div>
      <PlannedAbsence trainingDay={trainingDay} />
    </article>
  );
}

function PlannedAbsence({ trainingDay }: { trainingDay: ScheduledTrainingDay }) {
  if (trainingDay.practiceId != null || trainingDay.familySwimmers.length === 0) return null;
  const active = trainingDay.familySwimmers.filter(
    (swimmer) => swimmer.notice?.status === "active",
  ).length;
  if (!trainingDay.noticeEditable && active === 0) return null;
  return (
    <details className="border-t border-border px-4 py-3 text-sm">
      <summary className="min-h-11 cursor-pointer font-semibold text-primary">
        {active ? `${active} izin sudah dikirim` : "Laporkan izin anak"}
      </summary>
      <p className="mb-3 text-muted-foreground">
        {absenceCutoffLabel(trainingDay.date, trainingDay.startTime)}. Izin ini tidak mengganti
        catatan kehadiran akhir pelatih.
      </p>
      <div className="grid gap-4">
        {trainingDay.familySwimmers.map((swimmer) => (
          <PlannedAbsenceRow key={swimmer.id} trainingDay={trainingDay} swimmer={swimmer} />
        ))}
      </div>
    </details>
  );
}

function PlannedAbsenceRow({
  trainingDay,
  swimmer,
}: {
  trainingDay: ScheduledTrainingDay;
  swimmer: ScheduledTrainingDay["familySwimmers"][number];
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState(swimmer.notice?.reason ?? "");
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["scheduled-training-days"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: (kind: "izin" | "sakit") =>
      saveClubPlannedAbsenceNotice({
        data: {
          scheduleId: trainingDay.scheduleId,
          date: trainingDay.date,
          swimmerId: swimmer.id,
          kind,
          reason,
        },
      }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const withdraw = useMutation({
    mutationFn: () =>
      withdrawClubPlannedAbsenceNotice({
        data: {
          scheduleId: trainingDay.scheduleId,
          date: trainingDay.date,
          swimmerId: swimmer.id,
        },
      }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-semibold">{swimmer.name}</p>
      {swimmer.notice?.status === "active" ? (
        <p className="mt-1 text-muted-foreground">
          Izin terkirim: {swimmer.notice.kind}
          {swimmer.notice.reason ? ` · ${swimmer.notice.reason}` : ""}
        </p>
      ) : null}
      {trainingDay.noticeEditable ? (
        <div className="mt-2 grid gap-2">
          <Field label={`Alasan untuk ${swimmer.name} (opsional)`}>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={save.isPending || withdraw.isPending}
              onClick={() => save.mutate("izin")}
            >
              Izin
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={save.isPending || withdraw.isPending}
              onClick={() => save.mutate("sakit")}
            >
              Sakit
            </Button>
            {swimmer.notice?.status === "active" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={save.isPending || withdraw.isPending}
                onClick={() => withdraw.mutate()}
              >
                Batalkan izin
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-muted-foreground">Batas waktu izin sudah lewat.</p>
      )}
    </div>
  );
}

function HistoryList({ rows, page }: { rows: Practice[]; page: number }) {
  if (!rows.length && page === 1)
    return (
      <EmptyState
        title="Belum ada riwayat"
        description="Sesi yang sudah berlalu akan tampil di sini."
      />
    );
  return (
    <section aria-labelledby="history-heading">
      <div className="mb-3">
        <h2 id="history-heading" className="text-section-title">
          Riwayat latihan
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          20 sesi per halaman, terbaru lebih dulu.
        </p>
      </div>
      {rows.length ? (
        <ul className="overflow-hidden rounded-2xl bg-card shadow-border">
          {rows.map((practice) => (
            <li key={practice.id} className="border-b border-border last:border-0">
              <Link
                to="/latihan/$id"
                params={{ id: String(practice.id) }}
                className="grid min-h-16 gap-2 px-4 py-3 hover:bg-muted sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <p className="text-sm tabular-nums text-muted-foreground">
                  {formatDateId(practice.sessionDate, "d MMM yyyy")} · {practice.startTime ?? "—"}
                </p>
                <div className="min-w-0">
                  <p className="font-medium">{practice.title}</p>
                  {practice.location ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {practice.location}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {practice.rosterCount
                    ? `${practice.presentCount}/${practice.rosterCount} hadir`
                    : "Belum ada absensi"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Halaman ini kosong"
          description="Kembali ke halaman riwayat sebelumnya."
        />
      )}
      <div className="mt-4 flex justify-between gap-2">
        {page > 1 ? (
          <Button asChild variant="outline">
            <Link
              to="/latihan"
              search={{ view: "history", page: page === 2 ? undefined : page - 1 }}
            >
              ← Sebelumnya
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {rows.length === 20 ? (
          <Button asChild variant="outline">
            <Link to="/latihan" search={{ view: "history", page: page + 1 }}>
              Berikutnya →
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}

function endTime(startTime: string | null, durationMin: number): string {
  if (!startTime) return "";
  const [hours, minutes] = startTime.split(":").map(Number);
  const total = hours! * 60 + minutes! + durationMin;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
