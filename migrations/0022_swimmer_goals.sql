create table if not exists swimmer_goals (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  swimmer_id integer not null references swimmers(id) on delete cascade,
  created_by text references "user"(id) on delete set null,
  stroke text not null check (stroke in ('bebas','punggung','dada','kupu','ganti')),
  distance_m integer not null check (distance_m in (25,50,100,200,400,800,1500)),
  course text not null check (course in ('25','50')),
  target_time_ms integer not null check (target_time_ms > 0 and target_time_ms <= 3600000),
  started_on date not null,
  deadline date not null check (deadline >= started_on),
  notes text check (notes is null or char_length(notes) <= 500),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text references "user"(id) on delete set null
);

create table if not exists swimmer_goal_revisions (
  goal_id integer not null references swimmer_goals(id) on delete cascade,
  revision integer not null,
  stroke text not null,
  distance_m integer not null,
  course text not null,
  target_time_ms integer not null,
  started_on date not null,
  deadline date not null,
  notes text,
  changed_by text references "user"(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key (goal_id, revision)
);

create index if not exists swimmer_goals_club_swimmer_idx
  on swimmer_goals (club_id, swimmer_id, deadline desc, id desc);
