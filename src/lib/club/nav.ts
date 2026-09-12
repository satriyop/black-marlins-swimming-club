import type { Hats } from "./hats";
import { isInvited } from "./access";

export type NavItem = {
  to: "/" | "/perenang" | "/latihan" | "/event" | "/aktivitas" | "/undangan" | "/pengumuman";
  label: string;
};

export function canSeeUndangan(hats: Hats): boolean {
  return (
    hats.staff === "superadmin" || hats.staff === "club_admin" || hats.guardianSwimmerIds.length > 0
  );
}

export function homePracticeCta(hats: Hats): "staff" | "izin" | "enroll" | "program" {
  if (hats.staff != null) return "staff";
  if (hats.guardianSwimmerIds.length > 0) return "izin";
  if (hats.family === true) return "enroll";
  return "program";
}

export function navItemsFor(hats: Hats): NavItem[] {
  if (!isInvited(hats)) {
    return [{ to: "/", label: "Hari Ini" }];
  }
  const items: NavItem[] = [
    { to: "/", label: "Hari Ini" },
    { to: "/latihan", label: "Latihan" },
    { to: "/perenang", label: "Perenang" },
    { to: "/event", label: "Kejuaraan" },
    { to: "/pengumuman", label: "Pengumuman" },
    { to: "/aktivitas", label: "Aktivitas" },
  ];
  if (canSeeUndangan(hats)) {
    items.push({ to: "/undangan", label: "Undangan" });
  }
  return items;
}
