-- A guardian can notify the coach before a recurring day has a practice roll.
-- Keep the notice independent of final attendance, then attach it when the roll opens.
alter table absence_notices alter column practice_id drop not null;
alter table absence_notices add column series_id integer references practice_series(id) on delete cascade;
alter table absence_notices add column occurrence_date date;
alter table absence_notices add constraint absence_notice_target_check
  check (practice_id is not null or (series_id is not null and occurrence_date is not null));
create unique index absence_notices_series_occurrence_swimmer_idx
  on absence_notices (series_id, occurrence_date, swimmer_id)
  where series_id is not null;
