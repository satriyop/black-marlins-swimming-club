import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { SwimmerGoal } from "@/lib/club/goals";
import { saveSwimmerGoal } from "@/lib/server/fns";
import { COMPETITION_STROKES, COURSES, DISTANCES, eventCode } from "@/lib/swim/constants";
import { formatTime, parseTimeToMs } from "@/lib/swim/time";
import { formatDateId, todayIso } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, SelectNative, Textarea } from "@/components/ui/input";
import { useReloadGuard } from "@/components/pwa/use-reload-guard";

type GoalForm = {
  stroke: string;
  distanceM: string;
  course: "25" | "50";
  targetTime: string;
  deadline: string;
  notes: string;
};

function formFrom(goal: SwimmerGoal | null): GoalForm {
  const today = todayIso();
  const inThirtyDays = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    stroke: goal?.stroke ?? "bebas",
    distanceM: String(goal?.distanceM ?? 50),
    course: goal?.course ?? "50",
    targetTime: goal ? formatTime(goal.targetTimeMs) : "",
    deadline: goal?.deadline ?? inThirtyDays,
    notes: goal?.notes ?? "",
  };
}

function GoalDialog({ goal = null, swimmerId }: { goal?: SwimmerGoal | null; swimmerId: number }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<GoalForm>(() => formFrom(goal));
  const qc = useQueryClient();
  useEffect(() => {
    if (open) setForm(formFrom(goal));
  }, [open, goal]);
  useReloadGuard(open && JSON.stringify(form) !== JSON.stringify(formFrom(goal)));
  const mut = useMutation({
    mutationFn: () => {
      const targetTimeMs = parseTimeToMs(form.targetTime);
      if (targetTimeMs == null || targetTimeMs <= 0)
        throw new Error("Format waktu: 35.00 atau 1:05.72");
      return saveSwimmerGoal({
        data: {
          id: goal?.id,
          expectedRevision: goal?.revision,
          swimmerId,
          stroke: form.stroke,
          distanceM: Number(form.distanceM),
          course: form.course,
          targetTimeMs,
          deadline: form.deadline,
          notes: form.notes,
        },
      });
    },
    onSuccess: async () => {
      toast.success(goal ? "Target diperbarui" : "Target ditambahkan");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["swimmer", swimmerId] });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    mut.mutate();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={goal ? "outline" : "default"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {goal ? (
          "Ubah target"
        ) : (
          <>
            <Plus /> Tambah target
          </>
        )}
      </Button>
      <DialogContent
        title={goal ? "Ubah target perenang" : "Target baru perenang"}
        description="Status dihitung dari hasil setelah target dibuat. Waktu terbaik saat ini tetap memakai seluruh riwayat nomor yang sama."
      >
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gaya">
              <SelectNative
                value={form.stroke}
                onChange={(event) => setForm({ ...form, stroke: event.target.value })}
              >
                {COMPETITION_STROKES.map((stroke) => (
                  <option key={stroke.id} value={stroke.id}>
                    {stroke.label}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Jarak">
              <SelectNative
                value={form.distanceM}
                onChange={(event) => setForm({ ...form, distanceM: event.target.value })}
              >
                {DISTANCES.map((distance) => (
                  <option key={distance} value={distance}>
                    {distance} m
                  </option>
                ))}
              </SelectNative>
            </Field>
          </div>
          <Field label="Panjang kolam">
            <SelectNative
              value={form.course}
              onChange={(event) => setForm({ ...form, course: event.target.value as "25" | "50" })}
            >
              {COURSES.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.label}
                </option>
              ))}
            </SelectNative>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Waktu target" hint="Contoh 35.00 atau 1:05.72">
              <Input
                required
                inputMode="decimal"
                placeholder="35.00"
                value={form.targetTime}
                onChange={(event) => setForm({ ...form, targetTime: event.target.value })}
              />
            </Field>
            <Field label="Batas waktu">
              <Input
                type="date"
                required
                min={goal?.startedOn ?? todayIso()}
                value={form.deadline}
                onChange={(event) => setForm({ ...form, deadline: event.target.value })}
              />
            </Field>
          </div>
          <Field
            label="Catatan"
            hint="Catatan target ini terlihat oleh perenang dan wali yang terhubung."
          >
            <Textarea
              maxLength={500}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>
          {mut.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {mut.error.message}
            </p>
          ) : null}
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Menyimpan…" : "Simpan target"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalCard({ goal, canManage }: { goal: SwimmerGoal; canManage: boolean }) {
  const status = {
    open: { label: "Berjalan", tone: "info" as const },
    hit: { label: "Tercapai", tone: "ok" as const },
    missed: { label: "Belum tercapai", tone: "warn" as const },
  }[goal.status];
  return (
    <li className="rounded-2xl bg-card p-4 shadow-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{eventCode(goal.distanceM, goal.stroke, goal.course)}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Batas waktu {formatDateId(goal.deadline)}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Target</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">
            {formatTime(goal.targetTimeMs)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Waktu terbaik saat ini</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums">
            {formatTime(goal.bestTimeMs)}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-muted-foreground">Selisih</dt>
          <dd className="font-semibold">
            {goal.deltaMs == null
              ? "Belum ada hasil sebanding"
              : goal.deltaMs > 0
                ? `Perlu ${formatTime(goal.deltaMs)} lebih cepat`
                : goal.deltaMs === 0
                  ? "Tepat target"
                  : `Lebih cepat ${formatTime(Math.abs(goal.deltaMs))}`}
          </dd>
        </div>
      </dl>
      {goal.hitOn ? (
        <p className="mt-3 text-sm text-success">Tercapai pada {formatDateId(goal.hitOn)}.</p>
      ) : null}
      {goal.status === "missed" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Hasil setelah batas waktu tidak mengubah status target ini.
        </p>
      ) : null}
      {goal.notes ? (
        <p className="mt-3 border-t border-border pt-3 text-sm whitespace-pre-wrap">{goal.notes}</p>
      ) : null}
      {canManage && goal.status === "open" ? (
        <div className="mt-4">
          <GoalDialog goal={goal} swimmerId={goal.swimmerId} />
        </div>
      ) : null}
    </li>
  );
}

export function GoalSection({
  swimmerId,
  goals,
  canManage,
}: {
  swimmerId: number;
  goals: SwimmerGoal[];
  canManage: boolean;
}) {
  return (
    <section className="mb-6" aria-labelledby="swimmer-goals-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="swimmer-goals-title" className="font-display text-2xl">
            Target perenang
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Status memakai hasil sejak target dibuat; waktu terbaik saat ini memakai seluruh riwayat
            pada nomor yang sama.
          </p>
        </div>
        {canManage ? <GoalDialog swimmerId={swimmerId} /> : null}
      </div>
      {goals.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} canManage={canManage} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-card px-4 py-6 text-sm text-muted-foreground shadow-border">
          Belum ada target waktu untuk perenang ini.
        </p>
      )}
    </section>
  );
}
