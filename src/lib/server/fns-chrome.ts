import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { clubIdForHost, hostnameFromHost, isLocalDevHost, isMarlinsBrand, UnknownClubHostError } from "@/lib/club/hostname";

function marlinsChrome(): ClubChrome {
  return {
    name: "Black Marlins Swimming Club",
    shortName: "BMSC",
    city: "Klaten",
    province: "Jawa Tengah",
    slug: "bmsc",
    marlins: true,
    crestSrc: "/images/crest.jpg",
    title: "Black Marlins Swimming Club",
  };
}

export type ClubChrome = {
  name: string;
  shortName: string;
  city: string;
  province: string;
  slug: string | null;
  marlins: boolean;
  crestSrc: string | null;
  title: string;
};

export async function loadClubChrome(sql: Sql): Promise<ClubChrome | null> {
  let id: number | null = null;
  try {
    const { resolveRequestClub } = await import("@/lib/club/request-club.server");
    id = await resolveRequestClub(sql);
  } catch (err) {
    if (err instanceof UnknownClubHostError) return null;
    throw err;
  }
  if (id == null) {
    id = await clubIdForHost(sql, null);
  }
  if (id == null) {
    const { currentHostHeader } = await import("@/lib/club/request-club.server");
    const hostname = hostnameFromHost(currentHostHeader());
    if (hostname && isLocalDevHost(hostname)) return marlinsChrome();
    return null;
  }
  const rows = await sql<{
    name: string;
    short_name: string;
    city: string;
    province: string;
    slug: string | null;
  }>`select name, short_name, city, province, slug from clubs where id = ${id}`;
  const row = rows[0];
  if (!row) return null;
  const marlins = isMarlinsBrand({ slug: row.slug, shortName: row.short_name });
  return {
    name: row.name,
    shortName: row.short_name,
    city: row.city,
    province: row.province,
    slug: row.slug,
    marlins,
    crestSrc: marlins ? "/images/crest.jpg" : null,
    title: marlins ? "Black Marlins Swimming Club" : row.name,
  };
}

export const getClubChrome = createServerFn({ method: "GET" }).handler(async () => loadClubChrome(await getSql()));
