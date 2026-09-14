import { AnnouncementComposer } from "@/components/announcements/composer";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Copy, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  addClubPracticeParticipant,
  cancelClubPractice,
  completeClubPractice,
  deletePractice,
  getPractice,
  listSwimmers,
  removeClubPracticeParticipant,
  reopenClubPractice,
  requestClubAttendanceCorrection,
  resolveClubAttendanceCorrection,
  saveClubAbsenceNotice,
  updateAttendance,
  withdrawClubAbsenceNotice,
} from "@/lib/server/fns";
import { canMarkAttendance, canSubmitAbsenceNotice, canWritePractice } from "@/lib/club/permissions";
import { useAccess } from "@/lib/club/use-access";
import type { Hats } from "@/lib/club/hats";
import type { Attendance, PracticeDetail } from "@/lib/swim/types";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ResourceQueryError } from "@/components/ui/query-error";
import { Field, Input, SelectNative, Textarea } from "@/components/ui/input";
import {
  ATTENDANCE,
  PRACTICE_KINDS,
  PRACTICE_STATUSES,
  SET_BLOCKS,
  labelOf,
  strokeLabel,
} from "@/lib/swim/constants";
import { formatInterval } from "@/lib/swim/time";
import { formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/latihan_/$id")({ component: Page });
function Page() {
  const id = Number(Route.useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hats } = useAccess();
  const [filter, setFilter] = useState("semua");
  const query = useQuery({
    queryKey: ["practice", id],
    queryFn: () => getPractice({ data: { id } }),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
  if (!Number.isSafeInteger(id) || id < 1)
    return (
      <AppShell>
        <p>Sesi tidak ditemukan.</p>
      </AppShell>
    );
  if (query.isPending)
    return (
      <AppShell>
        <p role="status" className="rounded-xl bg-muted p-5">
          Memuat sesi…
        </p>
      </AppShell>
    );
  if (query.isError || !query.data)
    return (
      <AppShell>
        <ResourceQueryError error={query.error} retry={() => query.refetch()} />
      </AppShell>
    );
  const data = query.data;
  const staff = canWritePractice(hats);
  const closed = data.status === "completed" || data.status === "cancelled";
  const canAttend = !closed && (staff || hats.guardianSwimmerIds.length > 0);
  const onRoll = data.attendance.filter((a) => a.onRoll);
  const offRoll = data.attendance.filter((a) => !a.onRoll);
  const unmarked = onRoll.filter((a) => a.status === "belum").length;
  const grouped = new Map<string, typeof data.sets>();
  for (const s of data.sets) {
    const block = s.block ?? "lain";
    grouped.set(block, [...(grouped.get(block) ?? []), s]);
  }
  const visible = onRoll.filter((a) => filter === "semua" || a.status === filter);
  return (
    <AppShell>
      <Link to="/latihan" className="mb-4 inline-flex min-h-11 items-center text-sm">
        ← Latihan
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{labelOf(PRACTICE_KINDS, data.kind)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-4xl">{data.title}</h1>
            {data.status !== "scheduled" ? (
              <Badge tone={data.status === "cancelled" ? "warn" : data.status === "in_progress" ? "pool" : "muted"}>
                {labelOf(PRACTICE_STATUSES, data.status)}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm">
            {formatDateId(data.sessionDate, "EEEE, d MMMM yyyy")} ·{" "}
            {data.startTime || "Jam belum ditentukan"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.location || "Lokasi belum ditentukan"} · Rencana{" "}
            {data.totalMeters.toLocaleString("id-ID")} m
          </p>
          {(data.originalSessionDate != null ||
            data.originalStartTime != null ||
            data.originalLocation != null) &&
          (data.originalSessionDate !== data.sessionDate ||
            (data.originalStartTime || null) !== (data.startTime || null) ||
            (data.originalLocation || null) !== (data.location || null)) ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Semula {formatDateId(data.originalSessionDate ?? data.sessionDate, "EEEE, d MMM")}
              {data.originalStartTime ? ` · ${data.originalStartTime}` : ""}
              {data.originalLocation ? ` · ${data.originalLocation}` : ""}
            </p>
          ) : null}
          {data.status === "cancelled" && data.cancelReason ? (
            <p className="mt-2 text-sm text-destructive">Dibatalkan: {data.cancelReason}</p>
          ) : null}
          {data.status === "completed" && data.incompleteAck ? (
            <p className="mt-2 text-sm text-muted-foreground">Ditutup dengan kehadiran belum lengkap.</p>
          ) : null}
        </div>
        {staff && (
          <div className="flex flex-wrap items-center gap-2">
            {!closed ? (
              <Button asChild variant="outline">
                <Link to="/latihan/$id/ubah" params={{ id: String(data.id) }}>
                  <Pencil />
                  Ubah sesi
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/latihan/baru" search={{ copy: data.id }}>
                <Copy />
                Salin sesi
              </Link>
            </Button>
            <SessionLifecycle data={data} />
            {!closed &&
            !data.attendance.some((a) => a.status !== "belum" || a.metersCompleted != null) ? (
              <DeleteButton
                label="Hapus sesi"
                description="Program dan seluruh kehadiran sesi ini akan dihapus."
                onDelete={async () => {
                  await deletePractice({ data: { id } });
                  await qc.invalidateQueries();
                  await navigate({ to: "/latihan" });
                }}
              />
            ) : null}
          </div>
        )}
      </div>
      {staff && (data.status === "cancelled" || data.originalSessionDate || data.originalStartTime || data.originalLocation) ? (
        <div className="mb-5 rounded-xl border border-border p-3 text-sm">
          Umumkan perubahan ke keluarga?{" "}
          <AnnouncementComposer label="Tulis pengumuman perubahan" prefill={{
            practiceId:data.id,title:`Perubahan latihan: ${data.title}`,
            body:`${data.title}\nJadwal: ${data.sessionDate} ${data.startTime ?? ""}\nLokasi: ${data.location ?? "Belum ditentukan"}${data.status === "cancelled" ? `\nDibatalkan: ${data.cancelReason ?? "Hubungi pelatih"}` : ""}`,
          }} />
          . Mengumumkan bukan berarti pesan sudah sampai.
        </div>
      ) : null}
      <Tabs.Root key={`${id}-${canAttend}`} defaultValue={canAttend ? "attendance" : "program"}>
        <Tabs.List
          aria-label="Bagian sesi latihan"
          className="mb-5 flex gap-2 rounded-xl bg-muted p-1"
        >
          <Tabs.Trigger
            value="attendance"
            className="min-h-12 flex-1 rounded-lg px-3 text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-border"
          >
            Kehadiran{" "}
            {unmarked > 0 && <span className="ml-1 text-muted-foreground">({unmarked} belum)</span>}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="program"
            className="min-h-12 flex-1 rounded-lg px-3 text-sm font-semibold data-[state=active]:bg-card data-[state=active]:shadow-border"
          >
            Program
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="attendance">
          <p className="mb-4 text-sm text-muted-foreground">
            {closed
              ? data.status === "cancelled"
                ? "Sesi dibatalkan. Kehadiran tidak diubah."
                : "Sesi selesai. Buka kembali untuk mengkoreksi kehadiran."
              : staff
                ? "Catat kehadiran akhir. Izin wali tampil terpisah dan tidak mengganti status ini."
                : hats.guardianSwimmerIds.length
                  ? "Laporkan izin atau sakit. Ini bukan kehadiran akhir; pelatih yang mencatat Hadir/Alfa."
                  : "Kehadiran dicatat oleh pelatih."}
          </p>
          {staff && !closed ? <ParticipantBar practice={data} /> : null}
          {staff && (
            <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter kehadiran">
              {[{ id: "semua", label: "Semua" }, ...ATTENDANCE].map((item) => (
                <Button
                  type="button"
                  key={item.id}
                  variant={filter === item.id ? "secondary" : "outline"}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label} (
                  {item.id === "semua"
                    ? onRoll.length
                    : onRoll.filter((a) => a.status === item.id).length}
                  )
                </Button>
              ))}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((attendance) => (
              <AttendanceCard
                key={attendance.id}
                attendance={attendance}
                hats={hats}
                locked={closed}
                canRemove={staff && !closed}
              />
            ))}
          </div>
          {!visible.length && (
            <p className="rounded-xl bg-card p-5 text-sm text-muted-foreground">
              {filter === "belum"
                ? "Semua kehadiran sudah dicatat."
                : "Tidak ada perenang pada daftar ini."}
            </p>
          )}
          {staff && offRoll.length > 0 ? (
            <section className="mt-6">
              <h2 className="mb-3 font-display text-2xl">Tidak ikut sesi ini</h2>
              <ul className="grid gap-2">
                {offRoll.map((a) => (
                  <li key={a.id} className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
                    <span className="font-medium">{a.swimmerName}</span>
                    {" · "}
                    {labelOf(ATTENDANCE, a.status)}
                    {a.metersCompleted != null ? ` · ${a.metersCompleted} m` : ""}
                    {a.notice?.status === "active" ? ` · izin wali ${a.notice.kind}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </Tabs.Content>
        <Tabs.Content value="program">
          {data.focus && <p className="mb-4 text-sm">Fokus: {data.focus}</p>}
          <div className="grid gap-4">
            {[...grouped.entries()].map(([block, sets]) => (
              <section key={block} className="rounded-2xl bg-card p-5 shadow-border">
                <h2 className="font-display mb-3 text-2xl">{labelOf(SET_BLOCKS, block)}</h2>
                <ul className="divide-y divide-border">
                  {sets.map((s) => (
                    <li key={s.id} className="py-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="font-semibold">
                          {s.reps} × {s.distanceM} m · {strokeLabel(s.stroke)}
                        </p>
                        <p className="font-mono text-sm">{s.reps * s.distanceM} m</p>
                      </div>
                      {s.intervalSec && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Interval {formatInterval(s.intervalSec)}
                        </p>
                      )}
                      {s.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {!data.sets.length && (
            <p className="text-sm text-muted-foreground">Program set belum ditambahkan.</p>
          )}
          {data.notes && (
            <p className="mt-5 rounded-xl border border-border p-4 text-sm">{data.notes}</p>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </AppShell>
  );
}
function SessionLifecycle({ data }: { data: PracticeDetail }) {
  const qc = useQueryClient();
  const [cancelReason, setCancelReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelScope, setCancelScope] = useState<"this" | "future">("this");
  const unmarkedRows = data.attendance.filter((a) => a.onRoll && a.status === "belum");
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["practice", data.id] }),
      qc.invalidateQueries({ queryKey: ["practices"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };
  const cancel = useMutation({
    mutationFn: () =>
      cancelClubPractice({
        data: {
          id: data.id,
          reason: cancelReason,
          expectedRevision: data.revision,
          scope: data.seriesId ? cancelScope : "this",
        },
      }),
    onSuccess: async () => {
      toast.success("Sesi dibatalkan");
      setCancelOpen(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const complete = useMutation({
    mutationFn: (acknowledgeIncomplete: boolean) =>
      completeClubPractice({
        data: { id: data.id, acknowledgeIncomplete, expectedRevision: data.revision },
      }),
    onSuccess: async () => {
      toast.success("Sesi ditandai selesai");
      setCompleteOpen(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reopen = useMutation({
    mutationFn: () =>
      reopenClubPractice({ data: { id: data.id, reason: reopenReason, expectedRevision: data.revision } }),
    onSuccess: async () => {
      toast.success("Sesi dibuka kembali");
      setReopenOpen(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (data.status === "completed" || data.status === "cancelled") {
    return (
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Buka kembali</Button>
        </DialogTrigger>
        <DialogContent title="Buka kembali sesi" description="Sesi bisa diubah dan kehadiran dikoreksi.">
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              reopen.mutate();
            }}
          >
            <Field label="Alasan">
              <Textarea required value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
            </Field>
            <Button type="submit" disabled={reopen.isPending}>
              Buka kembali
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <>
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Tandai selesai</Button>
        </DialogTrigger>
        <DialogContent
          title="Tutup sesi"
          description={
            unmarkedRows.length
              ? "Beberapa perenang belum dicatat. Mereka tidak akan ditandai alfa."
              : "Semua kehadiran di daftar sudah dicatat."
          }
        >
          {unmarkedRows.length ? (
            <ul className="mb-4 list-disc pl-5 text-sm">
              {unmarkedRows.map((a) => (
                <li key={a.id}>{a.swimmerName}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {unmarkedRows.length ? (
              <Button type="button" variant="outline" onClick={() => setCompleteOpen(false)}>
                Lanjut catat
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={complete.isPending}
              onClick={() => complete.mutate(unmarkedRows.length > 0)}
            >
              {unmarkedRows.length ? "Tutup dengan catatan belum lengkap" : "Tandai selesai"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Batalkan sesi</Button>
        </DialogTrigger>
        <DialogContent
          title="Batalkan sesi"
          description="Sesi tetap terlihat. Kehadiran yang sudah dicatat tidak dihapus."
        >
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              cancel.mutate();
            }}
          >
            <Field label="Alasan">
              <Textarea required value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </Field>
            {data.seriesId ? (
              <Field label="Cakupan">
                <SelectNative
                  value={cancelScope}
                  onChange={(e) => setCancelScope(e.target.value as "this" | "future")}
                >
                  <option value="this">Hanya sesi ini</option>
                  <option value="future">Sesi ini dan berikutnya</option>
                </SelectNative>
              </Field>
            ) : null}
            <Button type="submit" disabled={cancel.isPending}>
              Batalkan sesi
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ParticipantBar({ practice }: { practice: PracticeDetail }) {
  const qc = useQueryClient();
  const [swimmerId, setSwimmerId] = useState<number | "">("");
  const swimmers = useQuery({ queryKey: ["swimmers"], queryFn: () => listSwimmers() });
  const onIds = new Set(practice.attendance.filter((a) => a.onRoll).map((a) => a.swimmerId));
  const available = (swimmers.data ?? []).filter((s) => s.status === "aktif" && !onIds.has(s.id));
  const add = useMutation({
    mutationFn: () =>
      addClubPracticeParticipant({ data: { practiceId: practice.id, swimmerId: Number(swimmerId) } }),
    onSuccess: async () => {
      setSwimmerId("");
      await qc.invalidateQueries({ queryKey: ["practice", practice.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!available.length) return null;
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (swimmerId !== "") add.mutate();
      }}
    >
      <Field label="Tambah perenang">
        <SelectNative
          value={swimmerId === "" ? "" : String(swimmerId)}
          onChange={(e) => setSwimmerId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Pilih perenang</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Button type="submit" variant="outline" disabled={add.isPending || swimmerId === ""}>
        Tambah ke sesi
      </Button>
    </form>
  );
}

function AttendanceCard({
  attendance: a,
  hats,
  locked,
  canRemove,
}: {
  attendance: Attendance;
  hats: Hats;
  locked: boolean;
  canRemove: boolean;
}) {
  const qc = useQueryClient();
  const [meters, setMeters] = useState(a.metersCompleted == null ? "" : String(a.metersCompleted));
  const [reason, setReason] = useState(a.notice?.reason ?? "");
  const [correctionMsg, setCorrectionMsg] = useState("");
  const [resolution, setResolution] = useState("");
  const family = canSubmitAbsenceNotice(hats, a.swimmerId);
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["practice", a.practiceId] }),
      qc.invalidateQueries({ queryKey: ["practices"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
      qc.invalidateQueries({ queryKey: ["swimmer", a.swimmerId] }),
    ]);
  };
  const update = useMutation({
    mutationFn: (input: { status: Attendance["status"]; metersCompleted?: number | null }) =>
      updateAttendance({ data: { id: a.id, ...input } }),
    onSuccess: refresh,
  });
  const notice = useMutation({
    mutationFn: (kind: "izin" | "sakit") =>
      saveClubAbsenceNotice({ data: { practiceId: a.practiceId, swimmerId: a.swimmerId, kind, reason } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const withdraw = useMutation({
    mutationFn: () =>
      withdrawClubAbsenceNotice({ data: { practiceId: a.practiceId, swimmerId: a.swimmerId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const correct = useMutation({
    mutationFn: () =>
      requestClubAttendanceCorrection({ data: { attendanceId: a.id, message: correctionMsg } }),
    onSuccess: () => {
      setCorrectionMsg("");
      return refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resolve = useMutation({
    mutationFn: (status: "resolved" | "rejected") =>
      resolveClubAttendanceCorrection({ data: { id: a.correctionId!, status, resolution } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <article className="rounded-2xl bg-card p-4 shadow-border">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{a.swimmerName}</p>
        <div className="flex items-center gap-2">
          <Badge tone={a.status === "hadir" ? "pool" : "muted"}>
            {labelOf(ATTENDANCE, a.status)}
          </Badge>
          {a.notice?.status === "active" ? (
            <Badge tone="warn">Izin wali: {a.notice.kind}</Badge>
          ) : null}
          {canRemove ? (
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await removeClubPracticeParticipant({
                    data: { practiceId: a.practiceId, swimmerId: a.swimmerId },
                  });
                  await qc.invalidateQueries({ queryKey: ["practice", a.practiceId] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Gagal menghapus");
                }
              }}
            >
              Lepas
            </Button>
          ) : null}
        </div>
      </div>
      {a.notice?.status === "active" && a.notice.reason ? (
        <p className="mb-3 text-sm text-muted-foreground">Catatan wali: {a.notice.reason}</p>
      ) : null}
      {hats.staff ? (
        <div className="flex flex-wrap gap-2">
          {ATTENDANCE.filter((status) => canMarkAttendance(hats, a.swimmerId, status.id)).map(
            (status) => (
              <Button
                key={status.id}
                variant={a.status === status.id ? "secondary" : "outline"}
                aria-label={`${status.label}: ${a.swimmerName}`}
                aria-pressed={a.status === status.id}
                disabled={locked || update.isPending}
                onClick={() => update.mutate({ status: status.id })}
              >
                {status.label}
              </Button>
            ),
          )}
        </div>
      ) : null}
      {family ? (
        <div className="mt-3 grid gap-2">
          <p className="text-xs text-muted-foreground">{a.cutoffLabel}</p>
          {a.noticeEditable ? (
            <>
              <Field label="Alasan (opsional, hanya staf dan keluarga)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={a.notice?.status === "active" && a.notice.kind === "izin" ? "secondary" : "outline"}
                  disabled={notice.isPending}
                  onClick={() => notice.mutate("izin")}
                >
                  Izin
                </Button>
                <Button
                  variant={a.notice?.status === "active" && a.notice.kind === "sakit" ? "secondary" : "outline"}
                  disabled={notice.isPending}
                  onClick={() => notice.mutate("sakit")}
                >
                  Sakit
                </Button>
                {a.notice?.status === "active" ? (
                  <Button variant="ghost" disabled={withdraw.isPending} onClick={() => withdraw.mutate()}>
                    Batalkan izin
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Menyimpan izin tidak mengganti kehadiran akhir pelatih.
              </p>
            </>
          ) : a.canRequestCorrection ? (
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                correct.mutate();
              }}
            >
              <Field label="Ajukan koreksi">
                <Input
                  required
                  value={correctionMsg}
                  onChange={(e) => setCorrectionMsg(e.target.value)}
                  placeholder="Jelaskan ke pelatih"
                />
              </Field>
              <Button type="submit" variant="outline" disabled={correct.isPending || a.correctionStatus === "pending"}>
                {a.correctionStatus === "pending" ? "Koreksi menunggu" : "Kirim koreksi"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              {a.notice?.status === "active"
                ? `Izin tercatat (${a.notice.kind}). Sesi dibatalkan, izin tidak dapat diubah.`
                : "Sesi dibatalkan. Izin tidak dapat diubah."}
            </p>
          )}
          {a.correctionStatus && a.correctionStatus !== "pending" ? (
            <p className="text-sm">
              Koreksi {a.correctionStatus === "resolved" ? "diterima" : "ditolak"}
              {a.correctionResolution ? `: ${a.correctionResolution}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
      {hats.staff && a.status === "hadir" && !locked && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (meters === "") return;
            update.mutate({
              status: "hadir",
              metersCompleted: Number(meters),
            });
          }}
        >
          <Field label="Jarak selesai (m)">
            <Input
              type="number"
              min={0}
              max={100000}
              value={meters}
              placeholder="Belum dicatat"
              onChange={(e) => setMeters(e.target.value)}
            />
          </Field>
          <Button variant="outline" disabled={locked || update.isPending || meters === ""}>
            Simpan jarak
          </Button>
          {a.metersCompleted != null ? (
            <Button
              type="button"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => update.mutate({ status: "hadir", metersCompleted: null })}
            >
              Hapus jarak
            </Button>
          ) : null}
        </form>
      )}
      {hats.staff && a.correctionStatus === "pending" && a.correctionId ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => e.preventDefault()}
        >
          <p className="text-sm">Koreksi wali: {a.correctionMessage}</p>
          <Field label="Penjelasan">
            <Input value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" disabled={resolve.isPending} onClick={() => resolve.mutate("resolved")}>
              Terima
            </Button>
            <Button type="button" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate("rejected")}>
              Tolak
            </Button>
          </div>
        </form>
      ) : null}
      <div aria-live="polite" className="mt-2 text-sm">
        {update.isPending || notice.isPending ? (
          <p>Menyimpan…</p>
        ) : update.isError ? (
          <p role="alert" className="text-destructive">
            {update.error.message} Silakan coba lagi.
          </p>
        ) : update.isSuccess || notice.isSuccess ? (
          <p className="text-muted-foreground">Tersimpan.</p>
        ) : null}
      </div>
    </article>
  );
}
