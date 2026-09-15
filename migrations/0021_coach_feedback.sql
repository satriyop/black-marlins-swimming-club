create table coach_feedback (
  id bigserial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  swimmer_id integer not null references swimmers(id) on delete cascade,
  practice_id integer references practices(id) on delete set null,
  practice_title text not null,
  practice_date date not null,
  focus text,
  improvement text,
  next_step text,
  status text not null default 'draft' check (status in ('draft','private','shared','retracted')),
  created_by text not null references "user"(id),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retracted_at timestamptz,
  retracted_by text references "user"(id),
  unique (practice_id, swimmer_id, created_by),
  check (focus is not null or improvement is not null or next_step is not null)
);

create table coach_feedback_revisions (
  feedback_id bigint not null references coach_feedback(id) on delete cascade,
  revision integer not null,
  focus text,
  improvement text,
  next_step text,
  status text not null check (status in ('draft','private','shared','retracted')),
  changed_by text not null references "user"(id),
  changed_at timestamptz not null default now(),
  primary key (feedback_id, revision),
  check (focus is not null or improvement is not null or next_step is not null)
);

create index coach_feedback_swimmer_recent
  on coach_feedback (club_id, swimmer_id, practice_date desc, id desc);
create index coach_feedback_family_recent
  on coach_feedback (club_id, status, updated_at desc)
  where status = 'shared';
