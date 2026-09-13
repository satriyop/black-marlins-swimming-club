alter table practices add column if not exists status text not null default 'scheduled';
alter table practices drop constraint if exists practices_status_check;
alter table practices add constraint practices_status_check
  check (status in ('scheduled', 'in_progress', 'completed', 'cancelled'));
alter table practices add column if not exists cancel_reason text;
alter table practices add column if not exists completed_at timestamptz;
alter table practices add column if not exists completed_by text;
alter table practices add column if not exists reopen_reason text;
alter table practices add column if not exists original_session_date date;
alter table practices add column if not exists original_start_time text;
alter table practices add column if not exists original_location text;
alter table practices add column if not exists revision integer not null default 1;
alter table practices add column if not exists incomplete_ack boolean not null default false;

alter table practice_attendance add column if not exists on_roll boolean not null default true;
