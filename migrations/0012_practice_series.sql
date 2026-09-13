create table if not exists practice_series (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  title text not null,
  weekday integer not null check (weekday between 1 and 7),
  start_time text,
  duration_min integer,
  location text,
  kind text not null default 'teknik',
  focus text,
  notes text,
  horizon_weeks integer not null default 8,
  until_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists practice_series_sets (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  series_id integer not null references practice_series(id) on delete cascade,
  sort_order integer not null,
  block text,
  reps integer not null,
  distance_m integer not null,
  stroke text not null,
  interval_sec integer,
  description text
);

create table if not exists practice_series_skips (
  series_id integer not null references practice_series(id) on delete cascade,
  skip_date date not null,
  reason text,
  primary key (series_id, skip_date)
);

alter table practices add column if not exists series_id integer references practice_series(id) on delete set null;
alter table practices add column if not exists occurrence_date date;
create unique index if not exists practices_series_occurrence_idx
  on practices (series_id, occurrence_date)
  where series_id is not null;
