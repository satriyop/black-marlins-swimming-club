import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus } from "lucide-react";
import { savePractice, type SetInput } from "@/lib/server/fns";
import type { PracticeDetail } from "@/lib/swim/types";
import { Button } from "@/components/ui/button";
import { Field, Input, SelectNative, Textarea } from "@/components/ui/input";
import { PRACTICE_KINDS, SET_BLOCKS, STROKES, labelOf, strokeLabel } from "@/lib/swim/constants";
import { todayIso } from "@/lib/utils";
import { formatInterval } from "@/lib/swim/time";

const blankSet = (): SetInput => ({
  block: "utama",
  reps: 4,
  distanceM: 50,
  stroke: "bebas",
  intervalSec: null,
  description: "",
});
const templates: Record<string, SetInput[]> = {
  teknik: [
    { block: "pemanasan", reps: 4, distanceM: 50, stroke: "bebas" },
    { block: "teknik", reps: 8, distanceM: 25, stroke: "bebas", description: "Drill teknik" },
    { block: "pendinginan", reps: 2, distanceM: 50, stroke: "bebas" },
  ],
  sprint: [
    { block: "pemanasan", reps: 4, distanceM: 50, stroke: "bebas" },
    { block: "sprint", reps: 8, distanceM: 25, stroke: "bebas", intervalSec: 60 },
    { block: "pendinginan", reps: 2, distanceM: 50, stroke: "bebas" },
  ],
};

export function PracticeEditor({
  source,
  mode = "create",
}: {
  source?: PracticeDetail;
  mode?: "create" | "edit";
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editing = mode === "edit" && source;
  const [form, setForm] = useState({
    title: editing ? source.title : source ? `${source.title} (salinan)` : "",
    sessionDate: editing ? source.sessionDate : todayIso(),
    startTime: source?.startTime ?? "15:30",
    durationMin: String(source?.durationMin ?? 90),
    location: source?.location ?? "",
    kind: source?.kind ?? "teknik",
    focus: source?.focus ?? "",
    notes: source?.notes ?? "",
  });
  const [sets, setSets] = useState<SetInput[]>(
    source?.sets.length
      ? source.sets.map((s) => ({
          block: s.block ?? "utama",
          reps: s.reps,
          distanceM: s.distanceM,
          stroke: s.stroke,
          intervalSec: s.intervalSec,
          description: s.description ?? "",
        }))
      : [blankSet()],
  );
  const [template, setTemplate] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      savePractice({
        data: {
          ...form,
          id: editing ? source.id : undefined,
          expectedRevision: editing ? source.revision : undefined,
          durationMin: form.durationMin ? Number(form.durationMin) : undefined,
          sets,
        },
      }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries();
      await navigate({ to: "/latihan/$id", params: { id: String(id) } });
    },
  });
  const volume = sets.reduce((total, s) => total + s.reps * s.distanceM, 0);
  const updateSet = (index: number, update: Partial<SetInput>) =>
    setSets((all) => all.map((s, i) => (i === index ? { ...s, ...update } : s)));
  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!mut.isPending) mut.mutate();
      }}
    >
      <fieldset
        disabled={mut.isPending}
        className="grid gap-4 rounded-2xl bg-card p-5 shadow-border"
      >
        <legend className="sr-only">Jadwal sesi</legend>
        <h2 className="font-display text-2xl">Jadwal & tujuan</h2>
        <Field label="Judul sesi">
          <Input
            required
            maxLength={160}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Teknik gaya bebas"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tanggal">
            <Input
              type="date"
              required
              value={form.sessionDate}
              onChange={(e) => setForm({ ...form, sessionDate: e.target.value })}
            />
          </Field>
          <Field label="Jam mulai">
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </Field>
          <Field label="Durasi (menit)">
            <Input
              type="number"
              min={1}
              max={1440}
              value={form.durationMin}
              onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Lokasi">
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Nama kolam atau tempat latihan"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Jenis latihan">
            <SelectNative
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              {PRACTICE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Fokus sesi">
            <Input
              value={form.focus}
              onChange={(e) => setForm({ ...form, focus: e.target.value })}
              placeholder="Contoh: posisi tubuh dan pernapasan"
            />
          </Field>
        </div>
      </fieldset>
      <fieldset disabled={mut.isPending} className="grid gap-4">
        <legend className="sr-only">Program set</legend>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Program set</h2>
          <p className="font-mono">{volume.toLocaleString("id-ID")} m</p>
        </div>
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Mulai dari contoh program
          </summary>
          <p className="my-3 text-sm text-muted-foreground">
            Contoh dapat disesuaikan. Menggunakan contoh akan mengganti set di bawah.
          </p>
          <div className="flex flex-wrap gap-2">
            <SelectNative
              aria-label="Contoh program"
              className="w-auto"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              <option value="">Pilih contoh</option>
              <option value="teknik">Teknik dasar · 500 m</option>
              <option value="sprint">Sprint · 500 m</option>
            </SelectNative>
            <Button
              type="button"
              variant="outline"
              disabled={!template}
              onClick={() => {
                if (confirm("Ganti program set dengan contoh yang dipilih?"))
                  setSets(templates[template]!.map((s) => ({ ...s })));
              }}
            >
              Gunakan contoh
            </Button>
          </div>
        </details>
        {sets.map((s, i) => (
          <div key={i} className="grid gap-3 rounded-2xl bg-card p-4 shadow-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                Set {i + 1} · {labelOf(SET_BLOCKS, s.block)}
              </h3>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Duplikat set ${i + 1}`}
                  onClick={() => setSets([...sets.slice(0, i + 1), { ...s }, ...sets.slice(i + 1)])}
                >
                  <Copy />
                  Duplikat
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Hapus set ${i + 1}`}
                  onClick={() => setSets(sets.filter((_, j) => j !== i))}
                >
                  Hapus
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Bagian">
                <SelectNative
                  value={s.block}
                  onChange={(e) => updateSet(i, { block: e.target.value })}
                >
                  {SET_BLOCKS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </SelectNative>
              </Field>
              <Field label="Gaya">
                <SelectNative
                  value={s.stroke}
                  onChange={(e) => updateSet(i, { stroke: e.target.value })}
                >
                  {STROKES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </SelectNative>
              </Field>
              <Field label="Pengulangan">
                <Input
                  type="number"
                  required
                  min={1}
                  max={1000}
                  value={s.reps || ""}
                  onChange={(e) => updateSet(i, { reps: Number(e.target.value) })}
                />
              </Field>
              <Field label="Jarak (m)">
                <Input
                  type="number"
                  required
                  min={1}
                  max={10000}
                  value={s.distanceM || ""}
                  onChange={(e) => updateSet(i, { distanceM: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Interval (detik)"
                hint="Opsional. Jeda antarmulai pengulangan, termasuk waktu berenang."
              >
                <Input
                  type="number"
                  min={1}
                  max={7200}
                  value={s.intervalSec ?? ""}
                  onChange={(e) =>
                    updateSet(i, { intervalSec: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </Field>
              <Field label="Petunjuk set">
                <Input
                  value={s.description ?? ""}
                  onChange={(e) => updateSet(i, { description: e.target.value })}
                />
              </Field>
            </div>
            <p className="text-sm text-muted-foreground">
              {s.reps} × {s.distanceM} m {strokeLabel(s.stroke).toLowerCase()}{" "}
              {s.intervalSec ? `· ${formatInterval(s.intervalSec)}` : ""} · {s.reps * s.distanceM} m
            </p>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setSets([...sets, blankSet()])}>
          <Plus />
          Tambah set
        </Button>
        <Field label="Catatan sesi">
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </fieldset>
      {mut.isError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive"
        >
          {mut.error.message} Isian Anda tetap tersimpan di halaman ini.
        </p>
      )}
      <div className="sticky bottom-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 md:bottom-2">
        <p className="text-sm">
          Total rencana <strong>{volume.toLocaleString("id-ID")} m</strong>
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link
              to="/latihan"
              onClick={(e) => {
                if (
                  mut.isPending ||
                  !confirm("Tinggalkan form? Perubahan yang belum disimpan akan hilang.")
                )
                  e.preventDefault();
              }}
            >
              Batal
            </Link>
          </Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Menyimpan…" : editing ? "Simpan perubahan" : "Simpan sesi"}
          </Button>
        </div>
      </div>
    </form>
  );
}
