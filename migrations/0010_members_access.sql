alter table invites add column if not exists revoked_at timestamptz;
alter table invites add column if not exists revoked_by text;
alter table invites add column if not exists superseded_by integer;

create table if not exists membership_events (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  actor_id text not null,
  target_user_id text,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists access_help_requests (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  kind text not null check (kind in ('missing_child', 'wrong_link')),
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
