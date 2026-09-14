-- Keep imported race outcomes and IDs intact. Historical entries imply no approval.
alter table meets add column registration_state text not null default 'draft'
  check (registration_state in ('draft', 'open', 'locked'));
alter table meets add column registration_deadline timestamptz;
alter table meets add column registration_revision integer not null default 1;

create table meet_eligibility (
  meet_id integer not null references meets(id) on delete cascade,
  swimmer_id integer not null references swimmers(id) on delete cascade,
  club_id integer not null references clubs(id) on delete cascade,
  group_name text not null,
  response text not null default 'pending' check (response in ('pending', 'yes', 'no', 'withdrawn')),
  reason text,
  primary key (meet_id, swimmer_id)
);
create table meet_event_choices (
  meet_id integer not null references meets(id) on delete cascade,
  stroke text not null,
  distance_m integer not null check (distance_m > 0),
  primary key (meet_id, stroke, distance_m)
);
alter table meet_entries add column registration_status text not null default 'legacy'
  check (registration_status in ('legacy', 'proposed', 'requested', 'approved', 'rejected', 'submitted', 'confirmed', 'declined', 'withdrawn'));
alter table meet_entries add column registration_reason text;
create unique index meet_entries_registration_unique on meet_entries (meet_id, swimmer_id, stroke, distance_m)
  where registration_status <> 'legacy';
create index meet_eligibility_club_swimmer_idx on meet_eligibility (club_id, swimmer_id);

create table meet_registration_history (
  id serial primary key,
  meet_id integer not null references meets(id) on delete cascade,
  club_id integer not null references clubs(id) on delete cascade,
  swimmer_id integer references swimmers(id) on delete set null,
  entry_id integer references meet_entries(id) on delete set null,
  revision integer not null,
  action text not null,
  actor_id text not null,
  note text,
  created_at timestamptz not null default now()
);
create index meet_registration_history_meet_idx on meet_registration_history (meet_id, id);
