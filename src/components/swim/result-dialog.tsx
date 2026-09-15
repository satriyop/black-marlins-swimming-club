import { useAccess } from "@/lib/club/use-access";
import { canWriteOfficialResult, canWriteTestTime } from "@/lib/club/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { listMeets, saveResult } from "@/lib/server/fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, SelectNative } from "@/components/ui/input";
import {
  COMPETITION_STROKES,
  COURSES,
  DISTANCES,
  RESULT_ROUNDS,
  RESULT_STATUSES,
  eventCode,
} from "@/lib/swim/constants";
import { formatTime, parseTimeToMs } from "@/lib/swim/time";
import { kindFromSumber, sumberValue } from "@/lib/swim/result-filters";
import { todayIso } from "@/lib/utils";
import type { Result } from "@/lib/swim/types";
import { useReloadGuard } from "@/components/pwa/use-reload-guard";

function formFrom(result: Result | null) {
  return {
    meetId: result?.meetId ? String(result.meetId) : "",
    kind: (result?.kind ?? "test") as "official" | "test",
    resultDate: result?.resultDate ?? todayIso(),
    stroke: result?.stroke ?? "bebas",
    distanceM: String(result?.distanceM ?? 50),
    course: (result?.course === "25" || result?.course === "50" ? result.course : "50") as
      "25" | "50",
    time: result?.timeMs != null ? formatTime(result.timeMs) : "",
    place: result?.place ? String(result.place) : "",
    round: result?.round ?? "tes",
    status: result?.status ?? "selesai",
  };
}

export function ResultDialog({
  swimmerId,
  initial = null,
  open,
  onOpenChange,
  trigger,
}: {
  swimmerId: number;
  initial?: Result | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
}) {
  const { hats } = useAccess();
  const canTest = canWriteTestTime(hats, swimmerId);
  const canOfficial = canWriteOfficialResult(hats, swimmerId);
  const editing = initial != null;
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (value: boolean) => {
    if (!controlled) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const qc = useQueryClient();
  const meets = useQuery({ queryKey: ["meets"], queryFn: () => listMeets() });
  const [form, setForm] = useState(() => formFrom(initial));
  useEffect(() => {
    if (isOpen) setForm(formFrom(initial ?? null));
  }, [isOpen, initial]);
  useReloadGuard(isOpen && JSON.stringify(form) !== JSON.stringify(formFrom(initial)));
  const mut = useMutation({
    mutationFn: () => {
      const timeMs = form.time ? parseTimeToMs(form.time) : null;
      if (form.status === "selesai" && (timeMs == null || timeMs <= 0))
        throw new Error("Format waktu: 32.18 atau 1:05.72");
      if (form.kind === "test" && !canTest)
        throw new Error("Pilih kejuaraan untuk mencatat hasil resmi.");
      return saveResult({
        data: {
          id: initial?.id,
          swimmerId,
          meetId: form.meetId ? Number(form.meetId) : null,
          resultDate: form.resultDate,
          stroke: form.stroke,
          distanceM: Number(form.distanceM),
          course: form.course,
          timeMs,
          place: form.place ? Number(form.place) : null,
          round: form.round,
          status: form.status,
          kind: form.kind,
          notes: initial?.notes ?? undefined,
        },
      });
    },
    onSuccess: async (res) => {
      toast.success(res.isPb ? "Tersimpan — rekor pribadi baru" : "Hasil tersimpan");
      setOpen(false);
      await qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!editing && !canTest && !canOfficial) return null;
  const body = (
    <DialogContent
      title={editing ? "Ubah hasil" : "Catat hasil"}
      description="Waktu resmi, tes klub, atau kejuaraan."
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
      >
        <Field label="Tanggal">
          <Input
            type="date"
            required
            value={form.resultDate}
            onChange={(e) => setForm({ ...form, resultDate: e.target.value })}
          />
        </Field>
        <Field label={canTest ? "Sumber catatan" : "Kejuaraan"}>
          <SelectNative
            value={sumberValue(form.meetId ? Number(form.meetId) : null, form.kind)}
            onChange={(e) => {
              const next = kindFromSumber(e.target.value);
              setForm({
                ...form,
                meetId: next.meetId != null ? String(next.meetId) : "",
                kind: next.kind,
              });
            }}
          >
            {canTest ? (
              <option value="">Tes latihan</option>
            ) : (
              <option value="">Pilih kejuaraan</option>
            )}
            {form.kind === "official" && !form.meetId ? (
              <option value="official">Hasil resmi</option>
            ) : null}
            {(canOfficial ? (meets.data ?? []) : []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectNative>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gaya">
            <SelectNative
              value={form.stroke}
              onChange={(e) => setForm({ ...form, stroke: e.target.value })}
            >
              {COMPETITION_STROKES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Jarak">
            <SelectNative
              value={form.distanceM}
              onChange={(e) => setForm({ ...form, distanceM: e.target.value })}
            >
              {DISTANCES.map((d) => (
                <option key={d} value={d}>
                  {d} m
                </option>
              ))}
            </SelectNative>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Panjang kolam">
            <SelectNative
              value={form.course}
              onChange={(e) => setForm({ ...form, course: e.target.value as "25" | "50" })}
            >
              {COURSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Waktu" hint="Contoh 32.18 atau 1:05.72">
            <Input
              required={form.status === "selesai"}
              inputMode="decimal"
              className="font-mono"
              placeholder="1:05.72"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Babak">
            <SelectNative
              value={form.round}
              onChange={(e) => setForm({ ...form, round: e.target.value })}
            >
              {RESULT_ROUNDS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Status">
            <SelectNative
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {RESULT_STATUSES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Peringkat">
            <Input
              type="number"
              min={1}
              value={form.place}
              onChange={(e) => setForm({ ...form, place: e.target.value })}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Nomor: {eventCode(Number(form.distanceM), form.stroke, form.course)}
        </p>
        {mut.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mut.error.message}
          </p>
        )}
        <Button type="submit" disabled={mut.isPending}>
          {mut.isPending ? "Menyimpan…" : "Simpan hasil"}
        </Button>
      </form>
    </DialogContent>
  );
  const createTrigger = trigger ?? (
    <Button>
      <Plus className="size-4" /> Catat waktu
    </Button>
  );
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {!editing ? <DialogTrigger asChild>{createTrigger}</DialogTrigger> : null}
      {body}
    </Dialog>
  );
}
