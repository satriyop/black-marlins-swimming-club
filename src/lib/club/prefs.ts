import type { Actor } from "./actor";
import { defaultTaskView, type TaskView } from "./home-view";
import { hatsFor } from "./hats";
import { contextClubId } from "./membership";

export type ClubPrefs = {
  taskView: TaskView;
  welcomeDismissed: boolean;
  grantsAckedAt: string | null;
};

async function ensurePrefs(actor: Actor): Promise<void> {
  await actor.sql`
    insert into user_club_prefs (user_id)
    values (${actor.userId})
    on conflict (user_id) do nothing
  `;
}

export async function loadPrefs(actor: Actor): Promise<ClubPrefs> {
  await ensurePrefs(actor);
  const hats = await hatsFor(actor);
  const rows = await actor.sql<{
    task_view: TaskView | null;
    welcome_dismissed_at: string | null;
    grants_acked_at: string | null;
  }>`
    select task_view, welcome_dismissed_at::text, grants_acked_at::text
    from user_club_prefs where user_id = ${actor.userId} limit 1
  `;
  const row = rows[0];
  return {
    taskView: defaultTaskView(hats, row?.task_view ?? null),
    welcomeDismissed: row?.welcome_dismissed_at != null,
    grantsAckedAt: row?.grants_acked_at ?? null,
  };
}

export async function saveTaskView(actor: Actor, view: TaskView): Promise<{ ok: true }> {
  const hats = await hatsFor(actor);
  const next = defaultTaskView(hats, view);
  await ensurePrefs(actor);
  await actor.sql`
    update user_club_prefs set task_view = ${next} where user_id = ${actor.userId}
  `;
  return { ok: true };
}

export async function dismissOnboarding(actor: Actor): Promise<{ ok: true }> {
  await ensurePrefs(actor);
  await actor.sql`
    update user_club_prefs
    set welcome_dismissed_at = now(), grants_acked_at = now()
    where user_id = ${actor.userId}
  `;
  return { ok: true };
}

export type AccessGrant = {
  kind: "staff" | "guardian";
  role: string | null;
  swimmerIds: number[];
};

export async function listNewGrants(actor: Actor, grantsAckedAt: string | null): Promise<AccessGrant[]> {
  const users = await actor.sql<{ email: string }>`select email from "user" where id = ${actor.userId} limit 1`;
  const email = users[0]?.email;
  if (!email) return [];
  const clubId = await contextClubId(actor);
  if (clubId == null) return [];
  const rows = await actor.sql<{
    kind: "staff" | "guardian";
    payload: { swimmerIds?: number[]; role?: string } | null;
  }>`
    select kind, payload
    from invites
    where club_id = ${clubId}
      and lower(email) = ${email.toLowerCase()}
      and kind in ('staff', 'guardian')
      and accepted_at is not null
      and (
        (${grantsAckedAt}::timestamptz is not null and accepted_at > ${grantsAckedAt}::timestamptz)
        or (${grantsAckedAt}::timestamptz is null and accepted_at > now() - interval '1 day')
      )
    order by accepted_at desc
  `;
  return rows.map((r) => ({
    kind: r.kind,
    role: r.payload?.role ?? null,
    swimmerIds: r.payload?.swimmerIds ?? [],
  }));
}
