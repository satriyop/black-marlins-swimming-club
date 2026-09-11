import type { Hats } from "./hats";
import { isInvited } from "./access";

export type NavItem = {
  to: "/" | "/perenang" | "/latihan" | "/event" | "/aktivitas" | "/undangan";
  label: string;
};

export function canSeeUndangan(hats: Hats): boolean {
  return hats.staff === "superadmin" || hats.staff === "club_admin" || hats.guardianSwimmerIds.length > 0;
}

export function navItemsFor(hats: Hats): NavItem[] {
  if (!isInvited(hats)) {
    return [{ to: "/", label: "Dasbor" }];
  }
  const items: NavItem[] = [
    { to: "/", label: "Dasbor" },
    { to: "/perenang", label: "Perenang" },
    { to: "/latihan", label: "Latihan" },
    { to: "/event", label: "Event" },
    { to: "/aktivitas", label: "Aktivitas" },
  ];
  if (canSeeUndangan(hats)) {
    items.push({ to: "/undangan", label: "Undangan" });
  }
  return items;
}
