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
import { getAccess, reopenClubOnboarding, saveClubTaskView } from "@/lib/server/fns";
import { isDualRole, navItemsFor, roleLabels, type NavItem } from "@/lib/club/nav";
import { UNINVITED_MESSAGE } from "@/lib/club/access";
import { cn } from "@/lib/utils";
import { MarlinMark } from "@/components/swim/mark";
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { QueryError } from "@/components/ui/query-error";

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
  const { user, isPending } = useCurrentUserState();
  const [moreOpen, setMoreOpen] = useState(false);
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
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground"
      >
        Ke konten utama
      </a>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(80%_50%_at_10%_-10%,rgb(46_196_182/0.08),transparent_55%)]" />
      <div className="relative mx-auto flex min-h-dvh max-w-7xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border/80 px-4 py-6 md:flex">
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
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150",
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-2xl bg-card p-4 shadow-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MarlinMark className="size-5" />
              <span>Pelatih Hardiyanto Wibowo</span>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 md:px-8">
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <img
                src="/images/crest.jpg"
                alt=""
                className="size-9 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
              />
              <div className="min-w-0">
                <span className="font-display text-lg leading-none">BMSC</span>
                {roles.length ? (
                  <p className="truncate text-[11px] text-muted-foreground">{roles.join(" · ")}</p>
                ) : null}
              </div>
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="text-sm text-muted-foreground">Black Marlins Swimming Club</p>
              {roles.length ? (
                <p className="text-xs text-muted-foreground">{roles.join(" · ")}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {dual ? <TaskViewSwitch current={access.data.taskView} /> : null}
              <OnboardingHelp />
              <div className="[&_button]:text-muted-foreground [&_span]:max-w-32 [&_span]:truncate">
                <UserButton />
              </div>
            </div>
          </header>
          <main id="main-content" className="flex-1 px-4 py-6 md:px-8 md:py-8">
            {invited ? (
              children
            ) : (
              <EmptyState
                title={UNINVITED_MESSAGE}
                description="Skuad klub tidak ditampilkan sampai admin mengundang akun ini."
              />
            )}
          </main>
        </div>
      </div>
      <nav
        aria-label="Navigasi seluler"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] md:hidden"
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
                "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
        {moreItems.length > 0 && (
          <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  moreItems.some((i) => navActive(pathname, i.to))
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              >
                <MoreHorizontal className="size-5" />
                Lainnya
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
                      className="flex min-h-12 items-center gap-3 rounded-xl bg-muted px-4"
                    >
                      <Icon className="size-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </DialogContent>
          </Dialog>
        )}
      </nav>
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
    <div className="flex rounded-lg border border-border p-0.5 text-xs">
      <button
        type="button"
        className={cn(
          "min-h-8 rounded-md px-2 font-medium",
          current === "club" ? "bg-primary/12 text-primary" : "text-muted-foreground",
        )}
        disabled={mut.isPending}
        onClick={() => mut.mutate("club")}
      >
        Urus klub
      </button>
      <button
        type="button"
        className={cn(
          "min-h-8 rounded-md px-2 font-medium",
          current === "family" ? "bg-primary/12 text-primary" : "text-muted-foreground",
        )}
        disabled={mut.isPending}
        onClick={() => mut.mutate("family")}
      >
        Anak saya
      </button>
    </div>
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
      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      disabled={mut.isPending}
      onClick={() => mut.mutate()}
    >
      Pengantar
    </button>
  );
}

export { PageHeader, EmptyState } from "@/components/ui/page-header";
