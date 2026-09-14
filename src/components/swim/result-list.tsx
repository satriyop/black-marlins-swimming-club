import { useMemo, useState } from "react";
import type { Result } from "@/lib/swim/types";
import { formatTime } from "@/lib/swim/time";
import { eventCode } from "@/lib/swim/constants";
import {
  activeFilter,
  emptyResultsMessage,
  filterResults,
  groupResultsByNomor,
  meetFilterOptions,
  NOMOR_PREVIEW_LIMIT,
  nomorFilterOptions,
  previewRows,
  resultSourceLabel,
  showMeetFilter,
} from "@/lib/swim/result-filters";
import { formatDateId } from "@/lib/utils";
import { useAccess } from "@/lib/club/use-access";
import { canDeleteResult, canEditResult } from "@/lib/club/permissions";
import { DeleteButton } from "@/components/ui/delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, SelectNative } from "@/components/ui/input";
import { ResultDialog } from "@/components/swim/result-dialog";

export function ResultList({
  results,
  onDelete,
  showSwimmer = false,
  variant = "history",
}: {
  results: Result[];
  onDelete?: (id: number) => Promise<unknown>;
  showSwimmer?: boolean;
  variant?: "history" | "meet";
}) {
  const { hats } = useAccess();
  const [meet, setMeet] = useState("all");
  const [nomor, setNomor] = useState("all");
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Result | null>(null);
  const meetOptions = useMemo(() => meetFilterOptions(results), [results]);
  const nomorOptions = useMemo(() => nomorFilterOptions(results), [results]);
  const meetVisible = showMeetFilter(results);
  const meetFilter = meetVisible ? activeFilter(meet, meetOptions) : "all";
  const nomorFilter = activeFilter(nomor, nomorOptions);
  const visible = filterResults(results, meetFilter, nomorFilter);
  const history = variant === "history";
  const groups = useMemo(
    () => groupResultsByNomor(visible, history ? { pbFrom: results } : undefined),
    [visible, results, history],
  );
  const filterMiss = meetFilter !== "all" || nomorFilter !== "all";
  const actions = (r: Result) => {
    const edit = canEditResult(hats, r);
    const remove =
      onDelete && canDeleteResult(hats, r.swimmerId) ? (
        <DeleteButton
          label={`Hapus hasil ${eventCode(r.distanceM, r.stroke)}`}
          description={`Catatan ${formatDateId(r.resultDate)} milik ${r.swimmerName} akan dihapus.`}
          onDelete={() => onDelete(r.id)}
        />
      ) : null;
    if (!edit && !remove) return null;
    return (
      <div className="flex items-center justify-end gap-1">
        {edit ? (
          <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(r)}>
            Ubah
          </Button>
        ) : null}
        {remove}
      </div>
    );
  };
  return (
    <div>
      {results.length > 0 ? (
        <div className={`mb-3 grid gap-3 ${meetVisible ? "max-w-xl sm:grid-cols-2" : "max-w-xs"}`}>
          {meetVisible ? (
            <Field label="Kejuaraan">
              <SelectNative value={meetFilter} onChange={(e) => setMeet(e.target.value)}>
                {meetOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectNative>
            </Field>
          ) : null}
          <Field label="Nomor">
            <SelectNative value={nomorFilter} onChange={(e) => setNomor(e.target.value)}>
              {nomorOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectNative>
          </Field>
        </div>
      ) : null}
      {!visible.length ? (
        <p className="rounded-xl bg-card p-5 text-sm text-muted-foreground">
          {emptyResultsMessage(filterMiss)}
        </p>
      ) : (
        <ul className="grid gap-3">
          {groups.map((g, i) => {
            const expanded = !history || showAll[g.key] === true;
            const rows = history ? previewRows(g.rows, expanded) : g.rows;
            const sectionOpen =
              g.key in openGroups
                ? openGroups[g.key]!
                : !history || nomorFilter !== "all" || groups.length === 1 || i === 0;
            return (
              <li key={g.key}>
                <details
                  className="rounded-2xl bg-card shadow-border"
                  open={sectionOpen}
                  onToggle={(e) => {
                    const next = (e.currentTarget as HTMLDetailsElement).open;
                    if (next === sectionOpen) return;
                    setOpenGroups((s) => ({ ...s, [g.key]: next }));
                  }}
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <span className="font-medium">{g.label}</span>
                    {history && g.pbTimeMs != null ? (
                      <span className="shrink-0 font-mono text-sm text-primary">
                        PB {formatTime(g.pbTimeMs)}
                      </span>
                    ) : null}
                  </summary>
                  <ul className="divide-y divide-border border-t border-border px-4">
                    {rows.map((r) => {
                      const isPb = history && g.pbResultId === r.id;
                      return (
                        <li key={r.id} className="py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              {showSwimmer ? (
                                <p className="mb-0.5 font-semibold">{r.swimmerName}</p>
                              ) : null}
                              <p>{formatDateId(r.resultDate)}</p>
                              <p className="text-sm text-muted-foreground">
                                {resultSourceLabel(r)}
                                {!history && r.place != null ? ` · Peringkat ${r.place}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {isPb ? <Badge tone="ok">PB</Badge> : null}
                              {r.status !== "selesai" ? (
                                <Badge tone={r.status === "dq" ? "danger" : "warn"}>
                                  {r.status.toUpperCase()}
                                </Badge>
                              ) : (
                                <p className="font-mono text-xl font-bold tabular-nums sm:text-2xl">
                                  {formatTime(r.timeMs)}
                                </p>
                              )}
                            </div>
                          </div>
                          {actions(r)}
                        </li>
                      );
                    })}
                  </ul>
                  {history && g.rows.length > NOMOR_PREVIEW_LIMIT ? (
                    <div className="px-4 pb-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setShowAll((s) => ({ ...s, [g.key]: !expanded }))}
                      >
                        {expanded ? "Tampilkan lebih sedikit" : `Lihat semua (${g.rows.length})`}
                      </Button>
                    </div>
                  ) : null}
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <ResultDialog
          swimmerId={editing.swimmerId}
          initial={editing}
          open
          onOpenChange={(value) => {
            if (!value) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
