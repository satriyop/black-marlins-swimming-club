import { useMobileNavSpace } from "@/components/layout/use-mobile-nav-space";
import { EmptyState } from "@/components/ui/page-header";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  LayoutDashboard,
  Mail,
  Megaphone,
  Trophy,
  Users,
  Waves,
  MoreHorizontal,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Splash } from "@/components/auth/login-screen";
import { signOut } from "@/lib/auth/client";
import { returnPathForLocation } from "@/lib/auth/return-path";
import {
  getAccess,
  getPublicClubContact,
  listMyClubAccessHelp,
  reopenClubOnboarding,
  saveClubTaskView,
  submitClubAccessHelp,
} from "@/lib/server/fns";
import { accessHelpKindLabel } from "@/lib/club/members";
import { isDualRole, navItemsFor, roleLabels, type NavItem } from "@/lib/club/nav";
import { UNINVITED_MESSAGE } from "@/lib/club/access";
import { cn } from "@/lib/utils";
import { MarlinMark } from "@/components/swim/mark";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { QueryError } from "@/components/ui/query-error";
import { InstallAppButton, InstallAppDialog } from "@/components/pwa/install-app";

const ICONS: Record<NavItem["to"], typeof LayoutDashboard> = {
  "/": LayoutDashboard,
  "/perenang": Users,
  "/latihan": Waves,
  "/event": Trophy,
  "/aktivitas": CalendarDays,
  "/undangan": Mail,
  "/pengumuman": Megaphone,
};

function navActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const navRef = useMobileNavSpace();
  const { user, isPending } = useCurrentUserState();
  const [moreOpen, setMoreOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useQuery({
    queryKey: ["access"],
    queryFn: () => getAccess(),
    enabled: Boolean(user),
  });

  if (isPending) return <Splash />;
  if (!user) return <RedirectToSignIn />;
  if (access.isError)
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <QueryError
          retry={() => access.refetch()}
          message="Akses klub belum berhasil dimuat. Silakan coba lagi."
        />
      </main>
    );
  if (access.isPending || !access.data) return <Splash label="Memuat akses…" />;

  const items = navItemsFor(access.data.hats, access.data.taskView);
  const invited = access.data.invited;
  const roles = roleLabels(access.data.hats);
  const dual = isDualRole(access.data.hats);
  const primaryItems = items.filter(
    (item) => !["/aktivitas", "/undangan", "/pengumuman"].includes(item.to),
  );
  const moreItems = items.filter((item) =>
    ["/aktivitas", "/undangan", "/pengumuman"].includes(item.to),
  );

  return (
    <div className="app-shell min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground"
      >
        Ke konten utama
      </a>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(80%_50%_at_10%_-10%,rgb(46_196_182/0.08),transparent_55%)]" />
      <div className="relative mx-auto flex min-h-dvh max-w-7xl">
        <aside className="sticky top-0 hidden h-dvh w-60 max-w-[30vw] shrink-0 flex-col overflow-y-auto [overflow-wrap:anywhere] border-r border-border/80 px-4 py-6 md:flex">
          <Link to="/" className="mb-8 flex items-center gap-3 px-2">
            <img
              src="/images/crest.jpg"
              alt=""
              className="size-11 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
            />
            <div className="min-w-0">
              <p className="font-display text-xl leading-none text-foreground">BMSC</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">Klaten · Jateng</p>
            </div>
          </Link>
          <nav aria-label="Navigasi utama" className="grid gap-1">
            {items.map((item) => {
              const Icon = ICONS[item.to];
              const active = navActive(pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-150",
                    active
                      ? "bg-selected font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <InstallAppButton
            onOpen={() => setInstallOpen(true)}
            className="mt-3 bg-transparent text-sm text-muted-foreground hover:text-foreground"
          />
          <div className="mt-auto rounded-2xl bg-card p-4 shadow-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MarlinMark className="size-5" />
              <span>Pelatih Hardiyanto Wibowo</span>
            </div>
          </div>
        </aside>
        <div className="app-shell-content flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border/70 px-4 py-2 md:px-8">
            <Link
              to="/"
              aria-label="BMSC — Hari Ini"
              className="flex min-h-11 min-w-0 items-center gap-2 md:hidden"
            >
              <img
                src="/images/crest.jpg"
                alt=""
                className="size-9 shrink-0 rounded-full object-cover"
              />
              <span className="font-display text-lg leading-none">BMSC</span>
            </Link>
            <p className="hidden min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere] md:block">
              Black Marlins Swimming Club
            </p>
            <UserButton roles={roles}>
              {dual ? <TaskViewSwitch current={access.data.taskView} /> : null}
              <OnboardingHelp />
            </UserButton>
          </header>
          <main id="main-content" className="flex-1 px-4 py-6 md:px-8 md:py-8">
            {invited ? children : <UninvitedHelp />}
          </main>
        </div>
      </div>
      <nav
        ref={navRef}
        aria-label="Navigasi seluler"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{
          gridTemplateColumns: `repeat(${primaryItems.length + (moreItems.length ? 1 : 0)}, minmax(0, 1fr))`,
        }}
      >
        {primaryItems.map((item) => {
          const Icon = ICONS[item.to];
          const active = navActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-xs leading-4 [overflow-wrap:anywhere]",
                active ? "font-semibold text-primary" : "font-medium text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-full max-w-14 place-items-center rounded-full",
                  active && "bg-selected",
                )}
              >
                <Icon className="size-5" />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        {moreItems.length > 0 && (
          <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-current={moreItems.some((i) => navActive(pathname, i.to)) ? "true" : undefined}
                className={cn(
                  "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-xs leading-4 [overflow-wrap:anywhere]",
                  moreItems.some((i) => navActive(pathname, i.to))
                    ? "font-semibold text-primary"
                    : "font-medium text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-full max-w-14 place-items-center rounded-full",
                    moreItems.some((i) => navActive(pathname, i.to)) && "bg-selected",
                  )}
                >
                  <MoreHorizontal className="size-5" />
                </span>
                <span>Lainnya</span>
              </button>
            </DialogTrigger>
            <DialogContent title="Lainnya" description="Kegiatan dan akses klub.">
              <nav aria-label="Menu lainnya" className="grid gap-2">
                {moreItems.map((item) => {
                  const Icon = ICONS[item.to];
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      aria-current={navActive(pathname, item.to) ? "page" : undefined}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-xl px-4 py-2",
                        navActive(pathname, item.to)
                          ? "bg-selected font-semibold text-primary"
                          : "bg-muted",
                      )}
                    >
                      <Icon className="size-5" />
                      {item.label}
                    </Link>
                  );
                })}
                <InstallAppButton
                  onOpen={() => {
                    setMoreOpen(false);
                    setInstallOpen(true);
                  }}
                />
              </nav>
            </DialogContent>
          </Dialog>
        )}
      </nav>
      <InstallAppDialog open={installOpen} onOpenChange={setInstallOpen} />
    </div>
  );
}

function TaskViewSwitch({ current }: { current: "club" | "family" | "self" }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (view: "club" | "family") => saveClubTaskView({ data: { view } }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["access"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]),
  });
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Tugas saat ini</p>
      <div
        role="group"
        aria-label="Tampilan tugas"
        className="grid grid-cols-2 rounded-lg border border-input p-1 text-sm"
      >
        <button
          type="button"
          className={cn(
            "min-h-11 rounded-md px-2 py-2 font-medium",
            current === "club" ? "bg-selected font-semibold text-primary" : "text-muted-foreground",
          )}
          disabled={mut.isPending}
          aria-pressed={current === "club"}
          onClick={() => mut.mutate("club")}
        >
          Urus klub
        </button>
        <button
          type="button"
          className={cn(
            "min-h-11 rounded-md px-2 py-2 font-medium",
            current === "family"
              ? "bg-selected font-semibold text-primary"
              : "text-muted-foreground",
          )}
          disabled={mut.isPending}
          aria-pressed={current === "family"}
          onClick={() => mut.mutate("family")}
        >
          Anak saya
        </button>
      </div>
      {mut.isError && (
        <p role="alert" className="text-sm text-destructive">
          Tampilan tugas belum tersimpan. Coba lagi.
        </p>
      )}
    </div>
  );
}

function UninvitedHelp() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const next = returnPathForLocation(pathname, searchStr);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const contact = useQuery({ queryKey: ["public-contact"], queryFn: () => getPublicClubContact() });
  const mine = useQuery({ queryKey: ["my-access-help"], queryFn: () => listMyClubAccessHelp() });
  const [message, setMessage] = useState("");
  const qc = useQueryClient();
  const help = useMutation({
    mutationFn: () =>
      submitClubAccessHelp({
        data: {
          kind: "access",
          message: [message || "Mohon undang akun ini.", next ? `Halaman: ${next}` : ""]
            .filter(Boolean)
            .join(" "),
        },
      }),
    onSuccess: async () => {
      toast.success("Permintaan terkirim ke admin klub");
      setMessage("");
      await qc.invalidateQueries({ queryKey: ["my-access-help"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const info = contact.data;
  const latest = mine.data?.[0];
  return (
    <div className="mx-auto max-w-lg">
      <EmptyState
        title={UNINVITED_MESSAGE}
        description="Skuad klub tidak ditampilkan sampai admin mengundang akun ini. Staf dan wali masuk dengan Google. Akun perenang memakai email dan password."
      />
      <div className="mt-4 grid gap-3 rounded-2xl bg-card p-5 text-sm shadow-border">
        <PublicContactLines info={info} />
        {latest ? (
          <p>
            Permintaan terakhir: {accessHelpKindLabel(latest.kind)} ·{" "}
            {latest.resolved_at ? "selesai" : "menunggu"}
          </p>
        ) : null}
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            help.mutate();
          }}
        >
          <textarea
            className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="Pesan untuk admin (opsional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={help.isPending || Boolean(latest && !latest.resolved_at)}>
              {latest && !latest.resolved_at ? "Menunggu admin" : "Minta diundang"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void signOut(loginHref)}>
              Ganti akun
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PublicContactLines({
  info,
}: {
  info: { supportEmail: string | null; supportPhone: string | null; supportUrl: string | null } | null | undefined;
}) {
  if (!info?.supportEmail && !info?.supportPhone && !info?.supportUrl) {
    return <p className="text-muted-foreground">Minta pengundang membuat tautan undangan baru.</p>;
  }
  return (
    <p>
      Kontak klub
      {info.supportEmail ? ` · ${info.supportEmail}` : ""}
      {info.supportPhone ? ` · ${info.supportPhone}` : ""}
      {info.supportUrl ? (
        <>
          {" · "}
          <a href={info.supportUrl} className="text-primary hover:underline">
            {info.supportUrl}
          </a>
        </>
      ) : null}
    </p>
  );
}

function OnboardingHelp() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const mut = useMutation({
    mutationFn: () => reopenClubOnboarding(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["access"] });
      await navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      className="min-h-11 rounded-lg border border-input px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
      disabled={mut.isPending}
      onClick={() => mut.mutate()}
    >
      Pengantar
    </button>
  );
}

export { PageHeader, EmptyState } from "@/components/ui/page-header";
