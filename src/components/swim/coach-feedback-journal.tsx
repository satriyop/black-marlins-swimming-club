import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  createClubCoachFeedback,
  retractClubCoachFeedback,
  updateClubCoachFeedback,
} from "@/lib/server/fns";
import type { CoachFeedback, CoachFeedbackStatus } from "@/lib/swim/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, SelectNative, Textarea } from "@/components/ui/input";
import { useReloadGuard } from "@/components/pwa/use-reload-guard";
import { formatDateId } from "@/lib/utils";

type PracticeOption = { id: number; title: string; sessionDate: string };
type Form = {
  practiceId: string;
  focus: string;
  improvement: string;
  nextStep: string;
  status: Exclude<CoachFeedbackStatus, "retracted">;
};

const statusPresentation = {
  draft: { label: "Draf · hanya Anda", tone: "muted" as const },
  private: { label: "Privat · staf klub", tone: "warn" as const },
  shared: { label: "Dibagikan ke wali", tone: "ok" as const },
  retracted: { label: "Ditarik kembali", tone: "danger" as const },
};

function initialForm(feedback: CoachFeedback | null, practices: PracticeOption[]): Form {
  return {
    practiceId: String(feedback?.practiceId ?? practices[0]?.id ?? ""),
    focus: feedback?.focus ?? "",
    improvement: feedback?.improvement ?? "",
    nextStep: feedback?.nextStep ?? "",
    status:
      feedback?.status === "private" || feedback?.status === "shared" ? feedback.status : "draft",
  };
}

function FeedbackEditor({
  swimmerId,
  practices,
  feedback = null,
  children,
}: {
  swimmerId: number;
  practices: PracticeOption[];
  feedback?: CoachFeedback | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const seed = useMemo(() => initialForm(feedback, practices), [feedback, practices]);
  const [form, setForm] = useState(seed);
  const qc = useQueryClient();
  useEffect(() => {
    if (open) setForm(seed);
  }, [open, seed]);
  useReloadGuard(open && JSON.stringify(form) !== JSON.stringify(seed));
  const save = useMutation({
    mutationFn: () =>
      feedback
        ? updateClubCoachFeedback({
            data: {
              id: feedback.id,
              expectedRevision: feedback.revision,
              focus: form.focus,
              improvement: form.improvement,
              nextStep: form.nextStep,
              status: form.status,
            },
          })
        : createClubCoachFeedback({
            data: {
              swimmerId,
              practiceId: Number(form.practiceId),
              focus: form.focus,
              improvement: form.improvement,
              nextStep: form.nextStep,
              status: form.status,
            },
          }),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["swimmer", swimmerId] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      toast.success(feedback ? "Catatan diperbarui" : "Catatan disimpan");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const empty = !form.focus.trim() && !form.improvement.trim() && !form.nextStep.trim();
  return (
    <Dialog open={open} onOpenChange={(value) => !save.isPending && setOpen(value)}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title={feedback ? "Ubah catatan pelatih" : "Catatan setelah latihan"}
        description="Catat hal yang membantu latihan berikutnya. Pilih siapa yang boleh membacanya."
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending) save.mutate();
          }}
        >
          <Field label="Latihan">
            {feedback ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                {feedback.practiceTitle} · {formatDateId(feedback.practiceDate)}
              </p>
            ) : (
              <SelectNative
                required
                value={form.practiceId}
                onChange={(event) => setForm({ ...form, practiceId: event.target.value })}
              >
                {practices.map((practice) => (
                  <option key={practice.id} value={practice.id}>
                    {formatDateId(practice.sessionDate)} · {practice.title}
                  </option>
                ))}
              </SelectNative>
            )}
          </Field>
          <Field label="Fokus teknik">
            <Textarea
              maxLength={1000}
              value={form.focus}
              onChange={(event) => setForm({ ...form, focus: event.target.value })}
              placeholder="Contoh: posisi kepala saat gaya bebas"
            />
          </Field>
          <Field label="Perkembangan yang terlihat">
            <Textarea
              maxLength={1000}
              value={form.improvement}
              onChange={(event) => setForm({ ...form, improvement: event.target.value })}
              placeholder="Apa yang membaik pada latihan ini?"
            />
          </Field>
          <Field label="Langkah berikutnya">
            <Textarea
              maxLength={1000}
              value={form.nextStep}
              onChange={(event) => setForm({ ...form, nextStep: event.target.value })}
              placeholder="Arahan singkat untuk latihan berikutnya"
            />
          </Field>
          <Field
            label="Akses catatan"
            hint="Draf hanya terlihat oleh Anda. Privat terlihat oleh staf. Dibagikan terlihat oleh wali perenang."
          >
            <SelectNative
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as Form["status"] })
              }
            >
              <option value="draft">Draf · hanya saya</option>
              <option value="private">Privat · staf klub</option>
              <option value="shared">Dibagikan ke wali</option>
            </SelectNative>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={save.isPending || empty || !form.practiceId}>
              {save.isPending ? "Menyimpan…" : "Simpan catatan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetractFeedback({ feedback }: { feedback: CoachFeedback }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const retract = useMutation({
    mutationFn: () =>
      retractClubCoachFeedback({
        data: { id: feedback.id, expectedRevision: feedback.revision },
      }),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["swimmer", feedback.swimmerId] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      toast.success("Catatan ditarik kembali");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={(value) => !retract.isPending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Undo2 /> Tarik kembali
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Tarik kembali catatan?"
        description="Wali tidak akan melihat catatan ini lagi. Riwayat revisi tetap disimpan untuk staf klub."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            variant="destructive"
            disabled={retract.isPending}
            onClick={() => retract.mutate()}
          >
            {retract.isPending ? "Menarik…" : "Ya, tarik kembali"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CoachFeedbackJournal({
  swimmerId,
  feedback,
  practices,
  canCreate,
}: {
  swimmerId: number;
  feedback: CoachFeedback[];
  practices: PracticeOption[];
  canCreate: boolean;
}) {
  return (
    <section className="mt-6" aria-labelledby="coach-feedback-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="coach-feedback-heading" className="text-section-title">
            Catatan perkembangan
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pengamatan pelatih setelah latihan dan arahan berikutnya.
          </p>
        </div>
        {canCreate && practices.length > 0 ? (
          <FeedbackEditor swimmerId={swimmerId} practices={practices}>
            <Button type="button">
              <Plus /> Tambah catatan
            </Button>
          </FeedbackEditor>
        ) : null}
      </div>
      {canCreate && practices.length === 0 ? (
        <p className="mb-3 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          Catatan dapat dibuat setelah perenang tercatat pada latihan yang sudah selesai.
        </p>
      ) : null}
      {feedback.length === 0 ? (
        <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground shadow-border">
          Belum ada catatan perkembangan yang dapat dilihat.
        </p>
      ) : (
        <ul className="grid gap-3">
          {feedback.map((entry) => {
            const presentation = statusPresentation[entry.status];
            return (
              <li key={entry.id} className="rounded-2xl bg-card p-4 shadow-border">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {entry.practiceId ? (
                        <Link
                          to="/latihan/$id"
                          params={{ id: String(entry.practiceId) }}
                          className="hover:underline"
                        >
                          {entry.practiceTitle}
                        </Link>
                      ) : (
                        entry.practiceTitle
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateId(entry.practiceDate)} · {entry.authorName}
                    </p>
                  </div>
                  <Badge tone={presentation.tone}>{presentation.label}</Badge>
                </div>
                {entry.status === "retracted" ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Isi catatan tidak lagi dibagikan. Riwayat versi {entry.revision} tetap
                    tersimpan.
                  </p>
                ) : (
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <FeedbackPart label="Fokus teknik" value={entry.focus} />
                    <FeedbackPart label="Perkembangan" value={entry.improvement} />
                    <FeedbackPart label="Langkah berikutnya" value={entry.nextStep} />
                  </dl>
                )}
                {entry.canEdit ? (
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                    <FeedbackEditor swimmerId={swimmerId} practices={practices} feedback={entry}>
                      <Button type="button" variant="outline" size="sm">
                        <Pencil /> Ubah
                      </Button>
                    </FeedbackEditor>
                    <RetractFeedback feedback={entry} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FeedbackPart({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap">{value || "—"}</dd>
    </div>
  );
}
