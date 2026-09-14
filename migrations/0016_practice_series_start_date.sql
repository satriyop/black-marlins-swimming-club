alter table practice_series add column if not exists start_date date;

update practice_series s
set start_date = coalesce(
  (
    select min(coalesce(p.occurrence_date, p.session_date))
    from practices p
    where p.series_id = s.id
  ),
  s.created_at::date
)
where s.start_date is null;

update practice_series set active = false where until_date is not null;

alter table practice_series alter column start_date set not null;
