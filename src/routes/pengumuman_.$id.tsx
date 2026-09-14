import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getAnnouncement,
  acknowledgeAnnouncement,
  archiveAnnouncement,
} from "@/lib/server/fns-announcements";
import { AnnouncementComposer } from "@/components/announcements/composer";
import type { AnnouncementDetail } from "@/lib/club/announcement-contract";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { ResourceQueryError } from "@/components/ui/query-error";

export const Route = createFileRoute("/pengumuman_/$id")({ component: Page });
const when = (value: string) =>
  new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
function Page() {
  const id = Number(Route.useParams().id);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["announcement", id],
    queryFn: () => getAnnouncement({ data: { id } }),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
  const ack = useMutation({
    mutationFn: () =>
      acknowledgeAnnouncement({ data: { id, expectedRevision: query.data!.revision } }),
    onSuccess: async () => {
      toast.success("Konfirmasi revisi tersimpan");
      await qc.invalidateQueries();
    },
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
        <ResourceQueryError error={query.error} retry={() => query.refetch()} />
      </AppShell>
    );
  const post = query.data;
  return (
    <AppShell>
      <Link
        to="/pengumuman"
        className="mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground"
      >
        ← Pengumuman
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        {post.important && <Badge tone="pool">Penting</Badge>}
        {post.archivedAt && <Badge>Diarsipkan</Badge>}
        <Badge>Revisi {post.revision}</Badge>
        <span className="text-sm text-muted-foreground">
          {when(post.createdAt)} · {post.createdByName}
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold [overflow-wrap:anywhere]">{post.title}</h1>
      {post.dueOn && <p className="mt-2 text-sm">Tenggat {post.dueOn}</p>}
      {post.revision > 1 && (
        <p className="mt-3 rounded-xl border border-border p-3 text-sm">
          Dikoreksi {when(post.updatedAt)}: {post.revisions[0]?.reason}.{" "}
          {post.important
            ? "Konfirmasi berlaku untuk revisi ini."
            : "Silakan baca perubahan terbaru."}
        </p>
      )}
      {post.archivedAt && (
        <p className="mt-3 rounded-xl border border-border p-3 text-sm">
          Diarsipkan oleh {post.archivedByName ?? "Staf"} pada {when(post.archivedAt)}:{" "}
          {post.archiveNote}. Tidak ada konfirmasi yang perlu ditindaklanjuti.
        </p>
      )}
      <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
        {post.body}
      </div>
      {post.practiceId && post.practiceTitle && (
        <Link
          to="/latihan/$id"
          params={{ id: String(post.practiceId) }}
          className="mt-3 flex min-h-11 items-center text-primary underline"
        >
          Latihan: {post.practiceTitle}
        </Link>
      )}
      {post.meetId && post.meetName && (
        <Link
          to="/event/$id"
          params={{ id: String(post.meetId) }}
          className="mt-3 flex min-h-11 items-center text-primary underline"
        >
          Kejuaraan: {post.meetName}
        </Link>
      )}
      <section
        className="mt-6 space-y-3 rounded-2xl bg-card p-4 shadow-border"
        aria-label="Konfirmasi Anda"
      >
        <p className="text-sm">
          Anda membuka revisi {post.revision} pada {post.openedAt ? when(post.openedAt) : "—"}.
          Membuka belum berarti memberi konfirmasi.
        </p>
        {post.acknowledgedAt && (
          <p role="status" className="font-semibold">
            Konfirmasi Anda untuk revisi {post.revision} tersimpan pada {when(post.acknowledgedAt)}.
          </p>
        )}
        {post.canAcknowledge && (
          <Button disabled={ack.isPending} onClick={() => ack.mutate()}>
            {ack.isPending ? "Menyimpan konfirmasi…" : "Saya sudah membaca/memahami"}
          </Button>
        )}
        {post.important && !post.inAudience && !post.archivedAt && (
          <p className="text-sm text-muted-foreground">
            Anda tidak termasuk daftar penerima saat ditetapkan. Pengumuman ini dapat dibaca tanpa
            kewajiban konfirmasi.
          </p>
        )}
        {!post.important && (
          <p className="text-sm text-muted-foreground">
            Pengumuman biasa tidak meminta konfirmasi.
          </p>
        )}
        {ack.error && (
          <p role="alert" className="text-sm text-destructive">
            {ack.error.message}
          </p>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            ack.reset();
            void query.refetch();
          }}
        >
          Muat ulang pengumuman
        </Button>
      </section>
      {post.canEdit && (
        <div className="mt-4 flex flex-wrap gap-3">
          <AnnouncementComposer post={post} />
          <Archive post={post} />
        </div>
      )}
      {post.receipts && (
        <section
          className="mt-6 space-y-2 rounded-2xl bg-card p-4 shadow-border"
          aria-label="Tindak lanjut penerima"
        >
          <h2 className="font-semibold">Tindak lanjut revisi {post.revision}</h2>
          <p>
            {post.receipts.opened} dari {post.receipts.expected} penerima aktif sudah membuka.
          </p>
          {post.important && (
            <p>
              {post.receipts.acknowledged} dari {post.receipts.expected} penerima aktif sudah
              mengonfirmasi.
            </p>
          )}
          {!post.archivedAt && post.important && (
            <p className="text-sm">
              {post.receipts.outstanding.length
                ? `Belum konfirmasi: ${post.receipts.outstanding.join(", ")}`
                : post.receipts.expected
                  ? "Semua penerima aktif sudah mengonfirmasi."
                  : "Tidak ada penerima aktif yang perlu mengonfirmasi."}
            </p>
          )}
          {post.receipts.notOpened.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Belum membuka: {post.receipts.notOpened.join(", ")}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Daftar penerima ditetapkan {when(post.audienceCapturedAt)}
            {post.audienceOrigin === "migration"
              ? " saat pembaruan sistem; penerima asli sebelum pembaruan tidak diketahui"
              : " saat penerbitan"}
            . Anggota baru tidak dihitung sebagai penerima lama; akses yang dicabut dikeluarkan dari
            tindak lanjut. Ini bukan bukti pengiriman pesan.
          </p>
        </section>
      )}
      <details className="mt-6">
        <summary className="cursor-pointer py-3 font-semibold">
          Riwayat koreksi dan konfirmasi Anda
        </summary>
        <ol className="space-y-4">
          {post.revisions.map((v) => (
            <li key={v.revision} className="rounded-xl border border-border p-4 text-sm">
              <p className="font-semibold">
                Revisi {v.revision} · {v.reason}
              </p>
              <p>
                {when(v.createdAt)} · {v.changedByName}
              </p>
              {v.acknowledgedAt && <p>Anda mengonfirmasi pada {when(v.acknowledgedAt)}.</p>}
              <details>
                <summary className="cursor-pointer py-2">Lihat isi revisi {v.revision}</summary>
                <p className="font-semibold">{v.title}</p>
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{v.body}</p>
                <p>
                  {v.important ? "Penting" : "Biasa"}
                  {v.dueOn ? ` · Tenggat ${v.dueOn}` : ""}
                </p>
              </details>
            </li>
          ))}
        </ol>
      </details>
    </AppShell>
  );
}
function Archive({ post }: { post: AnnouncementDetail }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      archiveAnnouncement({ data: { id: post.id, expectedRevision: post.revision, reason } }),
    onSuccess: async () => {
      setOpen(false);
      toast.success("Pengumuman diarsipkan");
      await qc.invalidateQueries();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Arsipkan pengumuman</Button>
      </DialogTrigger>
      <DialogContent
        title="Arsipkan pengumuman"
        description="Pengumuman tetap dapat dibaca di arsip. Riwayat dan konfirmasi lama dipertahankan; tugas konfirmasi dihentikan."
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Alasan pengarsipan">
            <Textarea
              required
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {mut.error && (
            <p role="alert" className="text-sm text-destructive">
              {mut.error.message}
            </p>
          )}
          <Button type="submit" disabled={mut.isPending}>
            Arsipkan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
