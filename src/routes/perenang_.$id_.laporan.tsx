import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Link2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ResourceQueryError } from "@/components/ui/query-error";
import { getMonthlySwimmerReport } from "@/lib/server/fns";
import { eventCode } from "@/lib/swim/constants";
import { formatTime } from "@/lib/swim/time";
import { formatDateId, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/perenang_/$id_/laporan")({
  validateSearch: (search: Record<string, unknown>) => ({
    bulan: typeof search.bulan === "string" ? search.bulan : undefined,
  }),
  component: MonthlyReportPage,
});

function MonthlyReportPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const swimmerId = Number(id);
  const month = search.bulan ?? todayIso().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(month);
  useEffect(() => setSelectedMonth(month), [month]);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["monthly-swimmer-report", swimmerId, month],
    queryFn: () => getMonthlySwimmerReport({ data: { id: swimmerId, month } }),
    enabled: Number.isSafeInteger(swimmerId) && swimmerId > 0,
  });

  return (
    <AppShell>
      <Link
        to="/perenang/$id"
        params={{ id }}
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Profil perenang
      </Link>
      <header className="mb-6 rounded-2xl bg-card p-5 shadow-border">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Untuk wali</p>
        <h1 className="font-display mt-2 text-3xl sm:text-4xl">
          Laporan bulanan{data ? ` · ${data.swimmerName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ringkasan dari catatan akhir klub untuk satu perenang dan satu bulan kalender.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Bulan
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="mt-1 block h-11 rounded-xl border border-border bg-background px-3"
            />
          </label>
          <button
            type="button"
            className="h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
            onClick={() =>
              void navigate({
                to: "/perenang/$id/laporan",
                params: { id },
                search: { bulan: selectedMonth },
              })
            }
          >
            Tampilkan
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm"
            onClick={async () => {
              try {
                const url = new URL(window.location.href);
                url.searchParams.set("bulan", month);
                await navigator.clipboard.writeText(url.toString());
                toast.success("Tautan laporan disalin");
              } catch {
                toast.error("Tidak dapat menyalin tautan");
              }
            }}
          >
            <Link2 className="size-4" /> Salin tautan
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Tautan hanya dapat dibuka oleh akun yang punya akses ke perenang ini.
        </p>
      </header>
      {isPending ? (
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      ) : error || !data ? (
        <ResourceQueryError error={error} retry={() => refetch()} />
      ) : (
        <>
          <h2 className="font-display mb-3 text-2xl">
            {formatDateId(`${data.month}-01`, "MMMM yyyy")}
          </h2>
          <div className="mb-2 grid gap-3 sm:grid-cols-3">
            <Metric label="Hadir" value={`${data.attended} sesi`} />
            <Metric label="Tidak hadir" value={`${data.missed} sesi`} />
            <Metric
              label="Jarak selesai tercatat"
              value={`${data.meters.toLocaleString("id-ID")} m`}
            />
          </div>
          <p className="mb-6 text-xs text-muted-foreground">
            Dari latihan yang diselesaikan pelatih.{" "}
            {data.unrecorded > 0 ? `${data.unrecorded} sesi belum memiliki kehadiran akhir. ` : ""}
            Jarak hanya dihitung saat hadir dan meter selesai dicatat ({
              data.metersRecordedSessions
            }{" "}
            sesi).
          </p>
          <section className="mb-6 rounded-2xl bg-card p-5 shadow-border">
            <h2 className="font-display text-2xl">Waktu resmi</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Waktu terbaik bulan ini dibandingkan dengan nomor dan panjang kolam yang sama pada
              bulan sebelumnya.
            </p>
            {data.officialTimes.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Belum ada waktu resmi selesai pada bulan ini.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {data.officialTimes.map((result) => {
                  const delta =
                    result.previousTimeMs == null ? null : result.previousTimeMs - result.timeMs;
                  return (
                    <li
                      key={`${result.stroke}-${result.distanceM}-${result.course}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <div>
                        <strong>{eventCode(result.distanceM, result.stroke, result.course)}</strong>
                        <p className="text-muted-foreground">
                          {delta == null
                            ? "Belum ada pembanding bulan lalu"
                            : delta > 0
                              ? `Lebih cepat ${formatTime(delta)} dari bulan lalu`
                              : delta < 0
                                ? `Lebih lambat ${formatTime(-delta)} dari bulan lalu`
                                : "Sama dengan bulan lalu"}
                        </p>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <span className="text-primary">{formatTime(result.timeMs)}</span>
                        <p className="text-xs text-muted-foreground">
                          Bulan lalu:{" "}
                          {result.previousTimeMs == null ? "—" : formatTime(result.previousTimeMs)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="rounded-2xl bg-card p-5 shadow-border">
            <h2 className="font-display text-2xl">Catatan pelatih yang dibagikan</h2>
            {data.feedback.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Belum ada catatan yang dibagikan pada bulan ini.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {data.feedback.map((note) => (
                  <li key={note.id} className="rounded-xl border border-border p-4 text-sm">
                    <p className="font-medium">
                      {note.practiceTitle} · {formatDateId(note.practiceDate)}
                    </p>
                    {note.focus && (
                      <p className="mt-2">
                        <strong>Fokus:</strong> {note.focus}
                      </p>
                    )}
                    {note.improvement && (
                      <p className="mt-2">
                        <strong>Perkembangan:</strong> {note.improvement}
                      </p>
                    )}
                    {note.nextStep && (
                      <p className="mt-2">
                        <strong>Langkah berikut:</strong> {note.nextStep}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-border">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display mt-2 text-3xl">{value}</p>
    </div>
  );
}
