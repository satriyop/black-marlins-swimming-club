import { AnnouncementComposer } from "@/components/announcements/composer";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listAnnouncements } from "@/lib/server/fns";
import { useAccess } from "@/lib/club/use-access";
import { canPostAnnouncement } from "@/lib/club/permissions";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-error";
import { formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/pengumuman")({ component: Page });

function Page() {
  const { hats } = useAccess();
  const [archived, setArchived] = useState(false);
  const canPost = canPostAnnouncement(hats);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => listAnnouncements(),
  });
  const visible = (data ?? []).filter((item) => !!item.archivedAt === archived);
  const empty = !isPending && !isError && visible.length === 0;

  return (
    <AppShell>
      <PageHeader
        kicker="Papan klub"
        title="Pengumuman"
        description="Perubahan jadwal, tenggat kejuaraan, dan pesan pelatih. Membuka isi dicatat terpisah dari konfirmasi pengumuman penting."
        action={canPost && !empty ? <AnnouncementComposer /> : undefined}
      />
      <Button variant="secondary" onClick={() => setArchived(!archived)}>
        {archived ? "Lihat pengumuman aktif" : "Lihat arsip"}
      </Button>
      {isPending ? (
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : isError ? (
        <QueryError retry={() => refetch()} />
      ) : empty ? (
        <EmptyState
          title={archived ? "Belum ada arsip" : "Belum ada pengumuman"}
          description={
            archived
              ? "Pengumuman yang diarsipkan akan tampil di sini."
              : canPost
                ? "Tulis perubahan jadwal atau pesan untuk wali dan perenang."
                : "Pengumuman klub akan tampil di sini."
          }
          action={canPost && !archived ? <AnnouncementComposer /> : undefined}
        />
      ) : (
        <div className="grid gap-2">
          {visible.map((item) => (
              <Link
                key={item.id}
                to="/pengumuman/$id"
                params={{ id: String(item.id) }}
                className="flex items-start justify-between gap-3 rounded-2xl bg-card p-4 shadow-border"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.unread ? <Badge tone="warn">Belum dibuka</Badge> : null}
                    {item.archivedAt && <Badge>Diarsipkan</Badge>}
                    {item.needsAcknowledgement && <Badge tone="warn">Perlu konfirmasi</Badge>}
                    {item.revision > 1 && <Badge>Revisi {item.revision}</Badge>}
                    {item.important ? <Badge tone="pool">Penting</Badge> : null}
                    <span className="text-xs text-muted-foreground">
                      {formatDateId(item.createdAt.slice(0, 10), "d MMM yyyy")} ·{" "}
                      {item.createdByName}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold">{item.title}</p>
                </div>
              </Link>
            ))}
        </div>
      )}
    </AppShell>
  );
}
