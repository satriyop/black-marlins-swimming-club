import type { Actor } from "./actor";
import { hatsFor, type Hats } from "./hats";

export const UNINVITED_MESSAGE = "Akun belum diundang. Hubungi admin.";

export type Access = {
  invited: boolean;
  hats: Hats;
  message: string | null;
};

export function isInvited(hats: Hats): boolean {
  return hats.staff != null || hats.guardianSwimmerIds.length > 0 || hats.selfSwimmerId != null;
}

export async function accessFor(actor: Actor): Promise<Access> {
  const hats = await hatsFor(actor);
  const invited = isInvited(hats);
  return {
    invited,
    hats,
    message: invited ? null : UNINVITED_MESSAGE,
  };
}
