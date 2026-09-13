import { Button } from "./button";

export function QueryError({
  retry,
  message = "Data belum berhasil dimuat. Periksa koneksi lalu coba lagi.",
}: {
  retry: () => unknown;
  message?: string;
}) {
  return (
    <div
      role="alert"
      className="grid justify-items-start gap-3 rounded-2xl border border-destructive bg-card p-5"
    >
      <p className="text-base">{message}</p>
      <Button variant="outline" onClick={() => void retry()}>
        Coba lagi
      </Button>
    </div>
  );
}
