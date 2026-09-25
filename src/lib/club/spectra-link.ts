import type { Actor } from "./actor";
import { hatsFor } from "./hats";
import { canWriteRoster } from "./permissions";
import { syncSpectraResultsForSwimmer } from "./spectra-results-sync";
import type { SpectraMatch } from "./spectra-match";

export async function linkSpectraSwimmer(
  actor: Actor & { clubId: number },
  input: { swimmerId: number; match: SpectraMatch },
): Promise<{ ok: true; results: Awaited<ReturnType<typeof syncSpectraResultsForSwimmer>> }> {
  const hats = await hatsFor(actor);
  if (!canWriteRoster(hats, input.swimmerId)) throw new Error("Tidak diizinkan");

  const snapshot = {
    fullName: input.match.fullName,
    dateOfBirth: input.match.dateOfBirth,
    gender: input.match.gender,
    club: input.match.club,
  };
  const updated = await actor.sql<{ id: number }>`
    update swimmers
    set spectra_athlete_id = ${input.match.athleteId}, spectra_synced_at = now(), spectra_snapshot = ${JSON.stringify(snapshot)}
    where id = ${input.swimmerId} and club_id = ${actor.clubId}
    returning id
  `;
  if (!updated[0]) throw new Error("Perenang tidak ditemukan");

  // First sync ever for this swimmer -- nothing local to conflict with yet,
  // so pull their existing history right away rather than waiting for the
  // coach to press "Sync" separately.
  const results = await syncSpectraResultsForSwimmer(actor, {
    swimmerId: input.swimmerId,
    athleteId: input.match.athleteId,
  });
  return { ok: true, results };
}

/** Re-sync an already-linked swimmer's results (the "Sync" button on their
 *  profile). Looks up the athlete ID server-side from the already-confirmed
 *  link rather than trusting a client-supplied ID. */
export async function syncSpectraSwimmerNow(actor: Actor & { clubId: number }, input: { swimmerId: number }) {
  const hats = await hatsFor(actor);
  if (!canWriteRoster(hats, input.swimmerId)) throw new Error("Tidak diizinkan");
  const rows = await actor.sql<{ spectra_athlete_id: string | null }>`
    select spectra_athlete_id from swimmers where id = ${input.swimmerId} and club_id = ${actor.clubId} limit 1
  `;
  const athleteId = rows[0]?.spectra_athlete_id;
  if (!athleteId) throw new Error("Perenang belum terhubung ke Spectra SwimPro");
  return syncSpectraResultsForSwimmer(actor, { swimmerId: input.swimmerId, athleteId });
}
