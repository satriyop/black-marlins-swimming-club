import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { listSyncConflicts, resolveSyncConflict } from "@/lib/server/fns";
import { fieldLabel } from "@/lib/club/sync-conflicts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/** Badge + review dialog for pending sync_conflicts rows. Currently used on
 *  the Kejuaraan page for meet conflicts; the same component and server
 *  functions work for swimmer conflicts once that sync exists (entityType
 *  is already part of the data shape). */
export function SyncConflictReview() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sync-conflicts"], queryFn: () => listSyncConflicts() });
  const mut = useMutation({
    mutationFn: (input: { id: number; resolution: "kept_local" | "used_incoming" }) =>
      resolveSyncConflict({ data: input }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sync-conflicts"] });
      await qc.invalidateQueries({ queryKey: ["meets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.length) return null;

  const byEntity = new Map<string, typeof data>();
  for (const c of data) {
    const key = `${c.entityType}:${c.entityId}`;
    byEntity.set(key, [...(byEntity.get(key) ?? []), c]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-left">
          <Badge tone="warn" className="gap-1.5">
            <TriangleAlert className="size-3.5" />
            {data.length} data perlu ditinjau
          </Badge>
        </button>
      </DialogTrigger>
      <DialogContent
        title="Tinjau data dari Spectra SwimPro"
        description="Data lokal berbeda dari Spectra SwimPro. Pilih data mana yang dipakai untuk tiap kolom."
      >
        <div className="grid gap-4">
          {[...byEntity.entries()].map(([key, conflicts]) => (
            <div key={key} className="rounded-xl bg-muted/50 p-3">
              <p className="mb-2 text-sm font-semibold">{conflicts[0].entityLabel}</p>
              <div className="grid gap-2">
                {conflicts.map((c) => (
                  <div key={c.id} className="rounded-lg bg-card p-3 shadow-border">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {fieldLabel(c.fieldName)}
                    </p>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Data lokal</p>
                        <p className="font-medium">{c.localValue || "–"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Dari Spectra SwimPro</p>
                        <p className="font-medium">{c.incomingValue || "–"}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={mut.isPending}
                        onClick={() => mut.mutate({ id: c.id, resolution: "kept_local" })}
                      >
                        Pakai data lokal
                      </Button>
                      <Button
                        size="sm"
                        disabled={mut.isPending}
                        onClick={() => mut.mutate({ id: c.id, resolution: "used_incoming" })}
                      >
                        Pakai data Spectra
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
