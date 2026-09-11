create table if not exists invites (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  email text,
  kind text not null check (kind in ('staff', 'guardian', 'swimmer_account')),
  payload jsonb not null default '{}'::jsonb,
  token text not null unique,
  invited_by text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invites_token_idx on invites (token);
create index if not exists invites_club_idx on invites (club_id);
