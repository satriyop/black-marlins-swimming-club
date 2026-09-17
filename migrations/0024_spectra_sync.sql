alter table meets
  add column spectra_event_code text,
  add column spectra_synced_at timestamptz,
  add column spectra_snapshot jsonb;

create unique index meets_spectra_event_code_key
  on meets (club_id, spectra_event_code)
  where spectra_event_code is not null;

alter table swimmers
  add column spectra_athlete_id text,
  add column spectra_synced_at timestamptz,
  add column spectra_snapshot jsonb;

create unique index swimmers_spectra_athlete_id_key
  on swimmers (club_id, spectra_athlete_id)
  where spectra_athlete_id is not null;

alter table results
  add column spectra_result_ref text;

create unique index results_spectra_result_ref_key
  on results (club_id, spectra_result_ref)
  where spectra_result_ref is not null;

create table sync_conflicts (
  id serial primary key,
  club_id integer not null references clubs (id),
  entity_type text not null check (entity_type in ('swimmer', 'meet')),
  entity_id integer not null,
  field_name text not null,
  local_value text,
  incoming_value text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution in ('kept_local', 'used_incoming')),
  resolved_by text
);

create index sync_conflicts_open_idx
  on sync_conflicts (club_id, entity_type, entity_id)
  where resolved_at is null;
