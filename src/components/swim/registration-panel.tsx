import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, SelectNative } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { listSwimmers } from "@/lib/server/fns-swimmers";
import {
  saveEntry,
  openMeetRegistration,
  respondMeetRegistration,
  decideMeetEntry,
  lockMeetRegistration,
  reopenMeetRegistration,
  exportMeetRegistration,
} from "@/lib/server/fns-meets";
import { registrationLabels, responseLabels, type RegistrationView } from "@/lib/swim/registration";
import { COMPETITION_STROKES, DISTANCES, eventCode } from "@/lib/swim/constants";
import { formatTime, parseTimeToMs } from "@/lib/swim/time";
import type { Meet, MeetEntry } from "@/lib/swim/types";

type Props = {
  meet: Meet;
  view: RegistrationView;
  entries: MeetEntry[];
  resultAction: (entry: MeetEntry) => ReactNode;
};
function useRegistrationMutation(
  run: () => Promise<unknown>,
  success = "Perubahan pendaftaran tersimpan",
  after?: () => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      toast.success(success);
      after?.();
      await qc.invalidateQueries();
    },
  });
}
function ErrorText({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error.message} Gunakan Muat ulang bila data berubah; isian tetap tersedia.
    </p>
  ) : null;
}
export function RegistrationPanel({ meet, view, entries, resultAction }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [deadline, setDeadline] = useState("");
  const base = { meetId: meet.id, expectedRevision: view.revision };
  const lock = useRegistrationMutation(
    () => lockMeetRegistration({ data: base }),
    "Daftar dikunci. Pengajuan ke panitia belum dilakukan.",
  );
  const reopen = useRegistrationMutation(
    () =>
      reopenMeetRegistration({
        data: { ...base, deadline: new Date(deadline).toISOString(), reason },
      }),
    "Pendaftaran dibuka kembali; persetujuan dan ekspor perlu diperbarui.",
  );
  const download = useMutation({
    mutationFn: () => exportMeetRegistration({ data: base }),
    onSuccess: async (data) => {
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", data.csv], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV dibuat. Belum berarti diajukan ke panitia.");
      await qc.invalidateQueries();
    },
  });
  const active = !["batal", "selesai"].includes(meet.status);
  return (
    <section className="mb-8 space-y-4" aria-label="Pendaftaran kejuaraan">
      <div className="rounded-2xl bg-card p-4 shadow-border space-y-3">
        <h2 className="text-2xl font-semibold">Pendaftaran kejuaraan</h2>
        <p>
          {view.state === "draft"
            ? "Pendaftaran belum dibuka"
            : view.state === "locked"
              ? "Daftar dikunci"
              : view.editable
                ? "Pendaftaran terbuka"
                : "Tenggat terlewati atau kejuaraan ditutup"}{" "}
          · Revisi {view.revision}
        </p>
        {view.deadline && (
          <p className="text-sm">
            Batas respons wali:{" "}
            {new Date(view.deadline).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Usulan → respons wali → persetujuan pelatih → pengajuan ke panitia → konfirmasi panitia.
          Catatan hasil lomba disimpan terpisah.
        </p>
        <Button variant="secondary" onClick={() => void qc.invalidateQueries()}>
          Muat ulang
        </Button>
        {view.staff && active && view.state === "draft" && (
          <OpenRegistration meet={meet} view={view} />
        )}
        {view.staff && active && view.state === "open" && (
          <div className="space-y-2">
            <p className="text-sm">
              Selesaikan keputusan pengajuan wali sebelum mengunci. Usulan yang belum direspons
              tidak masuk daftar ekspor.
            </p>
            <Button disabled={lock.isPending} onClick={() => lock.mutate()}>
              Kunci daftar disetujui
            </Button>
            <ErrorText error={lock.error} />
          </div>
        )}
        {view.staff && active && view.state === "locked" && (
          <div>
            <Button disabled={download.isPending} onClick={() => download.mutate()}>
              Unduh CSV daftar disetujui
            </Button>
            <ErrorText error={download.error} />
          </div>
        )}
        {view.staff && active && view.state !== "draft" && (
          <details>
            <summary className="cursor-pointer py-3">Buka kembali untuk koreksi</summary>
            <form
              className="grid gap-3 max-w-xl"
              onSubmit={(e) => {
                e.preventDefault();
                reopen.mutate();
              }}
            >
              <p className="text-sm">
                Semua persetujuan, pengajuan, dan konfirmasi sebelumnya perlu diperbarui. Ekspor
                lama menjadi kedaluwarsa; koreksi ke panitia tetap dilakukan oleh pelatih.
              </p>
              <Field label="Tenggat baru (waktu perangkat)">
                <Input
                  required
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
              <Field label="Alasan membuka kembali">
                <Input
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <ErrorText error={reopen.error} />
              <Button type="submit" disabled={reopen.isPending}>
                Buka kembali pendaftaran
              </Button>
            </form>
          </details>
        )}
      </div>
      {view.candidates.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">
            {view.staff
              ? `Respons peserta · ${view.candidates.filter((c) => c.response === "pending").length} belum merespons`
              : "Partisipasi anak"}
          </h3>
          {view.candidates.map((c) => (
            <Candidate key={c.swimmerId} candidate={c} meet={meet} view={view} />
          ))}
        </div>
      )}
      {view.editable && <EntryEditor meet={meet} view={view} />}
      <h3 className="font-semibold text-lg">Nomor dan status pendaftaran</h3>
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Belum ada usulan nomor. Setelah bersedia ikut, wali dapat mengajukan nomor yang tersedia.
        </p>
      )}
      <ul className="grid gap-3">
        {entries.map((e) => (
          <li key={e.id} className="rounded-2xl bg-card p-4 shadow-border space-y-3">
            <h4 className="font-semibold">
              {e.swimmerName} · {eventCode(e.distanceM, e.stroke, meet.course)}
            </h4>
            <p>{registrationLabels[e.registrationStatus ?? "legacy"]}</p>
            {e.registrationReason && <p className="text-sm">Catatan: {e.registrationReason}</p>}
            <p className="text-sm text-muted-foreground">
              {e.ageGroup} · Seed {formatTime(e.seedTimeMs)}
            </p>
            {e.registrationStatus === "legacy" && (
              <p className="text-sm">
                Catatan lama dipertahankan; tidak masuk daftar disetujui sebelum diperbarui melalui
                alur pendaftaran.
              </p>
            )}
            <EntryDecision meet={meet} view={view} entry={e} />
            {view.editable && <EntryEditor meet={meet} view={view} entry={e} />}
            {resultAction(e)}
          </li>
        ))}
      </ul>
      {view.history.length > 0 && (
        <details>
          <summary className="cursor-pointer py-3">Riwayat pendaftaran</summary>
          <ol className="space-y-3 text-sm">
            {view.history.map((h) => (
              <li key={h.id} className="border-l-2 border-border pl-3">
                <p>
                  {h.action}
                  {h.entryId ? ` · Nomor #${h.entryId}` : ""} · Revisi {h.revision}
                </p>
                <p className="text-muted-foreground">
                  {h.actorName} ·{" "}
                  {new Date(h.at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
                </p>
                {h.note && <p>{h.note}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
function Candidate({
  candidate: c,
  meet,
  view,
}: {
  candidate: RegistrationView["candidates"][number];
  meet: Meet;
  view: RegistrationView;
}) {
  const [response, setResponse] = useState<"yes" | "no" | "withdrawn">("yes");
  const [reason, setReason] = useState("");
  const mut = useRegistrationMutation(() =>
    respondMeetRegistration({
      data: {
        meetId: meet.id,
        expectedRevision: view.revision,
        swimmerId: c.swimmerId,
        response,
        reason,
      },
    }),
  );
  return (
    <div className="rounded-xl bg-card p-4 shadow-border space-y-2">
      <p className="font-semibold">
        {c.name} · {c.groupName}
      </p>
      <p>{responseLabels[c.response]}</p>
      {c.reason && <p>{c.reason}</p>}
      {c.canRespond && view.editable && (
        <form
          className="grid gap-3 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label={`Respons untuk ${c.name}`}>
            <SelectNative
              value={response}
              onChange={(e) => setResponse(e.target.value as typeof response)}
            >
              <option value="yes">Bersedia ikut dan setujui usulan nomor</option>
              <option value="no">Tidak ikut</option>
              <option value="withdrawn">Mengundurkan diri</option>
            </SelectNative>
          </Field>
          {response !== "yes" && (
            <Field label={`Alasan untuk ${c.name}`}>
              <Input
                required
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          <ErrorText error={mut.error} />
          <Button type="submit" disabled={mut.isPending}>
            Simpan respons {c.name}
          </Button>
        </form>
      )}
    </div>
  );
}
function EntryDecision({
  meet,
  view,
  entry: e,
}: {
  meet: Meet;
  view: RegistrationView;
  entry: MeetEntry;
}) {
  const [note, setNote] = useState("");
  const [action, setAction] = useState<"approve" | "reject" | "withdraw" | "submit" | "confirm">(
    "approve",
  );
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (next: typeof action) =>
      decideMeetEntry({
        data: {
          meetId: meet.id,
          expectedRevision: view.revision,
          entryId: e.id,
          action: next,
          note,
        },
      }),
    onSuccess: async () => {
      toast.success("Status pendaftaran diperbarui");
      await qc.invalidateQueries();
    },
  });
  const state = e.registrationStatus ?? "legacy";
  const canOwn = view.candidates.some((c) => c.swimmerId === e.swimmerId && c.canRespond);
  const options: { value: typeof action; label: string }[] = [];
  if (view.staff && view.state === "open" && state === "requested")
    options.push(
      { value: "approve", label: "Setujui nomor" },
      { value: "reject", label: "Tolak nomor" },
    );
  if (view.staff && view.state === "locked" && state === "approved")
    options.push({ value: "submit", label: "Catat pengajuan ke panitia" });
  if (view.staff && view.state === "locked" && state === "submitted")
    options.push({ value: "confirm", label: "Catat konfirmasi panitia" });
  if (
    (view.staff || canOwn) &&
    view.editable &&
    !["submitted", "confirmed", "withdrawn"].includes(state)
  )
    options.push({ value: "withdraw", label: "Tarik nomor" });
  if (!options.length || ["batal", "selesai"].includes(meet.status)) return null;
  const selected = options.some((o) => o.value === action) ? action : options[0]!.value;
  return (
    <form
      className="grid max-w-xl gap-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        mut.mutate(selected);
      }}
    >
      <Field label={`Tindakan nomor #${e.id}`}>
        <SelectNative
          value={selected}
          onChange={(ev) => setAction(ev.target.value as typeof action)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field
        label={`Alasan / bukti nomor #${e.id}`}
        hint="Untuk pengajuan atau konfirmasi: cantumkan tanggal, referensi, dan bukti komunikasi panitia. Tidak mengirim pesan otomatis."
      >
        <Input
          required={selected !== "approve"}
          maxLength={2000}
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
        />
      </Field>
      <ErrorText error={mut.error} />
      <Button type="submit" disabled={mut.isPending}>
        {options.find((o) => o.value === selected)!.label}
      </Button>
    </form>
  );
}
function EntryEditor({
  meet,
  view,
  entry,
}: {
  meet: Meet;
  view: RegistrationView;
  entry?: MeetEntry;
}) {
  const [open, setOpen] = useState(false);
  const [swimmerId, setSwimmerId] = useState(String(entry?.swimmerId ?? ""));
  const [event, setEvent] = useState(entry ? `${entry.stroke}:${entry.distanceM}` : "");
  const [seed, setSeed] = useState(entry?.seedTimeMs ? formatTime(entry.seedTimeMs) : "");
  const candidates = view.candidates.filter(
    (c) => view.staff || (c.canRespond && c.response === "yes"),
  );
  const mut = useRegistrationMutation(
    async () => {
      const [stroke, distance] = event.split(":");
      const seedTimeMs = seed ? parseTimeToMs(seed) : null;
      if (seed && !seedTimeMs) throw new Error("Waktu seed tidak valid");
      return saveEntry({
        data: {
          meetId: meet.id,
          expectedRevision: view.revision,
          entryId: entry?.id,
          swimmerId: Number(swimmerId),
          stroke,
          distanceM: Number(distance),
          seedTimeMs,
        },
      });
    },
    "Usulan nomor tersimpan; persetujuan mengikuti alur pendaftaran.",
    () => setOpen(false),
  );
  if (!candidates.length || (entry && !candidates.some((c) => c.swimmerId === entry.swimmerId)))
    return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          {entry ? `Koreksi nomor #${entry.id}` : "Usulkan nomor"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={entry ? "Koreksi usulan nomor" : "Usulkan nomor"}
        description="Perubahan nomor memerlukan persetujuan baru. Hasil lomba tidak berubah."
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Perenang peserta">
            <SelectNative
              required
              disabled={!!entry}
              value={swimmerId}
              onChange={(e) => setSwimmerId(e.target.value)}
            >
              <option value="">Pilih perenang</option>
              {candidates.map((c) => (
                <option key={c.swimmerId} value={c.swimmerId}>
                  {c.name}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Nomor yang tersedia">
            <SelectNative required value={event} onChange={(e) => setEvent(e.target.value)}>
              <option value="">Pilih nomor</option>
              {view.events.map((e) => (
                <option key={`${e.stroke}:${e.distanceM}`} value={`${e.stroke}:${e.distanceM}`}>
                  {eventCode(e.distanceM, e.stroke)}
                </option>
              ))}
            </SelectNative>
          </Field>
          <Field label="Waktu seed (opsional)">
            <Input placeholder="36.82" value={seed} onChange={(e) => setSeed(e.target.value)} />
          </Field>
          <ErrorText error={mut.error} />
          <Button type="submit" disabled={mut.isPending}>
            Simpan usulan nomor
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function OpenRegistration({ meet, view }: { meet: Meet; view: RegistrationView }) {
  const [open, setOpen] = useState(false);
  const swimmers = useQuery({
    queryKey: ["registration-swimmers"],
    queryFn: () => listSwimmers(),
    enabled: open,
  });
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [events, setEvents] = useState(["bebas:50"]);
  const [deadline, setDeadline] = useState("");
  const mut = useRegistrationMutation(
    () =>
      openMeetRegistration({
        data: {
          meetId: meet.id,
          expectedRevision: view.revision,
          deadline: new Date(deadline).toISOString(),
          swimmers: Object.entries(selected).map(([id, groupName]) => ({
            swimmerId: Number(id),
            groupName,
          })),
          events: events.map((e) => {
            const [stroke, distance] = e.split(":");
            return { stroke, distanceM: Number(distance) };
          }),
        },
      }),
    "Pendaftaran dibuka di aplikasi.",
    () => setOpen(false),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Buka pendaftaran</Button>
      </DialogTrigger>
      <DialogContent
        title="Buka pendaftaran kejuaraan"
        description="Pilih peserta dan nomor yang memenuhi syarat. Kelompok adalah label untuk daftar kejuaraan ini; tidak mengubah kelompok latihan."
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Tenggat respons wali (waktu perangkat)">
            <Input
              required
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
          <fieldset className="space-y-2">
            <legend className="font-semibold">Peserta yang memenuhi syarat</legend>
            {swimmers.isPending && <p>Memuat peserta…</p>}
            {swimmers.error && <ErrorText error={swimmers.error} />}
            {(swimmers.data ?? [])
              .filter((s) => s.status === "aktif")
              .map((s) => (
                <div key={s.id} className="space-y-2">
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected[s.id] !== undefined}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) next[s.id] = s.ageGroupLabel;
                          else delete next[s.id];
                          return next;
                        })
                      }
                    />
                    {s.fullName}
                  </label>
                  {selected[s.id] !== undefined && (
                    <Field label={`Kelompok ${s.fullName}`}>
                      <Input
                        required
                        maxLength={100}
                        value={selected[s.id]}
                        onChange={(e) => setSelected({ ...selected, [s.id]: e.target.value })}
                      />
                    </Field>
                  )}
                </div>
              ))}
          </fieldset>
          <fieldset>
            <legend className="font-semibold">Nomor tersedia</legend>
            <div className="grid grid-cols-2 gap-2">
              {COMPETITION_STROKES.flatMap((s) =>
                DISTANCES.map((d) => {
                  const key = `${s.id}:${d}`;
                  return (
                    <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={events.includes(key)}
                        onChange={(e) =>
                          setEvents((prev) =>
                            e.target.checked ? [...prev, key] : prev.filter((v) => v !== key),
                          )
                        }
                      />
                      {d} m {s.short}
                    </label>
                  );
                }),
              )}
            </div>
          </fieldset>
          <ErrorText error={mut.error} />
          <Button
            type="submit"
            disabled={mut.isPending || !Object.keys(selected).length || !events.length}
          >
            Buka pendaftaran untuk peserta terpilih
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
