import type { Hats, StaffRole } from "./hats";

export function canWriteRoster(hats: Hats, swimmerId?: number): boolean {
  if (hats.staff === "superadmin" || hats.staff === "club_admin") return true;
  if (swimmerId != null && hats.guardianSwimmerIds.includes(swimmerId)) return true;
  return false;
}

export function canCreateClubSwimmer(hats: Hats): boolean {
  return hats.staff === "superadmin" || hats.staff === "club_admin";
}

export function canEnrollOwnChild(hats: Hats): boolean {
  return hats.family === true || hats.guardianSwimmerIds.length > 0 || canCreateClubSwimmer(hats);
}

export function canWritePractice(hats: Hats): boolean {
  return hats.staff != null;
}

export function canWriteOfficialResult(hats: Hats, swimmerId: number): boolean {
  if (hats.staff != null) return true;
  return hats.selfSwimmerId === swimmerId;
}

export function canWriteTestTime(hats: Hats, swimmerId: number): boolean {
  if (hats.staff != null) return true;
  return hats.guardianSwimmerIds.includes(swimmerId);
}

export function canEditResult(
  hats: Hats,
  result: { kind: "official" | "test"; swimmerId: number },
): boolean {
  return result.kind === "official"
    ? canWriteOfficialResult(hats, result.swimmerId)
    : canWriteTestTime(hats, result.swimmerId);
}

export function canInviteStaff(hats: Hats, role: StaffRole): boolean {
  if (hats.staff === "superadmin") return true;
  if (hats.staff === "club_admin") return role === "club_admin" || role === "coach";
  return false;
}

export function canRevokeStaff(hats: Hats, targetRole: StaffRole, remainingSuperadmins: number): boolean {
  if (targetRole === "superadmin") {
    if (hats.staff !== "superadmin") return false;
    return remainingSuperadmins > 1;
  }
  return hats.staff === "superadmin" || hats.staff === "club_admin";
}

export function canInviteGuardian(hats: Hats): boolean {
  return hats.staff === "superadmin" || hats.staff === "club_admin" || hats.guardianSwimmerIds.length > 0;
}

export function canWriteActivity(hats: Hats): boolean {
  return hats.staff === "superadmin" || hats.staff === "club_admin";
}

export function canPostAnnouncement(hats: Hats): boolean {
  return hats.staff != null;
}

export function canWriteClubProfile(hats: Hats): boolean {
  return hats.staff === "superadmin" || hats.staff === "club_admin";
}

export function canDeleteSwimmer(hats: Hats): boolean {
  return hats.staff === "superadmin" || hats.staff === "club_admin";
}

export function canWriteMeet(hats: Hats): boolean {
  return hats.staff != null;
}

export function canWriteMeetEntry(hats: Hats, swimmerId: number): boolean {
  if (hats.staff != null) return true;
  return hats.guardianSwimmerIds.includes(swimmerId);
}

export function canDeleteResult(hats: Hats, swimmerId: number): boolean {
  if (hats.staff != null) return true;
  return hats.selfSwimmerId === swimmerId;
}

const STAFF_RANK: Record<StaffRole, number> = { superadmin: 3, club_admin: 2, coach: 1 };

export function staffRoleAtLeast(existing: StaffRole, incoming: StaffRole): StaffRole {
  return STAFF_RANK[existing] >= STAFF_RANK[incoming] ? existing : incoming;
}

export function canMarkAttendance(
  hats: Hats,
  _swimmerId: number,
  _status?: "belum" | "hadir" | "izin" | "sakit" | "alfa",
): boolean {
  return hats.staff != null;
}

export function canSubmitAbsenceNotice(hats: Hats, swimmerId: number): boolean {
  return hats.guardianSwimmerIds.includes(swimmerId);
}

export function canRequestAttendanceCorrection(hats: Hats, swimmerId: number): boolean {
  return hats.guardianSwimmerIds.includes(swimmerId);
}
