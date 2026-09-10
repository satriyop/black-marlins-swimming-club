-- Black Marlins Swimming Club schema
create table if not exists clubs (
  id serial primary key,
  user_id text not null unique,
  name text not null,
  short_name text not null,
  city text not null,
  province text not null,
  country text not null default 'Indonesia',
  coach_name text not null,
  venue text,
  motto text,
  created_at timestamptz not null default now()
);

create table if not exists swimmers (
  id serial primary key,
  user_id text not null,
  full_name text not null,
  nickname text,
  date_of_birth date not null,
  gender text not null check (gender in ('putra', 'putri')),
  nationality text not null default 'Indonesia',
  city text,
  status text not null default 'aktif' check (status in ('aktif', 'cuti', 'alumni')),
  join_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists swimmers_user_id_idx on swimmers (user_id);

create table if not exists practices (
  id serial primary key,
  user_id text not null,
  session_date date not null,
  start_time text,
  duration_min integer,
  location text,
  kind text not null,
  title text not null,
  focus text,
  total_meters integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists practices_user_date_idx on practices (user_id, session_date desc);

create table if not exists practice_sets (
  id serial primary key,
  user_id text not null,
  practice_id integer not null references practices(id) on delete cascade,
  sort_order integer not null default 0,
  block text,
  reps integer not null default 1,
  distance_m integer not null,
  stroke text not null,
  interval_sec integer,
  description text
);
create index if not exists practice_sets_practice_idx on practice_sets (practice_id, sort_order);

create table if not exists practice_attendance (
  id serial primary key,
  user_id text not null,
  practice_id integer not null references practices(id) on delete cascade,
  swimmer_id integer not null references swimmers(id) on delete cascade,
  status text not null default 'hadir' check (status in ('hadir', 'izin', 'sakit', 'alfa')),
  meters_completed integer,
  notes text,
  unique (practice_id, swimmer_id)
);

create table if not exists meets (
  id serial primary key,
  user_id text not null,
  name text not null,
  level text not null,
  course text not null check (course in ('25', '50')),
  venue text,
  city text,
  start_date date not null,
  end_date date,
  organizer text,
  status text not null default 'rencana' check (status in ('rencana', 'berlangsung', 'selesai', 'batal')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists meets_user_date_idx on meets (user_id, start_date desc);

create table if not exists meet_entries (
  id serial primary key,
  user_id text not null,
  meet_id integer not null references meets(id) on delete cascade,
  swimmer_id integer not null references swimmers(id) on delete cascade,
  stroke text not null,
  distance_m integer not null,
  age_group text,
  seed_time_ms integer,
  status text not null default 'terdaftar' check (status in ('terdaftar', 'start', 'selesai', 'dns', 'dq', 'dnf')),
  lane integer,
  heat text
);
create index if not exists meet_entries_meet_idx on meet_entries (meet_id);

create table if not exists results (
  id serial primary key,
  user_id text not null,
  swimmer_id integer not null references swimmers(id) on delete cascade,
  meet_id integer references meets(id) on delete set null,
  result_date date not null,
  stroke text not null,
  distance_m integer not null,
  course text not null check (course in ('25', '50')),
  time_ms integer,
  place integer,
  round text,
  status text not null default 'selesai' check (status in ('selesai', 'dns', 'dq', 'dnf')),
  is_pb boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists results_user_swimmer_idx on results (user_id, swimmer_id, result_date desc);

create table if not exists activities (
  id serial primary key,
  user_id text not null,
  title text not null,
  kind text not null,
  activity_date date not null,
  start_time text,
  end_time text,
  location text,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists activities_user_date_idx on activities (user_id, activity_date desc);
