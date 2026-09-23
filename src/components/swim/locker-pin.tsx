import { setSwimmerLockerPin } from "@/lib/server/fns";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

export function LockerPinCard({
  swimmerId,
  hasPin,
}: {
  swimmerId: number;
  hasPin: boolean;
}) {
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const save = useMutation({
    mutationFn: () => setSwimmerLockerPin({ data: { swimmerId, pin } }),
    onSuccess: async () => {
      setPin("");
      setAgain("");
      toast.success(hasPin ? "PIN loker diganti" : "PIN loker diatur");
      await qc.invalidateQueries({ queryKey: ["swimmer", swimmerId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <section className="mb-6 rounded-2xl bg-card p-5 shadow-border">
      <h2 className="font-display text-2xl">PIN loker</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasPin ? "PIN sudah diatur." : "Belum ada PIN."} Empat angka. Dipakai nanti di tablet kolam.
        Wali yang mengatur; admin klub hanya jika perenang belum punya wali.
      </p>
      <form
        className="mt-4 grid max-w-xs gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (pin !== again) {
            toast.error("PIN tidak sama.");
            return;
          }
          save.mutate();
        }}
      >
        <Field label={hasPin ? "PIN baru" : "PIN"}>
          <Input
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </Field>
        <Field label="Ulangi PIN">
          <Input
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d{4}"
            maxLength={4}
            value={again}
            onChange={(event) => setAgain(event.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </Field>
        <Button type="submit" disabled={save.isPending || pin.length !== 4}>
          {save.isPending ? "Menyimpan…" : hasPin ? "Ganti PIN" : "Atur PIN"}
        </Button>
      </form>
    </section>
  );
}
