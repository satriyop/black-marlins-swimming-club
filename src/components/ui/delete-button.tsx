import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTrigger } from "./dialog";

export function DeleteButton({
  label,
  description,
  onDelete,
}: {
  label: string;
  description: string;
  onDelete: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent title={label} description={description}>
        <p className="mb-4 text-sm text-muted-foreground">Tindakan ini tidak dapat dibatalkan.</p>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await onDelete();
                setOpen(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Gagal menghapus. Coba lagi.");
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Menghapus…" : "Ya, hapus"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
