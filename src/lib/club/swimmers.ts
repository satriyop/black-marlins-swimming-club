import { mapSwimmer, type SwimmerRow } from "@/lib/server/fns-shared";
import type { Swimmer } from "@/lib/swim/types";
import type { Actor } from "./actor";
import { canSeeAllSwimmers, hatsFor } from "./hats";
import { clubIdFor } from "./membership";

export async function listSwimmers(actor: Actor): Promise<Swimmer[]> {
  const clubId = await clubIdFor(actor);
  if (clubId == null) return [];
  const hats = await hatsFor(actor);
  if (canSeeAllSwimmers(hats)) {
    const rows = await actor.sql<SwimmerRow>`
      select * from swimmers where club_id = ${clubId} order by date_of_birth, full_name
    `;
    return rows.map(mapSwimmer);
  }
  const allowed = new Set([
    ...hats.guardianSwimmerIds,
    ...(hats.selfSwimmerId != null ? [hats.selfSwimmerId] : []),
  ]);
  if (allowed.size === 0) return [];
  const rows = await actor.sql<SwimmerRow>`
    select * from swimmers where club_id = ${clubId} order by date_of_birth, full_name
  `;
  return rows.filter((r) => allowed.has(r.id)).map(mapSwimmer);
}
