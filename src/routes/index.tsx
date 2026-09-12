import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, MapPin, Waves } from "lucide-react";
import { getDashboard } from "@/lib/server/fns";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LoginScreen, Splash } from "@/components/auth/login-screen";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { SwimmerAvatar } from "@/components/swim/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-error";
import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { eventCode } from "@/lib/swim/constants";
import { formatTime } from "@/lib/swim/time";
import { formatDateId, greetingId, todayIso } from "@/lib/utils";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id } : null;
});

export const Route = createFileRoute("/")({ loader: () => fetchSessionUser(), component: Home });

function Home() {
  const ssrUser = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  if (user) return <Dashboard />;
  if (ssrUser && isPending) return <Splash label="Memuat klub…" />;
  return <LoginScreen />;
}

function Dashboard() {
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  return (
    <AppShell>
      {query.isPending ? (
        <div role="status" className="h-64 animate-pulse rounded-2xl bg-muted">
          <p className="p-5">Memuat jadwal…</p>
        </div>
      ) : query.isError || !query.data ? (
        <QueryError retry={() => query.refetch()} />
      ) : (
        <DashboardView data={query.data} />
      )}
    </AppShell>
  );
}

function DashboardView({ data }: { data: Awaited<ReturnType<typeof getDashboard>> }) {
  const { hats } = useAccess();
  const { club, swimmers, upcomingPractices, upcomingMeets, recentPbs, unreadAnnouncements, stats } =
    data;
  const next = upcomingPractices[0];
  const staff = canWritePractice(hats);
  const guardian = hats.guardianSwimmerIds.length > 0;
  const family = swimmers.filter(
    (s) => hats.guardianSwimmerIds.includes(s.id) || s.id === hats.selfSwimmerId,
  );
  const featured = staff ? swimmers.slice(0, 6) : family;
  return (
    <div className="space-y-7">
      <PageHeader
        kicker={`${club.shortName} · ${club.city}`}
        title={greetingId()}
        description={formatDateId(todayIso(), "EEEE, d MMMM yyyy")}
      />
      {unreadAnnouncements.length > 0 ? (
        <section aria-labelledby="unread-posts" className="rounded-2xl border border-primary/30 bg-card p-5">
          <p id="unread-posts" className="text-sm font-semibold text-primary">
            {unreadAnnouncements.length === 1
              ? "1 pengumuman belum dibuka"
              : `${unreadAnnouncements.length} pengumuman belum dibuka`}
          </p>
          <ul className="mt-3 grid gap-2">
            {unreadAnnouncements.map((post) => (
              <li key={post.id}>
                <Link
                  to="/pengumuman/$id"
                  params={{ id: String(post.id) }}
                  className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="font-medium">
                    {post.important ? "Penting · " : ""}
                    {post.title}
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section
        aria-labelledby="next-session"
        className="rounded-2xl border border-primary/30 bg-card p-5 sm:p-6"
      >
        <div className="mb-3 flex items-center gap-2 text-primary">
          <Waves className="size-5" />
          <p id="next-session" className="text-sm font-semibold">
            {next?.sessionDate === todayIso() ? "Latihan hari ini" : "Latihan berikutnya"}
          </p>
        </div>
        {next ? (
          <>
            <h2 className="font-display text-3xl sm:text-4xl">{next.title}</h2>
            <p className="mt-3 flex items-center gap-2 text-sm">
              <CalendarDays className="size-4 shrink-0" />
              {formatDateId(next.sessionDate, "EEEE, d MMM")} ·{" "}
              {next.startTime || "Jam belum ditentukan"}
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" />
              {next.location || "Lokasi belum ditentukan"}
            </p>
            {next.focus && <p className="mt-3 text-sm text-muted-foreground">{next.focus}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link to="/latihan/$id" params={{ id: String(next.id) }}>
                  {staff ? "Catat kehadiran" : guardian ? "Kehadiran & izin anak" : "Lihat program"}
                  <ArrowRight />
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Rencana {next.totalMeters.toLocaleString("id-ID")} m
                {next.durationMin ? ` · ${next.durationMin} menit` : ""}
              </span>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl">Belum ada latihan terjadwal</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {staff
                ? "Siapkan sesi berikutnya untuk skuad."
                : "Jadwal berikutnya akan tampil setelah dibuat oleh pelatih."}
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/latihan">{staff ? "Jadwalkan latihan" : "Lihat riwayat latihan"}</Link>
            </Button>
          </>
        )}
        {staff && guardian && family.length > 0 && (
          <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
            Anda juga wali {family.map((s) => s.nickname || s.fullName).join(", ")}. Akses keluarga
            tersedia di profil perenang.
          </p>
        )}
      </section>
      <section>
        <SectionHead title="Kejuaraan mendatang" to="/event" />
        {!upcomingMeets.length ? (
          <p className="text-sm text-muted-foreground">Belum ada kejuaraan terjadwal.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingMeets.map((meet) => (
              <Link
                key={meet.id}
                to="/event/$id"
                params={{ id: String(meet.id) }}
                className="rounded-2xl bg-card p-4 shadow-border"
              >
                <p className="font-semibold">{meet.name}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatDateId(meet.startDate, "d MMM yyyy")} ·{" "}
                  {meet.city || meet.venue || "Lokasi menyusul"}
                </p>
                <p className="mt-2 text-sm">
                  Lihat nomor terdaftar <ArrowRight className="inline size-4" />
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section>
        <SectionHead title="Progres terbaru" to="/perenang" />
        <p className="mb-3 text-sm text-muted-foreground">
          PB adalah rekor pribadi terbaik untuk gaya, jarak, dan panjang kolam yang sama.
        </p>
        {!recentPbs.length ? (
          <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground">
            Belum ada rekor pribadi tercatat. Catatan waktu akan muncul di profil perenang.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl bg-card shadow-border">
            {recentPbs.map((result) => (
              <li key={result.id}>
                <Link
                  to="/perenang/$id"
                  params={{ id: String(result.swimmerId) }}
                  className="flex min-h-20 items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{result.swimmerName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {eventCode(result.distanceM, result.stroke, result.course)} ·{" "}
                      {formatDateId(result.resultDate)} ·{" "}
                      {result.kind === "official" ? "Resmi" : "Tes latihan"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-lg">{formatTime(result.timeMs)}</p>
                    <Badge tone="pool">Rekor pribadi</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <SectionHead
          title={staff ? "Skuad" : guardian ? "Anak saya" : "Profil saya"}
          to="/perenang"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((s) => (
            <Link
              key={s.id}
              to="/perenang/$id"
              params={{ id: String(s.id) }}
              className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-border"
            >
              <SwimmerAvatar name={s.fullName} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.nickname || s.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {s.ageGroupLabel} · {s.age} tahun
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      {staff && (
        <section aria-label="Ringkasan klub" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Perenang aktif klub" value={String(stats.swimmerCount)} />
          <Stat label="Sesi dijadwalkan bulan ini" value={String(stats.practicesThisMonth)} />
          <Stat
            label="Volume program klub · 7 hari"
            value={`${(stats.volumeThisWeek / 1000).toFixed(1)} km`}
          />
          <Stat
            label="Kehadiran tercatat klub · 30 hari"
            value={stats.attendanceRecorded ? `${stats.attendanceRate}%` : "—"}
          />
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="font-mono text-2xl">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
function SectionHead({ title, to }: { title: string; to: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-2xl">{title}</h2>
      <Link to={to} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold">
        Lihat semua <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
