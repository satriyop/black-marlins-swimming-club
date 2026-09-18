import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import { candidateMeetCodesFor, clubKeywordsFor, findSpectraMatches, type SpectraMatch } from "@/lib/club/spectra-match";
import { SPECTRA_EMPTY_MESSAGE } from "../../../scripts/spectra-client.mjs";

export type { SpectraMatch };
import { linkSpectraSwimmer as linkSpectraSwimmerFor, syncSpectraSwimmerNow } from "@/lib/club/spectra-link";

export const matchSpectraSwimmer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { fullName: string; gender: "putra" | "putri" }) => input)
  .handler(async ({ context, data }): Promise<SpectraMatch[]> => {
    const actor = await requireClub(context.userId);
    const [candidateMeetCodes, clubKeywords] = await Promise.all([
      candidateMeetCodesFor(actor),
      clubKeywordsFor(actor),
    ]);
    if (candidateMeetCodes.length === 0) throw new Error(SPECTRA_EMPTY_MESSAGE);
    if (clubKeywords.length === 0) return [];
    return findSpectraMatches({ fullName: data.fullName, gender: data.gender, candidateMeetCodes, clubKeywords });
  });

export const linkSpectraSwimmer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { swimmerId: number; match: SpectraMatch }) => input)
  .handler(async ({ context, data }) => linkSpectraSwimmerFor(await requireClub(context.userId), data));

export const syncSpectraSwimmer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { swimmerId: number }) => input)
  .handler(async ({ context, data }) => syncSpectraSwimmerNow(await requireClub(context.userId), data));
