alter table practice_series add column if not exists seed_key text;

create unique index if not exists practice_series_club_seed_key_idx
  on practice_series (club_id, seed_key)
  where seed_key is not null;
