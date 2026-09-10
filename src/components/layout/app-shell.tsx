import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, LayoutDashboard, Trophy, Users, Waves } from "lucide-react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Splash } from "@/components/auth/login-screen";
import { cn } from "@/lib/utils";
import { MarlinMark } from "@/components/swim/mark";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Dasbor", icon: LayoutDashboard },
  { to: "/perenang", label: "Perenang", icon: Users },
  { to: "/latihan", label: "Latihan", icon: Waves },
  { to: "/event", label: "Event", icon: Trophy },
  { to: "/aktivitas", label: "Aktivitas", icon: CalendarDays },
] as const;

function navActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (isPending) return <Splash />;
  if (!user) return <RedirectToSignIn />;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(80%_50%_at_10%_-10%,rgb(46_196_182/0.08),transparent_55%)]" />
      <div className="relative mx-auto flex min-h-dvh max-w-7xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border/80 px-4 py-6 md:flex">
          <Link to="/" className="mb-8 flex items-center gap-3 px-2">
            <img src="/images/crest.jpg" alt="" className="size-11 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/10" />
            <div className="min-w-0">
              <p className="font-display text-xl leading-none text-foreground">BMSC</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">Klaten · Jateng</p>
            </div>
          </Link>
          <nav className="grid gap-1">
            {NAV.map((item) => {
              const active = navActive(pathname, item.to);
              return (
                <Link key={item.to} to={item.to} className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150", active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <item.icon className="size-4" />
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
            <div className="flex items-center gap-2 md:hidden">
              <img src="/images/crest.jpg" alt="" className="size-9 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/10" />
              <span className="font-display text-lg leading-none">BMSC</span>
            </div>
            <p className="hidden text-sm text-muted-foreground md:block">Black Marlins Swimming Club</p>
            <div className="[&_button]:text-muted-foreground [&_span]:max-w-32 [&_span]:truncate">
              <UserButton />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((item) => {
          const active = navActive(pathname, item.to);
          return (
            <Link key={item.to} to={item.to} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}>
              <item.icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHeader({
  kicker, title, description, action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {kicker ? <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-primary uppercase">{kicker}</p> : null}
        <h1 className="font-display text-4xl text-foreground md:text-5xl">{title}</h1>
        {description ? <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title, description, action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <p className="font-display text-2xl">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
