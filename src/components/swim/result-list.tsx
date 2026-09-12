import { useMemo, useState } from "react";
import type { Result } from "@/lib/swim/types";
import { formatTime } from "@/lib/swim/time";
import { eventCode } from "@/lib/swim/constants";
import {
  activeFilter,
  emptyResultsMessage,
  filterResults,
  meetFilterOptions,
  nomorFilterOptions,
  showMeetFilter,
} from "@/lib/swim/result-filters";
import { formatDateId } from "@/lib/utils";
import { useAccess } from "@/lib/club/use-access";
import { canDeleteResult } from "@/lib/club/permissions";
import { DeleteButton } from "@/components/ui/delete-button";
import { Field, SelectNative } from "@/components/ui/input";

export function ResultList({
  results,
  onDelete,
  showSwimmer = false,
}: {
  results: Result[];
  onDelete?: (id: number) => Promise<unknown>;
  showSwimmer?: boolean;
}) {
  const { hats } = useAccess();
  const [meet, setMeet] = useState("all");
  const [nomor, setNomor] = useState("all");
  const meetOptions = useMemo(() => meetFilterOptions(results), [results]);
  const nomorOptions = useMemo(() => nomorFilterOptions(results), [results]);
  const meetVisible = showMeetFilter(results);
  const meetFilter = meetVisible ? activeFilter(meet, meetOptions) : "all";
  const nomorFilter = activeFilter(nomor, nomorOptions);
  const visible = filterResults(results, meetFilter, nomorFilter);
  const filterMiss = meetFilter !== "all" || nomorFilter !== "all";
  const remove = (r: Result) =>
    onDelete && canDeleteResult(hats, r.swimmerId) ? (
      <DeleteButton
        label={`Hapus hasil ${eventCode(r.distanceM, r.stroke)}`}
        description={`Catatan ${formatDateId(r.resultDate)} milik ${r.swimmerName} akan dihapus.`}
        onDelete={() => onDelete(r.id)}
      />
    ) : null;
  const time = (r: Result) =>
    r.status !== "selesai" ? r.status.toUpperCase() : formatTime(r.timeMs);
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
        <>
          <ul className="grid gap-3 md:hidden">
            {visible.map((r) => (
              <li key={r.id} className="rounded-2xl bg-card p-4 shadow-border">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {showSwimmer && <p className="mb-1 font-semibold">{r.swimmerName}</p>}
                    <p>{eventCode(r.distanceM, r.stroke, r.course)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDateId(r.resultDate)}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-xl">{time(r)}</p>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {r.kind === "official" ? "Hasil resmi" : "Tes latihan"}
                  {r.isPb ? " · Rekor pribadi" : ""}
                </p>
                <details className="mt-2">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
                    Detail catatan
                  </summary>
                  <p className="text-sm">
                    {r.meetName || "Tes latihan"}
                    {r.place ? ` · Peringkat ${r.place}` : ""}
                  </p>
                  {r.notes && <p className="mt-2 text-sm text-muted-foreground">{r.notes}</p>}
                  {remove(r)}
                </details>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl bg-card shadow-border md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Riwayat catatan waktu</caption>
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-3">Tanggal</th>
                  {showSwimmer && <th className="p-3">Perenang</th>}
                  <th className="p-3">Nomor / kolam</th>
                  <th className="p-3">Waktu / status</th>
                  <th className="p-3">Sumber</th>
                  <th className="p-3">Peringkat</th>
                  {onDelete && (
                    <th className="p-3">
                      <span className="sr-only">Tindakan</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">{formatDateId(r.resultDate)}</td>
                    {showSwimmer && <td className="p-3">{r.swimmerName}</td>}
                    <td className="p-3">{eventCode(r.distanceM, r.stroke, r.course)}</td>
                    <td className="p-3 font-mono">
                      {time(r)}
                      {r.isPb && (
                        <span className="block font-sans text-xs text-primary">Rekor pribadi</span>
                      )}
                    </td>
                    <td className="p-3">
                      {r.kind === "official" ? "Resmi" : "Tes latihan"}
                      <span className="block text-xs text-muted-foreground">{r.meetName}</span>
                    </td>
                    <td className="p-3">{r.place ?? "—"}</td>
                    {onDelete && <td className="p-3">{remove(r)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
