import { getRequest } from "@tanstack/react-start/server";
import type { Sql } from "@/lib/db";
import { clubIdForHost, hostnameFromHost, isLocalDevHost, UnknownClubHostError } from "./hostname";

export function currentHostHeader(): string | null {
  try {
    return getRequest()?.headers.get("host") ?? null;
  } catch {
    return null;
  }
}

/** Club pinned by the request Host. No request → null, so callers keep the single-club path. */
export async function resolveRequestClub(sql: Sql): Promise<number | null> {
  const header = currentHostHeader();
  if (header == null) return null;
  const hostname = hostnameFromHost(header);
  if (hostname && !isLocalDevHost(hostname)) {
    const id = await clubIdForHost(sql, header);
    if (id == null) throw new UnknownClubHostError();
    return id;
  }
  return clubIdForHost(sql, header);
}
