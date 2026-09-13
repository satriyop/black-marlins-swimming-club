import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isValid } from "date-fns";
import { id } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function jakartaHour() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return hour;
}

export function greetingId() {
  const h = jakartaHour();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

export function formatDateId(iso: string | null | undefined, pattern = "d MMM yyyy") {
  if (!iso) return "—";
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, pattern, { locale: id });
}

export function todayIso() {
  return jakartaNowParts().date;
}

export function jakartaNowParts(now = new Date()): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return { date, time };
}
