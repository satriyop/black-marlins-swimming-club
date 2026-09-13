create table if not exists user_club_prefs (
  user_id text primary key references "user"(id) on delete cascade,
  task_view text check (task_view in ('club', 'family', 'self')),
  welcome_dismissed_at timestamptz,
  grants_acked_at timestamptz,
  created_at timestamptz not null default now()
);
