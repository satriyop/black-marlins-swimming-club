import type { Sql } from "@/lib/db";

export class UnknownClubHostError extends Error {
  constructor() {
    super("Klub tidak ditemukan");
    this.name = "UnknownClubHostError";
  }
}

/** Host header without a port. `localhost:8080` → `localhost`. */
export function hostnameFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const first = host.split(",")[0]?.trim().toLowerCase().replace(/^https?:\/\//, "") ?? "";
  if (!first) return null;
  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    return (end > 1 ? first.slice(1, end) : first) || null;
  }
  return first.replace(/:\d+$/, "") || null;
}

export function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isMarlinsBrand(club: { slug: string | null; shortName: string }): boolean {
  return club.slug === "bmsc" || club.shortName === "BMSC";
}

const CREST_BY_SLUG: Record<string, string> = {
  apta: "/images/crests/apta.jpg",
};

const MARK_BY_SLUG: Record<string, string> = {
  apta: "ASC",
};

/** Photo URL for this club, or null when the caller should draw letters. */
export function crestSrcFor(club: { slug: string | null; shortName: string }): string | null {
  if (isMarlinsBrand(club)) return "/images/crest.jpg";
  if (club.slug && CREST_BY_SLUG[club.slug]) return CREST_BY_SLUG[club.slug];
  return null;
}

/** Letters inside the circle when the club has no crest photo. */
export function clubMonogram(club: { slug: string | null; shortName: string } | null): string {
  if (club?.slug && MARK_BY_SLUG[club.slug]) return MARK_BY_SLUG[club.slug];
  return (club?.shortName || "Klub").slice(0, 3);
}

/**
 * Club for this Host.
 * A matching hostname wins. An unknown hostname is null and must not fall through.
 * Local dev (or a missing host) uses the only Club. Several clubs and no hostname return null
 * instead of the first row, so a shared dev database does not pin every request to one Club.
 */
export async function clubIdForHost(sql: Sql, host: string | null | undefined): Promise<number | null> {
  const hostname = hostnameFromHost(host);
  if (hostname && !isLocalDevHost(hostname)) {
    const rows = await sql<{ id: number }>`
      select id from clubs where lower(hostname) = ${hostname}
    `;
    if (rows.length === 1) return rows[0]!.id;
    return null;
  }
  const rows = await sql<{ id: number }>`select id from clubs`;
  if (rows.length === 1) return rows[0]!.id;
  return null;
}
