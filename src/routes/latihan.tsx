import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { QueryError } from "@/components/ui/query-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Plus } from "lucide-react";
import { listPractices } from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRACTICE_STATUSES, labelOf } from "@/lib/swim/constants";
import type { Practice } from "@/lib/swim/types";
import { formatDateId, todayIso } from "@/lib/utils";
import { PracticeNavigation } from "@/components/practice/practice-navigation";

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
  const practices = useQuery({
    queryKey: ["practices", history ? "history" : "overview", page],
    queryFn: () => listPractices({ data: { view: history ? "history" : "overview", page } }),
  });
  const today = todayIso();
  const todayRows = history ? [] : (practices.data ?? []).filter((p) => p.sessionDate === today);
  const upcomingRows = history ? [] : (practices.data ?? []).filter((p) => p.sessionDate > today);

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
        action={canCreate ? <NewPracticeButton /> : undefined}
      />
      <PracticeNavigation active={history ? "history" : "today"} canManage={canCreate} />
      {practices.isPending ? (
        <LoadingCards />
      ) : practices.isError ? (
        <QueryError retry={() => practices.refetch()} />
      ) : history ? (
        <HistoryList rows={practices.data ?? []} page={page} />
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
  todayRows: Practice[];
  upcomingRows: Practice[];
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
              <TodayCard key={practice.id} practice={practice} canRecordAttendance={canCreate} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Tidak ada latihan hari ini"
            description={
              upcomingRows[0]
                ? `Latihan berikutnya ${formatDateId(upcomingRows[0].sessionDate, "EEEE, d MMMM")} pukul ${upcomingRows[0].startTime ?? "—"}.`
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
              <li key={practice.id} className="border-b border-border last:border-0">
                <Link
                  to="/latihan/$id"
                  params={{ id: String(practice.id) }}
                  className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{practice.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateId(practice.sessionDate, "EEEE, d MMM")} ·{" "}
                      {practice.startTime ?? "Jam belum ditentukan"}
                      {practice.location ? ` · ${practice.location}` : ""}
                    </p>
                  </div>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TodayCard({
  practice,
  canRecordAttendance,
}: {
  practice: Practice;
  canRecordAttendance: boolean;
}) {
  return (
    <article className="rounded-2xl bg-card p-5 shadow-border">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-card-title">{practice.title}</p>
            {practice.status !== "scheduled" ? (
              <Badge
                tone={
                  practice.status === "cancelled"
                    ? "warn"
                    : practice.status === "in_progress"
                      ? "pool"
                      : "muted"
                }
              >
                {labelOf(PRACTICE_STATUSES, practice.status)}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {practice.startTime ?? "Jam belum ditentukan"}
            {practice.durationMin ? `–${endTime(practice.startTime, practice.durationMin)}` : ""}
          </p>
          {practice.location ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{practice.location}</span>
            </p>
          ) : null}
          {practice.rosterCount ? (
            <p className="mt-3 text-sm">
              {practice.presentCount}/{practice.rosterCount} atlet hadir
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Daftar atlet belum disiapkan</p>
          )}
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link to="/latihan/$id" params={{ id: String(practice.id) }}>
            {canRecordAttendance ? "Buka absensi" : "Lihat kehadiran"}
          </Link>
        </Button>
      </div>
    </article>
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

export function NewPracticeButton() {
  return (
    <Button asChild>
      <Link to="/latihan/baru">
        <Plus />
        Tambah sesi khusus
      </Link>
    </Button>
  );
}
