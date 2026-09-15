import { registrationLabels } from "@/lib/swim/registration";
import { useAccess } from "@/lib/club/use-access";
import { canWriteRoster, canDeleteSwimmer } from "@/lib/club/permissions";
import { ResourceQueryError } from "@/components/ui/query-error";
import { DeleteButton } from "@/components/ui/delete-button";
import { ResultList } from "@/components/swim/result-list";
import { ResultDialog } from "@/components/swim/result-dialog";
import { progressSeries, progressDescription } from "@/lib/swim/progress";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft } from "lucide-react";
import { deleteResult, deleteSwimmer, getSwimmer } from "@/lib/server/fns";
import { AppShell } from "@/components/layout/app-shell";
import { SwimmerAvatar } from "@/components/swim/mark";
import { Badge } from "@/components/ui/badge";
import { SelectNative } from "@/components/ui/input";
import { SwimmerDialog } from "./perenang";
import { eventCode } from "@/lib/swim/constants";
import { formatTime } from "@/lib/swim/time";
import { formatDateId } from "@/lib/utils";
import { CoachFeedbackJournal } from "@/components/swim/coach-feedback-journal";

export const Route = createFileRoute("/perenang_/$id")({ component: Page });

function Page() {
  const { hats } = useAccess();
  const swimmerId = Number(Route.useParams().id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["swimmer", swimmerId],
    queryFn: () => getSwimmer({ data: { id: swimmerId } }),
    enabled: Number.isFinite(swimmerId),
  });
  const del = useMutation({
    mutationFn: () => deleteSwimmer({ data: { id: swimmerId } }),
    onSuccess: async () => {
      toast.success("Perenang dihapus");
      await qc.invalidateQueries();
      void nav({ to: "/perenang" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!Number.isSafeInteger(swimmerId) || swimmerId < 1)
    return (
      <AppShell>
        <p>Perenang tidak ditemukan.</p>
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
  const { swimmer, results, pbs, attendance, attendanceHistory, totalMeters, upcomingEntries, feedback, feedbackPractices } = data;
  return (
    <AppShell>
      <Link
        to="/perenang"
        className="mb-4 inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Skuad
      </Link>
      <div className="mb-6 flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-border sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <SwimmerAvatar name={swimmer.fullName} size="lg" />
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              {swimmer.ageGroupLabel} · {swimmer.gender}
            </p>
            <h1 className="font-display text-4xl leading-none">{swimmer.fullName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatDateId(swimmer.dateOfBirth, "d MMMM yyyy")} · {swimmer.age} tahun · KU{" "}
              {swimmer.ageYearEnd} th di {new Date().getFullYear()}
            </p>
            {swimmer.notes ? <p className="mt-3 max-w-xl text-sm">{swimmer.notes}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ResultDialog swimmerId={swimmer.id} />
          {canWriteRoster(hats, swimmer.id) && (
            <SwimmerDialog initial={swimmer} variant="outline" />
          )}
          {canDeleteSwimmer(hats) && (
            <DeleteButton
              label="Hapus perenang"
              description={`Profil, kehadiran, dan hasil ${swimmer.fullName} akan dihapus.`}
              onDelete={() => del.mutateAsync()}
            />
          )}
        </div>
      </div>
      <ProfileSummary attendance={attendance} totalMeters={totalMeters} pbs={pbs} />
      {upcomingEntries.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-display mb-3 text-2xl">Pendaftaran kejuaraan</h2>
          <ul className="grid gap-2">
            {upcomingEntries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-border"
              >
                <div>
                  <Link to="/event/$id" params={{ id: String(e.meetId) }} className="font-medium underline">{e.meetName}</Link>
                  <p className="text-sm">{registrationLabels[e.registrationStatus]}</p>
                  {e.registrationReason && <p className="text-sm text-muted-foreground">{e.registrationReason}</p>}
                  <p className="text-xs text-muted-foreground">
                    {eventCode(e.distanceM, e.stroke)} · {e.ageGroup} · seed{" "}
                    {formatTime(e.seedTimeMs)}
                  </p>
                </div>
                <Badge>{formatDateId(e.startDate, "d MMM")}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-2">
          <h2 className="font-display mb-3 text-2xl">Rekor pribadi (Personal Best)</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Waktu terbaik dari hasil resmi dan tes latihan. Bandingkan sumber yang sama pada grafik.
          </p>
          <div className="overflow-hidden rounded-2xl bg-card shadow-border">
            {pbs.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Belum ada catatan waktu selesai.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Nomor</th>
                    <th className="px-4 py-2 font-medium">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pbs.map((p) => (
                    <tr key={`${p.stroke}-${p.distanceM}-${p.course}`}>
                      <td className="px-4 py-2.5">
                        {eventCode(p.distanceM, p.stroke, p.course)}
                        <div className="text-xs text-muted-foreground">
                          {formatDateId(p.resultDate)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-primary">
                        {formatTime(p.timeMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <section className="lg:col-span-3">
          <ProgressChart results={results} />
        </section>
      </div>
      <section className="mt-6">
        <h2 className="font-display mb-3 text-2xl">Riwayat waktu</h2>
        <ResultTable results={results} />
      </section>
      <CoachFeedbackJournal
        swimmerId={swimmer.id}
        feedback={feedback}
        practices={feedbackPractices}
        canCreate={hats.staff != null}
      />
      <details className="mt-6 rounded-2xl bg-card shadow-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <span className="font-display text-xl">Riwayat kehadiran</span>
          <span className="text-sm text-muted-foreground">
            {attendanceHistory?.length ?? 0} sesi
          </span>
        </summary>
        <div className="border-t border-border px-5 py-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Izin wali tidak mengubah persentase kehadiran. Angka ini hanya dari catatan akhir pelatih.
          </p>
          {!attendanceHistory?.length ? (
            <p className="text-sm text-muted-foreground">Belum ada sesi.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Tanggal</th>
                    <th className="py-2 pr-4 font-medium">Sesi</th>
                    <th className="py-2 pr-4 font-medium">Izin wali</th>
                    <th className="py-2 pr-4 font-medium">Kehadiran akhir</th>
                    <th className="py-2 pr-4 font-medium">Jarak</th>
                    <th className="py-2 font-medium">Koreksi</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceHistory.map((row) => (
                    <tr key={row.attendanceId} className="border-t border-border">
                      <td className="py-2 pr-4">{formatDateId(row.sessionDate, "d MMM yyyy")}</td>
                      <td className="py-2 pr-4">
                        <Link to="/latihan/$id" params={{ id: String(row.practiceId) }} className="text-primary hover:underline">
                          {row.title}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {row.noticeKind
                          ? `${row.noticeKind}${row.noticeStatus === "withdrawn" ? " (dibatalkan)" : ""}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">{row.status}</td>
                      <td className="py-2 pr-4">
                        {row.metersCompleted != null ? `${row.metersCompleted} m` : "—"}
                      </td>
                      <td className="py-2">
                        {row.correctionStatus
                          ? `${row.correctionStatus}${row.correctionResolution ? ` — ${row.correctionResolution}` : ""}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </AppShell>
  );
}

function ProfileSummary({
  attendance,
  totalMeters,
  pbs,
}: {
  attendance: Awaited<ReturnType<typeof getSwimmer>>["attendance"];
  totalMeters: number;
  pbs: Awaited<ReturnType<typeof getSwimmer>>["pbs"];
}) {
  const latestPb = pbs.reduce<(typeof pbs)[number] | null>(
    (best, p) => (!best || p.resultDate > best.resultDate ? p : best),
    null,
  );
  return (
    <div className="mb-6 rounded-2xl bg-card p-4 shadow-border">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">Kehadiran</span>
        <span className="font-mono font-semibold tabular-nums">
          {attendance.total ? `${attendance.rate}%` : "—"}
        </span>
        <span className="text-muted-foreground">
          ({attendance.present}/{attendance.total})
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">Volume</span>
        <span className="font-mono font-semibold tabular-nums">
          {(totalMeters / 1000).toFixed(1)} km
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">PB tercatat</span>
        <span className="font-mono font-semibold tabular-nums">{pbs.length}</span>
        <span className="text-muted-foreground">nomor</span>
      </p>
      {latestPb ? (
        <p className="mt-2 text-sm">
          PB terbaru:{" "}
          <span className="font-semibold">
            {eventCode(latestPb.distanceM, latestPb.stroke, latestPb.course)}
          </span>{" "}
          <span className="font-mono tabular-nums text-primary">
            {formatTime(latestPb.timeMs)}
          </span>{" "}
          <span className="text-muted-foreground">
            · {formatDateId(latestPb.resultDate)}
          </span>
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Izin wali tidak mengubah persentase kehadiran; kehadiran akhir pelatih di Riwayat kehadiran.
      </p>
    </div>
  );
}

function ProgressChart({
  results,
}: {
  results: Awaited<ReturnType<typeof getSwimmer>>["results"];
}) {
  const options = useMemo(() => {
    const map = new Map<
      string,
      { stroke: string; distanceM: number; course: string; kind: "official" | "test"; n: number }
    >();
    for (const r of results) {
      if (r.timeMs == null || r.timeMs <= 0 || r.status !== "selesai") continue;
      const k = `${r.stroke}-${r.distanceM}-${r.course}-${r.kind}`;
      map.set(k, {
        stroke: r.stroke,
        distanceM: r.distanceM,
        course: r.course,
        kind: r.kind,
        n: (map.get(k)?.n ?? 0) + 1,
      });
    }
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [results]);
  const [key, setKey] = useState(() =>
    options[0]
      ? `${options[0].stroke}-${options[0].distanceM}-${options[0].course}-${options[0].kind}`
      : "",
  );
  const selected =
    options.find((o) => `${o.stroke}-${o.distanceM}-${o.course}-${o.kind}` === key) ?? options[0];
  const comparable = selected ? progressSeries(results, selected) : [];
  const series = comparable.map((r) => ({
    date: formatDateId(r.resultDate, "d MMM yyyy"),
    sec: r.timeMs! / 1000,
  }));
  return (
    <div className="rounded-2xl bg-card p-4 shadow-border">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-2xl">Tren prestasi</h2>
        {options.length > 0 ? (
          <SelectNative
            aria-label="Nomor dan sumber tren"
            className="sm:w-80"
            value={
              selected
                ? `${selected.stroke}-${selected.distanceM}-${selected.course}-${selected.kind}`
                : ""
            }
            onChange={(e) => setKey(e.target.value)}
          >
            {options.map((o) => (
              <option
                key={`${o.stroke}-${o.distanceM}-${o.course}-${o.kind}`}
                value={`${o.stroke}-${o.distanceM}-${o.course}-${o.kind}`}
              >
                {eventCode(o.distanceM, o.stroke, o.course)} ·{" "}
                {o.kind === "official" ? "Resmi" : "Tes"}
              </option>
            ))}
          </SelectNative>
        ) : null}
      </div>
      <p className="mb-3 text-sm font-semibold">{progressDescription(comparable)}</p>
      <p className="mb-3 text-sm text-muted-foreground">
        Waktu lebih cepat berada di atas. Grafik hanya memuat hasil selesai.
      </p>
      {series.length < 2 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Minimal dua catatan waktu pada nomor yang sama untuk grafik.
        </p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                reversed
                domain={["dataMin - 1", "dataMax + 1"]}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => formatTime(Math.round(v * 1000))}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  color: "var(--color-popover-foreground)",
                  border: "1px solid var(--color-input)",
                  borderRadius: 12,
                }}
                formatter={(v: number) => [formatTime(Math.round(v * 1000)), "Waktu"]}
              />
              <Line
                type="monotone"
                dataKey="sec"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ResultTable({ results }: { results: Awaited<ReturnType<typeof getSwimmer>>["results"] }) {
  const qc = useQueryClient();
  return (
    <ResultList
      results={results}
      onDelete={async (id) => {
        await deleteResult({ data: { id } });
        await qc.invalidateQueries();
      }}
    />
  );
}
