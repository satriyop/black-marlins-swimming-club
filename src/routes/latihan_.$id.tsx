import { AnnouncementComposer } from "@/components/announcements/composer";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ChevronDown, Pencil } from "lucide-react";
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
import { cn, formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/latihan_/$id")({ component: Page });
function Page() {
  const id = Number(Route.useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hats } = useAccess();
  const [filter, setFilter] = useState("semua");
  const [search, setSearch] = useState("");
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
  const matchesStatusFilter = (a: Attendance) => filter === "semua" || a.status === filter;
  const matchesSearch = (a: Attendance) =>
    search.trim() === "" || a.swimmerName.toLowerCase().includes(search.trim().toLowerCase());
  const visible = onRoll.filter((a) => matchesStatusFilter(a) && matchesSearch(a));
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
            {data.location || "Lokasi belum ditentukan"}
            {data.mapUrl ? (
              <>
                {" · "}
                <a
                  href={data.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  Buka peta ↗
                </a>
              </>
            ) : null}
            {" · Rencana "}
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
            <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter kehadiran">
              <Button
                type="button"
                variant={filter === "semua" ? "secondary" : "outline"}
                aria-pressed={filter === "semua"}
                onClick={() => setFilter("semua")}
              >
                Semua ({onRoll.length})
              </Button>
              <Button
                type="button"
                variant={filter === "belum" ? "secondary" : "outline"}
                aria-pressed={filter === "belum"}
                onClick={() => setFilter("belum")}
              >
                Belum dicatat ({onRoll.filter((a) => a.status === "belum").length})
              </Button>
              <SelectNative
                aria-label="Filter status lain"
                className="w-auto"
                value={["hadir", "izin", "sakit", "alfa"].includes(filter) ? filter : ""}
                onChange={(e) => setFilter(e.target.value || "semua")}
              >
                <option value="">Status lain…</option>
                {ATTENDANCE.filter((item) => item.id !== "belum").map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} ({onRoll.filter((a) => a.status === item.id).length})
                  </option>
                ))}
              </SelectNative>
              <Input
                type="search"
                placeholder="Cari nama…"
                aria-label="Cari perenang"
                className="w-auto min-w-40 flex-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          {staff && !closed ? (
            <div className="mb-3">
              <MarkAllPresentButton practiceId={id} attendances={onRoll} />
            </div>
          ) : null}
          <div className="grid gap-2">
            {onRoll.map((attendance) => (
              <div
                key={attendance.id}
                className={matchesStatusFilter(attendance) && matchesSearch(attendance) ? undefined : "hidden"}
              >
                <AttendanceCard
                  attendance={attendance}
                  hats={hats}
                  locked={closed}
                  canRemove={staff && !closed}
                  feedbackEnabled={staff && data.status === "completed"}
                />
              </div>
            ))}
          </div>
          {!visible.length && (
            <p className="rounded-xl bg-card p-5 text-sm text-muted-foreground">
              {search.trim() !== ""
                ? "Tidak ada perenang dengan nama itu."
                : filter === "belum"
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

function attendanceTone(status: Attendance["status"]): "ok" | "warn" | "danger" | "muted" {
  if (status === "hadir") return "ok";
  if (status === "izin" || status === "sakit") return "warn";
  if (status === "alfa") return "danger";
  return "muted";
}

function attendanceDotClass(status: Attendance["status"]): string {
  if (status === "hadir") return "bg-success";
  if (status === "izin" || status === "sakit") return "bg-warning";
  if (status === "alfa") return "bg-destructive";
  return "bg-muted-foreground/40";
}

function MarkAllPresentButton({
  practiceId,
  attendances,
}: {
  practiceId: number;
  attendances: Attendance[];
}) {
  const qc = useQueryClient();
  const pending = attendances.filter((a) => a.status === "belum");
  const bulk = useMutation({
    mutationFn: async () => {
      await Promise.all(
        pending.map((a) => updateAttendance({ data: { id: a.id, status: "hadir" } })),
      );
    },
    onSuccess: () => toast.success("Semua ditandai hadir"),
    onError: (e: Error) => toast.error(e.message),
    onSettled: async () => {
      // Runs on both success and partial failure so rows already saved server-side
      // aren't left showing stale status after a mid-batch error.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["practice", practiceId] }),
        qc.invalidateQueries({ queryKey: ["practices"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });
  if (!pending.length) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={bulk.isPending}
      onClick={() => bulk.mutate()}
    >
      {bulk.isPending ? "Menandai…" : `Tandai semua hadir (${pending.length})`}
    </Button>
  );
}

function AttendanceCard({
  attendance: a,
  hats,
  locked,
  canRemove,
  feedbackEnabled,
}: {
  attendance: Attendance;
  hats: Hats;
  locked: boolean;
  canRemove: boolean;
  feedbackEnabled: boolean;
}) {
  const qc = useQueryClient();
  const [meters, setMeters] = useState(a.metersCompleted == null ? "" : String(a.metersCompleted));
  const [metersEditing, setMetersEditing] = useState(a.metersCompleted == null);
  const [reason, setReason] = useState(a.notice?.reason ?? "");
  const [correctionMsg, setCorrectionMsg] = useState("");
  const [resolution, setResolution] = useState("");
  const [expanded, setExpanded] = useState(false);
  const family = canSubmitAbsenceNotice(hats, a.swimmerId);
  const canHadir = !locked && canMarkAttendance(hats, a.swimmerId, "hadir") && a.status !== "hadir";
  const otherStatuses = ATTENDANCE.filter((status) => canMarkAttendance(hats, a.swimmerId, status.id));
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
  const hasDetail =
    Boolean(a.notice?.status === "active") ||
    (hats.staff && a.status === "hadir" && !locked) ||
    family ||
    (hats.staff && a.correctionStatus === "pending" && Boolean(a.correctionId)) ||
    canRemove ||
    feedbackEnabled;
  return (
    <article className="rounded-2xl bg-card shadow-border">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span
          aria-hidden="true"
          className={cn("size-2.5 shrink-0 rounded-full", attendanceDotClass(a.status))}
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          disabled={!hasDetail}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="block truncate text-base font-medium">{a.swimmerName}</span>
        </button>
        {a.notice?.status === "active" ? (
          <Badge tone="warn" className="shrink-0">
            Izin: {a.notice.kind}
          </Badge>
        ) : null}
        {hats.staff ? (
          <>
            {canHadir ? (
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                aria-label={`Hadir: ${a.swimmerName}`}
                disabled={update.isPending}
                onClick={() => update.mutate({ status: "hadir" })}
              >
                Hadir
              </Button>
            ) : null}
            <SelectNative
              className="w-auto shrink-0"
              aria-label={`Ubah status: ${a.swimmerName}`}
              value={a.status}
              disabled={locked || update.isPending}
              onChange={(e) => update.mutate({ status: e.target.value as Attendance["status"] })}
            >
              {otherStatuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </SelectNative>
          </>
        ) : (
          <Badge tone={attendanceTone(a.status)} className="shrink-0">
            {labelOf(ATTENDANCE, a.status)}
          </Badge>
        )}
        {hasDetail ? (
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted"
            aria-label={expanded ? `Sembunyikan detail ${a.swimmerName}` : `Tampilkan detail ${a.swimmerName}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
          </button>
        ) : null}
      </div>
      <div aria-live="polite" className="px-3.5 text-sm empty:hidden [&:not(:empty)]:pb-2.5">
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
      {expanded ? (
        <div className="grid gap-3 border-t border-border px-3.5 py-3">
          {feedbackEnabled ? (
            <Button asChild variant="outline" className="justify-self-start">
              <Link to="/perenang/$id" params={{ id: String(a.swimmerId) }}>
                Tulis catatan pelatih
              </Link>
            </Button>
          ) : null}
          {a.notice?.status === "active" && a.notice.reason ? (
            <p className="text-sm text-muted-foreground">Catatan wali: {a.notice.reason}</p>
          ) : null}
          {hats.staff && a.status === "hadir" && !locked ? (
            metersEditing ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (meters === "") return;
                  update.mutate(
                    { status: "hadir", metersCompleted: Number(meters) },
                    { onSuccess: () => setMetersEditing(false) },
                  );
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
                <Button size="sm" variant="outline" disabled={update.isPending || meters === ""}>
                  Simpan jarak
                </Button>
                {a.metersCompleted != null ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setMeters(String(a.metersCompleted));
                      setMetersEditing(false);
                    }}
                  >
                    Batal
                  </Button>
                ) : null}
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Jarak selesai: <span className="font-mono text-foreground">{a.metersCompleted} m</span>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMetersEditing(true)}>
                  Ubah jarak
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate(
                      { status: "hadir", metersCompleted: null },
                      { onSuccess: () => setMetersEditing(true) },
                    )
                  }
                >
                  Hapus jarak
                </Button>
              </div>
            )
          ) : null}
          {family ? (
            <div className="grid gap-2 border-t border-border pt-2 first:border-0 first:pt-0">
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
          {hats.staff && a.correctionStatus === "pending" && a.correctionId ? (
            <form
              className="grid gap-2 border-t border-border pt-2 first:border-0 first:pt-0"
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
          {canRemove ? (
            <div className="flex justify-end border-t border-border pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
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
                Lepas dari sesi
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
