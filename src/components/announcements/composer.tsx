import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, SelectNative, Textarea } from "@/components/ui/input";
import {
  createAnnouncement,
  editAnnouncement,
  getAnnouncementContexts,
} from "@/lib/server/fns-announcements";
import type { AnnouncementDetail } from "@/lib/club/announcement-contract";

type Prefill = { practiceId?: number; meetId?: number; title?: string; body?: string };
export function AnnouncementComposer({
  post,
  prefill,
  label,
}: {
  post?: AnnouncementDetail;
  prefill?: Prefill;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const makeDraft = () => ({
    title: post?.title ?? prefill?.title ?? "",
    body: post?.body ?? prefill?.body ?? "",
    important: post?.important ?? false,
    dueOn: post?.dueOn ?? "",
    practiceId: String(post?.practiceId ?? prefill?.practiceId ?? ""),
    meetId: String(post?.meetId ?? prefill?.meetId ?? ""),
    reason: "",
    revision: post?.revision ?? 1,
  });
  const [draft, setDraft] = useState<ReturnType<typeof makeDraft> | null>(null);
  const form = draft ?? makeDraft();
  const qc = useQueryClient();
  const contexts = useQuery({
    queryKey: ["announcement-contexts"],
    queryFn: () => getAnnouncementContexts(),
    enabled: open,
  });
  const mut = useMutation({
    mutationFn: () => {
      const content = {
        title: form.title,
        body: form.body,
        important: form.important,
        dueOn: form.dueOn || null,
        practiceId: form.practiceId ? Number(form.practiceId) : null,
        meetId: form.meetId ? Number(form.meetId) : null,
      };
      return post
        ? editAnnouncement({
            data: { ...content, id: post.id, expectedRevision: form.revision, reason: form.reason },
          })
        : createAnnouncement({ data: content });
    },
    onSuccess: async () => {
      toast.success(
        post
          ? "Koreksi diterbitkan; konfirmasi revisi baru diperlukan untuk pengumuman penting"
          : "Pengumuman diterbitkan",
      );
      setOpen(false);
      setDraft(null);
      await qc.invalidateQueries();
    },
  });
  function change<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setDraft({ ...form, [key]: value });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value && !draft) setDraft(makeDraft());
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={post || prefill ? "secondary" : "default"}>
          {label ?? (post ? "Koreksi pengumuman" : "Pengumuman baru")}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={post ? "Koreksi pengumuman" : "Pengumuman klub"}
        description="Tinjau isi dan tautan sebelum menerbitkan di aplikasi. Tidak mengirim pesan otomatis."
      >
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
              maxLength={200}
              value={form.title}
              onChange={(e) => change("title", e.target.value)}
            />
          </Field>
          <Field label="Isi">
            <Textarea
              required
              maxLength={20000}
              rows={6}
              value={form.body}
              onChange={(e) => change("body", e.target.value)}
            />
          </Field>
          <Field label="Tenggat (opsional)">
            <Input
              type="date"
              value={form.dueOn}
              onChange={(e) => change("dueOn", e.target.value)}
            />
          </Field>
          <Field label="Latihan terkait (opsional)">
            <SelectNative
              value={form.practiceId}
              onChange={(e) => change("practiceId", e.target.value)}
            >
              <option value="">Tanpa tautan latihan</option>
              {form.practiceId &&
                !contexts.data?.practices.some((p) => String(p.id) === form.practiceId) && (
                  <option value={form.practiceId}>
                    Latihan #{form.practiceId} — memerlukan pemeriksaan
                  </option>
                )}
              {contexts.data?.practices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.session_date} · {p.title}
                  {p.status === "cancelled" ? " · Dibatalkan" : ""}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Kejuaraan terkait (opsional)">
            <SelectNative value={form.meetId} onChange={(e) => change("meetId", e.target.value)}>
              <option value="">Tanpa tautan kejuaraan</option>
              {form.meetId && !contexts.data?.meets.some((m) => String(m.id) === form.meetId) && (
                <option value={form.meetId}>
                  Kejuaraan #{form.meetId} — memerlukan pemeriksaan
                </option>
              )}
              {contexts.data?.meets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.start_date} · {m.name}
                  {m.status === "batal" ? " · Dibatalkan" : ""}
                </option>
              ))}
            </SelectNative>
          </Field>
          {contexts.isError && (
            <p role="alert" className="text-sm text-destructive">
              Tautan gagal dimuat.{" "}
              <button type="button" className="underline" onClick={() => void contexts.refetch()}>
                Coba lagi
              </button>
            </p>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.important}
              onChange={(e) => change("important", e.target.checked)}
            />
            Penting — minta konfirmasi penerima
          </label>
          {post && (
            <>
              <p className="text-sm text-muted-foreground">
                Mengoreksi revisi {form.revision}. Perubahan isi, tenggat, status penting, atau
                tautan membuat revisi baru.
              </p>
              <Field label="Alasan koreksi">
                <Textarea
                  required
                  maxLength={2000}
                  value={form.reason}
                  onChange={(e) => change("reason", e.target.value)}
                />
              </Field>
              {post.revision !== form.revision && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDraft(makeDraft());
                    mut.reset();
                  }}
                >
                  Ganti draf dengan revisi terbaru
                </Button>
              )}
            </>
          )}
          {mut.error && (
            <p role="alert" className="text-sm text-destructive">
              {mut.error.message}
            </p>
          )}
          {mut.error && post && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void qc.invalidateQueries({ queryKey: ["announcement", post.id] })}
            >
              Periksa revisi terbaru
            </Button>
          )}
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Menerbitkan…" : post ? "Terbitkan koreksi" : "Terbitkan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
