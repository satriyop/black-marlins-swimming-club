import { getSql } from "@/lib/db";

type Sql = Awaited<ReturnType<typeof getSql>>;
type SetSeed = { block: string; reps: number; distance: number; stroke: string; interval?: number; desc?: string };

async function insertPractice(sql: Sql, userId: string, p: {
  date: string; time: string; duration: number; kind: string; title: string; focus: string; meters: number; notes?: string;
  sets: SetSeed[]; attendance: { swimmerId: number; status: string; meters?: number }[];
}) {
  const rows = await sql<{ id: number }>`
    insert into practices (user_id, session_date, start_time, duration_min, location, kind, title, focus, total_meters, notes)
    values (${userId}, ${p.date}, ${p.time}, ${p.duration}, 'Kolam Renang BMSC Klaten', ${p.kind}, ${p.title}, ${p.focus}, ${p.meters}, ${p.notes ?? null})
    returning id`;
  const id = rows[0]!.id;
  for (let i = 0; i < p.sets.length; i++) {
    const s = p.sets[i]!;
    await sql`insert into practice_sets (user_id, practice_id, sort_order, block, reps, distance_m, stroke, interval_sec, description)
      values (${userId}, ${id}, ${i}, ${s.block}, ${s.reps}, ${s.distance}, ${s.stroke}, ${s.interval ?? null}, ${s.desc ?? null})`;
  }
  for (const a of p.attendance) {
    await sql`insert into practice_attendance (user_id, practice_id, swimmer_id, status, meters_completed)
      values (${userId}, ${id}, ${a.swimmerId}, ${a.status}, ${a.meters ?? null})`;
  }
}

export async function seedPractices(sql: Sql, userId: string, ids: { luigi: number; kun: number; ken: number }) {
  const { luigi, kun, ken } = ids;
  const present = (meters: number) => [
    { swimmerId: luigi, status: "hadir", meters },
    { swimmerId: kun, status: "hadir", meters },
    { swimmerId: ken, status: "hadir", meters },
  ];
  await insertPractice(sql, userId, {
    date: "2026-08-29", time: "15:30", duration: 90, kind: "teknik", title: "Teknik gaya bebas — catch-up",
    focus: "Entry dan catch tangan depan", meters: 2800,
    sets: [
      { block: "pemanasan", reps: 1, distance: 400, stroke: "bebas", desc: "Mudah, nafas bilateral" },
      { block: "kaki", reps: 4, distance: 50, stroke: "bebas", interval: 70, desc: "Papan, denyut tinggi" },
      { block: "teknik", reps: 8, distance: 50, stroke: "bebas", interval: 65, desc: "Catch-up, 6-kick switch" },
      { block: "utama", reps: 6, distance: 100, stroke: "bebas", interval: 110, desc: "Race pace 75%" },
      { block: "pendinginan", reps: 1, distance: 200, stroke: "campuran", desc: "Mudah" },
    ],
    attendance: present(2800),
  });
  await insertPractice(sql, userId, {
    date: "2026-09-01", time: "15:30", duration: 90, kind: "sprint", title: "Sprint 25 & start",
    focus: "Reaksi start dan 15 m pertama", meters: 2200,
    sets: [
      { block: "pemanasan", reps: 1, distance: 300, stroke: "bebas" },
      { block: "teknik", reps: 6, distance: 50, stroke: "kupu", interval: 70, desc: "Drill 25 + renang 25" },
      { block: "sprint", reps: 8, distance: 25, stroke: "bebas", interval: 60, desc: "Max, dari start" },
      { block: "sprint", reps: 6, distance: 25, stroke: "kupu", interval: 70, desc: "Max" },
      { block: "pendinginan", reps: 1, distance: 200, stroke: "punggung" },
    ],
    attendance: [
      { swimmerId: luigi, status: "hadir", meters: 2200 },
      { swimmerId: kun, status: "izin", meters: 0 },
      { swimmerId: ken, status: "hadir", meters: 2200 },
    ],
  });
  await insertPractice(sql, userId, {
    date: "2026-09-03", time: "15:30", duration: 100, kind: "daya_tahan", title: "Volume aerobik 3.200 m",
    focus: "Steady 200-an gaya bebas", meters: 3200,
    sets: [
      { block: "pemanasan", reps: 1, distance: 400, stroke: "campuran" },
      { block: "kaki", reps: 4, distance: 50, stroke: "dada", interval: 75 },
      { block: "utama", reps: 8, distance: 200, stroke: "bebas", interval: 210, desc: "Aerobik, negative split" },
      { block: "pendinginan", reps: 1, distance: 200, stroke: "bebas" },
    ],
    attendance: present(3200),
  });
  await insertPractice(sql, userId, {
    date: "2026-09-06", time: "07:00", duration: 90, kind: "gaya_ganti", title: "Transisi gaya ganti",
    focus: "Turn IM: kupu→punggung→dada→bebas", meters: 2600,
    sets: [
      { block: "pemanasan", reps: 1, distance: 400, stroke: "ganti" },
      { block: "teknik", reps: 8, distance: 50, stroke: "ganti", interval: 70, desc: "25 transisi + 25 mudah" },
      { block: "utama", reps: 4, distance: 200, stroke: "ganti", interval: 240, desc: "Broken IM 4×50" },
      { block: "utama", reps: 4, distance: 100, stroke: "ganti", interval: 130 },
      { block: "pendinginan", reps: 1, distance: 200, stroke: "bebas" },
    ],
    attendance: present(2600),
  });
  await insertPractice(sql, userId, {
    date: "2026-09-08", time: "15:30", duration: 90, kind: "teknik", title: "Teknik gaya dada",
    focus: "Timing tendangan dan pull-out", meters: 2400,
    sets: [
      { block: "pemanasan", reps: 1, distance: 300, stroke: "bebas" },
      { block: "kaki", reps: 6, distance: 50, stroke: "dada", interval: 80, desc: "Papan, tendangan sempit" },
      { block: "teknik", reps: 8, distance: 50, stroke: "dada", interval: 75, desc: "2 kick 1 pull" },
      { block: "utama", reps: 6, distance: 100, stroke: "dada", interval: 140, desc: "Descend 1–3, 4–6" },
      { block: "pendinginan", reps: 1, distance: 200, stroke: "campuran" },
    ],
    attendance: present(2400),
  });
  await insertPractice(sql, userId, {
    date: "2026-09-10", time: "15:30", duration: 90, kind: "sprint", title: "Race pace 50 m",
    focus: "Kecepatan nomor 50 menjelang Pengcab", meters: 2100,
    sets: [
      { block: "pemanasan", reps: 1, distance: 400, stroke: "bebas" },
      { block: "teknik", reps: 4, distance: 50, stroke: "kupu", interval: 70 },
      { block: "sprint", reps: 8, distance: 50, stroke: "bebas", interval: 90, desc: "Ganjil max, genap mudah" },
      { block: "sprint", reps: 4, distance: 50, stroke: "kupu", interval: 100 },
      { block: "pendinginan", reps: 1, distance: 200, stroke: "punggung" },
    ],
    attendance: present(2100),
  });
  await insertPractice(sql, userId, {
    date: "2026-09-12", time: "15:30", duration: 90, kind: "daya_tahan", title: "Aerobik menjelang kejuaraan",
    focus: "Volume terkontrol, recovery aktif", meters: 3000,
    sets: [
      { block: "pemanasan", reps: 1, distance: 400, stroke: "campuran" },
      { block: "utama", reps: 5, distance: 400, stroke: "bebas", interval: 420, desc: "Steady, teknik jaga" },
      { block: "pendinginan", reps: 1, distance: 200, stroke: "bebas" },
    ],
    attendance: present(3000),
  });
  await insertPractice(sql, userId, {
    date: "2026-09-13", time: "07:00", duration: 70, kind: "tes", title: "Tes waktu internal 50/100",
    focus: "Seed time Pengcab Klaten", meters: 1600, notes: "Catat waktu 50 bebas, 50 dada, 100 bebas.",
    sets: [
      { block: "pemanasan", reps: 1, distance: 400, stroke: "bebas" },
      { block: "sprint", reps: 1, distance: 50, stroke: "bebas", desc: "Tes max" },
      { block: "sprint", reps: 1, distance: 50, stroke: "dada", desc: "Tes max" },
      { block: "sprint", reps: 1, distance: 100, stroke: "bebas", desc: "Tes max" },
      { block: "pendinginan", reps: 1, distance: 400, stroke: "campuran" },
    ],
    attendance: present(1600),
  });
  await insertPractice(sql, userId, {
    date: "2026-09-17", time: "15:30", duration: 80, kind: "pemulihan", title: "Taper ringan pra-Pengcab",
    focus: "Kualitas, bukan volume", meters: 1800,
    sets: [
      { block: "pemanasan", reps: 1, distance: 300, stroke: "bebas" },
      { block: "teknik", reps: 6, distance: 50, stroke: "campuran", interval: 70 },
      { block: "sprint", reps: 4, distance: 25, stroke: "bebas", interval: 50, desc: "Build" },
      { block: "pendinginan", reps: 1, distance: 200, stroke: "punggung" },
    ],
    attendance: present(1800),
  });
}
