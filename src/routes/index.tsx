import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarDays, Trophy, Users, Waves } from "lucide-react";
import { getDashboard } from "@/lib/server/fns";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LoginScreen, Splash } from "@/components/auth/login-screen";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { SwimmerAvatar } from "@/components/swim/mark";
import { Badge } from "@/components/ui/badge";
import { eventCode, labelOf, MEET_LEVELS, PRACTICE_KINDS } from "@/lib/swim/constants";
import { formatTime } from "@/lib/swim/time";
import { formatDateId, greetingId } from "@/lib/utils";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id } : null;
});

export const Route = createFileRoute("/")({
  loader: () => fetchSessionUser(),
  component: Home,
});

function Home() {
  const ssrUser = Route.useLoaderData();
  const { user, isPending } = useCurrentUserState();
  if (user) return <Dashboard />;
  if (ssrUser && isPending) return <Splash label="Memuat dasbor…" />;
  if (isPending && !ssrUser) return <LoginScreen />;
  return <LoginScreen />;
}

function Dashboard() {
  const { data, isPending, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard(),
  });

  return (
    <AppShell>
      {isPending ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Memuat dasbor klub…</p>
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        </div>
      ) : error || !data ? (
        <p className="text-sm text-destructive">Gagal memuat dasbor.</p>
      ) : (
        <DashboardView data={data} />
      )}
    </AppShell>
  );
}

function DashboardView({ data }: { data: Awaited<ReturnType<typeof getDashboard>> }) {
  const { club, swimmers, upcomingPractices, upcomingMeets, recentPbs, stats } = data;
  return (
    <div>
      <PageHeader kicker="Klub" title={`${greetingId()}.`} description={`${club.name} · ${club.city}, ${club.province}. Pelatih ${club.coachName}.`} />
      <section className="rise-in relative mb-6 overflow-hidden rounded-2xl">
        <img src="/images/pool.jpg" alt="" className="h-44 w-full object-cover md:h-56" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgb(6_16_24/0.92))]" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
          <div>
            <p className="font-display text-3xl leading-none md:text-4xl">BMSC Klaten</p>
            <p className="mt-1 text-sm text-foam">{club.motto}</p>
          </div>
          <img src="/images/crest.jpg" alt="" className="hidden size-16 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/20 sm:block" />
        </div>
      </section>
      <section className="rise-in rise-in-2 mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Perenang aktif" value={String(stats.swimmerCount)} />
        <Stat icon={Waves} label="Latihan bulan ini" value={String(stats.practicesThisMonth)} />
        <Stat icon={Trophy} label="Volume 7 hari" value={`${(stats.volumeThisWeek / 1000).toFixed(1)} km`} />
        <Stat icon={CalendarDays} label="Kehadiran 30 hari" value={`${stats.attendanceRate}%`} />
      </section>
      <section className="mb-8">
        <SectionHead title="Skuad" to="/perenang" />
        <div className="grid gap-3 sm:grid-cols-3">
          {swimmers.map((s) => (
            <Link key={s.id} to="/perenang/$id" params={{ id: String(s.id) }} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-border transition-transform duration-150 hover:-translate-y-0.5">
              <SwimmerAvatar name={s.fullName} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.nickname ?? s.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{s.fullName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone="pool">{s.ageGroupLabel}</Badge>
                  <span className="text-xs text-muted-foreground">{s.age} th · {s.gender}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHead title="Latihan berikutnya" to="/latihan" />
          <div className="grid gap-2">
            {upcomingPractices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada sesi terjadwal.</p>
            ) : upcomingPractices.map((p) => (
              <Link key={p.id} to="/latihan/$id" params={{ id: String(p.id) }} className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 shadow-border">
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateId(p.sessionDate, "EEEE, d MMM")} · {p.startTime ?? "—"} · {labelOf(PRACTICE_KINDS, p.kind)}</p>
                </div>
                <span className="font-mono text-sm tabular-nums text-primary">{p.totalMeters.toLocaleString("id-ID")} m</span>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <SectionHead title="Event mendatang" to="/event" />
          <div className="grid gap-2">
            {upcomingMeets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada kejuaraan.</p>
            ) : upcomingMeets.map((m) => (
              <Link key={m.id} to="/event/$id" params={{ id: String(m.id) }} className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 shadow-border">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateId(m.startDate, "d MMM")} · {m.city} · {labelOf(MEET_LEVELS, m.level)}</p>
                </div>
                <Badge tone="pool">{m.course === "50" ? "LP 50m" : "SC 25m"}</Badge>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <section className="mt-8">
        <SectionHead title="Rekor pribadi terbaru" to="/perenang" />
        <div className="overflow-hidden rounded-2xl bg-card shadow-border">
          {recentPbs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Belum ada PB tercatat.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentPbs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.swimmerName}</p>
                    <p className="text-xs text-muted-foreground">{eventCode(r.distanceM, r.stroke, r.course)} · {formatDateId(r.resultDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm tabular-nums text-primary">{formatTime(r.timeMs)}</p>
                    <p className="text-xs font-semibold tracking-wide text-foam uppercase">PB</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-border">
      <Icon className="mb-3 size-4 text-primary" />
      <p className="font-display text-3xl tabular-nums leading-none">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SectionHead({ title, to }: { title: string; to: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-display text-2xl">{title}</h2>
      <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Lihat semua <ArrowUpRight className="size-3.5" /></Link>
    </div>
  );
}
