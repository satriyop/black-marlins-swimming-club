import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireClub } from "@/lib/club/context";
import { listSyncConflicts as loadSyncConflicts, resolveSyncConflict as resolveConflict } from "@/lib/club/sync-conflicts";

export const listSyncConflicts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => loadSyncConflicts(await requireClub(context.userId)));

export const resolveSyncConflict = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; resolution: "kept_local" | "used_incoming" }) => input)
  .handler(async ({ context, data }) => resolveConflict(await requireClub(context.userId), data));
