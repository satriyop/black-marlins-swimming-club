import type { Actor } from "./actor";
import { hatsFor, type Hats } from "./hats";
import { listNewGrants, loadPrefs, type AccessGrant } from "./prefs";
import type { TaskView } from "./home-view";

export const UNINVITED_MESSAGE = "Akun belum diundang. Hubungi admin.";

export type Access = {
  invited: boolean;
  hats: Hats;
  message: string | null;
  taskView: TaskView;
  welcomeDismissed: boolean;
  newGrants: AccessGrant[];
};

export function isInvited(hats: Hats): boolean {
  return (
    hats.staff != null ||
    hats.family === true ||
    hats.guardianSwimmerIds.length > 0 ||
    hats.selfSwimmerId != null
  );
}

export async function accessFor(actor: Actor): Promise<Access> {
  const hats = await hatsFor(actor);
  const invited = isInvited(hats);
  if (!invited) {
    return {
      invited,
      hats,
      message: UNINVITED_MESSAGE,
      taskView: "family",
      welcomeDismissed: true,
      newGrants: [],
    };
  }
  const prefs = await loadPrefs(actor);
  return {
    invited,
    hats,
    message: null,
    taskView: prefs.taskView,
    welcomeDismissed: prefs.welcomeDismissed,
    newGrants: await listNewGrants(actor, prefs.grantsAckedAt),
  };
}
