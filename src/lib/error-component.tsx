import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppErrorComponent(_props: ErrorComponentProps) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <span className="text-destructive" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">
        {offline ? "Tidak ada koneksi" : "Halaman belum bisa dibuka"}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {offline
          ? "Sambungkan perangkat ke internet, lalu coba lagi."
          : "Terjadi kendala saat membuka halaman. Isian di halaman sebelumnya tidak dikirim ulang otomatis."}
      </p>
      <Button type="button" variant="outline" onClick={() => window.location.reload()}>
        Coba lagi
      </Button>
    </main>
  );
}
