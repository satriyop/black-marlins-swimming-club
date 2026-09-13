import { QueryError } from "@/components/ui/query-error";
import { formatDateId } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createClubInvite,
  getAccess,
  getPublicClubContact,
  linkClubGuardian,
  listClubAccessHelp,
  listClubAdminHandoff,
  listClubInvites,
  listClubMembers,
  listMyClubAccessHelp,
  listSwimmers,
  saveClubSupportContact,
  recreateClubInvite,
  revokeClubInvite,
  revokeClubStaffRole,
  setClubStaffRole,
  resolveClubAccessHelp,
  submitClubAccessHelp,
  unlinkClubGuardian,
} from "@/lib/server/fns";
import { accessHelpKindLabel } from "@/lib/club/members";
import { canSeeUndangan } from "@/lib/club/nav";
import { AppShell, EmptyState, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, SelectNative } from "@/components/ui/input";
import type { StaffRole } from "@/lib/club/hats";

export const Route = createFileRoute("/undangan")({ component: Page });

function acceptUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function Page() {
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: () => getAccess() });
  const invites = useQuery({ queryKey: ["invites"], queryFn: () => listClubInvites() });
  const swimmers = useQuery({ queryKey: ["swimmers"], queryFn: () => listSwimmers() });
  const hats = access.data?.hats;
  const staffOk = hats?.staff === "superadmin" || hats?.staff === "club_admin";
  const familyOk = (hats?.guardianSwimmerIds.length ?? 0) > 0 || hats?.family === true;

  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<"staff" | "guardian" | "swimmer_account">(
    staffOk ? "staff" : "guardian",
  );
  const [role, setRole] = useState<StaffRole>("coach");
  const [swimmerId, setSwimmerId] = useState<number | "new" | "">("");

  const mut = useMutation({
    mutationFn: () =>
      createClubInvite({
        data: {
          kind,
          email,
          role: kind === "staff" ? role : undefined,
          swimmerIds:
            kind === "staff"
              ? undefined
              : swimmerId === "new" || swimmerId === ""
                ? []
                : [Number(swimmerId)],
        },
      }),
    onSuccess: async (res) => {
      const url = acceptUrl(res.acceptPath);
      const copied = await copyText(url);
      toast.success(copied ? "Undangan dibuat. Tautan disalin." : "Undangan dibuat.");
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (access.data && hats && !canSeeUndangan(hats)) {
    return (
      <AppShell>
        <EmptyState
          title="Tidak diizinkan"
          description="Halaman ini untuk admin klub, pelatih, dan wali."
        />
      </AppShell>
    );
  }

  const staffRoles: StaffRole[] =
    hats?.staff === "superadmin" ? ["club_admin", "coach", "superadmin"] : ["club_admin", "coach"];
  const swimmerName = (ids: number[] | undefined) =>
    (ids ?? [])
      .map((id) => swimmers.data?.find((s) => s.id === id)?.fullName ?? `#${id}`)
      .join(", ");

  return (
    <AppShell>
      <PageHeader
        kicker="Akses"
        title={staffOk ? "Anggota & undangan" : hats?.staff === "coach" ? "Akses klub" : "Undangan"}
        description={
          staffOk
            ? "Lihat akses yang sudah diterima, ubah peran, dan pulihkan undangan. Tautan dibagikan manual."
            : hats?.staff === "coach"
              ? "Undangan dan perubahan akses dikelola admin klub."
              : "Undang wali lain untuk anak Anda. Tautan dibagikan sendiri."
        }
      />
      {hats?.staff === "coach" && !staffOk ? <CoachHandoff /> : null}
      {staffOk ? <MembersDirectory /> : null}
      {familyOk && !staffOk ? <FamilyHelp /> : null}
      {staffOk ? (
        <HelpInbox />
      ) : null}
      {(staffOk || familyOk) && (
      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className="grid gap-3 rounded-2xl bg-card p-5 shadow-border"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Jenis">
            <SelectNative value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {staffOk ? <option value="staff">Staf klub</option> : null}
              {staffOk || familyOk ? <option value="guardian">Wali</option> : null}
              {staffOk || familyOk ? <option value="swimmer_account">Akun perenang</option> : null}
            </SelectNative>
          </Field>
          {kind === "staff" ? (
            <Field label="Peran">
              <SelectNative value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                {staffRoles
                  .filter((r) => r !== "superadmin" || hats?.staff === "superadmin")
                  .map((r) => (
                    <option key={r} value={r}>
                      {r === "club_admin" ? "Admin klub" : r === "coach" ? "Pelatih" : "Superadmin"}
                    </option>
                  ))}
              </SelectNative>
            </Field>
          ) : (
            <Field label="Perenang">
              <SelectNative
                value={swimmerId === "" || swimmerId === "new" ? swimmerId : String(swimmerId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setSwimmerId(v === "" || v === "new" ? v : Number(v));
                }}
                required
              >
                <option value="">{staffOk && kind === "guardian" ? "Pilih…" : "Pilih perenang"}</option>
                {staffOk && kind === "guardian" ? (
                  <option value="new">Anak belum di sistem</option>
                ) : null}
                {(swimmers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </SelectNative>
            </Field>
          )}
          {swimmers.isError && kind !== "staff" && <QueryError retry={() => swimmers.refetch()} />}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <p className="text-sm text-muted-foreground">
            {kind === "guardian" && staffOk
              ? "Pilih anak yang sudah di skuad, atau Anak belum di sistem jika orang tua akan mengisi data anak. Tautan berlaku 14 hari; salin dan bagikan sendiri."
              : "Undangan dibuat sebagai tautan. Salin dan bagikan sendiri kepada penerima."}
          </p>
          {mut.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mut.error.message}
            </p>
          )}
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? "Membuat…" : "Buat undangan"}
          </Button>
        </form>
        <div>
          {mut.isSuccess && (
            <div role="status" className="mb-5 rounded-2xl border border-primary/30 p-4">
              <h2 className="font-semibold">Tautan siap dibagikan</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Bagikan kepada penerima undangan. Tautan berlaku 14 hari.
              </p>
              <Input
                aria-label="Tautan undangan baru"
                readOnly
                value={acceptUrl(mut.data.acceptPath)}
                className="my-3"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                onClick={async () => {
                  if (await copyText(acceptUrl(mut.data.acceptPath)))
                    toast.success("Tautan disalin");
                  else toast.error("Salin tautan dari kotak di atas.");
                }}
              >
                Salin tautan
              </Button>
            </div>
          )}
          <h2 className="font-display mb-3 text-2xl">Undangan</h2>
          {invites.isPending ? (
            <p role="status">Memuat undangan…</p>
          ) : invites.isError ? (
            <QueryError retry={() => invites.refetch()} />
          ) : !invites.data?.length ? (
            <p className="text-sm text-muted-foreground">Belum ada undangan.</p>
          ) : (
            <ul className="grid gap-2">
              {invites.data.map((inv) => {
                const url = acceptUrl(inv.acceptPath);
                const status = inv.status ?? "pending";
                return (
                  <li
                    key={inv.id}
                    className="grid gap-2 rounded-2xl bg-card p-4 text-sm shadow-border"
                  >
                    <p className="font-medium">{inv.email}</p>
                    <p className="text-muted-foreground">
                      {inv.kind === "guardian"
                        ? "Wali"
                        : inv.kind === "swimmer_account"
                          ? "Akun perenang"
                          : "Staf"}
                      {inv.payload.role
                        ? ` · ${inv.payload.role === "coach" ? "Pelatih" : inv.payload.role === "club_admin" ? "Admin klub" : "Superadmin"}`
                        : ""}
                      {inv.kind === "guardian" && !inv.payload.swimmerIds?.length
                        ? " · Anak belum di sistem"
                        : inv.payload.swimmerIds?.length
                          ? ` · ${swimmerName(inv.payload.swimmerIds)}`
                          : ""}
                      {` · ${status === "pending" ? "Menunggu" : status === "accepted" ? "Diterima" : status === "expired" ? "Kedaluwarsa" : "Dibatalkan"}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inv.invitedBy ? `Oleh ${inv.invitedBy}` : "Diundang"}
                      {` · ${formatDateId(inv.expiresAt)}`}
                      {inv.acceptedAt ? ` · diterima ${formatDateId(inv.acceptedAt)}` : ""}
                      {inv.revokedAt ? ` · dicabut ${formatDateId(inv.revokedAt)}` : ""}
                    </p>
                    {status === "pending" || status === "expired" ? (
                      <div className="flex flex-wrap gap-2">
                        {status === "pending" ? (
                          <>
                            <Input
                              aria-label={`Tautan untuk ${inv.email}`}
                              readOnly
                              value={url}
                              className="font-mono text-xs"
                              onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={async () => {
                                const ok = await copyText(url);
                                toast.success(ok ? "Tautan disalin" : "Salin manual dari kotak tautan");
                              }}
                            >
                              Salin
                            </Button>
                          </>
                        ) : null}
                        {staffOk ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await revokeClubInvite({ data: { id: inv.id } });
                                  toast.success("Undangan dibatalkan");
                                  await qc.invalidateQueries({ queryKey: ["invites"] });
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Gagal");
                                }
                              }}
                            >
                              Cabut
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  const next = await recreateClubInvite({ data: { id: inv.id } });
                                  const copied = await copyText(acceptUrl(next.acceptPath));
                                  toast.success(
                                    copied
                                      ? "Tautan baru disalin. Bagikan sendiri; email tidak terkirim otomatis."
                                      : "Tautan baru dibuat. Bagikan sendiri.",
                                  );
                                  await qc.invalidateQueries({ queryKey: ["invites"] });
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Gagal");
                                }
                              }}
                            >
                              Buat tautan baru
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      )}
    </AppShell>
  );
}

function CoachHandoff() {
  const q = useQuery({ queryKey: ["admin-handoff"], queryFn: () => listClubAdminHandoff() });
  if (q.isPending) return <p role="status">Memuat admin…</p>;
  if (q.isError) return <QueryError retry={() => q.refetch()} />;
  return (
    <section className="mb-6 rounded-2xl bg-card p-5 shadow-border">
      <h2 className="font-display text-2xl">Hubungi admin klub</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pelatih tidak mengubah undangan atau peran. Minta admin untuk undangan, wali, dan akses.
      </p>
      <ul className="mt-3 grid gap-1 text-sm">
        {(q.data ?? []).map((a) => (
          <li key={a.email ?? a.name}>
            {a.name}
            {a.email ? ` · ${a.email}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MembersDirectory() {
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: () => getAccess() });
  const members = useQuery({ queryKey: ["members"], queryFn: () => listClubMembers() });
  const swimmers = useQuery({ queryKey: ["swimmers"], queryFn: () => listSwimmers() });
  const [linkUser, setLinkUser] = useState("");
  const [linkSwimmer, setLinkSwimmer] = useState<number | "">("");
  if (members.isPending) return <p role="status">Memuat anggota…</p>;
  if (members.isError) return <QueryError retry={() => members.refetch()} />;
  return (
    <section className="mb-8">
      <h2 className="font-display mb-3 text-2xl">Anggota aktif</h2>
      <ul className="grid gap-2">
        {(members.data ?? []).map((m) => (
          <li key={m.userId} className="rounded-2xl bg-card p-4 text-sm shadow-border">
            <p className="font-medium">{m.name}</p>
            <p className="text-muted-foreground">
              {m.email}
              {m.staffRole
                ? ` · ${m.staffRole === "coach" ? "Pelatih" : m.staffRole === "club_admin" ? "Admin klub" : "Superadmin"}`
                : ""}
              {m.swimmerNames.length ? ` · Wali: ${m.swimmerNames.join(", ")}` : m.family ? " · Wali (belum ada anak)" : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {m.staffRole ? (
                <>
                  <SelectNative
                    key={`${m.userId}-${m.staffRole}`}
                    value={m.staffRole}
                    onChange={async (e) => {
                      const role = e.target.value as StaffRole;
                      if (!confirm(`Ubah peran ${m.name} menjadi ${role}?`)) return;
                      try {
                        await setClubStaffRole({ data: { userId: m.userId, role } });
                        toast.success("Peran diperbarui");
                        await qc.invalidateQueries({ queryKey: ["members"] });
                        await qc.invalidateQueries({ queryKey: ["access"] });
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Gagal");
                      }
                    }}
                  >
                    <option value="coach">Pelatih</option>
                    <option value="club_admin">Admin klub</option>
                    {access.data?.hats.staff === "superadmin" ? (
                      <option value="superadmin">Superadmin</option>
                    ) : null}
                  </SelectNative>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      if (!confirm(`Cabut peran staf ${m.name}? Akses wali tetap ada.`)) return;
                      try {
                        await revokeClubStaffRole({ data: { userId: m.userId } });
                        toast.success("Peran staf dicabut");
                        await qc.invalidateQueries({ queryKey: ["members"] });
                        await qc.invalidateQueries({ queryKey: ["access"] });
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Gagal");
                      }
                    }}
                  >
                    Cabut staf
                  </Button>
                </>
              ) : null}
              {m.swimmerIds.map((id, i) => (
                <Button
                  key={id}
                  type="button"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Putuskan wali ${m.name} dari ${m.swimmerNames[i]}? Data atlet tetap ada.`)) return;
                    try {
                      await unlinkClubGuardian({ data: { userId: m.userId, swimmerId: id } });
                      toast.success("Tautan wali diputus");
                      await qc.invalidateQueries({ queryKey: ["members"] });
                      await qc.invalidateQueries({ queryKey: ["access"] });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Gagal");
                    }
                  }}
                >
                  Putuskan {m.swimmerNames[i]?.split(" ")[0]}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!linkUser || linkSwimmer === "") return;
          if (!confirm("Hubungkan wali ini ke perenang tersebut?")) return;
          try {
            await linkClubGuardian({ data: { userId: linkUser, swimmerId: Number(linkSwimmer) } });
            toast.success("Wali dihubungkan");
            setLinkUser("");
            setLinkSwimmer("");
            await qc.invalidateQueries({ queryKey: ["members"] });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal");
          }
        }}
      >
        <Field label="Hubungkan wali yang sudah ada">
          <SelectNative value={linkUser} onChange={(e) => setLinkUser(e.target.value)}>
            <option value="">Pilih anggota</option>
            {(members.data ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Perenang">
          <SelectNative
            value={linkSwimmer === "" ? "" : String(linkSwimmer)}
            onChange={(e) => setLinkSwimmer(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Pilih perenang</option>
            {(swimmers.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Button type="submit" variant="outline">
          Hubungkan
        </Button>
      </form>
      <SupportContactForm />
    </section>
  );
}

function SupportContactForm() {
  const contact = useQuery({ queryKey: ["public-contact"], queryFn: () => getPublicClubContact() });
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!contact.data) return;
    setEmail(contact.data.supportEmail ?? "");
    setPhone(contact.data.supportPhone ?? "");
    setUrl(contact.data.supportUrl ?? "");
  }, [contact.data]);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => saveClubSupportContact({ data: { email, phone, url } }),
    onSuccess: async () => {
      toast.success("Kontak bantuan disimpan");
      await qc.invalidateQueries({ queryKey: ["public-contact"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="mt-6 grid gap-2 rounded-2xl bg-muted/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <h3 className="font-medium">Kontak bantuan publik</h3>
      <p className="text-xs text-muted-foreground">
        Tampil di undangan gagal dan akun belum diundang. Tidak menampilkan nama anggota.
      </p>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Telepon">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Tautan https">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Button type="submit" variant="outline" disabled={mut.isPending}>
        Simpan kontak
      </Button>
    </form>
  );
}

function FamilyHelp() {
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"missing_child" | "wrong_link">("missing_child");
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ["my-access-help"], queryFn: () => listMyClubAccessHelp() });
  const latest = mine.data?.[0];
  const mut = useMutation({
    mutationFn: () => submitClubAccessHelp({ data: { kind, message } }),
    onSuccess: async () => {
      toast.success("Permintaan terkirim ke admin klub");
      setMessage("");
      await qc.invalidateQueries({ queryKey: ["my-access-help"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      className="mb-6 grid gap-3 rounded-2xl bg-card p-5 shadow-border"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <h2 className="font-display text-2xl">Anak belum terhubung?</h2>
      <p className="text-sm text-muted-foreground">
        Jangan cari anak lain di skuad. Kirim permintaan ke admin klub.
      </p>
      {latest ? (
        <p className="text-sm">
          Permintaan terakhir: {accessHelpKindLabel(latest.kind)} ·{" "}
          {latest.resolved_at ? "selesai" : "menunggu"}
        </p>
      ) : null}
      <Field label="Jenis">
        <SelectNative value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="missing_child">Anak belum terhubung</option>
          <option value="wrong_link">Tautan wali salah</option>
        </SelectNative>
      </Field>
      <Field label="Pesan">
        <Input required value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <Button type="submit" variant="outline" disabled={mut.isPending}>
        Kirim ke admin
      </Button>
    </form>
  );
}

function HelpInbox() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["access-help"], queryFn: () => listClubAccessHelp() });
  if (q.isPending) return null;
  if (q.isError) return <QueryError retry={() => q.refetch()} />;
  if (!q.data?.length) return null;
  return (
    <section className="mb-6 rounded-2xl border border-primary/30 p-5">
      <h2 className="font-display text-2xl">Permintaan akses</h2>
      <ul className="mt-3 grid gap-2 text-sm">
        {q.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-2">
            <p>
              <span className="font-medium">{r.name}</span>
              {r.email ? ` · ${r.email}` : ""}
              {` · ${formatDateId(r.created_at)} · `}
              {accessHelpKindLabel(r.kind)}: {r.message}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await resolveClubAccessHelp({ data: { id: r.id } });
                  await qc.invalidateQueries({ queryKey: ["access-help"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Gagal");
                }
              }}
            >
              Selesai
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
