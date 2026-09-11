import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createClubInvite, getAccess, listClubInvites, listSwimmers } from "@/lib/server/fns";
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
  const familyOk = (hats?.guardianSwimmerIds.length ?? 0) > 0;

  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<"staff" | "guardian" | "swimmer_account">(staffOk ? "staff" : "guardian");
  const [role, setRole] = useState<StaffRole>("coach");
  const [swimmerId, setSwimmerId] = useState<number | "">("");

  const mut = useMutation({
    mutationFn: () =>
      createClubInvite({
        data: {
          kind,
          email,
          role: kind === "staff" ? role : undefined,
          swimmerIds: kind === "staff" ? undefined : swimmerId === "" ? undefined : [Number(swimmerId)],
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
        <EmptyState title="Tidak diizinkan" description="Halaman undangan hanya untuk admin klub, superadmin, dan wali." />
      </AppShell>
    );
  }

  const staffRoles: StaffRole[] = hats?.staff === "superadmin" ? ["club_admin", "coach", "superadmin"] : ["club_admin", "coach"];
  const swimmerName = (ids: number[] | undefined) =>
    (ids ?? [])
      .map((id) => swimmers.data?.find((s) => s.id === id)?.fullName ?? `#${id}`)
      .join(", ");

  return (
    <AppShell>
      <PageHeader kicker="Akses" title="Undangan" description="Undang staf, wali, atau buat akun perenang. Tidak ada pendaftaran terbuka." />
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
                {staffRoles.filter((r) => r !== "superadmin" || hats?.staff === "superadmin").map((r) => (
                  <option key={r} value={r}>{r === "club_admin" ? "Admin klub" : r === "coach" ? "Pelatih" : "Superadmin"}</option>
                ))}
              </SelectNative>
            </Field>
          ) : (
            <Field label="Perenang">
              <SelectNative value={swimmerId === "" ? "" : String(swimmerId)} onChange={(e) => setSwimmerId(e.target.value ? Number(e.target.value) : "")} required>
                <option value="">Pilih perenang</option>
                {(swimmers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.fullName}</option>
                ))}
              </SelectNative>
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Mengirim…" : "Buat undangan"}</Button>
        </form>
        <div>
          <h2 className="font-display mb-3 text-2xl">Menunggu diterima</h2>
          {!invites.data?.length ? (
            <p className="text-sm text-muted-foreground">Belum ada undangan aktif.</p>
          ) : (
            <ul className="grid gap-2">
              {invites.data.map((inv) => {
                const url = acceptUrl(inv.acceptPath);
                return (
                  <li key={inv.id} className="grid gap-2 rounded-2xl bg-card p-4 text-sm shadow-border">
                    <p className="font-medium">{inv.email}</p>
                    <p className="text-muted-foreground">
                      {inv.kind === "guardian" ? "Wali" : inv.kind === "swimmer_account" ? "Akun perenang" : "Staf"}
                      {inv.payload.role ? ` · ${inv.payload.role === "coach" ? "Pelatih" : inv.payload.role === "club_admin" ? "Admin klub" : "Superadmin"}` : ""}
                      {inv.payload.swimmerIds?.length ? ` · ${swimmerName(inv.payload.swimmerIds)}` : ""}
                    </p>
                    <div className="flex gap-2">
                      <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
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
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
