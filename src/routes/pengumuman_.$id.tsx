import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getAnnouncement } from "@/lib/server/fns";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { QueryError } from "@/components/ui/query-error";
import { formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/pengumuman_/$id")({ component: Page });

function Page() {
  const id = Number(Route.useParams().id);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["announcement", id],
    queryFn: () => getAnnouncement({ data: { id } }),
    enabled: Number.isSafeInteger(id) && id > 0,
  });

  useEffect(() => {
    if (query.data) {
      void qc.invalidateQueries({ queryKey: ["announcements"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }, [query.data, qc]);

  if (!Number.isSafeInteger(id) || id < 1)
    return (
      <AppShell>
        <p>Pengumuman tidak ditemukan.</p>
      </AppShell>
    );
  if (query.isPending)
    return (
      <AppShell>
        <p role="status" className="rounded-xl bg-muted p-5">
          Memuat pengumuman…
        </p>
      </AppShell>
    );
  if (query.isError || !query.data)
    return (
      <AppShell>
        <QueryError retry={() => query.refetch()} />
      </AppShell>
    );

  const post = query.data;
  return (
    <AppShell>
      <p className="mb-4 text-sm">
        <Link to="/pengumuman" className="text-muted-foreground hover:text-foreground">
          ← Pengumuman
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {post.important ? <Badge tone="pool">Penting</Badge> : null}
        <span className="text-sm text-muted-foreground">
          {formatDateId(post.createdAt.slice(0, 10), "EEEE, d MMMM yyyy")} · {post.createdByName}
        </span>
      </div>
      <h1 className="font-display mt-3 text-3xl sm:text-4xl">{post.title}</h1>
      {post.dueOn ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Tenggat {formatDateId(post.dueOn, "EEEE, d MMMM yyyy")}
        </p>
      ) : null}
      <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">{post.body}</div>
      {post.practiceId ? (
        <p className="mt-4 text-sm">
          <Link
            to="/latihan/$id"
            params={{ id: String(post.practiceId) }}
            className="text-primary hover:underline"
          >
            Latihan: {post.practiceTitle ?? `#${post.practiceId}`}
          </Link>
        </p>
      ) : null}
      {post.meetId ? (
        <p className="mt-2 text-sm">
          <Link
            to="/event/$id"
            params={{ id: String(post.meetId) }}
            className="text-primary hover:underline"
          >
            Kejuaraan: {post.meetName ?? `#${post.meetId}`}
          </Link>
        </p>
      ) : null}
      {post.receipts ? (
        <section className="mt-8 rounded-2xl bg-card p-4 shadow-border">
          <p className="font-semibold">
            {post.receipts.read} dari {post.receipts.expected} wali dan perenang sudah membuka
          </p>
          {post.receipts.outstanding.length ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Belum buka: {post.receipts.outstanding.join(", ")}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Semua sudah membuka.</p>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}
