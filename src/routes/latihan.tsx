import { useAccess } from "@/lib/club/use-access";
import { canWritePractice } from "@/lib/club/permissions";
import { QueryError } from "@/components/ui/query-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { getPracticeIcs, listClubPracticeSeries, listPractices, skipClubSeriesRange } from "@/lib/server/fns";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, SelectNative } from "@/components/ui/input";
import { PRACTICE_KINDS, PRACTICE_STATUSES, labelOf } from "@/lib/swim/constants";
import { formatDateId } from "@/lib/utils";

export const Route = createFileRoute("/latihan")({ component: Page });

function Page() {
  const { hats } = useAccess();
  const canCreate = canWritePractice(hats);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["practices"],
    queryFn: () => listPractices(),
  });
  return (
    <AppShell>
      <PageHeader
        kicker="Program"
        title="Latihan"
        description="Jadwal, program, dan kehadiran latihan klub."
        action={
          <div className="flex flex-wrap gap-2">
            <CalendarDownload />
            {canCreate ? <NewPracticeButton /> : null}
          </div>
        }
      />
      {canCreate ? <SeriesSkipBar /> : null}
      {isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <QueryError retry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState
          title="Belum ada sesi"
          description={
            canCreate
              ? "Buat sesi pertama beserta program latihan."
              : "Sesi akan tampil setelah dijadwalkan pelatih."
          }
          action={canCreate ? <NewPracticeButton /> : undefined}
        />
      ) : (
        <div className="grid gap-2">
          {data.map((p) => (
            <Link
              key={p.id}
              to="/latihan/$id"
              params={{ id: String(p.id) }}
              className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-4 shadow-border"
            >
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateId(p.sessionDate, "EEEE, d MMM yyyy")}
                  {p.startTime ? ` · ${p.startTime}` : ""} · {labelOf(PRACTICE_KINDS, p.kind)}
                  {p.seriesId ? " · berulang" : ""}
                  {p.rosterCount ? ` · ${p.presentCount}/${p.rosterCount} hadir` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm tabular-nums text-primary">
                  {p.totalMeters.toLocaleString("id-ID")} m
                </p>
                <div className="mt-1 flex flex-wrap justify-end gap-1">
                  {p.status && p.status !== "scheduled" ? (
                    <Badge tone={p.status === "cancelled" ? "warn" : p.status === "in_progress" ? "pool" : "muted"}>
                      {labelOf(PRACTICE_STATUSES, p.status)}
                    </Badge>
                  ) : (
                    <Badge>{labelOf(PRACTICE_KINDS, p.kind)}</Badge>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function SeriesSkipBar() {
  const qc = useQueryClient();
  const series = useQuery({ queryKey: ["practice-series"], queryFn: () => listClubPracticeSeries() });
  const [id, setId] = useState<number | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("Libur");
  if (!series.data?.length) return null;
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl bg-card p-4 text-sm shadow-border"
      onSubmit={async (e) => {
        e.preventDefault();
        if (id === "") return;
        try {
          await skipClubSeriesRange({
            data: { id: Number(id), fromDate, toDate, reason },
          });
          toast.success("Rentang libur diterapkan");
          await qc.invalidateQueries({ queryKey: ["practices"] });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Gagal");
        }
      }}
    >
      <Field label="Lewati jadwal berulang">
        <SelectNative value={id === "" ? "" : String(id)} onChange={(e) => setId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Pilih jadwal</option>
          {series.data.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field label="Dari">
        <Input type="date" required value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
      </Field>
      <Field label="Sampai">
        <Input type="date" required value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </Field>
      <Field label="Alasan">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button type="submit" variant="outline">
        Lewati
      </Button>
    </form>
  );
}

function CalendarDownload() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        const text = await getPracticeIcs();
        const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "bmsc-latihan.ics";
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      Unduh kalender
    </Button>
  );
}

export function NewPracticeButton() {
  return (
    <Button asChild>
      <Link to="/latihan/baru">
        <Plus />
        Sesi baru
      </Link>
    </Button>
  );
}
