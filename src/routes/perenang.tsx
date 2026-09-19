import { useAccess } from "@/lib/club/use-access";
import { canCreateClubSwimmer, canEnrollOwnChild } from "@/lib/club/permissions";
import { isFamilyMember } from "@/lib/club/hats";
import { QueryError } from "@/components/ui/query-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { listSwimmers, linkSpectraSwimmer, matchSpectraSwimmer, saveSwimmer } from "@/lib/server/fns";
import type { SpectraMatch } from "@/lib/server/fns-spectra";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { SwimmerAvatar } from "@/components/swim/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, SelectNative, Textarea } from "@/components/ui/input";
import { GENDERS, SWIMMER_STATUSES } from "@/lib/swim/constants";
import { formatDateId, todayIso } from "@/lib/utils";

export const Route = createFileRoute("/perenang")({ component: Page });

function Page() {
  const { hats, taskView } = useAccess();
  const familyView = taskView === "family";
  const rosterCreate = canCreateClubSwimmer(hats) && !familyView;
  const enroll = canEnrollOwnChild(hats);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["swimmers"],
    queryFn: () => listSwimmers(),
  });
  const visible = (data ?? []).filter((s) =>
    familyView ? hats.guardianSwimmerIds.includes(s.id) || s.id === hats.selfSwimmerId : true,
  );
  const empty = !isPending && !isError && visible.length === 0;
  const createActions =
    rosterCreate || enroll ? (
      <div className="flex flex-wrap gap-2">
        {rosterCreate ? <SwimmerDialog /> : null}
        {enroll ? <SwimmerDialog asChild /> : null}
      </div>
    ) : undefined;

  return (
    <AppShell>
      <PageHeader
        kicker={familyView ? "Anak saya" : hats.staff ? "Skuad" : "Anak saya"}
        title={familyView ? "Anak saya" : "Perenang"}
        description={
          familyView
            ? "Anak yang terhubung dengan akun Anda."
            : "Anggota Black Marlins Swimming Club. Kelompok umur mengikuti aturan PRSI (usia per 31 Desember)."
        }
        action={empty ? undefined : createActions}
      />
      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <QueryError retry={() => refetch()} />
      ) : !visible.length ? (
        <EmptyState
          title={isFamilyMember(hats) && !hats.staff ? "Belum ada anak terdaftar" : "Belum ada perenang"}
          description={
            enroll
              ? "Daftarkan anak Anda untuk mulai melihat latihan dan catatan waktu."
              : rosterCreate
                ? "Tambahkan anggota klub untuk mulai mencatat latihan dan prestasi."
                : hats.staff === "coach"
                  ? "Admin klub mendaftarkan perenang. Pelatih merencanakan sesi dan mencatat kehadiran."
                  : "Perenang yang terhubung dengan akun Anda akan tampil di sini."
          }
          action={createActions}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <Link
              key={s.id}
              to="/perenang/$id"
              params={{ id: String(s.id) }}
              className="rounded-2xl bg-card p-5 shadow-border transition-transform duration-150 hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-3">
                <SwimmerAvatar name={s.fullName} size="lg" />
                <div className="min-w-0">
                  <p className="font-semibold">{s.fullName}</p>
                  <p className="text-sm text-muted-foreground">{s.nickname ?? "—"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="pool">{s.ageGroupLabel}</Badge>
                    <Badge>{s.gender}</Badge>
                    <Badge tone={s.status === "aktif" ? "ok" : "muted"}>{s.status}</Badge>
                  </div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <dt>Lahir</dt>
                  <dd className="text-foreground">{formatDateId(s.dateOfBirth, "d MMM yyyy")}</dd>
                </div>
                <div>
                  <dt>Usia / KU {new Date().getFullYear()}</dt>
                  <dd className="text-foreground">
                    {s.age} th · {s.ageGroupRange}
                  </dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function SwimmerDialog({
  initial,
  asChild = false,
  variant = "default",
}: {
  initial?: {
    id: number;
    fullName: string;
    nickname: string | null;
    dateOfBirth: string;
    gender: "putra" | "putri";
    city: string | null;
    status: "aktif" | "cuti" | "alumni";
    joinDate: string | null;
    notes: string | null;
    spectraAthleteId: string | null;
  };
  asChild?: boolean;
  variant?: "default" | "outline";
}) {
  const { hats } = useAccess();
  const [open, setOpen] = useState(false);
  const [confirmSimilar, setConfirmSimilar] = useState(false);
  const [matches, setMatches] = useState<SpectraMatch[] | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<SpectraMatch | null>(null);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fullName: initial?.fullName ?? "",
    nickname: initial?.nickname ?? "",
    dateOfBirth: initial?.dateOfBirth ?? "",
    gender: initial?.gender ?? "putra",
    city: initial?.city ?? "Klaten",
    status: initial?.status ?? "aktif",
    joinDate: initial?.joinDate ?? todayIso(),
    notes: initial?.notes ?? "",
  });
  const searchMut = useMutation({
    mutationFn: () =>
      matchSpectraSwimmer({ data: { fullName: form.fullName, gender: form.gender as "putra" | "putri" } }),
    onSuccess: (found) => {
      setMatches(found);
      if (found.length === 1) {
        setSelectedMatch(found[0]);
        if (found[0].dateOfBirth) setForm((f) => ({ ...f, dateOfBirth: found[0].dateOfBirth! }));
      } else {
        setSelectedMatch(null);
      }
    },
    onError: () => setMatches(null),
  });
  const mut = useMutation({
    mutationFn: () =>
      saveSwimmer({
        data: {
          id: initial?.id,
          fullName: form.fullName,
          nickname: form.nickname,
          dateOfBirth: form.dateOfBirth,
          gender: form.gender as "putra" | "putri",
          city: form.city,
          status: form.status as "aktif" | "cuti" | "alumni",
          joinDate: form.joinDate,
          notes: form.notes,
          asChild: !initial && asChild,
          confirmSimilar,
        },
      }),
    onSuccess: async (res) => {
      if (selectedMatch) {
        try {
          await linkSpectraSwimmer({ data: { swimmerId: res.id, match: selectedMatch } });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Gagal menautkan ke Spectra SwimPro");
        }
      }
      toast.success(
        initial ? "Data perenang diperbarui" : asChild ? "Anak didaftarkan" : "Perenang ditambahkan",
      );
      setConfirmSimilar(false);
      setMatches(null);
      setSelectedMatch(null);
      setOpen(false);
      await qc.invalidateQueries();
    },
    onError: (e: Error) => {
      if (/Simpan lagi/.test(e.message)) setConfirmSimilar(true);
      toast.error(e.message);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmSimilar(false);
          setMatches(null);
          setSelectedMatch(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus className="size-4" />
          {initial ? "Ubah data" : asChild ? "Daftarkan anak" : "Tambah perenang"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={initial ? "Ubah perenang" : asChild ? "Daftarkan anak" : "Perenang baru"}
        description={
          asChild
            ? "Data anak Anda. Setelah disimpan, anak tampil di Anak saya."
            : "Data anggota untuk kelompok umur PRSI dan laporan prestasi."
        }
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Nama lengkap">
            <Input
              required
              value={form.fullName}
              onChange={(e) => {
                setConfirmSimilar(false);
                setMatches(null);
                setSelectedMatch(null);
                setForm({ ...form, fullName: e.target.value });
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama panggilan">
              <Input
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              />
            </Field>
            <Field label="Tanggal lahir">
              <Input
                required
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => {
                  setConfirmSimilar(false);
                  setForm({ ...form, dateOfBirth: e.target.value });
                }}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Putra / putri">
              <SelectNative
                value={form.gender}
                onChange={(e) => {
                  setMatches(null);
                  setSelectedMatch(null);
                  setForm({ ...form, gender: e.target.value as "putra" | "putri" });
                }}
              >
                {GENDERS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </SelectNative>
            </Field>
            {asChild && !initial ? (
              <Field label="Kota">
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </Field>
            ) : (
              <Field label="Status">
                <SelectNative
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
                >
                  {SWIMMER_STATUSES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </SelectNative>
              </Field>
            )}
          </div>
          {!initial || !initial.spectraAthleteId ? (
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {initial ? "Belum terhubung ke Spectra SwimPro" : "Spectra SwimPro"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!form.fullName.trim() || searchMut.isPending}
                  onClick={() => searchMut.mutate()}
                >
                  {searchMut.isPending ? "Mencari…" : "Cari di Spectra SwimPro"}
                </Button>
              </div>
              {matches !== null && matches.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tidak ada perenang yang cocok di Spectra. Periksa nama dan jenis kelamin, atau isi data secara manual.
                </p>
              ) : null}
              {searchMut.isError ? (
                <p className="mt-2 text-xs text-destructive">
                  {searchMut.error instanceof Error
                    ? searchMut.error.message
                    : "Spectra sedang tidak dapat dihubungi. Coba lagi."}
                </p>
              ) : null}
              {matches !== null && matches.length === 1 ? (
                <p className="mt-2 text-xs text-success">
                  Cocok: {matches[0].fullName} · {matches[0].club ?? "-"} (ID {matches[0].athleteId})
                </p>
              ) : null}
              {matches !== null && matches.length > 1 ? (
                <div className="mt-2 grid gap-1.5">
                  <p className="text-xs text-muted-foreground">
                    Ditemukan beberapa kemungkinan, pilih salah satu:
                  </p>
                  {matches.map((m) => (
                    <label key={m.athleteId} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="spectraMatch"
                        checked={selectedMatch?.athleteId === m.athleteId}
                        onChange={() => {
                          setSelectedMatch(m);
                          if (m.dateOfBirth) setForm((f) => ({ ...f, dateOfBirth: m.dateOfBirth! }));
                        }}
                      />
                      {m.fullName} · {m.club ?? "-"} (ID {m.athleteId})
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {asChild && !initial ? null : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kota">
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </Field>
                <Field label="Bergabung">
                  <Input
                    type="date"
                    value={form.joinDate}
                    onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
                  />
                </Field>
              </div>
              {hats.staff ? (
                <Field label="Catatan internal staf">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </Field>
              ) : null}
            </>
          )}
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
