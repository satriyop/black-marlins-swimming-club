import { Link } from "@tanstack/react-router";
import { classifyQueryError } from "@/lib/ui/classify-query-error";
import { Button } from "./button";

export function ResourceQueryError({ error, retry }: { error: unknown; retry: () => unknown }) {
  const kind = classifyQueryError(error);
  return (
    <QueryError
      message={kind.message}
      denied={kind.denied}
      missing={kind.missing}
      retry={kind.denied || kind.missing ? undefined : retry}
    />
  );
}

export function QueryError({
  retry,
  message = "Data belum berhasil dimuat. Periksa koneksi lalu coba lagi.",
  denied = false,
  missing = false,
}: {
  retry?: () => unknown;
  message?: string;
  denied?: boolean;
  missing?: boolean;
}) {
  return (
    <div
      role="alert"
      className="grid justify-items-start gap-3 rounded-2xl border border-destructive/40 bg-card p-5"
    >
      <p className="text-sm">{message}</p>
      <div className="flex flex-wrap gap-2">
        {denied || missing || !retry ? (
          <Button asChild variant="outline">
            <Link to="/">Ke Hari Ini</Link>
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void retry()}>
            Coba lagi
          </Button>
        )}
      </div>
    </div>
  );
}
