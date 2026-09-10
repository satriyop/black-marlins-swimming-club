import { AGE_GROUPS, type AgeGroupId } from "./constants";

/** Usia PRSI: tahun kompetisi − tahun lahir (usia per 31 Desember). */
export function ageAtYearEnd(dob: string, year = new Date().getFullYear()) {
  const birthYear = Number(dob.slice(0, 4));
  if (!Number.isFinite(birthYear)) return 0;
  return Math.max(0, year - birthYear);
}

export function calendarAge(dob: string, on = new Date()) {
  const y = Number(dob.slice(0, 4));
  const m = Number(dob.slice(5, 7));
  const d = Number(dob.slice(8, 10));
  let age = on.getFullYear() - y;
  const md = on.getMonth() + 1 - m;
  if (md < 0 || (md === 0 && on.getDate() < d)) age -= 1;
  return Math.max(0, age);
}

export function ageGroupForDob(dob: string, year = new Date().getFullYear()) {
  const age = ageAtYearEnd(dob, year);
  return (
    AGE_GROUPS.find((g) => age >= g.min && age <= g.max) ??
    AGE_GROUPS[AGE_GROUPS.length - 1]!
  );
}

export function ageGroupIdForDob(dob: string, year?: number): AgeGroupId {
  return ageGroupForDob(dob, year).id;
}
