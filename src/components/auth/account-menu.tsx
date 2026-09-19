import * as Popover from "@radix-ui/react-popover";
import * as Avatar from "@radix-ui/react-avatar";
import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { AppearanceSelect } from "@/components/settings/appearance-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AppUser } from "@/lib/auth/use-current-user";

export function AccountMenu({
  user,
  roles,
  onSignOut,
  children,
}: {
  user: AppUser;
  roles: string[];
  onSignOut?: () => Promise<void>;
  children?: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const name = user.displayName || user.primaryEmail || "Akun";
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Buka menu akun"
          className="grid size-11 shrink-0 place-items-center rounded-full border border-input bg-card hover:bg-muted"
        >
          <Avatar.Root className="grid size-9 place-items-center overflow-hidden rounded-full bg-selected text-sm font-semibold text-foreground">
            {user.profileImageUrl && (
              <Avatar.Image src={user.profileImageUrl} alt="" className="size-full object-cover" />
            )}
            <Avatar.Fallback aria-hidden="true">{initials}</Avatar.Fallback>
          </Avatar.Root>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label="Akun"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 grid max-h-[var(--radix-popover-content-available-height)] w-[min(24rem,calc(100vw-1.5rem))] gap-5 overflow-y-auto rounded-2xl border border-input bg-popover p-4 text-popover-foreground shadow-elevated"
        >
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h2 className="min-w-0 text-card-title break-words">{name}</h2>
              <Popover.Close asChild>
                <Button size="icon" variant="ghost" aria-label="Tutup menu akun" className="shrink-0">
                  <X />
                </Button>
              </Popover.Close>
            </div>
            {user.primaryEmail && (
              <p className="min-w-0 break-all text-sm text-muted-foreground" title={user.primaryEmail}>
                {user.primaryEmail}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Peran akun">
            {roles.length ? (
              roles.map((role) => <Badge key={role}>{role}</Badge>)
            ) : (
              <p className="text-sm text-muted-foreground">Belum terhubung ke klub</p>
            )}
          </div>
          {children}
          <AppearanceSelect />
          {onSignOut && (
            <div className="grid gap-2 border-t border-border pt-4">
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  Belum berhasil keluar. Periksa koneksi lalu coba lagi.
                </p>
              )}
              <Button
                variant="outline"
                disabled={pending}
                aria-busy={pending}
                onClick={async () => {
                  setPending(true);
                  setError(false);
                  try {
                    await onSignOut();
                  } catch {
                    setError(true);
                    setPending(false);
                  }
                }}
              >
                {pending ? "Keluar…" : "Keluar"}
              </Button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
