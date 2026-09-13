import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Button } from "../../src/components/ui/button";
import { Badge } from "../../src/components/ui/badge";
import { Field, Input, SelectNative } from "../../src/components/ui/input";
import { Dialog, DialogTrigger, DialogContent } from "../../src/components/ui/dialog";
import { QueryError } from "../../src/components/ui/query-error";
import { PageHeader, EmptyState } from "../../src/components/ui/page-header";
import "../../src/styles.css";

export function Showcase() {
  const [saved, setSaved] = useState(false);
  const [retried, setRetried] = useState(false);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        kicker="Black Marlins"
        title="Komponen antarmuka"
        description="Fixture lokal: nama, jadwal, dan status untuk peninjauan visual."
      />
      <section className="space-y-4 rounded-2xl bg-card p-5">
        <h2 className="text-section-title">Status sesi</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="pool">Informasi klub</Badge>
          <Badge tone="ok">Tersimpan</Badge>
          <Badge tone="warn">Menunggu konfirmasi</Badge>
          <Badge tone="danger">Dibatalkan</Badge>
          <Badge>Selesai</Badge>
          <Badge tone="info">Jadwal tersedia</Badge>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setSaved(true)}>Simpan perubahan</Button>
          <Button variant="outline" aria-pressed>
            Buka program
          </Button>
          <Button variant="ghost">Riwayat sesi</Button>
          <Button variant="destructive">Batalkan sesi</Button>
          <Button disabled>Menyimpan…</Button>
        </div>
        {saved && <p role="status">Perubahan tersimpan.</p>}
      </section>
      <form
        className="grid gap-4 rounded-2xl bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
      >
        <h2 className="text-section-title">Data latihan</h2>
        <Field label="Nama perenang" hint="Contoh nama panjang untuk memeriksa pembungkusan teks.">
          <Input defaultValue="Perenang Contoh Dengan Nama Panjang" />
        </Field>
        <Field label="Tanggal latihan">
          <Input type="date" defaultValue="2026-09-13" />
        </Field>
        <Field label="Status kehadiran">
          <SelectNative defaultValue="belum">
            <option value="belum">Belum dicatat</option>
            <option value="hadir">Hadir</option>
          </SelectNative>
        </Field>
        <Field label="Catatan latihan" hint="Nilai yang sudah diketik harus tetap tersedia.">
          <Input />
        </Field>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Buka konfirmasi</Button>
          </DialogTrigger>
          <DialogContent
            title="Periksa perubahan jadwal latihan"
            description="Pastikan jadwal dan lokasi yang baru sudah benar."
          >
            <p className="mb-4">Sabtu, 13 September · Kolam contoh.</p>
            <Field label="Lokasi baru">
              <Input defaultValue="Kolam utama" />
            </Field>
            <Button className="mt-4" onClick={() => setSaved(true)}>
              Simpan jadwal
            </Button>
          </DialogContent>
        </Dialog>
      </form>
      <QueryError retry={() => setRetried(true)} />
      {retried && <p role="status">Permintaan dicoba kembali.</p>}
      <EmptyState
        title="Belum ada catatan waktu"
        description="Catatan resmi dan tes latihan akan muncul setelah dicatat."
        action={<Button variant="outline">Lihat program latihan berikutnya</Button>}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Showcase />);
