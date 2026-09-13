import type { Hats } from "./hats";
import { isFamilyMember } from "./hats";

export type TaskView = "club" | "family" | "self";

export function isDualRole(hats: Hats): boolean {
  return hats.staff != null && isFamilyMember(hats);
}

export function roleLabels(hats: Hats): string[] {
  const labels: string[] = [];
  if (hats.staff === "superadmin") labels.push("Superadmin");
  else if (hats.staff === "club_admin") labels.push("Admin klub");
  else if (hats.staff === "coach") labels.push("Pelatih");
  if (isFamilyMember(hats)) labels.push("Wali");
  if (hats.selfSwimmerId != null) labels.push("Perenang");
  return labels;
}

export function defaultTaskView(hats: Hats, saved: TaskView | null): TaskView {
  const allowed = allowedTaskViews(hats);
  if (saved && allowed.includes(saved)) return saved;
  if (allowed.includes("family") && hats.guardianSwimmerIds.length > 0) return "family";
  return allowed[0] ?? "family";
}

export function allowedTaskViews(hats: Hats): TaskView[] {
  const views: TaskView[] = [];
  if (hats.staff != null) views.push("club");
  if (isFamilyMember(hats)) views.push("family");
  if (hats.selfSwimmerId != null && !views.includes("family")) views.push("self");
  return views;
}
