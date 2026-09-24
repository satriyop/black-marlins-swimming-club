-- Kid "saya hadir" is a signal. It does not write practice_attendance.
create table swimmer_checkins (
  club_id integer not null references clubs (id) on delete cascade,
  swimmer_id integer not null references swimmers (id) on delete cascade,
  series_id integer not null references practice_series (id) on delete cascade,
  session_date date not null,
  checked_in_at timestamptz not null default now(),
  primary key (swimmer_id, series_id, session_date)
);

create index swimmer_checkins_club_date_idx on swimmer_checkins (club_id, session_date);
