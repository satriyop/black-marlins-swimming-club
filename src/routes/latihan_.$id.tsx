import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Copy } from "lucide-react";
import { deletePractice, getPractice, updateAttendance } from "@/lib/server/fns";
import { canMarkAttendance, canWritePractice } from "@/lib/club/permissions";
import { useAccess } from "@/lib/club/use-access";
import type { Hats } from "@/lib/club/hats";
import type { Attendance } from "@/lib/swim/types";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { QueryError } from "@/components/ui/query-error";
import { Field, Input } from "@/components/ui/input";
import { ATTENDANCE, PRACTICE_KINDS, SET_BLOCKS, labelOf, strokeLabel } from "@/lib/swim/constants";
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
        <QueryError retry={() => query.refetch()} />
      </AppShell>
    );
  const data = query.data;
  const staff = canWritePractice(hats);
  const canAttend = staff || hats.guardianSwimmerIds.length > 0;
  const unmarked = data.attendance.filter((a) => a.status === "belum").length;
  const grouped = new Map<string, typeof data.sets>();
  for (const s of data.sets) {
    const block = s.block ?? "lain";
    grouped.set(block, [...(grouped.get(block) ?? []), s]);
  }
  const visible = data.attendance.filter((a) => filter === "semua" || a.status === filter);
  return (
    <AppShell>
      <Link to="/latihan" className="mb-4 inline-flex min-h-11 items-center text-sm">
        ← Latihan
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{labelOf(PRACTICE_KINDS, data.kind)}</p>
          <h1 className="font-display text-4xl">{data.title}</h1>
          <p className="mt-2 text-sm">
            {formatDateId(data.sessionDate, "EEEE, d MMMM yyyy")} ·{" "}
            {data.startTime || "Jam belum ditentukan"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.location || "Lokasi belum ditentukan"} · Rencana{" "}
            {data.totalMeters.toLocaleString("id-ID")} m
          </p>
        </div>
        {staff && (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link to="/latihan/baru" search={{ copy: data.id }}>
                <Copy />
                Salin sesi
              </Link>
            </Button>
            <DeleteButton
              label="Hapus sesi"
              description="Program dan seluruh kehadiran sesi ini akan dihapus."
              onDelete={async () => {
                await deletePractice({ data: { id } });
                await qc.invalidateQueries();
                await navigate({ to: "/latihan" });
              }}
            />
          </div>
        )}
      </div>
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
            {staff
              ? "Catat status setiap perenang. Jarak selesai dapat diisi setelah latihan."
              : hats.guardianSwimmerIds.length
                ? "Anda dapat mencatat izin atau sakit untuk anak Anda. Kehadiran dikonfirmasi pelatih."
                : "Kehadiran dicatat oleh pelatih."}
          </p>
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
                    ? data.attendance.length
                    : data.attendance.filter((a) => a.status === item.id).length}
                  )
                </Button>
              ))}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((attendance) => (
              <AttendanceCard key={attendance.id} attendance={attendance} hats={hats} />
            ))}
          </div>
          {!visible.length && (
            <p className="rounded-xl bg-card p-5 text-sm text-muted-foreground">
              {filter === "belum"
                ? "Semua kehadiran sudah dicatat."
                : "Tidak ada perenang pada daftar ini."}
            </p>
          )}
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
function AttendanceCard({ attendance: a, hats }: { attendance: Attendance; hats: Hats }) {
  const qc = useQueryClient();
  const [meters, setMeters] = useState(a.metersCompleted == null ? "" : String(a.metersCompleted));
  const update = useMutation({
    mutationFn: (input: { status: Attendance["status"]; metersCompleted?: number | null }) =>
      updateAttendance({ data: { id: a.id, ...input } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["practice", a.practiceId] }),
        qc.invalidateQueries({ queryKey: ["practices"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["swimmer", a.swimmerId] }),
      ]);
    },
  });
  return (
    <article className="rounded-2xl bg-card p-4 shadow-border">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{a.swimmerName}</p>
        <Badge tone={a.status === "hadir" ? "pool" : "muted"}>
          {labelOf(ATTENDANCE, a.status)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {ATTENDANCE.filter((status) => canMarkAttendance(hats, a.swimmerId, status.id)).map(
          (status) => (
            <Button
              key={status.id}
              variant={a.status === status.id ? "secondary" : "outline"}
              aria-label={`${status.label}: ${a.swimmerName}`}
              aria-pressed={a.status === status.id}
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  status: status.id,
                  metersCompleted: status.id === "hadir" ? a.metersCompleted : null,
                })
              }
            >
              {status.label}
            </Button>
          ),
        )}
      </div>
      {hats.staff && a.status === "hadir" && (
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({
              status: "hadir",
              metersCompleted: meters === "" ? null : Number(meters),
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
          <Button variant="outline" disabled={update.isPending}>
            Simpan
          </Button>
        </form>
      )}
      <div aria-live="polite" className="mt-2 text-sm">
        {update.isPending ? (
          <p>Menyimpan…</p>
        ) : update.isError ? (
          <p role="alert" className="text-destructive">
            {update.error.message} Silakan coba lagi.
          </p>
        ) : update.isSuccess ? (
          <p className="text-muted-foreground">Tersimpan.</p>
        ) : null}
      </div>
    </article>
  );
}
