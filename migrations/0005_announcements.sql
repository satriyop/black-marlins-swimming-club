create table if not exists announcements (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  title text not null,
  body text not null,
  important boolean not null default false,
  practice_id integer references practices(id) on delete set null,
  meet_id integer references meets(id) on delete set null,
  due_on date,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_club_idx on announcements (club_id, created_at desc);

create table if not exists announcement_reads (
  announcement_id integer not null references announcements(id) on delete cascade,
  user_id text not null,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index if not exists announcement_reads_user_idx on announcement_reads (user_id);
