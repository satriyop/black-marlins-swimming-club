import { getSql } from "@/lib/db";
import { ageGroupIdForDob } from "@/lib/swim/age";
import { seedPractices } from "./bootstrap-practices";

type Sql = Awaited<ReturnType<typeof getSql>>;

async function insertSwimmer(sql: Sql, userId: string, s: {
  fullName: string; nickname: string; dob: string; gender: "putra" | "putri"; city: string; joinDate: string; notes: string;
}) {
  const rows = await sql<{ id: number }>`
    insert into swimmers (user_id, full_name, nickname, date_of_birth, gender, nationality, city, status, join_date, notes)
    values (${userId}, ${s.fullName}, ${s.nickname}, ${s.dob}, ${s.gender}, 'Indonesia', ${s.city}, 'aktif', ${s.joinDate}, ${s.notes})
    returning id`;
  return rows[0]!.id;
}

async function insertMeet(sql: Sql, userId: string, m: {
  name: string; level: string; course: "25" | "50"; venue: string; city: string; start: string; end: string; organizer: string; status: string; notes?: string;
}) {
  const rows = await sql<{ id: number }>`
    insert into meets (user_id, name, level, course, venue, city, start_date, end_date, organizer, status, notes)
    values (${userId}, ${m.name}, ${m.level}, ${m.course}, ${m.venue}, ${m.city}, ${m.start}, ${m.end}, ${m.organizer}, ${m.status}, ${m.notes ?? null})
    returning id`;
  return rows[0]!.id;
}

export async function ensureSeeded(userId: string) {
  const sql = await getSql();
  const existing = await sql<{ id: number }>`select id from clubs where user_id = ${userId} limit 1`;
  if (existing.length > 0) return;

  await sql`insert into clubs (user_id, name, short_name, city, province, country, coach_name, venue, motto)
    values (${userId}, 'Black Marlins Swimming Club', 'BMSC', 'Klaten', 'Jawa Tengah', 'Indonesia',
      'Hardiyanto Wibowo', 'Kolam Renang BMSC, Klaten', 'Berani. Disiplin. Juara.')`;

  const luigiDob = "2014-06-05";
  const kunDob = "2014-06-05";
  const kenDob = "2012-06-30";
  const luigi = await insertSwimmer(sql, userId, {
    fullName: "Luigi Banyu Pamungkas", nickname: "Luigi", dob: luigiDob, gender: "putra", city: "Klaten", joinDate: "2024-01-15",
    notes: "Kembar dengan Kun Bumi. Fokus gaya bebas dan punggung. Start sudah rapi.",
  });
  const kun = await insertSwimmer(sql, userId, {
    fullName: "Kun Bumi Pamungkas", nickname: "Kun", dob: kunDob, gender: "putra", city: "Klaten", joinDate: "2024-01-15",
    notes: "Kembar dengan Luigi Banyu. Spesialisasi gaya dada. Pull-out kuat.",
  });
  const ken = await insertSwimmer(sql, userId, {
    fullName: "Ken Athaya Nirwasita", nickname: "Ken", dob: kenDob, gender: "putra", city: "Klaten", joinDate: "2022-03-01",
    notes: "Perenang paling senior di klub. Gaya kupu-kupu dan gaya ganti. Calon KU I 2028.",
  });

  await seedPractices(sql, userId, { luigi, kun, ken });

  const o2sn = await insertMeet(sql, userId, {
    name: "O2SN Kabupaten Klaten 2026", level: "sekolah", course: "50", venue: "Kolam Renang Tirtonadi", city: "Klaten",
    start: "2026-06-12", end: "2026-06-13", organizer: "Dinas Pendidikan Kabupaten Klaten", status: "selesai",
    notes: "Nomor 50 m empat gaya. Timed final.",
  });
  const mini = await insertMeet(sql, userId, {
    name: "BMSC Mini Meet Juli", level: "klub", course: "25", venue: "Kolam Renang BMSC, Klaten", city: "Klaten",
    start: "2026-07-19", end: "2026-07-19", organizer: "Black Marlins Swimming Club", status: "selesai",
  });
  const tesAgustus = await insertMeet(sql, userId, {
    name: "Tes Waktu Internal Agustus", level: "klub", course: "50", venue: "Kolam Renang BMSC, Klaten", city: "Klaten",
    start: "2026-08-30", end: "2026-08-30", organizer: "Black Marlins Swimming Club", status: "selesai",
  });
  const pengcab = await insertMeet(sql, userId, {
    name: "Kejuaraan Renang Pengcab PRSI Klaten 2026", level: "pengcab", course: "50", venue: "Kolam Renang Tirtonadi", city: "Klaten",
    start: "2026-09-20", end: "2026-09-21", organizer: "Pengcab PRSI Klaten", status: "rencana",
    notes: "KU dihitung per 31 Desember 2026. Nomor sprint 50/100/200.",
  });
  const kejprov = await insertMeet(sql, userId, {
    name: "Kejurprov Jawa Tengah Kelompok Umur 2026", level: "pengprov", course: "50", venue: "GOR Jatidiri Aquatic", city: "Semarang",
    start: "2026-10-17", end: "2026-10-19", organizer: "Pengprov PRSI Jawa Tengah", status: "rencana",
    notes: "Target: Ken KU II; Luigi & Kun KU III.",
  });

  const results: [number, number, string, string, number, "25" | "50", number, number | undefined, string][] = [
    [ken, o2sn, "2026-06-12", "bebas", 50, "50", 30840, 2, "timed_final"],
    [ken, o2sn, "2026-06-12", "kupu", 50, "50", 33210, 1, "timed_final"],
    [ken, o2sn, "2026-06-13", "punggung", 50, "50", 35180, 3, "timed_final"],
    [luigi, o2sn, "2026-06-12", "bebas", 50, "50", 38420, 5, "timed_final"],
    [luigi, o2sn, "2026-06-13", "punggung", 50, "50", 44150, 6, "timed_final"],
    [kun, o2sn, "2026-06-12", "bebas", 50, "50", 39110, 7, "timed_final"],
    [kun, o2sn, "2026-06-13", "dada", 50, "50", 46880, 3, "timed_final"],
    [ken, mini, "2026-07-19", "bebas", 50, "25", 29880, 1, "timed_final"],
    [ken, mini, "2026-07-19", "kupu", 100, "25", 110450, 1, "timed_final"],
    [ken, mini, "2026-07-19", "ganti", 200, "25", 158200, 1, "timed_final"],
    [luigi, mini, "2026-07-19", "bebas", 50, "25", 35910, 2, "timed_final"],
    [luigi, mini, "2026-07-19", "bebas", 100, "25", 79240, 2, "timed_final"],
    [kun, mini, "2026-07-19", "dada", 50, "25", 43850, 1, "timed_final"],
    [kun, mini, "2026-07-19", "dada", 100, "25", 96200, 1, "timed_final"],
    [kun, mini, "2026-07-19", "bebas", 50, "25", 37400, 3, "timed_final"],
    [ken, tesAgustus, "2026-08-30", "bebas", 50, "50", 29840, 1, "tes"],
    [ken, tesAgustus, "2026-08-30", "bebas", 100, "50", 65720, 1, "tes"],
    [ken, tesAgustus, "2026-08-30", "kupu", 50, "50", 31900, 1, "tes"],
    [ken, tesAgustus, "2026-08-30", "kupu", 100, "50", 72450, 1, "tes"],
    [ken, tesAgustus, "2026-08-30", "punggung", 50, "50", 34220, 1, "tes"],
    [ken, tesAgustus, "2026-08-30", "ganti", 200, "50", 162550, 1, "tes"],
    [luigi, tesAgustus, "2026-08-30", "bebas", 50, "50", 36820, 2, "tes"],
    [luigi, tesAgustus, "2026-08-30", "bebas", 100, "50", 81450, 2, "tes"],
    [luigi, tesAgustus, "2026-08-30", "punggung", 50, "50", 42150, undefined, "tes"],
    [luigi, tesAgustus, "2026-08-30", "kupu", 50, "50", 40880, undefined, "tes"],
    [kun, tesAgustus, "2026-08-30", "bebas", 50, "50", 37400, 3, "tes"],
    [kun, tesAgustus, "2026-08-30", "bebas", 100, "50", 83100, undefined, "tes"],
    [kun, tesAgustus, "2026-08-30", "dada", 50, "50", 44850, 1, "tes"],
    [kun, tesAgustus, "2026-08-30", "dada", 100, "50", 98200, undefined, "tes"],
  ];
  for (const [swimmerId, meetId, date, stroke, distance, course, timeMs, place, round] of results) {
    await sql`insert into results (user_id, swimmer_id, meet_id, result_date, stroke, distance_m, course, time_ms, place, round, status, is_pb)
      values (${userId}, ${swimmerId}, ${meetId}, ${date}, ${stroke}, ${distance}, ${course}, ${timeMs}, ${place ?? null}, ${round}, 'selesai', true)`;
  }

  const entries: [number, number, string, string, number, number][] = [
    [pengcab, ken, kenDob, "bebas", 50, 29840], [pengcab, ken, kenDob, "kupu", 50, 31900],
    [pengcab, ken, kenDob, "kupu", 100, 72450], [pengcab, ken, kenDob, "ganti", 200, 162550],
    [pengcab, luigi, luigiDob, "bebas", 50, 36820], [pengcab, luigi, luigiDob, "bebas", 100, 81450],
    [pengcab, luigi, luigiDob, "punggung", 50, 42150], [pengcab, kun, kunDob, "dada", 50, 44850],
    [pengcab, kun, kunDob, "dada", 100, 98200], [pengcab, kun, kunDob, "bebas", 50, 37400],
    [kejprov, ken, kenDob, "kupu", 100, 72450], [kejprov, ken, kenDob, "bebas", 100, 65720],
    [kejprov, luigi, luigiDob, "bebas", 100, 81450], [kejprov, kun, kunDob, "dada", 100, 98200],
  ];
  for (const [meetId, swimmerId, dob, stroke, distance, seed] of entries) {
    await sql`insert into meet_entries (user_id, meet_id, swimmer_id, stroke, distance_m, age_group, seed_time_ms, status)
      values (${userId}, ${meetId}, ${swimmerId}, ${stroke}, ${distance}, ${ageGroupIdForDob(dob, 2026)}, ${seed}, 'terdaftar')`;
  }

  const activities: [string, string, string, string | undefined, string | undefined, string, string][] = [
    ["Rapat orang tua pra-Pengcab", "rapat", "2026-09-14", "16:00", "17:00", "Sekretariat BMSC Klaten", "Jadwal kejuaraan, seragam, transport, dan biaya pendaftaran nomor."],
    ["Latihan darat — core & dryland", "darat", "2026-09-11", "16:00", "16:45", "Aula klub", "Sesi band, squat jump, dan mobility bahu."],
    ["Keberangkatan Pengcab Klaten", "event", "2026-09-20", "06:00", undefined, "Kolam Renang Tirtonadi", "Kumpul 06.00. Bawa KTA, baju klub, dan bekal."],
    ["Tes fisik awal musim", "tes", "2026-08-02", "07:00", undefined, "Kolam Renang BMSC, Klaten", "Tes 200 gaya bebas mudah + 4×25 max + plank."],
    ["Syukuran HUT RI bersama klub", "sosial", "2026-08-17", "08:00", undefined, "Kolam Renang BMSC, Klaten", "Renang bersama keluarga dan pembagian seragam baru."],
    ["Technical meeting Kejurprov Jateng", "rapat", "2026-10-16", "19:00", undefined, "GOR Jatidiri, Semarang", "Wajib dihadiri pelatih. Konfirmasi heat sheet KU II dan KU III."],
  ];
  for (const [title, kind, date, start, end, location, desc] of activities) {
    await sql`insert into activities (user_id, title, kind, activity_date, start_time, end_time, location, description)
      values (${userId}, ${title}, ${kind}, ${date}, ${start ?? null}, ${end ?? null}, ${location}, ${desc})`;
  }
}
