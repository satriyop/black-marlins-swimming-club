import { Download } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getPracticeIcs } from "@/lib/server/fns";
import { cn } from "@/lib/utils";

export function PracticeNavigation({
  active,
  canManage,
}: {
  active: "today" | "schedule" | "history";
  canManage: boolean;
}) {
  const tabClass = (tab: typeof active) =>
    cn(
      "inline-flex min-h-11 min-w-0 items-center justify-center rounded-md px-2 py-2 text-center text-sm font-semibold",
      active === tab
        ? "bg-selected text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-border pb-3 md:flex-row md:items-center md:justify-between">
      <nav
        aria-label="Tampilan latihan"
        className={cn(
          "grid w-full min-w-0 gap-1 rounded-lg border border-input p-1 md:max-w-md",
          canManage ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        <Link
          to="/latihan"
          search={{ view: undefined, page: undefined }}
          className={tabClass("today")}
          aria-current={active === "today" ? "page" : undefined}
        >
          Hari ini
        </Link>
        {canManage ? (
          <Link
            to="/latihan/jadwal"
            className={tabClass("schedule")}
            aria-current={active === "schedule" ? "page" : undefined}
          >
            Jadwal
          </Link>
        ) : null}
        <Link
          to="/latihan"
          search={{ view: "history", page: undefined }}
          className={tabClass("history")}
          aria-current={active === "history" ? "page" : undefined}
        >
          Riwayat
        </Link>
      </nav>
      <CalendarDownload />
    </div>
  );
}

function CalendarDownload() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        const text = await getPracticeIcs();
        const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "bmsc-latihan.ics";
        anchor.click();
        URL.revokeObjectURL(url);
      }}
    >
      <Download /> Unduh kalender
    </Button>
  );
}
