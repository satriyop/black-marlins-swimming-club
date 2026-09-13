export function absenceCutoffAt(sessionDate: string, startTime: string | null): Date {
  const date = sessionDate.slice(0, 10);
  if (!startTime) {
    const at = new Date(`${date}T00:00:00+07:00`);
    if (Number.isNaN(at.getTime())) throw new Error("Tanggal sesi tidak valid");
    return at;
  }
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error("Jam sesi tidak valid");
  const hh = match[1]!.padStart(2, "0");
  const mm = match[2]!;
  const ss = match[3] ?? "00";
  const at = new Date(`${date}T${hh}:${mm}:${ss}+07:00`);
  if (Number.isNaN(at.getTime())) throw new Error("Jam sesi tidak valid");
  return at;
}

export function absenceCutoffLabel(sessionDate: string, startTime: string | null): string {
  if (startTime) return `Izin dapat diubah sampai jam mulai sesi (${startTime} WIB)`;
  return "Jam mulai belum ditentukan: izin sampai pukul 00.00 WIB pada tanggal sesi";
}

export function isBeforeAbsenceCutoff(
  sessionDate: string,
  startTime: string | null,
  now = new Date(),
): boolean {
  return now.getTime() < absenceCutoffAt(sessionDate, startTime).getTime();
}
