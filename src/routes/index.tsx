import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { dismissClubOnboarding, getDashboard } from "@/lib/server/fns";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { LoginScreen, Splash } from "@/components/auth/login-screen";
import { AppShell } from "@/components/layout/app-shell";
import { SwimmerAvatar } from "@/components/swim/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccess } from "@/lib/club/use-access";
import { isFamilyMember } from "@/lib/club/hats";
import { homePracticeCta, isDualRole, roleLabels } from "@/lib/club/nav";
import { eventCode, labelOf, MEET_STATUSES } from "@/lib/swim/constants";
import { progressDescription, progressSeries } from "@/lib/swim/progress";
import { formatTime } from "@/lib/swim/time";
import type { Dashboard, Meet, Practice, Result, Swimmer } from "@/lib/swim/types";
import { formatDateId, greetingId, todayIso } from "@/lib/utils";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id } : null;
});

function deadlineLabel(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

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
        <div role="status" className="grid gap-4">
          <div className="h-16 animate-pulse rounded-2xl bg-muted" />
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
          <div className="h-40 animate-pulse rounded-2xl bg-muted">
            <p className="p-5">Memuat jadwal…</p>
          </div>
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
  const { hats, taskView, welcomeDismissed, newGrants } = useAccess();
  const {
    club,
    swimmers,
    upcomingPractices,
    nextScheduledTraining,
    noticePractices,
    upcomingMeets,
    recentResults,
    unreadAnnouncements,
    unreadCount,
    stats,
  } = data;
  const clubView = taskView === "club";
  const actionablePractices = clubView
    ? upcomingPractices
    : upcomingPractices.filter((practice) => practice.sessionDate >= todayIso());
  const scheduledPractice = actionablePractices.find(
    (practice) => practice.id === nextScheduledTraining?.practiceId,
  );
  const scheduledCandidate = scheduledPractice ?? nextScheduledTraining;
  const standalone = actionablePractices.find(
    (practice) => !nextScheduledTraining || practice.id !== nextScheduledTraining.practiceId,
  );
  const next =
    !scheduledCandidate ||
    (standalone &&
      `${standalone.sessionDate}T${standalone.startTime ?? "00:00"}` <
        `${nextScheduledTraining!.date}T${nextScheduledTraining!.startTime ?? "00:00"}`)
      ? standalone
      : scheduledCandidate;
  const guardian = isFamilyMember(hats);
  const dual = isDualRole(hats);
  const practiceCta = homePracticeCta(hats, taskView);
  const family = swimmers.filter(
    (s) => hats.guardianSwimmerIds.includes(s.id) || s.id === hats.selfSwimmerId,
  );
  const cancelled = noticePractices.filter((p) => p.status === "cancelled");
  const completed = noticePractices.filter((p) => p.status === "completed");
  const important = unreadAnnouncements.filter((p) => p.important);
  const showWelcome = !welcomeDismissed || newGrants.length > 0;
  return (
    <div className="grid max-w-full min-w-0 gap-6">
      <header className="min-w-0 [overflow-wrap:anywhere]">
        <p className="text-sm font-semibold text-primary">
          {club.shortName} · {club.city}
        </p>
        <h1 className="text-section-title mt-1 text-foreground">Hari ini</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {greetingId()} · {formatDateId(todayIso(), "EEEE, d MMMM yyyy")}
          {roleLabels(hats).length ? ` · ${roleLabels(hats).join(", ")}` : ""}
        </p>
      </header>

      {showWelcome ? (
        <WelcomeCard
          clubName={club.name}
          family={family}
          grants={newGrants}
          staffRole={guardian ? null : hats.staff}
        />
      ) : null}

      {cancelled.map((p) => (
        <UrgentNotice key={p.id} practice={p} />
      ))}

      {data.pendingAcknowledgementCount > 0 && (
        <section
          className="rounded-xl border border-border p-4"
          aria-label="Pengumuman perlu konfirmasi"
        >
          <p className="font-semibold">
            {data.pendingAcknowledgementCount} pengumuman perlu konfirmasi
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Membuka pengumuman belum berarti memberi konfirmasi.
          </p>
          <ul className="mt-2">
            {data.pendingAcknowledgements.slice(0, 3).map((post) => (
              <li key={post.id}>
                <Link
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
                  to="/pengumuman/$id"
                  params={{ id: String(post.id) }}
                >
                  {post.title}
                </Link>
              </li>
            ))}
          </ul>
          {data.pendingAcknowledgementCount > 3 && (
            <Link to="/pengumuman" className="inline-flex min-h-11 items-center text-sm underline">
              Lihat semua konfirmasi
            </Link>
          )}
        </section>
      )}
      {data.pendingRegistrationTasks.length > 0 && (
        <section
          className="rounded-xl border border-primary/30 bg-card p-4"
          aria-label="Pendaftaran perlu tindakan"
        >
          <h2 className="font-semibold">Pendaftaran perlu tindakan</h2>
          <ul className="mt-2 grid gap-2">
            {data.pendingRegistrationTasks.map((task) => (
              <li key={`${task.kind}:${task.meetId}:${task.swimmerName ?? "staff"}`}>
                <Link
                  className="block rounded-lg px-2 py-2 text-sm hover:bg-muted"
                  to="/event/$id"
                  params={{ id: String(task.meetId) }}
                >
                  <span className="block font-semibold text-primary">
                    {task.kind === "guardian_response"
                      ? `Tanggapi keikutsertaan ${task.swimmerName}`
                      : `Tinjau ${task.count} nomor menunggu persetujuan`}
                  </span>
                  <span className="block text-muted-foreground">
                    {task.meetName}
                    {task.kind === "guardian_response" && task.deadline
                      ? ` · sebelum ${deadlineLabel(task.deadline)} WIB`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {important.length > 0 || unreadCount > 0 ? (
        <NoticeSummary posts={unreadAnnouncements} unreadCount={unreadCount} />
      ) : null}

      {!clubView ? (
        <FamilyStrip family={family} canEnroll={guardian} />
      ) : dual && family.length > 0 ? (
        <FamilyShortcuts family={family} />
      ) : null}

      <NextPractice
        next={next}
        clubView={clubView}
        practiceCta={practiceCta}
        guardian={guardian}
        familyCount={family.length}
      />

      {completed.map((p) => (
        <CompletedNotice key={p.id} practice={p} />
      ))}

      <UpcomingMeets meets={upcomingMeets} />
      <ProgressBlock results={recentResults} familyView={!clubView} />

      {clubView ? <ClubStats stats={stats} /> : null}
    </div>
  );
}

function FamilyStrip({ family, canEnroll }: { family: Swimmer[]; canEnroll: boolean }) {
  return (
    <section aria-labelledby="family-heading" className="min-w-0">
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 id="family-heading" className="text-card-title min-w-0">
          Anak saya
        </h2>
        <Link to="/perenang" className="inline-flex min-h-11 items-center text-sm font-semibold">
          {family.length ? "Semua anak" : "Kelola"}
        </Link>
      </div>
      {family.length === 0 ? (
        canEnroll ? (
          <div className="grid gap-3 rounded-2xl border border-primary/40 bg-card p-4">
            <p className="text-base font-semibold">Belum ada anak terhubung</p>
            <p className="text-sm text-muted-foreground">
              Undangan sudah diterima. Daftarkan anak Anda untuk melihat latihan dan izin.
            </p>
            <Button asChild>
              <Link to="/perenang">
                Daftarkan anak
                <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada anak terhubung ke akun ini.</p>
        )
      ) : (
        <ul className="grid gap-2">
          {family.map((s) => (
            <li key={s.id}>
              <Link
                to="/perenang/$id"
                params={{ id: String(s.id) }}
                className="flex min-h-14 items-center gap-3 rounded-2xl bg-card px-3 py-2 shadow-border"
              >
                <SwimmerAvatar name={s.nickname || s.fullName} size="sm" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="block font-semibold">{s.nickname || s.fullName}</span>
                  {s.nickname ? (
                    <span className="block text-sm text-muted-foreground">{s.fullName}</span>
                  ) : (
                    <span className="block text-sm text-muted-foreground">{s.ageGroupLabel}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FamilyShortcuts({ family }: { family: Swimmer[] }) {
  return (
    <section aria-label="Anak saya" className="flex min-w-0 flex-wrap items-center gap-2">
      <p className="text-sm font-semibold">Anak saya</p>
      {family.map((s) => (
        <Link
          key={s.id}
          to="/perenang/$id"
          params={{ id: String(s.id) }}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input px-3 text-sm"
        >
          <SwimmerAvatar name={s.nickname || s.fullName} size="sm" />
          <span className="[overflow-wrap:anywhere]">{s.nickname || s.fullName}</span>
        </Link>
      ))}
    </section>
  );
}

function NextPractice({
  next,
  clubView,
  practiceCta,
  guardian,
  familyCount,
}: {
  next: Practice | Dashboard["nextScheduledTraining"] | undefined;
  clubView: boolean;
  practiceCta: ReturnType<typeof homePracticeCta>;
  guardian: boolean;
  familyCount: number;
}) {
  const scheduled = next != null && "scheduleId" in next;
  const date = next ? (scheduled ? next.date : next.sessionDate) : null;
  const today = date === todayIso();
  const overdue = date != null && date < todayIso();
  return (
    <section
      aria-labelledby="next-session"
      className="rounded-2xl border border-primary/30 bg-card p-4 sm:p-5"
    >
      <p id="next-session" className="text-sm font-semibold text-primary">
        {overdue ? "Latihan perlu dituntaskan" : today ? "Latihan hari ini" : "Latihan berikutnya"}
      </p>
      {next ? (
        <>
          <h2 className="text-section-title mt-1 [overflow-wrap:anywhere]">{next.title}</h2>
          <p className="mt-2 flex items-start gap-2 text-sm">
            <CalendarDays className="mt-0.5 size-4 shrink-0" />
            <span>
              {formatDateId(date, "EEEE, d MMM")} · {next.startTime || "Jam belum ditentukan"}
            </span>
          </p>
          <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span>{next.location || "Lokasi belum ditentukan"}</span>
          </p>
          {!scheduled && next.focus ? (
            <p className="mt-2 text-sm text-muted-foreground">{next.focus}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PracticeCta next={next} practiceCta={practiceCta} />
            <span className="text-sm text-muted-foreground">
              {!scheduled
                ? `Rencana ${next.totalMeters.toLocaleString("id-ID")} m`
                : "Jadwal rutin"}
              {next.durationMin ? ` · ${next.durationMin} menit` : ""}
            </span>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-section-title mt-1">Belum ada latihan terjadwal</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {clubView
              ? "Siapkan sesi berikutnya untuk skuad."
              : "Jadwal berikutnya akan tampil setelah dibuat oleh pelatih."}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/latihan">{clubView ? "Jadwalkan latihan" : "Lihat riwayat latihan"}</Link>
          </Button>
        </>
      )}
      {!clubView && guardian && familyCount === 0 && practiceCta !== "enroll" ? (
        <p className="mt-4 border-t border-border pt-3 text-sm">
          Anda sudah bergabung.{" "}
          <Link to="/perenang" className="font-semibold text-primary">
            Daftarkan anak
          </Link>{" "}
          untuk mulai melihat latihan.
        </p>
      ) : null}
    </section>
  );
}

function PracticeCta({
  next,
  practiceCta,
}: {
  next: Practice | NonNullable<Dashboard["nextScheduledTraining"]>;
  practiceCta: ReturnType<typeof homePracticeCta>;
}) {
  if ("scheduleId" in next && next.practiceId == null) {
    return (
      <Button asChild>
        <Link to="/latihan">
          Lihat jadwal <ArrowRight />
        </Link>
      </Button>
    );
  }
  if (practiceCta === "enroll") {
    return (
      <Button asChild>
        <Link to="/perenang">
          Daftarkan anak
          <ArrowRight />
        </Link>
      </Button>
    );
  }
  const label =
    practiceCta === "staff"
      ? "Catat kehadiran"
      : practiceCta === "izin"
        ? "Kehadiran & izin anak"
        : "Lihat program";
  return (
    <Button asChild>
      <Link
        to="/latihan/$id"
        params={{ id: String("scheduleId" in next ? next.practiceId : next.id) }}
      >
        {label}
        <ArrowRight />
      </Link>
    </Button>
  );
}

function UrgentNotice({ practice }: { practice: Practice }) {
  return (
    <section className="rounded-2xl border border-destructive/50 bg-card p-4">
      <p className="text-sm font-semibold text-destructive">Latihan hari ini dibatalkan</p>
      <h2 className="text-card-title mt-1 [overflow-wrap:anywhere]">{practice.title}</h2>
      {practice.cancelReason ? (
        <p className="mt-2 text-sm text-destructive [overflow-wrap:anywhere]">
          {practice.cancelReason}
        </p>
      ) : null}
      <Button asChild variant="outline" className="mt-3">
        <Link to="/latihan/$id" params={{ id: String(practice.id) }}>
          Lihat sesi
        </Link>
      </Button>
    </section>
  );
}

function CompletedNotice({ practice }: { practice: Practice }) {
  return (
    <section className="rounded-xl bg-muted/60 px-4 py-3">
      <p className="text-sm text-muted-foreground">Latihan hari ini selesai</p>
      <p className="font-semibold [overflow-wrap:anywhere]">{practice.title}</p>
      <Link
        to="/latihan/$id"
        params={{ id: String(practice.id) }}
        className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold"
      >
        Lihat sesi
      </Link>
    </section>
  );
}

function NoticeSummary({
  posts,
  unreadCount,
}: {
  posts: { id: number; title: string; important: boolean }[];
  unreadCount: number;
}) {
  const shown = posts.slice(0, 3);
  if (!shown.length && unreadCount === 0) return null;
  return (
    <section aria-labelledby="unread-posts" className="min-w-0">
      <p id="unread-posts" className="text-sm font-semibold">
        {unreadCount === 1 ? "1 pengumuman belum dibuka" : `${unreadCount} pengumuman belum dibuka`}
      </p>
      <ul className="mt-2 grid gap-1">
        {shown.map((post) => (
          <li key={post.id}>
            <Link
              to="/pengumuman/$id"
              params={{ id: String(post.id) }}
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-1 text-sm hover:bg-muted"
            >
              <span className="min-w-0 [overflow-wrap:anywhere] font-medium">
                {post.important ? "Penting · " : ""}
                {post.title}
              </span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {unreadCount > shown.length ? (
        <Link
          to="/pengumuman"
          className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          Lihat semua
        </Link>
      ) : null}
    </section>
  );
}

function UpcomingMeets({ meets }: { meets: Meet[] }) {
  return (
    <section>
      <SectionHead title="Kejuaraan mendatang" to="/event" />
      {!meets.length ? (
        <p className="text-sm text-muted-foreground">Belum ada kejuaraan terjadwal.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl bg-card shadow-border">
          {meets.map((meet) => (
            <li key={meet.id}>
              <Link
                to="/event/$id"
                params={{ id: String(meet.id) }}
                className="grid min-h-16 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 px-3 py-2"
              >
                <span className="text-center">
                  <span className="block text-xs font-semibold uppercase text-muted-foreground">
                    {formatDateId(meet.startDate, "MMM")}
                  </span>
                  <span className="block text-lg font-semibold leading-none">
                    {formatDateId(meet.startDate, "d")}
                  </span>
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="block font-semibold">{meet.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {meet.city || meet.venue || "Lokasi menyusul"} ·{" "}
                    {labelOf(MEET_STATUSES, meet.status)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProgressBlock({ results, familyView }: { results: Result[]; familyView: boolean }) {
  const latest = results[0];
  const series = latest ? progressSeries(results, latest) : [];
  const comparison = series.length >= 2 ? progressDescription(series) : null;
  return (
    <section>
      <SectionHead title="Progres terbaru" to="/perenang" />
      {!latest ? (
        <p className="text-sm text-muted-foreground">
          Belum ada catatan waktu. Ini bukan nilai kosong — hasil tes atau kejuaraan akan tampil di
          profil {familyView ? "anak" : "perenang"}.
        </p>
      ) : (
        <div className="min-w-0 rounded-2xl bg-card p-4 shadow-border">
          <Link
            to="/perenang/$id"
            params={{ id: String(latest.swimmerId) }}
            className="flex min-h-11 min-w-0 max-w-full flex-wrap items-start justify-between gap-3"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="block font-semibold">{latest.swimmerName}</span>
              <span className="block text-sm text-muted-foreground">
                {eventCode(latest.distanceM, latest.stroke, latest.course)} ·{" "}
                {formatDateId(latest.resultDate)} ·{" "}
                {latest.kind === "official" ? "Resmi" : "Tes latihan"}
              </span>
            </span>
            {latest.timeMs != null ? (
              <span className="min-w-0 max-w-full text-right">
                <span className="block font-mono text-lg">{formatTime(latest.timeMs)}</span>
                {latest.isPb ? <Badge tone="ok">Rekor pribadi</Badge> : null}
              </span>
            ) : null}
          </Link>
          {comparison ? <p className="mt-3 text-sm text-muted-foreground">{comparison}</p> : null}
        </div>
      )}
    </section>
  );
}

function ClubStats({
  stats,
}: {
  stats: {
    swimmerCount: number;
    practicesThisMonth: number;
    volumeThisWeek: number;
    attendanceRecorded: number;
    attendanceRate: number;
  };
}) {
  return (
    <section aria-label="Statistik klub" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Perenang aktif klub" value={String(stats.swimmerCount)} />
      <Stat label="Sesi klub bulan ini" value={String(stats.practicesThisMonth)} />
      <Stat
        label="Volume program klub · 7 hari"
        value={`${(stats.volumeThisWeek / 1000).toFixed(1)} km`}
      />
      <Stat
        label="Kehadiran tercatat klub · 30 hari"
        value={stats.attendanceRecorded ? `${stats.attendanceRate}%` : "—"}
      />
    </section>
  );
}

function WelcomeCard({
  clubName,
  family,
  grants,
  staffRole,
}: {
  clubName: string;
  family: { id: number; fullName: string; nickname: string | null }[];
  grants: { kind: "staff" | "guardian"; role: string | null; swimmerIds: number[] }[];
  staffRole: "superadmin" | "club_admin" | "coach" | null;
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => dismissClubOnboarding(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["access"] }),
  });
  return (
    <section className="rounded-2xl border border-input bg-card p-4">
      <p className="text-sm font-semibold">Pengantar · {clubName}</p>
      {grants.length ? (
        <p className="mt-2 text-sm">
          Akses baru:{" "}
          {grants
            .map((g) =>
              g.kind === "guardian"
                ? "wali perenang"
                : g.role === "coach"
                  ? "pelatih"
                  : "staf klub",
            )
            .join(", ")}
          .
        </p>
      ) : staffRole === "coach" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Pendaftaran perenang baru lewat admin klub. Pelatih mencatat latihan dan kehadiran.
        </p>
      ) : staffRole ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Kelola skuad dan undangan. Pelatih mencatat latihan; admin mengurus akses.
        </p>
      ) : family.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Belum ada anak terhubung. Daftarkan anak atau hubungi admin jika anak sudah di skuad.
        </p>
      ) : null}
      <Button
        variant="outline"
        className="mt-3"
        disabled={mut.isPending}
        onClick={() => mut.mutate()}
      >
        Tutup
      </Button>
    </section>
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
    <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
      <h2 className="text-card-title min-w-0">{title}</h2>
      <Link to={to} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold">
        Lihat semua <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
