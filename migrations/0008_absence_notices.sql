-- Guardian absence notices are independent of practice_attendance.
-- Existing izin/sakit rows stay as legacy final attendance; do not invent a notice from them.
create table if not exists absence_notices (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  practice_id integer not null references practices(id) on delete cascade,
  swimmer_id integer not null references swimmers(id) on delete cascade,
  kind text not null check (kind in ('izin', 'sakit')),
  reason text,
  status text not null default 'active' check (status in ('active', 'withdrawn')),
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by text references "user"(id),
  revision integer not null default 1,
  unique (practice_id, swimmer_id)
);

create table if not exists attendance_corrections (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  practice_id integer not null references practices(id) on delete cascade,
  swimmer_id integer not null references swimmers(id) on delete cascade,
  attendance_id integer not null references practice_attendance(id) on delete cascade,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'rejected')),
  requested_by text not null references "user"(id),
  requested_at timestamptz not null default now(),
  resolved_by text references "user"(id),
  resolved_at timestamptz,
  resolution text
);
create unique index if not exists attendance_corrections_pending_idx
  on attendance_corrections (attendance_id) where status = 'pending';

create table if not exists attendance_events (
  id serial primary key,
  club_id integer not null references clubs(id) on delete cascade,
  attendance_id integer not null references practice_attendance(id) on delete cascade,
  actor_id text not null,
  created_at timestamptz not null default now(),
  from_status text,
  to_status text,
  from_meters integer,
  to_meters integer
);
