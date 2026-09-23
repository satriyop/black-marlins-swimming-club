create table swimmer_credentials (
  swimmer_id integer primary key references swimmers (id) on delete cascade,
  club_id integer not null references clubs (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text references "user" (id) on delete set null
);

create table swimmer_credential_events (
  id serial primary key,
  club_id integer not null references clubs (id) on delete cascade,
  swimmer_id integer not null references swimmers (id) on delete cascade,
  actor_id text references "user" (id) on delete set null,
  action text not null check (action in ('set', 'reset')),
  created_at timestamptz not null default now()
);

create index swimmer_credential_events_swimmer_idx
  on swimmer_credential_events (swimmer_id, created_at desc);
