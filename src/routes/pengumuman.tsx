import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createAnnouncement, listAnnouncements } from "@/lib/server/fns";
import { useAccess } from "@/lib/club/use-access";
import { canPostAnnouncement } from "@/lib/club/permissions";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/pengumuman")({ component: Page });

function Page() {
  const { hats } = useAccess();
  const canPost = canPostAnnouncement(hats);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => listAnnouncements(),
  });

  return (
    <AppShell>
      <PageHeader
        kicker="Papan klub"
        title="Pengumuman"
        description="Perubahan jadwal, tenggat kejuaraan, dan pesan pelatih. Membuka isi menandai sudah dibaca."
        action={canPost ? <ComposeDialog /> : undefined}
      />
      {isPending ? (
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      ) : isError ? (
        <QueryError retry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState
          title="Belum ada pengumuman"
          description={
            canPost
              ? "Tulis perubahan jadwal atau pesan untuk wali dan perenang."
              : "Pengumuman klub akan tampil di sini."
          }
          action={canPost ? <ComposeDialog /> : undefined}
        />
      ) : (
        <div className="grid gap-2">
          {data.map((item) => (
            <Link
              key={item.id}
              to="/pengumuman/$id"
              params={{ id: String(item.id) }}
              className="flex items-start justify-between gap-3 rounded-2xl bg-card p-4 shadow-border"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.unread ? <Badge tone="warn">Belum dibaca</Badge> : null}
                  {item.important ? <Badge tone="pool">Penting</Badge> : null}
                  <span className="text-xs text-muted-foreground">
                    {formatDateId(item.createdAt.slice(0, 10), "d MMM yyyy")} · {item.createdByName}
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

function ComposeDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", body: "", important: false, dueOn: "" });
  const mut = useMutation({
    mutationFn: () =>
      createAnnouncement({
        data: {
          title: form.title,
          body: form.body,
          important: form.important,
          dueOn: form.dueOn || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Pengumuman terkirim");
      setOpen(false);
      setForm({ title: "", body: "", important: false, dueOn: "" });
      await qc.invalidateQueries({ queryKey: ["announcements"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Pengumuman baru
        </Button>
      </DialogTrigger>
      <DialogContent title="Pengumuman klub">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Judul">
            <Input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Isi">
            <Textarea
              required
              rows={6}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </Field>
          <Field label="Tenggat (opsional)">
            <Input
              type="date"
              value={form.dueOn}
              onChange={(e) => setForm({ ...form, dueOn: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.important}
              onChange={(e) => setForm({ ...form, important: e.target.checked })}
            />
            Penting — tampil lebih dulu di Hari Ini
          </label>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Mengirim…" : "Kirim"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
